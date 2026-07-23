export type RoutePath =
  | "/dashboard"
  | "/transactions"
  | "/budgets"
  | "/reports"
  | "/financial-accounts"
  | "/categories"
  | "/import"
  | "/settings";

export type PrimaryRoutePath = "/dashboard" | "/transactions" | "/budgets" | "/reports";
export type AnalysisMode = "forecast" | "cash-flow" | "spending" | "debt";
export type ActivityMode = "income" | "expenses" | "transfers";
export type PlanningMode = "budgets" | "upcoming";
export type ReportMetric = "cash_flow" | "expenses" | "income";

export type AccountScope =
  | { kind: "all" }
  | { kind: "general" }
  | { kind: "account"; accountId: number };

export type EffectiveWorkspaceScope = {
  requested: AccountScope;
  effective: AccountScope;
  reason?: "planning-is-global" | "account-unavailable";
};

export type WorkspaceRouteState = {
  path: RoutePath;
  account: AccountScope;
  scope: EffectiveWorkspaceScope;
  from?: string;
  to?: string;
  categoryId?: number;
  tagId?: number;
  month?: string;
  analysis: AnalysisMode;
  activity: ActivityMode;
  planning: PlanningMode;
  metric: ReportMetric;
  settingsSection?: "data-safety";
  referenceAction?: "category" | "tag";
};

type AccountAvailability = { id: number; is_active: boolean };

export type RouteMetadata = {
  path: RoutePath;
  title: string;
  primaryLabel?: string;
  primary: boolean;
  accountScope: boolean;
  rightRail: "financial" | "accounts" | "references" | "import" | "settings";
};

export const routeMetadata: Record<RoutePath, RouteMetadata> = {
  "/dashboard": { path: "/dashboard", title: "Overview", primaryLabel: "Overview", primary: true, accountScope: true, rightRail: "financial" },
  "/transactions": { path: "/transactions", title: "Transactions", primaryLabel: "Transactions", primary: true, accountScope: true, rightRail: "financial" },
  "/budgets": { path: "/budgets", title: "Planning", primaryLabel: "Planning", primary: true, accountScope: true, rightRail: "financial" },
  "/reports": { path: "/reports", title: "Reports", primaryLabel: "Reports", primary: true, accountScope: true, rightRail: "financial" },
  "/financial-accounts": { path: "/financial-accounts", title: "Financial accounts", primary: false, accountScope: false, rightRail: "accounts" },
  "/categories": { path: "/categories", title: "Categories & tags", primary: false, accountScope: false, rightRail: "references" },
  "/import": { path: "/import", title: "Import", primary: false, accountScope: false, rightRail: "import" },
  "/settings": { path: "/settings", title: "Settings", primary: false, accountScope: false, rightRail: "settings" },
};

export const primaryRoutes = (["/dashboard", "/transactions", "/budgets", "/reports"] as const)
  .map((path) => routeMetadata[path]);

export const secondaryRoutes = (["/financial-accounts", "/categories", "/import", "/settings"] as const)
  .map((path) => routeMetadata[path]);

const validRoutes = new Set<RoutePath>(Object.keys(routeMetadata) as RoutePath[]);
const analysisModes = new Set<AnalysisMode>(["forecast", "cash-flow", "spending", "debt"]);
const activityModes = new Set<ActivityMode>(["income", "expenses", "transfers"]);
const planningModes = new Set<PlanningMode>(["budgets", "upcoming"]);
const reportMetrics = new Set<ReportMetric>(["cash_flow", "expenses", "income"]);

