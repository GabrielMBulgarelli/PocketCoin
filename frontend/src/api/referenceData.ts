export type FinancialAccount = { id: number; name: string; kind: string; opening_balance_minor: number; opening_balance_date: string; credit_limit_minor: number | null; is_active: boolean };
export type Category = { id: number; name: string; direction: "income" | "expense"; is_default: boolean; is_active: boolean };
export type Tag = { id: number; name: string; is_active: boolean };

import { apiGet, apiJson } from "./client";

export const getFinancialAccounts = (signal?: AbortSignal) => apiGet<FinancialAccount[]>("/api/financial-accounts", { signal });
export const getCategories = (signal?: AbortSignal) => apiGet<Category[]>("/api/categories", { signal });
export const getTags = (signal?: AbortSignal) => apiGet<Tag[]>("/api/tags", { signal });
export const saveAccount = (id: number | null, data: object) => apiJson<FinancialAccount>(id ? `/api/financial-accounts/${id}` : "/api/financial-accounts", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
export const saveCategory = (id: number | null, data: object) => apiJson<Category>(id ? `/api/categories/${id}` : "/api/categories", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
export const saveTag = (id: number | null, data: object) => apiJson<Tag>(id ? `/api/tags/${id}` : "/api/tags", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
