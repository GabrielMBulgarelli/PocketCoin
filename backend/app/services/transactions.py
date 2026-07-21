import csv
import io
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import (
    AccountKind,
    Category,
    CategoryDirection,
    FinancialAccount,
    Tag,
    Transaction,
    TransactionKind,
    TransactionSource,
    transaction_tags,
)
from app.services.reference_data import DomainValidationError, NotFoundError, normalized_name


@dataclass(frozen=True)
class TransactionInput:
    financial_account_id: int | None
    category_id: int
    kind: TransactionKind
    amount_minor: int
    transaction_date: date
    description: str
    notes: str | None = None
    tag_ids: list[int] | None = None
    source: TransactionSource = TransactionSource.MANUAL


def _set_tags(session: Session, transaction: Transaction, tag_ids: list[int] | None) -> None:
    if tag_ids is None:
        return
    unique_ids = list(dict.fromkeys(tag_ids))
    tags = (
        list(session.scalars(select(Tag).where(Tag.id.in_(unique_ids), Tag.is_active)))
        if unique_ids
        else []
    )
    if len(tags) != len(unique_ids):
        raise DomainValidationError("One or more tags are unavailable.", "tag_ids")
    session.execute(
        transaction_tags.delete().where(transaction_tags.c.transaction_id == transaction.id)
    )
    if unique_ids:
        session.execute(
            transaction_tags.insert(),
            [{"transaction_id": transaction.id, "tag_id": tag_id} for tag_id in unique_ids],
        )


@dataclass(frozen=True)
class TransferInput:
    from_account_id: int
    to_account_id: int
    amount_minor: int
    transaction_date: date
    description: str
    notes: str | None = None


def _account(session: Session, account_id: int) -> FinancialAccount:
    account = session.get(FinancialAccount, account_id)
    if account is None or not account.is_active:
        raise DomainValidationError("Financial account is unavailable.", "financial_account_id")
    return account


def _category(session: Session, category_id: int, kind: TransactionKind) -> Category:
    category = session.get(Category, category_id)
    expected = (
        CategoryDirection.INCOME if kind == TransactionKind.INCOME else CategoryDirection.EXPENSE
    )
    if category is None or not category.is_active or category.direction != expected:
        raise DomainValidationError("Category does not match the transaction kind.", "category_id")
    return category


def create_transaction(session: Session, data: TransactionInput) -> Transaction:
    if data.kind not in {TransactionKind.INCOME, TransactionKind.EXPENSE}:
        raise DomainValidationError("Use the transfer endpoints for transfer rows.", "kind")
    if data.amount_minor <= 0:
        raise DomainValidationError("Amount must be positive.", "amount_minor")
    if data.financial_account_id is not None:
        _account(session, data.financial_account_id)
    _category(session, data.category_id, data.kind)
    transaction = Transaction(
        financial_account_id=data.financial_account_id,
        category_id=data.category_id,
        kind=data.kind,
        amount_minor=data.amount_minor,
        transaction_date=data.transaction_date,
        description=normalized_name(data.description),
        notes=data.notes,
        source=data.source,
    )
    session.add(transaction)
    session.flush()
    _set_tags(session, transaction, data.tag_ids)
    return transaction


def create_transfer(session: Session, data: TransferInput) -> tuple[Transaction, Transaction]:
    if data.amount_minor <= 0:
        raise DomainValidationError("Amount must be positive.", "amount_minor")
    if data.from_account_id == data.to_account_id:
        raise DomainValidationError("Transfer accounts must differ.", "to_account_id")
    _account(session, data.from_account_id)
    _account(session, data.to_account_id)
    group_id = str(uuid4())
    description = normalized_name(data.description)
    outgoing = Transaction(
        financial_account_id=data.from_account_id,
        category_id=None,
        kind=TransactionKind.TRANSFER_OUT,
        amount_minor=data.amount_minor,
        transaction_date=data.transaction_date,
        description=description,
        notes=data.notes,
        transfer_group_id=group_id,
        source=TransactionSource.MANUAL,
    )
    incoming = Transaction(
        financial_account_id=data.to_account_id,
        category_id=None,
        kind=TransactionKind.TRANSFER_IN,
        amount_minor=data.amount_minor,
        transaction_date=data.transaction_date,
        description=description,
        notes=data.notes,
        transfer_group_id=group_id,
        source=TransactionSource.MANUAL,
    )
    session.add_all([outgoing, incoming])
    session.flush()
    return outgoing, incoming


