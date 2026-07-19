import { getApiErrorMessage } from "./error";
import { reportApiUnavailable } from "./healthState";

export type ApiErrorKind = "network" | "http" | "aborted";

export class ApiRequestError extends Error {
  constructor(public readonly kind: ApiErrorKind, message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function normalizedError(error: unknown, signal?: AbortSignal): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return new ApiRequestError("aborted", "Request cancelled.");
  }
  reportApiUnavailable();
  return new ApiRequestError("network", "Local API is unavailable. PocketCoin will retry automatically.");
}

export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    const response = await fetch(path, init);
    if (!response.ok) throw new ApiRequestError("http", await getApiErrorMessage(response), response.status);
    return response;
  } catch (error) {
    throw normalizedError(error, init.signal ?? undefined);
  }
}

export async function apiGet<T>(path: string, options: { signal?: AbortSignal } = {}): Promise<T> {
  const response = await apiRequest(path, { signal: options.signal });
  return response.json() as Promise<T>;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiRequest(path, init);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export function shouldRetryQuery(failureCount: number, error: unknown) {
  return failureCount < 1 && error instanceof ApiRequestError && (
    error.kind === "network" || (error.kind === "http" && (error.status ?? 0) >= 500)
  );
}

export const queryRetryDelay = () => 400;
