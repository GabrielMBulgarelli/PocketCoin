import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getCategories, getFinancialAccounts, getTags } from "../../api/referenceData";
import { createTransaction, createTransfer } from "../../api/transactions";
import { queryKeys } from "../../app/queryKeys";
import { invalidateFinancialQueries, mutationInvalidations } from "../../app/invalidateQueries";
import { localDateValue } from "../../lib/format";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";

type Mode = "expense" | "income" | "transfer";
type Props = { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (message: string) => void };
type Values = { amount: string; date: string; description: string; accountId: string; categoryId: string; tagId: string; fromAccountId: string; toAccountId: string; notes: string; repeats: boolean; frequency: "weekly" | "monthly" | "yearly"; endMode: "never" | "date"; endDate: string; isDebt: boolean };

const control = "mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const today = localDateValue;
const initialValues = (): Values => ({ amount: "", date: today(), description: "", accountId: "", categoryId: "", tagId: "", fromAccountId: "", toAccountId: "", notes: "", repeats: false, frequency: "monthly", endMode: "never", endDate: "", isDebt: false });
const transferAccountId = (value: string): number | null => value === "general" ? null : Number(value);

export function QuickAddDialog({ open, onOpenChange, onCreated }: Props) {
  const client = useQueryClient();
  const [mode, setMode] = useState<Mode>("expense");
  const [values, setValues] = useState<Values>(initialValues);
  const [error, setError] = useState("");
  const needsCategories = mode !== "transfer";
  const supportsTags = mode === "expense" || mode === "income";
  const accounts = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: ({ signal }) => getFinancialAccounts(signal), enabled: open });
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: ({ signal }) => getCategories(signal), enabled: open && needsCategories });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: ({ signal }) => getTags(signal), enabled: open && supportsTags });
  const mutation = useMutation({
    mutationFn: async () => {
      const amountMinor = Math.round(Number(values.amount) * 100);
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error("Enter an amount greater than zero.");
      if (!values.description.trim()) throw new Error("Enter a description.");
      const shared = { amount_minor: amountMinor, transaction_date: values.date, description: values.description.trim(), notes: values.notes.trim() || null };
      if (mode === "transfer") {
        if (!values.fromAccountId || !values.toAccountId) throw new Error("Choose both transfer accounts.");
        if (values.fromAccountId === values.toAccountId) throw new Error("Choose two different accounts.");
        return createTransfer({ ...shared, from_account_id: transferAccountId(values.fromAccountId), to_account_id: transferAccountId(values.toAccountId) });
      }
      if (!values.categoryId) throw new Error("Choose a category.");
      if (values.repeats && values.endMode === "date" && !values.endDate) throw new Error("Choose an end date.");
      return createTransaction({ ...shared, kind: mode, financial_account_id: values.accountId ? Number(values.accountId) : null, category_id: Number(values.categoryId), is_debt_payment: mode === "expense" && values.isDebt, tag_ids: values.tagId ? [Number(values.tagId)] : [], recurrence: values.repeats ? { frequency: values.frequency, end_date: values.endMode === "date" ? values.endDate : null } : undefined });
    },
    onSuccess: async () => {
      await invalidateFinancialQueries(client, mutationInvalidations.transactions);
      const label = mode === "transfer" ? "Transfer" : mode === "income" ? "Income" : "Expense";
      setValues(initialValues());
      setError("");
      onOpenChange(false);
      onCreated(`${label} added successfully.`);
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "The item could not be added."),
  });
  const update = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));
  const chooseMode = (next: Mode) => { setMode(next); setError(""); setValues((current) => ({ ...initialValues(), amount: current.amount, date: current.date, description: current.description, notes: current.notes })); };
  const submit = (event: FormEvent) => { event.preventDefault(); setError(""); mutation.mutate(); };
  const activeAccounts = accounts.data?.filter((item) => item.is_active) ?? [];
  const activeCategories = categories.data?.filter((item) => item.is_active && item.direction === mode) ?? [];
  const referencePending = accounts.isPending || (needsCategories && categories.isPending);
  const referenceError = accounts.isError || (needsCategories && categories.isError);

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Quick add</DialogTitle><DialogDescription>Record money movement without leaving your current workspace.</DialogDescription></DialogHeader>
    <div aria-label="Entry type" className="grid grid-cols-3 gap-2" role="group">{(["expense", "income", "transfer"] as const).map((item) => <Button key={item} aria-pressed={mode === item} onClick={() => chooseMode(item)} type="button" variant={mode === item ? "default" : "outline"}><span className="capitalize">{item}</span></Button>)}</div>
    {referencePending ? <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading accounts and categories…</p> : referenceError ? <p className="py-8 text-center text-sm text-destructive" role="alert">Reference data could not be loaded. Close and try again.</p> : <form onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Amount<input className={control} inputMode="decimal" min="0.01" onChange={(event) => update("amount", event.target.value)} required step="0.01" type="number" value={values.amount} /></label>
      <label className="text-sm font-medium">Date<input className={control} onChange={(event) => update("date", event.target.value)} required type="date" value={values.date} /></label>
      {mode === "transfer" ? <><label className="text-sm font-medium">From account<select className={control} onChange={(event) => update("fromAccountId", event.target.value)} required value={values.fromAccountId}><option value="">Select account</option><option value="general">General — no specific account</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">To account<select className={control} onChange={(event) => update("toAccountId", event.target.value)} required value={values.toAccountId}><option value="">Select account</option><option value="general">General — no specific account</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></> : <><label className="text-sm font-medium">Account <span className="font-normal text-muted-foreground">(optional)</span><select className={control} onChange={(event) => update("accountId", event.target.value)} value={values.accountId}><option value="">General — no specific account</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">Category<select className={control} onChange={(event) => update("categoryId", event.target.value)} required value={values.categoryId}><option value="">Select {mode} category</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
      {supportsTags && <label className="text-sm font-medium sm:col-span-2">Tag <span className="font-normal text-muted-foreground">(optional)</span><select className={control} disabled={tags.isError} onChange={(event) => update("tagId", event.target.value)} value={values.tagId}><option value="">No tag</option>{tags.data?.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{tags.isError && <span className="mt-2 block font-normal text-muted-foreground" role="status">Tags are unavailable. You can still add this transaction without one.</span>}</label>}
      {mode !== "transfer" && <><div className="grid gap-2 sm:col-span-2 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.repeats} onChange={(event) => update("repeats", event.target.checked)} /> Repeat this transaction</label>{mode === "expense" && <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.isDebt} onChange={(event) => update("isDebt", event.target.checked)} /> Debt payment</label>}</div>{values.repeats && <><label className="text-sm font-medium">Frequency<select aria-label="Frequency" className={control} value={values.frequency} onChange={(event) => update("frequency", event.target.value as Values["frequency"])}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label className="text-sm font-medium">Ends<select aria-label="Ends" className={control} value={values.endMode} onChange={(event) => update("endMode", event.target.value as Values["endMode"])}><option value="never">Never</option><option value="date">On date</option></select></label>{values.endMode === "date" && <label className="text-sm font-medium sm:col-span-2">End date<input aria-label="End date" className={control} min={values.date} onChange={(event) => update("endDate", event.target.value)} required type="date" value={values.endDate} /></label>}</>}</>}
      <label className="text-sm font-medium sm:col-span-2">Description<input className={control} maxLength={250} onChange={(event) => update("description", event.target.value)} required value={values.description} /></label>
      <label className="text-sm font-medium sm:col-span-2">Notes<textarea className="mt-1 min-h-20 w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={2000} onChange={(event) => update("notes", event.target.value)} value={values.notes} /></label>
    </div>{error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}<DialogFooter className="mt-6"><Button disabled={mutation.isPending} type="submit">{mutation.isPending ? "Adding…" : `Add ${mode}`}</Button></DialogFooter></form>}
  </DialogContent></Dialog>;
}
