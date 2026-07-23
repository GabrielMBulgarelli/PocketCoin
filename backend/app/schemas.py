from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import (
    AccountKind,
    CategoryDirection,
    ImportBatchStatus,
    PlannedPaymentRecurrence,
    PlannedPaymentStatus,
    Theme,
    TransactionKind,
    TransactionSource,
)


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SettingsRead(Schema):
    id: int
    base_currency: str
    locale: str
    first_day_of_week: str
    theme: Theme


class SettingsUpdate(BaseModel):
    base_currency: str | None = Field(default=None, min_length=3, max_length=3)
    locale: str | None = Field(default=None, min_length=2, max_length=35)
    first_day_of_week: str | None = None
    theme: Theme | None = None

    @field_validator("base_currency")
    @classmethod
    def uppercase_currency(cls, value: str | None) -> str | None:
        return value.upper() if value else value

    @field_validator("first_day_of_week")
    @classmethod
    def valid_first_day(cls, value: str | None) -> str | None:
        if value is not None and value.lower() not in {"monday", "sunday"}:
            raise ValueError("must be monday or sunday")
        return value.lower() if value else value


class BackupRead(BaseModel):
    id: str
    created_at: datetime
    size_bytes: int
    reason: str


class RestoreBackupRequest(BaseModel):
    confirmation: str


class RestoreBackupRead(BaseModel):
    restored_backup_id: str
    pre_restore_backup: BackupRead


class FinancialAccountRead(Schema):
    id: int
    name: str
    kind: AccountKind
    opening_balance_minor: int
    opening_balance_date: date
    credit_limit_minor: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FinancialAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: AccountKind
    opening_balance_minor: int = Field(ge=0)
    opening_balance_date: date
    credit_limit_minor: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def credit_limit_matches_kind(self) -> "FinancialAccountCreate":
        if self.credit_limit_minor is not None and self.kind not in {
            AccountKind.CREDIT_CARD,
            AccountKind.OVERDRAFT,
        }:
            raise ValueError("credit_limit_minor is only valid for credit cards and overdrafts")
        return self


class FinancialAccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    kind: AccountKind | None = None
    opening_balance_minor: int | None = Field(default=None, ge=0)
    opening_balance_date: date | None = None
    credit_limit_minor: int | None = Field(default=None, gt=0)
    is_active: bool | None = None


class CategoryRead(Schema):
    id: int
    name: str
    direction: CategoryDirection
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    direction: CategoryDirection


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_active: bool | None = None


class TagRead(Schema):
    id: int
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_active: bool | None = None


class TransactionRead(Schema):
    id: int
    financial_account_id: int | None
    category_id: int | None
    transaction_date: date
    kind: TransactionKind
    amount_minor: int
    description: str
    notes: str | None
    transfer_group_id: str | None
    source: TransactionSource
    planned_payment_id: int | None
    scheduled_for: date | None
    is_debt_payment: bool
    created_at: datetime
    updated_at: datetime


class RecentActivityRead(Schema):
    id: int
    transaction_date: date
    kind: Literal["income", "expense", "transfer"]
    amount_minor: int
    description: str
    category_id: int | None
    financial_account_id: int | None
    transfer_group_id: str | None
    from_account_id: int | None
    to_account_id: int | None


class RecurrenceCreate(BaseModel):
    frequency: PlannedPaymentRecurrence
    end_date: date | None = None
    is_debt_payment: bool | None = None

    @field_validator("frequency")
    @classmethod
    def frequency_must_repeat(cls, value: PlannedPaymentRecurrence) -> PlannedPaymentRecurrence:
        if value == PlannedPaymentRecurrence.NONE:
            raise ValueError("frequency must be weekly, monthly, or yearly")
        return value


