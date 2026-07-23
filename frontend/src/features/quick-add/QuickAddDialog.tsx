import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PlusIcon } from "lucide-react";
import { getCategories, getFinancialAccounts, getTags, saveCategory, saveTag, type Category, type Tag } from "../../api/referenceData";
import { createTransaction, createTransfer } from "../../api/transactions";
import { queryKeys } from "../../app/queryKeys";
import { invalidateFinancialQueries, mutationInvalidations } from "../../app/invalidateQueries";
import { localDateValue } from "../../lib/format";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";

type Mode = "expense" | "income" | "transfer";
type Props = { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (message: string) => void; defaultAccountId?: string; defaultTransferSourceId?: string };
type Values = { amount: string; date: string; description: string; accountId: string; categoryId: string; tagId: string; fromAccountId: string; toAccountId: string; notes: string; repeats: boolean; frequency: "weekly" | "monthly" | "yearly"; endMode: "never" | "date"; endDate: string; isDebt: boolean };

const control = "mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const today = localDateValue;
const initialValues = (accountId = "", fromAccountId = ""): Values => ({ amount: "", date: today(), description: "", accountId, categoryId: "", tagId: "", fromAccountId, toAccountId: "", notes: "", repeats: false, frequency: "monthly", endMode: "never", endDate: "", isDebt: false });
const transferAccountId = (value: string): number | null => value === "general" ? null : Number(value);

