import { useSyncExternalStore } from "react";

export type ApiHealthStatus = "checking" | "available" | "unavailable";

let status: ApiHealthStatus = "checking";
const listeners = new Set<() => void>();

function setStatus(next: ApiHealthStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener());
}

export const reportApiAvailable = () => setStatus("available");
export const reportApiUnavailable = () => setStatus("unavailable");
export const getApiHealthStatus = () => status;

export function useApiHealthStatus() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    getApiHealthStatus,
    getApiHealthStatus,
  );
}
