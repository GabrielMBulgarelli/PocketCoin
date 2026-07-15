from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import TransactionKind
from app.schemas import (
    BackupRead,
    BalanceForecastRead,
    BudgetCreate,
    BudgetProgressRead,
    BudgetRead,
    BudgetUpdate,
    CashFlowPoint,
    CashFlowTableRead,
    CategoryCreate,
    CategoryRead,
    CategorySpendingPoint,
    CategoryUpdate,
    CreditAccountUtilizationRead,
    CreditUtilizationRead,
    DashboardSummaryRead,
    DebtToIncomeRead,
    FinancialAccountCreate,
    FinancialAccountRead,
    FinancialAccountUpdate,
    ImportBatchRead,
    ImportCommitPayload,
    ImportCommitRead,
    ImportMappingPayload,
    ImportPreviewRead,
    ImportValidationRead,
    PeriodComparisonPoint,
    PlannedPaymentCreate,
    PlannedPaymentMarkPaid,
    PlannedPaymentMarkPaidRead,
    PlannedPaymentRead,
    PlannedPaymentUpdate,
    RecurringDebtsRead,
    RestoreBackupRead,
    RestoreBackupRequest,
    SettingsRead,
    SettingsUpdate,
    TagCreate,
    TagRead,
    TagUpdate,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    TransferCreate,
)
from app.services.backups import create_backup, list_backups, restore_backup
from app.services.budgets import (
    BudgetInput,
    create_budget,
    delete_budget,
    list_budget_progress,
    list_budgets,
    update_budget,
)
from app.services.dashboard import (
    balance_forecast,
    cash_flow,
    cash_flow_table,
    category_spending,
    credit_account_utilization,
    credit_utilization,
    dashboard_summary,
    debt_to_income,
    expense_structure,
    period_comparison,
    recurring_debts,
)
from app.services.imports import (
    MAX_UPLOAD_BYTES,
    ImportMapping,
    commit_preview,
    create_preview,
    list_import_batches,
    validate_preview,
)
from app.services.planned_payments import (
    PlannedPaymentInput,
    create_planned_payment,
    delete_planned_payment,
    list_planned_payments,
    list_upcoming_payments,
    mark_planned_payment_paid,
    update_planned_payment,
)
from app.services.reference_data import (
    AccountInput,
    create_category,
    create_financial_account,
    create_tag,
    ensure_settings,
    list_categories,
    list_financial_accounts,
    list_tags,
    update_category,
    update_financial_account,
    update_settings,
    update_tag,
)
from app.services.transactions import (
    TransactionInput,
    TransferInput,
    create_transaction,
    create_transfer,
    delete_transaction,
    delete_transfer,
    export_transactions_csv,
    get_transaction,
    list_transactions,
    update_transaction,
    update_transfer,
)

router = APIRouter(prefix="/api")
SessionDependency = Annotated[Session, Depends(get_session)]


def _import_mapping(payload: ImportMappingPayload) -> ImportMapping:
    return ImportMapping(**payload.model_dump())  # type: ignore[arg-type]


@router.get("/backups", response_model=list[BackupRead])
def get_backups() -> list[BackupRead]:
    return list_backups()


@router.post("/backups", response_model=BackupRead, status_code=201)
def post_backup() -> BackupRead:
    return create_backup()


@router.post("/backups/{backup_id}/restore", response_model=RestoreBackupRead)
def post_backup_restore(backup_id: str, payload: RestoreBackupRequest) -> RestoreBackupRead:
    return restore_backup(backup_id, payload.confirmation)


@router.get("/imports", response_model=list[ImportBatchRead])
def get_imports(session: SessionDependency) -> list[ImportBatchRead]:
    return list_import_batches(session)


@router.post("/imports/preview", response_model=ImportPreviewRead, status_code=201)
async def post_import_preview(
    request: Request, filename: str, session: SessionDependency
) -> ImportPreviewRead:
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > MAX_UPLOAD_BYTES:
            from app.services.reference_data import DomainValidationError

            raise DomainValidationError("CSV files may not exceed 5 MiB.", "file")
        content.extend(chunk)
    return create_preview(session, filename, bytes(content))


