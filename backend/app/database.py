from collections.abc import Generator
from pathlib import Path
from threading import Lock
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import database_url


class Base(DeclarativeBase):
    pass


def enable_sqlite_foreign_keys(connection: Any, _: Any) -> None:
    cursor = connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_database_engine(url: str | None = None) -> Engine:
    resolved_url = url or database_url()
    if resolved_url.startswith("sqlite:///"):
        Path(resolved_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(resolved_url, connect_args={"check_same_thread": False})
    if resolved_url.startswith("sqlite"):
        event.listen(engine, "connect", enable_sqlite_foreign_keys)
    return engine


engine = create_database_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
database_maintenance_lock = Lock()


def get_session() -> Generator[Session]:
    with database_maintenance_lock, SessionLocal() as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
