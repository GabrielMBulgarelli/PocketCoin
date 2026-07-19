export const chartColors = {
  income: "var(--color-chart-income)",
  expense: "var(--color-chart-expense)",
  current: "var(--color-chart-current)",
  previous: "var(--color-chart-previous)",
  priorYear: "var(--color-chart-prior-year)",
  warning: "var(--color-chart-warning)",
  neutral: "var(--color-chart-neutral)",
} as const;

const categoryColors = [
  "var(--color-chart-category-1)",
  "var(--color-chart-category-2)",
  "var(--color-chart-category-3)",
  "var(--color-chart-category-4)",
  "var(--color-chart-category-5)",
];

export function categoryColor(name: string): string {
  if (name.trim().toLowerCase() === "other") return chartColors.neutral;
  let hash = 0;
  for (const character of name) hash = ((hash << 5) - hash + character.codePointAt(0)!) | 0;
  return categoryColors[Math.abs(hash) % categoryColors.length];
}
