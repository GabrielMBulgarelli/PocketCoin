import { describe, expect, it } from "vitest";

import {
  comparativeCashFlowRows,
  comparativeCashFlowTotals,
  symmetricCashFlowExtent,
} from "./comparativeCashFlow";

describe("comparative cash-flow data", () => {
  it("mirrors expenses below zero without changing the API values", () => {
    const input = [
      { date: "2026-07-02", income_minor: 500_000, expense_minor: 320_000 },
      { date: "2026-07-01", income_minor: 120_000, expense_minor: 80_000 },
    ];

    expect(comparativeCashFlowRows(input)).toEqual([
      {
        label: "2026-07-01",
        income_minor: 120_000,
        expense_minor: 80_000,
        expense_plot_minor: -80_000,
        net_minor: 40_000,
      },
      {
        label: "2026-07-02",
        income_minor: 500_000,
        expense_minor: 320_000,
        expense_plot_minor: -320_000,
        net_minor: 180_000,
      },
    ]);
    expect(input[0].expense_minor).toBe(320_000);
  });

  it("groups long ranges by month while retaining every value", () => {
    const rows = comparativeCashFlowRows([
      { date: "2026-01-01", income_minor: 100, expense_minor: 30 },
      { date: "2026-01-15", income_minor: 200, expense_minor: 40 },
      { date: "2026-03-01", income_minor: 400, expense_minor: 70 },
    ]);

    expect(rows).toEqual([
      {
        label: "2026-01-01",
        income_minor: 300,
        expense_minor: 70,
        expense_plot_minor: -70,
        net_minor: 230,
      },
      {
        label: "2026-03-01",
        income_minor: 400,
        expense_minor: 70,
        expense_plot_minor: -70,
        net_minor: 330,
      },
    ]);
  });

  it("calculates totals and a balanced, rounded chart extent", () => {
    const rows = comparativeCashFlowRows([
      { date: "2026-07-01", income_minor: 570_000, expense_minor: 420_000 },
      { date: "2026-07-02", income_minor: 0, expense_minor: 90_000 },
    ]);

    expect(comparativeCashFlowTotals(rows)).toEqual({
      income_minor: 570_000,
      expense_minor: 510_000,
      net_minor: 60_000,
    });
    expect(symmetricCashFlowExtent(rows)).toBe(600_000);
    expect(symmetricCashFlowExtent([])).toBe(1);
  });
});
