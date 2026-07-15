from datetime import date

from app.models import (
    AccountKind,
    Category,
    CategoryDirection,
    FinancialAccount,
    PlannedPaymentRecurrence,
    Tag,
    TransactionKind,
    TransactionSource,
)
from app.services.dashboard import balance_forecast
from app.services.planned_payments import PlannedPaymentInput, create_planned_payment
from app.services.transactions import (
    TransactionInput,
    TransferInput,
    create_transaction,
    create_transfer,
)


def references(session):
    checking = FinancialAccount(
        name="Checking",
        kind=AccountKind.CHECKING,
        opening_balance_minor=100_000,
        opening_balance_date=date(2026, 1, 1),
    )
    savings = FinancialAccount(
        name="Savings",
        kind=AccountKind.SAVINGS,
        opening_balance_minor=20_000,
        opening_balance_date=date(2026, 1, 1),
    )
    expense = Category(name="Living", direction=CategoryDirection.EXPENSE)
    other_expense = Category(name="Other", direction=CategoryDirection.EXPENSE)
    income = Category(name="Salary", direction=CategoryDirection.INCOME)
    tagged = Tag(name="Essential")
    session.add_all([checking, savings, expense, other_expense, income, tagged])
    session.flush()
    return checking, savings, expense, other_expense, income, tagged


def add_transaction(
    session, account, category, kind, amount, day, source=TransactionSource.MANUAL, tag_ids=None
):
    return create_transaction(
        session,
        TransactionInput(
            account.id,
            category.id,
            kind,
            amount,
            day,
            "Forecast fixture",
            tag_ids=tag_ids,
            source=source,
        ),
    )


def add_payment(
    session,
    account,
    category,
    direction,
    amount,
    due_date,
    recurrence=PlannedPaymentRecurrence.NONE,
):
    return create_planned_payment(
        session,
        PlannedPaymentInput(
            account.id, category.id, "Scheduled", direction, amount, due_date, recurrence
        ),
    )


def test_forecast_formula_rounding_boundaries_and_exclusions(session) -> None:
    checking, savings, expense, _, income, _ = references(session)
    # The 90-day window is 2026-04-03 through 2026-07-01, inclusive.
    add_transaction(session, checking, expense, TransactionKind.EXPENSE, 90, date(2026, 4, 2))
    add_transaction(session, checking, expense, TransactionKind.EXPENSE, 135, date(2026, 4, 3))
    add_transaction(session, checking, expense, TransactionKind.EXPENSE, 90, date(2026, 7, 1))
    add_transaction(session, checking, expense, TransactionKind.EXPENSE, 999, date(2026, 7, 2))
    add_transaction(
        session,
        checking,
        expense,
        TransactionKind.EXPENSE,
        500,
        date(2026, 6, 1),
        TransactionSource.PLANNED_PAYMENT,
    )
    create_transfer(
        session, TransferInput(checking.id, savings.id, 1_000, date(2026, 6, 2), "Transfer")
    )
    add_payment(session, checking, income, CategoryDirection.INCOME, 8_000, date(2026, 7, 2))
    add_payment(session, checking, expense, CategoryDirection.EXPENSE, 3_000, date(2026, 7, 31))
    add_payment(session, checking, expense, CategoryDirection.EXPENSE, 7_000, date(2026, 8, 1))

    result = balance_forecast(session, date(2026, 7, 1))

    assert result["lookback_start"] == date(2026, 4, 3)
    assert result["forecast_end"] == date(2026, 7, 31)
    assert result["historical_expense_minor"] == 225
    assert result["average_daily_expense_minor"] == 3  # 2.5 rounds half up.
    assert result["expected_unplanned_spending_minor"] == 90
    assert result["planned_income_minor"] == 8_000
    assert result["planned_expense_minor"] == 3_000
    assert result["ending_balance_minor"] == result["starting_balance_minor"] + 8_000 - 3_000 - 90
    assert result["historical_transaction_count"] == 5


def test_forecast_expands_weekly_monthly_and_yearly_occurrences(session) -> None:
    checking, _, expense, _, income, _ = references(session)
    add_payment(
        session,
        checking,
        expense,
        CategoryDirection.EXPENSE,
        100,
        date(2026, 6, 29),
        PlannedPaymentRecurrence.WEEKLY,
    )
    add_payment(
        session,
        checking,
        expense,
        CategoryDirection.EXPENSE,
        200,
        date(2026, 1, 31),
        PlannedPaymentRecurrence.MONTHLY,
    )
    add_payment(
        session,
        checking,
        income,
        CategoryDirection.INCOME,
        300,
        date(2024, 2, 29),
        PlannedPaymentRecurrence.YEARLY,
    )

    result = balance_forecast(session, date(2025, 2, 1))
    assert result["planned_income_minor"] == 300  # Leap-day schedule clamps to Feb 28.

    result = balance_forecast(session, date(2026, 7, 1))
    assert result["planned_expense_minor"] == 600  # Four weekly + one July 28 monthly.


def test_forecast_filters_history_and_plans_deterministically(session) -> None:
    checking, savings, expense, other_expense, income, tagged = references(session)
    add_transaction(
        session,
        checking,
        expense,
        TransactionKind.EXPENSE,
        900,
        date(2026, 6, 15),
        tag_ids=[tagged.id],
    )
    add_transaction(
        session, checking, other_expense, TransactionKind.EXPENSE, 450, date(2026, 6, 16)
    )
    add_transaction(
        session,
        savings,
        expense,
        TransactionKind.EXPENSE,
        180,
        date(2026, 6, 17),
        tag_ids=[tagged.id],
    )
    add_payment(session, checking, expense, CategoryDirection.EXPENSE, 1_000, date(2026, 7, 10))
    add_payment(
        session, checking, other_expense, CategoryDirection.EXPENSE, 2_000, date(2026, 7, 11)
    )
    add_payment(session, savings, income, CategoryDirection.INCOME, 3_000, date(2026, 7, 12))

    filtered = balance_forecast(session, date(2026, 7, 1), checking.id, expense.id, tagged.id)
    repeated = balance_forecast(session, date(2026, 7, 1), checking.id, expense.id, tagged.id)

    assert filtered == repeated
    assert filtered["historical_expense_minor"] == 900
    assert filtered["historical_transaction_count"] == 1
    assert filtered["planned_expense_minor"] == 1_000
    assert filtered["planned_income_minor"] == 0


def test_forecast_distinguishes_empty_history_from_zero_eligible_spending(session) -> None:
    checking, savings, _, _, income, _ = references(session)
    empty = balance_forecast(session, date(2025, 1, 1))
    assert empty["historical_transaction_count"] == 0
    assert empty["average_daily_expense_minor"] == 0

    add_transaction(session, checking, income, TransactionKind.INCOME, 2_000, date(2026, 6, 1))
    create_transfer(session, TransferInput(checking.id, savings.id, 500, date(2026, 6, 2), "Move"))
    zero_spending = balance_forecast(session, date(2026, 7, 1))
    assert zero_spending["historical_transaction_count"] == 3
    assert zero_spending["historical_expense_minor"] == 0
    assert zero_spending["expected_unplanned_spending_minor"] == 0
