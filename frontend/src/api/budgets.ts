import { apiGet, apiJson } from "./client";

export type Budget = { id: number; category_id: number; month: string; limit_minor: number; created_at: string; updated_at: string };
export type BudgetProgress = Budget & { category_name: string; spent_minor: number; remaining_minor: number; progress_ratio: number };

const jsonHeaders = { "Content-Type": "application/json" };
export const createBudget = (data: { category_id: number; month: string; limit_minor: number }) => apiJson<Budget>("/api/budgets", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) });
export const updateBudget = (id: number, limit_minor: number) => apiJson<Budget>(`/api/budgets/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ limit_minor }) });
export const deleteBudget = (id: number) => apiJson<void>(`/api/budgets/${id}`, { method: "DELETE" });
export const getBudgetProgress = (month: string, signal?: AbortSignal) => apiGet<BudgetProgress[]>(`/api/dashboard/budget-progress?end_date=${encodeURIComponent(month)}`, { signal });
