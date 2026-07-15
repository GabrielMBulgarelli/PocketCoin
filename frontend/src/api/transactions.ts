import { getApiErrorMessage } from "./error";

export type Transaction = { id: number; transaction_date: string; kind: "income" | "expense" | "transfer_in" | "transfer_out"; amount_minor: number; description: string; notes: string | null; category_id: number | null; financial_account_id: number; transfer_group_id: string | null };

export type TransactionCreate = { financial_account_id: number; category_id: number; transaction_date: string; kind: "income" | "expense"; amount_minor: number; description: string; notes: string | null; tag_ids?: number[] };
export type TransferCreate = { from_account_id: number; to_account_id: number; transaction_date: string; amount_minor: number; description: string; notes: string | null };

export async function getTransactions(params: Record<string, string | number | undefined> = {}): Promise<Transaction[]> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const response = await fetch(`/api/transactions?${search}`);
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.json() as Promise<Transaction[]>;
}

export async function exportTransactions(params: Record<string, string | number | undefined> = {}): Promise<void> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const response = await fetch(`/api/transactions/export.csv?${search}`);
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "pocketcoin-transactions.csv";
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export async function deleteTransaction(id: number): Promise<void> {
  const response = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
}

export async function updateTransaction(id: number, data: object): Promise<Transaction> {
  const response = await fetch(`/api/transactions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.json() as Promise<Transaction>;
}

export async function createTransaction(data: TransactionCreate): Promise<Transaction> {
  const response = await fetch("/api/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.json() as Promise<Transaction>;
}

export async function createTransfer(data: TransferCreate): Promise<Transaction[]> {
  const response = await fetch("/api/transfers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.json() as Promise<Transaction[]>;
}
