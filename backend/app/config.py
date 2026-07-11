import os
from pathlib import Path


def data_directory() -> Path:
    configured = os.getenv("POCKETCOIN_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / "data"


def database_url() -> str:
    configured = os.getenv("POCKETCOIN_DATABASE_URL")
    if configured:
        return configured
    return f"sqlite:///{data_directory() / 'pocketcoin.sqlite3'}"
