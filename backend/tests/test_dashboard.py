from datetime import date

from app.models import AccountKind, Category, CategoryDirection, FinancialAccount, TransactionKind
from app.services.dashboard import category_spending, dashboard_summary, expense_structure
from app.services.transactions import (
    TransactionInput,
    TransferInput,
    create_transaction,
    create_transfer,
)


def seed_account_and_categories(session):
    account = FinancialAccount(
        name="Checking",
        kind=AccountKind.CHECKING,
        opening_balance_minor=10_000,
        opening_balance_date=date(2026, 1, 1),
    )
    income = Category(name="Salary", direction=CategoryDirection.INCOME)
    expenses = [
        Category(name=f"Expense {index}", direction=CategoryDirection.EXPENSE) for index in range(6)
    ]
    session.add_all([account, income, *expenses])
    session.flush()
    return account, income, expenses


def test_dashboard_summary_excludes_transfers_and_calculates_balance(session) -> None:
    account, income, expenses = seed_account_and_categories(session)
    second = FinancialAccount(
        name="Savings",
        kind=AccountKind.SAVINGS,
        opening_balance_minor=5_000,
        opening_balance_date=date(2026, 1, 1),
    )
    session.add(second)
    session.flush()
    create_transaction(
        session,
        TransactionInput(
            account.id, income.id, TransactionKind.INCOME, 4_000, date(2026, 7, 1), "Pay"
        ),
    )
    create_transaction(
        session,
        TransactionInput(
            account.id, expenses[0].id, TransactionKind.EXPENSE, 1_500, date(2026, 7, 2), "Food"
        ),
    )
    create_transfer(session, TransferInput(account.id, second.id, 2_000, date(2026, 7, 3), "Move"))

    result = dashboard_summary(session, date(2026, 7, 1), date(2026, 7, 31))

    assert result == {
        "balance_minor": 17_500,
        "income_minor": 4_000,
        "expense_minor": 1_500,
        "net_minor": 2_500,
        "savings_rate": 62.5,
    }


def test_category_and_expense_structure_group_top_five_and_other(session) -> None:
    account, _, expenses = seed_account_and_categories(session)
    for index, category in enumerate(expenses, start=1):
        create_transaction(
            session,
            TransactionInput(
                account.id,
                category.id,
                TransactionKind.EXPENSE,
                index * 100,
                date(2026, 7, index),
                category.name,
            ),
        )

    spending = category_spending(session, date(2026, 7, 1), date(2026, 7, 31))
    structure = expense_structure(session, date(2026, 7, 1), date(2026, 7, 31))

    assert [item["amount_minor"] for item in spending] == [600, 500, 400, 300, 200, 100]
    assert structure[-1] == {"name": "Other", "amount_minor": 100}
    assert len(structure) == 6
