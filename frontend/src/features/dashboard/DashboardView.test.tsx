import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDashboardEndpoint } from "../../api/dashboard";
import { getBudgetProgress } from "../../api/budgets";
import { DashboardView } from "./DashboardView";

vi.mock("../../api/referenceData", () => ({
  getFinancialAccounts: vi.fn().mockResolvedValue([]),
  getCategories: vi.fn().mockResolvedValue([]),
  getTags: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../api/budgets", () => ({ getBudgetProgress: vi.fn().mockResolvedValue([]) }));
vi.mock("../../api/dashboard", () => ({ getDashboardEndpoint: vi.fn() }));

const dashboardData = {
  summary: { balance_minor: 0, income_minor: 0, expense_minor: 0, net_minor: 0, savings_rate: null },
  forecast: { forecast_start: "2026-07-13", forecast_end: "2026-08-12", lookback_start: "2026-04-15", lookback_end: "2026-07-13", lookback_days: 90, horizon_days: 30, starting_balance_minor: 0, planned_income_minor: 0, planned_expense_minor: 0, expected_unplanned_spending_minor: 0, ending_balance_minor: 0, historical_expense_minor: 0, historical_transaction_count: 0, average_daily_expense_minor: 0, assumptions: [] },
  creditUtilization: { has_liability_accounts: false, has_credit_accounts: false, outstanding_debt_minor: 0, total_credit_limit_minor: 0, utilization_percentage: null },
  creditAccounts: [], recurringDebts: { items: [], monthly_total_minor: 0 }, debtToIncome: { monthly_debt_minor: 0, gross_income_minor: 0, ratio_percentage: null },
  cashFlow: [], comparison: [], categories: [], structure: [], recent: [], upcoming: [],
};

const endpointData: Record<string, unknown> = {
  summary: dashboardData.summary,
  "balance-forecast": dashboardData.forecast,
  "credit-utilization": dashboardData.creditUtilization,
  "credit-account-utilization": dashboardData.creditAccounts,
  "recurring-debts": dashboardData.recurringDebts,
  "debt-to-income": dashboardData.debtToIncome,
  "cash-flow": dashboardData.cashFlow,
  "period-comparison": dashboardData.comparison,
  "category-spending": dashboardData.categories,
  "expense-structure": dashboardData.structure,
  "recent-transactions": dashboardData.recent,
  "upcoming-payments": dashboardData.upcoming,
};

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DashboardView currency="CRC" locale="es-CR" /></QueryClientProvider>);
}

describe("DashboardView date-dependent queries", () => {
  beforeEach(() => {
    vi.mocked(getDashboardEndpoint).mockImplementation(async (path) => endpointData[path]);
    vi.mocked(getBudgetProgress).mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it("loads budget progress for the month selected by end date", async () => {
    renderDashboard();
    await waitFor(() => expect(getDashboardEndpoint).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-12-15" } });

    await waitFor(() => expect(getBudgetProgress).toHaveBeenCalledWith("2026-12-01"));
  });

  it("shows an invalid range and pauses financial queries", async () => {
    renderDashboard();
    await waitFor(() => expect(getDashboardEndpoint).toHaveBeenCalled());
    vi.mocked(getDashboardEndpoint).mockClear();
    vi.mocked(getBudgetProgress).mockClear();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "9999-12-31" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("start date");
    await waitFor(() => {
      expect(getDashboardEndpoint).not.toHaveBeenCalled();
      expect(getBudgetProgress).not.toHaveBeenCalled();
    });
  });

  it("keeps successful cards visible when one dashboard endpoint fails", async () => {
    vi.mocked(getDashboardEndpoint).mockImplementation(async (path) => {
      if (path === "cash-flow") throw new Error("cash flow failed");
      return endpointData[path];
    });

    renderDashboard();

    expect(await screen.findByText("Cash flow unavailable")).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
    expect(screen.getAllByText(/CRC|₡/).length).toBeGreaterThan(0);
  });
});
