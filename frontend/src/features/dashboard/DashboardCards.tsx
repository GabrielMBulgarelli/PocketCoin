import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CashFlowPoint, CategoryPoint, ComparisonPoint, DashboardFilters } from "../../api/dashboard";
import { categoryColor, chartColors } from "./chartColors";
import { DashboardCard } from "./DashboardCard";

export const control = "min-h-11 min-w-0 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
type Ref = { id: number; name: string; is_active: boolean };
export type CatalogState = { data?: Ref[]; isPending: boolean; isError: boolean; retry: () => void };
type ChartProps = { formatMinor: (value: number) => string };

function CatalogSelect({ label, value, catalog, allLabel, generalLabel, onChange }: { label: string; value?: number | string; catalog: CatalogState; allLabel: string; generalLabel?: string; onChange: (value: string) => void }) {
  const items = catalog.data ?? [];
  const selectedMissing = typeof value === "number" && !items.some((item) => item.id === value);
  return <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">{label}<select className={control} disabled={catalog.isPending || catalog.isError} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
    <option value="">{catalog.isPending ? `Loading ${label.toLowerCase()}…` : catalog.isError ? `${label} unavailable` : allLabel}</option>
    {generalLabel && <option value="general">{generalLabel}</option>}
    {selectedMissing && <option value={value}>Selected {label.toLowerCase()} unavailable</option>}
    {items.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
  </select></label>;
}

export function DashboardFiltersControl({ filters, onChange, accounts, categories, tags, onReset, label = "Dashboard filters" }: { filters: DashboardFilters; onChange: (filters: DashboardFilters) => void; accounts: CatalogState; categories: CatalogState; tags: CatalogState; onReset: () => void; label?: string }) {
  const update = (key: keyof DashboardFilters, value: string) => onChange({ ...filters, [key]: value ? (key.endsWith("_id") ? Number(value) : value) : undefined } as DashboardFilters);
  const updateAccount = (value: string) => onChange({
    ...filters,
    financial_account_id: value && value !== "general" ? Number(value) : undefined,
    without_account: value === "general" ? true : undefined,
  });
  const failures = [["accounts", accounts], ["categories", categories], ["tags", tags]].filter(([, catalog]) => (catalog as CatalogState).isError);
  return <section className="min-w-0 rounded-xl border bg-card p-4 shadow-sm" aria-label={label}>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">From<input className={control} type="date" value={filters.start_date} onChange={(event) => update("start_date", event.target.value)} /></label>
      <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">To<input className={control} type="date" value={filters.end_date} onChange={(event) => update("end_date", event.target.value)} /></label>
      <CatalogSelect label="Account" value={filters.without_account ? "general" : filters.financial_account_id} catalog={accounts} allLabel="All accounts" generalLabel="General — no specific account" onChange={updateAccount} />
      <CatalogSelect label="Category" value={filters.category_id} catalog={categories} allLabel="All categories" onChange={(value) => update("category_id", value)} />
      <CatalogSelect label="Tag" value={filters.tag_id} catalog={tags} allLabel="All tags" onChange={(value) => update("tag_id", value)} />
    </div>
    <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
      {failures.length > 0 ? <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm" role="alert" aria-label="Filter data unavailable"><span>{failures.map(([name]) => name).join(", ")} unavailable. Existing results remain visible.</span><button type="button" className="min-h-11 rounded-lg border bg-background px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => failures.forEach(([, catalog]) => (catalog as CatalogState).retry())}>Retry filter data</button></div> : <span />}
      <button type="button" className="min-h-11 rounded-lg border bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onReset}>Reset filters</button>
    </div>
  </section>;
}

