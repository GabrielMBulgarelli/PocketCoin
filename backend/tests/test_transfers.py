from datetime import date

from app.models import AccountKind, Category, CategoryDirection, FinancialAccount, TransactionKind
from app.services.reference_data import DomainValidationError
from app.services.transactions import (
    TransactionInput,
    TransferInput,
    account_balance_minor,
    create_transaction,
    create_transfer,
    list_transactions,
)


def test_transfer_creates_two_uncategorized_paired_rows(session) -> None:
    asset = FinancialAccount(
        name="Checking",
        kind=AccountKind.CHECKING,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    liability = FinancialAccount(
        name="Card",
        kind=AccountKind.CREDIT_CARD,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
        credit_limit_minor=10_000,
    )
    session.add_all([asset, liability])
    session.flush()

    outgoing, incoming = create_transfer(
        session,
        TransferInput(
            from_account_id=asset.id,
            to_account_id=liability.id,
            amount_minor=2_500,
            transaction_date=date(2026, 7, 11),
            description="Card payment",
        ),
    )

    assert outgoing.transfer_group_id == incoming.transfer_group_id
    assert {outgoing.kind.value, incoming.kind.value} == {"transfer_out", "transfer_in"}
    assert outgoing.category_id is None
    assert incoming.category_id is None


def test_liability_expense_increases_debt_and_transfer_in_decreases_it(session) -> None:
    liability = FinancialAccount(
        name="Card",
        kind=AccountKind.CREDIT_CARD,
        opening_balance_minor=1_000,
        opening_balance_date=date(2026, 1, 1),
        credit_limit_minor=10_000,
    )
    asset = FinancialAccount(
        name="Cash",
        kind=AccountKind.CASH,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    category = Category(name="Food", direction=CategoryDirection.EXPENSE)
    session.add_all([liability, asset, category])
    session.flush()
    create_transaction(
        session,
        TransactionInput(
            asset.id, category.id, TransactionKind.EXPENSE, 200, date(2026, 7, 1), "Lunch"
        ),
    )
    create_transfer(
        session, TransferInput(asset.id, liability.id, 300, date(2026, 7, 2), "Payment")
    )

    assert account_balance_minor(session, liability.id) == 700
    assert account_balance_minor(session, asset.id) == -500


def test_transfer_allows_general_on_exactly_one_side(session) -> None:
    account = FinancialAccount(
        name="Checking",
        kind=AccountKind.CHECKING,
        opening_balance_minor=1_000,
        opening_balance_date=date(2026, 1, 1),
    )
    session.add(account)
    session.flush()

    general_out, account_in = create_transfer(
        session,
        TransferInput(None, account.id, 300, date(2026, 7, 2), "Deposit"),
    )
    account_out, general_in = create_transfer(
        session,
        TransferInput(account.id, None, 200, date(2026, 7, 3), "Withdrawal"),
    )

    assert general_out.financial_account_id is None
    assert account_in.financial_account_id == account.id
    assert account_out.financial_account_id == account.id
    assert general_in.financial_account_id is None
    assert account_balance_minor(session, account.id) == 1_100


def test_transfer_rejects_general_to_general(session) -> None:
    try:
        create_transfer(
            session,
            TransferInput(None, None, 100, date(2026, 7, 2), "Invalid"),
        )
    except DomainValidationError as error:
        assert "differ" in str(error).lower()
    else:
        raise AssertionError("General to General must be rejected")


def test_transaction_list_filters_by_kind_with_deterministic_newest_first_order(session) -> None:
    account = FinancialAccount(
        name="Cash",
        kind=AccountKind.CASH,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    income = Category(name="Salary", direction=CategoryDirection.INCOME)
    session.add_all([account, income])
    session.flush()
    create_transaction(
        session,
        TransactionInput(
            account.id, income.id, TransactionKind.INCOME, 10, date(2026, 7, 1), "Earlier"
        ),
    )
    later = create_transaction(
        session,
        TransactionInput(
            account.id, income.id, TransactionKind.INCOME, 20, date(2026, 7, 2), "Later"
        ),
    )

    assert [item.id for item in list_transactions(session, kind=TransactionKind.INCOME)] == [
        later.id,
        later.id - 1,
    ]
