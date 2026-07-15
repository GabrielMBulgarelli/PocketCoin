import { getApiErrorMessage } from "./error";

export type Settings = {
  base_currency: string;
  locale: string;
  first_day_of_week: "monday" | "sunday";
  theme: "system" | "light" | "dark";
};

export async function getSettings(): Promise<Settings> {
  const response = await fetch("/api/settings");
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.json() as Promise<Settings>;
}

export async function updateSettings(settings: Settings): Promise<Settings> {
  const response = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.json() as Promise<Settings>;
}
