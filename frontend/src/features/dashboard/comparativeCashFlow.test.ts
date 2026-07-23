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

  it("calculates totals and rounds the balanced, padded extent to 10,000 whole units", () => {
    const rows = comparativeCashFlowRows([
      { date: "2026-07-01", income_minor: 570_000, expense_minor: 420_000 },
      { date: "2026-07-02", income_minor: 0, expense_minor: 90_000 },
    ]);

    expect(comparativeCashFlowTotals(rows)).toEqual({
      income_minor: 570_000,
      expense_minor: 510_000,
      net_minor: 60_000,
    });
    expect(symmetricCashFlowExtent(rows)).toBe(1_000_000);
    expect(symmetricCashFlowExtent([])).toBe(1);
  });

  it("derives the padded extent from an expense-dominant dataset", () => {
    const rows = comparativeCashFlowRows([
      { date: "2026-07-01", income_minor: 400_000, expense_minor: 800_000 },
      { date: "2026-07-02", income_minor: 500_000, expense_minor: 700_000 },
    ]);

    expect(symmetricCashFlowExtent(rows)).toBe(1_000_000);
  });

  it("keeps every half-extent tick on a 5,000 whole-unit increment", () => {
    const rows = comparativeCashFlowRows([
      { date: "2026-07-23", income_minor: 11_200_000, expense_minor: 4_200_000 },
    ]);
    const extent = symmetricCashFlowExtent(rows);

    expect(extent).toBe(12_000_000);
    expect([extent / 2, extent].every((value) => value / 100 % 5_000 === 0)).toBe(true);
  });
});
