import csv
import hashlib
import io
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Literal
from uuid import uuid4

import polars as pl
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import data_directory
from app.models import (
    Category,
    CategoryDirection,
    FinancialAccount,
    ImportBatch,
    ImportBatchStatus,
    Transaction,
    TransactionKind,
    TransactionSource,
)
from app.services.reference_data import DomainValidationError, NotFoundError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_ROWS = 10_000
PREVIEW_HOURS = 24


@dataclass(frozen=True)
class ImportMapping:
    date_column: str
    description_column: str
    amount_mode: Literal["signed", "debit_credit"]
    date_format: Literal["iso", "day_first", "month_first"]
    decimal_separator: Literal["dot", "comma"]
    account_mode: Literal["fixed", "column"]
    amount_column: str | None = None
    debit_column: str | None = None
    credit_column: str | None = None
    financial_account_id: int | None = None
    account_column: str | None = None
    category_column: str | None = None
    external_id_column: str | None = None


@dataclass(frozen=True)
class PreviewResult:
    preview_id: str
    filename: str
    encoding: str
    delimiter: str
    columns: list[str]
    sample_rows: list[dict[str, str]]
    mapping_suggestions: dict[str, str | None]
    issues: list[str]


@dataclass
class ImportRow:
    row_number: int
    transaction_date: date | None = None
    description: str = ""
    amount_minor: int | None = None
    direction: str | None = None
    financial_account_id: int | None = None
    financial_account_name: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    external_id: str | None = None
    fingerprint: str | None = None
    duplicate: bool = False
    duplicate_reason: str | None = None
    issues: list[str] = field(default_factory=list)

    @property
    def eligible(self) -> bool:
        return not self.issues and not self.duplicate


@dataclass(frozen=True)
class ValidationResult:
    preview_id: str
    total_rows: int
    valid_count: int
    duplicate_count: int
    invalid_count: int
    rows: list[ImportRow]


@dataclass(frozen=True)
class CommitResult:
    preview_id: str
    status: str
    imported_count: int
    skipped_count: int
    failed_count: int


def _temp_directory() -> Path:
    path = data_directory() / "imports" / "tmp"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _path(preview_id: str) -> Path:
    return _temp_directory() / f"{preview_id}.csv"


def _safe_filename(filename: str) -> str:
    cleaned = Path(filename.replace("\x00", "")).name.strip()
    cleaned = "".join(character for character in cleaned if character.isprintable())[:255]
    return cleaned or "import.csv"


def _decode(content: bytes) -> tuple[str, str]:
    if content.startswith(b"\xef\xbb\xbf"):
        return content.decode("utf-8-sig"), "utf-8-bom"
    try:
        return content.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        return content.decode("cp1252"), "windows-1252"


def _read(content: bytes) -> tuple[pl.DataFrame, str, str]:
    text, encoding = _decode(content)
    try:
        delimiter = csv.Sniffer().sniff(text[:8192], delimiters=",;\t").delimiter
    except csv.Error as error:
        raise DomainValidationError("The CSV delimiter could not be detected.", "file") from error
    try:
        frame = pl.read_csv(
            io.StringIO(text),
            separator=delimiter,
            infer_schema_length=0,
            null_values=[],
            truncate_ragged_lines=False,
        ).fill_null("")
    except Exception as error:
        raise DomainValidationError("The CSV file could not be parsed.", "file") from error
    if frame.height > MAX_ROWS:
        raise DomainValidationError("CSV files may contain at most 10,000 data rows.", "file")
    if not frame.columns:
        raise DomainValidationError("The CSV file must contain a header row.", "file")
    return frame, encoding, delimiter


def _suggest(columns: list[str]) -> dict[str, str | None]:
    lowered = {column.strip().casefold(): column for column in columns}

    def find(*names: str) -> str | None:
        return next((lowered[name] for name in names if name in lowered), None)

    return {
        "date": find("date", "transaction date", "fecha"),
        "description": find("description", "details", "memo", "descripción", "descripcion"),
        "amount": find("amount", "importe", "monto"),
        "debit": find("debit", "withdrawal", "cargo", "débito", "debito"),
        "credit": find("credit", "deposit", "abono", "crédito", "credito"),
        "account": find("account", "account name", "cuenta"),
        "category": find("category", "categoría", "categoria"),
        "external_id": find("external id", "transaction id", "reference", "id"),
    }


