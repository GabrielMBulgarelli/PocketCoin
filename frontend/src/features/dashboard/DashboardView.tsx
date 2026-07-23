import { useQuery } from "@tanstack/react-query";

import { getDashboardEndpoint, type BalanceForecast, type CashFlowTable, type CategoryPoint, type ComparisonMetric, type ComparisonPoint, type CreditAccountUtilization, type CreditUtilization, type DashboardFilters, type DebtToIncome, type RecentActivity, type RecurringDebts } from "../../api/dashboard";
import { getCategories, getFinancialAccounts, getTags } from "../../api/referenceData";
import { queryKeys } from "../../app/queryKeys";
import { useOptionalWorkspaceRoute } from "../../app/WorkspaceRouteContext";
import { useWorkspaceTools } from "../../app/WorkspaceToolsContext";
import { Button } from "../../components/ui/button";
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

type SectionQuery = { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown };

function SectionState({ title, period, query }: { title: string; period: string; query: SectionQuery }) {
  if (query.isPending) return <DashboardCard title={`Loading ${title.toLowerCase()}`} description={period}><p className="py-16 text-center text-sm text-muted-foreground" role="status">Loading…</p></DashboardCard>;
  if (query.isError) return <DashboardCard title={`${title} unavailable`} description={period}><div className="py-10 text-center"><p className="text-sm text-destructive" role="alert">{query.error?.message ?? "This section could not be loaded."}</p><Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>Retry {title.toLowerCase()}</Button></div></DashboardCard>;
  return null;
}

function InlineSectionState({ title, query }: { title: string; query: SectionQuery }) {
  if (query.isPending) return <p className="py-16 text-center text-sm text-muted-foreground" role="status">Loading…</p>;
  if (query.isError) return <div className="py-10 text-center"><p className="text-sm text-destructive" role="alert">{query.error?.message ?? "This section could not be loaded."}</p><Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>Retry {title.toLowerCase()}</Button></div>;
  return null;
}

const overviewModes = [
  ["cash-flow", "Cash Flow"],
  ["forecast", "Forecast"],
  ["spending", "Spending"],
  ["debt", "Debt"],
] as const;

const comparisonMetricLabels: Record<ComparisonMetric, string> = {
  expenses: "Expenses",
  income: "Income",
  cash_flow: "Cash flow",
};

