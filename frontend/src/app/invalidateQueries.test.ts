import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { invalidateFinancialQueries, mutationInvalidations } from "./invalidateQueries";
import { queryKeys } from "./queryKeys";

describe("financial query invalidation", () => {
  it("defines the complete mutation matrix", () => {
    expect(mutationInvalidations.accounts).toEqual(["financialAccounts", "transactions", "dashboard", "reports"]);
    expect(mutationInvalidations.categories).toEqual(["categories", "transactions", "dashboard", "reports"]);
    expect(mutationInvalidations.tags).toEqual(["tags", "transactions", "dashboard", "reports"]);
    expect(mutationInvalidations.transactions).toEqual(["transactions", "financialAccounts", "budgets", "plannedPayments", "dashboard", "reports"]);
    expect(mutationInvalidations.plannedPayments).toEqual(["plannedPayments", "dashboard", "reports"]);
    expect(mutationInvalidations.markPaid).toEqual(["plannedPayments", "dashboard", "reports", "transactions", "financialAccounts", "budgets"]);
    expect(mutationInvalidations.imports).toEqual(["imports", "transactions", "financialAccounts", "budgets", "dashboard", "reports"]);
    expect(mutationInvalidations.budgets).toEqual(["budgets", "dashboard"]);
  });

  it("invalidates only the requested roots", async () => {
    const client = new QueryClient();
    for (const key of Object.values(queryKeys)) client.setQueryData(key, "cached");
    await invalidateFinancialQueries(client, mutationInvalidations.accounts);
    expect(client.getQueryState(queryKeys.financialAccounts)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.transactions)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.dashboard)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.reports)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.budgets)?.isInvalidated).toBe(false);
  });
});