def expire_pending_previews(session: Session) -> int:
    cutoff = datetime.now(UTC) - timedelta(hours=PREVIEW_HOURS)
    batches = session.scalars(
        select(ImportBatch).where(
            ImportBatch.status == ImportBatchStatus.PENDING, ImportBatch.created_at < cutoff
        )
    ).all()
    for batch in batches:
        _path(batch.id).unlink(missing_ok=True)
        batch.status = ImportBatchStatus.EXPIRED
        batch.completed_at = datetime.now(UTC)
    if batches:
        session.flush()
    return len(batches)


def create_preview(session: Session, filename: str, content: bytes) -> PreviewResult:
    expire_pending_previews(session)
    if not content:
        raise DomainValidationError("Choose a non-empty CSV file.", "file")
    if len(content) > MAX_UPLOAD_BYTES:
        raise DomainValidationError("CSV files may not exceed 5 MiB.", "file")
    frame, encoding, delimiter = _read(content)
    preview_id = str(uuid4())
    path = _path(preview_id)
    try:
        path.write_bytes(content)
        fingerprint = hashlib.sha256(content).hexdigest()
        duplicate_file = session.scalar(
            select(ImportBatch.id)
            .where(
                ImportBatch.file_fingerprint == fingerprint,
                ImportBatch.status == ImportBatchStatus.COMMITTED,
            )
            .limit(1)
        )
        batch = ImportBatch(
            id=preview_id,
            filename=_safe_filename(filename),
            file_fingerprint=fingerprint,
            status=ImportBatchStatus.PENDING,
        )
        session.add(batch)
        session.flush()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    rows = [
        {column: str(value) for column, value in row.items()} for row in frame.head(20).to_dicts()
    ]
    return PreviewResult(
        preview_id=preview_id,
        filename=batch.filename,
        encoding=encoding,
        delimiter=delimiter,
        columns=list(frame.columns),
        sample_rows=rows,
        mapping_suggestions=_suggest(frame.columns),
        issues=["This file was imported before; row duplicates will still be checked."]
        if duplicate_file
        else [],
    )


def _load_batch(session: Session, preview_id: str) -> ImportBatch:
    expire_pending_previews(session)
    batch = session.get(ImportBatch, preview_id)
    if batch is None or batch.status == ImportBatchStatus.EXPIRED:
        raise NotFoundError("Import preview not found or expired.")
    return batch


def _frame_for(batch: ImportBatch) -> pl.DataFrame:
    path = _path(batch.id)
    if not path.exists():
        raise NotFoundError("Import preview file is no longer available.")
    frame, _, _ = _read(path.read_bytes())
    return frame


def _date(value: str, selected: str) -> date:
    formats = {"iso": "%Y-%m-%d", "day_first": "%d/%m/%Y", "month_first": "%m/%d/%Y"}
    return datetime.strptime(value.strip(), formats[selected]).date()


def _decimal(value: str, separator: str) -> Decimal:
    stripped = value.strip()
    pattern = (
        r"[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"
        if separator == "dot"
        else r"[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?"
    )
    if not re.fullmatch(pattern, stripped):
        raise InvalidOperation
    normalized = (
        stripped.replace(",", "")
        if separator == "dot"
        else stripped.replace(".", "").replace(",", ".")
    )
    return Decimal(normalized)


