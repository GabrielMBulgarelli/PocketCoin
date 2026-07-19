export const routes = [
  ["/dashboard", "Dashboard"],
  ["/transactions", "Transactions"],
  ["/financial-accounts", "Financial accounts"],
  ["/categories", "Categories & tags"],
  ["/budgets", "Budgets"],
  ["/planned-payments", "Planned payments"],
  ["/import", "Import"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
] as const;

export type RoutePath = (typeof routes)[number][0];

export function routeFor(path: string): RoutePath {
  const routePath = path.split("?", 1)[0];
  return routes.some(([route]) => route === routePath) ? (routePath as RoutePath) : "/dashboard";
}