class TransactionCreate(BaseModel):
    financial_account_id: int | None = None
    category_id: int
    transaction_date: date
    kind: TransactionKind
    amount_minor: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=250)
    notes: str | None = Field(default=None, max_length=2_000)
    tag_ids: list[int] = Field(default_factory=list)
    is_debt_payment: bool | None = None
    recurrence: RecurrenceCreate | None = None

    @model_validator(mode="after")
    def debt_is_expense_and_inputs_agree(self) -> "TransactionCreate":
        legacy = self.recurrence.is_debt_payment if self.recurrence else None
        if self.is_debt_payment is not None and legacy is not None:
            if self.is_debt_payment != legacy:
                raise ValueError("Conflicting debt payment values")
        if self.resolved_is_debt_payment and self.kind != TransactionKind.EXPENSE:
            raise ValueError("Debt payment is only valid for expenses")
        return self

    @property
    def resolved_is_debt_payment(self) -> bool:
        if self.is_debt_payment is not None:
            return self.is_debt_payment
        if self.recurrence and self.recurrence.is_debt_payment is not None:
            return self.recurrence.is_debt_payment
        return False


class TransactionUpdate(BaseModel):
    financial_account_id: int | None = None
    category_id: int | None = None
    transaction_date: date | None = None
    kind: TransactionKind | None = None
    amount_minor: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, min_length=1, max_length=250)
    notes: str | None = Field(default=None, max_length=2_000)
    tag_ids: list[int] | None = None
    is_debt_payment: bool | None = None

    @model_validator(mode="after")
    def debt_is_not_income(self) -> "TransactionUpdate":
        if self.is_debt_payment and self.kind == TransactionKind.INCOME:
            raise ValueError("Debt payment is only valid for expenses")
        return self


class TransactionTimelineRead(BaseModel):
    row_type: Literal["transaction", "scheduled"]
    id: int
    financial_account_id: int | None
    category_id: int | None
    transaction_date: date
    kind: TransactionKind
    amount_minor: int
    description: str
    notes: str | None
    transfer_group_id: str | None
    planned_payment_id: int | None
    scheduled_for: date | None
    recurrence: PlannedPaymentRecurrence | None
    end_date: date | None
    remaining_occurrences: int | None
    is_debt_payment: bool
    needs_attention: bool


class DashboardSummaryRead(BaseModel):
    balance_minor: int
    income_minor: int
    expense_minor: int
    net_minor: int
    savings_rate: float | None


class BalanceForecastRead(BaseModel):
    forecast_start: date
    forecast_end: date
    lookback_start: date
    lookback_end: date
    lookback_days: int
    horizon_days: int
    starting_balance_minor: int
    planned_income_minor: int
    planned_expense_minor: int
    expected_unplanned_spending_minor: int
    ending_balance_minor: int
    historical_expense_minor: int
    historical_transaction_count: int
    average_daily_expense_minor: int
    assumptions: list[str]


class CreditUtilizationRead(BaseModel):
    has_liability_accounts: bool
    has_credit_accounts: bool
    outstanding_debt_minor: int
    total_credit_limit_minor: int
    utilization_percentage: float | None


class CreditAccountUtilizationRead(BaseModel):
    account_id: int
    account_name: str
    credit_limit_minor: int | None
    current_debt_minor: int
    current_percentage: float | None
    average_percentage: float | None
    maximum_percentage: float | None


class RecurringDebtItemRead(BaseModel):
    payment_id: int
    title: str
    recurrence: str
    amount_minor: int
    monthly_amount_minor: int


class RecurringDebtsRead(BaseModel):
    items: list[RecurringDebtItemRead]
    monthly_total_minor: int


class DebtToIncomeRead(BaseModel):
    recurring_debt_minor: int
    additional_debt_minor: int
    monthly_debt_minor: int
    gross_income_minor: int
    ratio_percentage: float | None


class CashFlowPoint(BaseModel):
    date: date
    income_minor: int
    expense_minor: int


class CashFlowStatisticRead(BaseModel):
    count: int
    total_minor: int
    daily_average_minor: int
    average_transaction_minor: int


class CashFlowTableRead(BaseModel):
    period_days: int
    income: CashFlowStatisticRead
    expense: CashFlowStatisticRead
    net_minor: int
    previous_income_minor: int
    previous_expense_minor: int
    previous_net_minor: int
    net_change_minor: int


class CategorySpendingPoint(BaseModel):
    name: str
    amount_minor: int


class PeriodComparisonPoint(BaseModel):
    label: date
    current_minor: int
    previous_minor: int
    prior_year_minor: int


class BudgetRead(Schema):
    id: int
    category_id: int
    month: date
    limit_minor: int
    created_at: datetime
    updated_at: datetime


class BudgetCreate(BaseModel):
    category_id: int
    month: date
    limit_minor: int = Field(gt=0)


