import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getHealth } from "../api/health";
import { useApiHealthStatus } from "../api/healthState";
import { getSettings } from "../api/settings";
import { materializeDueRecurrences } from "../api/plannedPayments";
import { CategoriesTagsView } from "../features/categories/CategoriesTagsView";
import { DashboardView } from "../features/dashboard/DashboardView";
import { FinancialAccountsView } from "../features/financial-accounts/FinancialAccountsView";
import { TransactionsView } from "../features/transactions/TransactionsView";
import { QuickAddDialog } from "../features/quick-add/QuickAddDialog";
import { ImportView } from "../features/imports/ImportView";
import { ReportsView } from "../features/reports/ReportsView";
import { SettingsView } from "../features/settings/SettingsView";
import { queryKeys } from "./queryKeys";
import { WorkspaceRouteProvider, useWorkspaceRoute } from "./WorkspaceRouteContext";
import { routeMetadata, type RoutePath } from "./workspaceRouteState";
import { WorkspaceShell } from "./WorkspaceShell";
import type { Settings } from "../api/settings";
import { BackupControllerProvider } from "./BackupControllerContext";
import { WorkspaceToolsProvider } from "./WorkspaceToolsContext";

export function App() {
  return <WorkspaceRouteProvider><AppRuntime /></WorkspaceRouteProvider>;
}

function AppRuntime() {
  const { accounts, state: routeState } = useWorkspaceRoute();
  const path = routeState.path;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const queryClient = useQueryClient();
  const apiHealth = useApiHealthStatus();
  const previousHealth = useRef(apiHealth);
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const lastMaterializedDay = useRef("");
  const materializationInFlight = useRef(false);
  const { isPending: isHealthPending, refetch: refetchHealth } = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth(signal),
  });
  const settingsQuery = useQuery({ queryKey: queryKeys.settings, queryFn: ({ signal }) => getSettings(signal) });
  useEffect(() => {
    const interval = window.setInterval(() => { void refetchHealth(); }, apiHealth === "unavailable" ? 5_000 : 30_000);
    return () => window.clearInterval(interval);
  }, [apiHealth, refetchHealth]);
  useEffect(() => {
    if (previousHealth.current === "unavailable" && apiHealth === "available") {
      setRecoveryNotice(true);
      window.setTimeout(() => setRecoveryNotice(false), 4_000);
      materializationInFlight.current = true;
      void materializeDueRecurrences().then(async ({ created_count }) => {
        lastMaterializedDay.current = new Date().toLocaleDateString("en-CA");
        if (created_count > 0) await queryClient.invalidateQueries();
      }).catch(() => undefined).finally(() => { materializationInFlight.current = false; });
      void queryClient.refetchQueries({
        type: "active",
        predicate: (query) => query.queryKey[0] !== queryKeys.health[0] && query.state.status === "error",
      });
    }
    previousHealth.current = apiHealth;
  }, [apiHealth, queryClient]);
  useEffect(() => {
    if (apiHealth !== "available") return;
    const syncForToday = () => {
      const today = new Date().toLocaleDateString("en-CA");
      if (lastMaterializedDay.current === today || materializationInFlight.current) return;
      materializationInFlight.current = true;
      void materializeDueRecurrences().then(async ({ created_count }) => {
        lastMaterializedDay.current = today;
        if (created_count > 0) await queryClient.invalidateQueries();
      }).catch(() => undefined).finally(() => { materializationInFlight.current = false; });
    };
    syncForToday();
    const interval = window.setInterval(syncForToday, 60_000);
    return () => window.clearInterval(interval);
  }, [apiHealth, queryClient]);
  useEffect(() => { const theme = settingsQuery.data?.theme ?? "system"; const media = window.matchMedia?.("(prefers-color-scheme: dark)"); const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && Boolean(media?.matches))); apply(); if (theme === "system") media?.addEventListener("change", apply); return () => media?.removeEventListener("change", apply); }, [settingsQuery.data?.theme]);

  const status = apiHealth === "checking" && isHealthPending
    ? "Checking local API…"
    : apiHealth === "unavailable"
      ? "Local API is unavailable"
      : recoveryNotice
        ? "Local API connection restored."
        : "Local API is available";

  const title = routeMetadata[path].title;
  const currency = settingsQuery.data?.base_currency ?? "USD";
  const locale = settingsQuery.data?.locale ?? "en-US";
  const requestedAccountId = routeState.account.kind === "account" ? routeState.account.accountId : undefined;
  const selectedAccount = requestedAccountId
    ? accounts.data?.find((account) => account.id === requestedAccountId)
    : undefined;
  const activeSelectedAccount = selectedAccount?.is_active ? String(selectedAccount.id) : "";
  const quickAddAccountId = activeSelectedAccount;
  const quickAddTransferSourceId = routeState.account.kind === "general" ? "general" : activeSelectedAccount;
  return <WorkspaceToolsProvider><BackupControllerProvider onSuccess={() => setFeedback("Backup created successfully.")}><WorkspaceShell currency={currency} feedback={feedback} locale={locale} onQuickAdd={() => { setFeedback(""); setQuickAddOpen(true); }} outage={apiHealth === "unavailable"} status={status} title={title}>
    <RouteOutlet currency={currency} locale={locale} path={path} settings={settingsQuery.data} settingsError={settingsQuery.isError} settingsLoading={settingsQuery.isPending} />
    <QuickAddDialog defaultAccountId={quickAddAccountId} defaultTransferSourceId={quickAddTransferSourceId} open={quickAddOpen} onOpenChange={setQuickAddOpen} onCreated={setFeedback} />
  </WorkspaceShell></BackupControllerProvider></WorkspaceToolsProvider>;
}

function RouteOutlet({ currency, locale, path, settings, settingsError, settingsLoading }: { currency: string; locale: string; path: RoutePath; settings?: Settings; settingsError: boolean; settingsLoading: boolean }) {
  if (path === "/dashboard") return <DashboardView currency={currency} locale={locale} />;
  if (path === "/financial-accounts") return <FinancialAccountsView currency={currency} locale={locale} />;
  if (path === "/categories") return <CategoriesTagsView />;
  if (path === "/transactions") return <TransactionsView currency={currency} locale={locale} />;
  if (path === "/import") return <ImportView currency={currency} locale={locale} />;
  if (path === "/reports") return <ReportsView currency={currency} locale={locale} />;
  return <SettingsView settings={settings} loading={settingsLoading} loadError={settingsError} />;
}
