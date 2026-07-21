from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AccountKind,
    AppSetting,
    Category,
    CategoryDirection,
    FinancialAccount,
    PlannedPayment,
    PlannedPaymentRecurrence,
    PlannedPaymentStatus,
    Tag,
    Theme,
    planned_payment_tags,
)


class DomainValidationError(ValueError):
    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.field = field


class NotFoundError(LookupError):
    pass


@dataclass(frozen=True)
class AccountInput:
    name: str
    kind: AccountKind | str
    opening_balance_minor: int
    opening_balance_date: date
    credit_limit_minor: int | None
    is_active: bool = True


def normalized_name(name: str) -> str:
    result = name.strip()
    if not result:
        raise DomainValidationError("Name must not be blank.", "name")
    return result


def validate_account_input(data: AccountInput) -> tuple[str, AccountKind]:
    name = normalized_name(data.name)
    kind = AccountKind(data.kind)
    if data.opening_balance_minor < 0:
        raise DomainValidationError(
            "Opening balance must not be negative.", "opening_balance_minor"
        )
    if data.credit_limit_minor is not None:
        if data.credit_limit_minor <= 0:
            raise DomainValidationError("Credit limit must be positive.", "credit_limit_minor")
        if kind not in {AccountKind.CREDIT_CARD, AccountKind.OVERDRAFT}:
            raise DomainValidationError(
                "Credit limits are only valid for credit cards and overdrafts.",
                "credit_limit_minor",
            )
    return name, kind


def create_financial_account(session: Session, data: AccountInput) -> FinancialAccount:
    name, kind = validate_account_input(data)
    account = FinancialAccount(
        name=name,
        kind=kind,
        opening_balance_minor=data.opening_balance_minor,
        opening_balance_date=data.opening_balance_date,
        credit_limit_minor=data.credit_limit_minor,
        is_active=data.is_active,
    )
    session.add(account)
    session.flush()
    return account


def ensure_settings(session: Session) -> AppSetting:
    settings = session.get(AppSetting, 1)
    if settings is None:
        settings = AppSetting(id=1)
        session.add(settings)
        session.flush()
    return settings


def ensure_seed_data(session: Session) -> None:
    ensure_settings(session)
    for direction in CategoryDirection:
        existing = session.scalar(
            select(Category).where(Category.direction == direction, Category.is_default.is_(True))
        )
        if existing is None:
            session.add(
                Category(
                    name="Uncategorized income"
                    if direction == CategoryDirection.INCOME
                    else "Uncategorized expense",
                    direction=direction,
                    is_default=True,
                )
            )
    existing_cash = session.scalar(
        select(FinancialAccount).where(FinancialAccount.kind == AccountKind.CASH).limit(1)
    )
    if existing_cash is None:
        create_financial_account(
            session,
            AccountInput(
                name="Cash",
                kind=AccountKind.CASH,
                opening_balance_minor=0,
                opening_balance_date=date.today(),
                credit_limit_minor=None,
            ),
        )
    session.flush()


def active_category_name_exists(
    session: Session, name: str, direction: CategoryDirection, exclude_id: int | None = None
) -> bool:
    statement = select(Category.id).where(
        Category.is_active.is_(True),
        Category.direction == direction,
        func.lower(Category.name) == name.lower(),
    )
    if exclude_id is not None:
        statement = statement.where(Category.id != exclude_id)
    return session.scalar(statement) is not None


def active_tag_name_exists(session: Session, name: str, exclude_id: int | None = None) -> bool:
    statement = select(Tag.id).where(Tag.is_active.is_(True), func.lower(Tag.name) == name.lower())
    if exclude_id is not None:
        statement = statement.where(Tag.id != exclude_id)
    return session.scalar(statement) is not None


def create_category(session: Session, name: str, direction: CategoryDirection) -> Category:
    name = normalized_name(name)
    if active_category_name_exists(session, name, direction):
        raise DomainValidationError("An active category with this name already exists.", "name")
    category = Category(name=name, direction=direction)
    session.add(category)
    session.flush()
    return category


