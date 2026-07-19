import type { ReactNode } from "react";

import type { CashFlowStatistic, CashFlowTable } from "../../api/dashboard";
import { cn } from "../../lib/utils";
import { DashboardCard } from "./DashboardCard";
import { PeriodComparisonIndicator } from "./DashboardIndicators";

type CashFlowSummaryCardProps = {
  data: CashFlowTable;
  period?: ReactNode;
  formatMinor: (value: number) => string;
  className?: string;
};

type SummaryRowProps = {
  id: string;
  label: string;
  current: number;
  previous: number;
  scaleMax: number;
  formatMinor: (value: number) => string;
  statistic?: CashFlowStatistic;
  isDeficit?: boolean;
};

function cashValue(value: number, formatMinor: (value: number) => string) {
  return formatMinor(value).replace("-", "−");
}

function barWidth(value: number, scaleMax: number) {
  if (value === 0) return "0%";
  return `${Math.max((Math.abs(value) / scaleMax) * 100, 2)}%`;
}

function SummaryRow({
  id,
  label,
  current,
  previous,
  scaleMax,
  formatMinor,
  statistic,
  isDeficit = false,
}: SummaryRowProps) {
  return (
    <div data-testid={`cash-flow-${id}`} className="border-b pb-4 last:border-0 last:pb-0">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", isDeficit && "text-destructive")}>{label}</p>
          {statistic ? (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums text-pretty">
              {statistic.count} {statistic.count === 1 ? "record" : "records"} ·{" "}
              {cashValue(statistic.average_transaction_minor, formatMinor)} average transaction ·{" "}
              {cashValue(statistic.daily_average_minor, formatMinor)} daily average
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 text-right text-xs tabular-nums">
          <div>
            <dt className="text-muted-foreground">Current</dt>
            <dd className={cn("mt-0.5 text-sm font-bold text-foreground", isDeficit && "text-destructive")}>
              {cashValue(current, formatMinor)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Previous</dt>
            <dd className="mt-0.5 text-sm font-semibold text-muted-foreground">
              {cashValue(previous, formatMinor)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="mt-3 grid gap-1.5" aria-hidden="true">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full bg-primary", isDeficit && "bg-destructive")}
            style={{ width: barWidth(current, scaleMax) }}
          />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-muted-foreground/40"
            style={{ width: barWidth(previous, scaleMax) }}
          />
        </div>
      </div>
    </div>
  );
}

export function CashFlowSummaryCard({
  data,
  period,
  formatMinor,
  className,
}: CashFlowSummaryCardProps) {
  const values = [
    data.income.count,
    data.income.total_minor,
    data.income.daily_average_minor,
    data.income.average_transaction_minor,
    data.expense.count,
    data.expense.total_minor,
    data.expense.daily_average_minor,
    data.expense.average_transaction_minor,
    data.net_minor,
    data.previous_income_minor,
    data.previous_expense_minor,
    data.previous_net_minor,
    data.net_change_minor,
  ];
  const isEmpty = values.every((value) => value === 0);
  const scaleMax = Math.max(
    Math.abs(data.income.total_minor),
    Math.abs(data.previous_income_minor),
    Math.abs(data.expense.total_minor),
    Math.abs(data.previous_expense_minor),
    Math.abs(data.net_minor),
    Math.abs(data.previous_net_minor),
    1,
  );

  return (
    <DashboardCard
      title="Cash flow"
      description="Income, expenses, and net result against the previous period"
      period={period}
      className={className}
    >
      {isEmpty ? (
        <p className="grid min-h-48 place-items-center text-sm text-muted-foreground">
          No cash flow activity in this period.
        </p>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary" aria-hidden="true" /> Current
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden="true" /> Previous
            </span>
          </div>
          <div className="grid gap-4">
            <SummaryRow
              id="income"
              label="Income"
              current={data.income.total_minor}
              previous={data.previous_income_minor}
              scaleMax={scaleMax}
              statistic={data.income}
              formatMinor={formatMinor}
            />
            <SummaryRow
              id="expenses"
              label="Expenses"
              current={data.expense.total_minor}
              previous={data.previous_expense_minor}
              scaleMax={scaleMax}
              statistic={data.expense}
              formatMinor={formatMinor}
            />
            <SummaryRow
              id="net"
              label={data.net_minor < 0 ? "Net deficit" : "Net"}
              current={data.net_minor}
              previous={data.previous_net_minor}
              scaleMax={scaleMax}
              formatMinor={formatMinor}
              isDeficit={data.net_minor < 0}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/45 px-3 py-2.5">
            <span className="text-xs font-semibold text-foreground tabular-nums">
              Net change {cashValue(data.net_change_minor, formatMinor)}
            </span>
            <PeriodComparisonIndicator
              current={data.net_minor}
              previous={data.previous_net_minor}
              direction="higher-is-better"
              comparisonLabel="previous net cash flow"
            />
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
