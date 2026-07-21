from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class AccountKind(StrEnum):
    CASH = "cash"
    CHECKING = "checking"
    SAVINGS = "savings"
    CREDIT_CARD = "credit_card"
    OVERDRAFT = "overdraft"
    LOAN = "loan"


class CategoryDirection(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class Theme(StrEnum):
    SYSTEM = "system"
    LIGHT = "light"
    DARK = "dark"


class TransactionKind(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER_IN = "transfer_in"
    TRANSFER_OUT = "transfer_out"


class TransactionSource(StrEnum):
    MANUAL = "manual"
    CSV_IMPORT = "csv_import"
    PLANNED_PAYMENT = "planned_payment"


class PlannedPaymentStatus(StrEnum):
    PENDING = "pending"
    PAID = "paid"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class PlannedPaymentRecurrence(StrEnum):
    NONE = "none"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class ImportBatchStatus(StrEnum):
    PENDING = "pending"
    COMMITTED = "committed"
    EXPIRED = "expired"


class FinancialAccount(Base):
    __tablename__ = "financial_accounts"
    __table_args__ = (CheckConstraint("opening_balance_minor >= 0"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[AccountKind] = mapped_column(Enum(AccountKind, native_enum=False), nullable=False)
    opening_balance_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    opening_balance_date: Mapped[date] = mapped_column(Date, nullable=False)
    credit_limit_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        Index(
            "uq_categories_active_name_direction",
            func.lower(text("name")),
            "direction",
            unique=True,
            sqlite_where=text("is_active = 1"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    direction: Mapped[CategoryDirection] = mapped_column(
        Enum(CategoryDirection, native_enum=False), nullable=False
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        Index(
            "uq_tags_active_name",
            func.lower(text("name")),
            unique=True,
            sqlite_where=text("is_active = 1"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class AppSetting(Base):
    __tablename__ = "app_settings"
    __table_args__ = (CheckConstraint("id = 1"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CRC")
    locale: Mapped[str] = mapped_column(String(35), nullable=False, default="es-CR")
    first_day_of_week: Mapped[str] = mapped_column(String(9), nullable=False, default="monday")
    theme: Mapped[Theme] = mapped_column(
        Enum(Theme, native_enum=False), nullable=False, default=Theme.SYSTEM
    )


transaction_tags = Table(
    "transaction_tags",
    Base.metadata,
    Column("transaction_id", ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="RESTRICT"), primary_key=True),
)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount_minor > 0"),
        CheckConstraint(
            "is_debt_payment = 0 OR kind = 'EXPENSE'",
            name="ck_transactions_debt_expense_only",
        ),
        CheckConstraint(
            "(kind IN ('TRANSFER_IN', 'TRANSFER_OUT') AND category_id IS NULL) "
            "OR (kind IN ('INCOME', 'EXPENSE') AND category_id IS NOT NULL)"
        ),
        UniqueConstraint(
            "planned_payment_id", "scheduled_for", name="uq_transactions_planned_occurrence"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    financial_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    kind: Mapped[TransactionKind] = mapped_column(
        Enum(TransactionKind, native_enum=False), nullable=False, index=True
    )
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(250), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(2_000), nullable=True)
    transfer_group_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    external_id: Mapped[str | None] = mapped_column(String(250), nullable=True)
    import_fingerprint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    import_batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    planned_payment_id: Mapped[int | None] = mapped_column(
        ForeignKey("planned_payments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    scheduled_for: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_debt_payment: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    source: Mapped[TransactionSource] = mapped_column(
        Enum(TransactionSource, native_enum=False), nullable=False, default=TransactionSource.MANUAL
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[ImportBatchStatus] = mapped_column(
        Enum(ImportBatchStatus, native_enum=False),
        nullable=False,
        default=ImportBatchStatus.PENDING,
        index=True,
    )
    imported_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        CheckConstraint("limit_minor > 0"),
        Index("uq_budgets_category_month", "category_id", "month", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    month: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    limit_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class PlannedPayment(Base):
    __tablename__ = "planned_payments"
    __table_args__ = (CheckConstraint("amount_minor > 0"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    financial_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    direction: Mapped[CategoryDirection] = mapped_column(
        Enum(CategoryDirection, native_enum=False), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[PlannedPaymentStatus] = mapped_column(
        Enum(PlannedPaymentStatus, native_enum=False),
        nullable=False,
        default=PlannedPaymentStatus.PENDING,
        index=True,
    )
    recurrence: Mapped[PlannedPaymentRecurrence] = mapped_column(
        Enum(PlannedPaymentRecurrence, native_enum=False),
        nullable=False,
        default=PlannedPaymentRecurrence.NONE,
    )
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    anchor_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_debt_payment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(String(2_000), nullable=True)
    last_paid_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    @property
    def needs_attention(self) -> bool:
        return (
            self.status == PlannedPaymentStatus.PENDING
            and self.recurrence != PlannedPaymentRecurrence.NONE
            and self.category_id is None
        )


planned_payment_tags = Table(
    "planned_payment_tags",
    Base.metadata,
    Column(
        "planned_payment_id",
        ForeignKey("planned_payments.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("tag_id", ForeignKey("tags.id", ondelete="RESTRICT"), primary_key=True),
)
