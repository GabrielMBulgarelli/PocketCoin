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
import { RecurringPaymentIcon } from "../features/planned-payments/RecurringPaymentIcon";
import { formatMinor, localDateValue, monthStartValue } from "../lib/format";
import { queryKeys } from "./queryKeys";
import { useBackupController } from "./BackupControllerContext";
import { useWorkspaceRoute } from "./WorkspaceRouteContext";
import { useRouteWorkspaceTools } from "./WorkspaceToolsContext";
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
      {accounts.isPending ? <p className="text-sm text-muted-foreground" role="status">Loading accounts…</p> : accounts.isError ? <button className="text-sm text-destructive" onClick={() => void accounts.refetch()} type="button">Accounts unavailable — Retry</button> : <nav aria-label="Account scope" className="space-y-1">
        <a className={linkClass(state.account.kind === "all")} href={accountHref({ kind: "all" })} onClick={onAction}>All accounts</a>
        <a className={linkClass(state.account.kind === "general")} href={accountHref({ kind: "general" })} onClick={onAction}>General</a>
        {visibleAccounts.map((account) => <a className={linkClass(state.account.kind === "account" && state.account.accountId === account.id)} href={accountHref({ kind: "account", accountId: account.id })} key={account.id} onClick={onAction}>{account.name}{account.is_active ? "" : " — inactive"}</a>)}
        {state.scope.reason === "account-unavailable" && <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">Account unavailable. All accounts is used for results.</p>}
      </nav>}
      <a className="mt-3 block text-sm font-medium text-primary" href={routeHref("/financial-accounts", state)} onClick={onAction}>Manage accounts</a>
    </RailCard>
    <section className="relative rounded-2xl border bg-card p-4 shadow-sm">
      <a aria-label="Manage categories and tags" className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={routeHref("/categories", state)} onClick={onAction} />
      <h2 className="pointer-events-none relative text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Management</h2>
      <div className="pointer-events-none relative mt-3 space-y-2">
        {(["category", "tag"] as const).map((type) => <div className="flex min-h-10 items-center justify-between gap-2 px-3 text-sm" key={type}><span>{type === "category" ? "Categories" : "Tags"}</span><a aria-label={`Add ${type}`} className="pointer-events-auto grid size-9 place-items-center rounded-full border bg-background hover:bg-accent" href={routeHref("/categories", { ...state, referenceAction: type })} onClick={(event) => { event.stopPropagation(); onAction?.(); }}><PlusIcon className="size-4" /></a></div>)}
      </div>
    </section>
    <RailCard title="Quick tools">
      <div className="grid gap-1 text-sm">
        <a className="rounded-lg px-3 py-2 hover:bg-accent/60" href={routeHref("/import", state)} onClick={onAction}>Import CSV</a>
        <a className="rounded-lg px-3 py-2 hover:bg-accent/60" href={routeHref("/reports", state)} onClick={onAction}>Run report</a>
        <button className="rounded-lg px-3 py-2 text-left hover:bg-accent/60 disabled:opacity-50" disabled={backup.isPending} onClick={() => backup.mutate(undefined, { onSuccess: onAction })} type="button">{backup.isPending ? "Backing up…" : "Backup data"}</button>
        <a className="rounded-lg px-3 py-2 hover:bg-accent/60" href="#/settings?section=data-safety" onClick={onAction}>Data Safety</a>
        {backup.isError && <p className="px-3 text-xs text-destructive" role="alert">Backup could not be created.</p>}
      </div>
    </RailCard>
  </div>;
}

