import { useCallback, useEffect, useState } from "react";

import type { ComparisonMetric, DashboardFilters } from "../../api/dashboard";
import { useOptionalWorkspaceRoute } from "../../app/WorkspaceRouteContext";
import { scopeToApiParams } from "../../app/workspaceRouteState";
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
  const requestedAccount = params.get("account");
  const financialAccountId = positiveId(requestedAccount);
  const categoryId = positiveId(params.get("category"));
  const tagId = positiveId(params.get("tag"));
  if (requestedAccount === "general") filters.without_account = true;
  else if (financialAccountId) filters.financial_account_id = financialAccountId;
  if (categoryId) filters.category_id = categoryId;
  if (tagId) filters.tag_id = tagId;
  return { filters, metric: requestedMetric && metrics.includes(requestedMetric) ? requestedMetric : defaultMetric };
}

export function useAnalyticsViewState(route: AnalyticsRoute, defaultMetric: ComparisonMetric) {
  const workspace = useOptionalWorkspaceRoute();
  const hasWorkspace = workspace !== null;
  const routeValue = workspace?.state;
  const updateRoute = workspace?.update;
  const fromWorkspace = useCallback(() => {
    if (!hasWorkspace || !routeValue || routeValue.path !== route) return readHash(route, defaultMetric);
    const fallback = defaults();
    return {
      filters: {
        start_date: routeValue.from ?? fallback.start_date,
        end_date: routeValue.to ?? fallback.end_date,
        ...scopeToApiParams(routeValue.scope.effective),
        category_id: routeValue.categoryId,
        tag_id: routeValue.tagId,
      },
      metric: route === "/reports" ? routeValue.metric : defaultMetric,
    };
  }, [defaultMetric, hasWorkspace, route, routeValue]);
  const [initial] = useState(() => fromWorkspace());
  const [filters, setFilters] = useState<DashboardFilters>(initial.filters);
  const [metric, setMetric] = useState<ComparisonMetric>(initial.metric);
  const [effective, setEffective] = useState(initial);

  useEffect(() => {
    const timeout = window.setTimeout(() => setEffective({ filters, metric }), 200);
    return () => window.clearTimeout(timeout);
  }, [filters, metric]);

  useEffect(() => {
    if (!updateRoute || routeValue?.path !== route) return;
    updateRoute({
      from: filters.start_date,
      to: filters.end_date,
      categoryId: filters.category_id,
      tagId: filters.tag_id,
      metric: route === "/reports" ? metric : routeValue.metric,
    }, { replace: true });
  }, [filters, metric, route, routeValue?.metric, routeValue?.path, updateRoute]);

  useEffect(() => {
    if (!hasWorkspace || routeValue?.path !== route) return;
    const next = fromWorkspace();
    setFilters(next.filters);
    if (route === "/reports") setMetric(next.metric);
  }, [fromWorkspace, hasWorkspace, route, routeValue?.path]);

  useEffect(() => {
    if (hasWorkspace) return;
    if (hashPath() !== route) return;
    const params = new URLSearchParams({ from: filters.start_date, to: filters.end_date, metric });
    if (filters.without_account) params.set("account", "general");
    else if (filters.financial_account_id) params.set("account", String(filters.financial_account_id));
    if (filters.category_id) params.set("category", String(filters.category_id));
    if (filters.tag_id) params.set("tag", String(filters.tag_id));
    window.history.replaceState(window.history.state, "", `#${route}?${params.toString()}`);
  }, [filters, hasWorkspace, metric, route]);

  useEffect(() => {
    if (hasWorkspace) return;
    const sync = () => {
      if (hashPath() !== route) return;
      const next = readHash(route, defaultMetric);
      setFilters(next.filters);
      setMetric(next.metric);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [defaultMetric, hasWorkspace, route]);

  const reset = useCallback(() => {
    setFilters(defaults());
    setMetric(defaultMetric);
  }, [defaultMetric]);

  const isUpdating = filters !== effective.filters || metric !== effective.metric;
  return { filters, metric, effectiveFilters: effective.filters, effectiveMetric: effective.metric, isUpdating, setFilters, setMetric, reset };
}
