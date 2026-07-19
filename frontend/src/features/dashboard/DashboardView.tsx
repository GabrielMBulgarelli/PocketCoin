import { useQuery } from "@tanstack/react-query";
import { getDashboardEndpoint, type BalanceForecast, type CashFlowTable, type CategoryPoint, type ComparisonPoint, type CreditAccountUtilization, type CreditUtilization, type DashboardFilters, type DashboardSummary, type DebtToIncome, type RecurringDebts } from "../../api/dashboard";
import type { PlannedPayment } from "../../api/plannedPayments";
import { getCategories, getFinancialAccounts, getTags } from "../../api/referenceData";
import type { Transaction } from "../../api/transactions";
import { queryKeys } from "../../app/queryKeys";
import { formatMinor, formatShortDate, monthStartValue } from "../../lib/format";
import { BudgetProgressCard } from "../budgets/BudgetProgressCard";
import { BalanceForecastCard } from "./BalanceForecastCard";
import { CategorySpendingCard, DashboardFiltersControl, ExpenseStructureCard, PeriodComparisonCard } from "./DashboardCards";
import { CashFlowSummaryCard } from "./CashFlowSummaryCard";
import { CreditDebtSection } from "./CreditDebtSection";
import { DashboardCard } from "./DashboardCard";
import { PeriodLabel } from "./DashboardIndicators";
import { MetricSelector } from "./MetricSelector";
import { useAnalyticsViewState } from "./useAnalyticsViewState";

function useDashboardSection<T>(path: string, filters: DashboardFilters, enabled: boolean, extra: Record<string, string> = {}) {
  return useQuery({ queryKey: [...queryKeys.dashboard, path, filters, extra], queryFn: ({ signal }) => getDashboardEndpoint<T>(path, filters, extra, signal), enabled });
}

function SectionState({ title, period, query }: { title: string; period: string; query: { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown } }) {
  if (query.isPending) return <DashboardCard title={`Loading ${title.toLowerCase()}`} description={period}><p className="py-16 text-center text-sm text-muted-foreground" role="status">Loading…</p></DashboardCard>;
  if (query.isError) return <DashboardCard title={`${title} unavailable`} description={period}><div className="py-10 text-center"><p className="text-sm text-destructive" role="alert">{query.error?.message ?? "This section could not be loaded."}</p><button className="mt-4 min-h-11 rounded-lg border px-4 text-sm font-medium" type="button" onClick={() => void query.refetch()}>Retry {title.toLowerCase()}</button></div></DashboardCard>;
  return null;
}