def transaction_statement(
    financial_account_id: int | None = None,
    category_id: int | None = None,
    kind: TransactionKind | None = None,
    search: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tag_id: int | None = None,
    sort: str = "date_desc",
    without_account: bool = False,
):
    statement = select(Transaction)
    if without_account and financial_account_id is not None:
        raise DomainValidationError("Choose either General or a financial account.", "account")
    if without_account:
        statement = statement.where(Transaction.financial_account_id.is_(None))
    if financial_account_id is not None:
        statement = statement.where(Transaction.financial_account_id == financial_account_id)
    if category_id is not None:
        statement = statement.where(Transaction.category_id == category_id)
    if kind is not None:
        statement = statement.where(Transaction.kind == kind)
    if search:
        statement = statement.where(
            or_(
                Transaction.description.ilike(f"%{search.strip()}%"),
                Transaction.notes.ilike(f"%{search.strip()}%"),
            )
        )
    if start_date:
        statement = statement.where(Transaction.transaction_date >= start_date)
    if end_date:
        statement = statement.where(Transaction.transaction_date <= end_date)
    if start_date and end_date and start_date > end_date:
        raise DomainValidationError("Start date must not be after end date.", "start_date")
    if tag_id is not None:
        statement = statement.join(transaction_tags).where(transaction_tags.c.tag_id == tag_id)
    ordering = {
        "date_desc": (Transaction.transaction_date.desc(), Transaction.id.desc()),
        "date_asc": (Transaction.transaction_date.asc(), Transaction.id.asc()),
        "amount_desc": (Transaction.amount_minor.desc(), Transaction.id.desc()),
        "amount_asc": (Transaction.amount_minor.asc(), Transaction.id.asc()),
    }.get(sort)
    if ordering is None:
        raise DomainValidationError("Invalid transaction sort.", "sort")
    return statement.order_by(*ordering)


def list_transactions(
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
) -> list[Transaction]:
    if not 1 <= limit <= 200 or offset < 0:
        raise DomainValidationError("Invalid transaction pagination.")
    statement = (
        transaction_statement(
            financial_account_id,
            category_id,
            kind,
            search,
            start_date,
            end_date,
            tag_id,
            sort,
            without_account,
        )
        .limit(limit)
        .offset(offset)
    )
    return list(session.scalars(statement))


def _spreadsheet_safe(value: str | None) -> str:
    if value is None:
        return ""
    if value.startswith(("\t", "\r")) or value.lstrip().startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


def export_transactions_csv(
    session: Session,
    currency: str,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    kind: TransactionKind | None = None,
    search: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tag_id: int | None = None,
    sort: str = "date_asc",
    without_account: bool = False,
) -> tuple[bytes, str]:
    rows = list(
        session.scalars(
            transaction_statement(
                financial_account_id,
                category_id,
                kind,
                search,
                start_date,
                end_date,
                tag_id,
                sort,
                without_account,
            )
        )
    )
    account_names = {
        account.id: account.name for account in session.scalars(select(FinancialAccount))
    }
    category_names = {category.id: category.name for category in session.scalars(select(Category))}
    tags_by_transaction: dict[int, list[str]] = {row.id: [] for row in rows}
    if rows:
        tag_rows = session.execute(
            select(transaction_tags.c.transaction_id, Tag.name)
            .join(Tag, Tag.id == transaction_tags.c.tag_id)
            .where(transaction_tags.c.transaction_id.in_([row.id for row in rows]))
            .order_by(transaction_tags.c.transaction_id, Tag.name)
        )
        for transaction_id, name in tag_rows:
            tags_by_transaction.setdefault(transaction_id, []).append(name)

    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "transaction_id",
            "date",
            "kind",
            "amount",
            "currency",
            "description",
            "notes",
            "account",
            "category",
            "tags",
            "source",
            "external_id",
        ]
    )
    for row in rows:
        writer.writerow(
            [
                row.id,
                row.transaction_date.isoformat(),
                row.kind.value,
                f"{Decimal(row.amount_minor) / Decimal(100):.2f}",
                currency,
                _spreadsheet_safe(row.description),
                _spreadsheet_safe(row.notes),
                _spreadsheet_safe(account_names.get(row.financial_account_id, "")),
                _spreadsheet_safe(category_names.get(row.category_id, "")),
                _spreadsheet_safe(", ".join(tags_by_transaction.get(row.id, []))),
                row.source.value,
                _spreadsheet_safe(row.external_id),
            ]
        )
    return ("\ufeff" + output.getvalue()).encode("utf-8"), "pocketcoin-transactions.csv"


