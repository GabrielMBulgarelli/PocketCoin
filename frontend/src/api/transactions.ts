import { apiGet, apiJson, apiRequest } from "./client";

export type Transaction = { id: number; transaction_date: string; kind: "income" | "expense" | "transfer_in" | "transfer_out"; amount_minor: number; description: string; notes: string | null; category_id: number | null; financial_account_id: number | null; transfer_group_id: string | null; planned_payment_id: number | null; scheduled_for: string | null };
export type TransactionTimelineRow = Transaction & {
  row_type: "transaction" | "scheduled";
  recurrence: "weekly" | "monthly" | "yearly" | null;
  end_date: string | null;
  remaining_occurrences: number | null;
  is_debt_payment: boolean;
  needs_attention: boolean;
};

export type TransactionCreate = { financial_account_id: number | null; category_id: number; transaction_date: string; kind: "income" | "expense"; amount_minor: number; description: string; notes: string | null; tag_ids?: number[]; recurrence?: { frequency: "weekly" | "monthly" | "yearly"; end_date: string | null; is_debt_payment: boolean } };
export type TransferCreate = { from_account_id: number; to_account_id: number; transaction_date: string; amount_minor: number; description: string; notes: string | null };

export async function getTransactions(params: Record<string, string | number | boolean | undefined> = {}, signal?: AbortSignal): Promise<Transaction[]> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  return apiGet<Transaction[]>(`/api/transactions?${search}`, { signal });
}

export async function getTransactionTimeline(params: Record<string, string | number | boolean | undefined> = {}, signal?: AbortSignal): Promise<TransactionTimelineRow[]> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  return apiGet<TransactionTimelineRow[]>(`/api/transactions-timeline?${search}`, { signal });
}

export async function exportTransactions(params: Record<string, string | number | boolean | undefined> = {}): Promise<void> {
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

export const deleteTransaction = (id: number, scope: "this_occurrence" | "this_and_future" = "this_occurrence") => apiJson<void>(`/api/transactions/${id}?scope=${scope}`, { method: "DELETE" });

export const updateTransaction = (id: number, data: object, scope: "this_occurrence" | "this_and_future" = "this_occurrence") => apiJson<Transaction>(`/api/transactions/${id}?scope=${scope}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const createTransaction = (data: TransactionCreate) => apiJson<Transaction>("/api/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const createTransfer = (data: TransferCreate) => apiJson<Transaction[]>("/api/transfers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
