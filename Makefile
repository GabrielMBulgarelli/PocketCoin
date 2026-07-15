UV_CACHE_DIR := $(CURDIR)/.cache/uv
NPM_CONFIG_CACHE := $(CURDIR)/.cache/npm
export UV_CACHE_DIR
export NPM_CONFIG_CACHE

.PHONY: setup run install lint typecheck test build test-backend test-frontend check dev-backend dev-frontend migrate seed audit-data

setup: install migrate seed build

run:
	@test -f frontend/dist/index.html || (echo "Frontend build missing. Run 'make setup' or 'make build' first." && exit 1)
	cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

install:
	cd backend && uv sync --all-groups
	cd frontend && npm install

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

typecheck:
	cd frontend && npm run typecheck

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && npm run test

build:
	cd frontend && npm run build

check: lint typecheck test

dev-backend:
	cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

dev-frontend:
	cd frontend && npm run dev

migrate:
	cd backend && uv run alembic upgrade head

seed:
	cd backend && uv run python -m app.seed

audit-data:
	@test -n "$(POCKETCOIN_DATA_DIR)" || (echo "POCKETCOIN_DATA_DIR must name an isolated audit directory." && exit 1)
	@test -n "$(AUDIT_REFERENCE_DATE)" || (echo "AUDIT_REFERENCE_DATE must use YYYY-MM-DD." && exit 1)
	cd backend && POCKETCOIN_DATA_DIR="$(POCKETCOIN_DATA_DIR)" uv run alembic upgrade head
	cd backend && POCKETCOIN_DATA_DIR="$(POCKETCOIN_DATA_DIR)" uv run python -m app.seed
	cd backend && POCKETCOIN_DATA_DIR="$(POCKETCOIN_DATA_DIR)" POCKETCOIN_AUDIT_DATA=1 uv run python -m app.audit_seed --reference-date "$(AUDIT_REFERENCE_DATE)"
