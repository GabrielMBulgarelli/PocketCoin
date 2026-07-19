import { apiGet, apiJson } from "./client";

export type Settings = {
  base_currency: string;
  locale: string;
  first_day_of_week: "monday" | "sunday";
  theme: "system" | "light" | "dark";
};

export const getSettings = (signal?: AbortSignal) => apiGet<Settings>("/api/settings", { signal });

export async function updateSettings(settings: Settings): Promise<Settings> {
  return apiJson<Settings>("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
}
