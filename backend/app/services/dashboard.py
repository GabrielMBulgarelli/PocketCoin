from calendar import monthrange
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AccountKind,
    Category,
    FinancialAccount,
    PlannedPayment,
    PlannedPaymentRecurrence,
    PlannedPaymentStatus,
    Transaction,
    TransactionKind,
    TransactionSource,
    planned_payment_tags,
    transaction_tags,
)
from app.services.planned_payments import advance_recurrence_date
from app.services.reference_data import DomainValidationError


def _validate_dates(start_date: date, end_date: date) -> None:
    if start_date > end_date:
        raise DomainValidationError("Start date must not be after end date.", "start_date")


def _transactions(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> list[Transaction]:
    _validate_dates(start_date, end_date)
    statement = select(Transaction).where(
        Transaction.transaction_date.between(start_date, end_date)
    )
    if financial_account_id is not None:
        statement = statement.where(Transaction.financial_account_id == financial_account_id)
    elif without_account:
        statement = statement.where(Transaction.financial_account_id.is_(None))
    if category_id is not None:
        statement = statement.where(Transaction.category_id == category_id)
    if tag_id is not None:
        statement = statement.join(transaction_tags).where(transaction_tags.c.tag_id == tag_id)
    return list(session.scalars(statement))


ActivityKind = Literal["income", "expenses", "transfers"]


def recent_activity(
    session: Session,
    start_date: date,
    end_date: date,
    activity: ActivityKind,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> list[dict[str, object]]:
    if activity != "transfers":
        kind = TransactionKind.INCOME if activity == "income" else TransactionKind.EXPENSE
        rows = _transactions(
            session,
            start_date,
            end_date,
            financial_account_id,
            category_id,
            tag_id,
            without_account,
        )
        matching = sorted(
            (row for row in rows if row.kind == kind),
            key=lambda row: (row.transaction_date, row.id),
            reverse=True,
        )[:8]
        return [
            {
                "id": row.id,
                "transaction_date": row.transaction_date,
                "kind": activity.removesuffix("s"),
                "amount_minor": row.amount_minor,
                "description": row.description,
                "category_id": row.category_id,
                "financial_account_id": row.financial_account_id,
                "transfer_group_id": None,
                "from_account_id": None,
                "to_account_id": None,
            }
            for row in matching
        ]

    if category_id is not None or tag_id is not None:
        return []
    transfers = [
        row
        for row in _transactions(session, start_date, end_date)
        if row.kind in {TransactionKind.TRANSFER_IN, TransactionKind.TRANSFER_OUT}
    ]
    groups: dict[str, list[Transaction]] = {}
    for row in transfers:
        if row.transfer_group_id is not None:
            groups.setdefault(row.transfer_group_id, []).append(row)

    logical: list[dict[str, object]] = []
    for group_id, rows in groups.items():
        if financial_account_id is not None and not any(
            row.financial_account_id == financial_account_id for row in rows
        ):
            continue
        if without_account and not any(row.financial_account_id is None for row in rows):
            continue
        outgoing = next((row for row in rows if row.kind == TransactionKind.TRANSFER_OUT), None)
        incoming = next((row for row in rows if row.kind == TransactionKind.TRANSFER_IN), None)
        representative = outgoing or incoming
        if representative is None:
            continue
        logical.append(
            {
                "id": representative.id,
                "transaction_date": representative.transaction_date,
                "kind": "transfer",
                "amount_minor": representative.amount_minor,
                "description": representative.description,
                "category_id": None,
                "financial_account_id": None,
                "transfer_group_id": group_id,
                "from_account_id": outgoing.financial_account_id if outgoing else None,
                "to_account_id": incoming.financial_account_id if incoming else None,
            }
        )
    return sorted(
        logical,
        key=lambda item: (item["transaction_date"], item["id"]),
        reverse=True,
    )[:8]


def _signed(account: FinancialAccount, transaction: Transaction) -> int:
    assets = {AccountKind.CASH, AccountKind.CHECKING, AccountKind.SAVINGS}
    positive = (
        {TransactionKind.INCOME, TransactionKind.TRANSFER_IN}
        if account.kind in assets
        else {TransactionKind.EXPENSE, TransactionKind.TRANSFER_OUT}
    )
    return transaction.amount_minor if transaction.kind in positive else -transaction.amount_minor


def _liability_debt_at(session: Session, account: FinancialAccount, end_date: date) -> int:
    if account.opening_balance_date > end_date:
        return 0
    debt = account.opening_balance_minor
    statement = select(Transaction).where(
        Transaction.financial_account_id == account.id,
        Transaction.transaction_date.between(account.opening_balance_date, end_date),
    )
    for transaction in session.scalars(statement):
        debt += _signed(account, transaction)
    return max(debt, 0)


def credit_utilization(
    session: Session,
    end_date: date,
    financial_account_id: int | None = None,
    without_account: bool = False,
) -> dict[str, bool | int | float | None]:
    statement = select(FinancialAccount).where(
        FinancialAccount.kind.in_(
            [AccountKind.CREDIT_CARD, AccountKind.OVERDRAFT, AccountKind.LOAN]
        ),
        FinancialAccount.opening_balance_date <= end_date,
    )
    if financial_account_id is not None:
        statement = statement.where(FinancialAccount.id == financial_account_id)
    liabilities = (
        [] if without_account else list(session.scalars(statement.order_by(FinancialAccount.id)))
    )
    credit_accounts = [
        account
        for account in liabilities
        if account.kind in {AccountKind.CREDIT_CARD, AccountKind.OVERDRAFT}
    ]
    limited_accounts = [
        account for account in credit_accounts if (account.credit_limit_minor or 0) > 0
    ]
    total_limit = sum(account.credit_limit_minor or 0 for account in limited_accounts)
    outstanding = sum(
        _liability_debt_at(session, account, end_date) for account in limited_accounts
    )
    return {
        "has_liability_accounts": bool(liabilities),
        "has_credit_accounts": bool(credit_accounts),
        "outstanding_debt_minor": outstanding,
        "total_credit_limit_minor": total_limit,
        "utilization_percentage": round(outstanding / total_limit * 100, 1)
        if total_limit
        else None,
    }


def credit_account_utilization(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    without_account: bool = False,
) -> list[dict[str, object]]:
    _validate_dates(start_date, end_date)
    statement = select(FinancialAccount).where(
        FinancialAccount.kind.in_([AccountKind.CREDIT_CARD, AccountKind.OVERDRAFT]),
        FinancialAccount.opening_balance_date <= end_date,
    )
    if financial_account_id is not None:
        statement = statement.where(FinancialAccount.id == financial_account_id)
    if without_account:
        return []
    rows: list[dict[str, object]] = []
    for account in session.scalars(statement.order_by(FinancialAccount.id)):
        limit = account.credit_limit_minor or 0
        current_debt = _liability_debt_at(session, account, end_date)
        if limit > 0:
            first_day = max(start_date, account.opening_balance_date)
            daily = [
                _liability_debt_at(session, account, first_day + timedelta(days=offset))
                / limit
                * 100
                for offset in range((end_date - first_day).days + 1)
            ]
            current = round(current_debt / limit * 100, 1)
            average = round(sum(daily) / len(daily), 1)
            maximum = round(max(daily), 1)
        else:
            current = average = maximum = None
        rows.append(
            {
                "account_id": account.id,
                "account_name": account.name,
                "credit_limit_minor": account.credit_limit_minor,
                "current_debt_minor": current_debt,
                "current_percentage": current,
                "average_percentage": average,
                "maximum_percentage": maximum,
            }
        )
    return rows


def recurring_debts(
    session: Session,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    without_account: bool = False,
    tag_id: int | None = None,
) -> dict[str, object]:
    statement = select(PlannedPayment).where(
        PlannedPayment.status == PlannedPaymentStatus.PENDING,
        PlannedPayment.is_debt_payment.is_(True),
        PlannedPayment.recurrence.in_(
            [
                PlannedPaymentRecurrence.WEEKLY,
                PlannedPaymentRecurrence.MONTHLY,
                PlannedPaymentRecurrence.YEARLY,
            ]
        ),
    )
    if financial_account_id is not None:
        statement = statement.where(PlannedPayment.financial_account_id == financial_account_id)
    elif without_account:
        statement = statement.where(PlannedPayment.financial_account_id.is_(None))
    if category_id is not None:
        statement = statement.where(PlannedPayment.category_id == category_id)
    if tag_id is not None:
        statement = statement.join(planned_payment_tags).where(
            planned_payment_tags.c.tag_id == tag_id
        )
    items: list[dict[str, object]] = []
    exact_total = Decimal(0)
    for payment in session.scalars(statement.order_by(PlannedPayment.id)):
        if payment.recurrence == PlannedPaymentRecurrence.WEEKLY:
            monthly = Decimal(payment.amount_minor) * Decimal(52) / Decimal(12)
        elif payment.recurrence == PlannedPaymentRecurrence.YEARLY:
            monthly = Decimal(payment.amount_minor) / Decimal(12)
        else:
            monthly = Decimal(payment.amount_minor)
        exact_total += monthly
        items.append(
            {
                "payment_id": payment.id,
                "title": payment.title,
                "recurrence": payment.recurrence,
                "amount_minor": payment.amount_minor,
                "monthly_amount_minor": int(monthly.quantize(Decimal("1"), rounding=ROUND_HALF_UP)),
            }
        )
    return {
        "items": items,
        "monthly_total_minor": int(exact_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)),
    }


def debt_to_income(
    session: Session,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> dict[str, int | float | None]:
    recurring_debt = int(
        recurring_debts(
            session,
            financial_account_id,
            category_id,
            without_account,
            tag_id,
        )[
            "monthly_total_minor"
        ]
    )
    month_start = end_date.replace(day=1)
    month_end = end_date.replace(day=monthrange(end_date.year, end_date.month)[1])
    transactions = _transactions(
        session,
        month_start,
        month_end,
        financial_account_id,
        category_id,
        tag_id,
        without_account,
    )
    gross_income = sum(
        transaction.amount_minor
        for transaction in transactions
        if transaction.kind == TransactionKind.INCOME
    )
    active_series = select(PlannedPayment.id).where(
        PlannedPayment.status == PlannedPaymentStatus.PENDING,
        PlannedPayment.is_debt_payment.is_(True),
        PlannedPayment.recurrence.in_(
            [
                PlannedPaymentRecurrence.WEEKLY,
                PlannedPaymentRecurrence.MONTHLY,
                PlannedPaymentRecurrence.YEARLY,
            ]
        ),
    )
    if financial_account_id is not None:
        active_series = active_series.where(
            PlannedPayment.financial_account_id == financial_account_id
        )
    elif without_account:
        active_series = active_series.where(PlannedPayment.financial_account_id.is_(None))
    if category_id is not None:
        active_series = active_series.where(PlannedPayment.category_id == category_id)
    if tag_id is not None:
        active_series = active_series.join(planned_payment_tags).where(
            planned_payment_tags.c.tag_id == tag_id
        )
    active_series_ids = set(session.scalars(active_series))
    additional_debt = sum(
        transaction.amount_minor
        for transaction in transactions
        if transaction.kind == TransactionKind.EXPENSE
        and transaction.is_debt_payment
        and transaction.planned_payment_id not in active_series_ids
    )
    monthly_debt = recurring_debt + additional_debt
    return {
        "recurring_debt_minor": recurring_debt,
        "additional_debt_minor": additional_debt,
        "monthly_debt_minor": monthly_debt,
        "gross_income_minor": gross_income,
        "ratio_percentage": round(monthly_debt / gross_income * 100, 1) if gross_income else None,
    }


def balance_forecast(
    session: Session,
    forecast_start: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> dict[str, object]:
    lookback_days = 90
    horizon_days = 30
    lookback_start = forecast_start - timedelta(days=lookback_days - 1)
    forecast_end = forecast_start + timedelta(days=horizon_days)

    accounts_statement = select(FinancialAccount).where(
        FinancialAccount.opening_balance_date <= forecast_start
    )
    if financial_account_id is not None:
        accounts_statement = accounts_statement.where(FinancialAccount.id == financial_account_id)
    accounts = [] if without_account else list(session.scalars(accounts_statement))
    account_map = {account.id: account for account in accounts}
    starting_balance = sum(account.opening_balance_minor for account in accounts)
    balance_statement = select(Transaction).where(Transaction.transaction_date <= forecast_start)
    if financial_account_id is not None:
        balance_statement = balance_statement.where(
            Transaction.financial_account_id == financial_account_id
        )
    elif without_account:
        balance_statement = balance_statement.where(Transaction.financial_account_id.is_(None))
    for transaction in session.scalars(balance_statement):
        account = account_map.get(transaction.financial_account_id)
        if account is not None:
            starting_balance += _signed(account, transaction)

    history = _transactions(
        session,
        lookback_start,
        forecast_start,
        financial_account_id,
        category_id,
        tag_id,
        without_account,
    )
    historical_expense = sum(
        item.amount_minor
        for item in history
        if item.kind == TransactionKind.EXPENSE and item.source != TransactionSource.PLANNED_PAYMENT
    )
    average_daily = int(
        (Decimal(historical_expense) / Decimal(lookback_days)).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )

    payment_statement = select(PlannedPayment).where(
        PlannedPayment.status == PlannedPaymentStatus.PENDING
    )
    if financial_account_id is not None:
        payment_statement = payment_statement.where(
            PlannedPayment.financial_account_id == financial_account_id
        )
    elif without_account:
        payment_statement = payment_statement.where(PlannedPayment.financial_account_id.is_(None))
    if category_id is not None:
        payment_statement = payment_statement.where(PlannedPayment.category_id == category_id)
    planned_income = 0
    planned_expense = 0
    horizon_start = forecast_start + timedelta(days=1)
    for payment in session.scalars(payment_statement.order_by(PlannedPayment.id)):
        occurrence = payment.due_date
        if payment.recurrence == PlannedPaymentRecurrence.NONE:
            occurrences = [occurrence] if horizon_start <= occurrence <= forecast_end else []
        else:
            while occurrence < horizon_start:
                occurrence = advance_recurrence_date(occurrence, payment.recurrence)
            occurrences = []
            while occurrence <= forecast_end:
                occurrences.append(occurrence)
                occurrence = advance_recurrence_date(occurrence, payment.recurrence)
        total = payment.amount_minor * len(occurrences)
        if payment.direction.value == "income":
            planned_income += total
        else:
            planned_expense += total

    expected_unplanned = average_daily * horizon_days
    return {
        "forecast_start": forecast_start,
        "forecast_end": forecast_end,
        "lookback_start": lookback_start,
        "lookback_end": forecast_start,
        "lookback_days": lookback_days,
        "horizon_days": horizon_days,
        "starting_balance_minor": starting_balance,
        "planned_income_minor": planned_income,
        "planned_expense_minor": planned_expense,
        "historical_expense_minor": historical_expense,
        "historical_transaction_count": len(history),
        "average_daily_expense_minor": average_daily,
        "expected_unplanned_spending_minor": expected_unplanned,
        "ending_balance_minor": (
            starting_balance + planned_income - planned_expense - expected_unplanned
        ),
        "assumptions": [
            "Uses the 90 complete calendar days ending on the forecast start.",
            "Projects pending planned payments and average unplanned expenses for 30 days.",
            "Excludes transfers and planned-payment transactions from spending history.",
        ],
    }


def dashboard_summary(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> dict[str, int | float | None]:
    transactions = _transactions(
        session, start_date, end_date, financial_account_id, category_id, tag_id, without_account
    )
    income = sum(item.amount_minor for item in transactions if item.kind == TransactionKind.INCOME)
    expense = sum(
        item.amount_minor for item in transactions if item.kind == TransactionKind.EXPENSE
    )
    account_statement = select(FinancialAccount).where(
        FinancialAccount.opening_balance_date <= end_date
    )
    if financial_account_id is not None:
        account_statement = account_statement.where(FinancialAccount.id == financial_account_id)
    accounts = [] if without_account else list(session.scalars(account_statement))
    balance = sum(account.opening_balance_minor for account in accounts)
    account_map = {account.id: account for account in accounts}
    balance_statement = select(Transaction).where(Transaction.transaction_date <= end_date)
    if financial_account_id is not None:
        balance_statement = balance_statement.where(
            Transaction.financial_account_id == financial_account_id
        )
    elif without_account:
        balance_statement = balance_statement.where(Transaction.financial_account_id.is_(None))
    for transaction in session.scalars(balance_statement):
        account = account_map.get(transaction.financial_account_id)
        if account is not None:
            balance += _signed(account, transaction)
    return {
        "balance_minor": balance,
        "income_minor": income,
        "expense_minor": expense,
        "net_minor": income - expense,
        "savings_rate": round((income - expense) / income * 100, 1) if income else None,
    }


def cash_flow(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> list[dict[str, str | int]]:
    totals: dict[date, list[int]] = {}
    for item in _transactions(
        session, start_date, end_date, financial_account_id, category_id, tag_id, without_account
    ):
        day = totals.setdefault(item.transaction_date, [0, 0])
        if item.kind == TransactionKind.INCOME:
            day[0] += item.amount_minor
        elif item.kind == TransactionKind.EXPENSE:
            day[1] += item.amount_minor
    days = (end_date - start_date).days + 1
    return [
        {
            "date": (start_date + timedelta(days=index)).isoformat(),
            "income_minor": totals.get(start_date + timedelta(days=index), [0, 0])[0],
            "expense_minor": totals.get(start_date + timedelta(days=index), [0, 0])[1],
        }
        for index in range(days)
    ]


def _rounded_average(total: int, divisor: int) -> int:
    if divisor == 0:
        return 0
    return int((Decimal(total) / Decimal(divisor)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def cash_flow_table(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> dict[str, object]:
    _validate_dates(start_date, end_date)
    period_days = (end_date - start_date).days + 1
    previous_end = start_date - timedelta(days=1)
    previous_start = previous_end - timedelta(days=period_days - 1)

    def totals(period_start: date, period_end: date) -> tuple[list[Transaction], list[Transaction]]:
        rows = _transactions(
            session,
            period_start,
            period_end,
            financial_account_id,
            category_id,
            tag_id,
            without_account,
        )
        return (
            [row for row in rows if row.kind == TransactionKind.INCOME],
            [row for row in rows if row.kind == TransactionKind.EXPENSE],
        )

    income_rows, expense_rows = totals(start_date, end_date)
    previous_income_rows, previous_expense_rows = totals(previous_start, previous_end)
    income_total = sum(row.amount_minor for row in income_rows)
    expense_total = sum(row.amount_minor for row in expense_rows)
    previous_income = sum(row.amount_minor for row in previous_income_rows)
    previous_expense = sum(row.amount_minor for row in previous_expense_rows)
    previous_net = previous_income - previous_expense
    net = income_total - expense_total

    def statistic(rows: list[Transaction], total: int) -> dict[str, int]:
        return {
            "count": len(rows),
            "total_minor": total,
            "daily_average_minor": _rounded_average(total, period_days),
            "average_transaction_minor": _rounded_average(total, len(rows)),
        }

    return {
        "period_days": period_days,
        "income": statistic(income_rows, income_total),
        "expense": statistic(expense_rows, expense_total),
        "net_minor": net,
        "previous_income_minor": previous_income,
        "previous_expense_minor": previous_expense,
        "previous_net_minor": previous_net,
        "net_change_minor": net - previous_net,
    }


def category_spending(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> list[dict[str, str | int]]:
    names = {item.id: item.name for item in session.scalars(select(Category))}
    totals: dict[int, int] = {}
    for item in _transactions(
        session, start_date, end_date, financial_account_id, category_id, tag_id, without_account
    ):
        if item.kind == TransactionKind.EXPENSE and item.category_id is not None:
            totals[item.category_id] = totals.get(item.category_id, 0) + item.amount_minor
    return [
        {"name": names.get(key, "Uncategorized"), "amount_minor": amount}
        for key, amount in sorted(totals.items(), key=lambda pair: pair[1], reverse=True)
    ]


def expense_structure(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> list[dict[str, str | int]]:
    rows = category_spending(
        session, start_date, end_date, financial_account_id, category_id, tag_id, without_account
    )
    if len(rows) <= 5:
        return rows
    return [
        *rows[:5],
        {"name": "Other", "amount_minor": sum(int(item["amount_minor"]) for item in rows[5:])},
    ]


def period_comparison(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    metric: str = "expenses",
    without_account: bool = False,
) -> list[dict[str, str | int]]:
    _validate_dates(start_date, end_date)
    if metric not in {"expenses", "income", "cash_flow"}:
        raise DomainValidationError("Invalid comparison metric.", "metric")
    count = (end_date - start_date).days + 1
    previous_start = start_date - timedelta(days=count)
    try:
        year_start = start_date.replace(year=start_date.year - 1)
    except ValueError:
        year_start = start_date.replace(year=start_date.year - 1, day=28)
    ranges = [
        (start_date, end_date),
        (previous_start, start_date - timedelta(days=1)),
        (year_start, year_start + timedelta(days=count - 1)),
    ]
    values: list[dict[date, int]] = []
    for period_start, period_end in ranges:
        totals: dict[date, int] = {}
        for item in _transactions(
            session,
            period_start,
            period_end,
            financial_account_id,
            category_id,
            tag_id,
            without_account,
        ):
            value = 0
            if metric == "expenses" and item.kind == TransactionKind.EXPENSE:
                value = item.amount_minor
            elif metric == "income" and item.kind == TransactionKind.INCOME:
                value = item.amount_minor
            elif metric == "cash_flow":
                if item.kind == TransactionKind.INCOME:
                    value = item.amount_minor
                elif item.kind == TransactionKind.EXPENSE:
                    value = -item.amount_minor
            totals[item.transaction_date] = totals.get(item.transaction_date, 0) + value
        values.append(totals)
    return [
        {
            "label": (start_date + timedelta(days=index)).isoformat(),
            "current_minor": values[0].get(start_date + timedelta(days=index), 0),
            "previous_minor": values[1].get(previous_start + timedelta(days=index), 0),
            "prior_year_minor": values[2].get(year_start + timedelta(days=index), 0),
        }
        for index in range(count)
    ]
