import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import (
    Category,
    CategoryDirection,
    FinancialAccount,
    PlannedPayment,
    PlannedPaymentRecurrence,
    PlannedPaymentStatus,
    Tag,
    Transaction,
    TransactionKind,
    TransactionSource,
    planned_payment_tags,
)
from app.services.reference_data import DomainValidationError, NotFoundError, normalized_name
from app.services.transactions import (
    TransactionInput,
    create_transaction,
    delete_transaction,
    transaction_statement,
    update_transaction,
)


@dataclass(frozen=True)
class PlannedPaymentInput:
    financial_account_id: int | None
    category_id: int | None
    title: str
    direction: CategoryDirection
    amount_minor: int
    due_date: date
    recurrence: PlannedPaymentRecurrence
    is_debt_payment: bool = False
    notes: str | None = None
    end_date: date | None = None
    tag_ids: list[int] | None = None


@dataclass(frozen=True)
class RecurringTransactionInput:
    financial_account_id: int | None
    category_id: int
    kind: TransactionKind
    amount_minor: int
    transaction_date: date
    description: str
    frequency: PlannedPaymentRecurrence
    end_date: date | None = None
    is_debt_payment: bool = False
    notes: str | None = None
    tag_ids: list[int] | None = None


@dataclass(frozen=True)
class RecurringTransactionResult:
    series: PlannedPayment
    transactions: list[Transaction]


@dataclass(frozen=True)
class MarkPaidResult:
    payment: PlannedPayment
    transaction: Transaction | None


def _validate(session: Session, data: PlannedPaymentInput) -> str:
    title = normalized_name(data.title)
    if data.amount_minor <= 0:
        raise DomainValidationError("Amount must be positive.", "amount_minor")
    if data.financial_account_id is not None:
        account = session.get(FinancialAccount, data.financial_account_id)
        if account is None or not account.is_active:
            raise DomainValidationError("Financial account is unavailable.", "financial_account_id")
    if data.category_id is not None:
        category = session.get(Category, data.category_id)
        if category is None or not category.is_active:
            raise DomainValidationError("Category is unavailable.", "category_id")
        if category.direction != data.direction:
            raise DomainValidationError(
                "Category direction must match payment direction.", "category_id"
            )
    if data.end_date is not None and data.end_date < data.due_date:
        raise DomainValidationError("End date must not be before the first occurrence.", "end_date")
    if data.tag_ids is not None:
        unique_ids = list(dict.fromkeys(data.tag_ids))
        tags = (
            list(session.scalars(select(Tag).where(Tag.id.in_(unique_ids), Tag.is_active)))
            if unique_ids
            else []
        )
        if len(tags) != len(unique_ids):
            raise DomainValidationError("One or more tags are unavailable.", "tag_ids")
    return title


def _set_series_tags(session: Session, payment: PlannedPayment, tag_ids: list[int] | None) -> None:
    if tag_ids is None:
        return
    unique_ids = list(dict.fromkeys(tag_ids))
    session.execute(
        planned_payment_tags.delete().where(planned_payment_tags.c.planned_payment_id == payment.id)
    )
    if unique_ids:
        session.execute(
            planned_payment_tags.insert(),
            [{"planned_payment_id": payment.id, "tag_id": tag_id} for tag_id in unique_ids],
        )


def _series_tag_ids(session: Session, payment_id: int) -> list[int]:
    return list(
        session.scalars(
            select(planned_payment_tags.c.tag_id).where(
                planned_payment_tags.c.planned_payment_id == payment_id
            )
        )
    )


def create_planned_payment(session: Session, data: PlannedPaymentInput) -> PlannedPayment:
    title = _validate(session, data)
    values = {key: value for key, value in data.__dict__.items() if key != "tag_ids"}
    values["title"] = title
    values["anchor_day"] = data.due_date.day
    payment = PlannedPayment(**values, status=PlannedPaymentStatus.PENDING)
    session.add(payment)
    session.flush()
    _set_series_tags(session, payment, data.tag_ids)
    return payment


def list_planned_payments(session: Session) -> list[PlannedPayment]:
    return list(
        session.scalars(select(PlannedPayment).order_by(PlannedPayment.due_date, PlannedPayment.id))
    )


