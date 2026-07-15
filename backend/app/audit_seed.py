import argparse
import os
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    AccountKind,
    AppSetting,
    Budget,
    Category,
    CategoryDirection,
    FinancialAccount,
    PlannedPayment,
    PlannedPaymentRecurrence,
    PlannedPaymentStatus,
    Tag,
    Theme,
    Transaction,
    TransactionKind,
    TransactionSource,
    transaction_tags,
)
from app.services.reference_data import ensure_seed_data

AUDIT_MARKER = "PocketCoin deterministic audit fixture"


def require_audit_environment() -> None:
    if os.getenv("POCKETCOIN_AUDIT_DATA") != "1":
        raise RuntimeError(
            "Refusing to seed audit data. Set POCKETCOIN_AUDIT_DATA=1 explicitly."
        )
    if not os.getenv("POCKETCOIN_DATA_DIR"):
        raise RuntimeError("POCKETCOIN_DATA_DIR must point to an isolated audit directory.")


def _transaction(
    account: FinancialAccount,
    category: Category | None,
    transaction_date: date,
    kind: TransactionKind,
    amount_minor: int,
    description: str,
    created_at: datetime,
    *,
    notes: str | None = None,
    transfer_group_id: str | None = None,
) -> Transaction:
    return Transaction(
        financial_account_id=account.id,
        category_id=category.id if category else None,
        transaction_date=transaction_date,
        kind=kind,
        amount_minor=amount_minor,
        description=description,
        notes=notes,
        transfer_group_id=transfer_group_id,
        source=TransactionSource.MANUAL,
        created_at=created_at,
        updated_at=created_at,
    )


