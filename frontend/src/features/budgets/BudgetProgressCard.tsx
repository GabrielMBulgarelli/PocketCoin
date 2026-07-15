import { useQuery } from "@tanstack/react-query";
import { getBudgetProgress } from "../../api/budgets";
import { queryKeys } from "../../app/queryKeys";
import { formatMinor } from "../../lib/format";

export function BudgetProgressList({ data, money }: { data: Awaited<ReturnType<typeof getBudgetProgress>>; money: (value: number) => string }) {
  return data.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No budgets set for this month.</p> : <div className="space-y-4">{data.slice(0, 5).map((item) => { const over = item.remaining_minor < 0; return <div key={item.id}><div className="mb-1 flex justify-between gap-4 text-sm"><span className="font-medium">{item.category_name}</span><span className={over ? "font-medium text-destructive" : "text-muted-foreground"}>{over ? `${money(-item.remaining_minor)} over` : `${money(item.remaining_minor)} left`}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`${Math.round(item.progress_ratio * 100)} percent used`}><div className={`h-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(item.progress_ratio * 100, 100)}%` }} /></div></div>; })}</div>;
}

export function BudgetProgressCard({ month, currency, locale }: { month: string; currency: string; locale: string }) {
  const query = useQuery({ queryKey: [...queryKeys.budgets, "dashboard", month], queryFn: () => getBudgetProgress(month) });
  const money = (minor: number) => formatMinor(minor, currency, locale);
  return <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="mb-5"><h2 className="font-semibold tracking-tight">Budget progress</h2><p className="mt-1 text-xs text-muted-foreground">Expense limits for {month.slice(0, 7)}</p></div>{query.isPending ? <p className="py-8 text-center text-sm text-muted-foreground" role="status">Loading budget progress…</p> : query.isError ? <p className="py-8 text-center text-sm text-destructive" role="alert">Budget progress is unavailable.</p> : <BudgetProgressList data={query.data} money={money} />}</section>;
}
