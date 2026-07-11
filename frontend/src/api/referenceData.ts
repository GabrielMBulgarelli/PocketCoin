export type FinancialAccount = { id: number; name: string; kind: string; is_active: boolean };
export type Category = { id: number; name: string; direction: "income" | "expense"; is_active: boolean };
export type Tag = { id: number; name: string; is_active: boolean };

import { getApiErrorMessage } from "./error";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.json() as Promise<T>;
}

export const getFinancialAccounts = () => request<FinancialAccount[]>("/api/financial-accounts");
export const getCategories = () => request<Category[]>("/api/categories");
export const getTags = () => request<Tag[]>("/api/tags");
export const saveAccount = (id: number | null, data: object) => request<FinancialAccount>(id ? `/api/financial-accounts/${id}` : "/api/financial-accounts", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
export const saveCategory = (id: number | null, data: object) => request<Category>(id ? `/api/categories/${id}` : "/api/categories", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
export const saveTag = (id: number | null, data: object) => request<Tag>(id ? `/api/tags/${id}` : "/api/tags", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
