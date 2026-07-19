import { useId } from "react";

import type { ComparisonMetric } from "../../api/dashboard";

type MetricSelectorProps = {
  value: ComparisonMetric;
  onChange: (value: ComparisonMetric) => void;
  label?: string;
};

const options = [
  ["expenses", "Expenses"],
  ["income", "Income"],
  ["cash_flow", "Cash flow"],
] as const;

export function MetricSelector({
  value,
  onChange,
  label = "Comparison metric",
}: MetricSelectorProps) {
  const groupId = `metric-${useId().replaceAll(":", "")}`;

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex max-w-full rounded-lg border bg-muted/45 p-1 shadow-xs focus-within:ring-2 focus-within:ring-ring">
        {options.map(([option, optionLabel]) => {
          const inputId = `${groupId}-${option}`;
          return (
            <span key={option} className="relative min-w-0">
              <input
                id={inputId}
                className="peer sr-only"
                type="radio"
                name={groupId}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              <label
                htmlFor={inputId}
                className="flex min-h-11 cursor-pointer touch-manipulation items-center justify-center rounded-md px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-xs peer-focus-visible:ring-2 peer-focus-visible:ring-ring sm:px-3"
              >
                {optionLabel}
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
