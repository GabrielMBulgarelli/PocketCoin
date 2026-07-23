import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getFinancialAccounts, type FinancialAccount } from "../api/referenceData";
import { queryKeys } from "./queryKeys";
import {
  canonicalizeWorkspaceHash,
  resolveEffectiveScope,
  routeHref,
  type AccountScope,
  type RoutePath,
  type WorkspaceRouteState,
} from "./workspaceRouteState";

type RouteUpdateOptions = { replace?: boolean };

type WorkspaceRouteContextValue = {
  accounts: UseQueryResult<FinancialAccount[], Error>;
  state: WorkspaceRouteState;
  href: (path: RoutePath) => string;
  update: (patch: Partial<WorkspaceRouteState>, options?: RouteUpdateOptions) => void;
  selectAccount: (account: AccountScope) => void;
};

const WorkspaceRouteContext = createContext<WorkspaceRouteContextValue | null>(null);

export function WorkspaceRouteProvider({ children }: { children: ReactNode }) {
  const accounts = useQuery({
    queryKey: queryKeys.financialAccounts,
    queryFn: ({ signal }) => getFinancialAccounts(signal),
  });
  const accountCatalog = accounts.data;
  const [state, setState] = useState(() => canonicalizeWorkspaceHash(window.location.hash).state);

  const readAndCanonicalize = useCallback((hash: string) => {
    const canonical = canonicalizeWorkspaceHash(hash, accountCatalog);
    if (canonical.changed) {
      window.history.replaceState(window.history.state, "", canonical.hash);
    }
    setState(canonical.state);
  }, [accountCatalog]);

  useEffect(() => {
    readAndCanonicalize(window.location.hash);
    const sync = () => readAndCanonicalize(window.location.hash);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [readAndCanonicalize]);

  const update = useCallback((patch: Partial<WorkspaceRouteState>, options?: RouteUpdateOptions) => {
    const path = patch.path ?? state.path;
    const account = patch.account ?? state.account;
    const candidate: WorkspaceRouteState = {
      ...state,
      ...patch,
      path,
      account,
      scope: resolveEffectiveScope(account, path, accountCatalog, patch.analysis ?? state.analysis),
    };
    const target = routeHref(path, candidate);
    if (window.location.hash === target) {
      return;
    }
    if (options?.replace) {
      window.history.replaceState(window.history.state, "", target);
      readAndCanonicalize(target);
      return;
    }
    window.location.hash = target.slice(1);
  }, [accountCatalog, readAndCanonicalize, state]);

  const value = useMemo<WorkspaceRouteContextValue>(() => ({
    accounts,
    state,
    href: (path) => routeHref(path, state),
    update,
    selectAccount: (account) => update({ account }),
  }), [accounts, state, update]);

  return <WorkspaceRouteContext.Provider value={value}>{children}</WorkspaceRouteContext.Provider>;
}

export function useWorkspaceRoute() {
  const value = useContext(WorkspaceRouteContext);
  if (!value) throw new Error("useWorkspaceRoute must be used inside WorkspaceRouteProvider");
  return value;
}

export function useOptionalWorkspaceRoute() {
  return useContext(WorkspaceRouteContext);
}
