from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app import database, main
from app.database import Base, enable_sqlite_foreign_keys
from app.main import app
from app.models import (
    AccountKind,
    Category,
    CategoryDirection,
    FinancialAccount,
    Transaction,
)


def test_successful_mutation_request_is_committed(tmp_path, monkeypatch) -> None:
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp_path / 'persistence.sqlite3'}",
        connect_args={"check_same_thread": False},
    )
    from sqlalchemy import event

    event.listen(engine, "connect", enable_sqlite_foreign_keys)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    with session_factory() as session:
        account = FinancialAccount(
            name="Checking",
            kind=AccountKind.CHECKING,
            opening_balance_minor=0,
            opening_balance_date=date(2026, 7, 1),
        )
        category = Category(
            name="Groceries",
            direction=CategoryDirection.EXPENSE,
            is_default=False,
        )
        session.add_all([account, category])
        session.commit()
        account_id = account.id
        category_id = category.id

    monkeypatch.setattr(database, "SessionLocal", session_factory)
    monkeypatch.setattr(main, "SessionLocal", session_factory)

    with TestClient(app) as client:
        response = client.post(
            "/api/transactions",
            json={
                "financial_account_id": account_id,
                "category_id": category_id,
                "transaction_date": "2026-07-19",
                "kind": "expense",
                "amount_minor": 1234,
                "description": "Persistent expense",
                "tag_ids": [],
            },
        )

    assert response.status_code == 201
    with session_factory() as session:
        persisted = session.scalar(
            select(Transaction).where(Transaction.description == "Persistent expense")
        )
        assert persisted is not None
        assert persisted.amount_minor == 1234

    engine.dispose()
