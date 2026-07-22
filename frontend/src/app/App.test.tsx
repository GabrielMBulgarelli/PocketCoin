import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "#/dashboard");
  vi.unstubAllGlobals();
});

function stubApi({ failBackup = false }: { failBackup?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
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

      if (failBackup && url.endsWith("/api/backups") && init?.method === "POST") {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ message: "Backup failed" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => payload });
    }),
  );
}

describe("App", () => {
  it("replaces the retired planned-payments route with Planning Upcoming", async () => {
    window.history.replaceState(null, "", "#/planned-payments?financial_account_id=1&month=2026-07&page=2");
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    expect(await screen.findByRole("heading", { name: "Planning" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/budgets?account=1&month=2026-07&planning=upcoming");
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

    expect(await screen.findByRole("heading", { name: "Planning" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/budgets?account=general&planning=upcoming");
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

  it("traps navigation focus, marks the active route, and restores focus on Escape", async () => {
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
    const trigger = screen.getByLabelText("Open navigation menu");
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("link", { name: "Transactions" }));
    expect(await screen.findByRole("heading", { name: "Transactions" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restores focus to each compact workspace trigger when its sheet closes", async () => {
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

    for (const name of ["Open context panel", "Open summary panel"]) {
      const trigger = screen.getByLabelText(name);
      fireEvent.click(trigger);
      await screen.findByRole("dialog");
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    }
  });

  it("closes the context sheet only after a backup succeeds", async () => {
    stubApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
    fireEvent.click(screen.getByLabelText("Open context panel"));
    fireEvent.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: "Backup data" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the context sheet open when a backup fails", async () => {
    stubApi({ failBackup: true });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
    fireEvent.click(screen.getByLabelText("Open context panel"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Backup data" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Backup could not be created");
    expect(dialog).toBeInTheDocument();
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
