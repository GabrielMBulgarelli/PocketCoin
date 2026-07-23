import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExpenseStructureCard, PeriodComparisonCard } from "./DashboardCards";

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

  it("shows category values and percentages as text", () => {
    render(<ExpenseStructureCard
      data={[{ name: "Food", amount_minor: 75 }, { name: "Other", amount_minor: 25 }]}
      formatMinor={money}
    />);

    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("$75 · 75%")).toBeInTheDocument();
    expect(screen.getByText("$25 · 25%")).toBeInTheDocument();
  });
});
