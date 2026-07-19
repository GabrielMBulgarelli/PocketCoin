import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CashFlowTable } from "../../api/dashboard";
import { CashFlowSummaryCard } from "./CashFlowSummaryCard";

const data: CashFlowTable = {
  period_days: 30,
  income: {
    count: 4,
    total_minor: 300_000,
    daily_average_minor: 10_000,
    average_transaction_minor: 75_000,
  },
  expense: {
    count: 6,
    total_minor: 240_000,
    daily_average_minor: 8_000,
    average_transaction_minor: 40_000,
  },
  net_minor: 60_000,
  previous_income_minor: 250_000,
  previous_expense_minor: 210_000,
  previous_net_minor: 40_000,
  net_change_minor: 20_000,
};

const formatMinor = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);

describe("CashFlowSummaryCard", () => {
  it("shows current and previous values on one comparable scale", () => {
    render(
      <CashFlowSummaryCard
        data={data}
        period={<span>Last 30 days</span>}
        formatMinor={formatMinor}
      />,
    );

    expect(screen.getByRole("region", { name: "Cash flow" })).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();

    const income = within(screen.getByTestId("cash-flow-income"));
    expect(income.getByText("$3,000")).toBeInTheDocument();
    expect(income.getByText("$2,500")).toBeInTheDocument();
    expect(income.getByText(/4 records/)).toHaveTextContent(
      "4 records · $750 average transaction · $100 daily average",
    );

    const expenses = within(screen.getByTestId("cash-flow-expenses"));
    expect(expenses.getByText("$2,400")).toBeInTheDocument();
    expect(expenses.getByText("$2,100")).toBeInTheDocument();

    const net = within(screen.getByTestId("cash-flow-net"));
    expect(net.getByText("$600")).toBeInTheDocument();
    expect(net.getByText("$400")).toBeInTheDocument();
    expect(screen.getByText("Net change $200")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "+50% favorable compared with previous net cash flow",
    );
  });

  it("renders a negative net as a deficit", () => {
    render(
      <CashFlowSummaryCard
        data={{ ...data, net_minor: -50_000, previous_net_minor: 20_000, net_change_minor: -70_000 }}
        formatMinor={formatMinor}
      />,
    );

    const net = within(screen.getByTestId("cash-flow-net"));
    expect(net.getByText("Net deficit")).toBeInTheDocument();
    expect(net.getByText("−$500")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "−350% unfavorable compared with previous net cash flow",
    );
  });

  it("renders an explicit empty state when every statistic is zero", () => {
    const zeroStatistic = {
      count: 0,
      total_minor: 0,
      daily_average_minor: 0,
      average_transaction_minor: 0,
    };

    render(
      <CashFlowSummaryCard
        data={{
          period_days: 30,
          income: zeroStatistic,
          expense: zeroStatistic,
          net_minor: 0,
          previous_income_minor: 0,
          previous_expense_minor: 0,
          previous_net_minor: 0,
          net_change_minor: 0,
        }}
        formatMinor={formatMinor}
      />,
    );

    expect(screen.getByText("No cash flow activity in this period.")).toBeInTheDocument();
    expect(screen.queryByTestId("cash-flow-income")).not.toBeInTheDocument();
  });
});