export function DashboardView({ currency, locale }: { currency: string; locale: string }) {
  const workspace = useOptionalWorkspaceRoute();
  const mode = workspace?.state.analysis ?? "cash-flow";
  const activity = workspace?.state.activity ?? "expenses";
  const { filters, metric, effectiveFilters, effectiveMetric, isUpdating, setFilters, setMetric, reset } = useAnalyticsViewState("/dashboard", "expenses");
  const validRange = Boolean(filters.start_date && filters.end_date && filters.start_date <= filters.end_date);
  const accounts = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: ({ signal }) => getFinancialAccounts(signal) });
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: ({ signal }) => getCategories(signal) });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: ({ signal }) => getTags(signal) });
  const accountCatalog = { data: accounts.data, isPending: accounts.isPending, isError: accounts.isError, retry: () => void accounts.refetch() };
  const categoryCatalog = { data: categories.data, isPending: categories.isPending, isError: categories.isError, retry: () => void categories.refetch() };
  const tagCatalog = { data: tags.data, isPending: tags.isPending, isError: tags.isError, retry: () => void tags.refetch() };
  const forecast = useDashboardSection<BalanceForecast>("balance-forecast", effectiveFilters, validRange && mode === "forecast");
  const cashTable = useDashboardSection<CashFlowTable>("cash-flow-table", effectiveFilters, validRange && mode === "cash-flow");
  const comparison = useDashboardSection<ComparisonPoint[]>("period-comparison", effectiveFilters, validRange && mode === "cash-flow", { metric: effectiveMetric });
  const categorySpending = useDashboardSection<CategoryPoint[]>("category-spending", effectiveFilters, validRange && mode === "spending");
  const structure = useDashboardSection<CategoryPoint[]>("expense-structure", effectiveFilters, validRange && mode === "spending");
  const recent = useDashboardSection<RecentActivity[]>("recent-transactions", effectiveFilters, validRange, { activity });
  const credit = useDashboardSection<CreditUtilization>("credit-utilization", effectiveFilters, validRange && mode === "debt");
  const creditAccounts = useDashboardSection<CreditAccountUtilization[]>("credit-account-utilization", effectiveFilters, validRange && mode === "debt");
  const recurringDebts = useDashboardSection<RecurringDebts>("recurring-debts", effectiveFilters, validRange && mode === "debt");
  const debtToIncome = useDashboardSection<DebtToIncome>("debt-to-income", effectiveFilters, validRange && mode === "debt");
  const money = (value: number) => formatMinor(value, currency, locale);
  const shortDate = (value: string) => formatShortDate(value, locale);
  const period = validRange ? `${shortDate(filters.start_date)} – ${shortDate(filters.end_date)}` : "Adjust the date filters";
  const debtErrors = [credit, creditAccounts, recurringDebts, debtToIncome].filter((item) => item.isError).map((item) => item.error?.message ?? "A debt metric could not be loaded.");
  const activityRows = recent.data ?? [];
  const accountName = (id: number | null) => id === null ? "General" : accounts.data?.find((item) => item.id === id)?.name ?? "Account unavailable";
  const categoryName = (id: number | null) => id === null ? "Uncategorized" : categories.data?.find((item) => item.id === id)?.name ?? "Category unavailable";
  const filtersControl = <DashboardFiltersControl compact showAccount={false} filters={filters} onChange={setFilters} accounts={accountCatalog} categories={categoryCatalog} tags={tagCatalog} onReset={reset} />;
  const toolsRegistered = useWorkspaceTools({ filters: filtersControl });
  if (!validRange) return <div className="min-w-0 space-y-5">{!toolsRegistered && filtersControl}<DashboardCard title="Invalid date range" description={period}><p className="py-8 text-sm text-destructive" role="alert">The start date must be on or before the end date.</p></DashboardCard></div>;

  return <div className="min-w-0 space-y-5">
    {!toolsRegistered && filtersControl}
    <nav aria-label="Financial analysis" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-sm">{overviewModes.map(([item, label]) => <Button aria-current={mode === item ? "page" : undefined} className="shrink-0" key={item} onClick={() => workspace?.update({ analysis: item })} size="sm" variant={mode === item ? "default" : "ghost"}>{label}</Button>)}</nav>
    <div className="relative min-w-0">
      {isUpdating && <p className="absolute inset-x-0 top-3 z-10 text-center text-sm font-medium text-muted-foreground" role="status">Updating filters…</p>}
      <div aria-busy={isUpdating} className={`space-y-5 transition-opacity ${isUpdating ? "invisible" : ""}`}>
        <div className="grid gap-5 xl:grid-cols-2">
          {mode === "forecast" && (forecast.isPending || forecast.isError ? <SectionState title="Balance forecast" period={period} query={forecast} /> : <BalanceForecastCard forecast={forecast.data} formatMinor={money} shortDate={shortDate} />)}
          {mode === "cash-flow" && (cashTable.isPending || cashTable.isError ? <SectionState title="Cash flow" period={period} query={cashTable} /> : <CashFlowSummaryCard data={cashTable.data} period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} formatMinor={money} />)}
          {mode === "cash-flow" && (comparison.isPending || comparison.isError ? <SectionState title="Period comparison" period={period} query={comparison} /> : <PeriodComparisonCard data={comparison.data} context={`${comparisonMetricLabels[metric]} compared with previous period and prior year`} emptyLabel="No comparable period yet." formatMinor={money} shortDate={shortDate} period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} actions={<MetricSelector value={metric} onChange={setMetric} />} />)}
          {mode === "spending" && <BudgetProgressCard month={monthStartValue(filters.end_date)} currency={currency} locale={locale} />}
          {mode === "spending" && (categorySpending.isPending || categorySpending.isError ? <SectionState title="Category spending" period={period} query={categorySpending} /> : <CategorySpendingCard data={categorySpending.data} context={`${period} · highest expense categories`} formatMinor={money} />)}
          {mode === "spending" && (structure.isPending || structure.isError ? <SectionState title="Expense structure" period={period} query={structure} /> : <ExpenseStructureCard data={structure.data} formatMinor={money} />)}
        </div>
        {mode === "debt" && <CreditDebtSection overall={credit.data} accounts={creditAccounts.data} debts={recurringDebts.data} dti={debtToIncome.data} pending={credit.isPending || creditAccounts.isPending || recurringDebts.isPending || debtToIncome.isPending} errors={debtErrors} formatMinor={money} />}
        <DashboardCard title="Recent activity" description="Latest eight records" period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} actions={<nav aria-label="Recent activity kind" className="flex flex-wrap gap-1">{(["income", "expenses", "transfers"] as const).map((item) => <Button aria-current={activity === item ? "page" : undefined} key={item} onClick={() => workspace?.update({ activity: item })} size="sm" variant={activity === item ? "default" : "ghost"}>{item[0].toUpperCase() + item.slice(1)}</Button>)}</nav>}>
          {recent.isPending || recent.isError ? <InlineSectionState title="Recent activity" query={recent} /> : <div className="divide-y">{activityRows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No {activity} match these filters.</p> : activityRows.map((item) => <div key={item.transfer_group_id ?? item.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{shortDate(item.transaction_date)} · {item.kind === "transfer" ? `${accountName(item.from_account_id)} → ${accountName(item.to_account_id)}` : `${categoryName(item.category_id)} · ${accountName(item.financial_account_id)}`}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount_minor)}</p></div>)}</div>}
        </DashboardCard>
      </div>
    </div>
  </div>;
}
