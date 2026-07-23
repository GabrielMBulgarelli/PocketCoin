from datetime import date

import pytest

from app.models import AccountKind, Category, CategoryDirection, FinancialAccount, Tag
from app.services.reference_data import (
    AccountInput,
    DomainValidationError,
    create_category,
    create_financial_account,
    create_tag,
    ensure_seed_data,
    update_financial_account,
)


def test_rejects_credit_limit_for_a_cash_account(session) -> None:
    with pytest.raises(DomainValidationError, match="Credit limits"):
        create_financial_account(
            session,
            AccountInput(
                name="Wallet",
                kind="cash",
                opening_balance_minor=0,
                opening_balance_date=date(2026, 7, 11),
                credit_limit_minor=1_000,
            ),
        )


def test_seed_data_is_idempotent(session) -> None:
    ensure_seed_data(session)
    ensure_seed_data(session)

    assert session.query(FinancialAccount).count() == 1
    assert session.query(Category).count() == 2


def test_active_category_and_tag_names_are_case_insensitively_unique(session) -> None:
    create_category(session, " Groceries ", CategoryDirection.EXPENSE)
    create_tag(session, "Home")

    with pytest.raises(DomainValidationError):
        create_category(session, "groceries", CategoryDirection.EXPENSE)
    with pytest.raises(DomainValidationError):
        create_tag(session, "home")

    assert session.query(Tag).one().name == "Home"


def test_account_kind_update_clears_an_incompatible_credit_limit(session) -> None:
    account = create_financial_account(
        session,
        AccountInput(
            name="Card",
            kind=AccountKind.CREDIT_CARD,
            opening_balance_minor=0,
            opening_balance_date=date(2026, 7, 11),
            credit_limit_minor=100_000,
        ),
    )

    updated = update_financial_account(session, account.id, kind=AccountKind.LOAN)

    assert updated.kind == AccountKind.LOAN
    assert updated.credit_limit_minor is None


def test_invalid_account_update_does_not_partially_mutate(session) -> None:
    account = create_financial_account(
        session,
        AccountInput(
            name="Checking",
            kind=AccountKind.CHECKING,
            opening_balance_minor=0,
            opening_balance_date=date(2026, 7, 11),
            credit_limit_minor=None,
        ),
    )

    with pytest.raises(DomainValidationError):
        update_financial_account(
            session,
            account.id,
            name="Changed",
            opening_balance_minor=-1,
        )

    assert account.name == "Checking"
    assert account.opening_balance_minor == 0
