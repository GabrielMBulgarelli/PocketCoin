import { cn } from "../../lib/utils";

export type PeriodLabelProps =
  | { kind: "today" }
  | { kind: "last-30-days" }
  | { kind: "next-30-days" }
  | { kind: "as-of"; date: string; locale?: string }
  | { kind: "range"; startDate: string; endDate: string; locale?: string };

export type ComparisonDirection = "higher-is-better" | "lower-is-better" | "neutral";

type PeriodComparisonIndicatorProps = {
  current: number;
  previous: number;
  direction?: ComparisonDirection;
  locale?: string;
  comparisonLabel?: string;
};

function dateFromApi(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: string, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dateFromApi(value));
}

export function PeriodLabel(props: PeriodLabelProps) {
  let label: string;

  switch (props.kind) {
    case "today":
      label = "Today";
      break;
    case "last-30-days":
      label = "Last 30 days";
      break;
    case "next-30-days":
      label = "Next 30 days";
      break;
    case "as-of":
      label = `As of ${formatDate(props.date, props.locale)}`;
      break;
    case "range":
      label = `${formatDate(props.startDate, props.locale)} – ${formatDate(props.endDate, props.locale)}`;
      break;
  }

  return <span className="text-xs font-medium text-muted-foreground tabular-nums">{label}</span>;
}

export function calculatePeriodChangePercentage(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function PeriodComparisonIndicator({
  current,
  previous,
  direction = "neutral",
  locale,
  comparisonLabel = "previous period",
}: PeriodComparisonIndicatorProps) {
  const change = calculatePeriodChangePercentage(current, previous);

  if (change === null) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true">→</span>
        No prior baseline
      </span>
    );
  }

  const isNeutral = change === 0 || direction === "neutral";
  const isFavorable = direction === "higher-is-better" ? change > 0 : change < 0;
  const meaning = isNeutral ? "no change" : isFavorable ? "favorable" : "unfavorable";
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";
  const percentage = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    signDisplay: "always",
    style: "percent",
  })
    .format(change / 100)
    .replace("-", "−");

  return (
    <span
      role="status"
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 text-xs font-semibold tabular-nums",
        isNeutral
          ? "text-muted-foreground"
          : isFavorable
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-destructive",
      )}
    >
      <span aria-hidden="true">{arrow}</span>{" "}
      <span>{percentage}</span>{" "}
      <span className="font-medium">{meaning} compared with {comparisonLabel}</span>
    </span>
  );
}
