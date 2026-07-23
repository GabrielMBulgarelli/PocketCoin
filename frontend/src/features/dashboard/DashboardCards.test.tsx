import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExpenseStructureCard, PeriodComparisonCard } from "./DashboardCards";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();

  return {
    ...actual,
    BarChart: (props: React.ComponentProps<typeof actual.BarChart>) => (
      <div
        data-bar-category-gap={props.barCategoryGap}
        data-bar-gap={props.barGap}
        data-max-bar-size={props.maxBarSize}
        data-testid="bar-chart"
      >
        {props.children}
      </div>
    ),
    Bar: () => null,
    CartesianGrid: () => null,
    Cell: () => null,
    Legend: () => (
      <div>
        <span>Current</span>
        <span>Previous period</span>
        <span>Prior year</span>
      </div>
    ),
    Pie: (props: React.ComponentProps<typeof actual.Pie>) => (
      <div
        data-inner-radius={props.innerRadius}
        data-name-key={String(props.nameKey)}
        data-outer-radius={props.outerRadius}
        data-tooltip-name={
          (props.data?.[0] as { tooltip_name?: string } | undefined)?.tooltip_name
        }
        data-testid="expense-breakdown-pie"
      >
        {props.children}
      </div>
    ),
    PieChart: (props: React.ComponentProps<typeof actual.PieChart>) => <>{props.children}</>,
    ResponsiveContainer: (
      props: React.ComponentProps<typeof actual.ResponsiveContainer>,
    ) => <>{props.children}</>,
    Tooltip: ({ formatter }: { formatter?: (value: number) => string }) => (
      <div data-testid="tooltip-formatted-value">{formatter?.(75)}</div>
    ),
    XAxis: () => null,
    YAxis: () => null,
  };
});

const money = (value: number) => `$${value}`;

