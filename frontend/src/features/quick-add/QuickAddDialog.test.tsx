import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCategories, getFinancialAccounts, getTags, saveCategory, saveTag } from "../../api/referenceData";
import { createTransaction, createTransfer } from "../../api/transactions";
import { QuickAddDialog } from "./QuickAddDialog";

vi.mock("../../api/referenceData", () => ({ getCategories: vi.fn(), getFinancialAccounts: vi.fn(), getTags: vi.fn(), saveCategory: vi.fn(), saveTag: vi.fn() }));
vi.mock("../../api/transactions", () => ({ createTransaction: vi.fn(), createTransfer: vi.fn() }));

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
  fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Lunch" } });
}

describe("QuickAddDialog", () => {
  beforeEach(() => {
    vi.mocked(getFinancialAccounts).mockResolvedValue(accounts);
    vi.mocked(getCategories).mockResolvedValue(categories);
    vi.mocked(getTags).mockResolvedValue(tags);
    vi.mocked(createTransaction).mockResolvedValue({} as Awaited<ReturnType<typeof createTransaction>>);
    vi.mocked(createTransfer).mockResolvedValue({} as Awaited<ReturnType<typeof createTransfer>>);
    vi.mocked(saveCategory).mockResolvedValue({ id: 12, name: "Travel", direction: "expense", is_default: false, is_active: true });
    vi.mocked(saveTag).mockResolvedValue({ id: 21, name: "Vacation", is_active: true });
  });

  it("does not let a tag lookup failure block an expense", async () => {
    vi.mocked(getTags).mockRejectedValue(new Error("Tags unavailable"));
    renderDialog();
    await fillExpense();
    expect(await screen.findByText("Tags are unavailable. You can still add this transaction without one.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(createTransaction).toHaveBeenCalledOnce());
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ financial_account_id: null }));
  });

  it("creates recurrence details from an expense without a specific account", async () => {
    renderDialog();
    await fillExpense();
    fireEvent.click(screen.getByLabelText("Repeat this transaction"));
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "monthly" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "date" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByLabelText("Debt payment"));
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      financial_account_id: null,
      is_debt_payment: true,
      recurrence: { frequency: "monthly", end_date: "2026-12-31" },
    })));
  });

  it("classifies a one-off expense as debt without requiring recurrence", async () => {
    renderDialog();
    await fillExpense();
    fireEvent.click(screen.getByLabelText("Debt payment"));
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      is_debt_payment: true,
      recurrence: undefined,
    })));
  });

  it("allows General as exactly one transfer endpoint", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /transfer/i }));
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Cash deposit" } });
    fireEvent.change(screen.getByLabelText("From account"), { target: { value: "general" } });
    fireEvent.change(screen.getByLabelText("To account"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add transfer" }));

    await waitFor(() => expect(createTransfer).toHaveBeenCalledWith(expect.objectContaining({
      from_account_id: null,
      to_account_id: 1,
    })));
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

  it("creates and selects a category without losing the Quick Add draft", async () => {
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "12.50" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Travel" } });
    fireEvent.click(screen.getByRole("button", { name: "Create category" }));

    await waitFor(() => expect(saveCategory).toHaveBeenCalledWith(null, { name: "Travel", direction: "expense" }));
    expect(screen.getByLabelText("Amount")).toHaveValue(12.5);
    expect(screen.getByLabelText("Description")).toHaveValue("Lunch");
    expect(screen.getByLabelText("Category")).toHaveValue("12");
  });

  it("offers compact reference add controls without optional or verbose General labels", async () => {
    renderDialog();
    await screen.findByLabelText("Amount");
    expect(screen.getByRole("button", { name: "Add category" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add tag" })).toBeInTheDocument();
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Account")).toHaveTextContent("General");
    expect(screen.getByLabelText("Account")).not.toHaveTextContent("no specific account");
  });
});
