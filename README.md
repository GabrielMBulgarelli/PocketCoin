# PocketCoin

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

The project has reached the early product foundation stage. The current implementation includes:

- a local FastAPI backend with SQLite persistence
- a Vite + React frontend with a shell-based navigation experience
- core reference data APIs for financial accounts, categories, and tags
- transaction and transfer support with balance-aware behavior
- a basic transaction ledger and workspace UI

## Progress Against the Checklist

The work so far covers the foundational backend and the initial UI shell. The next major milestones are:

- complete financial-data management views
- add quick-add flows for income, expense, and transfer
- build the core dashboard and budget experience
- finish reporting, import, and settings workflows

## Implementation Checklist

Based on the architecture, build plan, and design system guidance, the current focus areas are:

- [x] Local FastAPI backend and SQLite persistence
- [x] Core financial reference data models and APIs
- [x] Transaction and transfer handling with balance effects
- [x] Shell navigation and basic workspace layout
- [ ] Financial account, category, and tag management views
- [ ] Transaction editing, deletion, filtering, and pagination
- [ ] Quick-add experience for income, expense, and transfer
- [ ] Dashboard cards, charts, and summary analytics
- [ ] Budget, reporting, import, and settings workflows
- [ ] Design-system polish and responsive UI refinement

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

## Run Locally

From the repository root:

```bash
make install
make migrate
make seed
make run
```

The app runs locally on 127.0.0.1 and stores data in the local SQLite database.
