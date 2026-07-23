import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "#/dashboard");
  vi.unstubAllGlobals();
});

function stubApi({
  recent = [],
  recentPending = false,
  recentResponses = [],
  upcoming = [],
}: {
  recent?: unknown[];
  recentPending?: boolean;
  recentResponses?: Array<"error" | unknown[]>;
  upcoming?: unknown[];
} = {}) {
  const queuedRecent = [...recentResponses];
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/dashboard/recent-transactions")) {
        if (recentPending) return new Promise(() => undefined);
        const queued = queuedRecent.shift();
        if (queued === "error") {
          return Promise.resolve({ ok: false, status: 503, json: async () => ({ message: "Activity unavailable" }) });
        }
        if (queued) return Promise.resolve({ ok: true, status: 200, json: async () => queued });
      }
      const payload = url.endsWith("/api/health")
        ? { status: "ok" }
        : url.endsWith("/api/settings")
          ? { base_currency: "CRC", locale: "es-CR", theme: "system" }
          : url.endsWith("/api/financial-accounts")
            ? [{ id: 1, name: "Checking", kind: "checking", is_active: true }]
            : url.endsWith("/api/categories")
              ? [{ id: 10, name: "Food", direction: "expense", is_active: true }]
              : url.endsWith("/api/tags")
                ? []
                : url.endsWith("/api/transactions") && init?.method === "POST"
                  ? { id: 99 }
          : url.includes("/api/dashboard/upcoming-payments")
            ? upcoming
          : url.includes("/api/dashboard/recent-transactions")
            ? recent
          : url.includes("/api/dashboard/balance-forecast")
            ? {
                forecast_start: "2026-07-12",
                forecast_end: "2026-08-11",
                lookback_start: "2026-04-14",
                lookback_end: "2026-07-12",
                lookback_days: 90,
                horizon_days: 30,
                starting_balance_minor: 0,
                planned_income_minor: 0,
                planned_expense_minor: 0,
                historical_expense_minor: 0,
                historical_transaction_count: 0,
                average_daily_expense_minor: 0,
                expected_unplanned_spending_minor: 0,
                ending_balance_minor: 0,
                assumptions: ["A fixed 90-day lookback and 30-day horizon are used."],
              }
          : url.includes("/api/dashboard/summary")
            ? {
                balance_minor: 0,
                income_minor: 0,
                expense_minor: 0,
                savings_minor: 0,
                savings_rate: null,
              }
            : url.includes("/api/dashboard/cash-flow-table")
              ? {
                  period_days: 1,
                  income: {
                    count: 0,
                    total_minor: 0,
                    daily_average_minor: 0,
                    average_transaction_minor: 0,
                  },
                  expense: {
                    count: 0,
                    total_minor: 0,
                    daily_average_minor: 0,
                    average_transaction_minor: 0,
                  },
                  net_minor: 0,
                  previous_income_minor: 0,
                  previous_expense_minor: 0,
                  previous_net_minor: 0,
                  net_change_minor: 0,
                }
            : url.includes("/api/dashboard/credit-utilization")
              ? {
                  has_liability_accounts: false,
                  has_credit_accounts: false,
                  outstanding_debt_minor: 0,
                  total_credit_limit_minor: 0,
                  utilization_percentage: null,
                }
              : url.includes("/api/dashboard/credit-account-utilization")
                ? []
                : url.includes("/api/dashboard/recurring-debts")
                  ? { items: [], monthly_total_minor: 0 }
                  : url.includes("/api/dashboard/debt-to-income")
                    ? {
                        recurring_debt_minor: 0,
                        additional_debt_minor: 0,
                        monthly_debt_minor: 0,
                        gross_income_minor: 0,
                        ratio_percentage: null,
                      }
            : [];

      return Promise.resolve({ ok: true, status: 200, json: async () => payload });
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("App", () => {
  it("shows the recurring marker beside recurring Upcoming titles only", async () => {
    stubApi({
      upcoming: [
        { id: 1, title: "Rent", amount_minor: 80_000, due_date: "2026-07-30", recurrence: "monthly" },
        { id: 2, title: "Passport renewal", amount_minor: 12_500, due_date: "2026-08-01", recurrence: "none" },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    const upcoming = (await screen.findByRole("heading", { name: "Upcoming" })).closest("section");
    expect(upcoming).not.toBeNull();
    await within(upcoming!).findByText("Rent");
    expect(within(upcoming!).getByRole("img", { name: "Recurring monthly" })).toBeInTheDocument();
    const oneTimeRow = within(upcoming!).getByText("Passport renewal").closest("li");
    expect(oneTimeRow).not.toBeNull();
    expect(within(oneTimeRow!).queryByRole("img", { name: /Recurring/ })).not.toBeInTheDocument();
  });

  it("places concise Accounts, Labels, and Upcoming actions in their card headers", async () => {
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    const accountsHeading = await screen.findByRole("heading", { name: "Accounts" });
    const accountsCard = accountsHeading.closest("section");
    expect(accountsCard).not.toBeNull();
    const manage = within(accountsCard!).getByRole("link", { name: "Manage" });
    expect(manage).toHaveAttribute("href", "#/financial-accounts");
    expect(manage.parentElement).toBe(accountsHeading.parentElement);
    expect(manage.parentElement).toHaveClass("flex");
    expect(within(accountsCard!).queryByRole("link", { name: "Manage accounts" })).not.toBeInTheDocument();

    const labelsHeading = screen.getByRole("heading", { name: "Labels" });
    const labelsCard = labelsHeading.closest("section");
    expect(labelsCard).not.toBeNull();
    const manageLabels = within(labelsCard!).getByRole("link", { name: "Manage" });
    expect(manageLabels).toHaveAttribute("href", "#/categories");
    expect(manageLabels.parentElement).toBe(labelsHeading.parentElement);
    expect(manageLabels.parentElement).toHaveClass("flex");
    expect(within(labelsCard!).queryByRole("link", { name: "Manage categories and tags" })).not.toBeInTheDocument();
    expect(within(labelsCard!).getByRole("link", { name: "Add category" })).toHaveAttribute("href", "#/categories?add=category");
    expect(within(labelsCard!).getByRole("link", { name: "Add tag" })).toHaveAttribute("href", "#/categories?add=tag");
    expect(screen.queryByRole("heading", { name: "Management" })).not.toBeInTheDocument();

    const upcomingHeading = await screen.findByRole("heading", { name: "Upcoming" });
    const upcomingCard = upcomingHeading.closest("section");
    expect(upcomingCard).not.toBeNull();
    const view = within(upcomingCard!).getByRole("link", { name: "View" });
    const viewUrl = new URL(view.getAttribute("href")!.slice(1), "http://localhost");
    expect(viewUrl.pathname).toBe("/dashboard");
    expect(viewUrl.searchParams.get("analysis")).toBe("planning");
    expect(view.parentElement).toBe(upcomingHeading.parentElement);
    expect(view.parentElement).toHaveClass("flex");
    expect(within(upcomingCard!).queryByRole("link", { name: "View Overview planning" })).not.toBeInTheDocument();
  });

  it("replaces the retired planned-payments route with Overview Planning", async () => {
    window.history.replaceState(null, "", "#/planned-payments?financial_account_id=1&month=2026-07&page=2");
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/dashboard?account=1&month=2026-07&analysis=planning");
    const main = document.getElementById("main-content");
    expect(main).not.toBeNull();
    expect(within(main!).getByRole("heading", { name: "Budgets" })).toBeInTheDocument();
    expect(within(main!).getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(within(main!).queryByText("Recent activity")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Workspace summary")).getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
  });

  it.each([
    ["#/dashboard?from=2026-07-01&to=2026-07-19&category=10&activity=income", "Overview"],
    ["#/transactions?account=1&activity=income", "Transactions"],
    ["#/reports?from=2026-07-02&to=2026-07-20&tag=4&activity=income", "Reports"],
  ])("places five Recent activity records after This month on %s", async (hash, title) => {
    window.history.replaceState(null, "", hash);
    const fetchMock = stubApi({
      recent: Array.from({ length: 7 }, (_, index) => ({
        id: index + 1,
        transaction_date: `2026-07-${String(19 - index).padStart(2, "0")}`,
        kind: "income",
        amount_minor: (index + 1) * 100,
        description: `Activity ${index + 1}`,
        category_id: 10,
        financial_account_id: 1,
        transfer_group_id: null,
        from_account_id: null,
        to_account_id: null,
      })),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    const summary = screen.getByLabelText("Workspace summary");
    const headings = within(summary).getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "This month",
      "Recent activity",
      "Needs attention",
      "Upcoming",
    ]);
    const activityHeading = within(summary).getByRole("heading", { name: "Recent activity" });
    const activityCard = activityHeading.closest("section");
    expect(activityCard).not.toBeNull();
    expect(within(activityCard!).queryByText("Latest eight records")).not.toBeInTheDocument();
    expect(within(activityCard!).getAllByText(/Activity \d/)).toHaveLength(5);
    const dateRow = within(activityCard!).getByTestId("recent-activity-period");
    const controls = within(activityCard!).getByRole("navigation", { name: "Recent activity kind" });
    expect(dateRow.parentElement).toBe(activityHeading.parentElement);
    expect(controls).toHaveClass("flex-nowrap", "justify-center");
    for (const label of ["Income", "Expenses", "Transfers"]) {
      expect(within(controls).getByRole("button", { name: label })).toHaveClass("h-8", "px-2", "text-xs");
    }
    const firstDescription = within(activityCard!).getByText("Activity 1");
    const firstRecordDate = within(activityCard!).getByTestId("recent-activity-record-date-1");
    expect(firstDescription).toHaveClass("truncate");
    expect(firstRecordDate.parentElement).toBe(firstDescription.parentElement);
    const recentUrl = fetchMock.mock.calls.map(([input]) => String(input)).find((url) => url.includes("/api/dashboard/recent-transactions"));
    expect(recentUrl).toBeDefined();
    const params = new URL(recentUrl!, "http://localhost").searchParams;
    expect(params.get("activity")).toBe("income");
    if (title === "Transactions") {
      expect(params.get("financial_account_id")).toBe("1");
      expect(params.get("category_id")).toBeNull();
      expect(params.get("tag_id")).toBeNull();
      expect(params.get("start_date")).toMatch(/-01$/);
    } else {
      expect(params.get("start_date")).toBe(title === "Overview" ? "2026-07-01" : "2026-07-02");
      expect(params.get("end_date")).toBe(title === "Overview" ? "2026-07-19" : "2026-07-20");
      expect(params.get(title === "Overview" ? "category_id" : "tag_id")).toBe(title === "Overview" ? "10" : "4");
    }
  });

  it("keeps activity loading, retry, empty, and normalized-transfer states usable", async () => {
    stubApi({ recentResponses: ["error", [{
      id: 2,
      transaction_date: "2026-07-20",
      kind: "transfer",
      amount_minor: 2500,
      description: "Move to general",
      category_id: null,
      financial_account_id: null,
      transfer_group_id: "transfer-2",
      from_account_id: 1,
      to_account_id: null,
    }]] });
    window.history.replaceState(null, "", "#/dashboard?activity=transfers");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    const summary = screen.getByLabelText("Workspace summary");
    expect(await within(summary).findByRole("alert")).toHaveTextContent("Recent activity could not be loaded.");
    fireEvent.click(within(summary).getByRole("button", { name: "Retry recent activity" }));
    expect(await within(summary).findByText("Move to general")).toBeInTheDocument();
    expect(within(summary).getByText(/Checking → General/)).toBeInTheDocument();
    fireEvent.click(within(summary).getByRole("button", { name: "Expenses" }));
    expect(new URLSearchParams(window.location.hash.split("?")[1]).has("activity")).toBe(false);
    expect(await within(summary).findByText("No expenses match these filters.")).toBeInTheDocument();
  });

  it("shows activity loading in the rail and exposes the card in compact Summary only on primary routes", async () => {
    stubApi({ recentPending: true });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    const summary = screen.getByLabelText("Workspace summary");
    expect(await within(summary).findByText("Loading recent activity…")).toHaveAttribute("role", "status");
    fireEvent.click(screen.getByLabelText("Open summary panel"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
  });

  it("replaces the retired planned-payments route during client navigation", async () => {
    window.history.replaceState(null, "", "#/dashboard");
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();

    act(() => {
      window.history.replaceState(null, "", "#/planned-payments?without_account=true");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/dashboard?account=general&analysis=planning");
  });

  it("resolves a view when its hash includes analytical parameters", async () => {
    window.history.replaceState(null, "", "#/reports?from=2026-07-01&to=2026-07-19&metric=income");
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
  });

  it("does not display permanent successful API chrome", async () => {
    stubApi();

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByText("Local API is available")).not.toBeInTheDocument();
  });

  it("announces an outage and recovers after health returns", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, "", "#/categories");
    let healthy = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (healthy) {
        const payload = url.endsWith("/api/health")
          ? { status: "ok" }
          : url.endsWith("/api/settings")
            ? { base_currency: "USD", locale: "en-US", first_day_of_week: "monday", theme: "system" }
            : [];
        return Promise.resolve({ ok: true, status: 200, json: async () => payload });
      }
      return Promise.reject(new TypeError("Failed to fetch"));
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Local API is unavailable");
    healthy = true;
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(await screen.findByText("Local API connection restored.")).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  it("shows direct primary navigation and no hamburger menu", async () => {
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
    const primary = screen.getByRole("navigation", { name: "Primary financial views" });
    expect(within(primary).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Overview",
      "Transactions",
      "Reports",
    ]);
    expect(within(primary).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByLabelText("Open navigation menu")).not.toBeInTheDocument();
    expect(within(primary).getByRole("link", { name: "Transactions" })).toHaveAttribute("href", "#/transactions");
    expect(within(primary).queryByRole("link", { name: "Planning" })).not.toBeInTheDocument();
    const settings = screen.getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("href", "#/settings");
    expect(settings).toHaveAttribute("title", "Settings");
    expect(settings.textContent).toBe("");
    expect(settings.querySelector("svg")).toBeInTheDocument();
  });

  it("shows route-owned workspace tools directly after Labels in the Context rail", async () => {
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    const contextRail = screen.getByLabelText("Workspace context");
    const summaryRail = screen.getByLabelText("Workspace summary");
    expect(contextRail.parentElement).toHaveClass("items-start");
    expect(contextRail).toHaveClass("xl:top-20");
    expect(summaryRail).toHaveClass("xl:top-20");
    for (const rail of [contextRail, summaryRail]) {
      expect(rail).not.toHaveClass("rounded-2xl", "border", "bg-card", "p-4", "shadow-sm");
      expect(rail).toHaveClass("max-h-[calc(100vh-6.25rem)]", "overflow-y-auto");
    }

    expect(await within(contextRail).findByRole("heading", { name: "Workspace tools" })).toBeInTheDocument();
    expect(within(contextRail).getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Accounts",
      "Labels",
      "Workspace tools",
    ]);
    expect(within(summaryRail).queryByRole("heading", { name: "Workspace tools" })).not.toBeInTheDocument();
    expect(within(contextRail).queryByRole("heading", { name: "Quick tools" })).not.toBeInTheDocument();
    expect(within(contextRail).queryByRole("link", { name: "Import CSV" })).not.toBeInTheDocument();
    expect(within(contextRail).queryByRole("link", { name: "Run report" })).not.toBeInTheDocument();
    expect(within(contextRail).queryByRole("button", { name: "Backup data" })).not.toBeInTheDocument();
    expect(within(contextRail).queryByRole("link", { name: "Data safety" })).not.toBeInTheDocument();

    const filters = within(contextRail).getByLabelText("Dashboard filters");
    expect(filters.closest("details")).toBeNull();
    expect(filters).not.toHaveClass("rounded-xl", "border", "p-4", "shadow-sm");
    expect(filters.firstElementChild).toHaveClass("grid-cols-1");
    expect(filters.firstElementChild).not.toHaveClass("sm:grid-cols-2", "xl:grid-cols-4");
  });

  it("places Workspace Tools only in compact Context and restores trigger focus", async () => {
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    const contextTrigger = screen.getByLabelText("Open context panel");
    fireEvent.click(contextTrigger);
    const contextDialog = await screen.findByRole("dialog");
    expect(await within(contextDialog).findByRole("heading", { name: "Workspace tools" })).toBeInTheDocument();
    expect(within(contextDialog).getByLabelText("Dashboard filters")).toBeVisible();
    expect(within(contextDialog).queryByRole("heading", { name: "Quick tools" })).not.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(contextTrigger).toHaveFocus();

    const summaryTrigger = screen.getByLabelText("Open summary panel");
    fireEvent.click(summaryTrigger);
    const summaryDialog = await screen.findByRole("dialog");
    expect(within(summaryDialog).getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
    expect(within(summaryDialog).queryByRole("heading", { name: "Workspace tools" })).not.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(summaryTrigger).toHaveFocus();
  });

  it("keeps quick-add success feedback visible and announced at 360 px", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    stubApi();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    fireEvent.click(screen.getByLabelText("Quick add"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(await within(dialog).findByLabelText("Amount"), {
      target: { value: "12.50" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Account/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/^Category/), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Lunch" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));

    const feedback = await screen.findByText("Expense added successfully.");
    expect(feedback).toHaveAttribute("aria-live", "polite");
    expect(feedback).not.toHaveClass("hidden");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
