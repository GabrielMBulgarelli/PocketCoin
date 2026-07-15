import { useEffect, useState } from "react";
import { MenuIcon, PlusIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { getHealth } from "../api/health";
import { getSettings } from "../api/settings";
import { CategoriesTagsView } from "../features/categories/CategoriesTagsView";
import { DashboardView } from "../features/dashboard/DashboardView";
import { FinancialAccountsView } from "../features/financial-accounts/FinancialAccountsView";
import { TransactionsView } from "../features/transactions/TransactionsView";
import { BudgetsView } from "../features/budgets/BudgetsView";
import { QuickAddDialog } from "../features/quick-add/QuickAddDialog";
import { PlannedPaymentsView } from "../features/planned-payments/PlannedPaymentsView";
import { ImportView } from "../features/imports/ImportView";
import { ReportsView } from "../features/reports/ReportsView";
import { SettingsView } from "../features/settings/SettingsView";
import { routes, routeFor, type RoutePath } from "./routes";
import { queryKeys } from "./queryKeys";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";

export function App() {
  const [path, setPath] = useState<RoutePath>(() => routeFor(location.hash.slice(1)));
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
  });
  const settingsQuery = useQuery({ queryKey: queryKeys.settings, queryFn: getSettings });
  useEffect(() => { const theme = settingsQuery.data?.theme ?? "system"; const media = window.matchMedia?.("(prefers-color-scheme: dark)"); const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && Boolean(media?.matches))); apply(); if (theme === "system") media?.addEventListener("change", apply); return () => media?.removeEventListener("change", apply); }, [settingsQuery.data?.theme]);

  const status = healthQuery.isPending
    ? "Checking local API…"
    : healthQuery.isError
      ? "Local API is unavailable"
      : "Local API is available";

  useEffect(() => { const sync = () => setPath(routeFor(location.hash.slice(1))); addEventListener("hashchange", sync); return () => removeEventListener("hashchange", sync); }, []);
  const title = routes.find(([route]) => route === path)?.[1] ?? "Dashboard";
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3"><a className="font-semibold tracking-tight" href="#/dashboard">PocketCoin</a><div className="ml-auto flex items-center gap-2"><p aria-atomic="true" aria-live="polite" className={feedback ? "max-w-32 text-right text-xs text-muted-foreground sm:max-w-none sm:text-sm" : "sr-only"} role="status">{feedback}</p><button aria-label="Quick add" className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground focus-visible:ring-[3px] focus-visible:ring-ring" onClick={() => { setFeedback(""); setQuickAddOpen(true); }} title="Quick add" type="button"><PlusIcon /></button><Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetTrigger asChild><button aria-label="Open navigation menu" className="grid size-10 place-items-center rounded-full border bg-card focus-visible:ring-[3px] focus-visible:ring-ring" type="button"><MenuIcon /></button></SheetTrigger><SheetContent className="w-3/4 max-w-sm overflow-y-auto sm:max-w-sm"><SheetHeader><SheetTitle>Navigate</SheetTitle><SheetDescription>Choose a PocketCoin workspace.</SheetDescription></SheetHeader><nav className="mt-6 flex flex-col gap-1">{routes.map(([route, label]) => <a aria-current={path === route ? "page" : undefined} className={`rounded-md px-3 py-3 text-left text-sm font-medium ${path === route ? "bg-accent" : "hover:bg-accent/70"}`} href={`#${route}`} key={route} onClick={() => setMenuOpen(false)}>{label}</a>)}</nav></SheetContent></Sheet></div></div>
    </header>
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6"><div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1></div><div className="text-right text-xs text-muted-foreground"><p role="status">{status}</p><p className="mt-1">{settingsQuery.isSuccess ? `${settingsQuery.data.base_currency} · ${settingsQuery.data.locale}` : settingsQuery.isError ? "Settings unavailable" : "Loading settings…"}</p></div></div>{path === "/dashboard" ? <DashboardView currency={settingsQuery.data?.base_currency ?? "USD"} locale={settingsQuery.data?.locale ?? "en-US"} /> : path === "/financial-accounts" ? <FinancialAccountsView currency={settingsQuery.data?.base_currency ?? "USD"} locale={settingsQuery.data?.locale ?? "en-US"} /> : path === "/categories" ? <CategoriesTagsView /> : path === "/transactions" ? <TransactionsView currency={settingsQuery.data?.base_currency ?? "USD"} locale={settingsQuery.data?.locale ?? "en-US"} /> : path === "/budgets" ? <BudgetsView currency={settingsQuery.data?.base_currency ?? "USD"} locale={settingsQuery.data?.locale ?? "en-US"} /> : path === "/planned-payments" ? <PlannedPaymentsView currency={settingsQuery.data?.base_currency ?? "USD"} locale={settingsQuery.data?.locale ?? "en-US"} /> : path === "/import" ? <ImportView currency={settingsQuery.data?.base_currency ?? "USD"} locale={settingsQuery.data?.locale ?? "en-US"} /> : path === "/reports" ? <ReportsView currency={settingsQuery.data?.base_currency ?? "USD"} locale={settingsQuery.data?.locale ?? "en-US"} /> : path === "/settings" ? <SettingsView settings={settingsQuery.data} loading={settingsQuery.isPending} loadError={settingsQuery.isError} /> : null}</main>
    <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} onCreated={setFeedback} />
  </div>;
}
