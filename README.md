```text
██████╗  ██████╗  ██████╗██╗  ██╗███████╗████████╗
██╔══██╗██╔═══██╗██╔════╝██║ ██╔╝██╔════╝╚══██╔══╝
██████╔╝██║   ██║██║     █████╔╝ █████╗     ██║
██╔═══╝ ██║   ██║██║     ██╔═██╗ ██╔══╝     ██║
██║     ╚██████╔╝╚██████╗██║  ██╗███████╗   ██║
╚═╝      ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝

██████╗ ██████╗ ██╗███╗   ██╗
██╔════╝██╔═══██╗██║████╗  ██║
██║     ██║   ██║██║██╔██╗ ██║
██║     ██║   ██║██║██║╚██╗██║
╚██████╗╚██████╔╝██║██║ ╚████║
 ╚═════╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝
```

PocketCoin is a local-first personal finance app for one person. It is designed to help you track accounts, record income and expenses, manage transfers, and inspect your financial activity without accounts, logins, or cloud services.

## Current Status

PocketCoin is a complete local release for day-to-day personal budgeting. It includes:

- account, category, tag, transaction, transfer, budget, and planned-payment workflows
- dashboard forecasting and credit/debt analysis
- bounded CSV import, reports, settings, and spreadsheet-safe CSV export
- application-controlled backup and validated restore
- one-process local release serving the built React application from FastAPI

## Expected Project Structure

The intended architecture organizes the app into a simple frontend/backend split with feature-focused modules:

```text
PocketCoin/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routers/
│   │   ├── services/
│   │   ├── queries/
│   │   └── imports/
│   ├── migrations/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── api/
│   │   ├── components/
│   │   ├── features/
│   │   ├── pages/
│   │   ├── lib/
│   │   └── types/
│   └── tests/
├── docs/
├── data/
└── backups/
```

## Local release

Prerequisites are Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js, and npm.
From a fresh clone, install dependencies, migrate and seed the local database, and build the
frontend with:

```bash
make setup
```

Start the complete application as one FastAPI/Uvicorn process:

```bash
make run
```

Open <http://127.0.0.1:8000>. The release server binds only to `127.0.0.1`; the split
`make dev-backend` and `make dev-frontend` targets remain available for development.

## Local data, backup, and restore

By default PocketCoin stores its SQLite database and application-controlled files in `./data`.
Set `POCKETCOIN_DATA_DIR` before running migration, seed, or the application to use another local
directory. Backups are stored under `<POCKETCOIN_DATA_DIR>/backups` and are managed from Settings →
Data safety. Restore accepts only backups already listed there and requires typing `RESTORE`; the
application creates a retained pre-restore backup automatically.

For isolated setup or destructive verification:

```bash
POCKETCOIN_DATA_DIR=/tmp/pocketcoin-release make setup
POCKETCOIN_DATA_DIR=/tmp/pocketcoin-release make run
```

### Reproducible audit data

The repository includes a deterministic audit-data generator instead of a committed SQLite
database. Always point it at a new, isolated directory and choose the date that the manual audit
will use as its dashboard/report end date:

```bash
POCKETCOIN_DATA_DIR=/tmp/pocketcoin-audit \
AUDIT_REFERENCE_DATE=2026-07-13 \
make audit-data

POCKETCOIN_DATA_DIR=/tmp/pocketcoin-audit make run
```

The fixture contains recognizable checking, savings, cash, credit-card, and loan accounts;
income, expense, tagged, and transfer transactions across the preceding 90 days; current-month
budgets; and pending monthly income, expense, and debt payments. Its currency is CRC and locale is
`es-CR`. Use the selected reference date as `end_date` to reproduce forecast, budget, report, and
debt-analysis observations.

The target refuses to run without both explicit variables, will not mix the fixture with existing
transactions or feature data, and is idempotent only for the same reference date. Choose another
empty directory for a different audit date. The generated database is disposable local evidence
and must not be committed.

## Known limitations

- PocketCoin is a local, single-user application with no authentication or network deployment.
- Local databases and backups are not encrypted by PocketCoin.
- Restore supports only backups from the current repository schema revision.
- Arbitrary restore paths and uploads are intentionally unsupported.
- Backups have no automatic schedule, deletion, or retention policy.

## Development commands

From the repository root:

```bash
make install
make migrate
make seed
make dev-backend
make dev-frontend
```

Run `make check` for lint, strict TypeScript checks, and automated tests; run `make build` for the
production frontend bundle.
