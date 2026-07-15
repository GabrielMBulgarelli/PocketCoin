import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportsView } from "./ReportsView";

const getDashboardEndpoint = vi.fn();

vi.mock("../../api/dashboard", () => ({
  getDashboardEndpoint: (...args: unknown[]) => getDashboardEndpoint(...args),
}));

vi.mock("../../api/referenceData", () => ({
  getFinancialAccounts: vi.fn().mockResolvedValue([]),
  getCategories: vi.fn().mockResolvedValue([]),
  getTags: vi.fn().mockResolvedValue([]),
}));

function renderReports() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ReportsView currency="CRC" locale="es-CR" />
    </QueryClientProvider>,
  );
}

describe("ReportsView", () => {
  afterEach(() => {
    getDashboardEndpoint.mockReset();
  });

  it("keeps healthy report sections visible when one endpoint fails", async () => {
    getDashboardEndpoint.mockImplementation((path: string) => {
      if (path === "cash-flow") {
        return Promise.reject(new Error("cash flow failed"));
      }
      if (path === "cash-flow-table") {
        return Promise.resolve({
          period_days: 1,
          income: { count: 0, total_minor: 0, daily_average_minor: 0, average_transaction_minor: 0 },
          expense: { count: 0, total_minor: 0, daily_average_minor: 0, average_transaction_minor: 0 },
          net_cash_flow_minor: 0,
          previous_income_minor: 0,
          previous_expense_minor: 0,
          previous_net_cash_flow_minor: 0,
          net_change_minor: 0,
        });
      }
      if (path === "credit-utilization") {
        return Promise.resolve({
          has_credit_accounts: false,
          has_liability_accounts: false,
          outstanding_debt_minor: 0,
          total_limit_minor: 0,
          utilization_percent: null,
        });
      }
      if (path === "recurring-debts") {
        return Promise.resolve({ items: [], monthly_total_minor: 0 });
      }
      if (path === "debt-to-income") {
        return Promise.resolve({
          month: "2026-07",
          recurring_debt_minor: 0,
          gross_income_minor: 0,
          ratio_percent: null,
        });
      }
      return Promise.resolve([]);
    });

    renderReports();

    expect(await screen.findByText("Cash flow unavailable")).toBeInTheDocument();
    expect(await screen.findByText("Cash-flow statistics")).toBeInTheDocument();
  });
});
