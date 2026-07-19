import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { commitImport, getImportHistory, type ImportMapping, uploadImport, validateImport } from "../../api/imports";
import { getCategories, getFinancialAccounts } from "../../api/referenceData";
import { queryKeys } from "../../app/queryKeys";
import { invalidateFinancialQueries, mutationInvalidations } from "../../app/invalidateQueries";
import { Button } from "../../components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { formatMinor } from "../../lib/format";

const PAGE_SIZE = 50;
const control = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const emptyMapping: ImportMapping = { date_column: "", description_column: "", amount_mode: "signed", date_format: "iso", decimal_separator: "dot", account_mode: "fixed", amount_column: null, debit_column: null, credit_column: null, financial_account_id: null, account_column: null, category_column: null, external_id_column: null };

export function ImportView({ currency, locale }: { currency: string; locale: string }) {
  const client = useQueryClient();
  const accounts = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: ({ signal }) => getFinancialAccounts(signal) });
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: ({ signal }) => getCategories(signal) });
  const history = useQuery({ queryKey: queryKeys.imports, queryFn: ({ signal }) => getImportHistory(signal) });
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof uploadImport>> | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>(emptyMapping);
  const [validation, setValidation] = useState<Awaited<ReturnType<typeof validateImport>> | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof commitImport>> | null>(null);

  const upload = useMutation({ mutationFn: uploadImport, onSuccess: (data) => {
    const suggestion = data.mapping_suggestions;
    const debitMode = Boolean(suggestion.debit && suggestion.credit);
    setPreview(data); setValidation(null); setResult(null); setSelected(new Set()); setPage(0);
    setMapping({ ...emptyMapping, date_column: suggestion.date ?? "", description_column: suggestion.description ?? "", amount_mode: debitMode ? "debit_credit" : "signed", amount_column: suggestion.amount, debit_column: suggestion.debit, credit_column: suggestion.credit, financial_account_id: accounts.data?.find((item) => item.is_active)?.id ?? null, account_column: suggestion.account, category_column: suggestion.category, external_id_column: suggestion.external_id });
  } });
  const validate = useMutation({ mutationFn: () => validateImport(preview!.preview_id, mapping), onSuccess: (data) => { setValidation(data); setSelected(new Set(data.rows.filter((row) => row.eligible).map((row) => row.row_number))); setPage(0); } });
  const commit = useMutation({ mutationFn: () => commitImport(preview!.preview_id, mapping, [...selected]), onSuccess: async (data) => {
    setResult(data); setConfirming(false);
    await invalidateFinancialQueries(client, mutationInvalidations.imports);
  } });

  const visibleRows = validation?.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];
  const pages = Math.max(1, Math.ceil((validation?.total_rows ?? 0) / PAGE_SIZE));
  const eligible = useMemo(() => validation?.rows.filter((row) => row.eligible).map((row) => row.row_number) ?? [], [validation]);
  const columnOptions = preview?.columns ?? [];
  const set = <K extends keyof ImportMapping>(key: K, value: ImportMapping[K]) => { setMapping((current) => ({ ...current, [key]: value })); setValidation(null); setResult(null); };
  const error = upload.error ?? validate.error ?? commit.error;

  return <div className="space-y-6">
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end"><div><h2 className="font-semibold">1. Upload a statement</h2><p className="mt-1 text-sm text-muted-foreground">CSV only, up to 5 MiB and 10,000 rows. Supports comma, semicolon, or tab delimiters and UTF-8 or Windows-1252.</p></div><label className="block"><span className="sr-only">Choose CSV file</span><input accept=".csv,text/csv" className="block max-w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2" disabled={upload.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); }} type="file" /></label></div>
      {upload.isPending && <p className="mt-3 text-sm" role="status">Inspecting file…</p>}
      {preview && <div className="mt-4 rounded-lg bg-muted p-3 text-sm"><p className="font-medium">{preview.filename}</p><p className="text-muted-foreground">{preview.encoding} · {preview.delimiter === "\t" ? "tab" : `“${preview.delimiter}”`} delimiter · {preview.columns.length} columns</p>{preview.issues.map((issue) => <p className="mt-1" key={issue}>{issue}</p>)}</div>}
    </section>

    {preview && <section className="rounded-xl border bg-card p-5 shadow-sm"><h2 className="font-semibold">2. Map and validate</h2><p className="mt-1 text-sm text-muted-foreground">Choose one date and decimal convention for the entire file. Blank categories use the active default for each direction.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">Date column<select className={control} value={mapping.date_column} onChange={(e) => set("date_column", e.target.value)}><option value="">Choose…</option>{columnOptions.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-sm">Description column<select className={control} value={mapping.description_column} onChange={(e) => set("description_column", e.target.value)}><option value="">Choose…</option>{columnOptions.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-sm">Date format<select className={control} value={mapping.date_format} onChange={(e) => set("date_format", e.target.value as ImportMapping["date_format"])}><option value="iso">ISO (YYYY-MM-DD)</option><option value="day_first">Day first (DD/MM/YYYY)</option><option value="month_first">Month first (MM/DD/YYYY)</option></select></label>
        <label className="text-sm">Decimal separator<select className={control} value={mapping.decimal_separator} onChange={(e) => set("decimal_separator", e.target.value as "dot" | "comma")}><option value="dot">Dot decimal</option><option value="comma">Comma decimal</option></select></label>
        <label className="text-sm">Amount layout<select className={control} value={mapping.amount_mode} onChange={(e) => set("amount_mode", e.target.value as "signed" | "debit_credit")}><option value="signed">Signed amount</option><option value="debit_credit">Debit and credit</option></select></label>
        {mapping.amount_mode === "signed" ? <label className="text-sm">Amount column<select className={control} value={mapping.amount_column ?? ""} onChange={(e) => set("amount_column", e.target.value || null)}><option value="">Choose…</option>{columnOptions.map((c) => <option key={c}>{c}</option>)}</select></label> : <><label className="text-sm">Debit column<select className={control} value={mapping.debit_column ?? ""} onChange={(e) => set("debit_column", e.target.value || null)}><option value="">Choose…</option>{columnOptions.map((c) => <option key={c}>{c}</option>)}</select></label><label className="text-sm">Credit column<select className={control} value={mapping.credit_column ?? ""} onChange={(e) => set("credit_column", e.target.value || null)}><option value="">Choose…</option>{columnOptions.map((c) => <option key={c}>{c}</option>)}</select></label></>}
        <label className="text-sm">Account source<select className={control} value={mapping.account_mode} onChange={(e) => set("account_mode", e.target.value as "fixed" | "column")}><option value="fixed">One account</option><option value="column">Account column</option></select></label>
        {mapping.account_mode === "fixed" ? <label className="text-sm">Financial account<select className={control} value={mapping.financial_account_id ?? ""} onChange={(e) => set("financial_account_id", Number(e.target.value) || null)}><option value="">Choose…</option>{accounts.data?.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label> : <label className="text-sm">Account column<select className={control} value={mapping.account_column ?? ""} onChange={(e) => set("account_column", e.target.value || null)}><option value="">Choose…</option>{columnOptions.map((c) => <option key={c}>{c}</option>)}</select></label>}
        <label className="text-sm">Category column (optional)<select className={control} value={mapping.category_column ?? ""} onChange={(e) => set("category_column", e.target.value || null)}><option value="">Use defaults</option>{columnOptions.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-sm">External ID column (optional)<select className={control} value={mapping.external_id_column ?? ""} onChange={(e) => set("external_id_column", e.target.value || null)}><option value="">Use fingerprint</option>{columnOptions.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div><div className="mt-5 flex flex-wrap items-center gap-3"><Button disabled={validate.isPending || accounts.isPending || categories.isPending} onClick={() => validate.mutate()}>{validate.isPending ? "Validating…" : "Validate rows"}</Button><p className="text-xs text-muted-foreground">Accounts and categories must already exist and be active.</p></div>
    </section>}

    {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error.message}</p>}
    {validation && <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">3. Review and commit</h2><p className="mt-1 text-sm text-muted-foreground">{validation.valid_count} eligible · {validation.duplicate_count} duplicate · {validation.invalid_count} invalid</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setSelected(new Set(eligible))}>Select eligible</Button><Button variant="outline" onClick={() => setSelected(new Set())}>Clear</Button></div></div>
      <div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="p-3">Import</th><th className="p-3">Row</th><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Amount</th><th className="p-3">Account / category</th><th className="p-3">Status</th></tr></thead><tbody>{visibleRows.map((row) => <tr className="border-t align-top" key={row.row_number}><td className="p-3"><input aria-label={`Import row ${row.row_number}`} checked={selected.has(row.row_number)} disabled={!row.eligible} onChange={(e) => setSelected((current) => { const next = new Set(current); if (e.target.checked) next.add(row.row_number); else next.delete(row.row_number); return next; })} type="checkbox" /></td><td className="p-3">{row.row_number}</td><td className="p-3">{row.transaction_date ?? "—"}</td><td className="p-3">{row.description || "—"}</td><td className="p-3 tabular-nums">{row.amount_minor == null ? "—" : `${row.direction === "expense" ? "−" : "+"}${formatMinor(row.amount_minor, currency, locale, 2)}`}</td><td className="p-3">{row.financial_account_name ?? "—"}<br/><span className="text-muted-foreground">{row.category_name ?? "—"}</span></td><td className="max-w-72 p-3">{row.duplicate ? `Duplicate (${row.duplicate_reason?.replace("_", " ")})` : row.issues.length ? row.issues.join(" ") : "Ready"}</td></tr>)}</tbody></table></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button><span className="text-sm">Page {page + 1} of {pages}</span><Button variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div><Button disabled={!selected.size || commit.isPending} onClick={() => setConfirming(true)}>Commit {selected.size} rows</Button></div>
      {result && <div className="mt-4 rounded-lg bg-muted p-4" role="status"><p className="font-medium">Import complete</p><p className="text-sm text-muted-foreground">{result.imported_count} imported · {result.skipped_count} skipped · {result.failed_count} failed</p></div>}
    </section>}

    <section className="rounded-xl border bg-card p-5 shadow-sm"><h2 className="font-semibold">Import history</h2>{history.isPending ? <p className="mt-3 text-sm">Loading history…</p> : history.isError ? <p className="mt-3 text-sm text-destructive" role="alert">Could not load import history.</p> : history.data.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No imports yet.</p> : <ul className="mt-3 divide-y">{history.data.map((item) => <li className="flex flex-wrap justify-between gap-2 py-3 text-sm" key={item.id}><span><strong>{item.filename}</strong><br/><span className="text-muted-foreground">{new Date(item.created_at).toLocaleString(locale)}</span></span><span className="text-right capitalize">{item.status}<br/><span className="text-muted-foreground">{item.imported_count} imported · {item.skipped_count} skipped · {item.failed_count} failed</span></span></li>)}</ul>}</section>

    <AlertDialog open={confirming} onOpenChange={(open) => { if (!commit.isPending) setConfirming(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Commit selected transactions?</AlertDialogTitle><AlertDialogDescription>{selected.size} eligible rows will be inserted together. If any insert fails, none will be saved.</AlertDialogDescription></AlertDialogHeader>{commit.isError && <p className="text-sm text-destructive" role="alert">{commit.error instanceof Error ? commit.error.message : "The import could not be committed."}</p>}<AlertDialogFooter><AlertDialogCancel disabled={commit.isPending}>Review again</AlertDialogCancel><Button disabled={commit.isPending} onClick={() => commit.mutate()}>{commit.isPending ? "Importing…" : "Commit import"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