def _get(session: Session, payment_id: int) -> PlannedPayment:
    payment = session.get(PlannedPayment, payment_id)
    if payment is None:
        raise NotFoundError("Planned payment not found.")
    return payment


def update_planned_payment(session: Session, payment_id: int, **values: object) -> PlannedPayment:
    payment = _get(session, payment_id)
    if values.get("status") == PlannedPaymentStatus.PAID:
        raise DomainValidationError("Use mark paid to complete a planned payment.", "status")
    current = PlannedPaymentInput(
        financial_account_id=values.get("financial_account_id", payment.financial_account_id),
        category_id=values.get("category_id", payment.category_id),
        title=str(values.get("title", payment.title)),
        direction=CategoryDirection(values.get("direction", payment.direction)),
        amount_minor=int(values.get("amount_minor", payment.amount_minor)),
        due_date=values.get("due_date", payment.due_date),
        recurrence=PlannedPaymentRecurrence(values.get("recurrence", payment.recurrence)),
        is_debt_payment=bool(values.get("is_debt_payment", payment.is_debt_payment)),
        notes=values.get("notes", payment.notes),
        end_date=values.get("end_date", payment.end_date),
        tag_ids=values.get("tag_ids"),
    )
    title = _validate(session, current)
    for field, value in values.items():
        setattr(payment, field, value)
    payment.title = title
    if "due_date" in values:
        payment.anchor_day = payment.due_date.day
    session.flush()
    _set_series_tags(session, payment, current.tag_ids)
    return payment


def delete_planned_payment(session: Session, payment_id: int) -> None:
    session.delete(_get(session, payment_id))
    session.flush()


def advance_recurrence_date(
    value: date, recurrence: PlannedPaymentRecurrence, anchor_day: int | None = None
) -> date:
    if recurrence == PlannedPaymentRecurrence.WEEKLY:
        return value + timedelta(days=7)
    months = 1 if recurrence == PlannedPaymentRecurrence.MONTHLY else 12
    absolute_month = value.year * 12 + value.month - 1 + months
    year, zero_month = divmod(absolute_month, 12)
    month = zero_month + 1
    return date(year, month, min(anchor_day or value.day, calendar.monthrange(year, month)[1]))


def _complete_or_advance(payment: PlannedPayment) -> None:
    next_due = advance_recurrence_date(
        payment.due_date, payment.recurrence, payment.anchor_day or payment.due_date.day
    )
    if payment.end_date is not None and next_due > payment.end_date:
        payment.status = PlannedPaymentStatus.COMPLETED
    else:
        payment.due_date = next_due


def _materialize_occurrence(session: Session, payment: PlannedPayment) -> Transaction:
    existing = session.scalar(
        select(Transaction).where(
            Transaction.planned_payment_id == payment.id,
            Transaction.scheduled_for == payment.due_date,
        )
    )
    if existing is not None:
        return existing
    if payment.category_id is None:
        raise DomainValidationError("This recurrence needs a category.", "category_id")
    transaction = create_transaction(
        session,
        TransactionInput(
            financial_account_id=payment.financial_account_id,
            category_id=payment.category_id,
            kind=TransactionKind(payment.direction.value),
            amount_minor=payment.amount_minor,
            transaction_date=payment.due_date,
            description=payment.title,
            notes=payment.notes,
            tag_ids=_series_tag_ids(session, payment.id),
            source=TransactionSource.PLANNED_PAYMENT,
        ),
    )
    transaction.planned_payment_id = payment.id
    transaction.scheduled_for = payment.due_date
    payment.last_paid_due_date = payment.due_date
    payment.last_transaction_id = transaction.id
    session.flush()
    return transaction


