import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { useOptionalWorkspaceRoute, useWorkspaceRoute } from "./WorkspaceRouteContext";
import type { RoutePath } from "./workspaceRouteState";

export type WorkspaceTools = { filters?: ReactNode; actions?: ReactNode };
type Entry = { path: RoutePath; tools: WorkspaceTools } | null;
type Store = { getSnapshot: () => Entry; subscribe: (listener: () => void) => () => void; set: (entry: Entry) => void };
const WorkspaceToolsContext = createContext<Store | null>(null);

export function WorkspaceToolsProvider({ children }: { children: ReactNode }) {
  const store = useRef<Store | null>(null);
  if (!store.current) {
    let entry: Entry = null;
    const listeners = new Set<() => void>();
    store.current = {
      getSnapshot: () => entry,
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      set: (next) => { entry = next; listeners.forEach((listener) => listener()); },
    };
  }
  return <WorkspaceToolsContext.Provider value={store.current}>{children}</WorkspaceToolsContext.Provider>;
}

export function useWorkspaceTools(tools: WorkspaceTools) {
  const store = useContext(WorkspaceToolsContext);
  const workspace = useOptionalWorkspaceRoute();
  const path = workspace?.state.path;
  useLayoutEffect(() => {
    if (!store || !path) return;
    store.set({ path, tools });
    return () => store.set(null);
  }, [path, store, tools]);
  return Boolean(store);
}

export function useRouteWorkspaceTools() {
  const store = useContext(WorkspaceToolsContext);
  const { state } = useWorkspaceRoute();
  const entry = useSyncExternalStore(store?.subscribe ?? (() => () => undefined), store?.getSnapshot ?? (() => null), () => null);
  return entry?.path === state.path ? entry.tools : null;
}
