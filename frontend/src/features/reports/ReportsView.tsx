import { useQuery } from "@tanstack/react-query";
import { getCategories, getFinancialAccounts, getTags } from "../../api/referenceData";
import { getDashboardEndpoint, type CashFlowPoint, type CashFlowTable, type CategoryPoint, type ComparisonPoint, type CreditAccountUtilization, type CreditUtilization, type DashboardFilters, type DebtToIncome, type RecurringDebts } from "../../api/dashboard";
import type { BudgetProgress } from "../../api/budgets";
import { exportTransactions } from "../../api/transactions";
import { queryKeys } from "../../app/queryKeys";
import { formatMinor, formatShortDate } from "../../lib/format";
import { useCsvExport } from "../../lib/useCsvExport";
import { BudgetProgressList } from "../budgets/BudgetProgressCard";
import { CashFlowCard, CategorySpendingCard, DashboardFiltersControl, ExpenseStructureCard, PeriodComparisonCard } from "../dashboard/DashboardCards";
import { CashFlowSummaryCard } from "../dashboard/CashFlowSummaryCard";
import { CreditDebtSection } from "../dashboard/CreditDebtSection";
import { DashboardCard } from "../dashboard/DashboardCard";
import { PeriodLabel } from "../dashboard/DashboardIndicators";
import { MetricSelector } from "../dashboard/MetricSelector";
import { useAnalyticsViewState } from "../dashboard/useAnalyticsViewState";

function useReportSection<T>(path: string, filters: DashboardFilters, enabled: boolean, extra: Record<string, string> = {}) {
  return useQuery({ queryKey: [...queryKeys.reports, path, filters, extra], queryFn: () => getDashboardEndpoint<T>(path, filters, extra), enabled });
}

function SectionState({ title, period, query }: { title: string; period: string; query: { isPending: boolean; isError: boolean; error: Error | null } }) {
  if (query.isPending) return <DashboardCard title={`Loading ${title.toLowerCase()}`} description={period}><p className="py-16 text-center text-sm text-muted-foreground" role="status">Loading…</p></DashboardCard>;
  if (query.isError) return <DashboardCard title={`${title} unavailable`} description={period}><p className="py-12 text-center text-sm text-destructive" role="alert">{query.error?.message ?? "This section could not be loaded."}</p></DashboardCard>;
  return null;
}

