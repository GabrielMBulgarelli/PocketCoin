from datetime import date

from sqlalchemy import select

from app.models import (
    Category,
    CategoryDirection,
    PlannedPayment,
    PlannedPaymentRecurrence,
    PlannedPaymentStatus,
    Tag,
    Transaction,
    TransactionKind,
    TransactionSource,
)
from app.services.planned_payments import (
    RecurringTransactionInput,
    create_recurring_transaction,
    delete_recurring_transaction,
    list_transaction_timeline,
    materialize_due_recurrences,
    update_recurring_transaction,
    update_scheduled_recurrence,
)
from app.services.reference_data import (
    DomainValidationError,
    update_category,
    update_tag,
)
from app.services.transactions import TransactionInput, create_transaction, list_transactions


def references(session):
    expense = Category(name="Housing", direction=CategoryDirection.EXPENSE)
    tag = Tag(name="Essential")
    session.add_all([expense, tag])
    session.flush()
    return expense, tag


def test_general_transaction_is_posted_without_a_financial_account(session) -> None:
    expense, _ = references(session)
    transaction = create_transaction(
        session,
        TransactionInput(
            financial_account_id=None,
            category_id=expense.id,
            kind=TransactionKind.EXPENSE,
            amount_minor=10_000,
            transaction_date=date(2026, 7, 20),
            description="General expense",
        ),
    )

    assert transaction.financial_account_id is None
    assert [item.id for item in list_transactions(session, without_account=True)] == [
        transaction.id
    ]


def test_recurrence_materializes_due_occurrences_once_and_copies_tags(session) -> None:
    expense, tag = references(session)
    result = create_recurring_transaction(
        session,
        RecurringTransactionInput(
            financial_account_id=None,
            category_id=expense.id,
            kind=TransactionKind.EXPENSE,
            amount_minor=25_000,
            transaction_date=date(2026, 1, 31),
            description="Rent",
            notes="No account",
            tag_ids=[tag.id],
            frequency=PlannedPaymentRecurrence.MONTHLY,
            end_date=date(2026, 3, 31),
            is_debt_payment=True,
        ),
        through_date=date(2026, 2, 28),
    )

    assert [row.transaction_date for row in result.transactions] == [
        date(2026, 1, 31),
        date(2026, 2, 28),
    ]
    assert result.series.due_date == date(2026, 3, 31)
    assert result.series.status == PlannedPaymentStatus.PENDING

    assert materialize_due_recurrences(session, date(2026, 3, 31)) == 1
    assert materialize_due_recurrences(session, date(2026, 3, 31)) == 0
    rows = list(
        session.scalars(
            select(Transaction)
            .where(Transaction.planned_payment_id == result.series.id)
            .order_by(Transaction.scheduled_for)
        )
    )
    assert [row.scheduled_for for row in rows] == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
    ]
    assert result.series.status == PlannedPaymentStatus.COMPLETED


def test_incomplete_legacy_series_needs_attention_and_is_not_materialized(session) -> None:
    series = PlannedPayment(
        title="Legacy row",
        direction=CategoryDirection.EXPENSE,
        amount_minor=1_000,
        due_date=date(2026, 7, 1),
        recurrence=PlannedPaymentRecurrence.MONTHLY,
        status=PlannedPaymentStatus.PENDING,
    )
    session.add(series)
    session.flush()

    assert series.needs_attention is True
    assert materialize_due_recurrences(session, date(2026, 7, 20)) == 0
    assert session.query(Transaction).count() == 0


def test_active_recurrence_blocks_category_and_tag_deactivation(session) -> None:
    expense, tag = references(session)
    create_recurring_transaction(
        session,
        RecurringTransactionInput(
            financial_account_id=None,
            category_id=expense.id,
            kind=TransactionKind.EXPENSE,
            amount_minor=2_000,
            transaction_date=date(2026, 7, 20),
            description="Subscription",
            tag_ids=[tag.id],
            frequency=PlannedPaymentRecurrence.MONTHLY,
        ),
        through_date=date(2026, 7, 20),
    )

    for update, record_id in ((update_category, expense.id), (update_tag, tag.id)):
        try:
            update(session, record_id, is_active=False)
        except DomainValidationError as error:
            assert "active recurrence" in str(error).lower()
        else:
            raise AssertionError("An active recurrence reference must block deactivation")


def test_timeline_combines_posted_rows_with_only_the_next_occurrence(session) -> None:
    expense, _ = references(session)
    result = create_recurring_transaction(
        session,
        RecurringTransactionInput(
            financial_account_id=None,
            category_id=expense.id,
            kind=TransactionKind.EXPENSE,
            amount_minor=5_000,
            transaction_date=date(2026, 7, 20),
            description="Gym",
            frequency=PlannedPaymentRecurrence.MONTHLY,
            end_date=date(2026, 9, 20),
        ),
        through_date=date(2026, 7, 20),
    )

    rows = list_transaction_timeline(session, without_account=True)

    assert [row["row_type"] for row in rows] == ["scheduled", "transaction"]
    assert rows[0]["transaction_date"] == date(2026, 8, 20)
    assert rows[0]["remaining_occurrences"] == 2
    assert rows[0]["planned_payment_id"] == result.series.id


def test_this_and_future_updates_or_cancels_the_linked_series(session) -> None:
    expense, _ = references(session)
    result = create_recurring_transaction(
        session,
        RecurringTransactionInput(
            financial_account_id=None,
            category_id=expense.id,
            kind=TransactionKind.EXPENSE,
            amount_minor=5_000,
            transaction_date=date(2026, 7, 20),
            description="Gym",
            frequency=PlannedPaymentRecurrence.MONTHLY,
        ),
        through_date=date(2026, 7, 20),
    )
    posted = result.transactions[0]

    update_recurring_transaction(
        session,
        posted.id,
        scope="this_and_future",
        amount_minor=7_500,
        description="Updated gym",
        transaction_date=date(2026, 7, 25),
    )

    assert posted.amount_minor == 7_500
    assert posted.source == TransactionSource.PLANNED_PAYMENT
    assert result.series.amount_minor == 7_500
    assert result.series.title == "Updated gym"
    assert result.series.due_date == date(2026, 8, 25)

    delete_recurring_transaction(session, posted.id, scope="this_and_future")
    assert result.series.status == PlannedPaymentStatus.CANCELLED
    assert session.get(Transaction, posted.id) is None


def test_scheduled_occurrence_can_be_edited_without_changing_future_template(session) -> None:
    expense, _ = references(session)
    result = create_recurring_transaction(
        session,
        RecurringTransactionInput(
            financial_account_id=None,
            category_id=expense.id,
            kind=TransactionKind.EXPENSE,
            amount_minor=5_000,
            transaction_date=date(2026, 7, 20),
            description="Gym",
            frequency=PlannedPaymentRecurrence.MONTHLY,
        ),
        through_date=date(2026, 7, 20),
    )

    occurrence = update_scheduled_recurrence(
        session,
        result.series.id,
        scope="this_occurrence",
        amount_minor=7_500,
        title="Special gym payment",
        due_date=date(2026, 8, 22),
    )

    assert occurrence.id != result.series.id
    assert occurrence.amount_minor == 7_500
    assert occurrence.due_date == occurrence.end_date == date(2026, 8, 22)
    assert result.series.amount_minor == 5_000
    assert result.series.title == "Gym"
    assert result.series.due_date == date(2026, 9, 20)