@router.post("/imports/{preview_id}/validate", response_model=ImportValidationRead)
def post_import_validation(
    preview_id: str, payload: ImportMappingPayload, session: SessionDependency
) -> ImportValidationRead:
    return validate_preview(session, preview_id, _import_mapping(payload))


@router.post("/imports/{preview_id}/commit", response_model=ImportCommitRead)
def post_import_commit(
    preview_id: str, payload: ImportCommitPayload, session: SessionDependency
) -> ImportCommitRead:
    mapping_payload = ImportMappingPayload(**payload.model_dump(exclude={"selected_row_numbers"}))
    return commit_preview(
        session, preview_id, _import_mapping(mapping_payload), payload.selected_row_numbers
    )


@router.get("/planned-payments", response_model=list[PlannedPaymentRead])
def get_planned_payments(session: SessionDependency) -> list[PlannedPaymentRead]:
    return list_planned_payments(session)


@router.post("/planned-payments", response_model=PlannedPaymentRead, status_code=201)
def post_planned_payment(
    payload: PlannedPaymentCreate, session: SessionDependency
) -> PlannedPaymentRead:
    return create_planned_payment(session, PlannedPaymentInput(**payload.model_dump()))


@router.patch("/planned-payments/{payment_id}", response_model=PlannedPaymentRead)
def patch_planned_payment(
    payment_id: int, payload: PlannedPaymentUpdate, session: SessionDependency
) -> PlannedPaymentRead:
    return update_planned_payment(session, payment_id, **payload.model_dump(exclude_unset=True))


@router.delete("/planned-payments/{payment_id}", status_code=204)
def remove_planned_payment(payment_id: int, session: SessionDependency) -> None:
    delete_planned_payment(session, payment_id)


@router.post(
    "/planned-payments/{payment_id}/mark-paid",
    response_model=PlannedPaymentMarkPaidRead,
)
def post_planned_payment_mark_paid(
    payment_id: int, payload: PlannedPaymentMarkPaid, session: SessionDependency
) -> PlannedPaymentMarkPaidRead:
    return mark_planned_payment_paid(session, payment_id, payload.expected_due_date)


