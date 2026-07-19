import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ComparisonMetric } from "../../api/dashboard";
import { MetricSelector } from "./MetricSelector";

function Harness({ initialValue = "expenses" }: { initialValue?: ComparisonMetric }) {
  const [value, setValue] = useState<ComparisonMetric>(initialValue);
  return <MetricSelector value={value} onChange={setValue} />;
}

describe("MetricSelector", () => {
  it("exposes every comparison metric as a labeled radio", () => {
    render(<Harness />);

    expect(screen.getByRole("group", { name: "Comparison metric" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Expenses" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Income" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Cash flow" })).not.toBeChecked();
  });

  it("updates the controlled value through the native radio", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("radio", { name: "Income" }));

    expect(screen.getByRole("radio", { name: "Income" })).toBeChecked();
  });

  it("supports the Reports default independently", () => {
    render(<Harness initialValue="cash_flow" />);

    expect(screen.getByRole("radio", { name: "Cash flow" })).toBeChecked();
  });
});