def get_transaction(session: Session, transaction_id: int) -> Transaction:
    transaction = session.get(Transaction, transaction_id)
    if transaction is None:
        raise NotFoundError("Transaction not found.")
    return transaction


def update_transaction(session: Session, transaction_id: int, **values: object) -> Transaction:
    transaction = get_transaction(session, transaction_id)
    if transaction.transfer_group_id is not None:
        raise DomainValidationError("Transfer rows use dedicated transfer endpoints.")
    account_value = values.get("financial_account_id", transaction.financial_account_id)
    data = TransactionInput(
        financial_account_id=int(account_value) if account_value is not None else None,
        category_id=int(values.get("category_id", transaction.category_id)),
        kind=TransactionKind(values.get("kind", transaction.kind)),
        amount_minor=int(values.get("amount_minor", transaction.amount_minor)),
        transaction_date=values.get("transaction_date", transaction.transaction_date),
        description=str(values.get("description", transaction.description)),
        notes=values.get("notes", transaction.notes),
        source=transaction.source,
        tag_ids=values.get("tag_ids"),
    )
    if data.financial_account_id is not None:
        _account(session, data.financial_account_id)
    _category(session, data.category_id, data.kind)
    for field, value in data.__dict__.items():
        if field == "tag_ids":
            continue
        setattr(transaction, field, value)
    transaction.description = normalized_name(transaction.description)
    session.flush()
    _set_tags(session, transaction, data.tag_ids)
    return transaction


def delete_transaction(session: Session, transaction_id: int) -> None:
    transaction = get_transaction(session, transaction_id)
    if transaction.transfer_group_id is not None:
        raise DomainValidationError("Transfer rows use dedicated transfer endpoints.")
    session.delete(transaction)
    session.flush()


def delete_transfer(session: Session, transfer_group_id: str) -> None:
    transactions = list(
        session.scalars(
            select(Transaction).where(Transaction.transfer_group_id == transfer_group_id)
        )
    )
    if len(transactions) != 2:
        raise NotFoundError("Transfer not found.")
    for transaction in transactions:
        session.delete(transaction)
    session.flush()


def update_transfer(
    session: Session, transfer_group_id: str, data: TransferInput
) -> tuple[Transaction, Transaction]:
    transactions = list(
        session.scalars(
            select(Transaction).where(Transaction.transfer_group_id == transfer_group_id)
        )
    )
    if len(transactions) != 2:
        raise NotFoundError("Transfer not found.")
    delete_transfer(session, transfer_group_id)
    return create_transfer(session, data)


def account_balance_minor(session: Session, account_id: int) -> int:
    account = session.get(FinancialAccount, account_id)
    if account is None:
        raise NotFoundError("Financial account not found.")
    balance = account.opening_balance_minor
    for transaction in session.scalars(
        select(Transaction).where(Transaction.financial_account_id == account_id)
    ):
        if account.kind in {AccountKind.CASH, AccountKind.CHECKING, AccountKind.SAVINGS}:
            balance += (
                transaction.amount_minor
                if transaction.kind in {TransactionKind.INCOME, TransactionKind.TRANSFER_IN}
                else -transaction.amount_minor
            )
        else:
            balance += (
                transaction.amount_minor
                if transaction.kind in {TransactionKind.EXPENSE, TransactionKind.TRANSFER_OUT}
                else -transaction.amount_minor
            )
    return balance
