import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";

import { getBudgetProgress } from "../api/budgets";
import {
  getDashboardEndpoint,
  type CreditAccountUtilization,
  type DashboardSummary,
} from "../api/dashboard";
import type { PlannedPayment } from "../api/plannedPayments";
import { getCategories, getTags } from "../api/referenceData";
import { formatMinor, localDateValue, monthStartValue } from "../lib/format";
import { queryKeys } from "./queryKeys";
import { useBackupController } from "./BackupControllerContext";
import { useWorkspaceRoute } from "./WorkspaceRouteContext";
import {
  resolveEffectiveScope,
  routeHref,
  routeMetadata,
  scopeToApiParams,
  type AccountScope,
} from "./workspaceRouteState";

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateValue(date);
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border bg-card p-4 shadow-sm"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2><div className="mt-3">{children}</div></section>;
}

function ScopeName({ scope }: { scope: AccountScope }) {
  const { accounts } = useWorkspaceRoute();
  if (scope.kind === "all") return <>All accounts</>;
  if (scope.kind === "general") return <>General</>;
  const account = accounts.data?.find((item) => item.id === scope.accountId);
  return <>{account ? `${account.name}${account.is_active ? "" : " — inactive"}` : `Account unavailable (${scope.accountId})`}</>;
}

export function LeftWorkspaceRail({ onAction }: { onAction?: () => void }) {
  const { accounts, state } = useWorkspaceRoute();
  const backup = useBackupController();
  const requestedAccountId = state.account.kind === "account" ? state.account.accountId : undefined;
  const selectedInactive = requestedAccountId
    ? accounts.data?.find((item) => item.id === requestedAccountId && !item.is_active)
    : undefined;
  const visibleAccounts = [
    ...(accounts.data?.filter((item) => item.is_active) ?? []),
    ...(selectedInactive ? [selectedInactive] : []),
  ];
  const accountHref = (account: AccountScope) => routeHref(state.path, {
    ...state,
    account,
    scope: resolveEffectiveScope(account, state.path, accounts.data),
  });
  const linkClass = (selected: boolean) => `block min-h-10 rounded-lg px-3 py-2 text-sm ${selected ? "bg-accent font-medium" : "hover:bg-accent/60"}`;
  return <div className="space-y-4">
    <RailCard title="Accounts">
      <nav aria-label="Account scope" className="space-y-1">
        <a className={linkClass(state.account.kind === "all")} href={accountHref({ kind: "all" })} onClick={onAction}>All accounts</a>
        <a className={linkClass(state.account.kind === "general")} href={accountHref({ kind: "general" })} onClick={onAction}>General</a>
        {visibleAccounts.map((account) => <a className={linkClass(state.account.kind === "account" && state.account.accountId === account.id)} href={accountHref({ kind: "account", accountId: account.id })} key={account.id} onClick={onAction}>{account.name}{account.is_active ? "" : " — inactive"}</a>)}
        {state.scope.reason === "account-unavailable" && <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">Account unavailable. All accounts is used for results.</p>}
      </nav>
      <a className="mt-3 block text-sm font-medium text-primary" href={routeHref("/financial-accounts", state)} onClick={onAction}>Manage accounts</a>
    </RailCard>
    <RailCard title="Management">
      <div className="space-y-2">
        {(["category", "tag"] as const).map((type) => <div className="flex items-center justify-between gap-2" key={type}><a className="min-h-10 flex-1 rounded-lg px-3 py-2 text-sm hover:bg-accent/60" href={routeHref("/categories", state)} onClick={onAction}>{type === "category" ? "Categories" : "Tags"}</a><a aria-label={`Add ${type}`} className="grid size-9 place-items-center rounded-full border bg-background hover:bg-accent" href={routeHref("/categories", { ...state, referenceAction: type })} onClick={onAction}><PlusIcon className="size-4" /></a></div>)}
      </div>
    </RailCard>
    <RailCard title="Quick tools">
      <div className="grid gap-1 text-sm">
        <a className="rounded-lg px-3 py-2 hover:bg-accent/60" href={routeHref("/import", state)} onClick={onAction}>Import CSV</a>
        <a className="rounded-lg px-3 py-2 hover:bg-accent/60" href={routeHref("/reports", state)} onClick={onAction}>Run report</a>
        <button className="rounded-lg px-3 py-2 text-left hover:bg-accent/60 disabled:opacity-50" disabled={backup.isPending} onClick={() => backup.mutate()} type="button">{backup.isPending ? "Backing up…" : "Backup data"}</button>
        <a className="rounded-lg px-3 py-2 hover:bg-accent/60" href="#/settings?section=data-safety" onClick={onAction}>Data Safety</a>
        {backup.isError && <p className="px-3 text-xs text-destructive" role="alert">Backup could not be created.</p>}
        {backup.isSuccess && <p className="px-3 text-xs text-muted-foreground" role="status">Backup created.</p>}
      </div>
    </RailCard>
  </div>;
}

export function RightWorkspaceRail({ currency, locale, onAction }: { currency: string; locale: string; onAction?: () => void }) {
  const { accounts, state } = useWorkspaceRoute();
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: ({ signal }) => getCategories(signal), enabled: !routeMetadata[state.path].primary });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: ({ signal }) => getTags(signal), enabled: state.path === "/categories" });
  const primary = routeMetadata[state.path].primary;
  const today = localDateValue();
  const filters = { start_date: monthStartValue(today), end_date: today, ...scopeToApiParams(state.scope.effective) };
  const summary = useQuery({ queryKey: [...queryKeys.dashboard, "rail-summary", filters], queryFn: ({ signal }) => getDashboardEndpoint<DashboardSummary>("summary", filters, {}, signal), enabled: primary });
  const credit = useQuery({ queryKey: [...queryKeys.dashboard, "rail-credit", filters], queryFn: ({ signal }) => getDashboardEndpoint<CreditAccountUtilization[]>("credit-account-utilization", filters, {}, signal), enabled: primary });
  const budgets = useQuery({ queryKey: [...queryKeys.budgets, "rail", today.slice(0, 7)], queryFn: ({ signal }) => getBudgetProgress(monthStartValue(today), signal), enabled: primary });
  const upcomingFilters = { start_date: today, end_date: addDays(today, 30), ...scopeToApiParams(state.scope.effective) };
  const upcoming = useQuery({ queryKey: [...queryKeys.dashboard, "rail-upcoming", upcomingFilters], queryFn: ({ signal }) => getDashboardEndpoint<PlannedPayment[]>("upcoming-payments", upcomingFilters, {}, signal), enabled: primary });
  const money = (value: number) => formatMinor(value, currency, locale);

  if (!primary) {
    const activeAccounts = accounts.data?.filter((item) => item.is_active).length ?? 0;
    const inactiveAccounts = accounts.data?.filter((item) => !item.is_active).length ?? 0;
    const activeCategories = categories.data?.filter((item) => item.is_active).length ?? 0;
    const inactiveCategories = categories.data?.filter((item) => !item.is_active).length ?? 0;
    const activeTags = tags.data?.filter((item) => item.is_active).length ?? 0;
    const inactiveTags = tags.data?.filter((item) => !item.is_active).length ?? 0;
    return <div className="space-y-4"><RailCard title="Route status">
      {state.path === "/financial-accounts" ? <p className="text-sm">{activeAccounts} active · {inactiveAccounts} inactive accounts</p> : state.path === "/categories" ? <div className="space-y-2 text-sm"><p>Categories: {activeCategories} active · {inactiveCategories} inactive</p><p>Tags: {activeTags} active · {inactiveTags} inactive</p></div> : state.path === "/import" ? <p className="text-sm text-muted-foreground">Import is local and reviewable before committing changes.</p> : <p className="text-sm text-muted-foreground">Preferences, export, backups, and restore controls.</p>}
    </RailCard><RailCard title="Helpful actions"><div className="grid gap-2 text-sm"><a href="#/settings?section=data-safety" onClick={onAction}>Open Data Safety</a><a href={routeHref("/import", state)} onClick={onAction}>Import data</a></div></RailCard></div>;
  }

  const budgetWarnings = budgets.data?.filter((item) => item.remaining_minor < 0) ?? [];
  const creditWarnings = credit.data?.filter((item) => item.current_percentage !== null && item.current_percentage >= 30) ?? [];
  return <div className="space-y-4">
    <RailCard title="This month">
      <p className="mb-3 text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${today}T12:00:00`))} · <ScopeName scope={state.scope.effective} /></p>
      {summary.isPending ? <p className="text-sm text-muted-foreground" role="status">Loading summary…</p> : summary.isError ? <button className="text-sm text-destructive" onClick={() => void summary.refetch()} type="button">Summary unavailable — Retry</button> : <dl className="grid gap-2 text-sm">{[["Balance", summary.data.balance_minor], ["Income", summary.data.income_minor], ["Expenses", summary.data.expense_minor], ["Net", summary.data.net_minor]].map(([label, value]) => <div className="flex justify-between gap-3" key={String(label)}><dt>{label}</dt><dd className="font-medium tabular-nums">{money(Number(value))}</dd></div>)}</dl>}
    </RailCard>
    <RailCard title="Needs attention">
      {budgets.isError && <p className="text-xs text-destructive">Budget warnings unavailable.</p>}
      {credit.isError && <p className="text-xs text-destructive">Credit warnings unavailable.</p>}
      {!budgets.isPending && !credit.isPending && budgetWarnings.length === 0 && creditWarnings.length === 0 && !budgets.isError && !credit.isError ? <p className="text-sm text-muted-foreground">Nothing needs attention.</p> : <ul className="space-y-2 text-sm">{budgetWarnings.map((item) => <li key={`budget-${item.id}`}>{item.category_name} is {money(-item.remaining_minor)} over budget.</li>)}{creditWarnings.map((item) => <li key={`credit-${item.account_id}`}>{item.account_name} utilization is {item.current_percentage}%.</li>)}</ul>}
    </RailCard>
    <RailCard title="Upcoming">
      {upcoming.isPending ? <p className="text-sm text-muted-foreground" role="status">Loading upcoming…</p> : upcoming.isError ? <button className="text-sm text-destructive" onClick={() => void upcoming.refetch()} type="button">Upcoming unavailable — Retry</button> : upcoming.data.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled in the next 30 days.</p> : <ul className="divide-y text-sm">{upcoming.data.slice(0, 3).map((item) => <li className="py-2" key={item.id}><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.due_date} · {money(item.amount_minor)}</p></li>)}</ul>}
      <a className="mt-3 block text-sm font-medium text-primary" href={routeHref("/budgets", { ...state, planning: "upcoming" })} onClick={onAction}>View Planning upcoming</a>
    </RailCard>
  </div>;
}