function positiveInteger(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validMonth(value: string | null): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function enumValue<T extends string>(value: string | null, values: Set<T>, fallback: T): T {
  return value && values.has(value as T) ? (value as T) : fallback;
}

function accountFromParams(params: URLSearchParams): AccountScope {
  if (params.has("account")) {
    const canonical = params.get("account");
    if (canonical === "general") return { kind: "general" };
    const accountId = positiveInteger(canonical);
    return accountId ? { kind: "account", accountId } : { kind: "all" };
  }
  if (params.get("without_account") === "true") return { kind: "general" };
  const legacyId = positiveInteger(params.get("financial_account_id"));
  return legacyId ? { kind: "account", accountId: legacyId } : { kind: "all" };
}

export function resolveEffectiveScope(
  requested: AccountScope,
  path: RoutePath,
  accounts?: AccountAvailability[],
): EffectiveWorkspaceScope {
  if (path === "/budgets" && requested.kind !== "all") {
    return { requested, effective: { kind: "all" }, reason: "planning-is-global" };
  }
  if (requested.kind === "account" && accounts && !accounts.some((account) => account.id === requested.accountId)) {
    return { requested, effective: { kind: "all" }, reason: "account-unavailable" };
  }
  return { requested, effective: requested };
}

function appendAccount(params: URLSearchParams, account: AccountScope) {
  if (account.kind === "general") params.set("account", "general");
  if (account.kind === "account") params.set("account", String(account.accountId));
}

function serializeState(path: RoutePath, state: WorkspaceRouteState): string {
  const params = new URLSearchParams();
  if (routeMetadata[path].accountScope) appendAccount(params, state.account);

  if (path === "/dashboard" || path === "/reports") {
    if (state.from) params.set("from", state.from);
    if (state.to) params.set("to", state.to);
    if (state.categoryId) params.set("category", String(state.categoryId));
    if (state.tagId) params.set("tag", String(state.tagId));
  }
  if (path === "/dashboard") {
    if (state.analysis !== "cash-flow") params.set("analysis", state.analysis);
    if (state.activity !== "expenses") params.set("activity", state.activity);
  }
  if (path === "/budgets") {
    if (state.month) params.set("month", state.month);
    if (state.planning !== "budgets") params.set("planning", state.planning);
  }
  if (path === "/reports" && state.metric !== "cash_flow") params.set("metric", state.metric);
  if (path === "/settings" && state.settingsSection) params.set("section", state.settingsSection);
  if (path === "/categories" && state.referenceAction) params.set("add", state.referenceAction);
  const query = params.toString();
  return `#${path}${query ? `?${query}` : ""}`;
}

export function routeHref(path: RoutePath, source: WorkspaceRouteState): string {
  return serializeState(path, { ...source, path });
}

export function canonicalizeWorkspaceHash(rawHash: string, accounts?: AccountAvailability[]) {
  const raw = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  const [rawPath = "", query = ""] = raw.split("?", 2);
  const compatibility = rawPath === "/planned-payments";
  const path: RoutePath = compatibility
    ? "/budgets"
    : validRoutes.has(rawPath as RoutePath)
      ? (rawPath as RoutePath)
      : "/dashboard";
  const params = new URLSearchParams(query);
  const account = accountFromParams(params);
  const state: WorkspaceRouteState = {
    path,
    account,
    scope: resolveEffectiveScope(account, path, accounts),
    from: validDate(params.get("from")) ? params.get("from")! : undefined,
    to: validDate(params.get("to")) ? params.get("to")! : undefined,
    categoryId: positiveInteger(params.get("category")),
    tagId: positiveInteger(params.get("tag")),
    month: validMonth(params.get("month")) ? params.get("month")! : undefined,
    analysis: enumValue(params.get("analysis"), analysisModes, "cash-flow"),
    activity: enumValue(params.get("activity"), activityModes, "expenses"),
    planning: compatibility ? "upcoming" : enumValue(params.get("planning"), planningModes, "budgets"),
    metric: enumValue(params.get("metric"), reportMetrics, "cash_flow"),
    settingsSection: params.get("section") === "data-safety" ? "data-safety" : undefined,
    referenceAction: params.get("add") === "category" || params.get("add") === "tag" ? params.get("add") as "category" | "tag" : undefined,
  };
  const hash = serializeState(path, state);
  const normalizedInput = rawHash.startsWith("#") ? rawHash : `#${rawHash}`;
  return { state, hash, changed: normalizedInput !== hash };
}

export function scopeToApiParams(scope: AccountScope): {
  financial_account_id?: number;
  without_account?: true;
} {
  if (scope.kind === "general") return { without_account: true };
  if (scope.kind === "account") return { financial_account_id: scope.accountId };
  return {};
}
