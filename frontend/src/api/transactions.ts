export type Transaction = { id: number; transaction_date: string; kind: string; amount_minor: number; description: string; category_id: number | null; financial_account_id: number };

export async function getTransactions(params: Record<string, string | number | undefined> = {}): Promise<Transaction[]> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const response = await fetch(`/api/transactions?${search}`);
  if (!response.ok) throw new Error("The local transactions could not be loaded.");
  return response.json() as Promise<Transaction[]>;
}

export async function deleteTransaction(id: number): Promise<void> {
  const response = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error("The transaction could not be deleted.");
}

export async function updateTransaction(id: number, data: object): Promise<Transaction> {
  const response = await fetch(`/api/transactions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error("The transaction could not be saved.");
  return response.json() as Promise<Transaction>;
}
