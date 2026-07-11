UV_CACHE_DIR := $(CURDIR)/.cache/uv
NPM_CONFIG_CACHE := $(CURDIR)/.cache/npm
export UV_CACHE_DIR
export NPM_CONFIG_CACHE

.PHONY: install lint typecheck test build test-backend test-frontend check dev-backend dev-frontend migrate seed

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
