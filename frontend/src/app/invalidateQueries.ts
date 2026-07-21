import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

type QueryRoot = keyof typeof queryKeys;

export const mutationInvalidations = {
  accounts: ["financialAccounts", "transactions", "dashboard", "reports"],
  categories: ["categories", "transactions", "dashboard", "reports"],
  tags: ["tags", "transactions", "dashboard", "reports"],
  transactions: ["transactions", "financialAccounts", "budgets", "plannedPayments", "dashboard", "reports"],
  plannedPayments: ["plannedPayments", "dashboard", "reports"],
  markPaid: ["plannedPayments", "dashboard", "reports", "transactions", "financialAccounts", "budgets"],
  imports: ["imports", "transactions", "financialAccounts", "budgets", "dashboard", "reports"],
  budgets: ["budgets", "dashboard"],
} as const satisfies Record<string, readonly QueryRoot[]>;

export function invalidateFinancialQueries(client: QueryClient, roots: readonly QueryRoot[]) {
  return Promise.all(roots.map((root) => client.invalidateQueries({ queryKey: queryKeys[root] })));
}
