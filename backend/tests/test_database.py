from contextlib import nullcontext
from threading import Event, Thread

import pytest


def test_session_dependency_can_close_on_a_different_worker_thread(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app import database

    session = object()
    monkeypatch.setattr(database, "SessionLocal", lambda: nullcontext(session))
    dependency = database.get_session()
    opened: list[object] = []
    errors: list[BaseException] = []
    dependency_open = Event()
    dependency_closed = Event()

    def open_dependency() -> None:
        try:
            opened.append(next(dependency))
            dependency_open.set()
            dependency_closed.wait(timeout=2)
        except BaseException as error:  # pragma: no cover - assertion reports the worker error
            errors.append(error)

    def close_dependency() -> None:
        try:
            dependency.close()
        except BaseException as error:  # pragma: no cover - assertion reports the worker error
            errors.append(error)

    opener = Thread(target=open_dependency)
    opener.start()
    assert dependency_open.wait(timeout=2)
    closer = Thread(target=close_dependency)
    closer.start()
    closer.join()
    dependency_closed.set()
    opener.join()

    assert opened == [session]
    assert errors == []
