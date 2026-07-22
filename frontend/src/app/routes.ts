export const routes = [
  ["/dashboard", "Overview"],
  ["/transactions", "Transactions"],
  ["/financial-accounts", "Financial accounts"],
  ["/categories", "Categories & tags"],
  ["/budgets", "Planning"],
  ["/import", "Import"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
] as const;

export type RoutePath = (typeof routes)[number][0];

export function routeFor(path: string): RoutePath {
  const routePath = path.split("?", 1)[0];
  if (routePath === "/planned-payments") return "/budgets";
  return routes.some(([route]) => route === routePath) ? (routePath as RoutePath) : "/dashboard";
}