export function RightWorkspaceRail({ currency, filtersOpen, locale, onAction, onFiltersOpenChange }: { currency: string; filtersOpen: boolean; locale: string; onAction?: () => void; onFiltersOpenChange: (open: boolean) => void }) {
  const { accounts, state } = useWorkspaceRoute();
  const workspaceTools = useRouteWorkspaceTools();
  const metadata = routeMetadata[state.path];
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: ({ signal }) => getCategories(signal), enabled: metadata.rightRail === "references" });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: ({ signal }) => getTags(signal), enabled: metadata.rightRail === "references" });
  const primary = metadata.rightRail === "financial";
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
      {metadata.rightRail === "accounts" ? accounts.isPending ? <p className="text-sm text-muted-foreground" role="status">Loading account status…</p> : accounts.isError ? <button className="text-sm text-destructive" onClick={() => void accounts.refetch()} type="button">Account status unavailable — Retry</button> : <p className="text-sm">{activeAccounts} active · {inactiveAccounts} inactive accounts</p>
        : metadata.rightRail === "references" ? categories.isPending || tags.isPending ? <p className="text-sm text-muted-foreground" role="status">Loading category and tag status…</p> : <div className="space-y-2 text-sm">{categories.isError ? <button className="text-destructive" onClick={() => void categories.refetch()} type="button">Categories unavailable — Retry</button> : <p>Categories: {activeCategories} active · {inactiveCategories} inactive</p>}{tags.isError ? <button className="block text-destructive" onClick={() => void tags.refetch()} type="button">Tags unavailable — Retry</button> : <p>Tags: {activeTags} active · {inactiveTags} inactive</p>}</div>
          : metadata.rightRail === "import" ? <p className="text-sm text-muted-foreground">Import is local and reviewable before committing changes.</p>
            : <p className="text-sm text-muted-foreground">Preferences, export, backups, and restore controls.</p>}
    </RailCard><RailCard title="Helpful actions"><div className="grid gap-2 text-sm">
      {metadata.rightRail === "accounts" && <><a href={routeHref("/import", state)} onClick={onAction}>Import account data</a><a href="#/settings?section=data-safety" onClick={onAction}>Open Data Safety</a></>}
      {metadata.rightRail === "references" && <><a href={routeHref("/categories", { ...state, referenceAction: "category" })} onClick={onAction}>Add category</a><a href={routeHref("/categories", { ...state, referenceAction: "tag" })} onClick={onAction}>Add tag</a></>}
      {metadata.rightRail === "import" && <><a href={routeHref("/financial-accounts", state)} onClick={onAction}>Manage accounts</a><a href="#/settings?section=data-safety" onClick={onAction}>Open Data Safety</a></>}
      {metadata.rightRail === "settings" && <><a href={routeHref("/import", state)} onClick={onAction}>Import data</a><a href={routeHref("/reports", state)} onClick={onAction}>Run report</a></>}
    </div></RailCard></div>;
  }

  const budgetWarnings = budgets.data?.filter((item) => item.remaining_minor < 0) ?? [];
  const creditWarnings = credit.data?.filter((item) => item.current_percentage !== null && item.current_percentage >= 30) ?? [];
  return <div className="space-y-4">
    <RailCard title="This month">
      <p className="mb-3 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${today}T12:00:00`))} · <ScopeName scope={state.scope.effective} /></p>
      {summary.isPending ? <p className="text-sm text-muted-foreground" role="status">Loading summary…</p> : summary.isError ? <button className="text-sm text-destructive" onClick={() => void summary.refetch()} type="button">Summary unavailable — Retry</button> : <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">{[["Balance", summary.data.balance_minor], ["Income", summary.data.income_minor], ["Expenses", summary.data.expense_minor], ["Net", summary.data.net_minor]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{money(Number(value))}</dd></div>)}</dl>}
    </RailCard>
    <RailCard title="Needs attention">
      {(budgets.isPending || credit.isPending) && <p className="text-sm text-muted-foreground" role="status">Checking budgets and credit…</p>}
      {budgets.isError && <button className="block text-xs text-destructive" onClick={() => void budgets.refetch()} type="button">Budget warnings unavailable — Retry</button>}
      {credit.isError && <button className="mt-2 block text-xs text-destructive" onClick={() => void credit.refetch()} type="button">Credit warnings unavailable — Retry</button>}
      {!budgets.isPending && !credit.isPending && budgetWarnings.length === 0 && creditWarnings.length === 0 && !budgets.isError && !credit.isError ? <p className="text-sm text-muted-foreground">Nothing needs attention.</p> : <ul className="space-y-2 text-sm">{budgetWarnings.map((item) => <li key={`budget-${item.id}`}>{item.category_name} is {money(-item.remaining_minor)} over budget.</li>)}{creditWarnings.map((item) => <li key={`credit-${item.account_id}`}>{item.account_name} utilization is {item.current_percentage}%.</li>)}</ul>}
    </RailCard>
    <RailCard title="Upcoming">
      {upcoming.isPending ? <p className="text-sm text-muted-foreground" role="status">Loading upcoming…</p> : upcoming.isError ? <button className="text-sm text-destructive" onClick={() => void upcoming.refetch()} type="button">Upcoming unavailable — Retry</button> : upcoming.data.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled in the next 30 days.</p> : <ul className="divide-y text-sm">{upcoming.data.slice(0, 3).map((item) => <li className="py-2" key={item.id}><p className="flex items-center gap-1.5 font-medium"><span>{item.title}</span><RecurringPaymentIcon recurrence={item.recurrence} /></p><p className="text-xs text-muted-foreground">{item.due_date} · {money(item.amount_minor)}</p></li>)}</ul>}
      <a className="mt-3 block text-sm font-medium text-primary" href={routeHref("/budgets", { ...state, planning: "upcoming" })} onClick={onAction}>View Planning upcoming</a>
    </RailCard>
    {workspaceTools && <RailCard title="Workspace tools">
      {workspaceTools.filters && <details className="group" onToggle={(event) => onFiltersOpenChange(event.currentTarget.open)} open={filtersOpen}><summary className="cursor-pointer text-sm font-medium">Filters</summary><div className="mt-3">{workspaceTools.filters}</div></details>}
      {workspaceTools.actions && <div className={`${workspaceTools.filters ? "mt-4 " : ""}[&_button]:w-full`}>{workspaceTools.actions}</div>}
    </RailCard>}
  </div>;
}
