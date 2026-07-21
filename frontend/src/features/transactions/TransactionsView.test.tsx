import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTransactionTimeline } from "../../api/transactions";
import { updatePlannedPayment } from "../../api/plannedPayments";
import { formatShortDate } from "../../lib/format";
import { TransactionsView } from "./TransactionsView";

vi.mock("../../api/referenceData", () => ({
  getFinancialAccounts: vi.fn().mockResolvedValue([{ id: 1, name: "Cuenta", kind: "checking", opening_balance_minor: 0, opening_balance_date: "2026-01-01", credit_limit_minor: null, is_active: true }]),
  getCategories: vi.fn().mockResolvedValue([{ id: 2, name: "Comida", direction: "expense", is_default: false, is_active: true }]),
  getTags: vi.fn().mockResolvedValue([{ id: 3, name: "Trabajo", is_active: true }]),
}));
vi.mock("../../api/transactions", async (original) => {
  const actual = await original<typeof import("../../api/transactions")>();
  return { ...actual, getTransactionTimeline: vi.fn() };
});
vi.mock("../../api/plannedPayments", async (original) => {
  const actual = await original<typeof import("../../api/plannedPayments")>();
  return { ...actual, updatePlannedPayment: vi.fn().mockResolvedValue({}) };
});

function renderTransactions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TransactionsView currency="CRC" locale="es-CR" /></QueryClientProvider>);
}

describe("TransactionsView filters and formatting", () => {
  beforeEach(() => {
    vi.mocked(getTransactionTimeline).mockResolvedValue([{ row_type: "transaction", id: 9, transaction_date: "2026-07-13", kind: "expense", amount_minor: 123456, description: "Almuerzo", notes: null, category_id: 2, financial_account_id: 1, transfer_group_id: null, planned_payment_id: null, scheduled_for: null, recurrence: null, end_date: null, remaining_occurrences: null, is_debt_payment: false, needs_attention: false }]);
  });

  it("uses saved locale and currency in the ledger", async () => {
    renderTransactions();
    expect(await screen.findByText("Almuerzo")).toBeInTheDocument();
    expect(screen.getByText(formatShortDate("2026-07-13", "es-CR"))).toBeInTheDocument();
    expect(screen.getByText("Almuerzo").closest("tr")).toHaveTextContent(/−₡1\s234,56/);
  });

  it("sends date and tag filters and resets server pagination", async () => {
    renderTransactions();
    await screen.findByText("Almuerzo");

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-07-31" } });
    fireEvent.change(screen.getByLabelText("Tag"), { target: { value: "3" } });

    await waitFor(() => expect(getTransactionTimeline).toHaveBeenLastCalledWith(expect.objectContaining({
      start_date: "2026-07-01",
      end_date: "2026-07-31",
      tag_id: "3",
      limit: 25,
      offset: 0,
    }), expect.any(AbortSignal)));
  });

  it("filters and labels transactions without a specific account as General", async () => {
    vi.mocked(getTransactionTimeline).mockResolvedValueOnce([{ row_type: "transaction", id: 10, transaction_date: "2026-07-14", kind: "income", amount_minor: 5000, description: "Cash gift", notes: null, category_id: 2, financial_account_id: null, transfer_group_id: null, planned_payment_id: null, scheduled_for: null, recurrence: null, end_date: null, remaining_occurrences: null, is_debt_payment: false, needs_attention: false }]);
    renderTransactions();
    expect(await screen.findByText("Cash gift")).toBeInTheDocument();
    expect(screen.getByText(/^General ·/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "general" } });

    await waitFor(() => expect(getTransactionTimeline).toHaveBeenLastCalledWith(expect.objectContaining({
      without_account: true,
      financial_account_id: undefined,
    }), expect.any(AbortSignal)));
  });

  it("shows only the next scheduled occurrence and its remaining count", async () => {
    vi.mocked(getTransactionTimeline).mockResolvedValueOnce([{ row_type: "scheduled", id: 12, transaction_date: "2026-08-01", kind: "expense", amount_minor: 1500, description: "Membership", notes: null, category_id: 2, financial_account_id: null, transfer_group_id: null, planned_payment_id: 12, scheduled_for: "2026-08-01", recurrence: "monthly", end_date: null, remaining_occurrences: null, is_debt_payment: false, needs_attention: false }]);
    renderTransactions();

    expect(await screen.findByText("Membership")).toBeInTheDocument();
    expect(screen.getByText(/Scheduled · monthly · Ongoing · no end date/)).toBeInTheDocument();
  });

  it("edits a scheduled occurrence without changing the future series by default", async () => {
    vi.mocked(getTransactionTimeline).mockResolvedValueOnce([{ row_type: "scheduled", id: 12, transaction_date: "2026-08-01", kind: "expense", amount_minor: 1500, description: "Membership", notes: null, category_id: 2, financial_account_id: null, transfer_group_id: null, planned_payment_id: 12, scheduled_for: "2026-08-01", recurrence: "monthly", end_date: null, remaining_occurrences: null, is_debt_payment: false, needs_attention: false }]);
    renderTransactions();

    fireEvent.click(await screen.findByLabelText("Edit Membership"));
    expect(screen.getByLabelText("Apply changes to")).toHaveValue("this_occurrence");
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));

    await waitFor(() => expect(updatePlannedPayment).toHaveBeenCalledWith(12, expect.objectContaining({
      financial_account_id: null,
      due_date: "2026-08-01",
    }), "this_occurrence"));
  });
});
