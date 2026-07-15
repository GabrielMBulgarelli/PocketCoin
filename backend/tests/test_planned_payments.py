from datetime import date

import pytest

from app.models import (
    AccountKind,
    Category,
    CategoryDirection,
    FinancialAccount,
    PlannedPaymentRecurrence,
    PlannedPaymentStatus,
    Transaction,
    TransactionSource,
)
from app.services.planned_payments import (
    PlannedPaymentInput,
    create_planned_payment,
    delete_planned_payment,
    list_upcoming_payments,
    mark_planned_payment_paid,
    update_planned_payment,
)
from app.services.reference_data import DomainValidationError, update_financial_account


def references(session):
    account = FinancialAccount(
        name="Checking",
        kind=AccountKind.CHECKING,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    expense = Category(name="Bills", direction=CategoryDirection.EXPENSE)
    income = Category(name="Salary", direction=CategoryDirection.INCOME)
    session.add_all([account, expense, income])
    session.flush()
    return account, expense, income


def payment_input(
    account_id=None,
    category_id=None,
    recurrence=PlannedPaymentRecurrence.NONE,
    due_date=date(2026, 7, 31),
):
    return PlannedPaymentInput(
        account_id,
        category_id,
        "Electricity",
        CategoryDirection.EXPENSE,
        12_500,
        due_date,
        recurrence,
        False,
        "Monthly bill",
    )


def test_crud_validates_references_and_blocks_account_deactivation(session) -> None:
    account, expense, income = references(session)
    payment = create_planned_payment(session, payment_input(account.id, expense.id))
    assert payment.status == PlannedPaymentStatus.PENDING
    with pytest.raises(DomainValidationError, match="direction"):
        create_planned_payment(session, payment_input(account.id, income.id))
    with pytest.raises(DomainValidationError, match="planned payment"):
        update_financial_account(session, account.id, is_active=False)

    update_planned_payment(session, payment.id, status=PlannedPaymentStatus.CANCELLED)
    assert update_financial_account(session, account.id, is_active=False).is_active is False


def test_non_recurring_mark_paid_creates_one_sourced_transaction(session) -> None:
    account, expense, _ = references(session)
    payment = create_planned_payment(session, payment_input(account.id, expense.id))
    result = mark_planned_payment_paid(session, payment.id, date(2026, 7, 31))

    assert result.payment.status == PlannedPaymentStatus.PAID
    assert result.transaction is not None
    assert result.transaction.source == TransactionSource.PLANNED_PAYMENT
    assert result.payment.last_transaction_id == result.transaction.id
    with pytest.raises(DomainValidationError, match="outdated"):
        mark_planned_payment_paid(session, payment.id, date(2026, 7, 31))
    assert session.query(Transaction).count() == 1


def test_mark_paid_without_complete_references_records_no_transaction(session) -> None:
    account, expense, _ = references(session)
    account_only = create_planned_payment(session, payment_input(account.id))
    category_only = create_planned_payment(session, payment_input(category_id=expense.id))

    for payment in (account_only, category_only):
        result = mark_planned_payment_paid(session, payment.id, payment.due_date)
        assert result.payment.status == PlannedPaymentStatus.PAID
        assert result.payment.last_paid_due_date == date(2026, 7, 31)
        assert result.payment.last_transaction_id is None
        assert result.transaction is None

    assert session.query(Transaction).count() == 0


def test_removing_pending_account_reference_allows_deactivation(session) -> None:
    account, expense, _ = references(session)
    payment = create_planned_payment(session, payment_input(account.id, expense.id))

    update_planned_payment(session, payment.id, financial_account_id=None)

    assert update_financial_account(session, account.id, is_active=False).is_active is False


def test_cancelled_payment_can_be_reactivated(session) -> None:
    payment = create_planned_payment(session, payment_input())
    update_planned_payment(session, payment.id, status=PlannedPaymentStatus.CANCELLED)

    reactivated = update_planned_payment(
        session, payment.id, status=PlannedPaymentStatus.PENDING
    )

    assert reactivated.status == PlannedPaymentStatus.PENDING


def test_deleting_paid_payment_preserves_created_transaction(session) -> None:
    account, expense, _ = references(session)
    payment = create_planned_payment(session, payment_input(account.id, expense.id))
    result = mark_planned_payment_paid(session, payment.id, payment.due_date)
    transaction_id = result.transaction.id if result.transaction else None

    delete_planned_payment(session, payment.id)

    assert transaction_id is not None
    assert session.get(Transaction, transaction_id) is not None


@pytest.mark.parametrize(
    ("due_date", "recurrence", "next_due"),
    [
        (date(2026, 1, 31), PlannedPaymentRecurrence.MONTHLY, date(2026, 2, 28)),
        (date(2024, 2, 29), PlannedPaymentRecurrence.YEARLY, date(2025, 2, 28)),
        (date(2026, 7, 12), PlannedPaymentRecurrence.WEEKLY, date(2026, 7, 19)),
    ],
)
def test_recurring_mark_paid_advances_calendar_safely(
    session, due_date, recurrence, next_due
) -> None:
    payment = create_planned_payment(
        session, payment_input(recurrence=recurrence, due_date=due_date)
    )
    result = mark_planned_payment_paid(session, payment.id, due_date)
    assert result.payment.status == PlannedPaymentStatus.PENDING
    assert result.payment.last_paid_due_date == due_date
    assert result.payment.due_date == next_due
    assert result.transaction is None


def test_upcoming_payments_are_filtered_and_ordered(session) -> None:
    account, expense, _ = references(session)
    later = create_planned_payment(
        session, payment_input(account.id, expense.id, due_date=date(2026, 7, 20))
    )
    earlier = create_planned_payment(
        session, payment_input(account.id, expense.id, due_date=date(2026, 7, 15))
    )
    create_planned_payment(session, payment_input(due_date=date(2026, 8, 1)))
    assert [
        item.id
        for item in list_upcoming_payments(
            session, date(2026, 7, 1), date(2026, 7, 31), account.id, expense.id
        )
    ] == [earlier.id, later.id]