export function CashFlowCard({ data, context, formatMinor, shortDate }: ChartProps & { data: CashFlowPoint[]; context: string; shortDate: (value: string) => string }) {
  const income = data.reduce((sum, item) => sum + item.income_minor, 0);
  const expenses = data.reduce((sum, item) => sum + item.expense_minor, 0);
  const isEmpty = data.every((item) => !item.income_minor && !item.expense_minor);
  return <DashboardCard title="Cash flow" description={context}><p className="mb-3 text-xs text-muted-foreground">Income {formatMinor(income)} · Expenses {formatMinor(expenses)}</p>{isEmpty ? <p className="grid h-72 place-items-center text-sm text-muted-foreground">No cash flow in this period.</p> : <div className="h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={shortDate} /><YAxis tickFormatter={(value) => formatMinor(value)} width={72} /><Tooltip formatter={(value) => formatMinor(Number(value))} labelFormatter={(value) => shortDate(String(value))} /><Legend /><Bar isAnimationActive={false} dataKey="income_minor" name="Income" fill={chartColors.income} radius={[4, 4, 0, 0]} /><Bar isAnimationActive={false} dataKey="expense_minor" name="Expenses" fill={chartColors.expense} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}</DashboardCard>;
}

export function PeriodComparisonCard({ data, context, emptyLabel, formatMinor, shortDate, period, actions }: ChartProps & { data: ComparisonPoint[]; context: string; emptyLabel: string; shortDate: (value: string) => string; period?: ReactNode; actions?: ReactNode }) {
  const totals = data.reduce((result, item) => ({ current: result.current + item.current_minor, previous: result.previous + item.previous_minor, priorYear: result.priorYear + item.prior_year_minor }), { current: 0, previous: 0, priorYear: 0 });
  const isEmpty = data.every((item) => !item.current_minor && !item.previous_minor && !item.prior_year_minor);
  return <DashboardCard title="Period comparison" description={context} period={period} actions={actions}><p className="mb-3 text-xs text-muted-foreground">Current total {formatMinor(totals.current)} · previous period {formatMinor(totals.previous)} · prior year {formatMinor(totals.priorYear)}</p>{isEmpty ? <p className="grid h-72 place-items-center text-sm text-muted-foreground">{emptyLabel}</p> : <div className="h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" tickFormatter={shortDate} /><YAxis tickFormatter={(value) => formatMinor(value)} width={72} /><Tooltip formatter={(value) => formatMinor(Number(value))} /><Legend /><Line isAnimationActive={false} dataKey="current_minor" name="Current" stroke={chartColors.current} strokeWidth={2} dot={false} /><Line isAnimationActive={false} dataKey="previous_minor" name="Previous" stroke={chartColors.previous} dot={false} /><Line isAnimationActive={false} dataKey="prior_year_minor" name="Prior year" stroke={chartColors.priorYear} dot={false} /></LineChart></ResponsiveContainer></div>}</DashboardCard>;
}

export function CategorySpendingCard({ data, context, formatMinor }: ChartProps & { data: CategoryPoint[]; context: string }) {
  return <DashboardCard title="Category spending" description={context}>{data.length === 0 ? <p className="grid h-72 place-items-center text-sm text-muted-foreground">No category spending in this period.</p> : <><div className="h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 20 }}><CartesianGrid horizontal={false} strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(value) => formatMinor(value)} /><YAxis dataKey="name" type="category" width={90} /><Tooltip formatter={(value) => formatMinor(Number(value))} /><Bar isAnimationActive={false} dataKey="amount_minor" name="Expenses" fill={chartColors.expense} radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div><ul className="mt-3 grid gap-1 text-xs text-muted-foreground" aria-label="Category spending values">{data.map((item) => <li className="flex justify-between gap-3" key={item.name}><span>{item.name}</span><span className="tabular-nums">{formatMinor(item.amount_minor)}</span></li>)}</ul></>}</DashboardCard>;
}

export function ExpenseStructureCard({ data, formatMinor }: ChartProps & { data: CategoryPoint[] }) {
  const total = data.reduce((sum, item) => sum + item.amount_minor, 0);
  return <DashboardCard title="Expense structure" description="Top five categories and Other">{data.length === 0 ? <p className="grid h-64 place-items-center text-sm text-muted-foreground">No expenses to structure.</p> : <><div className="h-64" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={data} dataKey="amount_minor" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2}>{data.map((item) => <Cell key={item.name} fill={categoryColor(item.name)} />)}</Pie><Tooltip formatter={(value) => formatMinor(Number(value))} /><Legend /></PieChart></ResponsiveContainer></div><ul className="mt-3 grid gap-1 text-xs" aria-label="Expense structure values">{data.map((item) => <li className="flex items-center justify-between gap-3" key={item.name}><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(item.name) }} />{item.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{formatMinor(item.amount_minor)} · {total ? Math.round(item.amount_minor / total * 100) : 0}%</span></li>)}</ul></>}</DashboardCard>;
}
