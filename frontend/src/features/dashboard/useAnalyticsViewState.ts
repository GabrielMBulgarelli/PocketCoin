import { useCallback, useEffect, useState } from "react";

import type { ComparisonMetric, DashboardFilters } from "../../api/dashboard";
import { localDateValue, monthStartValue } from "../../lib/format";

type AnalyticsRoute = "/dashboard" | "/reports";
const metrics: ComparisonMetric[] = ["cash_flow", "expenses", "income"];

function hashPath() {
  return window.location.hash.slice(1).split("?", 1)[0];
}

function isIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function positiveId(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function defaults(): DashboardFilters {
  const today = localDateValue();
  return { start_date: monthStartValue(today), end_date: today };
}

function readHash(route: AnalyticsRoute, defaultMetric: ComparisonMetric) {
  const [hashPath, query = ""] = window.location.hash.slice(1).split("?", 2);
  const fallback = defaults();
  if (hashPath !== route) return { filters: fallback, metric: defaultMetric };
  const params = new URLSearchParams(query);
  const requestedMetric = params.get("metric") as ComparisonMetric | null;
  const filters: DashboardFilters = {
    start_date: isIsoDate(params.get("from")) ? params.get("from")! : fallback.start_date,
    end_date: isIsoDate(params.get("to")) ? params.get("to")! : fallback.end_date,
  };
  const financialAccountId = positiveId(params.get("account"));
  const categoryId = positiveId(params.get("category"));
  const tagId = positiveId(params.get("tag"));
  if (financialAccountId) filters.financial_account_id = financialAccountId;
  if (categoryId) filters.category_id = categoryId;
  if (tagId) filters.tag_id = tagId;
  return { filters, metric: requestedMetric && metrics.includes(requestedMetric) ? requestedMetric : defaultMetric };
}

export function useAnalyticsViewState(route: AnalyticsRoute, defaultMetric: ComparisonMetric) {
  const [initial] = useState(() => readHash(route, defaultMetric));
  const [filters, setFilters] = useState<DashboardFilters>(initial.filters);
  const [metric, setMetric] = useState<ComparisonMetric>(initial.metric);

  useEffect(() => {
    if (hashPath() !== route) return;
    const params = new URLSearchParams({ from: filters.start_date, to: filters.end_date, metric });
    if (filters.financial_account_id) params.set("account", String(filters.financial_account_id));
    if (filters.category_id) params.set("category", String(filters.category_id));
    if (filters.tag_id) params.set("tag", String(filters.tag_id));
    window.history.replaceState(window.history.state, "", `#${route}?${params.toString()}`);
  }, [filters, metric, route]);

  useEffect(() => {
    const sync = () => {
      if (hashPath() !== route) return;
      const next = readHash(route, defaultMetric);
      setFilters(next.filters);
      setMetric(next.metric);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [defaultMetric, route]);

  const reset = useCallback(() => {
    setFilters(defaults());
    setMetric(defaultMetric);
  }, [defaultMetric]);

  return { filters, metric, setFilters, setMetric, reset };
}
