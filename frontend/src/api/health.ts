export type HealthResponse = {
  status: "ok";
};

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  try {
    const health = await apiGet<HealthResponse>("/api/health", { signal });
    reportApiAvailable();
    return health;
  } catch (error) {
    reportApiUnavailable();
    throw error;
  }
}
import { apiGet } from "./client";
import { reportApiAvailable, reportApiUnavailable } from "./healthState";
