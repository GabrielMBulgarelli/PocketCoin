import csv
import io
from datetime import date

from app.models import (
    AccountKind,
    Category,
    CategoryDirection,
    FinancialAccount,
    Tag,
    TransactionKind,
)
from app.services.dashboard import cash_flow_table, period_comparison
from app.services.transactions import (
    TransactionInput,
    TransferInput,
    create_transaction,
    create_transfer,
    export_transactions_csv,
)


def seed_reference_data(session):
    account = FinancialAccount(
        name="=Checking",
        kind=AccountKind.CHECKING,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    second = FinancialAccount(
        name="Savings",
        kind=AccountKind.SAVINGS,
        opening_balance_minor=0,
        opening_balance_date=date(2026, 1, 1),
    )
    income = Category(name="+Salary", direction=CategoryDirection.INCOME)
    expense = Category(name="@Food", direction=CategoryDirection.EXPENSE)
    tag = Tag(name="-Reviewed")
    session.add_all([account, second, income, expense, tag])
    session.flush()
    return account, second, income, expense, tag


def test_cash_flow_table_calculates_current_and_equivalent_prior_period(session) -> None:
    account, _, income, expense, _ = seed_reference_data(session)
    for kind, amount, day, category in [
        (TransactionKind.INCOME, 101, 1, income),
        (TransactionKind.INCOME, 100, 2, income),
        (TransactionKind.EXPENSE, 101, 2, expense),
        (TransactionKind.EXPENSE, 100, 3, expense),
        (TransactionKind.INCOME, 300, -2, income),
        (TransactionKind.EXPENSE, 50, -1, expense),
    ]:
        transaction_date = date(2026, 7, day) if day > 0 else date(2026, 6, 30 + day)
        create_transaction(
            session,
            TransactionInput(
                account.id, category.id, kind, amount, transaction_date, "Entry"
            ),
        )

    result = cash_flow_table(session, date(2026, 7, 1), date(2026, 7, 3))

    assert result == {
        "period_days": 3,
        "income": {
            "count": 2,
            "total_minor": 201,
            "daily_average_minor": 67,
            "average_transaction_minor": 101,
        },
        "expense": {
            "count": 2,
            "total_minor": 201,
            "daily_average_minor": 67,
            "average_transaction_minor": 101,
        },
        "net_minor": 0,
        "previous_income_minor": 300,
        "previous_expense_minor": 50,
        "previous_net_minor": 250,
        "net_change_minor": -250,
    }


def test_period_comparison_supports_all_metrics_and_keeps_expense_default(session) -> None:
    account, _, income, expense, _ = seed_reference_data(session)
    create_transaction(
        session,
        TransactionInput(
            account.id, income.id, TransactionKind.INCOME, 500, date(2026, 7, 1), "Pay"
        ),
    )
    create_transaction(
        session,
        TransactionInput(
            account.id, expense.id, TransactionKind.EXPENSE, 200, date(2026, 7, 1), "Food"
        ),
    )

    expenses = period_comparison(session, date(2026, 7, 1), date(2026, 7, 1))
    income_rows = period_comparison(
        session, date(2026, 7, 1), date(2026, 7, 1), metric="income"
    )
    cash_flow_rows = period_comparison(
        session, date(2026, 7, 1), date(2026, 7, 1), metric="cash_flow"
    )

    assert expenses[0]["current_minor"] == 200
    assert income_rows[0]["current_minor"] == 500
    assert cash_flow_rows[0]["current_minor"] == 300


def test_csv_export_is_complete_ordered_and_neutralizes_user_text(session) -> None:
    account, second, income, expense, tag = seed_reference_data(session)
    transaction = create_transaction(
        session,
        TransactionInput(
            account.id,
            income.id,
            TransactionKind.INCOME,
            1234,
            date(2026, 7, 2),
            " =formula",
            "\tunsafe",
            [tag.id],
        ),
    )
    transaction.external_id = "\runsafe"
    create_transfer(
        session,
        TransferInput(account.id, second.id, 500, date(2026, 7, 1), "+move"),
    )
    for index in range(205):
        create_transaction(
            session,
            TransactionInput(
                account.id,
                expense.id,
                TransactionKind.EXPENSE,
                100,
                date(2026, 6, 1),
                f"Row {index}",
            ),
        )

    content, filename = export_transactions_csv(session, currency="USD")
    decoded = content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(decoded)))

    assert filename == "pocketcoin-transactions.csv"
    assert content.startswith(b"\xef\xbb\xbf")
    assert len(rows) == 209  # header + 205 rows + one income + two transfer rows
    assert rows[1][1] == "2026-06-01"
    exported = next(row for row in rows if row[0] == str(transaction.id))
    assert exported[3:12] == [
        "12.34",
        "USD",
        "'=formula",
        "'\tunsafe",
        "'=Checking",
        "'+Salary",
        "'-Reviewed",
        "manual",
        "'\runsafe",
    ]
    kinds = {row[2] for row in rows[1:]}
    assert {"transfer_out", "transfer_in"}.issubset(kinds)
