import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { BalanceForecast } from "../../api/dashboard";
import { DashboardCard } from "./DashboardCard";

type Props = { forecast: BalanceForecast; formatMinor: (value: number) => string; shortDate: (value: string) => string };

export function BalanceForecastCard({ forecast, formatMinor, shortDate }: Props) {
  const rows = [
    { label: "Start", value: forecast.starting_balance_minor },
    { label: "Planned income", value: forecast.planned_income_minor },
    { label: "Planned expense", value: -forecast.planned_expense_minor },
    { label: "Unplanned", value: -forecast.expected_unplanned_spending_minor },
    { label: "Estimate", value: forecast.ending_balance_minor },
  ];
  const historyMessage = forecast.historical_transaction_count === 0
    ? "No transaction history was found. This estimate uses the current balance and planned payments only."
    : forecast.historical_expense_minor === 0
      ? "History exists, but no eligible unplanned spending was found, so none was projected."
      : `Average unplanned spending is ${formatMinor(forecast.average_daily_expense_minor)} per day.`;

  return <DashboardCard className="xl:col-span-2" title="Balance forecast" description={`Estimate · ${shortDate(forecast.forecast_start)} to ${shortDate(forecast.forecast_end)}`} actions={<div className="rounded-lg bg-muted px-3 py-2 text-right"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ending estimate</p><p className="text-xl font-semibold tabular-nums">{formatMinor(forecast.ending_balance_minor)}</p></div>}>
    <div className="h-72" aria-label="Estimated balance components"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ left: 8, right: 12 }}><CartesianGrid horizontal={false} strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(value) => formatMinor(Number(value))} /><YAxis dataKey="label" type="category" width={104} tick={{ fontSize: 12 }} /><Tooltip formatter={(value) => formatMinor(Number(value))} /><ReferenceLine x={0} stroke="var(--border)" /><Bar dataKey="value" name="Balance effect" radius={[4, 4, 4, 4]}>{rows.map((row) => <Cell key={row.label} fill={row.value < 0 ? "#f97316" : row.label === "Estimate" ? "var(--primary)" : "#22c55e"} />)}</Bar></BarChart></ResponsiveContainer></div>
    <p className="mt-3 text-sm text-muted-foreground">{historyMessage}</p>
    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{forecast.assumptions.map((assumption) => <li key={assumption}>• {assumption}</li>)}</ul>
  </DashboardCard>;
}
