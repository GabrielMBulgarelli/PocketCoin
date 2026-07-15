import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCategories, getFinancialAccounts, getTags } from "../../api/referenceData";
import { getDashboardEndpoint, type CashFlowPoint, type CashFlowTable, type CategoryPoint, type ComparisonMetric, type ComparisonPoint, type CreditAccountUtilization, type CreditUtilization, type DashboardFilters, type DebtToIncome, type RecurringDebts } from "../../api/dashboard";
import type { BudgetProgress } from "../../api/budgets";
import { exportTransactions } from "../../api/transactions";
import { queryKeys } from "../../app/queryKeys";
import { formatMinor, formatShortDate, localDateValue, monthStartValue } from "../../lib/format";
import { BudgetProgressList } from "../budgets/BudgetProgressCard";
import { Card, CashFlowCard, CategorySpendingCard, control, DashboardFiltersControl, ExpenseStructureCard, PeriodComparisonCard } from "../dashboard/DashboardCards";
import { CreditDebtSection } from "../dashboard/CreditDebtSection";

function useReportSection<T>(path: string, filters: DashboardFilters, enabled: boolean, extra: Record<string, string> = {}) {
  return useQuery({ queryKey: [...queryKeys.reports, path, filters, extra], queryFn: () => getDashboardEndpoint<T>(path, filters, extra), enabled });
}

function SectionState({ title, period, query }: { title: string; period: string; query: { isPending: boolean; isError: boolean; error: Error | null } }) {
  if (query.isPending) return <Card title={`Loading ${title.toLowerCase()}`} context={period}><p className="py-16 text-center text-sm text-muted-foreground" role="status">Loading…</p></Card>;
  if (query.isError) return <Card title={`${title} unavailable`} context={period}><p className="py-12 text-center text-sm text-destructive" role="alert">{query.error?.message ?? "This section could not be loaded."}</p></Card>;
  return null;
}

function ComparisonBar({ label, current, previous, money }: { label: string; current: number; previous: number; money: (value: number) => string }) {
  const scale = Math.max(Math.abs(current), Math.abs(previous), 1);
  return <Card title={label} context="Current · previous equivalent period">
    <div className="space-y-3">
      <div><div className="mb-1 flex justify-between gap-3 text-sm"><span>Current</span><strong className="tabular-nums">{money(current)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.abs(current) / scale * 100}%` }} /></div></div>
      <div><div className="mb-1 flex justify-between gap-3 text-sm text-muted-foreground"><span>Previous</span><span className="tabular-nums">{money(previous)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-muted-foreground/45" style={{ width: `${Math.abs(previous) / scale * 100}%` }} /></div></div>
    </div>
  </Card>;
}

export function ReportsView({ currency, locale }: { currency: string; locale: string }) {
  const [filters, setFilters] = useState<DashboardFilters>({ start_date: monthStartValue(localDateValue()), end_date: localDateValue() });
  const validRange = Boolean(filters.start_date && filters.end_date && filters.start_date <= filters.end_date);
  const [metric, setMetric] = useState<ComparisonMetric>("cash_flow");
  const [exportError, setExportError] = useState("");
  const accounts = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: getFinancialAccounts }); const categories = useQuery({ queryKey: queryKeys.categories, queryFn: getCategories }); const tags = useQuery({ queryKey: queryKeys.tags, queryFn: getTags });
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
  return <div className="space-y-5"><DashboardFiltersControl label="Report filters" filters={filters} onChange={setFilters} accounts={accounts.data} categories={categories.data} tags={tags.data} />
    <div className="flex flex-wrap items-end justify-between gap-3"><label className="grid gap-1 text-xs font-medium text-muted-foreground">Comparison metric<select className={control} value={metric} onChange={(event) => setMetric(event.target.value as ComparisonMetric)}><option value="cash_flow">Cash flow</option><option value="expenses">Expenses</option><option value="income">Income</option></select></label><button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!validRange} onClick={() => { setExportError(""); void exportTransactions(filters).catch((error: Error) => setExportError(error.message)); }}>Export filtered CSV</button></div>{exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
    {!validRange ? <Card title="Invalid date range" context={period}><p className="py-8 text-sm text-destructive" role="alert">The start date must be on or before the end date. Adjust either date to continue.</p></Card> : <>
      {cashTable.isPending || cashTable.isError ? <SectionState title="Cash-flow statistics" period={period} query={cashTable} /> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Income", cashTable.data.income.total_minor, cashTable.data.previous_income_minor], ["Expenses", cashTable.data.expense.total_minor, cashTable.data.previous_expense_minor], ["Net cash flow", cashTable.data.net_minor, cashTable.data.previous_net_minor], ["Previous-period change", cashTable.data.net_change_minor, 0]].map(([label, current, previous]) => <ComparisonBar key={String(label)} label={String(label)} current={Number(current)} previous={Number(previous)} money={money} />)}</div>
        <Card title="Cash-flow statistics" context={`${cashTable.data.period_days} inclusive days · ${period}`}><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="py-2">Measure</th><th>Count</th><th>Total</th><th>Daily average</th><th>Average transaction</th></tr></thead><tbody>{[["Income", cashTable.data.income], ["Expenses", cashTable.data.expense]].map(([label, row]) => { const value = row as typeof cashTable.data.income; return <tr key={String(label)} className="border-b"><th className="py-3 font-medium">{String(label)}</th><td>{value.count}</td><td>{money(value.total_minor)}</td><td>{money(value.daily_average_minor)}</td><td>{money(value.average_transaction_minor)}</td></tr>; })}</tbody><tfoot><tr><th className="pt-3">Net cash flow</th><td colSpan={2} className="pt-3 font-semibold">{money(cashTable.data.net_minor)}</td><td className="pt-3 text-muted-foreground">Change vs previous</td><td className="pt-3 font-semibold">{money(cashTable.data.net_change_minor)}</td></tr></tfoot></table></div></Card>
      </>}
      <div className="grid gap-5 xl:grid-cols-2">
        {cashFlow.isPending || cashFlow.isError ? <SectionState title="Cash flow" period={period} query={cashFlow} /> : <CashFlowCard data={cashFlow.data} context={`${period} · income and expenses`} formatMinor={money} shortDate={shortDate} />}
        {comparison.isPending || comparison.isError ? <SectionState title="Period comparison" period={period} query={comparison} /> : <PeriodComparisonCard data={comparison.data} context={`${metric.replace("_", " ")} vs previous period and prior year`} emptyLabel={`No comparable ${metric.replace("_", " ")} yet.`} formatMinor={money} shortDate={shortDate} />}
        {categorySpending.isPending || categorySpending.isError ? <SectionState title="Category spending" period={period} query={categorySpending} /> : <CategorySpendingCard data={categorySpending.data} context={`${period} · highest expense categories`} formatMinor={money} />}
        {structure.isPending || structure.isError ? <SectionState title="Expense structure" period={period} query={structure} /> : <ExpenseStructureCard data={structure.data} formatMinor={money} />}
        {budgets.isPending || budgets.isError ? <SectionState title="Budget performance" period={period} query={budgets} /> : <Card title="Budget performance" context={`Month containing ${shortDate(filters.end_date)}`}><BudgetProgressList data={budgets.data} money={money} /></Card>}
      </div>
      <CreditDebtSection overall={credit.data} accounts={creditAccounts.data} debts={recurringDebts.data} dti={debtToIncome.data} pending={credit.isPending || creditAccounts.isPending || recurringDebts.isPending || debtToIncome.isPending} errors={debtErrors} formatMinor={money} />
    </>}
  </div>;
}
