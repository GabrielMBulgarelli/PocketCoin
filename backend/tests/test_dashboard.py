from datetime import date

from app.models import AccountKind, Category, CategoryDirection, FinancialAccount, TransactionKind
from app.services.dashboard import (
    category_spending,
    dashboard_summary,
    expense_structure,
    recent_activity,
)
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


def test_recent_activity_limits_after_filtering_by_logical_kind(session) -> None:
    account, income, expenses = seed_account_and_categories(session)
    create_transaction(
        session,
        TransactionInput(
            account.id,
            income.id,
            TransactionKind.INCOME,
            50_000,
            date(2026, 7, 1),
            "Monthly pay",
        ),
    )
    for day in range(2, 11):
        create_transaction(
            session,
            TransactionInput(
                account.id,
                expenses[0].id,
                TransactionKind.EXPENSE,
                100,
                date(2026, 7, day),
                f"Expense {day}",
            ),
        )

    result = recent_activity(session, date(2026, 7, 1), date(2026, 7, 31), "income")

    assert [item["description"] for item in result] == ["Monthly pay"]
    assert result[0]["kind"] == "income"


def test_recent_activity_returns_only_the_newest_five_income_and_expenses(session) -> None:
    account, income, expenses = seed_account_and_categories(session)
    for day in range(1, 8):
        create_transaction(
            session,
            TransactionInput(
                account.id,
                income.id,
                TransactionKind.INCOME,
                day * 100,
                date(2026, 7, day),
                f"Income {day}",
            ),
        )
        create_transaction(
            session,
            TransactionInput(
                account.id,
                expenses[0].id,
                TransactionKind.EXPENSE,
                day * 100,
                date(2026, 7, day),
                f"Expense {day}",
            ),
        )

    income_result = recent_activity(
        session, date(2026, 7, 1), date(2026, 7, 31), "income"
    )
    expense_result = recent_activity(
        session, date(2026, 7, 1), date(2026, 7, 31), "expenses"
    )

    assert [item["description"] for item in income_result] == [
        "Income 7",
        "Income 6",
        "Income 5",
        "Income 4",
        "Income 3",
    ]
    assert [item["description"] for item in expense_result] == [
        "Expense 7",
        "Expense 6",
        "Expense 5",
        "Expense 4",
        "Expense 3",
    ]


def test_recent_activity_returns_only_the_newest_five_normalized_transfers(session) -> None:
    account, _, _ = seed_account_and_categories(session)
    savings = FinancialAccount(
        name="Savings",
        kind=AccountKind.SAVINGS,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    session.add(savings)
    session.flush()
    for day in range(1, 8):
        create_transfer(
            session,
            TransferInput(
                account.id,
                savings.id,
                day * 100,
                date(2026, 7, day),
                f"Transfer {day}",
            ),
        )

    result = recent_activity(
        session, date(2026, 7, 1), date(2026, 7, 31), "transfers"
    )

    assert [item["description"] for item in result] == [
        "Transfer 7",
        "Transfer 6",
        "Transfer 5",
        "Transfer 4",
        "Transfer 3",
    ]
    assert all(item["kind"] == "transfer" for item in result)


def test_recent_activity_normalizes_a_transfer_pair(session) -> None:
    account, _, _ = seed_account_and_categories(session)
    savings = FinancialAccount(
        name="Savings",
        kind=AccountKind.SAVINGS,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    session.add(savings)
    session.flush()
    outgoing, incoming = create_transfer(
        session,
        TransferInput(account.id, savings.id, 2_500, date(2026, 7, 3), "Move to savings"),
    )

    result = recent_activity(session, date(2026, 7, 1), date(2026, 7, 31), "transfers")

    assert result == [
        {
            "id": outgoing.id,
            "transaction_date": date(2026, 7, 3),
            "kind": "transfer",
            "amount_minor": 2_500,
            "description": "Move to savings",
            "category_id": None,
            "financial_account_id": None,
            "transfer_group_id": outgoing.transfer_group_id,
            "from_account_id": account.id,
            "to_account_id": savings.id,
        }
    ]
    assert incoming.transfer_group_id == outgoing.transfer_group_id