def create_recurring_transaction(
    session: Session, data: RecurringTransactionInput, through_date: date | None = None
) -> RecurringTransactionResult:
    if data.frequency == PlannedPaymentRecurrence.NONE:
        raise DomainValidationError("Choose a recurring frequency.", "frequency")
    payment = create_planned_payment(
        session,
        PlannedPaymentInput(
            financial_account_id=data.financial_account_id,
            category_id=data.category_id,
            title=data.description,
            direction=CategoryDirection(data.kind.value),
            amount_minor=data.amount_minor,
            due_date=data.transaction_date,
            recurrence=data.frequency,
            is_debt_payment=data.is_debt_payment,
            notes=data.notes,
            end_date=data.end_date,
            tag_ids=data.tag_ids,
        ),
    )
    transactions = [_materialize_occurrence(session, payment)]
    _complete_or_advance(payment)
    cutoff = through_date or date.today()
    while payment.status == PlannedPaymentStatus.PENDING and payment.due_date <= cutoff:
        transactions.append(_materialize_occurrence(session, payment))
        _complete_or_advance(payment)
    session.flush()
    return RecurringTransactionResult(payment, transactions)


def materialize_due_recurrences(session: Session, through_date: date | None = None) -> int:
    cutoff = through_date or date.today()
    payments = list(
        session.scalars(
            select(PlannedPayment)
            .where(
                PlannedPayment.status == PlannedPaymentStatus.PENDING,
                PlannedPayment.recurrence != PlannedPaymentRecurrence.NONE,
                PlannedPayment.category_id.is_not(None),
                PlannedPayment.due_date <= cutoff,
            )
            .order_by(PlannedPayment.id)
        )
    )
    created = 0
    for payment in payments:
        while payment.status == PlannedPaymentStatus.PENDING and payment.due_date <= cutoff:
            scheduled_for = payment.due_date
            existing = session.scalar(
                select(Transaction.id).where(
                    Transaction.planned_payment_id == payment.id,
                    Transaction.scheduled_for == scheduled_for,
                )
            )
            _materialize_occurrence(session, payment)
            created += int(existing is None)
            _complete_or_advance(payment)
    session.flush()
    return created


def mark_planned_payment_paid(
    session: Session, payment_id: int, expected_due_date: date
) -> MarkPaidResult:
    payment = _get(session, payment_id)
    if payment.status != PlannedPaymentStatus.PENDING or payment.due_date != expected_due_date:
        raise DomainValidationError("This payment occurrence is outdated.", "expected_due_date")
    transaction = None
    if payment.category_id is not None:
        transaction = create_transaction(
            session,
            TransactionInput(
                financial_account_id=payment.financial_account_id,
                category_id=payment.category_id,
                kind=TransactionKind(payment.direction.value),
                amount_minor=payment.amount_minor,
                transaction_date=payment.due_date,
                description=payment.title,
                notes=payment.notes,
                source=TransactionSource.PLANNED_PAYMENT,
            ),
        )
    payment.last_paid_due_date = payment.due_date
    payment.last_transaction_id = transaction.id if transaction else None
    if payment.recurrence == PlannedPaymentRecurrence.NONE:
        payment.status = PlannedPaymentStatus.PAID
    else:
        _complete_or_advance(payment)
    session.flush()
    return MarkPaidResult(payment, transaction)


def list_upcoming_payments(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    without_account: bool = False,
) -> list[PlannedPayment]:
    if start_date > end_date:
        raise DomainValidationError("Start date must not be after end date.", "start_date")
    statement = select(PlannedPayment).where(
        PlannedPayment.status == PlannedPaymentStatus.PENDING,
        PlannedPayment.due_date >= start_date,
        PlannedPayment.due_date <= end_date,
    )
    if financial_account_id is not None:
        statement = statement.where(PlannedPayment.financial_account_id == financial_account_id)
    if without_account:
        statement = statement.where(PlannedPayment.financial_account_id.is_(None))
    if category_id is not None:
        statement = statement.where(PlannedPayment.category_id == category_id)
    if tag_id is not None:
        statement = statement.join(planned_payment_tags).where(
            planned_payment_tags.c.tag_id == tag_id
        )
    return list(session.scalars(statement.order_by(PlannedPayment.due_date, PlannedPayment.id)))


def _remaining_occurrences(payment: PlannedPayment) -> int | None:
    if payment.end_date is None:
        return None
    count = 0
    occurrence = payment.due_date
    while occurrence <= payment.end_date:
        count += 1
        occurrence = advance_recurrence_date(
            occurrence, payment.recurrence, payment.anchor_day or occurrence.day
        )
    return count


