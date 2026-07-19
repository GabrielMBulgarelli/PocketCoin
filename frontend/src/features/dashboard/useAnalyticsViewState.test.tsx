import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { localDateValue, monthStartValue } from "../../lib/format";
import { useAnalyticsViewState } from "./useAnalyticsViewState";

describe("useAnalyticsViewState", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "#/dashboard");
    vi.restoreAllMocks();
  });

  it("hydrates valid filters and metric from the hash query", () => {
    window.history.replaceState(null, "", "#/dashboard?from=2026-06-01&to=2026-06-30&account=4&category=7&tag=9&metric=income");

    const { result } = renderHook(() => useAnalyticsViewState("/dashboard", "expenses"));

    expect(result.current.filters).toEqual({
      start_date: "2026-06-01",
      end_date: "2026-06-30",
      financial_account_id: 4,
      category_id: 7,
      tag_id: 9,
    });
    expect(result.current.metric).toBe("income");
  });

  it("normalizes invalid values and updates the URL without adding history entries", () => {
    window.history.replaceState(null, "", "#/dashboard?from=2026-02-30&to=nope&account=0&category=-2&tag=x&metric=unknown");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useAnalyticsViewState("/dashboard", "expenses"));

    expect(result.current.metric).toBe("expenses");
    expect(result.current.filters.start_date).toBe(monthStartValue(localDateValue()));
    expect(result.current.filters.end_date).toBe(localDateValue());

    act(() => result.current.setMetric("income"));

    expect(window.location.hash).toContain("metric=income");
    expect(replaceState).toHaveBeenCalled();
  });

  it("preserves an inverted valid range and resets every optional filter", () => {
    window.history.replaceState(null, "", "#/reports?from=2026-07-20&to=2026-07-01&account=2&metric=expenses");
    const { result } = renderHook(() => useAnalyticsViewState("/reports", "cash_flow"));

    expect(result.current.filters.start_date).toBe("2026-07-20");
    expect(result.current.filters.end_date).toBe("2026-07-01");

    act(() => result.current.reset());

    expect(result.current.filters).toEqual({
      start_date: monthStartValue(localDateValue()),
      end_date: localDateValue(),
    });
    expect(result.current.metric).toBe("cash_flow");
    expect(window.location.hash).toContain("#/reports?");
    expect(window.location.hash).not.toContain("account=");
  });

  it("does not overwrite navigation to a non-analytics route", () => {
    window.history.replaceState(null, "", "#/dashboard?from=2026-07-01&to=2026-07-19&metric=expenses");
    renderHook(() => useAnalyticsViewState("/dashboard", "expenses"));

    act(() => {
      window.location.hash = "#/transactions";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(window.location.hash).toBe("#/transactions");
  });
});