@router.get("/dashboard/upcoming-payments", response_model=list[PlannedPaymentRead])
def get_upcoming_payments(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> list[PlannedPaymentRead]:
    del tag_id
    return list_upcoming_payments(session, start_date, end_date, financial_account_id, category_id)


@router.get("/budgets", response_model=list[BudgetRead])
def get_budgets(session: SessionDependency, month: date) -> list[BudgetRead]:
    return list_budgets(session, month)


@router.post("/budgets", response_model=BudgetRead, status_code=201)
def post_budget(payload: BudgetCreate, session: SessionDependency) -> BudgetRead:
    return create_budget(session, BudgetInput(**payload.model_dump()))


@router.patch("/budgets/{budget_id}", response_model=BudgetRead)
def patch_budget(budget_id: int, payload: BudgetUpdate, session: SessionDependency) -> BudgetRead:
    return update_budget(session, budget_id, payload.limit_minor)


@router.delete("/budgets/{budget_id}", status_code=204)
def remove_budget(budget_id: int, session: SessionDependency) -> None:
    delete_budget(session, budget_id)


@router.get("/dashboard/budget-progress", response_model=list[BudgetProgressRead])
def get_budget_progress(
    session: SessionDependency,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> list[BudgetProgressRead]:
    return list_budget_progress(session, end_date, financial_account_id, category_id, tag_id)


@router.get("/settings", response_model=SettingsRead)
def get_settings(session: SessionDependency) -> SettingsRead:
    return ensure_settings(session)


@router.patch("/settings", response_model=SettingsRead)
def patch_settings(payload: SettingsUpdate, session: SessionDependency) -> SettingsRead:
    return update_settings(session, **payload.model_dump(exclude_unset=True))


@router.get("/financial-accounts", response_model=list[FinancialAccountRead])
def get_financial_accounts(session: SessionDependency) -> list[FinancialAccountRead]:
    return list_financial_accounts(session)


@router.post("/financial-accounts", response_model=FinancialAccountRead, status_code=201)
def post_financial_account(
    payload: FinancialAccountCreate, session: SessionDependency
) -> FinancialAccountRead:
    return create_financial_account(session, AccountInput(**payload.model_dump()))


@router.patch("/financial-accounts/{account_id}", response_model=FinancialAccountRead)
def patch_financial_account(
    account_id: int, payload: FinancialAccountUpdate, session: SessionDependency
) -> FinancialAccountRead:
    return update_financial_account(session, account_id, **payload.model_dump(exclude_unset=True))


@router.get("/categories", response_model=list[CategoryRead])
def get_categories(session: SessionDependency) -> list[CategoryRead]:
    return list_categories(session)


@router.post("/categories", response_model=CategoryRead, status_code=201)
def post_category(payload: CategoryCreate, session: SessionDependency) -> CategoryRead:
    return create_category(session, **payload.model_dump())


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def patch_category(
    category_id: int, payload: CategoryUpdate, session: SessionDependency
) -> CategoryRead:
    return update_category(session, category_id, **payload.model_dump(exclude_unset=True))


@router.get("/tags", response_model=list[TagRead])
def get_tags(session: SessionDependency) -> list[TagRead]:
    return list_tags(session)


@router.get("/dashboard/summary", response_model=DashboardSummaryRead)
def get_dashboard_summary(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> DashboardSummaryRead:
    return dashboard_summary(
        session, start_date, end_date, financial_account_id, category_id, tag_id
    )


@router.get("/dashboard/balance-forecast", response_model=BalanceForecastRead)
def get_balance_forecast(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> BalanceForecastRead:
    del start_date
    return balance_forecast(
        session, end_date, financial_account_id, category_id, tag_id
    )


@router.get("/dashboard/credit-utilization", response_model=CreditUtilizationRead)
def get_credit_utilization(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> CreditUtilizationRead:
    del start_date, category_id, tag_id
    return credit_utilization(session, end_date, financial_account_id)


@router.get(
    "/dashboard/credit-account-utilization",
    response_model=list[CreditAccountUtilizationRead],
)
def get_credit_account_utilization(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> list[CreditAccountUtilizationRead]:
    del category_id, tag_id
    return credit_account_utilization(
        session, start_date, end_date, financial_account_id
    )


@router.get("/dashboard/recurring-debts", response_model=RecurringDebtsRead)
def get_recurring_debts(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> RecurringDebtsRead:
    del start_date, end_date, tag_id
    return recurring_debts(session, financial_account_id, category_id)


@router.get("/dashboard/debt-to-income", response_model=DebtToIncomeRead)
def get_debt_to_income(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> DebtToIncomeRead:
    del start_date
    return debt_to_income(
        session, end_date, financial_account_id, category_id, tag_id
    )


@router.get("/dashboard/cash-flow", response_model=list[CashFlowPoint])
def get_cash_flow(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> list[CashFlowPoint]:
    return cash_flow(session, start_date, end_date, financial_account_id, category_id, tag_id)


@router.get("/dashboard/cash-flow-table", response_model=CashFlowTableRead)
def get_cash_flow_table(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> CashFlowTableRead:
    return cash_flow_table(
        session, start_date, end_date, financial_account_id, category_id, tag_id
    )


@router.get("/dashboard/period-comparison", response_model=list[PeriodComparisonPoint])
def get_period_comparison(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
    metric: str = "expenses",
) -> list[PeriodComparisonPoint]:
    return period_comparison(
        session, start_date, end_date, financial_account_id, category_id, tag_id, metric
    )


@router.get("/dashboard/category-spending", response_model=list[CategorySpendingPoint])
def get_category_spending(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> list[CategorySpendingPoint]:
    return category_spending(
        session, start_date, end_date, financial_account_id, category_id, tag_id
    )


@router.get("/dashboard/expense-structure", response_model=list[CategorySpendingPoint])
def get_expense_structure(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> list[CategorySpendingPoint]:
    return expense_structure(
        session, start_date, end_date, financial_account_id, category_id, tag_id
    )


@router.get("/dashboard/recent-transactions", response_model=list[TransactionRead])
def get_recent_transactions(
    session: SessionDependency,
    start_date: date,
    end_date: date,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    tag_id: int | None = None,
) -> list[TransactionRead]:
    return list_transactions(
        session, 8, 0, financial_account_id, category_id, None, None, start_date, end_date, tag_id
    )


@router.post("/tags", response_model=TagRead, status_code=201)
def post_tag(payload: TagCreate, session: SessionDependency) -> TagRead:
    return create_tag(session, payload.name)


@router.patch("/tags/{tag_id}", response_model=TagRead)
def patch_tag(tag_id: int, payload: TagUpdate, session: SessionDependency) -> TagRead:
    return update_tag(session, tag_id, **payload.model_dump(exclude_unset=True))


@router.get("/transactions", response_model=list[TransactionRead])
def get_transactions(
    session: SessionDependency,
    limit: int = 50,
    offset: int = 0,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    kind: TransactionKind | None = None,
    search: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tag_id: int | None = None,
    sort: str = "date_desc",
) -> list[TransactionRead]:
    return list_transactions(
        session,
        limit,
        offset,
        financial_account_id,
        category_id,
        kind,
        search,
        start_date,
        end_date,
        tag_id,
        sort,
    )


@router.get("/transactions/export.csv")
def export_transactions(
    session: SessionDependency,
    financial_account_id: int | None = None,
    category_id: int | None = None,
    kind: TransactionKind | None = None,
    search: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tag_id: int | None = None,
    sort: str = "date_asc",
) -> Response:
    settings = ensure_settings(session)
    content, filename = export_transactions_csv(
        session,
        settings.base_currency,
        financial_account_id,
        category_id,
        kind,
        search,
        start_date,
        end_date,
        tag_id,
        sort,
    )
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/transactions", response_model=TransactionRead, status_code=201)
def post_transaction(payload: TransactionCreate, session: SessionDependency) -> TransactionRead:
    return create_transaction(session, TransactionInput(**payload.model_dump()))


@router.get("/transactions/{transaction_id}", response_model=TransactionRead)
def get_transaction_route(transaction_id: int, session: SessionDependency) -> TransactionRead:
    return get_transaction(session, transaction_id)


@router.patch("/transactions/{transaction_id}", response_model=TransactionRead)
def patch_transaction(
    transaction_id: int, payload: TransactionUpdate, session: SessionDependency
) -> TransactionRead:
    return update_transaction(session, transaction_id, **payload.model_dump(exclude_unset=True))


@router.delete("/transactions/{transaction_id}", status_code=204)
def remove_transaction(transaction_id: int, session: SessionDependency) -> None:
    delete_transaction(session, transaction_id)


@router.post("/transfers", response_model=list[TransactionRead], status_code=201)
def post_transfer(payload: TransferCreate, session: SessionDependency) -> list[TransactionRead]:
    return list(create_transfer(session, TransferInput(**payload.model_dump())))


@router.patch("/transfers/{transfer_group_id}", response_model=list[TransactionRead])
def patch_transfer(
    transfer_group_id: str, payload: TransferCreate, session: SessionDependency
) -> list[TransactionRead]:
    return list(update_transfer(session, transfer_group_id, TransferInput(**payload.model_dump())))


@router.delete("/transfers/{transfer_group_id}", status_code=204)
def remove_transfer(transfer_group_id: str, session: SessionDependency) -> None:
    delete_transfer(session, transfer_group_id)