def list_transaction_timeline(
    session: Session,
    limit: int = 50,
    offset: int = 0,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    kind: TransactionKind | None = None,
    search: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tag_id: int | None = None,
    sort: str = "date_desc",
    without_account: bool = False,
) -> list[dict[str, object]]:
    if not 1 <= limit <= 200 or offset < 0:
        raise DomainValidationError("Invalid transaction pagination.")
    if without_account and financial_account_id is not None:
        raise DomainValidationError("Choose either General or a financial account.", "account")
    posted = list(
        session.scalars(
            transaction_statement(
                financial_account_id,
                category_id,
                kind,
                search,
                start_date,
                end_date,
                tag_id,
                "date_desc",
                without_account,
            )
        )
    )
    statement = select(PlannedPayment).where(
        PlannedPayment.status == PlannedPaymentStatus.PENDING,
        PlannedPayment.recurrence != PlannedPaymentRecurrence.NONE,
    )
    if without_account:
        statement = statement.where(PlannedPayment.financial_account_id.is_(None))
    if financial_account_id is not None:
        statement = statement.where(PlannedPayment.financial_account_id == financial_account_id)
    if category_id is not None:
        statement = statement.where(PlannedPayment.category_id == category_id)
    if kind is not None:
        if kind not in {TransactionKind.INCOME, TransactionKind.EXPENSE}:
            statement = statement.where(False)
        else:
            statement = statement.where(PlannedPayment.direction == CategoryDirection(kind.value))
    if search:
        term = f"%{search.strip()}%"
        statement = statement.where(
            or_(PlannedPayment.title.ilike(term), PlannedPayment.notes.ilike(term))
        )
    if start_date:
        statement = statement.where(PlannedPayment.due_date >= start_date)
    if end_date:
        statement = statement.where(PlannedPayment.due_date <= end_date)
    if start_date and end_date and start_date > end_date:
        raise DomainValidationError("Start date must not be after end date.", "start_date")
    if tag_id is not None:
        statement = statement.join(planned_payment_tags).where(
            planned_payment_tags.c.tag_id == tag_id
        )
    scheduled = list(session.scalars(statement))
    rows: list[dict[str, object]] = [
        {
            "row_type": "transaction",
            "id": row.id,
            "financial_account_id": row.financial_account_id,
            "category_id": row.category_id,
            "transaction_date": row.transaction_date,
            "kind": row.kind,
            "amount_minor": row.amount_minor,
            "description": row.description,
            "notes": row.notes,
            "transfer_group_id": row.transfer_group_id,
            "planned_payment_id": row.planned_payment_id,
            "scheduled_for": row.scheduled_for,
            "recurrence": None,
            "end_date": None,
            "remaining_occurrences": None,
            "is_debt_payment": False,
            "needs_attention": False,
        }
        for row in posted
    ]
    rows.extend(
        {
            "row_type": "scheduled",
            "id": payment.id,
            "financial_account_id": payment.financial_account_id,
            "category_id": payment.category_id,
            "transaction_date": payment.due_date,
            "kind": TransactionKind(payment.direction.value),
            "amount_minor": payment.amount_minor,
            "description": payment.title,
            "notes": payment.notes,
            "transfer_group_id": None,
            "planned_payment_id": payment.id,
            "scheduled_for": payment.due_date,
            "recurrence": payment.recurrence,
            "end_date": payment.end_date,
            "remaining_occurrences": _remaining_occurrences(payment),
            "is_debt_payment": payment.is_debt_payment,
            "needs_attention": payment.needs_attention,
        }
        for payment in scheduled
    )
    reverse = sort.endswith("desc")
    if sort.startswith("date_"):
        rows.sort(key=lambda row: (row["transaction_date"], row["id"]), reverse=reverse)
    elif sort.startswith("amount_"):
        rows.sort(key=lambda row: (row["amount_minor"], row["id"]), reverse=reverse)
    else:
        raise DomainValidationError("Invalid transaction sort.", "sort")
    return rows[offset : offset + limit]


