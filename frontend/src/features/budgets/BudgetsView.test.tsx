import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "../../app/queryKeys";
import { BudgetsView } from "./BudgetsView";

const categories = [
  {
    id: 10,
    name: "Food",
    direction: "expense",
    is_default: false,
    is_active: true,
  },
  {
    id: 11,
    name: "Transport",
    direction: "expense",
    is_default: false,
    is_active: true,
  },
  {
    id: 12,
    name: "Salary",
    direction: "income",
    is_default: false,
    is_active: true,
  },
];
const budget = (id: number, categoryName: string) => ({
  id,
  category_id: id + 9,
  category_name: categoryName,
  month: "2026-07-01",
  limit_minor: 100_000,
  spent_minor: 20_000,
  remaining_minor: 80_000,
  percentage_used: 0.2,
  over_budget: false,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
});
const budgets = [budget(1, "Food")];

afterEach(() => vi.unstubAllGlobals());

function renderView(items = budgets) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const payload = String(input).endsWith("/api/categories")
        ? categories
        : items;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => payload,
      });
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <BudgetsView currency="USD" locale="en-US" />
    </QueryClientProvider>,
  );
  return { client, ...result };
}

describe("BudgetsView", () => {
  it("keeps the month picker accessible without showing a visible label", async () => {
    renderView();

    await screen.findByRole("heading", { name: "Food" });
    expect(screen.getByLabelText("Budget month")).toHaveAttribute(
      "type",
      "month",
    );
    expect(screen.queryByText("Budget month")).not.toBeInTheDocument();
  });

  it("leaves the remaining portion of a budget bar unfilled", async () => {
    renderView();

    const progress = await screen.findByLabelText("20 percent used");
    expect(progress.firstElementChild).toHaveStyle({ width: "20%" });
  });

  it("offers another unused expense category in the same month", async () => {
    renderView();

    await screen.findByRole("heading", { name: "Food" });
    const create = await screen.findByRole("button", { name: "Create budget" });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    const dialog = await screen.findByRole("dialog");
    const category = within(dialog).getByRole("combobox", { name: "Category" });
    expect(
      within(category).queryByRole("option", { name: "Food" }),
    ).not.toBeInTheDocument();
    expect(
      within(category).getByRole("option", { name: "Transport" }),
    ).toBeInTheDocument();
    expect(
      within(category).queryByRole("option", { name: "Salary" }),
    ).not.toBeInTheDocument();
  });

  it("visibly mutes the category dropdown when editing locks it", async () => {
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const category = within(await screen.findByRole("dialog")).getByRole(
      "combobox",
      { name: "Category" },
    );
    expect(category).toBeDisabled();
    expect(category).toHaveClass(
      "disabled:bg-muted",
      "disabled:text-muted-foreground",
      "disabled:cursor-not-allowed",
    );
  });

  it("shows four budgets per page and navigates between pages", async () => {
    renderView([
      budget(1, "Food"),
      budget(2, "Transport"),
      budget(3, "Housing"),
      budget(4, "Utilities"),
      budget(5, "Health"),
    ]);

    await screen.findByRole("heading", { name: "Food" });
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(
      screen.queryByRole("heading", { name: "Health" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous budgets page" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next budgets page" }));

    expect(screen.getByRole("heading", { name: "Health" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next budgets page" }),
    ).toBeDisabled();
  });

  it("hides pagination for a single budget page", async () => {
    renderView();

    await screen.findByRole("heading", { name: "Food" });
    expect(
      screen.queryByRole("navigation", { name: "Budgets pagination" }),
    ).not.toBeInTheDocument();
  });

  it("resets for a new month, retains a valid page, and clamps after removals", async () => {
    const items = [
      budget(1, "Food"),
      budget(2, "Transport"),
      budget(3, "Housing"),
      budget(4, "Utilities"),
      budget(5, "Health"),
    ];
    const { client } = renderView(items);

    await screen.findByRole("heading", { name: "Food" });
    fireEvent.click(screen.getByRole("button", { name: "Next budgets page" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Budget month"), {
      target: { value: "2026-08" },
    });
    await waitFor(() =>
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next budgets page" }));
    act(() => {
      client.setQueryData(
        [...queryKeys.budgets, "2026-08"],
        items.map((item) =>
          item.id === 5 ? { ...item, category_name: "Medical" } : item,
        ),
      );
    });
    await screen.findByRole("heading", { name: "Medical" });
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    act(() => {
      client.setQueryData([...queryKeys.budgets, "2026-08"], items.slice(0, 4));
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Food" })).toBeInTheDocument();
      expect(
        screen.queryByRole("navigation", { name: "Budgets pagination" }),
      ).not.toBeInTheDocument();
    });
  });
});
