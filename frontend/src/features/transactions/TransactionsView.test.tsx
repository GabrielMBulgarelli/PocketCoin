import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTransactions } from "../../api/transactions";
import { formatShortDate } from "../../lib/format";
import { TransactionsView } from "./TransactionsView";

vi.mock("../../api/referenceData", () => ({
  getFinancialAccounts: vi.fn().mockResolvedValue([{ id: 1, name: "Cuenta", kind: "checking", opening_balance_minor: 0, opening_balance_date: "2026-01-01", credit_limit_minor: null, is_active: true }]),
  getCategories: vi.fn().mockResolvedValue([{ id: 2, name: "Comida", direction: "expense", is_default: false, is_active: true }]),
  getTags: vi.fn().mockResolvedValue([{ id: 3, name: "Trabajo", is_active: true }]),
}));
vi.mock("../../api/transactions", async (original) => {
  const actual = await original<typeof import("../../api/transactions")>();
  return { ...actual, getTransactions: vi.fn() };
});

function renderTransactions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TransactionsView currency="CRC" locale="es-CR" /></QueryClientProvider>);
}

describe("TransactionsView filters and formatting", () => {
  beforeEach(() => {
    vi.mocked(getTransactions).mockResolvedValue([{ id: 9, transaction_date: "2026-07-13", kind: "expense", amount_minor: 123456, description: "Almuerzo", notes: null, category_id: 2, financial_account_id: 1, transfer_group_id: null }]);
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

    await waitFor(() => expect(getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({
      start_date: "2026-07-01",
      end_date: "2026-07-31",
      tag_id: "3",
      limit: 25,
      offset: 0,
    })));
  });
});
