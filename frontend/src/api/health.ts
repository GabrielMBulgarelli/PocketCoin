export type HealthResponse = {
  status: "ok";
};

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error("The local API did not respond successfully.");
  }

  return (await response.json()) as HealthResponse;
}
