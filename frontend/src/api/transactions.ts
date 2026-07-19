import { apiGet, apiJson, apiRequest } from "./client";

export type Transaction = { id: number; transaction_date: string; kind: "income" | "expense" | "transfer_in" | "transfer_out"; amount_minor: number; description: string; notes: string | null; category_id: number | null; financial_account_id: number; transfer_group_id: string | null };

export type TransactionCreate = { financial_account_id: number; category_id: number; transaction_date: string; kind: "income" | "expense"; amount_minor: number; description: string; notes: string | null; tag_ids?: number[] };
export type TransferCreate = { from_account_id: number; to_account_id: number; transaction_date: string; amount_minor: number; description: string; notes: string | null };

export async function getTransactions(params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<Transaction[]> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  return apiGet<Transaction[]>(`/api/transactions?${search}`, { signal });
}

export async function exportTransactions(params: Record<string, string | number | undefined> = {}): Promise<void> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const response = await apiRequest(`/api/transactions/export.csv?${search}`);
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "pocketcoin-transactions.csv";
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export const deleteTransaction = (id: number) => apiJson<void>(`/api/transactions/${id}`, { method: "DELETE" });

export const updateTransaction = (id: number, data: object) => apiJson<Transaction>(`/api/transactions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const createTransaction = (data: TransactionCreate) => apiJson<Transaction>("/api/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const createTransfer = (data: TransferCreate) => apiJson<Transaction[]>("/api/transfers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
