import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCategories, getFinancialAccounts, getTags } from "../../api/referenceData";
import { createTransaction } from "../../api/transactions";
import { QuickAddDialog } from "./QuickAddDialog";

vi.mock("../../api/referenceData", () => ({ getCategories: vi.fn(), getFinancialAccounts: vi.fn(), getTags: vi.fn() }));
vi.mock("../../api/transactions", () => ({ createTransaction: vi.fn(), createTransfer: vi.fn() }));
vi.mock("../../api/plannedPayments", () => ({ createPlannedPayment: vi.fn() }));

const accounts = [{ id: 1, name: "Checking", kind: "checking", opening_balance_minor: 0, opening_balance_date: "2026-01-01", credit_limit_minor: null, is_active: true }];
const categories = [
  { id: 10, name: "Food", direction: "expense" as const, is_default: true, is_active: true },
  { id: 11, name: "Salary", direction: "income" as const, is_default: true, is_active: true },
];
const tags = [{ id: 20, name: "Home", is_active: true }];

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onOpenChange = vi.fn();
  render(<QueryClientProvider client={client}><QuickAddDialog open onCreated={vi.fn()} onOpenChange={onOpenChange} /></QueryClientProvider>);
  return { onOpenChange };
}

async function fillExpense() {
  fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "12.50" } });
  fireEvent.change(screen.getByLabelText(/^Account/), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Lunch" } });
}

describe("QuickAddDialog", () => {
  beforeEach(() => {
    vi.mocked(getFinancialAccounts).mockResolvedValue(accounts);
    vi.mocked(getCategories).mockResolvedValue(categories);
    vi.mocked(getTags).mockResolvedValue(tags);
    vi.mocked(createTransaction).mockResolvedValue({} as Awaited<ReturnType<typeof createTransaction>>);
  });

  it("does not let a tag lookup failure block an expense", async () => {
    vi.mocked(getTags).mockRejectedValue(new Error("Tags unavailable"));
    renderDialog();
    await fillExpense();
    expect(await screen.findByText("Tags are unavailable. You can still add this transaction without one.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(createTransaction).toHaveBeenCalledOnce());
  });

  it("clears mode-specific references while preserving shared entry fields", async () => {
    renderDialog();
    await fillExpense();
    fireEvent.change(screen.getByLabelText(/^Tag/), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /income/i }));
    expect(screen.getByLabelText("Amount")).toHaveValue(12.5);
    expect(screen.getByLabelText("Description")).toHaveValue("Lunch");
    expect(screen.getByLabelText(/^Account/)).toHaveValue("");
    expect(screen.getByLabelText(/^Category/)).toHaveValue("");
    expect(screen.getByLabelText(/^Tag/)).toHaveValue("");
  });

  it("keeps values and the dialog open after a recoverable mutation error", async () => {
    vi.mocked(createTransaction).mockRejectedValue(new Error("Server rejected the transaction."));
    const { onOpenChange } = renderDialog();
    await fillExpense();
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server rejected the transaction.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue(12.5);
    expect(screen.getByLabelText("Description")).toHaveValue("Lunch");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
