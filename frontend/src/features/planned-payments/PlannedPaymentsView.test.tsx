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

import type { PlannedPayment } from "../../api/plannedPayments";
import { queryKeys } from "../../app/queryKeys";
import { PlannedPaymentsView } from "./PlannedPaymentsView";

const payment = (
  id: number,
  title: string,
  recurrence: PlannedPayment["recurrence"],
): PlannedPayment => ({
  id,
  title,
  amount_minor: 12_500,
  direction: "expense",
  due_date: "2026-12-23",
  status: "pending",
  recurrence,
  is_debt_payment: false,
  notes: null,
  financial_account_id: 1,
  category_id: 10,
  last_paid_due_date: null,
  last_transaction_id: null,
  created_at: "2026-07-23T00:00:00Z",
  updated_at: "2026-07-23T00:00:00Z",
  end_date: null,
  needs_attention: false,
});

afterEach(() => vi.unstubAllGlobals());

function renderView(
  items = [
    payment(1, "Credit Card Reimbursement", "monthly"),
    payment(2, "Passport renewal", "none"),
  ],
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith("/api/planned-payments")
        ? items
        : url.endsWith("/api/financial-accounts")
          ? [{ id: 1, name: "Cash", kind: "cash", is_active: true }]
          : [
              {
                id: 10,
                name: "Household",
                direction: "expense",
                is_active: true,
              },
            ];
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
      <PlannedPaymentsView currency="USD" locale="en-US" upcomingOnly />
    </QueryClientProvider>,
  );
  return { client, ...result };
}

describe("PlannedPaymentsView", () => {
  it("shows the recurring marker beside recurring titles only", async () => {
    renderView();

    const recurringRow = (
      await screen.findByRole("heading", {
        name: "Credit Card Reimbursement",
      })
    ).closest("article");
    const oneTimeRow = screen
      .getByRole("heading", {
        name: "Passport renewal",
      })
      .closest("article");

    expect(recurringRow).not.toBeNull();
    expect(oneTimeRow).not.toBeNull();
    expect(
      within(recurringRow!).getByRole("img", { name: "Recurring monthly" }),
    ).toBeInTheDocument();
    expect(
      within(oneTimeRow!).queryByRole("img", { name: /Recurring/ }),
    ).not.toBeInTheDocument();
  });

  it("separates payment status and management controls into right-aligned rows", async () => {
    renderView();

    const paymentRow = (
      await screen.findByRole("heading", {
        name: "Credit Card Reimbursement",
      })
    ).closest("article");
    expect(paymentRow).not.toBeNull();

    const statusActions = within(paymentRow!).getByRole("group", {
      name: "Payment status actions",
    });
    const managementActions = within(paymentRow!).getByRole("group", {
      name: "Payment management actions",
    });

    expect(within(statusActions).getByText("$125.00")).toBeInTheDocument();
    expect(
      within(statusActions).getByRole("button", { name: "Mark paid" }),
    ).toBeInTheDocument();
    expect(
      within(statusActions).queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      within(managementActions).getByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
    expect(
      within(managementActions).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(managementActions).toHaveClass("mt-auto", "justify-end");
  });

  it("shows four upcoming payments per page and navigates between pages", async () => {
    renderView([
      payment(5, "Payment 5", "none"),
      payment(4, "Payment 4", "none"),
      payment(3, "Payment 3", "none"),
      payment(2, "Payment 2", "none"),
      payment(1, "Payment 1", "none"),
    ]);

    await screen.findByRole("heading", { name: "Payment 1" });
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(
      screen.queryByRole("heading", { name: "Payment 5" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous upcoming page" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next upcoming page" }));

    expect(
      screen.getByRole("heading", { name: "Payment 5" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next upcoming page" }),
    ).toBeDisabled();
  });

  it("hides pagination for a single upcoming page", async () => {
    renderView();

    await screen.findByRole("heading", { name: "Credit Card Reimbursement" });
    expect(
      screen.queryByRole("navigation", { name: "Upcoming pagination" }),
    ).not.toBeInTheDocument();
  });

  it("retains a valid page and clamps after removals", async () => {
    const items = [
      payment(1, "Payment 1", "none"),
      payment(2, "Payment 2", "none"),
      payment(3, "Payment 3", "none"),
      payment(4, "Payment 4", "none"),
      payment(5, "Payment 5", "none"),
    ];
    const { client } = renderView(items);

    await screen.findByRole("heading", { name: "Payment 1" });
    fireEvent.click(screen.getByRole("button", { name: "Next upcoming page" }));

    act(() => {
      client.setQueryData(
        queryKeys.plannedPayments,
        items.map((item) =>
          item.id === 5 ? { ...item, title: "Updated Payment" } : item,
        ),
      );
    });
    await screen.findByRole("heading", { name: "Updated Payment" });
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    act(() => {
      client.setQueryData(queryKeys.plannedPayments, items.slice(0, 4));
    });
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Payment 1" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("navigation", { name: "Upcoming pagination" }),
      ).not.toBeInTheDocument();
    });
  });
});