class BudgetUpdate(BaseModel):
    limit_minor: int = Field(gt=0)


class BudgetProgressRead(BaseModel):
    id: int
    category_id: int
    category_name: str
    month: date
    limit_minor: int
    spent_minor: int
    remaining_minor: int
    percentage_used: float
    over_budget: bool


class TransferCreate(BaseModel):
    from_account_id: int | None
    to_account_id: int | None
    amount_minor: int = Field(gt=0)
    transaction_date: date
    description: str = Field(min_length=1, max_length=250)
    notes: str | None = Field(default=None, max_length=2_000)

    @model_validator(mode="after")
    def transfer_accounts_differ(self) -> "TransferCreate":
        if self.from_account_id == self.to_account_id:
            raise ValueError("Transfer accounts must differ")
        return self


class PlannedPaymentRead(Schema):
    id: int
    financial_account_id: int | None
    category_id: int | None
    title: str
    direction: CategoryDirection
    amount_minor: int
    due_date: date
    status: PlannedPaymentStatus
    recurrence: PlannedPaymentRecurrence
    end_date: date | None
    is_debt_payment: bool
    notes: str | None
    last_paid_due_date: date | None
    last_transaction_id: int | None
    created_at: datetime
    updated_at: datetime
    needs_attention: bool


class PlannedPaymentCreate(BaseModel):
    financial_account_id: int | None = None
    category_id: int | None = None
    title: str = Field(min_length=1, max_length=250)
    direction: CategoryDirection
    amount_minor: int = Field(gt=0)
    due_date: date
    recurrence: PlannedPaymentRecurrence = PlannedPaymentRecurrence.NONE
    is_debt_payment: bool = False
    notes: str | None = Field(default=None, max_length=2_000)
    end_date: date | None = None
    tag_ids: list[int] = Field(default_factory=list)


class PlannedPaymentUpdate(BaseModel):
    financial_account_id: int | None = None
    category_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=250)
    direction: CategoryDirection | None = None
    amount_minor: int | None = Field(default=None, gt=0)
    due_date: date | None = None
    recurrence: PlannedPaymentRecurrence | None = None
    is_debt_payment: bool | None = None
    notes: str | None = Field(default=None, max_length=2_000)
    status: PlannedPaymentStatus | None = None
    end_date: date | None = None
    tag_ids: list[int] | None = None


class RecurrenceMaterializeRead(BaseModel):
    created_count: int


class PlannedPaymentMarkPaid(BaseModel):
    expected_due_date: date


class PlannedPaymentMarkPaidRead(Schema):
    payment: PlannedPaymentRead
    transaction: TransactionRead | None


class ImportMappingPayload(BaseModel):
    date_column: str
    description_column: str
    amount_mode: str
    date_format: str
    decimal_separator: str
    account_mode: str
    amount_column: str | None = None
    debit_column: str | None = None
    credit_column: str | None = None
    financial_account_id: int | None = None
    account_column: str | None = None
    category_column: str | None = None
    external_id_column: str | None = None


class ImportCommitPayload(ImportMappingPayload):
    selected_row_numbers: list[int]


class ImportPreviewRead(BaseModel):
    preview_id: str
    filename: str
    encoding: str
    delimiter: str
    columns: list[str]
    sample_rows: list[dict[str, str]]
    mapping_suggestions: dict[str, str | None]
    issues: list[str]


class ImportRowRead(BaseModel):
    row_number: int
    transaction_date: date | None
    description: str
    amount_minor: int | None
    direction: str | None
    financial_account_id: int | None
    financial_account_name: str | None
    category_id: int | None
    category_name: str | None
    external_id: str | None
    duplicate: bool
    duplicate_reason: str | None
    issues: list[str]
    eligible: bool


class ImportValidationRead(BaseModel):
    preview_id: str
    total_rows: int
    valid_count: int
    duplicate_count: int
    invalid_count: int
    rows: list[ImportRowRead]


class ImportCommitRead(BaseModel):
    preview_id: str
    status: str
    imported_count: int
    skipped_count: int
    failed_count: int


class ImportBatchRead(Schema):
    id: str
    filename: str
    status: ImportBatchStatus
    imported_count: int
    skipped_count: int
    failed_count: int
    created_at: datetime
    completed_at: datetime | None
