from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    AccountKind,
    Category,
    CategoryDirection,
    FinancialAccount,
    ImportBatch,
    ImportBatchStatus,
    Transaction,
    TransactionSource,
)
from app.services.imports import (
    MAX_UPLOAD_BYTES,
    ImportMapping,
    commit_preview,
    create_preview,
    expire_pending_previews,
    validate_preview,
)
from app.services.reference_data import DomainValidationError


@pytest.fixture
def references(session: Session) -> tuple[FinancialAccount, Category, Category]:
    account = FinancialAccount(
        name="Checking",
        kind=AccountKind.CHECKING,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    income = Category(name="Salary", direction=CategoryDirection.INCOME, is_default=True)
    expense = Category(name="Everyday", direction=CategoryDirection.EXPENSE, is_default=True)
    session.add_all([account, income, expense])
    session.flush()
    return account, income, expense


def signed_mapping(account_id: int) -> ImportMapping:
    return ImportMapping(
        date_column="Date",
        description_column="Description",
        amount_mode="signed",
        amount_column="Amount",
        date_format="iso",
        decimal_separator="dot",
        account_mode="fixed",
        financial_account_id=account_id,
        category_column="Category",
        external_id_column="External ID",
    )


def test_preview_detects_encoding_delimiter_sanitizes_and_enforces_bounds(
    session: Session, references: tuple[FinancialAccount, Category, Category], monkeypatch, tmp_path
) -> None:
    monkeypatch.setenv("POCKETCOIN_DATA_DIR", str(tmp_path))
    content = "Date;Description;Debit;Credit\n12/07/2026;Caf\xe9;1.234,56;\n".encode("cp1252")

    preview = create_preview(session, "../../statement.csv", content)

    assert preview.filename == "statement.csv"
    assert preview.encoding == "windows-1252"
    assert preview.delimiter == ";"
    assert preview.columns == ["Date", "Description", "Debit", "Credit"]
    assert preview.sample_rows[0]["Description"] == "Café"
    assert (tmp_path / "imports" / "tmp" / f"{preview.preview_id}.csv").exists()
    with pytest.raises(DomainValidationError, match="5 MiB"):
        create_preview(session, "large.csv", b"x" * (MAX_UPLOAD_BYTES + 1))


def test_signed_validation_resolves_defaults_and_flags_database_and_file_duplicates(
    session: Session,
    references: tuple[FinancialAccount, Category, Category],
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("POCKETCOIN_DATA_DIR", str(tmp_path))
    account, _, expense = references
    session.add(
        Transaction(
            financial_account_id=account.id,
            category_id=expense.id,
            transaction_date=date(2026, 7, 1),
            kind="expense",
            amount_minor=1000,
            description="Existing",
            external_id="bank-1",
        )
    )
    session.flush()
    csv = (
        b"Date,Description,Amount,Category,External ID\n"
        b"2026-07-01,Existing,-10.00,Everyday,bank-1\n"
        b"2026-07-02,Coffee,-4.25,,\n"
        b"2026-07-02, Coffee ,-4.25,,\n"
        b"bad-date,,-0.00,Missing,\n"
    )
    preview = create_preview(session, "signed.csv", csv)

    result = validate_preview(session, preview.preview_id, signed_mapping(account.id))

    assert (
        result.total_rows,
        result.valid_count,
        result.duplicate_count,
        result.invalid_count,
    ) == (
        4,
        1,
        2,
        1,
    )
    assert result.rows[0].duplicate_reason == "external_id"
    assert result.rows[1].eligible is True
    assert result.rows[1].category_name == "Everyday"
    assert result.rows[2].duplicate_reason == "in_file"
    assert {issue for issue in result.rows[3].issues} >= {
        "Date does not match the selected format.",
        "Description is required.",
        "Amount must not be zero.",
    }


def test_debit_credit_comma_decimal_and_transactional_idempotent_commit(
    session: Session,
    references: tuple[FinancialAccount, Category, Category],
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("POCKETCOIN_DATA_DIR", str(tmp_path))
    account, _, _ = references
    content = (
        "Date;Description;Debit;Credit;Category\n"
        "31/01/2026;Groceries;1.234,56;;Everyday\n"
        "01/02/2026;Pay;;;Salary\n"
        "02/02/2026;Conflict;2,00;3,00;Everyday\n"
    ).encode("utf-8-sig")
    preview = create_preview(session, "debits.csv", content)
    mapping = ImportMapping(
        date_column="Date",
        description_column="Description",
        amount_mode="debit_credit",
        debit_column="Debit",
        credit_column="Credit",
        date_format="day_first",
        decimal_separator="comma",
        account_mode="fixed",
        financial_account_id=account.id,
        category_column="Category",
    )
    validated = validate_preview(session, preview.preview_id, mapping)
    assert validated.rows[0].amount_minor == 123456
    assert validated.rows[0].direction == "expense"
    assert validated.rows[1].issues == ["Exactly one positive debit or credit amount is required."]
    assert validated.rows[2].issues == ["Exactly one positive debit or credit amount is required."]

    summary = commit_preview(session, preview.preview_id, mapping, [2])
    repeated = commit_preview(session, preview.preview_id, mapping, [2])
    imported = session.scalars(
        select(Transaction).where(Transaction.import_batch_id == preview.preview_id)
    ).all()

    assert summary == repeated
    assert (summary.imported_count, summary.skipped_count, summary.failed_count) == (1, 0, 2)
    assert imported[0].source == TransactionSource.CSV_IMPORT
    assert imported[0].import_fingerprint
    assert not (tmp_path / "imports" / "tmp" / f"{preview.preview_id}.csv").exists()


def test_commit_failure_rolls_back_rows_and_completion(
    session: Session,
    references: tuple[FinancialAccount, Category, Category],
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("POCKETCOIN_DATA_DIR", str(tmp_path))
    account, _, _ = references
    preview = create_preview(
        session,
        "failure.csv",
        b"Date,Description,Amount,Category,External ID\n2026-07-04,Coffee,-2.00,Everyday,x-1\n",
    )
    mapping = signed_mapping(account.id)

    def fail_transaction_insert(_mapper, _connection, target) -> None:
        if target.source == TransactionSource.CSV_IMPORT:
            raise SQLAlchemyError("forced insert failure")

    event.listen(Transaction, "before_insert", fail_transaction_insert)
    try:
        with pytest.raises(SQLAlchemyError, match="forced insert failure"):
            commit_preview(session, preview.preview_id, mapping, [2])
    finally:
        event.remove(Transaction, "before_insert", fail_transaction_insert)

    session.expire_all()
    batch = session.get(ImportBatch, preview.preview_id)
    assert batch is not None and batch.status == ImportBatchStatus.PENDING
    assert (
        session.scalar(
            select(Transaction.id).where(Transaction.import_batch_id == preview.preview_id)
        )
        is None
    )
    assert (tmp_path / "imports" / "tmp" / f"{preview.preview_id}.csv").exists()


def test_expiry_marks_pending_batch_and_removes_file(
    session: Session,
    references: tuple[FinancialAccount, Category, Category],
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("POCKETCOIN_DATA_DIR", str(tmp_path))
    preview = create_preview(session, "old.csv", b"Date,Description,Amount\n2026-01-01,A,-1\n")
    batch = session.get(ImportBatch, preview.preview_id)
    assert batch is not None
    batch.created_at = datetime.now().astimezone() - timedelta(hours=25)
    session.flush()

    assert expire_pending_previews(session) == 1
    assert batch.status == ImportBatchStatus.EXPIRED
    assert not (tmp_path / "imports" / "tmp" / f"{preview.preview_id}.csv").exists()
