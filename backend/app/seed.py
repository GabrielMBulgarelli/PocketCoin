from app.database import SessionLocal
from app.services.reference_data import ensure_seed_data


def main() -> None:
    with SessionLocal.begin() as session:
        ensure_seed_data(session)


if __name__ == "__main__":
    main()
