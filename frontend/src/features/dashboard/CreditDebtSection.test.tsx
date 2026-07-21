import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CreditDebtSection } from "./CreditDebtSection";

describe("CreditDebtSection", () => {
  it("shows debt-to-income when only standalone debt expenses exist", () => {
    render(<CreditDebtSection
      overall={{ has_liability_accounts: false, has_credit_accounts: false, outstanding_debt_minor: 0, total_credit_limit_minor: 0, utilization_percentage: null }}
      accounts={[]}
      debts={{ monthly_total_minor: 0, items: [] }}
      dti={{ recurring_debt_minor: 0, additional_debt_minor: 5000, monthly_debt_minor: 5000, gross_income_minor: 100000, ratio_percentage: 5 }}
      formatMinor={(value) => `$${(value / 100).toFixed(2)}`}
    />);

    expect(screen.getByText("Debt-to-income")).toBeInTheDocument();
    expect(screen.getByText("Additional debt")).toBeInTheDocument();
    expect(screen.getAllByText("$50.00")).toHaveLength(2);
  });
});
