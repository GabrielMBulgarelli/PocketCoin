import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlannedPayment } from "../../api/plannedPayments";
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

describe("PlannedPaymentsView", () => {
  it("shows the recurring marker beside recurring titles only", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith("/api/planned-payments")
        ? [
            payment(1, "Credit Card Reimbursement", "monthly"),
            payment(2, "Passport renewal", "none"),
          ]
        : url.endsWith("/api/financial-accounts")
          ? [{ id: 1, name: "Cash", kind: "cash", is_active: true }]
          : [{ id: 10, name: "Household", direction: "expense", is_active: true }];
      return Promise.resolve({ ok: true, status: 200, json: async () => payload });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <PlannedPaymentsView currency="USD" locale="en-US" upcomingOnly />
      </QueryClientProvider>,
    );

    const recurringRow = (await screen.findByRole("heading", {
      name: "Credit Card Reimbursement",
    })).closest("article");
    const oneTimeRow = screen.getByRole("heading", {
      name: "Passport renewal",
    }).closest("article");

    expect(recurringRow).not.toBeNull();
    expect(oneTimeRow).not.toBeNull();
    expect(within(recurringRow!).getByRole("img", { name: "Recurring monthly" })).toBeInTheDocument();
    expect(within(oneTimeRow!).queryByRole("img", { name: /Recurring/ })).not.toBeInTheDocument();
  });
});
