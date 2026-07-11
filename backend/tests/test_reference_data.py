from datetime import date

import pytest

from app.models import Category, CategoryDirection, FinancialAccount, Tag
from app.services.reference_data import (
    AccountInput,
    DomainValidationError,
    create_category,
    create_financial_account,
    create_tag,
    ensure_seed_data,
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
