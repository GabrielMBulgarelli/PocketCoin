import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportsView } from "./ReportsView";
import { exportTransactions } from "../../api/transactions";

const getDashboardEndpoint = vi.fn();

vi.mock("../../api/dashboard", () => ({
  getDashboardEndpoint: (...args: unknown[]) => getDashboardEndpoint(...args),
}));

vi.mock("../../api/referenceData", () => ({
  getFinancialAccounts: vi.fn().mockResolvedValue([]),
  getCategories: vi.fn().mockResolvedValue([]),
  getTags: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../api/transactions", () => ({ exportTransactions: vi.fn() }));

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
  beforeEach(() => {
    window.history.replaceState(null, "", "#/reports");
    vi.mocked(exportTransactions).mockResolvedValue();
    getDashboardEndpoint.mockImplementation((path: string) => {
      if (path === "cash-flow-table") {
        return Promise.resolve({
          period_days: 18,
          income: { count: 2, total_minor: 300_000, daily_average_minor: 16_667, average_transaction_minor: 150_000 },
          expense: { count: 3, total_minor: 180_000, daily_average_minor: 10_000, average_transaction_minor: 60_000 },
          net_minor: 120_000,
          previous_income_minor: 250_000,
          previous_expense_minor: 170_000,
          previous_net_minor: 80_000,
          net_change_minor: 40_000,
        });
      }
      if (path === "credit-utilization") {
        return Promise.resolve({
          has_credit_accounts: false,
          has_liability_accounts: false,
          outstanding_debt_minor: 0,
          total_credit_limit_minor: 0,
          utilization_percentage: null,
        });
      }
      if (path === "recurring-debts") {
        return Promise.resolve({ items: [], monthly_total_minor: 0 });
      }
      if (path === "debt-to-income") {
        return Promise.resolve({
          monthly_debt_minor: 0,
          gross_income_minor: 0,
          ratio_percentage: null,
        });
      }
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    getDashboardEndpoint.mockReset();
    vi.mocked(exportTransactions).mockReset();
  });

  it("keeps healthy report sections visible when one endpoint fails", async () => {
    getDashboardEndpoint.mockImplementation((path: string) => {
      if (path === "cash-flow") {
        return Promise.reject(new Error("cash flow failed"));
      }
      if (path === "cash-flow-table") return Promise.resolve({ period_days: 1, income: { count: 0, total_minor: 0, daily_average_minor: 0, average_transaction_minor: 0 }, expense: { count: 0, total_minor: 0, daily_average_minor: 0, average_transaction_minor: 0 }, net_minor: 0, previous_income_minor: 0, previous_expense_minor: 0, previous_net_minor: 0, net_change_minor: 0 });
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

  it("keeps the time-series chart beside the shared cash-flow summary", async () => {
    renderReports();

    expect(await screen.findByText("Cash-flow statistics")).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Cash flow" })).toHaveLength(2);
    expect(getDashboardEndpoint).toHaveBeenCalledWith("cash-flow", expect.any(Object), {});
    expect(getDashboardEndpoint).toHaveBeenCalledWith("cash-flow-table", expect.any(Object), {});
  });

  it("defaults period comparison to cash flow", async () => {
    renderReports();

    expect(await screen.findByRole("radio", { name: "Cash flow" })).toBeChecked();
    await waitFor(() => expect(getDashboardEndpoint).toHaveBeenCalledWith(
      "period-comparison",
      expect.any(Object),
      { metric: "cash_flow" },
    ));
  });

  it("requests a new period comparison when its metric changes", async () => {
    renderReports();
    const expenses = await screen.findByRole("radio", { name: "Expenses" });

    fireEvent.click(expenses);

    await waitFor(() => expect(getDashboardEndpoint).toHaveBeenCalledWith(
      "period-comparison",
      expect.any(Object),
      { metric: "expenses" },
    ));
  });

  it("keeps filtered export available", () => {
    renderReports();

    expect(screen.getByRole("button", { name: "Export filtered CSV" })).toBeEnabled();
  });

  it("blocks duplicate exports and announces success", async () => {
    let resolveExport!: () => void;
    vi.mocked(exportTransactions).mockImplementation(() => new Promise<void>((resolve) => { resolveExport = resolve; }));
    renderReports();
    const button = screen.getByRole("button", { name: "Export filtered CSV" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Exporting…");
    expect(exportTransactions).toHaveBeenCalledTimes(1);

    resolveExport();
    expect(await screen.findByText("CSV exported successfully.")).toBeInTheDocument();
    expect(button).toBeEnabled();
  });
});
