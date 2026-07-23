import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, WalletCardsIcon } from "lucide-react";

import { getFinancialAccounts, saveAccount, type FinancialAccount } from "../../api/referenceData";
import { queryKeys } from "../../app/queryKeys";
import { invalidateFinancialQueries, mutationInvalidations } from "../../app/invalidateQueries";
import { formatMinor, formatShortDate, localDateValue } from "../../lib/format";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";

type AccountKind = FinancialAccount["kind"];
type AccountPayload = { name: FormDataEntryValue; kind: AccountKind; is_active?: boolean; opening_balance_minor: number; opening_balance_date: FormDataEntryValue; credit_limit_minor: number | null };
const assetKinds = new Set<AccountKind>(["cash", "checking", "savings"]);
const supportsCreditLimit = (kind: AccountKind) => kind === "credit_card" || kind === "overdraft";

const field = "mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const today = localDateValue;

export function FinancialAccountsView({ currency, locale }: { currency: string; locale: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.financialAccounts, queryFn: ({ signal }) => getFinancialAccounts(signal) });
  const [editing, setEditing] = useState<FinancialAccount | null | undefined>(undefined);
  const [kind, setKind] = useState<AccountKind>("checking");
  const [pendingChange, setPendingChange] = useState<AccountPayload | null>(null);
  const [error, setError] = useState("");
  const mutation = useMutation({ mutationFn: ({ id, data }: { id: number | null; data: object }) => saveAccount(id, data), onSuccess: async () => { await invalidateFinancialQueries(client, mutationInvalidations.accounts); setEditing(undefined); } });
  const open = (account: FinancialAccount | null) => { setError(""); setPendingChange(null); setKind(account?.kind ?? "checking"); setEditing(account); };
  const save = (data: AccountPayload) => mutation.mutate({ id: editing?.id ?? null, data }, { onError: (value) => setError(value instanceof Error ? value.message : "The account could not be saved.") });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    const amount = Math.round(Number(data.get("opening_balance")) * 100);
    const credit = String(data.get("credit_limit") ?? "");
    if (!data.get("name") || !Number.isFinite(amount) || amount < 0) return setError("Enter a name and a valid non-negative opening balance.");
    const payload: AccountPayload = { name: data.get("name")!, kind, ...(editing ? { is_active: data.get("is_active") === "on" } : {}), opening_balance_minor: amount, opening_balance_date: data.get("opening_balance_date")!, credit_limit_minor: supportsCreditLimit(kind) && credit ? Math.round(Number(credit) * 100) : null };
    if (editing && assetKinds.has(editing.kind) !== assetKinds.has(kind)) setPendingChange(payload);
    else save(payload);
  };
  if (query.isPending) return <State text="Loading financial accounts…" />;
  if (query.isError) return <State text="Financial accounts could not be loaded." tone="error" />;
  return <section>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">Track the places where money lives and moves.</p><h2 className="mt-1 text-lg font-semibold">Your accounts</h2></div><Button onClick={() => open(null)}><PlusIcon /> Add account</Button></div>
    {query.data.length === 0 ? <State text="No accounts yet. Add your first cash, bank, or credit account." /> : <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{query.data.map((account) => <article className="rounded-xl border bg-card p-4 shadow-sm" key={account.id}><div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-full bg-accent"><WalletCardsIcon className="size-5" /></div><Button aria-label={`Edit ${account.name}`} onClick={() => open(account)} size="icon-sm" variant="ghost"><PencilIcon /></Button></div><h3 className="mt-5 font-semibold">{account.name}</h3><p className="mt-1 text-xs capitalize text-muted-foreground">{account.kind.replace("_", " ")} · {account.is_active ? "Active" : "Inactive"}</p><p className="mt-4 text-xl font-semibold tabular-nums">{formatMinor(account.opening_balance_minor, currency, locale, 2)}</p><p className="text-xs text-muted-foreground">Opening balance · {formatShortDate(account.opening_balance_date, locale)}</p></article>)}</div>}
    <Dialog open={editing !== undefined} onOpenChange={(openValue) => { if (!openValue && !pendingChange) setEditing(undefined); }}><DialogContent><DialogHeader><DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle><DialogDescription>{editing ? "Update the account details and classification." : "Set the opening point for this account."}</DialogDescription></DialogHeader><form onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2 text-sm font-medium">Name<input className={field} defaultValue={editing?.name ?? ""} name="name" /></label><label className="text-sm font-medium">Type<select className={field} name="kind" onChange={(event) => setKind(event.target.value as AccountKind)} value={kind}><option value="cash">Cash</option><option value="checking">Checking</option><option value="savings">Savings</option><option value="credit_card">Credit card</option><option value="overdraft">Overdraft</option><option value="loan">Loan</option></select></label><label className="text-sm font-medium">Opening date<input className={field} defaultValue={editing?.opening_balance_date ?? today()} name="opening_balance_date" type="date" /></label><label className="text-sm font-medium">Opening balance<input className={field} defaultValue={editing ? editing.opening_balance_minor / 100 : 0} min="0" name="opening_balance" step="0.01" type="number" /></label>{supportsCreditLimit(kind) && <label className="text-sm font-medium">Credit limit<input className={field} defaultValue={editing?.credit_limit_minor ? editing.credit_limit_minor / 100 : ""} min="0.01" name="credit_limit" step="0.01" type="number" /></label>}{editing && <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input defaultChecked={editing.is_active} name="is_active" type="checkbox" /> Active</label>}</div>{(error || mutation.isError) && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}<DialogFooter className="mt-6"><Button disabled={mutation.isPending} type="submit">{mutation.isPending ? "Saving…" : "Save account"}</Button></DialogFooter></form></DialogContent></Dialog>
    <AlertDialog open={Boolean(pendingChange)} onOpenChange={(openValue) => { if (!openValue) setPendingChange(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Change account family?</AlertDialogTitle><AlertDialogDescription>Changing between an asset and a debt account reinterprets this account’s historical transactions and balances. Review reports after saving.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingChange) save(pendingChange); setPendingChange(null); }}>Change account type</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

function State({ text, tone }: { text: string; tone?: "error" }) { return <div className={`rounded-xl border border-dashed p-8 text-center text-sm ${tone ? "text-destructive" : "text-muted-foreground"}`}>{text}</div>; }
