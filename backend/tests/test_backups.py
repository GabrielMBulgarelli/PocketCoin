import sqlite3
from pathlib import Path

import pytest

from app.services.reference_data import DomainValidationError


def _pocketcoin_database(path: Path, marker: str = "current") -> None:
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            PRAGMA foreign_keys=ON;
            CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
            CREATE TABLE app_settings (id INTEGER PRIMARY KEY, base_currency TEXT NOT NULL);
            CREATE TABLE financial_accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE transactions (id INTEGER PRIMARY KEY, description TEXT NOT NULL);
            """
        )
        connection.execute("INSERT INTO alembic_version VALUES ('20260712_06')")
        connection.execute("INSERT INTO app_settings VALUES (1, ?)", (marker,))


def test_backup_creation_listing_and_restore(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import backups

    database = tmp_path / "pocketcoin.sqlite3"
    _pocketcoin_database(database)
    monkeypatch.setattr(backups, "database_file", lambda: database)
    monkeypatch.setattr(backups, "current_alembic_head", lambda: "20260712_06")

    first = backups.create_backup("manual")
    second = backups.create_backup("manual")
    assert first.id != second.id
    assert [item.id for item in backups.list_backups()] == [second.id, first.id]
    assert all(item.size_bytes > 0 for item in backups.list_backups())

    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE app_settings SET base_currency = 'changed'")
    result = backups.restore_backup(first.id, "RESTORE")
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT base_currency FROM app_settings").fetchone() == (
            "current",
        )
    assert result.pre_restore_backup.reason == "pre_restore"
    assert any(item.reason == "pre_restore" for item in backups.list_backups())


def test_backup_rejects_paths_symlinks_and_bad_confirmation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import backups

    database = tmp_path / "pocketcoin.sqlite3"
    _pocketcoin_database(database)
    monkeypatch.setattr(backups, "database_file", lambda: database)
    monkeypatch.setattr(backups, "current_alembic_head", lambda: "20260712_06")
    backup = backups.create_backup("manual")

    for backup_id in ("../pocketcoin.sqlite3", "/tmp/data.sqlite3", "not-a-backup"):
        with pytest.raises(DomainValidationError):
            backups.restore_backup(backup_id, "RESTORE")
    with pytest.raises(DomainValidationError, match="confirmation"):
        backups.restore_backup(backup.id, "restore")

    target = tmp_path / "backups" / backup.id
    target.unlink()
    target.symlink_to(database)
    with pytest.raises(DomainValidationError, match="regular backup file"):
        backups.restore_backup(backup.id, "RESTORE")


@pytest.mark.parametrize("kind", ["corrupt", "foreign_schema", "old_revision"])
def test_restore_validation_leaves_live_data_untouched(
    kind: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import backups

    database = tmp_path / "pocketcoin.sqlite3"
    _pocketcoin_database(database)
    monkeypatch.setattr(backups, "database_file", lambda: database)
    monkeypatch.setattr(backups, "current_alembic_head", lambda: "20260712_06")
    backup_id = f"manual-20260713T120000000000Z-{'a' * 32}.sqlite3"
    candidate = tmp_path / "backups" / backup_id
    candidate.parent.mkdir()
    if kind == "corrupt":
        candidate.write_bytes(b"not sqlite")
    elif kind == "foreign_schema":
        with sqlite3.connect(candidate) as connection:
            connection.execute("CREATE TABLE unrelated (id INTEGER)")
    else:
        _pocketcoin_database(candidate)
        with sqlite3.connect(candidate) as connection:
            connection.execute("UPDATE alembic_version SET version_num = 'old'")

    with pytest.raises(DomainValidationError):
        backups.restore_backup(backup_id, "RESTORE")
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT base_currency FROM app_settings").fetchone() == (
            "current",
        )
    assert not any(path.name.startswith(".tmp-") for path in candidate.parent.iterdir())


def test_non_file_sqlite_database_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import backups

    monkeypatch.setattr(backups, "database_url", lambda: "sqlite+pysqlite:///:memory:")
    with pytest.raises(DomainValidationError, match="file-backed SQLite"):
        backups.database_file()
