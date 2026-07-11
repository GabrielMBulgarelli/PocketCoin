from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import TransactionKind
from app.schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    FinancialAccountCreate,
    FinancialAccountRead,
    FinancialAccountUpdate,
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
    get_transaction,
    list_transactions,
    update_transaction,
    update_transfer,
)

router = APIRouter(prefix="/api")
SessionDependency = Annotated[Session, Depends(get_session)]


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
