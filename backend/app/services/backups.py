import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.engine import make_url

from app.config import database_url
from app.database import database_maintenance_lock, engine
from app.services.reference_data import DomainValidationError, NotFoundError

BACKUP_ID_PATTERN = re.compile(
    r"^(manual|pre_restore)-(\d{8}T\d{12}Z)-([0-9a-f]{32})\.sqlite3$"
)
EXPECTED_TABLES = {
    "alembic_version",
    "app_settings",
    "financial_accounts",
    "categories",
    "tags",
    "transactions",
}


@dataclass(frozen=True)
class BackupMetadata:
    id: str
    created_at: datetime
    size_bytes: int
    reason: str


@dataclass(frozen=True)
class RestoreResult:
    restored_backup_id: str
    pre_restore_backup: BackupMetadata


def database_file() -> Path:
    url = make_url(database_url())
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise DomainValidationError(
            "Backup and restore require a file-backed SQLite database.", "database"
        )
    return Path(url.database).expanduser().resolve()


def backup_directory() -> Path:
    directory = database_file().parent / "backups"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def current_alembic_head() -> str:
    backend_directory = Path(__file__).resolve().parents[2]
    config = Config(str(backend_directory / "alembic.ini"))
    return ScriptDirectory.from_config(config).get_current_head() or ""


def _metadata(path: Path) -> BackupMetadata:
    match = BACKUP_ID_PATTERN.fullmatch(path.name)
    if match is None:
        raise DomainValidationError("Invalid backup identifier.", "backup_id")
    created_at = datetime.strptime(match.group(2), "%Y%m%dT%H%M%S%fZ").replace(tzinfo=UTC)
    return BackupMetadata(path.name, created_at, path.stat().st_size, match.group(1))


def _controlled_path(backup_id: str) -> Path:
    if BACKUP_ID_PATTERN.fullmatch(backup_id) is None:
        raise DomainValidationError("Invalid backup identifier.", "backup_id")
    path = backup_directory() / backup_id
    if not path.exists():
        raise NotFoundError("Backup not found.")
    if path.is_symlink() or not path.is_file():
        raise DomainValidationError("Backup must be a regular backup file.", "backup_id")
    return path


def _readonly_connection(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)


def validate_database(path: Path) -> None:
    if path.is_symlink() or not path.is_file():
        raise DomainValidationError("Backup must be a regular backup file.", "backup_id")
    try:
        if path.read_bytes()[:16] != b"SQLite format 3\x00":
            raise DomainValidationError("Backup is not a valid SQLite database.", "backup_id")
        with _readonly_connection(path) as connection:
            quick_check = connection.execute("PRAGMA quick_check").fetchall()
            if quick_check != [("ok",)]:
                raise DomainValidationError("Backup failed SQLite integrity validation.")
            if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise DomainValidationError("Backup contains invalid foreign-key references.")
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
            if not EXPECTED_TABLES.issubset(tables):
                raise DomainValidationError("Backup does not contain the PocketCoin schema.")
            revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()
            if revision != (current_alembic_head(),):
                raise DomainValidationError("Backup schema is not compatible with this release.")
    except DomainValidationError:
        raise
    except (OSError, sqlite3.DatabaseError) as error:
        raise DomainValidationError("Backup is not a valid SQLite database.") from error


def _online_copy(source: Path, destination: Path) -> None:
    with _readonly_connection(source) as source_connection, sqlite3.connect(
        destination
    ) as destination_connection:
        source_connection.backup(destination_connection)


def _create_backup_unlocked(reason: str) -> BackupMetadata:
    source = database_file()
    if not source.is_file():
        raise DomainValidationError("The PocketCoin database does not exist.", "database")
    directory = backup_directory()
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    backup_id = f"{reason}-{timestamp}-{uuid4().hex}.sqlite3"
    temporary = directory / f".tmp-{uuid4().hex}.sqlite3"
    destination = directory / backup_id
    try:
        _online_copy(source, temporary)
        validate_database(temporary)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return _metadata(destination)


def create_backup(reason: str = "manual") -> BackupMetadata:
    if reason not in {"manual", "pre_restore"}:
        raise DomainValidationError("Invalid backup reason.", "reason")
    with database_maintenance_lock:
        return _create_backup_unlocked(reason)


def list_backups() -> list[BackupMetadata]:
    with database_maintenance_lock:
        items = []
        for path in backup_directory().iterdir():
            if (
                path.is_symlink()
                or not path.is_file()
                or BACKUP_ID_PATTERN.fullmatch(path.name) is None
            ):
                continue
            items.append(_metadata(path))
        return sorted(items, key=lambda item: (item.created_at, item.id), reverse=True)


def restore_backup(backup_id: str, confirmation: str) -> RestoreResult:
    if confirmation != "RESTORE":
        raise DomainValidationError(
            "Restore confirmation must be exactly RESTORE.", "confirmation"
        )
    with database_maintenance_lock:
        selected = _controlled_path(backup_id)
        validate_database(selected)
        pre_restore = _create_backup_unlocked("pre_restore")
        live = database_file()
        temporary = live.parent / f".restore-{uuid4().hex}.sqlite3"
        try:
            _online_copy(selected, temporary)
            validate_database(temporary)
            engine.dispose()
            for suffix in ("-wal", "-shm", "-journal"):
                live.with_name(live.name + suffix).unlink(missing_ok=True)
            os.replace(temporary, live)
        finally:
            temporary.unlink(missing_ok=True)
        return RestoreResult(backup_id, pre_restore)
