import type { CashFlowPoint } from "../../api/dashboard";

export type ComparativeCashFlowRow = {
  label: string;
  income_minor: number;
  expense_minor: number;
  expense_plot_minor: number;
  net_minor: number;
};

const DAY_MS = 86_400_000;
function utcDay(value: string) {
  return Date.parse(`${value}T00:00:00Z`);
}

function row(label: string, incomeMinor: number, expenseMinor: number): ComparativeCashFlowRow {
  return {
    label,
    income_minor: incomeMinor,
    expense_minor: expenseMinor,
    expense_plot_minor: -expenseMinor,
    net_minor: incomeMinor - expenseMinor,
  };
}

export function comparativeCashFlowRows(data: CashFlowPoint[]): ComparativeCashFlowRow[] {
  const sorted = [...data].sort((left, right) => left.date.localeCompare(right.date));
  if (sorted.length === 0) return [];

  const rangeDays = (utcDay(sorted.at(-1)!.date) - utcDay(sorted[0].date)) / DAY_MS + 1;
  if (rangeDays <= 45) {
    return sorted.map((point) => row(point.date, point.income_minor, point.expense_minor));
  }

  const months = new Map<string, { income: number; expense: number }>();
  for (const point of sorted) {
    const label = `${point.date.slice(0, 7)}-01`;
    const current = months.get(label) ?? { income: 0, expense: 0 };
    current.income += point.income_minor;
    current.expense += point.expense_minor;
    months.set(label, current);
  }

  return [...months.entries()].map(([label, values]) => row(label, values.income, values.expense));
}

export function comparativeCashFlowTotals(data: ComparativeCashFlowRow[]) {
  return data.reduce(
    (totals, item) => ({
      income_minor: totals.income_minor + item.income_minor,
      expense_minor: totals.expense_minor + item.expense_minor,
      net_minor: totals.net_minor + item.net_minor,
    }),
    { income_minor: 0, expense_minor: 0, net_minor: 0 },
  );
}

export function symmetricCashFlowExtent(data: ComparativeCashFlowRow[]) {
  const maximum = Math.max(0, ...data.flatMap((item) => [item.income_minor, item.expense_minor]));
  if (maximum === 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const normalized = maximum / magnitude;
  const ceiling = [1, 2, 3, 6, 10].find((candidate) => normalized <= candidate) ?? 10;
  return ceiling * magnitude;
}
