import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CreditAccountUtilization, CreditUtilization, DebtToIncome, RecurringDebts } from "../../api/dashboard";

type Props = {
  overall?: CreditUtilization;
  accounts?: CreditAccountUtilization[];
  debts?: RecurringDebts;
  dti?: DebtToIncome;
  pending?: boolean;
  errors?: string[];
  formatMinor: (value: number) => string;
};

function Card({ title, context, children }: { title: string; context: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border bg-card p-5 shadow-sm"><div className="mb-4"><h3 className="font-semibold tracking-tight">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{context}</p></div>{children}</section>;
}

function Donut({ value, remainder, label }: { value: number; remainder: number; label: string }) {
  const data = [{ name: label, value }, { name: "Remaining", value: Math.max(remainder, 0) }];
  return <div className="h-44" aria-label={label}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" innerRadius={48} outerRadius={70}>{data.map((item, index) => <Cell key={item.name} fill={index ? "var(--muted)" : "var(--primary)"} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>;
}

export function CreditDebtSection({ overall, accounts, debts, dti, pending = false, errors = [], formatMinor }: Props) {
  const accountRows = accounts ?? [];
  const debtRows = debts?.items ?? [];
  if (pending && !overall && !accounts && !debts && !dti) return <Card title="Credit & debt" context="Liability overview"><p className="text-sm text-muted-foreground">Loading credit and debt analysis…</p></Card>;
  if (!overall && !accounts && !debts && !dti) return <Card title="Credit & debt" context="Liability overview"><p role="alert" className="text-sm text-muted-foreground">{errors[0] ?? "Credit and debt analysis is unavailable."}</p></Card>;
  if (!overall?.has_liability_accounts && debtRows.length === 0) return <Card title="Credit & debt" context="Liability overview"><p className="text-sm text-muted-foreground">Add a liability account or recurring debt payment to see credit and debt analysis.</p></Card>;

  return <section className="min-w-0 space-y-3" aria-labelledby="credit-debt-title">
    <div><h2 id="credit-debt-title" className="text-lg font-semibold tracking-tight">Credit & debt</h2><p className="text-sm text-muted-foreground">Revolving credit and recurring payment health</p></div>
    {errors.length > 0 && <p role="status" className="text-sm text-muted-foreground">Some debt metrics are unavailable. Available results remain visible.</p>}
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      {overall?.has_credit_accounts && <Card title="Overall credit utilization" context="Credit cards and overdrafts as of the selected end date">{overall.utilization_percentage === null ? <div className="py-12 text-center"><p className="font-medium">Credit limit unavailable</p><p className="mt-2 text-sm text-muted-foreground">Add a positive limit to calculate utilization.</p></div> : <><p className="text-center text-3xl font-semibold tabular-nums">{overall.utilization_percentage}%</p><Donut value={overall.outstanding_debt_minor} remainder={overall.total_credit_limit_minor - overall.outstanding_debt_minor} label="Outstanding debt" /><div className="grid grid-cols-2 gap-3 text-sm"><p><span className="block text-xs text-muted-foreground">Debt</span>{formatMinor(overall.outstanding_debt_minor)}</p><p><span className="block text-xs text-muted-foreground">Total limit</span>{formatMinor(overall.total_credit_limit_minor)}</p></div></>}</Card>}
      {accountRows.length > 0 && <Card title="Utilization by account" context="Current, daily average, and maximum for the selected period">{accountRows.every((item) => item.current_percentage === null) ? <p className="py-12 text-center text-sm text-muted-foreground">Credit limits are unavailable for these accounts.</p> : <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={accountRows} layout="vertical"><CartesianGrid horizontal={false} strokeDasharray="3 3" /><XAxis type="number" unit="%" /><YAxis dataKey="account_name" type="category" width={82} tick={{ fontSize: 12 }} /><Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} /><Legend /><Bar dataKey="current_percentage" name="Current" fill="var(--primary)" /><Bar dataKey="average_percentage" name="Average" fill="#38bdf8" /><Bar dataKey="maximum_percentage" name="Maximum" fill="#f97316" /></BarChart></ResponsiveContainer></div>}<div className="mt-3 space-y-1 text-xs text-muted-foreground">{accountRows.map((item) => <p key={item.account_id}>{item.account_name}: {item.current_percentage === null ? "limit unavailable" : `${item.current_percentage}% current · ${item.average_percentage}% average · ${item.maximum_percentage}% maximum`}</p>)}</div></Card>}
      {debts && debtRows.length > 0 && <Card title="Recurring debt payments" context="Scheduled amounts normalized to a monthly estimate"><p className="mb-3 text-2xl font-semibold tabular-nums">{formatMinor(debts.monthly_total_minor)} <span className="text-sm font-normal text-muted-foreground">per month</span></p><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={debtRows} layout="vertical"><XAxis type="number" tickFormatter={(value) => formatMinor(Number(value))} /><YAxis dataKey="title" type="category" width={82} /><Tooltip formatter={(value) => formatMinor(Number(value))} /><Bar dataKey="monthly_amount_minor" name="Monthly amount" fill="var(--primary)" /></BarChart></ResponsiveContainer></div></Card>}
      {dti && debtRows.length > 0 && <Card title="Debt-to-income" context="Recurring monthly debt against gross income in the end-date month">{dti.ratio_percentage === null ? <div className="py-10 text-center"><p className="font-medium">DTI unavailable</p><p className="mt-2 text-sm text-muted-foreground">No gross income matched this month. Recurring debt is {formatMinor(dti.monthly_debt_minor)}.</p></div> : <><p className="text-center text-3xl font-semibold tabular-nums">{dti.ratio_percentage}%</p><Donut value={dti.monthly_debt_minor} remainder={dti.gross_income_minor - dti.monthly_debt_minor} label="Monthly debt payments" /><div className="grid grid-cols-2 gap-3 text-sm"><p><span className="block text-xs text-muted-foreground">Monthly debt</span>{formatMinor(dti.monthly_debt_minor)}</p><p><span className="block text-xs text-muted-foreground">Gross income</span>{formatMinor(dti.gross_income_minor)}</p></div></>}</Card>}
      {!overall?.has_credit_accounts && debtRows.length === 0 && <Card title="Limited analysis" context="Liability account detected"><p className="text-sm text-muted-foreground">This liability has no revolving credit utilization or recurring debt schedule to analyze.</p></Card>}
    </div>
  </section>;
}
