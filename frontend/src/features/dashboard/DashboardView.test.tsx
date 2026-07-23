import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDashboardEndpoint } from "../../api/dashboard";
import { getBudgetProgress } from "../../api/budgets";
import { getCategories, getFinancialAccounts, getTags } from "../../api/referenceData";
import { WorkspaceRouteProvider } from "../../app/WorkspaceRouteContext";
import { DashboardView } from "./DashboardView";

vi.mock("../../api/referenceData", () => ({
  getFinancialAccounts: vi.fn().mockResolvedValue([]),
  getCategories: vi.fn().mockResolvedValue([]),
  getTags: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../api/budgets", () => ({ getBudgetProgress: vi.fn().mockResolvedValue([]) }));
vi.mock("../../api/dashboard", () => ({ getDashboardEndpoint: vi.fn() }));
vi.mock("../budgets/BudgetsView", () => ({
  BudgetsView: () => <section aria-label="Budgets">Budgets content</section>,
}));
vi.mock("../planned-payments/PlannedPaymentsView", () => ({
  PlannedPaymentsView: () => <section aria-label="Upcoming">Upcoming content</section>,
}));

const dashboardData = {
  summary: { balance_minor: 0, income_minor: 0, expense_minor: 0, net_minor: 0, savings_rate: null },
  forecast: { forecast_start: "2026-07-13", forecast_end: "2026-08-12", lookback_start: "2026-04-15", lookback_end: "2026-07-13", lookback_days: 90, horizon_days: 30, starting_balance_minor: 0, planned_income_minor: 0, planned_expense_minor: 0, expected_unplanned_spending_minor: 0, ending_balance_minor: 0, historical_expense_minor: 0, historical_transaction_count: 0, average_daily_expense_minor: 0, assumptions: [] },
  creditUtilization: { has_liability_accounts: false, has_credit_accounts: false, outstanding_debt_minor: 0, total_credit_limit_minor: 0, utilization_percentage: null },
  creditAccounts: [], recurringDebts: { items: [], monthly_total_minor: 0 }, debtToIncome: { recurring_debt_minor: 0, additional_debt_minor: 0, monthly_debt_minor: 0, gross_income_minor: 0, ratio_percentage: null },
  cashFlow: [], cashTable: { period_days: 18, income: { count: 2, total_minor: 300_000, daily_average_minor: 16_667, average_transaction_minor: 150_000 }, expense: { count: 3, total_minor: 180_000, daily_average_minor: 10_000, average_transaction_minor: 60_000 }, net_minor: 120_000, previous_income_minor: 250_000, previous_expense_minor: 170_000, previous_net_minor: 80_000, net_change_minor: 40_000 }, comparison: [], categories: [], structure: [], recent: [], upcoming: [],
};

const endpointData: Record<string, unknown> = {
  summary: dashboardData.summary,
  "balance-forecast": dashboardData.forecast,
  "credit-utilization": dashboardData.creditUtilization,
  "credit-account-utilization": dashboardData.creditAccounts,
  "recurring-debts": dashboardData.recurringDebts,
  "debt-to-income": dashboardData.debtToIncome,
  "cash-flow": dashboardData.cashFlow,
  "cash-flow-table": dashboardData.cashTable,
  "period-comparison": dashboardData.comparison,
  "category-spending": dashboardData.categories,
  "expense-structure": dashboardData.structure,
  "recent-transactions": dashboardData.recent,
  "upcoming-payments": dashboardData.upcoming,
};

function renderDashboard(hash = "#/dashboard") {
  window.history.replaceState(null, "", hash);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceRouteProvider>
        <DashboardView currency="CRC" locale="es-CR" />
      </WorkspaceRouteProvider>
    </QueryClientProvider>,
  );
}

describe("DashboardView date-dependent queries", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#/dashboard");
    vi.mocked(getDashboardEndpoint).mockImplementation(async (path) => endpointData[path]);
    vi.mocked(getBudgetProgress).mockResolvedValue([]);
    vi.mocked(getFinancialAccounts).mockResolvedValue([]);
    vi.mocked(getCategories).mockResolvedValue([]);
    vi.mocked(getTags).mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it("opens Cash Flow as the first and default Overview analysis", async () => {
    renderDashboard();

    const navigation = screen.getByRole("navigation", { name: "Financial analysis" });
    expect(within(navigation).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Cash Flow",
      "Forecast",
      "Planning",
    ]);
    expect(within(navigation).getByRole("button", { name: "Cash Flow" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("region", { name: "Cash flow" })).toBeInTheDocument();
  });

  it("shows Budgets, Upcoming, and Category spending without owning Recent activity", async () => {
    renderDashboard("#/dashboard?month=2028-02&analysis=planning");

    const planning = await screen.findByTestId("planning-grid");
    expect(planning).toHaveClass("grid", "lg:grid-cols-2");
    expect(within(planning).getByRole("region", { name: "Budgets" })).toBeInTheDocument();
    expect(within(planning).getByRole("region", { name: "Upcoming" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Category spending" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recent activity" })).not.toBeInTheDocument();
    await waitFor(() => expect(getDashboardEndpoint).toHaveBeenCalledWith(
      "category-spending",
      expect.objectContaining({ start_date: "2028-02-01", end_date: "2028-02-29" }),
      {},
      expect.any(AbortSignal),
    ));
  });

  it("honors an explicit Forecast Overview deep link", async () => {
    renderDashboard("#/dashboard?analysis=forecast");

    expect(await screen.findByRole("region", { name: "Balance forecast" })).toBeInTheDocument();
  });

  it("places the comparative and expense breakdown cards in equal desktop columns", async () => {
    renderDashboard("#/dashboard?analysis=cash-flow");

    const comparative = await screen.findByRole("region", { name: "Comparative Bar Chart" });
    const breakdown = screen.getByRole("region", { name: "Expense Breakdown" });

    expect(comparative.parentElement).toHaveClass("xl:col-span-1");
    expect(breakdown.parentElement).toHaveClass("xl:col-span-1");
    expect(comparative).toHaveClass("h-full");
    expect(breakdown).toHaveClass("h-full");
    expect(screen.queryByRole("link", { name: "View full report" })).not.toBeInTheDocument();
    expect(getDashboardEndpoint).toHaveBeenCalledWith(
      "expense-structure",
      expect.any(Object),
      {},
      expect.any(AbortSignal),
    );
  });

  it("does not render or request the Cash Flow expense breakdown from Planning", async () => {
    renderDashboard("#/dashboard?analysis=planning");

    expect(await screen.findByRole("region", { name: "Category spending" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Expense Breakdown" })).not.toBeInTheDocument();
    expect(vi.mocked(getDashboardEndpoint).mock.calls.some(([path]) => path === "expense-structure")).toBe(false);
  });

  it("shows an invalid range and pauses financial queries", async () => {
    renderDashboard("#/dashboard?analysis=cash-flow");
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
      if (path === "cash-flow-table") throw new Error("cash flow failed");
      return endpointData[path];
    });

    renderDashboard("#/dashboard?analysis=cash-flow");

    expect(await screen.findByText("Cash flow unavailable")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Period comparison" })).toBeInTheDocument();
    expect(screen.getAllByText(/CRC|₡/).length).toBeGreaterThan(0);
  });

  it("loads both the cash-flow summary and the additive comparative chart", async () => {
    renderDashboard("#/dashboard?analysis=cash-flow");

    expect(await screen.findByRole("region", { name: "Cash flow" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Comparative Bar Chart" })).toBeInTheDocument();
    expect(getDashboardEndpoint).toHaveBeenCalledWith(
      "cash-flow-table",
      expect.any(Object),
      {},
      expect.any(AbortSignal),
    );
    expect(getDashboardEndpoint).toHaveBeenCalledWith(
      "cash-flow",
      expect.any(Object),
      {},
      expect.any(AbortSignal),
    );
  });

  it("shows the shared selected date range without a comparative chart period control", async () => {
    renderDashboard("#/dashboard?analysis=cash-flow");
    const card = await screen.findByRole("region", { name: "Comparative Bar Chart" });
    const from = screen.getByLabelText("From") as HTMLInputElement;
    const to = screen.getByLabelText("To") as HTMLInputElement;
    const expectedRange = `${new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${from.value}T00:00:00`))} – ${new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${to.value}T00:00:00`))}`;

    expect(within(card).getByText(expectedRange)).toBeInTheDocument();
    expect(within(card).queryByRole("combobox", { name: "Comparison period" })).not.toBeInTheDocument();
  });

  it("defaults period comparison to expenses", async () => {
    renderDashboard("#/dashboard?analysis=cash-flow");

    expect(await screen.findByRole("radio", { name: "Expenses" })).toBeChecked();
    expect(screen.getByText("Expenses compared with previous period and prior year")).toBeInTheDocument();
    await waitFor(() => expect(getDashboardEndpoint).toHaveBeenCalledWith(
      "period-comparison",
      expect.any(Object),
      { metric: "expenses" },
      expect.any(AbortSignal),
    ));
  });

  it("requests a new period comparison when its metric changes", async () => {
    renderDashboard("#/dashboard?analysis=cash-flow");
    const income = await screen.findByRole("radio", { name: "Income" });

    fireEvent.click(income);

    expect(screen.getByText("Income compared with previous period and prior year")).toBeInTheDocument();
    await waitFor(() => expect(getDashboardEndpoint).toHaveBeenCalledWith(
      "period-comparison",
      expect.any(Object),
      { metric: "income" },
      expect.any(AbortSignal),
    ));
  });

  it("isolates a failed reference catalog and retries only failed catalogs", async () => {
    vi.mocked(getFinancialAccounts)
      .mockRejectedValueOnce(new Error("accounts failed"))
      .mockResolvedValue([{ id: 3, name: "Checking", kind: "checking", opening_balance_minor: 0, opening_balance_date: "2026-01-01", credit_limit_minor: null, is_active: true }]);

    renderDashboard("#/dashboard?analysis=forecast");

    expect(await screen.findByRole("alert", { name: "Filter data unavailable" })).toHaveTextContent("accounts");
    expect(screen.queryByLabelText("Account")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeEnabled();
    expect(screen.getByText("Balance forecast")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry filter data" }));

    await waitFor(() => expect(screen.queryByRole("alert", { name: "Filter data unavailable" })).not.toBeInTheDocument());
    expect(getFinancialAccounts).toHaveBeenCalledTimes(2);
    expect(getCategories).toHaveBeenCalledTimes(1);
    expect(getTags).toHaveBeenCalledTimes(1);
  });

  it("does not request recent activity from the center workspace", async () => {
    renderDashboard("#/dashboard?activity=income");
    await screen.findByRole("region", { name: "Cash flow" });
    expect(vi.mocked(getDashboardEndpoint).mock.calls.some(([path]) => path === "recent-transactions")).toBe(false);
  });
});
