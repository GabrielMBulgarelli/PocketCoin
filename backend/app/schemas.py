from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import AccountKind, CategoryDirection, Theme, TransactionKind, TransactionSource


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
    financial_account_id: int
    category_id: int | None
    transaction_date: date
    kind: TransactionKind
    amount_minor: int
    description: str
    notes: str | None
    transfer_group_id: str | None
    source: TransactionSource
    created_at: datetime
    updated_at: datetime


class TransactionCreate(BaseModel):
    financial_account_id: int
    category_id: int
    transaction_date: date
    kind: TransactionKind
    amount_minor: int = Field(gt=0)
    description: str = Field(min_length=1, max_length=250)
    notes: str | None = Field(default=None, max_length=2_000)


class TransactionUpdate(BaseModel):
    financial_account_id: int | None = None
    category_id: int | None = None
    transaction_date: date | None = None
    kind: TransactionKind | None = None
    amount_minor: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, min_length=1, max_length=250)
    notes: str | None = Field(default=None, max_length=2_000)


class TransferCreate(BaseModel):
    from_account_id: int
    to_account_id: int
    amount_minor: int = Field(gt=0)
    transaction_date: date
    description: str = Field(min_length=1, max_length=250)
    notes: str | None = Field(default=None, max_length=2_000)