def create_tag(session: Session, name: str) -> Tag:
    name = normalized_name(name)
    if active_tag_name_exists(session, name):
        raise DomainValidationError("An active tag with this name already exists.", "name")
    tag = Tag(name=name)
    session.add(tag)
    session.flush()
    return tag


def list_financial_accounts(session: Session) -> list[FinancialAccount]:
    return list(
        session.scalars(
            select(FinancialAccount).order_by(FinancialAccount.name, FinancialAccount.id)
        )
    )


def update_financial_account(
    session: Session, account_id: int, **values: object
) -> FinancialAccount:
    account = session.get(FinancialAccount, account_id)
    if account is None:
        raise NotFoundError("Financial account not found.")
    if values.get("is_active") is False and session.scalar(
        select(PlannedPayment.id).where(
            PlannedPayment.financial_account_id == account_id,
            PlannedPayment.status == PlannedPaymentStatus.PENDING,
        ).limit(1)
    ) is not None:
        raise DomainValidationError(
            "A pending planned payment or active recurrence uses this financial account. "
            "Edit or cancel it first.",
            "is_active",
        )
    if "name" in values:
        account.name = normalized_name(str(values["name"]))
    for field in {
        "opening_balance_minor",
        "opening_balance_date",
        "credit_limit_minor",
        "is_active",
    }:
        if field in values:
            setattr(account, field, values[field])
    validate_account_input(
        AccountInput(
            name=account.name,
            kind=account.kind,
            opening_balance_minor=account.opening_balance_minor,
            opening_balance_date=account.opening_balance_date,
            credit_limit_minor=account.credit_limit_minor,
            is_active=account.is_active,
        )
    )
    session.flush()
    return account


def list_categories(session: Session) -> list[Category]:
    return list(
        session.scalars(select(Category).order_by(Category.direction, Category.name, Category.id))
    )


def update_category(session: Session, category_id: int, **values: object) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category not found.")
    name = normalized_name(str(values["name"])) if "name" in values else category.name
    is_active = bool(values["is_active"]) if "is_active" in values else category.is_active
    if not is_active and session.scalar(
        select(PlannedPayment.id)
        .where(
            PlannedPayment.category_id == category_id,
            PlannedPayment.status == PlannedPaymentStatus.PENDING,
            PlannedPayment.recurrence != PlannedPaymentRecurrence.NONE,
        )
        .limit(1)
    ) is not None:
        raise DomainValidationError(
            "An active recurrence uses this category. Edit or cancel it first.", "is_active"
        )
    if is_active and active_category_name_exists(session, name, category.direction, category.id):
        raise DomainValidationError("An active category with this name already exists.", "name")
    category.name = name
    category.is_active = is_active
    session.flush()
    return category


def list_tags(session: Session) -> list[Tag]:
    return list(session.scalars(select(Tag).order_by(Tag.name, Tag.id)))


def update_tag(session: Session, tag_id: int, **values: object) -> Tag:
    tag = session.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError("Tag not found.")
    name = normalized_name(str(values["name"])) if "name" in values else tag.name
    is_active = bool(values["is_active"]) if "is_active" in values else tag.is_active
    if not is_active and session.scalar(
        select(PlannedPayment.id)
        .join(
            planned_payment_tags,
            planned_payment_tags.c.planned_payment_id == PlannedPayment.id,
        )
        .where(
            planned_payment_tags.c.tag_id == tag_id,
            PlannedPayment.status == PlannedPaymentStatus.PENDING,
            PlannedPayment.recurrence != PlannedPaymentRecurrence.NONE,
        )
        .limit(1)
    ) is not None:
        raise DomainValidationError(
            "An active recurrence uses this tag. Edit or cancel it first.", "is_active"
        )
    if is_active and active_tag_name_exists(session, name, tag.id):
        raise DomainValidationError("An active tag with this name already exists.", "name")
    tag.name = name
    tag.is_active = is_active
    session.flush()
    return tag


def update_settings(session: Session, **values: str | Theme) -> AppSetting:
    settings = ensure_settings(session)
    for field, value in values.items():
        setattr(settings, field, value)
    session.flush()
    return settings
