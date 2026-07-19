import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  calculatePeriodChangePercentage,
  PeriodComparisonIndicator,
  PeriodLabel,
} from "./DashboardIndicators";

describe("PeriodLabel", () => {
  it.each([
    ["today", "Today"],
    ["last-30-days", "Last 30 days"],
    ["next-30-days", "Next 30 days"],
  ] as const)("renders the %s preset", (kind, label) => {
    render(<PeriodLabel kind={kind} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("formats an as-of date without shifting its calendar day", () => {
    render(<PeriodLabel kind="as-of" date="2026-07-18" locale="en-US" />);

    expect(screen.getByText("As of Jul 18, 2026")).toBeInTheDocument();
  });

  it("formats an explicit date range", () => {
    render(
      <PeriodLabel
        kind="range"
        startDate="2026-07-01"
        endDate="2026-07-18"
        locale="en-US"
      />,
    );

    expect(screen.getByText("Jul 1, 2026 – Jul 18, 2026")).toBeInTheDocument();
  });
});

describe("period comparison math", () => {
  it("calculates increases and decreases against the absolute baseline", () => {
    expect(calculatePeriodChangePercentage(120, 100)).toBe(20);
    expect(calculatePeriodChangePercentage(80, 100)).toBe(-20);
    expect(calculatePeriodChangePercentage(-120, -100)).toBe(-20);
  });

  it("returns no comparison when the prior baseline is zero", () => {
    expect(calculatePeriodChangePercentage(120, 0)).toBeNull();
  });
});

describe("PeriodComparisonIndicator", () => {
  it("describes a favorable increase with text as well as color", () => {
    render(
      <PeriodComparisonIndicator
        current={120}
        previous={100}
        direction="higher-is-better"
        locale="en-US"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "+20% favorable compared with previous period",
    );
  });

  it("describes a favorable decrease when lower values are better", () => {
    render(
      <PeriodComparisonIndicator
        current={80}
        previous={100}
        direction="lower-is-better"
        locale="en-US"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "−20% favorable compared with previous period",
    );
  });

  it("renders a neutral message without a prior baseline", () => {
    render(<PeriodComparisonIndicator current={120} previous={0} />);

    expect(screen.getByRole("status")).toHaveTextContent("No prior baseline");
  });
});