def update_recurring_transaction(
    session: Session, transaction_id: int, scope: str = "this_occurrence", **values: object
) -> Transaction:
    if scope not in {"this_occurrence", "this_and_future"}:
        raise DomainValidationError("Invalid recurrence scope.", "scope")
    transaction = update_transaction(session, transaction_id, **values)
    if scope == "this_and_future" and transaction.planned_payment_id is not None:
        payment = _get(session, transaction.planned_payment_id)
        payment.financial_account_id = transaction.financial_account_id
        payment.category_id = transaction.category_id
        payment.direction = CategoryDirection(transaction.kind.value)
        payment.amount_minor = transaction.amount_minor
        payment.title = transaction.description
        payment.notes = transaction.notes
        if "transaction_date" in values:
            payment.anchor_day = transaction.transaction_date.day
            payment.due_date = advance_recurrence_date(
                transaction.transaction_date, payment.recurrence, payment.anchor_day
            )
        if "tag_ids" in values:
            _set_series_tags(session, payment, values["tag_ids"])
        if payment.end_date is not None and payment.due_date > payment.end_date:
            payment.status = PlannedPaymentStatus.COMPLETED
        session.flush()
    return transaction


def update_scheduled_recurrence(
    session: Session, payment_id: int, scope: str = "this_and_future", **values: object
) -> PlannedPayment:
    if scope == "this_and_future":
        return update_planned_payment(session, payment_id, **values)
    if scope != "this_occurrence":
        raise DomainValidationError("Invalid recurrence scope.", "scope")
    payment = _get(session, payment_id)
    if (
        payment.status != PlannedPaymentStatus.PENDING
        or payment.recurrence == PlannedPaymentRecurrence.NONE
    ):
        raise DomainValidationError("This recurrence is no longer active.")
    occurrence_due = values.get("due_date", payment.due_date)
    if not isinstance(occurrence_due, date):
        raise DomainValidationError("Choose a valid occurrence date.", "due_date")
    occurrence = create_planned_payment(
        session,
        PlannedPaymentInput(
            financial_account_id=values.get(
                "financial_account_id", payment.financial_account_id
            ),
            category_id=values.get("category_id", payment.category_id),
            title=str(values.get("title", payment.title)),
            direction=CategoryDirection(values.get("direction", payment.direction)),
            amount_minor=int(values.get("amount_minor", payment.amount_minor)),
            due_date=occurrence_due,
            recurrence=payment.recurrence,
            end_date=occurrence_due,
            is_debt_payment=bool(values.get("is_debt_payment", payment.is_debt_payment)),
            notes=values.get("notes", payment.notes),
            tag_ids=values.get("tag_ids", _series_tag_ids(session, payment.id)),
        ),
    )
    _complete_or_advance(payment)
    if occurrence.due_date <= date.today():
        _materialize_occurrence(session, occurrence)
        _complete_or_advance(occurrence)
    session.flush()
    return occurrence


def delete_recurring_transaction(
    session: Session, transaction_id: int, scope: str = "this_occurrence"
) -> None:
    if scope not in {"this_occurrence", "this_and_future"}:
        raise DomainValidationError("Invalid recurrence scope.", "scope")
    transaction = session.get(Transaction, transaction_id)
    if transaction is None:
        raise NotFoundError("Transaction not found.")
    payment_id = transaction.planned_payment_id
    delete_transaction(session, transaction_id)
    if scope == "this_and_future" and payment_id is not None:
        payment = _get(session, payment_id)
        payment.status = PlannedPaymentStatus.CANCELLED
        session.flush()


def skip_recurrence_occurrence(session: Session, payment_id: int) -> PlannedPayment:
    payment = _get(session, payment_id)
    if payment.status != PlannedPaymentStatus.PENDING:
        raise DomainValidationError("This recurrence is no longer active.")
    _complete_or_advance(payment)
    session.flush()
    return payment


def cancel_recurrence(session: Session, payment_id: int) -> PlannedPayment:
    payment = _get(session, payment_id)
    payment.status = PlannedPaymentStatus.CANCELLED
    session.flush()
    return payment
