import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Category,
    CategoryDirection,
    FinancialAccount,
    PlannedPayment,
    PlannedPaymentRecurrence,
    PlannedPaymentStatus,
    Transaction,
    TransactionKind,
    TransactionSource,
)
from app.services.reference_data import DomainValidationError, NotFoundError, normalized_name
from app.services.transactions import TransactionInput, create_transaction


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
    return title


def create_planned_payment(session: Session, data: PlannedPaymentInput) -> PlannedPayment:
    title = _validate(session, data)
    values = {**data.__dict__, "title": title}
    payment = PlannedPayment(**values, status=PlannedPaymentStatus.PENDING)
    session.add(payment)
    session.flush()
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
    )
    title = _validate(session, current)
    for field, value in values.items():
        setattr(payment, field, value)
    payment.title = title
    session.flush()
    return payment


def delete_planned_payment(session: Session, payment_id: int) -> None:
    session.delete(_get(session, payment_id))
    session.flush()


def advance_recurrence_date(value: date, recurrence: PlannedPaymentRecurrence) -> date:
    if recurrence == PlannedPaymentRecurrence.WEEKLY:
        return value + timedelta(days=7)
    months = 1 if recurrence == PlannedPaymentRecurrence.MONTHLY else 12
    absolute_month = value.year * 12 + value.month - 1 + months
    year, zero_month = divmod(absolute_month, 12)
    month = zero_month + 1
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def mark_planned_payment_paid(
    session: Session, payment_id: int, expected_due_date: date
) -> MarkPaidResult:
    payment = _get(session, payment_id)
    if payment.status != PlannedPaymentStatus.PENDING or payment.due_date != expected_due_date:
        raise DomainValidationError("This payment occurrence is outdated.", "expected_due_date")
    transaction = None
    if payment.financial_account_id is not None and payment.category_id is not None:
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
        payment.due_date = advance_recurrence_date(payment.due_date, payment.recurrence)
    session.flush()
    return MarkPaidResult(payment, transaction)


def list_upcoming_payments(
    session: Session,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
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
    if category_id is not None:
        statement = statement.where(PlannedPayment.category_id == category_id)
    return list(session.scalars(statement.order_by(PlannedPayment.due_date, PlannedPayment.id)))
