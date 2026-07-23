import { useQuery } from "@tanstack/react-query";

import { getDashboardEndpoint, type BalanceForecast, type CashFlowPoint, type CashFlowTable, type CategoryPoint, type ComparisonMetric, type ComparisonPoint, type DashboardFilters } from "../../api/dashboard";
import { getCategories, getFinancialAccounts, getTags } from "../../api/referenceData";
import { queryKeys } from "../../app/queryKeys";
import { useOptionalWorkspaceRoute } from "../../app/WorkspaceRouteContext";
import { useWorkspaceTools } from "../../app/WorkspaceToolsContext";
import { Button } from "../../components/ui/button";
import { formatMinor, formatShortDate, localMonthValue, monthEndValue } from "../../lib/format";
import { BudgetsView } from "../budgets/BudgetsView";
import { PlannedPaymentsView } from "../planned-payments/PlannedPaymentsView";
import { BalanceForecastCard } from "./BalanceForecastCard";
import { CategorySpendingCard, DashboardFiltersControl, ExpenseStructureCard, PeriodComparisonCard } from "./DashboardCards";
import { ComparativeCashFlowCard } from "./ComparativeCashFlowCard";
import { CashFlowSummaryCard } from "./CashFlowSummaryCard";
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

const overviewModes = [
  ["cash-flow", "Cash Flow"],
  ["forecast", "Forecast"],
  ["planning", "Planning"],
] as const;

const comparisonMetricLabels: Record<ComparisonMetric, string> = {
  expenses: "Expenses",
  income: "Income",
  cash_flow: "Cash flow",
};

