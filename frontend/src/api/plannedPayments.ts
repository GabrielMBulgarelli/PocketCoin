import { apiGet, apiJson } from "./client";
import type { Transaction } from "./transactions";

export type PaymentDirection = "income" | "expense";
export type PaymentRecurrence = "none" | "weekly" | "monthly" | "yearly";
export type PaymentStatus = "pending" | "paid" | "cancelled" | "completed";
export type PlannedPayment = {
  id: number; title: string; amount_minor: number; direction: PaymentDirection; due_date: string;
  status: PaymentStatus; recurrence: PaymentRecurrence; is_debt_payment: boolean; notes: string | null;
  financial_account_id: number | null; category_id: number | null; last_paid_due_date: string | null;
  last_transaction_id: number | null; created_at: string; updated_at: string; end_date: string | null;
  needs_attention: boolean;
};
export type PlannedPaymentInput = Pick<PlannedPayment, "title" | "amount_minor" | "direction" | "due_date" | "recurrence" | "is_debt_payment" | "notes" | "financial_account_id" | "category_id">;
export type MarkPaidResult = { payment: PlannedPayment; transaction: Transaction | null };

const jsonHeaders = { "Content-Type": "application/json" };
export const getPlannedPayments = (signal?: AbortSignal) => apiGet<PlannedPayment[]>("/api/planned-payments", { signal });
export const createPlannedPayment = (data: PlannedPaymentInput) => apiJson<PlannedPayment>("/api/planned-payments", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) });
export const updatePlannedPayment = (id: number, data: Partial<PlannedPaymentInput> & { status?: PaymentStatus }, scope: "this_occurrence" | "this_and_future" = "this_and_future") => apiJson<PlannedPayment>(`/api/planned-payments/${id}?scope=${scope}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data) });
export const deletePlannedPayment = (id: number) => apiJson<void>(`/api/planned-payments/${id}`, { method: "DELETE" });
export const markPlannedPaymentPaid = (id: number, expectedDueDate: string) => apiJson<MarkPaidResult>(`/api/planned-payments/${id}/mark-paid`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ expected_due_date: expectedDueDate }) });
export const materializeDueRecurrences = () => apiJson<{ created_count: number }>("/api/recurrences/materialize-due", { method: "POST" });
export const skipRecurrenceOccurrence = (id: number) => apiJson<PlannedPayment>(`/api/recurrences/${id}/skip`, { method: "POST" });
export const cancelRecurrence = (id: number) => apiJson<PlannedPayment>(`/api/recurrences/${id}/cancel`, { method: "POST" });
