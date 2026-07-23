import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ComparativeCashFlowCard } from "./ComparativeCashFlowCard";

vi.mock("recharts", () => ({
  Bar: ({ dataKey, radius }: { dataKey: string; radius: number[] }) => (
    <div data-radius={radius.join(",")} data-testid={`bar-${dataKey}`} />
  ),
  BarChart: ({ children }: { children: ReactNode }) => <>{children}</>,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: ({ domain, ticks }: { domain: number[]; ticks: number[] }) => (
    <div
      data-domain={domain.join(",")}
      data-testid="comparative-y-axis"
      data-ticks={ticks.join(",")}
    />
  ),
}));

const data = [
  { date: "2026-01-01", income_minor: 500_000, expense_minor: 320_000 },
  { date: "2026-03-01", income_minor: 100_000, expense_minor: 260_000 },
];

describe("ComparativeCashFlowCard", () => {
  it("shows net cash flow, an accessible total breakdown, and the two-series key", () => {
    render(
      <ComparativeCashFlowCard
        data={data}
        formatCompactMinor={(value) => `$${value / 100}`}
        formatMinor={(value) => `$${(value / 100).toFixed(2)}`}
        period="Jan 1 – Mar 1, 2026"
        shortDate={(value) => value}
      />,
    );

    expect(screen.getByRole("region", { name: "Comparative Bar Chart" })).toBeInTheDocument();
    expect(screen.getByText("Net cash flow")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toHaveClass("text-emerald-600");

    const totals = screen.getByRole("list", { name: "Comparative cash flow totals" });
    expect(within(totals).getByText("Income")).toBeInTheDocument();
    expect(within(totals).getByText("$6000.00")).toBeInTheDocument();
    expect(within(totals).getByText("Expenses")).toBeInTheDocument();
    expect(within(totals).getByText("$5800.00")).toBeInTheDocument();

    const key = screen.getByRole("list", { name: "Comparative chart legend" });
    expect(within(key).getByText("Income")).toBeInTheDocument();
    expect(within(key).getByText("Expenses")).toBeInTheDocument();
  });

  it("shows the selected date range instead of a separate period control", () => {
    render(
      <ComparativeCashFlowCard
        data={data}
        formatCompactMinor={String}
        formatMinor={String}
        period={<span>Jan 1 – Mar 1, 2026</span>}
        shortDate={(value) => value}
      />,
    );

    expect(screen.getByText("Jan 1 – Mar 1, 2026")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Comparison period" })).not.toBeInTheDocument();
  });

  it("places only the wrapping-safe net summary in the right header action", () => {
    render(
      <ComparativeCashFlowCard
        data={data}
        formatCompactMinor={String}
        formatMinor={() => "A very long formatted currency value"}
        period="Jan 1 – Mar 1, 2026"
        shortDate={(value) => value}
      />,
    );

    const netLabel = screen.getByText("Net cash flow");
    const netSummary = netLabel.parentElement;
    const headerAction = netLabel.closest(".float-right");
    const legend = screen.getByRole("list", { name: "Comparative chart legend" });

    expect(headerAction).not.toBeNull();
    expect(headerAction).toContainElement(netSummary);
    expect(headerAction).not.toContainElement(legend);
    expect(netSummary).toHaveClass("max-w-48", "break-words", "text-right");
  });

  it("does not force its own desktop grid span", () => {
    render(
      <ComparativeCashFlowCard
        data={data}
        formatCompactMinor={String}
        formatMinor={String}
        period="Jan 1 – Mar 1, 2026"
        shortDate={(value) => value}
      />,
    );

    const region = screen.getByRole("region", { name: "Comparative Bar Chart" });
    expect(region).not.toHaveClass("xl:col-span-2");
    expect(region).toHaveClass("h-full");

    const yAxis = screen.getByTestId("comparative-y-axis");
    expect(yAxis).toHaveAttribute("data-domain", "-1000000,1000000");
    expect(yAxis).toHaveAttribute(
      "data-ticks",
      "-1000000,-500000,0,500000,1000000",
    );
    expect(yAxis.closest(".h-72")).toBeNull();
    expect(yAxis.closest(".h-64")).not.toBeNull();
  });

  it("rounds the outward end of the downward expense bars", () => {
    render(
      <ComparativeCashFlowCard
        data={data}
        formatCompactMinor={String}
        formatMinor={String}
        period="Jan 1 – Mar 1, 2026"
        shortDate={(value) => value}
      />,
    );

    expect(screen.getByTestId("bar-expense_plot_minor")).toHaveAttribute("data-radius", "5,5,0,0");
  });

  it("keeps a clear empty state and accessible zero totals", () => {
    render(
      <ComparativeCashFlowCard
        data={[]}
        formatCompactMinor={String}
        formatMinor={(value) => `$${value}`}
        period="Jan 1 – Mar 1, 2026"
        shortDate={(value) => value}
      />,
    );

    expect(screen.getByText("No income or expenses in this period.")).toBeInTheDocument();
    expect(screen.getAllByText("$0")).toHaveLength(3);
  });
});