describe("dashboard chart alternatives", () => {
  it("summarizes period-comparison series outside the decorative chart", () => {
    render(<PeriodComparisonCard
      data={[{ label: "2026-07-01", current_minor: 100, previous_minor: 80, prior_year_minor: 70 }]}
      context="comparison"
      emptyLabel="empty"
      formatMinor={money}
      shortDate={(value) => value}
    />);

    const summary = screen.getByRole("list", { name: "Period comparison totals" });
    expect(within(summary).getByText("Current")).toBeInTheDocument();
    expect(within(summary).getByText("$100")).toBeInTheDocument();
    expect(within(summary).getByText("Previous period")).toBeInTheDocument();
    expect(within(summary).getByText("$80")).toBeInTheDocument();
    expect(within(summary).getByText("Prior year")).toBeInTheDocument();
    expect(within(summary).getByText("$70")).toBeInTheDocument();
  });

  it("shows the existing empty message when comparison data is empty", () => {
    render(<PeriodComparisonCard
      data={[]}
      context="comparison"
      emptyLabel="No comparable period yet."
      formatMinor={money}
      shortDate={(value) => value}
    />);

    expect(screen.getByText("No comparable period yet.")).toBeInTheDocument();
  });

  it("keeps grouped bars visible when comparison data has many buckets", () => {
    const data = Array.from({ length: 22 }, (_, index) => ({
      label: `2026-07-${String(index + 1).padStart(2, "0")}`,
      current_minor: index === 18 ? 2_000 : 0,
      previous_minor: 0,
      prior_year_minor: 0,
    }));

    render(<PeriodComparisonCard
      data={data}
      context="comparison"
      emptyLabel="empty"
      formatMinor={money}
      shortDate={(value) => value}
    />);

    const chart = screen.getByTestId("bar-chart");
    expect(chart).toHaveAttribute("data-bar-category-gap", "0");
    expect(chart).toHaveAttribute("data-bar-gap", "0");
    expect(chart).toHaveAttribute("data-max-bar-size", "24");

    const summary = screen.getByRole("list", { name: "Period comparison totals" });
    expect(summary).toHaveClass("justify-center");
    expect(screen.getAllByText("Current")).toHaveLength(1);
    expect(screen.getAllByText("Previous period")).toHaveLength(1);
    expect(screen.getAllByText("Prior year")).toHaveLength(1);
  });

  it("shows category values while keeping percentages in accessible and tooltip text", () => {
    render(
      <ExpenseStructureCard
        className="h-full"
        data={[{ name: "Food", amount_minor: 75 }, { name: "Other", amount_minor: 25 }]}
        formatMinor={money}
      />,
    );

    expect(screen.getByText("Total Expenses")).toBeInTheDocument();
    expect(screen.getByText("$100")).toBeInTheDocument();

    const values = screen.getByRole("list", { name: "Expense breakdown values" });
    const food = within(values).getByRole("listitem", { name: "Food, 75%, $75" });
    expect(within(food).getByText("Food")).toBeInTheDocument();
    expect(within(food).queryByText("75%")).not.toBeInTheDocument();
    expect(within(food).getByText("$75")).toBeInTheDocument();
    expect(food).toHaveClass(
      "grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)]",
    );

    const other = within(values).getByRole("listitem", { name: "Other, 25%, $25" });
    expect(within(other).getByText("Other")).toBeInTheDocument();
    expect(within(other).queryByText("25%")).not.toBeInTheDocument();
    expect(within(other).getByText("$25")).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "View full report" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Expense Breakdown" })).toHaveClass("h-full");
    const donutContainer = screen.getByTestId("expense-breakdown-donut").parentElement;
    expect(donutContainer).toHaveClass("size-64");
    expect(donutContainer?.parentElement).toHaveClass(
      "md:grid-cols-[16rem_minmax(0,1fr)]",
    );
    expect(screen.getByTestId("expense-breakdown-pie")).toHaveAttribute(
      "data-inner-radius",
      "80",
    );
    expect(screen.getByTestId("expense-breakdown-pie")).toHaveAttribute(
      "data-outer-radius",
      "120",
    );
    expect(screen.getByTestId("expense-breakdown-pie")).toHaveAttribute(
      "data-name-key",
      "tooltip_name",
    );
    expect(screen.getByTestId("expense-breakdown-pie")).toHaveAttribute(
      "data-tooltip-name",
      "Food · 75%",
    );
    expect(screen.getByTestId("tooltip-formatted-value")).toHaveTextContent("$75");
  });

  it("wraps long category names downward without overlapping value columns", () => {
    const categoryName = "Uncategorized household purchases";

    render(
      <ExpenseStructureCard
        data={[
          { name: categoryName, amount_minor: 2_000 },
          { name: "Utilities", amount_minor: 500 },
        ]}
        formatMinor={money}
      />,
    );

    const row = screen.getByRole("listitem", {
      name: `${categoryName}, 80%, $2000`,
    });
    const label = within(row).getByText(categoryName);
    const utilitiesRow = screen.getByRole("listitem", {
      name: "Utilities, 20%, $500",
    });

    expect(row).toHaveClass("items-start");
    expect(row).toHaveClass(
      "grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)]",
    );
    expect(utilitiesRow).toHaveClass("items-start");
    expect(label).toHaveClass("whitespace-normal");
    expect(label).toHaveClass("break-words");
    expect(label).not.toHaveClass("truncate");
  });

  it("keeps the existing empty state", () => {
    render(<ExpenseStructureCard data={[]} formatMinor={money} />);

    expect(screen.getByText("No expenses to structure.")).toBeInTheDocument();
    expect(screen.queryByTestId("expense-breakdown-donut")).not.toBeInTheDocument();
  });

  it("does not render a donut or invalid percentages when the total is zero", () => {
    render(<ExpenseStructureCard
      data={[{ name: "Food", amount_minor: 0 }, { name: "Other", amount_minor: 0 }]}
      formatMinor={money}
    />);

    expect(screen.getByText("No expenses to structure.")).toBeInTheDocument();
    expect(screen.queryByTestId("expense-breakdown-donut")).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });
});