def _minor_units(value: Decimal) -> int:
    return int((value * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _normalized_description(value: str) -> str:
    return " ".join(value.casefold().split())


def _fallback_fingerprint(row: ImportRow) -> str:
    raw = "|".join(
        [
            str(row.financial_account_id),
            row.transaction_date.isoformat() if row.transaction_date else "",
            row.direction or "",
            str(row.amount_minor),
            _normalized_description(row.description),
        ]
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def _required_columns(mapping: ImportMapping) -> list[str | None]:
    amount = (
        [mapping.amount_column]
        if mapping.amount_mode == "signed"
        else [mapping.debit_column, mapping.credit_column]
    )
    account = [mapping.account_column] if mapping.account_mode == "column" else []
    return [mapping.date_column, mapping.description_column, *amount, *account]


def _validate_mapping(frame: pl.DataFrame, mapping: ImportMapping) -> None:
    missing = [
        column for column in _required_columns(mapping) if not column or column not in frame.columns
    ]
    optional = [mapping.category_column, mapping.external_id_column]
    missing.extend(column for column in optional if column and column not in frame.columns)
    if missing:
        raise DomainValidationError("Every mapped column must exist in the CSV.", "mapping")
    if mapping.account_mode == "fixed" and mapping.financial_account_id is None:
        raise DomainValidationError("Choose a financial account.", "financial_account_id")


def validate_preview(session: Session, preview_id: str, mapping: ImportMapping) -> ValidationResult:
    batch = _load_batch(session, preview_id)
    if batch.status == ImportBatchStatus.COMMITTED:
        raise DomainValidationError("This import has already been committed.")
    frame = _frame_for(batch)
    _validate_mapping(frame, mapping)
    accounts = session.scalars(
        select(FinancialAccount).where(FinancialAccount.is_active.is_(True))
    ).all()
    categories = session.scalars(select(Category).where(Category.is_active.is_(True))).all()
    accounts_by_name = {account.name.strip().casefold(): account for account in accounts}
    categories_by_name = {category.name.strip().casefold(): category for category in categories}
    defaults = {category.direction: category for category in categories if category.is_default}
    fixed_account = (
        session.get(FinancialAccount, mapping.financial_account_id)
        if mapping.financial_account_id
        else None
    )
    if mapping.account_mode == "fixed" and (fixed_account is None or not fixed_account.is_active):
        raise DomainValidationError("Choose an active financial account.", "financial_account_id")
    existing_external = {
        (account_id, external_id.strip())
        for account_id, external_id in session.execute(
            select(Transaction.financial_account_id, Transaction.external_id).where(
                Transaction.external_id.is_not(None)
            )
        )
        if external_id
    }
    existing_fingerprints = set(
        session.scalars(
            select(Transaction.import_fingerprint).where(
                Transaction.import_fingerprint.is_not(None)
            )
        ).all()
    )
    seen: set[tuple[str, object]] = set()
    result_rows: list[ImportRow] = []
    for index, raw in enumerate(frame.to_dicts(), start=2):
        row = ImportRow(row_number=index)
        try:
            row.transaction_date = _date(str(raw[mapping.date_column]), mapping.date_format)
        except (ValueError, KeyError):
            row.issues.append("Date does not match the selected format.")
        row.description = str(raw.get(mapping.description_column, "")).strip()
        if not row.description:
            row.issues.append("Description is required.")
        elif len(row.description) > 250:
            row.issues.append("Description may not exceed 250 characters.")
        try:
            if mapping.amount_mode == "signed":
                amount = _decimal(
                    str(raw.get(mapping.amount_column or "", "")), mapping.decimal_separator
                )
                if amount == 0:
                    row.issues.append("Amount must not be zero.")
                else:
                    row.direction = "income" if amount > 0 else "expense"
                    row.amount_minor = abs(_minor_units(amount))
            else:
                debit_text = str(raw.get(mapping.debit_column or "", "")).strip()
                credit_text = str(raw.get(mapping.credit_column or "", "")).strip()
                debit = (
                    _decimal(debit_text, mapping.decimal_separator) if debit_text else Decimal(0)
                )
                credit = (
                    _decimal(credit_text, mapping.decimal_separator) if credit_text else Decimal(0)
                )
                if (debit > 0) == (credit > 0) or debit < 0 or credit < 0:
                    row.issues.append("Exactly one positive debit or credit amount is required.")
                else:
                    row.direction = "expense" if debit > 0 else "income"
                    row.amount_minor = _minor_units(debit or credit)
        except InvalidOperation:
            row.issues.append("Amount does not match the selected decimal convention.")
        if row.amount_minor == 0 and "Amount must not be zero." not in row.issues:
            row.issues.append("Amount must not be zero.")
        account = fixed_account
        if mapping.account_mode == "column":
            name = str(raw.get(mapping.account_column or "", "")).strip()
            account = accounts_by_name.get(name.casefold())
            if account is None:
                row.issues.append("Financial account is blank, unknown, or inactive.")
        if account:
            row.financial_account_id, row.financial_account_name = account.id, account.name
        if row.direction:
            direction = CategoryDirection(row.direction)
            category_text = (
                str(raw.get(mapping.category_column or "", "")).strip()
                if mapping.category_column
                else ""
            )
            category = (
                categories_by_name.get(category_text.casefold())
                if category_text
                else defaults.get(direction)
            )
            if category is None:
                row.issues.append(
                    "Category is blank without an active default, unknown, or inactive."
                )
            elif category.direction != direction:
                row.issues.append("Category direction does not match the transaction direction.")
            else:
                row.category_id, row.category_name = category.id, category.name
        external = (
            str(raw.get(mapping.external_id_column or "", "")).strip()
            if mapping.external_id_column
            else ""
        )
        row.external_id = external or None
        if (
            row.financial_account_id
            and row.transaction_date
            and row.amount_minor
            and row.direction
            and row.description
        ):
            row.fingerprint = _fallback_fingerprint(row)
            key: tuple[str, object] = (
                ("external", (row.financial_account_id, row.external_id))
                if row.external_id
                else ("fingerprint", row.fingerprint)
            )
            database_duplicate = (
                (row.financial_account_id, row.external_id) in existing_external
                if row.external_id
                else row.fingerprint in existing_fingerprints
            )
            if database_duplicate:
                row.duplicate, row.duplicate_reason = (
                    True,
                    "external_id" if row.external_id else "fingerprint",
                )
            elif key in seen:
                row.duplicate, row.duplicate_reason = True, "in_file"
            elif not row.issues:
                seen.add(key)
        result_rows.append(row)
    return ValidationResult(
        preview_id=preview_id,
        total_rows=len(result_rows),
        valid_count=sum(row.eligible for row in result_rows),
        duplicate_count=sum(row.duplicate for row in result_rows),
        invalid_count=sum(bool(row.issues) for row in result_rows),
        rows=result_rows,
    )


def commit_preview(
    session: Session, preview_id: str, mapping: ImportMapping, selected_row_numbers: list[int]
) -> CommitResult:
    batch = _load_batch(session, preview_id)
    if batch.status == ImportBatchStatus.COMMITTED:
        return CommitResult(
            batch.id,
            batch.status.value,
            batch.imported_count,
            batch.skipped_count,
            batch.failed_count,
        )
    validation = validate_preview(session, preview_id, mapping)
    selected = set(selected_row_numbers)
    eligible = {row.row_number: row for row in validation.rows if row.eligible}
    if not selected:
        raise DomainValidationError("Select at least one eligible row.", "selected_row_numbers")
    if not selected.issubset(eligible):
        raise DomainValidationError(
            "Only eligible non-duplicate rows may be selected.", "selected_row_numbers"
        )
    try:
        with session.begin_nested():
            for row_number in sorted(selected):
                row = eligible[row_number]
                session.add(
                    Transaction(
                        financial_account_id=row.financial_account_id,
                        category_id=row.category_id,
                        transaction_date=row.transaction_date,
                        kind=TransactionKind(row.direction),
                        amount_minor=row.amount_minor,
                        description=row.description,
                        external_id=row.external_id,
                        import_fingerprint=None if row.external_id else row.fingerprint,
                        import_batch_id=batch.id,
                        source=TransactionSource.CSV_IMPORT,
                    )
                )
            batch.imported_count = len(selected)
            batch.skipped_count = (
                validation.duplicate_count + validation.valid_count - len(selected)
            )
            batch.failed_count = validation.invalid_count
            batch.status = ImportBatchStatus.COMMITTED
            batch.completed_at = datetime.now(UTC)
            session.flush()
    except Exception:
        session.expire(batch)
        raise
    _path(batch.id).unlink(missing_ok=True)
    return CommitResult(
        batch.id, batch.status.value, batch.imported_count, batch.skipped_count, batch.failed_count
    )


def list_import_batches(session: Session) -> list[ImportBatch]:
    expire_pending_previews(session)
    return list(
        session.scalars(
            select(ImportBatch).order_by(ImportBatch.created_at.desc(), ImportBatch.id.desc())
        )
    )
