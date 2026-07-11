export type Settings = {
  base_currency: string;
  locale: string;
  theme: "system" | "light" | "dark";
};

export async function getSettings(): Promise<Settings> {
  const response = await fetch("/api/settings");
  if (!response.ok) throw new Error("The local settings could not be loaded.");
  return response.json() as Promise<Settings>;
}
