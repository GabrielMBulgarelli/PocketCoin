from datetime import date

import pytest
from sqlalchemy import func, select

from app.audit_seed import require_audit_environment, seed_audit_data
from app.models import Budget, PlannedPayment, Transaction


def test_audit_seed_requires_explicit_confirmation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("POCKETCOIN_AUDIT_DATA", raising=False)

    with pytest.raises(RuntimeError, match="POCKETCOIN_AUDIT_DATA=1"):
        require_audit_environment()


def test_audit_seed_is_deterministic_and_idempotent(session) -> None:
    reference_date = date(2026, 7, 13)

    seed_audit_data(session, reference_date)
    session.commit()
    first_counts = (
        session.scalar(select(func.count()).select_from(Transaction)),
        session.scalar(select(func.count()).select_from(Budget)),
        session.scalar(select(func.count()).select_from(PlannedPayment)),
    )

    seed_audit_data(session, reference_date)
    session.commit()
    second_counts = (
        session.scalar(select(func.count()).select_from(Transaction)),
        session.scalar(select(func.count()).select_from(Budget)),
        session.scalar(select(func.count()).select_from(PlannedPayment)),
    )

    assert first_counts == second_counts
    assert first_counts[0] > 0
    assert first_counts[1] > 0
    assert first_counts[2] > 0
