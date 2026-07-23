import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { CashFlowPoint } from "../../api/dashboard";
import { DashboardCard } from "./DashboardCard";
import { chartColors } from "./chartColors";
import {
  comparativeCashFlowRows,
  comparativeCashFlowTotals,
  symmetricCashFlowExtent,
} from "./comparativeCashFlow";

type Props = {
  data: CashFlowPoint[];
  formatCompactMinor: (value: number) => string;
  formatMinor: (value: number) => string;
  monthLabel?: (value: string) => string;
  period: ReactNode;
  shortDate: (value: string) => string;
};

function spansLongRange(data: CashFlowPoint[]) {
  if (data.length < 2) return false;
  const sorted = [...data].sort((left, right) => left.date.localeCompare(right.date));
  const start = Date.parse(`${sorted[0].date}T00:00:00Z`);
  const end = Date.parse(`${sorted.at(-1)!.date}T00:00:00Z`);
  return (end - start) / 86_400_000 + 1 > 45;
}

export function ComparativeCashFlowCard({
  data,
  formatCompactMinor,
  formatMinor,
  monthLabel,
  period,
  shortDate,
}: Props) {
  const rows = comparativeCashFlowRows(data);
  const totals = comparativeCashFlowTotals(rows);
  const extent = symmetricCashFlowExtent(rows);
  const isEmpty = rows.length === 0 || rows.every((item) => item.income_minor === 0 && item.expense_minor === 0);
  const labelFormatter = spansLongRange(data) ? (monthLabel ?? shortDate) : shortDate;
  const netTone = totals.net_minor < 0
    ? "text-destructive"
    : totals.net_minor > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-foreground";

  return (
    <DashboardCard
      className="h-full"
      title="Comparative Bar Chart"
      period={period}
      actions={(
        <div className="max-w-48 break-words text-right">
          <p className="text-xs font-medium text-muted-foreground">Net cash flow</p>
          <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${netTone}`}>
            {formatMinor(totals.net_minor)}
          </p>
        </div>
      )}
      contentClassName="mt-3"
    >
      <ul aria-label="Comparative chart legend" className="flex flex-wrap items-center justify-end gap-5 text-xs font-medium" role="list">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: chartColors.income }} />
          Income
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: chartColors.cashFlowExpense }} />
          Expenses
        </li>
      </ul>

      <dl aria-label="Comparative cash flow totals" className="sr-only" role="list">
        <div role="listitem"><dt>Income</dt><dd>{formatMinor(totals.income_minor)}</dd></div>
        <div role="listitem"><dt>Expenses</dt><dd>{formatMinor(totals.expense_minor)}</dd></div>
      </dl>

      <div className="mt-4 border-t pt-3">
        {isEmpty ? (
          <p className="grid h-64 place-items-center text-center text-sm text-muted-foreground">
            No income or expenses in this period.
          </p>
        ) : (
          <div className="h-64 min-w-0" aria-hidden="true">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={rows} margin={{ bottom: 0, left: 0, right: 4, top: 2 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  minTickGap={20}
                  tickFormatter={labelFormatter}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  domain={[-extent, extent]}
                  tickFormatter={(value) => formatCompactMinor(Number(value))}
                  tickLine={false}
                  ticks={[-extent, -extent / 2, 0, extent / 2, extent]}
                  width={64}
                />
                <Tooltip
                  formatter={(value, name) => [formatMinor(Math.abs(Number(value))), name]}
                  labelFormatter={(value) => labelFormatter(String(value))}
                />
                <ReferenceLine stroke={chartColors.neutral} strokeWidth={1.5} y={0} />
                <Bar
                  dataKey="income_minor"
                  fill={chartColors.income}
                  isAnimationActive={false}
                  maxBarSize={22}
                  name="Income"
                  radius={[5, 5, 0, 0]}
                  stackId="cash-flow"
                />
                <Bar
                  dataKey="expense_plot_minor"
                  fill={chartColors.cashFlowExpense}
                  isAnimationActive={false}
                  maxBarSize={22}
                  name="Expenses"
                  radius={[5, 5, 0, 0]}
                  stackId="cash-flow"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