def seed_audit_data(session: Session, reference_date: date) -> None:
    marker = session.scalar(select(Transaction).where(Transaction.description == AUDIT_MARKER))
    if marker is not None:
        if marker.notes != reference_date.isoformat():
            raise RuntimeError("Audit data already exists for a different reference date.")
        return
    if session.scalar(select(func.count()).select_from(Transaction)):
        raise RuntimeError("Refusing to mix deterministic audit data with existing transactions.")
    if session.scalar(select(func.count()).select_from(Budget)) or session.scalar(
        select(func.count()).select_from(PlannedPayment)
    ):
        raise RuntimeError("Refusing to mix deterministic audit data with existing feature data.")

    ensure_seed_data(session)
    created_at = datetime.combine(reference_date, datetime.min.time(), tzinfo=UTC)
    settings = session.get(AppSetting, 1)
    assert settings is not None
    settings.base_currency = "CRC"
    settings.locale = "es-CR"
    settings.first_day_of_week = "monday"
    settings.theme = Theme.SYSTEM

    cash = session.scalar(select(FinancialAccount).where(FinancialAccount.kind == AccountKind.CASH))
    assert cash is not None
    cash.name = "Audit Cash"
    cash.opening_balance_minor = 150_000
    cash.opening_balance_date = reference_date - timedelta(days=120)
    cash.created_at = created_at
    cash.updated_at = created_at

    checking = FinancialAccount(
        name="Audit Checking",
        kind=AccountKind.CHECKING,
        opening_balance_minor=850_000,
        opening_balance_date=reference_date - timedelta(days=120),
        created_at=created_at,
        updated_at=created_at,
    )
    savings = FinancialAccount(
        name="Audit Savings",
        kind=AccountKind.SAVINGS,
        opening_balance_minor=400_000,
        opening_balance_date=reference_date - timedelta(days=120),
        created_at=created_at,
        updated_at=created_at,
    )
    credit = FinancialAccount(
        name="Audit Credit Card",
        kind=AccountKind.CREDIT_CARD,
        opening_balance_minor=125_000,
        opening_balance_date=reference_date - timedelta(days=120),
        credit_limit_minor=500_000,
        created_at=created_at,
        updated_at=created_at,
    )
    loan = FinancialAccount(
        name="Audit Personal Loan",
        kind=AccountKind.LOAN,
        opening_balance_minor=1_200_000,
        opening_balance_date=reference_date - timedelta(days=120),
        created_at=created_at,
        updated_at=created_at,
    )
    session.add_all([checking, savings, credit, loan])

    categories = {
        "salary": Category(
            name="Audit Salary", direction=CategoryDirection.INCOME,
            created_at=created_at, updated_at=created_at,
        ),
        "freelance": Category(
            name="Audit Freelance", direction=CategoryDirection.INCOME,
            created_at=created_at, updated_at=created_at,
        ),
        "groceries": Category(
            name="Audit Groceries", direction=CategoryDirection.EXPENSE,
            created_at=created_at, updated_at=created_at,
        ),
        "housing": Category(
            name="Audit Housing", direction=CategoryDirection.EXPENSE,
            created_at=created_at, updated_at=created_at,
        ),
        "transport": Category(
            name="Audit Transport", direction=CategoryDirection.EXPENSE,
            created_at=created_at, updated_at=created_at,
        ),
        "debt": Category(
            name="Audit Debt Payment", direction=CategoryDirection.EXPENSE,
            created_at=created_at, updated_at=created_at,
        ),
    }
    tags = {
        "essential": Tag(name="Audit Essential", created_at=created_at, updated_at=created_at),
        "work": Tag(name="Audit Work", created_at=created_at, updated_at=created_at),
    }
    session.add_all([*categories.values(), *tags.values()])
    session.flush()

    rows = [
        _transaction(
            checking,
            categories["salary"],
            reference_date - timedelta(days=73),
            TransactionKind.INCOME,
            1_250_000,
            "Audit salary April",
            created_at,
        ),
        _transaction(
            checking,
            categories["salary"],
            reference_date - timedelta(days=43),
            TransactionKind.INCOME,
            1_250_000,
            "Audit salary May",
            created_at,
        ),
        _transaction(
            checking,
            categories["salary"],
            reference_date - timedelta(days=13),
            TransactionKind.INCOME,
            1_250_000,
            "Audit salary June",
            created_at,
        ),
        _transaction(
            checking,
            categories["freelance"],
            reference_date - timedelta(days=8),
            TransactionKind.INCOME,
            180_000,
            "Audit freelance project",
            created_at,
        ),
        _transaction(
            checking,
            categories["housing"],
            reference_date - timedelta(days=72),
            TransactionKind.EXPENSE,
            420_000,
            "Audit rent April",
            created_at,
        ),
        _transaction(
            checking,
            categories["housing"],
            reference_date - timedelta(days=42),
            TransactionKind.EXPENSE,
            420_000,
            "Audit rent May",
            created_at,
        ),
        _transaction(
            checking,
            categories["housing"],
            reference_date - timedelta(days=12),
            TransactionKind.EXPENSE,
            420_000,
            "Audit rent June",
            created_at,
        ),
        _transaction(
            credit,
            categories["groceries"],
            reference_date - timedelta(days=9),
            TransactionKind.EXPENSE,
            72_500,
            "Audit supermarket",
            created_at,
        ),
        _transaction(
            cash,
            categories["transport"],
            reference_date - timedelta(days=4),
            TransactionKind.EXPENSE,
            18_000,
            "Audit transport",
            created_at,
        ),
        _transaction(
            checking,
            None,
            reference_date - timedelta(days=6),
            TransactionKind.TRANSFER_OUT,
            100_000,
            "Audit savings transfer",
            created_at,
            transfer_group_id="00000000-0000-0000-0000-000000000001",
        ),
        _transaction(
            savings,
            None,
            reference_date - timedelta(days=6),
            TransactionKind.TRANSFER_IN,
            100_000,
            "Audit savings transfer",
            created_at,
            transfer_group_id="00000000-0000-0000-0000-000000000001",
        ),
        _transaction(
            checking,
            categories["groceries"],
            reference_date,
            TransactionKind.EXPENSE,
            1,
            AUDIT_MARKER,
            created_at,
            notes=reference_date.isoformat(),
        ),
    ]
    session.add_all(rows)
    session.flush()
    session.execute(
        transaction_tags.insert(),
        [
            {"transaction_id": rows[3].id, "tag_id": tags["work"].id},
            {"transaction_id": rows[7].id, "tag_id": tags["essential"].id},
            {"transaction_id": rows[8].id, "tag_id": tags["essential"].id},
        ],
    )

    month = reference_date.replace(day=1)
    session.add_all(
        [
            Budget(
                category_id=categories["groceries"].id, month=month, limit_minor=300_000,
                created_at=created_at, updated_at=created_at,
            ),
            Budget(
                category_id=categories["housing"].id, month=month, limit_minor=450_000,
                created_at=created_at, updated_at=created_at,
            ),
            PlannedPayment(
                financial_account_id=checking.id,
                category_id=categories["housing"].id,
                title="Audit next rent",
                direction=CategoryDirection.EXPENSE,
                amount_minor=420_000,
                due_date=reference_date + timedelta(days=18),
                status=PlannedPaymentStatus.PENDING,
                recurrence=PlannedPaymentRecurrence.MONTHLY,
                is_debt_payment=False,
                notes="Deterministic monthly expense",
                created_at=created_at,
                updated_at=created_at,
            ),
            PlannedPayment(
                financial_account_id=checking.id,
                category_id=categories["debt"].id,
                title="Audit credit payment",
                direction=CategoryDirection.EXPENSE,
                amount_minor=95_000,
                due_date=reference_date + timedelta(days=7),
                status=PlannedPaymentStatus.PENDING,
                recurrence=PlannedPaymentRecurrence.MONTHLY,
                is_debt_payment=True,
                notes="Deterministic recurring debt",
                created_at=created_at,
                updated_at=created_at,
            ),
            PlannedPayment(
                financial_account_id=checking.id,
                category_id=categories["salary"].id,
                title="Audit next salary",
                direction=CategoryDirection.INCOME,
                amount_minor=1_250_000,
                due_date=reference_date + timedelta(days=17),
                status=PlannedPaymentStatus.PENDING,
                recurrence=PlannedPaymentRecurrence.MONTHLY,
                is_debt_payment=False,
                created_at=created_at,
                updated_at=created_at,
            ),
        ]
    )
    session.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed deterministic PocketCoin audit data.")
    parser.add_argument("--reference-date", required=True, type=date.fromisoformat)
    args = parser.parse_args()
    require_audit_environment()
    with SessionLocal.begin() as session:
        seed_audit_data(session, args.reference_date)
    print(f"Audit data ready for reference date {args.reference_date.isoformat()}.")


if __name__ == "__main__":
    main()
