import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardCard } from "./DashboardCard";

describe("DashboardCard", () => {
  it("associates its title with the card region", () => {
    render(<DashboardCard title="Cash flow">Content</DashboardCard>);

    expect(screen.getByRole("region", { name: "Cash flow" })).toBeInTheDocument();
  });

  it("renders description, period, and actions when supplied", () => {
    render(
      <DashboardCard
        title="Period comparison"
        description="Compare financial periods"
        period={<span>Last 30 days</span>}
        actions={<button type="button">Change metric</button>}
      >
        Chart
      </DashboardCard>,
    );

    expect(screen.getByText("Compare financial periods")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change metric" })).toBeInTheDocument();
  });
});
