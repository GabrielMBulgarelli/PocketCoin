import type { Transaction } from "../../api/transactions";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { formatMinor, formatShortDate } from "../../lib/format";

export function TransactionLedger({ transactions, accountNames, categoryNames, currency, locale, onEdit, onDelete }: { transactions: Transaction[]; accountNames: Map<number, string>; categoryNames: Map<number, string>; currency: string; locale: string; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void }) {
  const columns: ColumnDef<Transaction>[] = [
    { accessorKey: "transaction_date", header: "Date", cell: ({ getValue }) => <span className="tabular-nums">{formatShortDate(String(getValue()), locale)}</span> },
    { accessorKey: "description", header: "Description", cell: ({ row }) => <div><p className="font-medium">{row.original.description}</p><p className="text-xs text-muted-foreground">{accountNames.get(row.original.financial_account_id) ?? "Unknown account"}{row.original.category_id ? ` · ${categoryNames.get(row.original.category_id) ?? "Unknown category"}` : ""}</p></div> },
    { accessorKey: "kind", header: "Type", cell: ({ row }) => row.original.kind.startsWith("transfer") ? <span className="text-xs text-muted-foreground">Transfer · read only</span> : <span className="capitalize">{row.original.kind}</span> },
    { accessorKey: "amount_minor", header: () => <span className="block text-right">Amount</span>, cell: ({ row }) => <span className={`block text-right font-medium tabular-nums ${row.original.kind === "income" ? "text-emerald-700" : ""}`}>{row.original.kind === "expense" ? "−" : "+"}{formatMinor(row.original.amount_minor, currency, locale, 2)}</span> },
    { id: "actions", cell: ({ row }) => row.original.kind.startsWith("transfer") ? null : <div className="flex justify-end gap-1"><button aria-label={`Edit ${row.original.description}`} className="rounded-lg p-2 hover:bg-accent" onClick={() => onEdit(row.original)} type="button"><PencilIcon className="size-4" /></button><button aria-label={`Delete ${row.original.description}`} className="rounded-lg p-2 text-destructive hover:bg-accent" onClick={() => onDelete(row.original)} type="button"><Trash2Icon className="size-4" /></button></div> },
  ];
  const table = useReactTable({ data: transactions, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b text-xs text-muted-foreground">{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th className="px-3 py-3 font-medium" key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id} className="border-b last:border-0 hover:bg-accent/40">{row.getVisibleCells().map((cell) => <td className="px-3 py-4" key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