export function DashboardView({ currency, locale }: { currency: string; locale: string }) {
  const workspace = useOptionalWorkspaceRoute();
  const mode = workspace?.state.analysis ?? "cash-flow";
  const { filters, metric, effectiveFilters, effectiveMetric, isUpdating, setFilters, setMetric, reset } = useAnalyticsViewState("/dashboard", "expenses");
  const validRange = Boolean(filters.start_date && filters.end_date && filters.start_date <= filters.end_date);
  const accounts = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: ({ signal }) => getFinancialAccounts(signal) });
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: ({ signal }) => getCategories(signal) });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: ({ signal }) => getTags(signal) });
  const accountCatalog = { data: accounts.data, isPending: accounts.isPending, isError: accounts.isError, retry: () => void accounts.refetch() };
  const categoryCatalog = { data: categories.data, isPending: categories.isPending, isError: categories.isError, retry: () => void categories.refetch() };
  const tagCatalog = { data: tags.data, isPending: tags.isPending, isError: tags.isError, retry: () => void tags.refetch() };
  const planningMonth = workspace?.state.month ?? localMonthValue();
  const planningFilters = {
    ...effectiveFilters,
    start_date: `${planningMonth}-01`,
    end_date: monthEndValue(planningMonth),
  };
  const forecast = useDashboardSection<BalanceForecast>("balance-forecast", effectiveFilters, validRange && mode === "forecast");
  const cashFlow = useDashboardSection<CashFlowPoint[]>("cash-flow", effectiveFilters, validRange && mode === "cash-flow");
  const cashTable = useDashboardSection<CashFlowTable>("cash-flow-table", effectiveFilters, validRange && mode === "cash-flow");
  const comparison = useDashboardSection<ComparisonPoint[]>("period-comparison", effectiveFilters, validRange && mode === "cash-flow", { metric: effectiveMetric });
  const categorySpending = useDashboardSection<CategoryPoint[]>("category-spending", planningFilters, mode === "planning");
  const structure = useDashboardSection<CategoryPoint[]>("expense-structure", effectiveFilters, validRange && mode === "cash-flow");
  const money = (value: number) => formatMinor(value, currency, locale);
  const compactMoney = (value: number) => new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value / 100);
  const shortDate = (value: string) => formatShortDate(value, locale);
  const monthLabel = (value: string) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${value}T00:00:00`));
  const period = validRange ? `${shortDate(filters.start_date)} – ${shortDate(filters.end_date)}` : "Adjust the date filters";
  const planningPeriod = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${planningMonth}-01T00:00:00`));
  const filtersControl = <DashboardFiltersControl compact showAccount={false} filters={filters} onChange={setFilters} accounts={accountCatalog} categories={categoryCatalog} tags={tagCatalog} onReset={reset} />;
  const toolsRegistered = useWorkspaceTools({ filters: filtersControl });
  if (!validRange) return <div className="min-w-0 space-y-5">{!toolsRegistered && filtersControl}<DashboardCard title="Invalid date range" description={period}><p className="py-8 text-sm text-destructive" role="alert">The start date must be on or before the end date.</p></DashboardCard></div>;

  return <div className="min-w-0 space-y-5">
    {!toolsRegistered && filtersControl}
    <nav aria-label="Financial analysis" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-sm">{overviewModes.map(([item, label]) => <Button aria-current={mode === item ? "page" : undefined} className="shrink-0" key={item} onClick={() => workspace?.update({ analysis: item })} size="sm" variant={mode === item ? "default" : "ghost"}>{label}</Button>)}</nav>
    <div className="relative min-w-0">
      {isUpdating && <p className="absolute inset-x-0 top-3 z-10 text-center text-sm font-medium text-muted-foreground" role="status">Updating filters…</p>}
      <div aria-busy={isUpdating} className={`space-y-5 transition-opacity ${isUpdating ? "invisible" : ""}`}>
        {mode === "planning" ? <div className="grid gap-5 lg:grid-cols-2" data-testid="planning-grid">
          <BudgetsView currency={currency} locale={locale} />
          <PlannedPaymentsView currency={currency} locale={locale} upcomingOnly />
          <div className="min-w-0 lg:col-span-2">
            {categorySpending.isPending || categorySpending.isError
              ? <SectionState title="Category spending" period={planningPeriod} query={categorySpending} />
              : <CategorySpendingCard data={categorySpending.data} context={`${planningPeriod} · highest expense categories`} formatMinor={money} />}
          </div>
        </div> : null}
        {mode !== "planning" ? <div className="grid gap-5 xl:grid-cols-2">
          {mode === "forecast" && (forecast.isPending || forecast.isError ? <SectionState title="Balance forecast" period={period} query={forecast} /> : <BalanceForecastCard forecast={forecast.data} formatMinor={money} shortDate={shortDate} />)}
          {mode === "cash-flow" && (cashTable.isPending || cashTable.isError ? <SectionState title="Cash flow" period={period} query={cashTable} /> : <CashFlowSummaryCard data={cashTable.data} period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} formatMinor={money} />)}
          {mode === "cash-flow" && (comparison.isPending || comparison.isError ? <SectionState title="Period comparison" period={period} query={comparison} /> : <PeriodComparisonCard data={comparison.data} context={`${comparisonMetricLabels[metric]} compared with previous period and prior year`} emptyLabel="No comparable period yet." formatMinor={money} shortDate={shortDate} period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} actions={<MetricSelector value={metric} onChange={setMetric} />} />)}
          {mode === "cash-flow" && <div className="min-w-0 xl:col-span-1">
            {cashFlow.isPending || cashFlow.isError
              ? <SectionState title="Comparative Bar Chart" period={period} query={cashFlow} />
              : <ComparativeCashFlowCard
                data={cashFlow.data}
                formatCompactMinor={compactMoney}
                formatMinor={money}
                monthLabel={monthLabel}
                period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />}
                shortDate={shortDate}
              />}
          </div>}
          {mode === "cash-flow" && <div className="min-w-0 xl:col-span-1">
            {structure.isPending || structure.isError
              ? <SectionState title="Expense structure" period={period} query={structure} />
              : <ExpenseStructureCard className="h-full" data={structure.data} formatMinor={money} />}
          </div>}
        </div> : null}
      </div>
    </div>
  </div>;
}
