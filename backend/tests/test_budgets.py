from datetime import date

import pytest

from app.models import (
    AccountKind,
    Category,
    CategoryDirection,
    FinancialAccount,
    Transaction,
    TransactionKind,
)
from app.services.budgets import (
    BudgetInput,
    create_budget,
    delete_budget,
    list_budget_progress,
    update_budget,
)
from app.services.reference_data import DomainValidationError, NotFoundError


def seed_reference_data(session):
    account = FinancialAccount(
        name="Checking",
        kind=AccountKind.CHECKING,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    groceries = Category(name="Groceries", direction=CategoryDirection.EXPENSE)
    income = Category(name="Salary", direction=CategoryDirection.INCOME)
    session.add_all([account, groceries, income])
    session.flush()
    return account, groceries, income


def test_budget_crud_enforces_expense_category_and_unique_month(session) -> None:
    _, groceries, income = seed_reference_data(session)

    budget = create_budget(session, BudgetInput(groceries.id, date(2026, 7, 1), 50_000))
    updated = update_budget(session, budget.id, 60_000)

    assert updated.limit_minor == 60_000
    with pytest.raises(DomainValidationError, match="already has a budget"):
        create_budget(session, BudgetInput(groceries.id, date(2026, 7, 1), 10_000))
    with pytest.raises(DomainValidationError, match="expense category"):
        create_budget(session, BudgetInput(income.id, date(2026, 7, 1), 10_000))
    with pytest.raises(DomainValidationError, match="first day"):
        create_budget(session, BudgetInput(groceries.id, date(2026, 8, 2), 10_000))

    delete_budget(session, budget.id)
    with pytest.raises(NotFoundError):
        update_budget(session, budget.id, 20_000)


def test_monthly_progress_counts_only_matching_expenses(session) -> None:
    account, groceries, income = seed_reference_data(session)
    create_budget(session, BudgetInput(groceries.id, date(2026, 7, 1), 10_000))
    session.add_all(
        [
            Transaction(
                financial_account_id=account.id,
                category_id=groceries.id,
                transaction_date=date(2026, 7, 5),
                kind=TransactionKind.EXPENSE,
                amount_minor=12_500,
                description="Market",
            ),
            Transaction(
                financial_account_id=account.id,
                category_id=groceries.id,
                transaction_date=date(2026, 6, 30),
                kind=TransactionKind.EXPENSE,
                amount_minor=5_000,
                description="Previous month",
            ),
            Transaction(
                financial_account_id=account.id,
                category_id=income.id,
                transaction_date=date(2026, 7, 5),
                kind=TransactionKind.INCOME,
                amount_minor=20_000,
                description="Pay",
            ),
        ]
    )
    session.commit()

    result = list_budget_progress(session, date(2026, 7, 20))

    assert result == [
        {
            "id": 1,
            "category_id": groceries.id,
            "category_name": "Groceries",
            "month": date(2026, 7, 1),
            "limit_minor": 10_000,
            "spent_minor": 12_500,
            "remaining_minor": -2_500,
            "percentage_used": 1.25,
            "over_budget": True,
        }
    ]
