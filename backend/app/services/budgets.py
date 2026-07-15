from calendar import monthrange
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Budget,
    Category,
    CategoryDirection,
    Transaction,
    TransactionKind,
    transaction_tags,
)
from app.services.reference_data import DomainValidationError, NotFoundError


@dataclass(frozen=True)
class BudgetInput:
    category_id: int
    month: date
    limit_minor: int


def _category(session: Session, category_id: int) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category not found.")
    if category.direction != CategoryDirection.EXPENSE or not category.is_active:
        raise DomainValidationError("Choose an active expense category.", "category_id")
    return category


def _budget(session: Session, budget_id: int) -> Budget:
    budget = session.get(Budget, budget_id)
    if budget is None:
        raise NotFoundError("Budget not found.")
    return budget


def list_budgets(session: Session, month: date) -> list[Budget]:
    return list(session.scalars(select(Budget).where(Budget.month == month).order_by(Budget.id)))


def create_budget(session: Session, data: BudgetInput) -> Budget:
    if data.month.day != 1:
        raise DomainValidationError("Month must be the first day of the month.", "month")
    _category(session, data.category_id)
    budget = Budget(**data.__dict__)
    session.add(budget)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise DomainValidationError(
            "This category already has a budget for that month.", "category_id"
        ) from error
    session.refresh(budget)
    return budget


def update_budget(session: Session, budget_id: int, limit_minor: int) -> Budget:
    budget = _budget(session, budget_id)
    budget.limit_minor = limit_minor
    session.commit()
    session.refresh(budget)
    return budget


def delete_budget(session: Session, budget_id: int) -> None:
    session.delete(_budget(session, budget_id))
    session.commit()


def list_budget_progress(
    session: Session,
    selected_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> list[dict[str, object]]:
    month = selected_date.replace(day=1)
    end = selected_date.replace(day=monthrange(selected_date.year, selected_date.month)[1])
    budgets = select(Budget, Category.name).join(Category).where(Budget.month == month)
    if category_id is not None:
        budgets = budgets.where(Budget.category_id == category_id)
    rows = session.execute(budgets.order_by(Category.name, Budget.id)).all()
    result: list[dict[str, object]] = []
    for budget, category_name in rows:
        spending = select(func.coalesce(func.sum(Transaction.amount_minor), 0)).where(
            Transaction.kind == TransactionKind.EXPENSE,
            Transaction.category_id == budget.category_id,
            Transaction.transaction_date.between(month, end),
        )
        if financial_account_id is not None:
            spending = spending.where(Transaction.financial_account_id == financial_account_id)
        if tag_id is not None:
            spending = spending.join(transaction_tags).where(transaction_tags.c.tag_id == tag_id)
        spent = int(session.scalar(spending) or 0)
        result.append(
            {
                "id": budget.id,
                "category_id": budget.category_id,
                "category_name": category_name,
                "month": budget.month,
                "limit_minor": budget.limit_minor,
                "spent_minor": spent,
                "remaining_minor": budget.limit_minor - spent,
                "percentage_used": spent / budget.limit_minor,
                "over_budget": spent > budget.limit_minor,
            }
        )
    return result
