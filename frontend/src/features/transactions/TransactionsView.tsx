import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getCategories,
  getFinancialAccounts,
  getTags,
} from "../../api/referenceData";
import {
  cancelRecurrence,
  skipRecurrenceOccurrence,
  updatePlannedPayment,
} from "../../api/plannedPayments";
import {
  deleteTransaction,
  getTransactionTimeline,
  updateTransaction,
  type TransactionTimelineRow,
} from "../../api/transactions";
import { queryKeys } from "../../app/queryKeys";
import {
  invalidateFinancialQueries,
  mutationInvalidations,
} from "../../app/invalidateQueries";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { TransactionLedger } from "./TransactionLedger";

const PAGE_SIZE = 25;
const control =
  "h-10 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function TransactionsView({
  currency = "USD",
  locale = "en-US",
}: {
  currency?: string;
  locale?: string;
}) {
  const client = useQueryClient();
  const [filters, setFilters] = useState({
    search: "",
    financial_account_id: "",
    category_id: "",
    tag_id: "",
    kind: "",
    start_date: "",
    end_date: "",
    sort: "date_desc",
  });
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<TransactionTimelineRow | null>(null);
  const [editScope, setEditScope] = useState<
    "this_occurrence" | "this_and_future"
  >("this_occurrence");
  const [editKind, setEditKind] = useState<"expense" | "income">("expense");
  const [deleting, setDeleting] = useState<TransactionTimelineRow | null>(null);
  const [error, setError] = useState("");
  const accounts = useQuery({
    queryKey: queryKeys.financialAccounts,
    queryFn: ({ signal }) => getFinancialAccounts(signal),
  });
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => getCategories(signal),
  });
  const tags = useQuery({
    queryKey: queryKeys.tags,
    queryFn: ({ signal }) => getTags(signal),
  });
  const transactions = useQuery({
    queryKey: [...queryKeys.transactions, filters, offset],
    queryFn: ({ signal }) => {
      const { financial_account_id: account, ...otherFilters } = filters;
      return getTransactionTimeline(
        {
          ...Object.fromEntries(
            Object.entries(otherFilters).filter(([, value]) => value),
          ),
          financial_account_id:
            account && account !== "general" ? account : undefined,
          without_account: account === "general" ? true : undefined,
          limit: PAGE_SIZE,
          offset,
        },
        signal,
      );
    },
  });
  const refresh = () =>
    invalidateFinancialQueries(client, mutationInvalidations.transactions);
  const editMutation = useMutation({
    mutationFn: async ({
      row,
      data,
    }: {
      row: TransactionTimelineRow;
      data: Record<string, unknown>;
    }) => {
      if (row.row_type === "scheduled")
        await updatePlannedPayment(
          row.id,
          {
            financial_account_id: data.financial_account_id as number | null,
            category_id: data.category_id as number,
            due_date: data.transaction_date as string,
            direction: data.kind as "income" | "expense",
            amount_minor: data.amount_minor as number,
            title: data.description as string,
            notes: data.notes as string | null,
            is_debt_payment: data.is_debt_payment as boolean,
          },
          editScope,
        );
      else await updateTransaction(row.id, data, editScope);
    },
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async ({
      row,
      scope,
    }: {
      row: TransactionTimelineRow;
      scope: "this_occurrence" | "this_and_future";
    }) => {
      if (row.row_type === "scheduled") {
        if (scope === "this_occurrence") await skipRecurrenceOccurrence(row.id);
        else await cancelRecurrence(row.id);
      } else await deleteTransaction(row.id, scope);
    },
    onSuccess: async () => {
      await refresh();
      setDeleting(null);
    },
  });
  const changeFilter = (name: string, value: string) => {
    setOffset(0);
    setFilters((current) => ({ ...current, [name]: value }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setError("");
    const data = new FormData(event.currentTarget);
    const amount = Math.round(Number(data.get("amount")) * 100);
    if (
      !data.get("description") ||
      !data.get("category_id") ||
      !Number.isFinite(amount) ||
      amount <= 0
    )
      return setError(
        "Category, description, and a positive amount are required.",
      );
    editMutation.mutate(
      {
        row: editing,
        data: {
          financial_account_id: data.get("financial_account_id")
            ? Number(data.get("financial_account_id"))
            : null,
          category_id: Number(data.get("category_id")),
          transaction_date: data.get("transaction_date"),
          kind: data.get("kind"),
          amount_minor: amount,
          description: data.get("description"),
          notes: data.get("notes") || null,
          is_debt_payment:
            data.get("kind") === "expense" &&
            data.get("is_debt_payment") === "on",
        },
      },
      {
        onError: (value) =>
          setError(
            value instanceof Error
              ? value.message
              : "The transaction could not be saved.",
          ),
      },
    );
  };
  const names = <T extends { id: number; name: string }>(
    items: T[] | undefined,
  ) => new Map((items ?? []).map((item) => [item.id, item.name]));
  const editCategories = categories.data?.filter(
    (category) => category.direction === editKind,
  );

  return (
    <section>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-medium text-muted-foreground xl:col-span-2">
            Search
            <input
              className={`${control} mt-1 w-full`}
              onChange={(event) => changeFilter("search", event.target.value)}
              placeholder="Description or notes"
              value={filters.search}
            />
          </label>
          <Filter
            label="Account"
            name="financial_account_id"
            value={filters.financial_account_id}
            onChange={changeFilter}
          >
            <option value="">All accounts</option>
            <option value="general">General — no specific account</option>
            {accounts.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </Filter>
          <Filter
            label="Category"
            name="category_id"
            value={filters.category_id}
            onChange={changeFilter}
          >
            <option value="">All categories</option>
            {categories.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </Filter>
          <Filter
            label="Tag"
            name="tag_id"
            value={filters.tag_id}
            onChange={changeFilter}
          >
            <option value="">All tags</option>
            {tags.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </Filter>
          <label className="text-xs font-medium text-muted-foreground">
            From
            <input
              aria-label="From"
              className={`${control} mt-1 w-full`}
              onChange={(event) =>
                changeFilter("start_date", event.target.value)
              }
              type="date"
              value={filters.start_date}
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            To
            <input
              aria-label="To"
              className={`${control} mt-1 w-full`}
              onChange={(event) => changeFilter("end_date", event.target.value)}
              type="date"
              value={filters.end_date}
            />
          </label>
          <Filter
            label="Type"
            name="kind"
            value={filters.kind}
            onChange={changeFilter}
          >
            <option value="">All types</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer_out">Transfers out</option>
            <option value="transfer_in">Transfers in</option>
          </Filter>
        </div>
        <div className="mt-3 flex justify-end">
          <Filter
            label="Sort"
            name="sort"
            value={filters.sort}
            onChange={changeFilter}
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Largest amount</option>
            <option value="amount_asc">Smallest amount</option>
          </Filter>
        </div>
      </div>
      <div className="mt-5 rounded-xl border bg-card shadow-sm">
        {transactions.isPending ||
        accounts.isPending ||
        categories.isPending ||
        tags.isPending ? (
          <State text="Loading transactions…" />
        ) : transactions.isError ||
          accounts.isError ||
          categories.isError ||
          tags.isError ? (
          <State error text="Transactions could not be loaded." />
        ) : transactions.data.length === 0 ? (
          <State text="No transactions match these filters." />
        ) : (
          <TransactionLedger
            accountNames={names(accounts.data)}
            categoryNames={names(categories.data)}
            currency={currency}
            locale={locale}
            onDelete={setDeleting}
            onEdit={(value) => {
              setError("");
              setEditScope("this_occurrence");
              setEditKind(value.kind as "expense" | "income");
              setEditing(value);
            }}
            transactions={transactions.data}
          />
        )}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {Math.floor(offset / PAGE_SIZE) + 1} · up to {PAGE_SIZE} rows
        </p>
        <div className="flex gap-2">
          <Button
            disabled={offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={
              !transactions.data || transactions.data.length < PAGE_SIZE
            }
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(openValue) => {
          if (!openValue) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.row_type === "scheduled"
                ? "Edit recurring transaction"
                : "Edit transaction"}
            </DialogTitle>
            <DialogDescription>
              {editing?.planned_payment_id
                ? "Choose whether the change applies once or updates the future series."
                : "Transfers are linked entries and cannot be edited here."}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                {editing.planned_payment_id && (
                  <label className="text-sm font-medium sm:col-span-2">
                    Apply changes to
                    <select
                      className={`${control} mt-1 w-full`}
                      onChange={(event) =>
                        setEditScope(event.target.value as typeof editScope)
                      }
                      value={editScope}
                    >
                      <option value="this_occurrence">This occurrence</option>
                      <option value="this_and_future">This and future</option>
                    </select>
                  </label>
                )}
                <label className="text-sm font-medium">
                  Date
                  <input
                    className={`${control} mt-1 w-full`}
                    defaultValue={editing.transaction_date}
                    name="transaction_date"
                    type="date"
                  />
                </label>
                <label className="text-sm font-medium">
                  Type
                  <select
                    className={`${control} mt-1 w-full`}
                    name="kind"
                    onChange={(event) =>
                      setEditKind(event.target.value as "expense" | "income")
                    }
                    value={editKind}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Account
                  <select
                    className={`${control} mt-1 w-full`}
                    defaultValue={editing.financial_account_id ?? ""}
                    name="financial_account_id"
                  >
                    <option value="">General — no specific account</option>
                    {accounts.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.is_active ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Category
                  <select
                    className={`${control} mt-1 w-full`}
                    defaultValue={editing.category_id ?? ""}
                    key={editKind}
                    name="category_id"
                  >
                    <option value="">Select category</option>
                    {editCategories?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.is_active ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Amount
                  <input
                    className={`${control} mt-1 w-full`}
                    defaultValue={editing.amount_minor / 100}
                    min="0.01"
                    name="amount"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className="text-sm font-medium sm:col-span-2">
                  Description
                  <input
                    className={`${control} mt-1 w-full`}
                    defaultValue={editing.description}
                    name="description"
                  />
                </label>
                {editKind === "expense" && (
                  <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-medium sm:col-span-2">
                    <input
                      defaultChecked={editing.is_debt_payment}
                      name="is_debt_payment"
                      type="checkbox"
                    />
                    Debt payment
                  </label>
                )}
                <label className="text-sm font-medium sm:col-span-2">
                  Notes
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    defaultValue={editing.notes ?? ""}
                    name="notes"
                  />
                </label>
              </div>
              {error && (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <DialogFooter className="mt-6">
                <Button disabled={editMutation.isPending} type="submit">
                  {editMutation.isPending ? "Saving…" : "Save transaction"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(openValue) => {
          if (!openValue && !deleteMutation.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.row_type === "scheduled"
                ? "Change recurring transaction?"
                : "Delete transaction?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.planned_payment_id
                ? "Choose whether this affects only this occurrence or the rest of the series."
                : `This permanently removes “${deleting?.description}”.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : "The transaction could not be deleted."}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            {deleting?.planned_payment_id && (
              <Button
                disabled={deleteMutation.isPending}
                onClick={() =>
                  deleting &&
                  deleteMutation.mutate({
                    row: deleting,
                    scope: "this_occurrence",
                  })
                }
                variant="outline"
              >
                {deleting.row_type === "scheduled"
                  ? "Skip this occurrence"
                  : "Delete this occurrence"}
              </Button>
            )}
            <Button
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleting &&
                deleteMutation.mutate({
                  row: deleting,
                  scope: deleting.planned_payment_id
                    ? "this_and_future"
                    : "this_occurrence",
                })
              }
              variant="destructive"
            >
              {deleteMutation.isPending
                ? "Working…"
                : deleting?.planned_payment_id
                  ? "This and future"
                  : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Filter({
  label,
  name,
  value,
  onChange,
  children,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <select
        className={`${control} mt-1 w-full`}
        onChange={(event) => onChange(name, event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}
function State({ text, error }: { text: string; error?: boolean }) {
  return (
    <div
      className={`p-10 text-center text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
    >
      {text}
    </div>
  );
}
