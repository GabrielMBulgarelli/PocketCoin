import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBudget, deleteBudget, getBudgetProgress, updateBudget, type BudgetProgress } from "../../api/budgets";
import { getCategories } from "../../api/referenceData";
import { queryKeys } from "../../app/queryKeys";
import { invalidateFinancialQueries, mutationInvalidations } from "../../app/invalidateQueries";
import { localMonthValue } from "../../lib/format";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { formatMinor } from "../../lib/format";
import { useOptionalWorkspaceRoute } from "../../app/WorkspaceRouteContext";
import { PlannedPaymentsView } from "../planned-payments/PlannedPaymentsView";

const currentMonth = localMonthValue;
const control = "h-10 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

export function BudgetsView({ currency, locale }: { currency: string; locale: string }) {
  const client = useQueryClient();
  const workspace = useOptionalWorkspaceRoute();
  const [localMonth, setLocalMonth] = useState(currentMonth());
  const month = workspace?.state.month ?? localMonth;
  const [editing, setEditing] = useState<BudgetProgress | "new" | null>(null);
  const [deleting, setDeleting] = useState<BudgetProgress | null>(null);
  const [error, setError] = useState("");
  const budgets = useQuery({ queryKey: [...queryKeys.budgets, month], queryFn: ({ signal }) => getBudgetProgress(`${month}-01`, signal) });
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: ({ signal }) => getCategories(signal) });
  const refresh = () => invalidateFinancialQueries(client, mutationInvalidations.budgets);
  const save = useMutation({ mutationFn: ({ category_id, limit_minor }: { category_id: number; limit_minor: number }) => editing === "new" ? createBudget({ category_id, month: `${month}-01`, limit_minor }) : updateBudget(editing!.id, limit_minor), onSuccess: async () => { await refresh(); setEditing(null); } });
  const remove = useMutation({ mutationFn: deleteBudget, onSuccess: async () => { await refresh(); setDeleting(null); } });
  const used = new Set(budgets.data?.map((item) => item.category_id));
  const available = categories.data?.filter((item) => item.direction === "expense" && item.is_active && !used.has(item.id));
  const money = (minor: number) => formatMinor(minor, currency, locale);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(""); const data = new FormData(event.currentTarget); const category_id = Number(data.get("category_id")); const limit_minor = Math.round(Number(data.get("limit")) * 100); if (!category_id || !Number.isFinite(limit_minor) || limit_minor <= 0) return setError("Choose an expense category and enter a positive limit."); save.mutate({ category_id, limit_minor }, { onError: (value) => setError(value instanceof Error ? value.message : "The budget could not be saved.") }); };

  const mode = workspace?.state.planning ?? "budgets";
  const setMonth = (value: string) => { setLocalMonth(value); workspace?.update({ month: value }); };
  const globalNotice = workspace?.state.scope.reason === "planning-is-global" ? <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" role="status">Planning uses all accounts. Your selected account remains in the URL and will be restored when you leave Planning.</p> : null;
  if (mode === "upcoming") return <section className="space-y-5">{globalNotice}<PlannedPaymentsView currency={currency} locale={locale} upcomingOnly /></section>;

  return <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm"><label className="grid gap-1 text-xs font-medium text-muted-foreground">Budget month<input className={control} type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><Button disabled={!available?.length} onClick={() => { setError(""); setEditing("new"); }}>Create budget</Button></div><div className="rounded-xl border bg-card shadow-sm">{budgets.isPending || categories.isPending ? <State text="Loading budgets…" /> : budgets.isError || categories.isError ? <State error text="Budgets could not be loaded." /> : budgets.data.length === 0 ? <State text="No budgets for this month." /> : <div className="divide-y">{budgets.data.map((item) => { const over = item.remaining_minor < 0; return <article className="p-5" key={item.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">{item.category_name}</h2><p className="mt-1 text-sm text-muted-foreground">{money(item.spent_minor)} of {money(item.limit_minor)}</p></div><div className="flex items-center gap-2"><span className={`text-sm font-medium ${over ? "text-destructive" : "text-muted-foreground"}`}>{over ? `${money(-item.remaining_minor)} over budget` : `${money(item.remaining_minor)} remaining`}</span><Button size="sm" variant="outline" onClick={() => { setError(""); setEditing(item); }}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(item)}>Delete</Button></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" aria-label={`${Math.round(item.progress_ratio * 100)} percent used`}><div className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(item.progress_ratio * 100, 100)}%` }} /></div></article>; })}</div>}</div><Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>{editing === "new" ? "Create budget" : "Edit budget"}</DialogTitle><DialogDescription>Set one monthly limit for an expense category.</DialogDescription></DialogHeader><form onSubmit={submit}><div className="grid gap-4"><label className="text-sm font-medium">Category<select className={`${control} mt-1 w-full`} disabled={editing !== "new"} defaultValue={editing === "new" ? "" : editing?.category_id} name="category_id"><option value="">Select category</option>{editing === "new" ? available?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : editing && <option value={editing.category_id}>{editing.category_name}</option>}</select></label><label className="text-sm font-medium">Monthly limit<input className={`${control} mt-1 w-full`} defaultValue={editing === "new" ? "" : editing ? editing.limit_minor / 100 : ""} min="0.01" name="limit" step="0.01" type="number" /></label></div>{error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}<DialogFooter className="mt-6"><Button disabled={save.isPending} type="submit">{save.isPending ? "Saving…" : "Save budget"}</Button></DialogFooter></form></DialogContent></Dialog><AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !remove.isPending) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete budget?</AlertDialogTitle><AlertDialogDescription>This removes the monthly limit for {deleting?.category_name}. Transactions are not affected.</AlertDialogDescription></AlertDialogHeader>{remove.isError && <p className="text-sm text-destructive" role="alert">{remove.error instanceof Error ? remove.error.message : "The budget could not be deleted."}</p>}<AlertDialogFooter><AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel><Button disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)} variant="destructive">{remove.isPending ? "Deleting…" : "Delete"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></section>;
}
function State({ text, error }: { text: string; error?: boolean }) { return <div className={`p-12 text-center text-sm ${error ? "text-destructive" : "text-muted-foreground"}`} role={error ? "alert" : "status"}>{text}</div>; }
