import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BudgetsView } from "./BudgetsView";

const categories = [
  { id: 10, name: "Food", direction: "expense", is_default: false, is_active: true },
  { id: 11, name: "Transport", direction: "expense", is_default: false, is_active: true },
  { id: 12, name: "Salary", direction: "income", is_default: false, is_active: true },
];
const budgets = [{
  id: 1,
  category_id: 10,
  category_name: "Food",
  month: "2026-07-01",
  limit_minor: 100_000,
  spent_minor: 20_000,
  remaining_minor: 80_000,
  progress_ratio: 0.2,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
}];

afterEach(() => vi.unstubAllGlobals());

function renderView() {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const payload = String(input).endsWith("/api/categories") ? categories : budgets;
    return Promise.resolve({ ok: true, status: 200, json: async () => payload });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><BudgetsView currency="USD" locale="en-US" /></QueryClientProvider>);
}

describe("BudgetsView", () => {
  it("offers another unused expense category in the same month", async () => {
    renderView();

    await screen.findByRole("heading", { name: "Food" });
    const create = await screen.findByRole("button", { name: "Create budget" });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    const dialog = await screen.findByRole("dialog");
    const category = within(dialog).getByRole("combobox", { name: "Category" });
    expect(within(category).queryByRole("option", { name: "Food" })).not.toBeInTheDocument();
    expect(within(category).getByRole("option", { name: "Transport" })).toBeInTheDocument();
    expect(within(category).queryByRole("option", { name: "Salary" })).not.toBeInTheDocument();
  });

  it("visibly mutes the category dropdown when editing locks it", async () => {
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const category = within(await screen.findByRole("dialog")).getByRole("combobox", { name: "Category" });
    expect(category).toBeDisabled();
    expect(category).toHaveClass("disabled:bg-muted", "disabled:text-muted-foreground", "disabled:cursor-not-allowed");
  });
});
