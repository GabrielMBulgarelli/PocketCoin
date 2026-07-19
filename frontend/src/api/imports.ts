import { apiGet, apiJson } from "./client";

export type ImportMapping = {
  date_column: string;
  description_column: string;
  amount_mode: "signed" | "debit_credit";
  date_format: "iso" | "day_first" | "month_first";
  decimal_separator: "dot" | "comma";
  account_mode: "fixed" | "column";
  amount_column: string | null;
  debit_column: string | null;
  credit_column: string | null;
  financial_account_id: number | null;
  account_column: string | null;
  category_column: string | null;
  external_id_column: string | null;
};

export type ImportPreview = { preview_id: string; filename: string; encoding: string; delimiter: string; columns: string[]; sample_rows: Record<string, string>[]; mapping_suggestions: Record<string, string | null>; issues: string[] };
export type ImportRow = { row_number: number; transaction_date: string | null; description: string; amount_minor: number | null; direction: string | null; financial_account_name: string | null; category_name: string | null; external_id: string | null; duplicate: boolean; duplicate_reason: string | null; issues: string[]; eligible: boolean };
export type ImportValidation = { preview_id: string; total_rows: number; valid_count: number; duplicate_count: number; invalid_count: number; rows: ImportRow[] };
export type ImportSummary = { preview_id: string; status: string; imported_count: number; skipped_count: number; failed_count: number };
export type ImportHistory = { id: string; filename: string; status: "pending" | "committed" | "expired"; imported_count: number; skipped_count: number; failed_count: number; created_at: string; completed_at: string | null };

export const uploadImport = (file: File) => apiJson<ImportPreview>(`/api/imports/preview?filename=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "content-type": "text/csv" }, body: file });
export const validateImport = (id: string, mapping: ImportMapping) => apiJson<ImportValidation>(`/api/imports/${id}/validate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mapping) });
export const commitImport = (id: string, mapping: ImportMapping, selected: number[]) => apiJson<ImportSummary>(`/api/imports/${id}/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...mapping, selected_row_numbers: selected }) });
export const getImportHistory = (signal?: AbortSignal) => apiGet<ImportHistory[]>("/api/imports", { signal });
