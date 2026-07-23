import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFinancialAccounts, saveAccount } from "../../api/referenceData";
import { FinancialAccountsView } from "./FinancialAccountsView";

vi.mock("../../api/referenceData", () => ({ getFinancialAccounts: vi.fn(), saveAccount: vi.fn() }));

const card = { id: 1, name: "Card", kind: "credit_card", opening_balance_minor: 0, opening_balance_date: "2026-07-01", credit_limit_minor: 100_000, is_active: true };

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><FinancialAccountsView currency="USD" locale="en-US" /></QueryClientProvider>);
}

describe("FinancialAccountsView", () => {
  beforeEach(() => {
    vi.mocked(getFinancialAccounts).mockResolvedValue([card]);
    vi.mocked(saveAccount).mockResolvedValue({ ...card, kind: "checking", credit_limit_minor: null });
  });

  it("warns before a cross-family kind change and clears the credit limit", async () => {
    renderView();
    fireEvent.click(await screen.findByLabelText("Edit Card"));
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "checking" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("historical");
    fireEvent.click(screen.getByRole("button", { name: "Change account type" }));
    await waitFor(() => expect(saveAccount).toHaveBeenCalledWith(1, expect.objectContaining({ kind: "checking", credit_limit_minor: null })));
  });

  it("saves same-family kind changes directly", async () => {
    vi.mocked(getFinancialAccounts).mockResolvedValue([{ ...card, kind: "checking", credit_limit_minor: null }]);
    renderView();
    fireEvent.click(await screen.findByLabelText("Edit Card"));
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "savings" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));

    await waitFor(() => expect(saveAccount).toHaveBeenCalledWith(1, expect.objectContaining({ kind: "savings" })));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