export function DashboardView({ currency, locale }: { currency: string; locale: string }) {
  const { filters, metric, effectiveFilters, effectiveMetric, isUpdating, setFilters, setMetric, reset } = useAnalyticsViewState("/dashboard", "expenses");
  const validRange = Boolean(filters.start_date && filters.end_date && filters.start_date <= filters.end_date);
  const accounts = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: ({ signal }) => getFinancialAccounts(signal) });
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: ({ signal }) => getCategories(signal) });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: ({ signal }) => getTags(signal) });
  const accountCatalog = { data: accounts.data, isPending: accounts.isPending, isError: accounts.isError, retry: () => void accounts.refetch() };
  const categoryCatalog = { data: categories.data, isPending: categories.isPending, isError: categories.isError, retry: () => void categories.refetch() };
  const tagCatalog = { data: tags.data, isPending: tags.isPending, isError: tags.isError, retry: () => void tags.refetch() };
  const summary = useDashboardSection<DashboardSummary>("summary", effectiveFilters, validRange);
  const forecast = useDashboardSection<BalanceForecast>("balance-forecast", effectiveFilters, validRange);
  const cashTable = useDashboardSection<CashFlowTable>("cash-flow-table", effectiveFilters, validRange);
  const comparison = useDashboardSection<ComparisonPoint[]>("period-comparison", effectiveFilters, validRange, { metric: effectiveMetric });
  const categorySpending = useDashboardSection<CategoryPoint[]>("category-spending", effectiveFilters, validRange);
  const structure = useDashboardSection<CategoryPoint[]>("expense-structure", effectiveFilters, validRange);
  const recent = useDashboardSection<Transaction[]>("recent-transactions", effectiveFilters, validRange);
  const upcoming = useDashboardSection<PlannedPayment[]>("upcoming-payments", effectiveFilters, validRange);
  const credit = useDashboardSection<CreditUtilization>("credit-utilization", effectiveFilters, validRange);
  const creditAccounts = useDashboardSection<CreditAccountUtilization[]>("credit-account-utilization", effectiveFilters, validRange);
  const recurringDebts = useDashboardSection<RecurringDebts>("recurring-debts", effectiveFilters, validRange);
  const debtToIncome = useDashboardSection<DebtToIncome>("debt-to-income", effectiveFilters, validRange);
  const money = (value: number) => formatMinor(value, currency, locale);
  const shortDate = (value: string) => formatShortDate(value, locale);
  const period = validRange ? `${shortDate(filters.start_date)} – ${shortDate(filters.end_date)}` : "Adjust the date filters";
  const debtErrors = [credit, creditAccounts, recurringDebts, debtToIncome].filter((item) => item.isError).map((item) => item.error?.message ?? "A debt metric could not be loaded.");

  if (!validRange) return <div className="min-w-0 space-y-5"><DashboardFiltersControl filters={filters} onChange={setFilters} accounts={accountCatalog} categories={categoryCatalog} tags={tagCatalog} onReset={reset} /><DashboardCard title="Invalid date range" description={period}><p className="py-8 text-sm text-destructive" role="alert">The start date must be on or before the end date. Adjust either date to continue.</p></DashboardCard></div>;

  return <div className="min-w-0 space-y-5"><DashboardFiltersControl filters={filters} onChange={setFilters} accounts={accountCatalog} categories={categoryCatalog} tags={tagCatalog} onReset={reset} />
    <div className="relative min-w-0">{isUpdating && <p className="absolute inset-x-0 top-8 z-10 text-center text-sm font-medium text-muted-foreground" role="status">Updating filters…</p>}<div aria-hidden={isUpdating || undefined} className={`space-y-5 ${isUpdating ? "invisible" : ""}`}>
    {summary.isPending || summary.isError ? <SectionState title="Summary" period={period} query={summary} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Balance", summary.data.balance_minor], ["Income", summary.data.income_minor], ["Expenses", summary.data.expense_minor], ["Net", summary.data.net_minor]].map(([label, value]) => <DashboardCard key={String(label)} title={String(label)} period={label === "Balance" ? <PeriodLabel kind="as-of" date={filters.end_date} locale={locale} /> : <PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} contentClassName="mt-3"><p className="text-2xl font-semibold tabular-nums">{money(Number(value))}</p>{label === "Net" && <p className="mt-2 text-xs text-muted-foreground">Savings rate {summary.data.savings_rate === null ? "—" : `${summary.data.savings_rate}%`}</p>}</DashboardCard>)}</div>}
    <div className="grid gap-5 xl:grid-cols-2">
      {forecast.isPending || forecast.isError ? <SectionState title="Balance forecast" period={period} query={forecast} /> : <BalanceForecastCard forecast={forecast.data} formatMinor={money} shortDate={shortDate} />}
      <BudgetProgressCard month={monthStartValue(filters.end_date)} currency={currency} locale={locale} />
      {cashTable.isPending || cashTable.isError ? <SectionState title="Cash flow" period={period} query={cashTable} /> : <CashFlowSummaryCard data={cashTable.data} period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} formatMinor={money} />}
      {comparison.isPending || comparison.isError ? <SectionState title="Period comparison" period={period} query={comparison} /> : <PeriodComparisonCard data={comparison.data} context={`${metric.replace("_", " ")} vs previous period and prior year`} emptyLabel={`No comparable ${metric.replace("_", " ")} yet.`} formatMinor={money} shortDate={shortDate} period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} actions={<MetricSelector value={metric} onChange={setMetric} />} />}
      {categorySpending.isPending || categorySpending.isError ? <SectionState title="Category spending" period={period} query={categorySpending} /> : <CategorySpendingCard data={categorySpending.data} context={`${period} · highest expense categories`} formatMinor={money} />}
      {structure.isPending || structure.isError ? <SectionState title="Expense structure" period={period} query={structure} /> : <ExpenseStructureCard data={structure.data} formatMinor={money} />}
    </div>
    <CreditDebtSection overall={credit.data} accounts={creditAccounts.data} debts={recurringDebts.data} dti={debtToIncome.data} pending={credit.isPending || creditAccounts.isPending || recurringDebts.isPending || debtToIncome.isPending} errors={debtErrors} formatMinor={money} />
    {recent.isPending || recent.isError ? <SectionState title="Recent transactions" period={period} query={recent} /> : <DashboardCard title="Recent transactions" description="Latest eight records" period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />}><div className="divide-y">{recent.data.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No transactions match these filters.</p> : recent.data.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{shortDate(item.transaction_date)} · {item.kind.replace("_", " ")}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount_minor)}</p></div>)}</div></DashboardCard>}
    {upcoming.isPending || upcoming.isError ? <SectionState title="Upcoming payments" period={period} query={upcoming} /> : <DashboardCard title="Upcoming payments" description="Pending schedules" period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />}><div className="divide-y">{upcoming.data.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No upcoming payments match these filters.</p> : upcoming.data.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">Due {shortDate(item.due_date)} · {item.recurrence}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount_minor)}</p></div>)}</div></DashboardCard>}
    </div></div>
  </div>;
}
