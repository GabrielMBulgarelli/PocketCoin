import { getApiErrorMessage } from "./error";
import type { Transaction } from "./transactions";

export type PaymentDirection = "income" | "expense";
export type PaymentRecurrence = "none" | "weekly" | "monthly" | "yearly";
export type PaymentStatus = "pending" | "paid" | "cancelled";
export type PlannedPayment = {
  id: number; title: string; amount_minor: number; direction: PaymentDirection; due_date: string;
  status: PaymentStatus; recurrence: PaymentRecurrence; is_debt_payment: boolean; notes: string | null;
  financial_account_id: number | null; category_id: number | null; last_paid_due_date: string | null;
  last_transaction_id: number | null; created_at: string; updated_at: string;
};
export type PlannedPaymentInput = Pick<PlannedPayment, "title" | "amount_minor" | "direction" | "due_date" | "recurrence" | "is_debt_payment" | "notes" | "financial_account_id" | "category_id">;
export type MarkPaidResult = { payment: PlannedPayment; transaction: Transaction | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const getPlannedPayments = () => request<PlannedPayment[]>("/api/planned-payments");
export const createPlannedPayment = (data: PlannedPaymentInput) => request<PlannedPayment>("/api/planned-payments", { method: "POST", body: JSON.stringify(data) });
export const updatePlannedPayment = (id: number, data: Partial<PlannedPaymentInput> & { status?: PaymentStatus }) => request<PlannedPayment>(`/api/planned-payments/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deletePlannedPayment = (id: number) => request<void>(`/api/planned-payments/${id}`, { method: "DELETE" });
export const markPlannedPaymentPaid = (id: number, expectedDueDate: string) => request<MarkPaidResult>(`/api/planned-payments/${id}/mark-paid`, { method: "POST", body: JSON.stringify({ expected_due_date: expectedDueDate }) });
