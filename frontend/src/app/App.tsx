import { useEffect, useRef, useState } from "react";
import { MenuIcon, PlusIcon, XIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { getHealth } from "../api/health";
import { getSettings } from "../api/settings";
import { getCategories, getFinancialAccounts, getTags } from "../api/referenceData";
import { getTransactions } from "../api/transactions";
import { TransactionLedger } from "../features/transactions/TransactionLedger";
import { routes, routeFor, type RoutePath } from "./routes";
import { queryKeys } from "./queryKeys";

export function App() {
  const [path, setPath] = useState<RoutePath>(() => routeFor(location.hash.slice(1)));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
  });
  const settingsQuery = useQuery({ queryKey: queryKeys.settings, queryFn: getSettings });
  const accountsQuery = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: getFinancialAccounts, enabled: path === "/financial-accounts" });
  const categoriesQuery = useQuery({ queryKey: queryKeys.categories, queryFn: getCategories, enabled: path === "/categories" });
  const tagsQuery = useQuery({ queryKey: queryKeys.tags, queryFn: getTags, enabled: path === "/categories" });
  const transactionsQuery = useQuery({ queryKey: queryKeys.transactions, queryFn: () => getTransactions(), enabled: path === "/transactions" });

  const status = healthQuery.isPending
    ? "Checking local API…"
    : healthQuery.isError
      ? "Local API is unavailable"
      : "Local API is available";

  useEffect(() => { const sync = () => setPath(routeFor(location.hash.slice(1))); addEventListener("hashchange", sync); return () => removeEventListener("hashchange", sync); }, []);
  const title = routes.find(([route]) => route === path)?.[1] ?? "Dashboard";
  const navigate = (next: RoutePath) => { location.hash = next; setMenuOpen(false); requestAnimationFrame(() => menuTrigger.current?.focus()); };
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3"><a className="font-semibold tracking-tight" href="#/dashboard">PocketCoin</a><div className="ml-auto flex items-center gap-2"><button aria-label="Quick add" className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground focus-visible:ring-[3px] focus-visible:ring-ring" type="button"><PlusIcon /></button><button ref={menuTrigger} aria-expanded={menuOpen} aria-label="Open navigation menu" className="grid size-10 place-items-center rounded-full border bg-card focus-visible:ring-[3px] focus-visible:ring-ring" onClick={() => setMenuOpen(true)} type="button"><MenuIcon /></button></div></div>
    </header>
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6"><section className="rounded-xl border bg-card p-5 shadow-sm"><p className="text-xs font-medium text-muted-foreground">Workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-sm text-muted-foreground">This workspace is ready for its financial data features.</p><p className="mt-6 text-xs text-muted-foreground" role="status">{status}</p><p className="mt-2 text-xs text-muted-foreground">{settingsQuery.isSuccess ? `${settingsQuery.data.base_currency} · ${settingsQuery.data.locale} · ${settingsQuery.data.theme}` : settingsQuery.isError ? "Settings unavailable" : "Loading settings…"}</p>{path === "/financial-accounts" && <p className="mt-6 text-sm">{accountsQuery.isPending ? "Loading accounts…" : accountsQuery.isError ? "Accounts unavailable" : accountsQuery.data.length ? accountsQuery.data.map((account) => account.name).join(", ") : "No financial accounts."}</p>}{path === "/categories" && <p className="mt-6 text-sm">{categoriesQuery.isPending || tagsQuery.isPending ? "Loading categories and tags…" : categoriesQuery.isError || tagsQuery.isError ? "Categories or tags unavailable" : `${categoriesQuery.data.length} categories · ${tagsQuery.data.length} tags`}</p>}{path === "/transactions" && (transactionsQuery.isPending ? <p className="mt-6 text-sm">Loading transactions…</p> : transactionsQuery.isError ? <p className="mt-6 text-sm">Transactions unavailable</p> : transactionsQuery.data.length ? <TransactionLedger transactions={transactionsQuery.data} /> : <p className="mt-6 text-sm">No transactions.</p>)}</section></main>
    {menuOpen && <div aria-modal="true" className="fixed inset-0 z-50 flex justify-end bg-black/50" role="dialog" aria-labelledby="menu-title"><section className="h-full w-full max-w-sm overflow-y-auto bg-background p-5 shadow-lg"><div className="flex items-center justify-between"><h2 id="menu-title" className="text-lg font-semibold">Navigate</h2><button aria-label="Close navigation menu" className="grid size-10 place-items-center rounded-full border" onClick={() => { setMenuOpen(false); requestAnimationFrame(() => menuTrigger.current?.focus()); }} type="button"><XIcon /></button></div><nav className="mt-6 flex flex-col gap-1">{routes.map(([route, label]) => <button key={route} className={`rounded-md px-3 py-3 text-left text-sm font-medium ${path === route ? "bg-accent" : "hover:bg-accent/70"}`} onClick={() => navigate(route)} type="button">{label}</button>)}</nav></section></div>}
  </div>;
}
