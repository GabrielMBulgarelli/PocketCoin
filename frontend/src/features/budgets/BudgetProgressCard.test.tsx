import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BudgetProgressList } from "./BudgetProgressCard";

describe("BudgetProgressList", () => {
  it("leaves the remaining portion of a budget bar unfilled", () => {
    render(
      <BudgetProgressList
        data={[{
          id: 1,
          category_id: 10,
          category_name: "Food",
          month: "2026-07-01",
          limit_minor: 100_000,
          spent_minor: 20_000,
          remaining_minor: 80_000,
          percentage_used: 0.2,
          over_budget: false,
        }]}
        money={(value) => `$${value / 100}`}
      />,
    );

    const progress = screen.getByLabelText("20 percent used");
    expect(progress.firstElementChild).toHaveStyle({ width: "20%" });
  });
});
