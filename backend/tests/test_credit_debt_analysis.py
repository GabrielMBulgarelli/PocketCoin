from datetime import date

from app.models import (
    AccountKind,
    Category,
    CategoryDirection,
    FinancialAccount,
    PlannedPayment,
    PlannedPaymentRecurrence,
    PlannedPaymentStatus,
    Tag,
    TransactionKind,
)
from app.services.dashboard import (
    credit_account_utilization,
    credit_utilization,
    debt_to_income,
    recurring_debts,
)
from app.services.transactions import TransactionInput, create_transaction


def add_account(session, name, kind, opening, limit=None, opened=date(2026, 7, 1)):
    account = FinancialAccount(
        name=name,
        kind=kind,
        opening_balance_minor=opening,
        opening_balance_date=opened,
        credit_limit_minor=limit,
    )
    session.add(account)
    session.flush()
    return account


def add_payment(
    session,
    title,
    amount,
    recurrence,
    *,
    debt=True,
    status=PlannedPaymentStatus.PENDING,
    account_id=None,
    category_id=None,
):
    payment = PlannedPayment(
        title=title,
        direction=CategoryDirection.EXPENSE,
        amount_minor=amount,
        due_date=date(2026, 7, 15),
        recurrence=recurrence,
        status=status,
        is_debt_payment=debt,
        financial_account_id=account_id,
        category_id=category_id,
    )
    session.add(payment)
    session.flush()
    return payment


def test_credit_utilization_signs_clamping_limits_and_loans(session) -> None:
    expense = Category(name="Purchases", direction=CategoryDirection.EXPENSE)
    income = Category(name="Refund", direction=CategoryDirection.INCOME)
    session.add_all([expense, income])
    card = add_account(session, "Card", AccountKind.CREDIT_CARD, 2_000, 10_000)
    overdraft = add_account(session, "Overdraft", AccountKind.OVERDRAFT, 1_000, 5_000)
    add_account(session, "No limit", AccountKind.CREDIT_CARD, 900)
    add_account(session, "Loan", AccountKind.LOAN, 50_000)
    create_transaction(
        session,
        TransactionInput(
            card.id, expense.id, TransactionKind.EXPENSE, 1_000, date(2026, 7, 2), "Charge"
        ),
    )
    create_transaction(
        session,
        TransactionInput(
            card.id, income.id, TransactionKind.INCOME, 5_000, date(2026, 7, 3), "Credit"
        ),
    )
    create_transaction(
        session,
        TransactionInput(
            overdraft.id, expense.id, TransactionKind.EXPENSE, 500, date(2026, 7, 2), "Charge"
        ),
    )

    result = credit_utilization(session, date(2026, 7, 31))

    assert result == {
        "has_liability_accounts": True,
        "has_credit_accounts": True,
        "outstanding_debt_minor": 1_500,
        "total_credit_limit_minor": 15_000,
        "utilization_percentage": 10.0,
    }


def test_per_account_uses_end_of_day_range_and_stable_order(session) -> None:
    expense = Category(name="Card purchases", direction=CategoryDirection.EXPENSE)
    session.add(expense)
    first = add_account(session, "First", AccountKind.CREDIT_CARD, 1_000, 10_000)
    later = add_account(session, "Later", AccountKind.OVERDRAFT, 2_000, 10_000, date(2026, 7, 2))
    no_limit = add_account(session, "No limit", AccountKind.CREDIT_CARD, 500)
    create_transaction(
        session,
        TransactionInput(
            first.id, expense.id, TransactionKind.EXPENSE, 1_000, date(2026, 7, 2), "Charge"
        ),
    )
    create_transaction(
        session,
        TransactionInput(
            later.id, expense.id, TransactionKind.EXPENSE, 1_000, date(2026, 7, 3), "Charge"
        ),
    )

    rows = credit_account_utilization(session, date(2026, 7, 1), date(2026, 7, 3))

    assert [row["account_id"] for row in rows] == [first.id, later.id, no_limit.id]
    assert rows[0]["current_percentage"] == 20.0
    assert rows[0]["average_percentage"] == 16.7
    assert rows[0]["maximum_percentage"] == 20.0
    assert rows[1]["average_percentage"] == 25.0
    assert rows[1]["maximum_percentage"] == 30.0
    assert rows[2]["current_percentage"] is None