export function QuickAddDialog({ open, onOpenChange, onCreated, defaultAccountId = "", defaultTransferSourceId = "" }: Props) {
  const client = useQueryClient();
  const [mode, setMode] = useState<Mode>("expense");
  const [values, setValues] = useState<Values>(() => initialValues(defaultAccountId, defaultTransferSourceId));
  const wasOpen = useRef(false);
  const [error, setError] = useState("");
  const [referenceEditor, setReferenceEditor] = useState<"category" | "tag" | null>(null);
  const [referenceName, setReferenceName] = useState("");
  const needsCategories = mode !== "transfer";
  const supportsTags = mode === "expense" || mode === "income";
  const accounts = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: ({ signal }) => getFinancialAccounts(signal), enabled: open });
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: ({ signal }) => getCategories(signal), enabled: open && needsCategories });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: ({ signal }) => getTags(signal), enabled: open && supportsTags });
  useEffect(() => {
    if (open && !wasOpen.current) setValues(initialValues(defaultAccountId, defaultTransferSourceId));
    wasOpen.current = open;
  }, [defaultAccountId, defaultTransferSourceId, open]);
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
      setValues(initialValues(defaultAccountId, defaultTransferSourceId));
      setError("");
      onOpenChange(false);
      onCreated(`${label} added successfully.`);
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "The item could not be added."),
  });
  const referenceMutation = useMutation({
    mutationFn: () => referenceEditor === "category"
      ? saveCategory(null, { name: referenceName.trim(), direction: mode })
      : saveTag(null, { name: referenceName.trim() }),
    onSuccess: async (created) => {
      if (referenceEditor === "category") {
        client.setQueryData<Category[]>(queryKeys.categories, (current) => [...(current ?? []), created as Category]);
        update("categoryId", String(created.id));
      } else {
        client.setQueryData<Tag[]>(queryKeys.tags, (current) => [...(current ?? []), created as Tag]);
        update("tagId", String(created.id));
      }
      setReferenceEditor(null);
      setReferenceName("");
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "The reference could not be created."),
  });
  const update = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));
  const chooseMode = (next: Mode) => { setMode(next); setError(""); setValues((current) => ({ ...initialValues(defaultAccountId, next === "transfer" ? defaultTransferSourceId : ""), amount: current.amount, date: current.date, description: current.description, notes: current.notes })); };
  const submit = (event: FormEvent) => { event.preventDefault(); setError(""); mutation.mutate(); };
  const activeAccounts = accounts.data?.filter((item) => item.is_active) ?? [];
  const activeCategories = categories.data?.filter((item) => item.is_active && item.direction === mode) ?? [];
  const referencePending = accounts.isPending || (needsCategories && categories.isPending);
  const referenceError = accounts.isError || (needsCategories && categories.isError);

  const openReference = (type: "category" | "tag") => { setError(""); setReferenceName(""); setReferenceEditor(type); };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{referenceEditor ? `Add ${referenceEditor}` : "Quick add"}</DialogTitle><DialogDescription>{referenceEditor ? `Create a ${referenceEditor} and return to your preserved entry.` : "Record money movement without leaving your current workspace."}</DialogDescription></DialogHeader>
    {referenceEditor ? <form onSubmit={(event) => { event.preventDefault(); setError(""); if (referenceName.trim()) referenceMutation.mutate(); }}><label className="text-sm font-medium">{referenceEditor === "category" ? "Category name" : "Tag name"}<input autoFocus className={control} maxLength={120} onChange={(event) => setReferenceName(event.target.value)} required value={referenceName} /></label>{error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}<DialogFooter className="mt-6"><Button onClick={() => setReferenceEditor(null)} type="button" variant="outline">Cancel</Button><Button disabled={referenceMutation.isPending} type="submit">{referenceMutation.isPending ? "Creating…" : `Create ${referenceEditor}`}</Button></DialogFooter></form> : <>
    <div aria-label="Entry type" className="grid grid-cols-3 gap-2" role="group">{(["expense", "income", "transfer"] as const).map((item) => <Button key={item} aria-pressed={mode === item} onClick={() => chooseMode(item)} type="button" variant={mode === item ? "default" : "outline"}><span className="capitalize">{item}</span></Button>)}</div>
    {referencePending ? <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading accounts and categories…</p> : referenceError ? <p className="py-8 text-center text-sm text-destructive" role="alert">Reference data could not be loaded. Close and try again.</p> : <form onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Amount<input className={control} inputMode="decimal" min="0.01" onChange={(event) => update("amount", event.target.value)} required step="0.01" type="number" value={values.amount} /></label>
      <label className="text-sm font-medium">Date<input className={control} onChange={(event) => update("date", event.target.value)} required type="date" value={values.date} /></label>
      {mode === "transfer" ? <><label className="text-sm font-medium">From account<select className={control} onChange={(event) => update("fromAccountId", event.target.value)} required value={values.fromAccountId}><option value="">Select account</option><option value="general">General</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">To account<select className={control} onChange={(event) => update("toAccountId", event.target.value)} required value={values.toAccountId}><option value="">Select account</option><option value="general">General</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></> : <><label className="text-sm font-medium">Account<select aria-label="Account" className={control} onChange={(event) => update("accountId", event.target.value)} value={values.accountId}><option value="">General</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="text-sm font-medium"><label htmlFor="quick-category">Category</label><div className="flex items-end gap-2"><select id="quick-category" className={control} onChange={(event) => update("categoryId", event.target.value)} required value={values.categoryId}><option value="">Select {mode} category</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button aria-label="Add category" className="rounded-lg" onClick={() => openReference("category")} size="icon-lg" type="button" variant="outline"><PlusIcon /></Button></div></div></>}
      {supportsTags && <div className="text-sm font-medium sm:col-span-2"><label htmlFor="quick-tag">Tag</label><div className="flex items-end gap-2"><select id="quick-tag" className={control} disabled={tags.isError} onChange={(event) => update("tagId", event.target.value)} value={values.tagId}><option value="">No tag</option>{tags.data?.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button aria-label="Add tag" className="rounded-lg" disabled={tags.isError} onClick={() => openReference("tag")} size="icon-lg" type="button" variant="outline"><PlusIcon /></Button></div>{tags.isError && <span className="mt-2 block font-normal text-muted-foreground" role="status">Tags are unavailable. You can still add this transaction without one.</span>}</div>}
      {mode !== "transfer" && <><div className="grid gap-2 sm:col-span-2 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.repeats} onChange={(event) => update("repeats", event.target.checked)} /> Repeat this transaction</label>{mode === "expense" && <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.isDebt} onChange={(event) => update("isDebt", event.target.checked)} /> Debt payment</label>}</div>{values.repeats && <><label className="text-sm font-medium">Frequency<select aria-label="Frequency" className={control} value={values.frequency} onChange={(event) => update("frequency", event.target.value as Values["frequency"])}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label className="text-sm font-medium">Ends<select aria-label="Ends" className={control} value={values.endMode} onChange={(event) => update("endMode", event.target.value as Values["endMode"])}><option value="never">Never</option><option value="date">On date</option></select></label>{values.endMode === "date" && <label className="text-sm font-medium sm:col-span-2">End date<input aria-label="End date" className={control} min={values.date} onChange={(event) => update("endDate", event.target.value)} required type="date" value={values.endDate} /></label>}</>}</>}
      <label className="text-sm font-medium sm:col-span-2">Description<input className={control} maxLength={250} onChange={(event) => update("description", event.target.value)} required value={values.description} /></label>
      <label className="text-sm font-medium sm:col-span-2">Notes<textarea className="mt-1 min-h-20 w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={2000} onChange={(event) => update("notes", event.target.value)} value={values.notes} /></label>
    </div>{error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}<DialogFooter className="mt-6"><Button disabled={mutation.isPending} type="submit">{mutation.isPending ? "Adding…" : `Add ${mode}`}</Button></DialogFooter></form>}
    </>}
  </DialogContent></Dialog>;
}
