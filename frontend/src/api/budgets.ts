import { getApiErrorMessage } from "./error";

export type Budget = { id: number; category_id: number; month: string; limit_minor: number; created_at: string; updated_at: string };
export type BudgetProgress = Budget & { category_name: string; spent_minor: number; remaining_minor: number; progress_ratio: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const createBudget = (data: { category_id: number; month: string; limit_minor: number }) => request<Budget>("/api/budgets", { method: "POST", body: JSON.stringify(data) });
export const updateBudget = (id: number, limit_minor: number) => request<Budget>(`/api/budgets/${id}`, { method: "PATCH", body: JSON.stringify({ limit_minor }) });
export const deleteBudget = (id: number) => request<void>(`/api/budgets/${id}`, { method: "DELETE" });
export const getBudgetProgress = (month: string) => request<BudgetProgress[]>(`/api/dashboard/budget-progress?end_date=${encodeURIComponent(month)}`);
