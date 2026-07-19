import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CreditAccountUtilization, CreditUtilization, DebtToIncome, RecurringDebts } from "../../api/dashboard";
import { chartColors } from "./chartColors";
import { DashboardCard } from "./DashboardCard";

type Props = {
  overall?: CreditUtilization;
  accounts?: CreditAccountUtilization[];
  debts?: RecurringDebts;
  dti?: DebtToIncome;
  pending?: boolean;
  errors?: string[];
  formatMinor: (value: number) => string;
};

function Donut({ value, remainder, label }: { value: number; remainder: number; label: string }) {
  const data = [{ name: label, value }, { name: "Remaining", value: Math.max(remainder, 0) }];
  return <div className="h-44" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={data} dataKey="value" innerRadius={48} outerRadius={70}>{data.map((item, index) => <Cell key={item.name} fill={index ? chartColors.neutral : chartColors.current} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>;
}

export function CreditDebtSection({ overall, accounts, debts, dti, pending = false, errors = [], formatMinor }: Props) {
  const accountRows = accounts ?? [];
  const debtRows = debts?.items ?? [];
  if (pending && !overall && !accounts && !debts && !dti) return <DashboardCard title="Credit & debt" description="Liability overview"><p className="text-sm text-muted-foreground">Loading credit and debt analysis…</p></DashboardCard>;
  if (!overall && !accounts && !debts && !dti) return <DashboardCard title="Credit & debt" description="Liability overview"><p role="alert" className="text-sm text-muted-foreground">{errors[0] ?? "Credit and debt analysis is unavailable."}</p></DashboardCard>;
  if (!overall?.has_liability_accounts && debtRows.length === 0) return <DashboardCard title="Credit & debt" description="Liability overview"><p className="text-sm text-muted-foreground">Add a liability account or recurring debt payment to see credit and debt analysis.</p></DashboardCard>;

  return <section className="min-w-0 space-y-3" aria-labelledby="credit-debt-title">
    <div><h2 id="credit-debt-title" className="text-lg font-semibold tracking-tight">Credit & debt</h2><p className="text-sm text-muted-foreground">Revolving credit and recurring payment health</p></div>
    {errors.length > 0 && <p role="status" className="text-sm text-muted-foreground">Some debt metrics are unavailable. Available results remain visible.</p>}
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      {overall?.has_credit_accounts && <DashboardCard title="Overall credit utilization" description="Credit cards and overdrafts as of the selected end date">{overall.utilization_percentage === null ? <div className="py-12 text-center"><p className="font-medium">Credit limit unavailable</p><p className="mt-2 text-sm text-muted-foreground">Add a positive limit to calculate utilization.</p></div> : <><p className="text-center text-3xl font-semibold tabular-nums">{overall.utilization_percentage}%</p><Donut value={overall.outstanding_debt_minor} remainder={overall.total_credit_limit_minor - overall.outstanding_debt_minor} label="Outstanding debt" /><div className="grid grid-cols-2 gap-3 text-sm"><p><span className="block text-xs text-muted-foreground">Debt</span>{formatMinor(overall.outstanding_debt_minor)}</p><p><span className="block text-xs text-muted-foreground">Total limit</span>{formatMinor(overall.total_credit_limit_minor)}</p></div></>}</DashboardCard>}
      {accountRows.length > 0 && <DashboardCard title="Utilization by account" description="Current, daily average, and maximum for the selected period">{accountRows.every((item) => item.current_percentage === null) ? <p className="py-12 text-center text-sm text-muted-foreground">Credit limits are unavailable for these accounts.</p> : <div className="h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={accountRows} layout="vertical"><CartesianGrid horizontal={false} strokeDasharray="3 3" /><XAxis type="number" unit="%" /><YAxis dataKey="account_name" type="category" width={82} tick={{ fontSize: 12 }} /><Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} /><Legend /><Bar isAnimationActive={false} dataKey="current_percentage" name="Current" fill={chartColors.current} /><Bar isAnimationActive={false} dataKey="average_percentage" name="Average" fill={chartColors.previous} /><Bar isAnimationActive={false} dataKey="maximum_percentage" name="Maximum" fill={chartColors.warning} /></BarChart></ResponsiveContainer></div>}<div className="mt-3 space-y-1 text-xs text-muted-foreground">{accountRows.map((item) => <p key={item.account_id}>{item.account_name}: {item.current_percentage === null ? "limit unavailable" : `${item.current_percentage}% current · ${item.average_percentage}% average · ${item.maximum_percentage}% maximum`}</p>)}</div></DashboardCard>}
      {debts && debtRows.length > 0 && <DashboardCard title="Recurring debt payments" description="Scheduled amounts normalized to a monthly estimate"><p className="mb-3 text-2xl font-semibold tabular-nums">{formatMinor(debts.monthly_total_minor)} <span className="text-sm font-normal text-muted-foreground">per month</span></p><div className="h-64" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={debtRows} layout="vertical"><XAxis type="number" tickFormatter={(value) => formatMinor(Number(value))} /><YAxis dataKey="title" type="category" width={82} /><Tooltip formatter={(value) => formatMinor(Number(value))} /><Bar isAnimationActive={false} dataKey="monthly_amount_minor" name="Monthly amount" fill={chartColors.expense} /></BarChart></ResponsiveContainer></div><ul className="mt-3 grid gap-1 text-xs text-muted-foreground" aria-label="Recurring debt values">{debtRows.map((item) => <li className="flex justify-between gap-3" key={item.payment_id}><span>{item.title}</span><span className="tabular-nums">{formatMinor(item.monthly_amount_minor)} monthly</span></li>)}</ul></DashboardCard>}
      {dti && debtRows.length > 0 && <DashboardCard title="Debt-to-income" description="Recurring monthly debt against gross income in the end-date month">{dti.ratio_percentage === null ? <div className="py-10 text-center"><p className="font-medium">DTI unavailable</p><p className="mt-2 text-sm text-muted-foreground">No gross income matched this month. Recurring debt is {formatMinor(dti.monthly_debt_minor)}.</p></div> : <><p className="text-center text-3xl font-semibold tabular-nums">{dti.ratio_percentage}%</p><Donut value={dti.monthly_debt_minor} remainder={dti.gross_income_minor - dti.monthly_debt_minor} label="Monthly debt payments" /><div className="grid grid-cols-2 gap-3 text-sm"><p><span className="block text-xs text-muted-foreground">Monthly debt</span>{formatMinor(dti.monthly_debt_minor)}</p><p><span className="block text-xs text-muted-foreground">Gross income</span>{formatMinor(dti.gross_income_minor)}</p></div></>}</DashboardCard>}
      {!overall?.has_credit_accounts && debtRows.length === 0 && <DashboardCard title="Limited analysis" description="Liability account detected"><p className="text-sm text-muted-foreground">This liability has no revolving credit utilization or recurring debt schedule to analyze.</p></DashboardCard>}
    </div>
  </section>;
}
