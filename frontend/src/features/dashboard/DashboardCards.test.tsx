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
        <actual.BarChart {...props} />
      </div>
    ),
    Legend: () => (
      <div>
        <span>Current</span>
        <span>Previous period</span>
        <span>Prior year</span>
      </div>
    ),
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

  it("shows category values and percentages as text", () => {
    render(<ExpenseStructureCard
      data={[{ name: "Food", amount_minor: 75 }, { name: "Other", amount_minor: 25 }]}
      formatMinor={money}
      reportHref="#/reports?from=2026-07-01&to=2026-07-31"
    />);

    expect(screen.getByText("Total Expenses")).toBeInTheDocument();
    expect(screen.getByText("$100")).toBeInTheDocument();

    const values = screen.getByRole("list", { name: "Expense breakdown values" });
    const food = within(values).getByRole("listitem", { name: "Food, 75%, $75" });
    expect(within(food).getByText("Food")).toBeInTheDocument();
    expect(within(food).getByText("75%")).toBeInTheDocument();
    expect(within(food).getByText("$75")).toBeInTheDocument();

    const other = within(values).getByRole("listitem", { name: "Other, 25%, $25" });
    expect(within(other).getByText("Other")).toBeInTheDocument();
    expect(within(other).getByText("25%")).toBeInTheDocument();
    expect(within(other).getByText("$25")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "View full report" })).toHaveAttribute(
      "href",
      "#/reports?from=2026-07-01&to=2026-07-31",
    );
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