export function ReportsView({ currency, locale }: { currency: string; locale: string }) {
  const { filters, metric, setFilters, setMetric, reset } = useAnalyticsViewState("/reports", "cash_flow");
  const validRange = Boolean(filters.start_date && filters.end_date && filters.start_date <= filters.end_date);
  const csvExport = useCsvExport();
  const accounts = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: getFinancialAccounts }); const categories = useQuery({ queryKey: queryKeys.categories, queryFn: getCategories }); const tags = useQuery({ queryKey: queryKeys.tags, queryFn: getTags });
  const accountCatalog = { data: accounts.data, isPending: accounts.isPending, isError: accounts.isError, retry: () => void accounts.refetch() }; const categoryCatalog = { data: categories.data, isPending: categories.isPending, isError: categories.isError, retry: () => void categories.refetch() }; const tagCatalog = { data: tags.data, isPending: tags.isPending, isError: tags.isError, retry: () => void tags.refetch() };
  const cashFlow = useReportSection<CashFlowPoint[]>("cash-flow", filters, validRange);
  const cashTable = useReportSection<CashFlowTable>("cash-flow-table", filters, validRange);
  const comparison = useReportSection<ComparisonPoint[]>("period-comparison", filters, validRange, { metric });
  const categorySpending = useReportSection<CategoryPoint[]>("category-spending", filters, validRange);
  const structure = useReportSection<CategoryPoint[]>("expense-structure", filters, validRange);
  const budgets = useReportSection<BudgetProgress[]>("budget-progress", filters, validRange);
  const credit = useReportSection<CreditUtilization>("credit-utilization", filters, validRange);
  const creditAccounts = useReportSection<CreditAccountUtilization[]>("credit-account-utilization", filters, validRange);
  const recurringDebts = useReportSection<RecurringDebts>("recurring-debts", filters, validRange);
  const debtToIncome = useReportSection<DebtToIncome>("debt-to-income", filters, validRange);
  const money = (value: number) => formatMinor(value, currency, locale); const shortDate = (value: string) => formatShortDate(value, locale); const period = validRange ? `${shortDate(filters.start_date)} – ${shortDate(filters.end_date)}` : "Adjust the date filters";
  const debtErrors = [credit, creditAccounts, recurringDebts, debtToIncome].filter((item) => item.isError).map((item) => item.error?.message ?? "A debt metric could not be loaded.");
  return <div className="min-w-0 space-y-5"><DashboardFiltersControl label="Report filters" filters={filters} onChange={setFilters} accounts={accountCatalog} categories={categoryCatalog} tags={tagCatalog} onReset={reset} />
    <div className="flex justify-end"><button className="min-h-11 touch-manipulation rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!validRange || csvExport.status === "exporting"} onClick={() => void csvExport.start(() => exportTransactions(filters))}>{csvExport.status === "exporting" ? "Exporting…" : "Export filtered CSV"}</button></div>{csvExport.message && <p role={csvExport.status === "error" ? "alert" : "status"} aria-live="polite" className={csvExport.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{csvExport.message}</p>}
    {!validRange ? <DashboardCard title="Invalid date range" description={period}><p className="py-8 text-sm text-destructive" role="alert">The start date must be on or before the end date. Adjust either date to continue.</p></DashboardCard> : <>
      {cashTable.isPending || cashTable.isError ? <SectionState title="Cash-flow statistics" period={period} query={cashTable} /> : <>
        <CashFlowSummaryCard data={cashTable.data} period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} formatMinor={money} />
        <DashboardCard title="Cash-flow statistics" description={`${cashTable.data.period_days} inclusive days`} period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />}><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-2">Measure</th><th>Count</th><th>Total</th><th>Daily average</th><th>Average transaction</th></tr></thead><tbody>{[["Income", cashTable.data.income], ["Expenses", cashTable.data.expense]].map(([label, row]) => { const value = row as typeof cashTable.data.income; return <tr key={String(label)} className="border-b"><th className="py-3 font-medium">{String(label)}</th><td>{value.count}</td><td>{money(value.total_minor)}</td><td>{money(value.daily_average_minor)}</td><td>{money(value.average_transaction_minor)}</td></tr>; })}</tbody><tfoot><tr><th className="pt-3">Net cash flow</th><td colSpan={2} className="pt-3 font-semibold">{money(cashTable.data.net_minor)}</td><td className="pt-3 text-muted-foreground">Change vs previous</td><td className="pt-3 font-semibold">{money(cashTable.data.net_change_minor)}</td></tr></tfoot></table></div></DashboardCard>
      </>}
      <div className="grid gap-5 xl:grid-cols-2">
        {cashFlow.isPending || cashFlow.isError ? <SectionState title="Cash flow" period={period} query={cashFlow} /> : <CashFlowCard data={cashFlow.data} context={`${period} · income and expenses`} formatMinor={money} shortDate={shortDate} />}
        {comparison.isPending || comparison.isError ? <SectionState title="Period comparison" period={period} query={comparison} /> : <PeriodComparisonCard data={comparison.data} context={`${metric.replace("_", " ")} vs previous period and prior year`} emptyLabel={`No comparable ${metric.replace("_", " ")} yet.`} formatMinor={money} shortDate={shortDate} period={<PeriodLabel kind="range" startDate={filters.start_date} endDate={filters.end_date} locale={locale} />} actions={<MetricSelector value={metric} onChange={setMetric} />} />}
        {categorySpending.isPending || categorySpending.isError ? <SectionState title="Category spending" period={period} query={categorySpending} /> : <CategorySpendingCard data={categorySpending.data} context={`${period} · highest expense categories`} formatMinor={money} />}
        {structure.isPending || structure.isError ? <SectionState title="Expense structure" period={period} query={structure} /> : <ExpenseStructureCard data={structure.data} formatMinor={money} />}
        {budgets.isPending || budgets.isError ? <SectionState title="Budget performance" period={period} query={budgets} /> : <DashboardCard title="Budget performance" description={`Month containing ${shortDate(filters.end_date)}`}><BudgetProgressList data={budgets.data} money={money} /></DashboardCard>}
      </div>
      <CreditDebtSection overall={credit.data} accounts={creditAccounts.data} debts={recurringDebts.data} dti={debtToIncome.data} pending={credit.isPending || creditAccounts.isPending || recurringDebts.isPending || debtToIncome.isPending} errors={debtErrors} formatMinor={money} />
    </>}
  </div>;
}
