from datetime import date

import pytest
from pydantic import ValidationError

from app.models import TransactionKind
from app.schemas import TransactionCreate, TransferCreate


def transaction_payload(**overrides):
    return {
        "category_id": 1,
        "transaction_date": date(2026, 7, 20),
        "kind": TransactionKind.EXPENSE,
        "amount_minor": 100,
        "description": "Debt",
        **overrides,
    }


def test_transaction_schema_supports_new_and_legacy_debt_inputs() -> None:
    current = TransactionCreate.model_validate(
        transaction_payload(is_debt_payment=True)
    )
    legacy = TransactionCreate.model_validate(
        transaction_payload(
            recurrence={
                "frequency": "monthly",
                "end_date": None,
                "is_debt_payment": True,
            }
        )
    )

    assert current.resolved_is_debt_payment is True
    assert legacy.resolved_is_debt_payment is True


def test_transaction_schema_rejects_conflicting_or_income_debt_inputs() -> None:
    with pytest.raises(ValidationError):
        TransactionCreate.model_validate(
            transaction_payload(
                is_debt_payment=True,
                recurrence={"frequency": "monthly", "is_debt_payment": False},
            )
        )
    with pytest.raises(ValidationError):
        TransactionCreate.model_validate(
            transaction_payload(kind=TransactionKind.INCOME, is_debt_payment=True)
        )


def test_transfer_schema_accepts_general_but_not_general_to_general() -> None:
    valid = TransferCreate(
        from_account_id=None,
        to_account_id=1,
        amount_minor=100,
        transaction_date=date(2026, 7, 20),
        description="Deposit",
    )
    assert valid.from_account_id is None
    with pytest.raises(ValidationError):
        TransferCreate(
            from_account_id=None,
            to_account_id=None,
            amount_minor=100,
            transaction_date=date(2026, 7, 20),
            description="Invalid",
        )
