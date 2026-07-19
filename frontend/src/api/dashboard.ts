import { apiGet } from "./client";
import type { Transaction } from "./transactions";
import type { PlannedPayment } from "./plannedPayments";

export type DashboardFilters = { start_date: string; end_date: string; financial_account_id?: number; category_id?: number; tag_id?: number };
export type DashboardSummary = { balance_minor: number; income_minor: number; expense_minor: number; net_minor: number; savings_rate: number | null };
export type CashFlowPoint = { date: string; income_minor: number; expense_minor: number };
export type CategoryPoint = { name: string; amount_minor: number };
export type ComparisonPoint = { label: string; current_minor: number; previous_minor: number; prior_year_minor: number };
export type ComparisonMetric = "expenses" | "income" | "cash_flow";
export type CashFlowStatistic = { count: number; total_minor: number; daily_average_minor: number; average_transaction_minor: number };
export type CashFlowTable = { period_days: number; income: CashFlowStatistic; expense: CashFlowStatistic; net_minor: number; previous_income_minor: number; previous_expense_minor: number; previous_net_minor: number; net_change_minor: number };
export type BalanceForecast = {
  forecast_start: string; forecast_end: string; lookback_start: string; lookback_end: string;
  lookback_days: number; horizon_days: number; starting_balance_minor: number;
  planned_income_minor: number; planned_expense_minor: number;
  expected_unplanned_spending_minor: number; ending_balance_minor: number;
  historical_expense_minor: number; historical_transaction_count: number;
  average_daily_expense_minor: number; assumptions: string[];
};
export type CreditUtilization = { has_liability_accounts: boolean; has_credit_accounts: boolean; outstanding_debt_minor: number; total_credit_limit_minor: number; utilization_percentage: number | null };
export type CreditAccountUtilization = { account_id: number; account_name: string; credit_limit_minor: number | null; current_debt_minor: number; current_percentage: number | null; average_percentage: number | null; maximum_percentage: number | null };
export type RecurringDebtItem = { payment_id: number; title: string; recurrence: string; amount_minor: number; monthly_amount_minor: number };
export type RecurringDebts = { items: RecurringDebtItem[]; monthly_total_minor: number };
export type DebtToIncome = { monthly_debt_minor: number; gross_income_minor: number; ratio_percentage: number | null };
export type DashboardData = { summary: DashboardSummary; forecast: BalanceForecast; creditUtilization: CreditUtilization; creditAccounts: CreditAccountUtilization[]; recurringDebts: RecurringDebts; debtToIncome: DebtToIncome; cashFlow: CashFlowPoint[]; comparison: ComparisonPoint[]; categories: CategoryPoint[]; structure: CategoryPoint[]; recent: Transaction[]; upcoming: PlannedPayment[] };

export async function getDashboardEndpoint<T>(path: string, filters: DashboardFilters, extra: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const params = new URLSearchParams([...Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]), ...Object.entries(extra)]);
  return apiGet<T>(`/api/dashboard/${path}?${params}`, { signal });
}

export async function getDashboard(filters: DashboardFilters): Promise<DashboardData> {
  const [summary, forecast, creditUtilization, creditAccounts, recurringDebts, debtToIncome, cashFlow, comparison, categories, structure, recent, upcoming] = await Promise.all([
    getDashboardEndpoint<DashboardSummary>("summary", filters), getDashboardEndpoint<BalanceForecast>("balance-forecast", filters), getDashboardEndpoint<CreditUtilization>("credit-utilization", filters), getDashboardEndpoint<CreditAccountUtilization[]>("credit-account-utilization", filters), getDashboardEndpoint<RecurringDebts>("recurring-debts", filters), getDashboardEndpoint<DebtToIncome>("debt-to-income", filters), getDashboardEndpoint<CashFlowPoint[]>("cash-flow", filters), getDashboardEndpoint<ComparisonPoint[]>("period-comparison", filters),
    getDashboardEndpoint<CategoryPoint[]>("category-spending", filters), getDashboardEndpoint<CategoryPoint[]>("expense-structure", filters), getDashboardEndpoint<Transaction[]>("recent-transactions", filters), getDashboardEndpoint<PlannedPayment[]>("upcoming-payments", filters),
  ]);
  return { summary, forecast, creditUtilization, creditAccounts, recurringDebts, debtToIncome, cashFlow, comparison, categories, structure, recent, upcoming };
}