def test_recurring_debts_normalize_filter_and_round_half_up(session) -> None:
    expense = Category(name="Debt", direction=CategoryDirection.EXPENSE)
    other = Category(name="Other debt", direction=CategoryDirection.EXPENSE)
    session.add_all([expense, other])
    account = add_account(session, "Checking", AccountKind.CHECKING, 0)
    weekly = add_payment(
        session,
        "Weekly",
        101,
        PlannedPaymentRecurrence.WEEKLY,
        account_id=account.id,
        category_id=expense.id,
    )
    add_payment(
        session,
        "Monthly",
        1_000,
        PlannedPaymentRecurrence.MONTHLY,
        account_id=account.id,
        category_id=expense.id,
    )
    add_payment(
        session,
        "Yearly",
        1_200,
        PlannedPaymentRecurrence.YEARLY,
        account_id=account.id,
        category_id=expense.id,
    )
    add_payment(
        session,
        "Once",
        9_999,
        PlannedPaymentRecurrence.NONE,
        account_id=account.id,
        category_id=expense.id,
    )
    add_payment(
        session, "Paid", 9_999, PlannedPaymentRecurrence.MONTHLY, status=PlannedPaymentStatus.PAID
    )
    add_payment(session, "Not debt", 9_999, PlannedPaymentRecurrence.MONTHLY, debt=False)

    result = recurring_debts(session, financial_account_id=account.id, category_id=expense.id)

    assert [row["payment_id"] for row in result["items"]] == [
        weekly.id,
        weekly.id + 1,
        weekly.id + 2,
    ]
    assert [row["monthly_amount_minor"] for row in result["items"]] == [438, 1_000, 100]
    assert result["monthly_total_minor"] == 1_538
    assert recurring_debts(session, category_id=other.id)["items"] == []


def test_dti_uses_end_date_month_and_income_filters(session) -> None:
    checking = add_account(session, "Checking", AccountKind.CHECKING, 0)
    income = Category(name="Salary", direction=CategoryDirection.INCOME)
    debt = Category(name="Debt", direction=CategoryDirection.EXPENSE)
    tag = Tag(name="Main job")
    session.add_all([income, debt, tag])
    session.flush()
    add_payment(
        session,
        "Loan",
        1_000,
        PlannedPaymentRecurrence.MONTHLY,
        account_id=checking.id,
        category_id=debt.id,
    )
    july = create_transaction(
        session,
        TransactionInput(
            checking.id,
            income.id,
            TransactionKind.INCOME,
            4_000,
            date(2026, 7, 2),
            "July",
            tag_ids=[tag.id],
        ),
    )
    create_transaction(
        session,
        TransactionInput(
            checking.id,
            debt.id,
            TransactionKind.EXPENSE,
            500,
            date(2026, 7, 4),
            "One-off debt",
            tag_ids=[tag.id],
            is_debt_payment=True,
        ),
    )
    create_transaction(
        session,
        TransactionInput(
            checking.id, income.id, TransactionKind.INCOME, 8_000, date(2026, 6, 30), "June"
        ),
    )

    result = debt_to_income(session, date(2026, 7, 12), checking.id, None, tag.id)
    assert july.id is not None
    assert result == {
        "recurring_debt_minor": 0,
        "additional_debt_minor": 500,
        "monthly_debt_minor": 500,
        "gross_income_minor": 4_000,
        "ratio_percentage": 12.5,
    }
    assert debt_to_income(session, date(2026, 8, 12), checking.id)["ratio_percentage"] is None


def test_dti_does_not_double_count_materialized_active_series(session) -> None:
    checking = add_account(session, "Checking", AccountKind.CHECKING, 0)
    income = Category(name="Salary", direction=CategoryDirection.INCOME)
    debt = Category(name="Debt", direction=CategoryDirection.EXPENSE)
    session.add_all([income, debt])
    session.flush()
    series = add_payment(
        session,
        "Loan",
        1_000,
        PlannedPaymentRecurrence.MONTHLY,
        account_id=checking.id,
        category_id=debt.id,
    )
    posted = create_transaction(
        session,
        TransactionInput(
            checking.id,
            debt.id,
            TransactionKind.EXPENSE,
            1_000,
            date(2026, 7, 3),
            "Loan",
            is_debt_payment=True,
        ),
    )
    posted.planned_payment_id = series.id
    posted.scheduled_for = date(2026, 7, 3)
    create_transaction(
        session,
        TransactionInput(
            checking.id,
            income.id,
            TransactionKind.INCOME,
            4_000,
            date(2026, 7, 2),
            "Salary",
        ),
    )

    assert debt_to_income(session, date(2026, 7, 12), checking.id) == {
        "recurring_debt_minor": 1_000,
        "additional_debt_minor": 0,
        "monthly_debt_minor": 1_000,
        "gross_income_minor": 4_000,
        "ratio_percentage": 25.0,
    }


def test_no_liability_is_not_applicable(session) -> None:
    add_account(session, "Cash", AccountKind.CASH, 100)
    assert credit_utilization(session, date(2026, 7, 31))["has_liability_accounts"] is False
    assert credit_account_utilization(session, date(2026, 7, 1), date(2026, 7, 31)) == []
