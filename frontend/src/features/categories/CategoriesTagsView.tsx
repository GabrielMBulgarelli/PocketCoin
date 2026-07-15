import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon } from "lucide-react";

import { getCategories, getTags, saveCategory, saveTag, type Category, type Tag } from "../../api/referenceData";
import { queryKeys } from "../../app/queryKeys";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";

const field = "mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
type Editor = { type: "category"; item: Category | null } | { type: "tag"; item: Tag | null };

export function CategoriesTagsView() {
  const client = useQueryClient();
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: getCategories });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: getTags });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState("");
  const mutation = useMutation({ mutationFn: ({ type, id, data }: { type: "category" | "tag"; id: number | null; data: object }) => type === "category" ? saveCategory(id, data) : saveTag(id, data), onSuccess: async (_, variables) => { await Promise.all([client.invalidateQueries({ queryKey: variables.type === "category" ? queryKeys.categories : queryKeys.tags }), client.invalidateQueries({ queryKey: queryKeys.transactions })]); setEditor(null); } });
  const open = (value: Editor) => { setError(""); setEditor(value); };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!editor) return; setError(""); const data = new FormData(event.currentTarget); const name = String(data.get("name") ?? "").trim(); if (!name) return setError("Name is required."); mutation.mutate({ type: editor.type, id: editor.item?.id ?? null, data: { name, ...(editor.type === "category" && !editor.item ? { direction: data.get("direction") } : {}), ...(editor.item ? { is_active: data.get("is_active") === "on" } : {}) } }, { onError: (value) => setError(value instanceof Error ? value.message : "The change could not be saved.") }); };
  if (categories.isPending || tags.isPending) return <State text="Loading categories and tags…" />;
  if (categories.isError || tags.isError) return <State text="Categories and tags could not be loaded." error />;
  return <div className="grid gap-5 lg:grid-cols-2"><ReferenceCard title="Categories" description="Organize income and expenses for clear reporting." onAdd={() => open({ type: "category", item: null })}>{categories.data.length ? categories.data.map((item) => <Row key={item.id} label={item.name} meta={`${item.direction} · ${item.is_active ? "Active" : "Inactive"}${item.is_default ? " · Default" : ""}`} onEdit={() => open({ type: "category", item })} />) : <State text="No categories yet." />}</ReferenceCard><ReferenceCard title="Tags" description="Add lightweight context across transactions." onAdd={() => open({ type: "tag", item: null })}>{tags.data.length ? tags.data.map((item) => <Row key={item.id} label={item.name} meta={item.is_active ? "Active" : "Inactive"} onEdit={() => open({ type: "tag", item })} />) : <State text="No tags yet." />}</ReferenceCard>
    <Dialog open={Boolean(editor)} onOpenChange={(openValue) => { if (!openValue) setEditor(null); }}><DialogContent><DialogHeader><DialogTitle>{editor?.item ? "Edit" : "Add"} {editor?.type}</DialogTitle><DialogDescription>{editor?.type === "category" && editor.item ? "Category direction is fixed after creation." : "Keep names short and recognizable."}</DialogDescription></DialogHeader><form onSubmit={submit}><div className="grid gap-4"><label className="text-sm font-medium">Name<input className={field} defaultValue={editor?.item?.name ?? ""} name="name" /></label>{editor?.type === "category" && <label className="text-sm font-medium">Direction<select className={field} defaultValue={(editor.item as Category | null)?.direction ?? "expense"} disabled={Boolean(editor.item)} name="direction"><option value="expense">Expense</option><option value="income">Income</option></select></label>}{editor?.item && <label className="flex items-center gap-2 text-sm font-medium"><input defaultChecked={editor.item.is_active} name="is_active" type="checkbox" /> Active</label>}</div>{error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}<DialogFooter className="mt-6"><Button disabled={mutation.isPending} type="submit">{mutation.isPending ? "Saving…" : "Save"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}

function ReferenceCard({ title, description, onAdd, children }: { title: string; description: string; onAdd: () => void; children: React.ReactNode }) { return <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><Button aria-label={`Add ${title.toLowerCase()}`} onClick={onAdd} size="icon-sm"><PlusIcon /></Button></div><div className="mt-5 divide-y">{children}</div></section>; }
function Row({ label, meta, onEdit }: { label: string; meta: string; onEdit: () => void }) { return <div className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{label}</p><p className="text-xs capitalize text-muted-foreground">{meta}</p></div><Button aria-label={`Edit ${label}`} onClick={onEdit} size="icon-sm" variant="ghost"><PencilIcon /></Button></div>; }
function State({ text, error }: { text: string; error?: boolean }) { return <p className={`rounded-lg border border-dashed p-6 text-center text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>{text}</p>; }
