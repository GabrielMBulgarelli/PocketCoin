import { describe, expect, it } from "vitest";

import {
  canonicalizeWorkspaceHash,
  routeMetadata,
  routeHref,
  scopeToApiParams,
  type WorkspaceRouteState,
} from "./workspaceRouteState";

it("owns the right-rail presentation for every route", () => {
  expect(routeMetadata["/dashboard"].rightRail).toBe("financial");
  expect(routeMetadata["/financial-accounts"].rightRail).toBe("accounts");
  expect(routeMetadata["/categories"].rightRail).toBe("references");
  expect(routeMetadata["/import"].rightRail).toBe("import");
  expect(routeMetadata["/settings"].rightRail).toBe("settings");
});

describe("workspace route state", () => {
  it("parses canonical account scopes and removes invalid values", () => {
    expect(canonicalizeWorkspaceHash("#/dashboard").state.account).toEqual({ kind: "all" });
    expect(canonicalizeWorkspaceHash("#/dashboard?account=general").state.account).toEqual({ kind: "general" });
    expect(canonicalizeWorkspaceHash("#/dashboard?account=42").state.account).toEqual({ kind: "account", accountId: 42 });

    const invalid = canonicalizeWorkspaceHash("#/dashboard?account=0&surprise=yes");
    expect(invalid.state.account).toEqual({ kind: "all" });
    expect(invalid.hash).toBe("#/dashboard");
    expect(invalid.changed).toBe(true);
  });

  it("canonicalizes legacy aliases and lets canonical account win", () => {
    expect(canonicalizeWorkspaceHash("#/reports?without_account=true").hash).toBe("#/reports?account=general");
    expect(canonicalizeWorkspaceHash("#/transactions?financial_account_id=7").hash).toBe("#/transactions?account=7");

    const canonicalWins = canonicalizeWorkspaceHash(
      "#/dashboard?account=general&financial_account_id=7&without_account=true",
    );
    expect(canonicalWins.state.account).toEqual({ kind: "general" });
    expect(canonicalWins.hash).toBe("#/dashboard?account=general");
  });

  it("keeps unavailable accounts requested while resolving effective scope", () => {
    const unavailable = canonicalizeWorkspaceHash("#/dashboard?account=99", [
      { id: 1, is_active: true },
      { id: 2, is_active: false },
    ]);
    expect(unavailable.state.account).toEqual({ kind: "account", accountId: 99 });
    expect(unavailable.state.scope).toEqual({
      requested: { kind: "account", accountId: 99 },
      effective: { kind: "all" },
      reason: "account-unavailable",
    });
    expect(unavailable.hash).toBe("#/dashboard?account=99");

    const inactive = canonicalizeWorkspaceHash("#/dashboard?account=2", [
      { id: 2, is_active: false },
    ]);
    expect(inactive.state.scope.effective).toEqual({ kind: "account", accountId: 2 });
  });

  it("makes Planning globally effective without discarding requested account", () => {
    const result = canonicalizeWorkspaceHash("#/budgets?account=4&month=2026-07&planning=upcoming", [
      { id: 4, is_active: true },
    ]);
    expect(result.state.scope).toEqual({
      requested: { kind: "account", accountId: 4 },
      effective: { kind: "all" },
      reason: "planning-is-global",
    });
    expect(result.hash).toBe("#/budgets?account=4&month=2026-07&planning=upcoming");
  });

  it("normalizes default and unknown modes", () => {
    const defaultOverview = canonicalizeWorkspaceHash("#/dashboard?analysis=cash-flow&activity=expenses");
    expect(defaultOverview.state.analysis).toBe("cash-flow");
    expect(defaultOverview.hash).toBe("#/dashboard");
    expect(canonicalizeWorkspaceHash("#/dashboard?analysis=forecast").hash).toBe("#/dashboard?analysis=forecast");
    expect(canonicalizeWorkspaceHash("#/dashboard?analysis=nope&activity=all").hash).toBe("#/dashboard");
    expect(canonicalizeWorkspaceHash("#/budgets?planning=budgets").hash).toBe("#/budgets");
    expect(canonicalizeWorkspaceHash("#/reports?metric=nope").hash).toBe("#/reports");
  });

  it("replaces planned-payments with Planning Upcoming and retains only supported state", () => {
    const result = canonicalizeWorkspaceHash(
      "#/planned-payments?financial_account_id=8&month=2026-11&from=2026-01-01&q=rent&page=2&unknown=yes",
    );
    expect(result.state.path).toBe("/budgets");
    expect(result.state.planning).toBe("upcoming");
    expect(result.hash).toBe("#/budgets?account=8&month=2026-11&planning=upcoming");
  });

  it("retains only parameters supported by each primary destination", () => {
    const state = canonicalizeWorkspaceHash(
      "#/reports?account=3&from=2026-07-01&to=2026-07-21&category=4&tag=5&metric=income",
    ).state;

    expect(routeHref("/dashboard", state)).toBe(
      "#/dashboard?account=3&from=2026-07-01&to=2026-07-21&category=4&tag=5",
    );
    expect(routeHref("/transactions", state)).toBe("#/transactions?account=3");
    expect(routeHref("/budgets", { ...state, month: "2026-07" })).toBe("#/budgets?account=3&month=2026-07");
    expect(routeHref("/reports", state)).toBe(
      "#/reports?account=3&from=2026-07-01&to=2026-07-21&category=4&tag=5&metric=income",
    );
  });

  it("converts account scope only at the API boundary", () => {
    expect(scopeToApiParams({ kind: "all" })).toEqual({});
    expect(scopeToApiParams({ kind: "general" })).toEqual({ without_account: true });
    expect(scopeToApiParams({ kind: "account", accountId: 12 })).toEqual({ financial_account_id: 12 });
  });

  it("preserves valid date and month values and removes malformed ones", () => {
    const valid = canonicalizeWorkspaceHash(
      "#/dashboard?from=2026-02-01&to=2026-02-28&category=2&tag=3&analysis=debt&activity=income",
    );
    expect(valid.state).toEqual(expect.objectContaining({
      from: "2026-02-01",
      to: "2026-02-28",
      categoryId: 2,
      tagId: 3,
      analysis: "debt",
      activity: "income",
    } satisfies Partial<WorkspaceRouteState>));

    expect(canonicalizeWorkspaceHash("#/budgets?month=2026-13").hash).toBe("#/budgets");
    expect(canonicalizeWorkspaceHash("#/dashboard?from=2026-02-30&to=nope").hash).toBe("#/dashboard");
  });
});
