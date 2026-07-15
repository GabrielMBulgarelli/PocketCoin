import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardEndpoint, type BalanceForecast, type CashFlowPoint, type CategoryPoint, type ComparisonPoint, type CreditAccountUtilization, type CreditUtilization, type DashboardFilters, type DashboardSummary, type DebtToIncome, type RecurringDebts } from "../../api/dashboard";
import type { PlannedPayment } from "../../api/plannedPayments";
import { getCategories, getFinancialAccounts, getTags } from "../../api/referenceData";
import type { Transaction } from "../../api/transactions";
import { queryKeys } from "../../app/queryKeys";
import { formatMinor, formatShortDate, localDateValue, monthStartValue } from "../../lib/format";
import { BudgetProgressCard } from "../budgets/BudgetProgressCard";
import { BalanceForecastCard } from "./BalanceForecastCard";
import { Card, CashFlowCard, CategorySpendingCard, DashboardFiltersControl, ExpenseStructureCard, PeriodComparisonCard } from "./DashboardCards";
import { CreditDebtSection } from "./CreditDebtSection";

function useDashboardSection<T>(path: string, filters: DashboardFilters, enabled: boolean) {
  return useQuery({ queryKey: [...queryKeys.dashboard, path, filters], queryFn: () => getDashboardEndpoint<T>(path, filters), enabled });
}

function SectionState({ title, period, query }: { title: string; period: string; query: { isPending: boolean; isError: boolean; error: Error | null } }) {
  if (query.isPending) return <Card title={`Loading ${title.toLowerCase()}`} context={period}><p className="py-16 text-center text-sm text-muted-foreground" role="status">Loading…</p></Card>;
  if (query.isError) return <Card title={`${title} unavailable`} context={period}><p className="py-12 text-center text-sm text-destructive" role="alert">{query.error?.message ?? "This section could not be loaded."}</p></Card>;
  return null;
}

export function DashboardView({ currency, locale }: { currency: string; locale: string }) {
  const [filters, setFilters] = useState<DashboardFilters>({ start_date: monthStartValue(localDateValue()), end_date: localDateValue() });
  const validRange = Boolean(filters.start_date && filters.end_date && filters.start_date <= filters.end_date);
  const accounts = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: getFinancialAccounts });
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: getCategories });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: getTags });
  const summary = useDashboardSection<DashboardSummary>("summary", filters, validRange);
  const forecast = useDashboardSection<BalanceForecast>("balance-forecast", filters, validRange);
  const cashFlow = useDashboardSection<CashFlowPoint[]>("cash-flow", filters, validRange);
  const comparison = useDashboardSection<ComparisonPoint[]>("period-comparison", filters, validRange);
  const categorySpending = useDashboardSection<CategoryPoint[]>("category-spending", filters, validRange);
  const structure = useDashboardSection<CategoryPoint[]>("expense-structure", filters, validRange);
  const recent = useDashboardSection<Transaction[]>("recent-transactions", filters, validRange);
  const upcoming = useDashboardSection<PlannedPayment[]>("upcoming-payments", filters, validRange);
  const credit = useDashboardSection<CreditUtilization>("credit-utilization", filters, validRange);
  const creditAccounts = useDashboardSection<CreditAccountUtilization[]>("credit-account-utilization", filters, validRange);
  const recurringDebts = useDashboardSection<RecurringDebts>("recurring-debts", filters, validRange);
  const debtToIncome = useDashboardSection<DebtToIncome>("debt-to-income", filters, validRange);
  const money = (value: number) => formatMinor(value, currency, locale);
  const shortDate = (value: string) => formatShortDate(value, locale);
  const period = validRange ? `${shortDate(filters.start_date)} – ${shortDate(filters.end_date)}` : "Adjust the date filters";
  const debtErrors = [credit, creditAccounts, recurringDebts, debtToIncome].filter((item) => item.isError).map((item) => item.error?.message ?? "A debt metric could not be loaded.");

  if (!validRange) return <div className="space-y-5"><DashboardFiltersControl filters={filters} onChange={setFilters} accounts={accounts.data} categories={categories.data} tags={tags.data} /><Card title="Invalid date range" context={period}><p className="py-8 text-sm text-destructive" role="alert">The start date must be on or before the end date. Adjust either date to continue.</p></Card></div>;

  return <div className="space-y-5"><DashboardFiltersControl filters={filters} onChange={setFilters} accounts={accounts.data} categories={categories.data} tags={tags.data} />
    {summary.isPending || summary.isError ? <SectionState title="Summary" period={period} query={summary} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Balance", summary.data.balance_minor], ["Income", summary.data.income_minor], ["Expenses", summary.data.expense_minor], ["Net", summary.data.net_minor]].map(([label, value]) => <Card key={String(label)} title={String(label)} context={label === "Balance" ? `As of ${shortDate(filters.end_date)}` : period}><p className="text-2xl font-semibold tabular-nums">{money(Number(value))}</p>{label === "Net" && <p className="mt-2 text-xs text-muted-foreground">Savings rate {summary.data.savings_rate === null ? "—" : `${summary.data.savings_rate}%`}</p>}</Card>)}</div>}
    <div className="grid gap-5 xl:grid-cols-2">
      {forecast.isPending || forecast.isError ? <SectionState title="Balance forecast" period={period} query={forecast} /> : <BalanceForecastCard forecast={forecast.data} formatMinor={money} shortDate={shortDate} />}
      <BudgetProgressCard month={monthStartValue(filters.end_date)} currency={currency} locale={locale} />
      {cashFlow.isPending || cashFlow.isError ? <SectionState title="Cash flow" period={period} query={cashFlow} /> : <CashFlowCard data={cashFlow.data} context={`${period} · income and expenses`} formatMinor={money} shortDate={shortDate} />}
      {comparison.isPending || comparison.isError ? <SectionState title="Period comparison" period={period} query={comparison} /> : <PeriodComparisonCard data={comparison.data} context="Expense pace vs previous period and prior year" emptyLabel="No comparable expenses yet." formatMinor={money} shortDate={shortDate} />}
      {categorySpending.isPending || categorySpending.isError ? <SectionState title="Category spending" period={period} query={categorySpending} /> : <CategorySpendingCard data={categorySpending.data} context={`${period} · highest expense categories`} formatMinor={money} />}
      {structure.isPending || structure.isError ? <SectionState title="Expense structure" period={period} query={structure} /> : <ExpenseStructureCard data={structure.data} formatMinor={money} />}
    </div>
    <CreditDebtSection overall={credit.data} accounts={creditAccounts.data} debts={recurringDebts.data} dti={debtToIncome.data} pending={credit.isPending || creditAccounts.isPending || recurringDebts.isPending || debtToIncome.isPending} errors={debtErrors} formatMinor={money} />
    {recent.isPending || recent.isError ? <SectionState title="Recent transactions" period={period} query={recent} /> : <Card title="Recent transactions" context={`${period} · latest eight`}><div className="divide-y">{recent.data.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No transactions match these filters.</p> : recent.data.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{shortDate(item.transaction_date)} · {item.kind.replace("_", " ")}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount_minor)}</p></div>)}</div></Card>}
    {upcoming.isPending || upcoming.isError ? <SectionState title="Upcoming payments" period={period} query={upcoming} /> : <Card title="Upcoming payments" context={`${period} · pending schedules`}><div className="divide-y">{upcoming.data.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No upcoming payments match these filters.</p> : upcoming.data.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">Due {shortDate(item.due_date)} · {item.recurrence}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount_minor)}</p></div>)}</div></Card>}
  </div>;
}
