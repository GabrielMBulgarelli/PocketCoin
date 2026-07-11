import type { Transaction } from "../../api/transactions";

export function TransactionLedger({ transactions, onDelete }: { transactions: Transaction[]; onDelete?: (id: number) => void }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr><th className="pb-2">Date</th><th className="pb-2">Description</th><th className="pb-2">Kind</th><th className="pb-2 text-right">Amount</th><th className="pb-2" /></tr>
        </thead>
        <tbody>{transactions.map((transaction) => <tr key={transaction.id} className="border-b last:border-0"><td className="py-3 tabular-nums">{transaction.transaction_date}</td><td className="py-3">{transaction.description}</td><td className="py-3 capitalize">{transaction.kind.replace("_", " ")}</td><td className="py-3 text-right tabular-nums">{transaction.amount_minor}</td><td className="py-3 text-right">{onDelete && <button className="text-xs text-destructive underline" onClick={() => onDelete(transaction.id)} type="button">Delete</button>}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
