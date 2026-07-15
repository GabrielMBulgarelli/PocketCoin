import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Backup } from "../../api/backups";
import { createBackup, listBackups, restoreBackup } from "../../api/backups";
import type { Settings } from "../../api/settings";
import { updateSettings } from "../../api/settings";
import { exportTransactions } from "../../api/transactions";
import { queryKeys } from "../../app/queryKeys";
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
import { Card, control } from "../dashboard/DashboardCards";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DataSafetyCard({ locale }: { locale: string }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<Backup | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const backups = useQuery({ queryKey: queryKeys.backups, queryFn: listBackups });
  const createMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.backups }),
  });
  const restoreMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => restoreBackup(id, value),
    onSuccess: () => {
      client.clear();
      window.location.reload();
    },
    onError: (error: Error) => setRestoreError(error.message),
  });

  return (
    <Card title="Data safety" context="Backups stay inside PocketCoin's local data directory">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Create a consistent SQLite backup before risky changes. Restoring also keeps an automatic
          copy of your current database.
        </p>
        <Button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "Creating…" : "Create backup"}
        </Button>
      </div>
      {createMutation.isError && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {createMutation.error.message}
        </p>
      )}
      {createMutation.isSuccess && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Backup created successfully.
        </p>
      )}
      {backups.isPending ? (
        <p className="mt-5 text-sm text-muted-foreground" role="status">Loading backups…</p>
      ) : backups.isError ? (
        <p className="mt-5 text-sm text-destructive" role="alert">{backups.error.message}</p>
      ) : backups.data.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No backups yet. Create one to establish a recovery point.
        </p>
      ) : (
        <ul className="mt-5 grid gap-2" aria-label="Available backups">
          {backups.data.map((backup) => (
            <li
              className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              key={backup.id}
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {backup.reason === "pre_restore" ? "Automatic pre-restore" : "Manual backup"}
                </p>
                <p className="text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
                    new Date(backup.created_at),
                  )} · {formatSize(backup.size_bytes)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelected(backup);
                  setConfirmation("");
                  setRestoreError("");
                }}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !restoreMutation.isPending) setSelected(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              PocketCoin will first back up the current database, then replace it and reload the app.
              Type RESTORE exactly to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="grid gap-1.5 text-sm font-medium">
            Confirmation
            <input
              className={control}
              value={confirmation}
              autoComplete="off"
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {restoreError && <p className="text-sm text-destructive" role="alert">{restoreError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={confirmation !== "RESTORE" || restoreMutation.isPending || !selected}
              onClick={() => {
                if (!selected) return;
                setRestoreError("");
                restoreMutation.mutate({ id: selected.id, value: confirmation });
              }}
            >
              {restoreMutation.isPending ? "Restoring…" : "Restore database"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function SettingsView({ settings, loading, loadError }: { settings?: Settings; loading: boolean; loadError: boolean }) {
  const client = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [exportError, setExportError] = useState("");
  useEffect(() => { if (settings && !form) setForm(settings); }, [settings, form]);
  const mutation = useMutation({ mutationFn: updateSettings, onSuccess: (saved, submitted) => { const formattingChanged = settings?.base_currency !== submitted.base_currency || settings?.locale !== submitted.locale; client.setQueryData(queryKeys.settings, saved); void client.invalidateQueries({ queryKey: queryKeys.settings }); if (formattingChanged) { void client.invalidateQueries({ queryKey: queryKeys.dashboard }); void client.invalidateQueries({ queryKey: queryKeys.reports }); } setForm(saved); setMessage("Settings saved."); } });
  if (loading) return <Card title="Loading settings" context="Local preferences"><p className="py-16 text-center text-sm text-muted-foreground" role="status">Loading preferences…</p></Card>;
  if (loadError || !form) return <Card title="Settings unavailable" context="Local preferences"><p className="py-16 text-center text-sm text-destructive" role="alert">The local settings could not be loaded.</p></Card>;
  const currencyValid = /^[A-Za-z]{3}$/.test(form.base_currency); let localeValid = true; try { Intl.getCanonicalLocales(form.locale); } catch { localeValid = false; }
  return <div className="grid gap-5 xl:grid-cols-[2fr_1fr]"><Card title="Display preferences" context="Saved in your local PocketCoin database"><form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setMessage(""); if (currencyValid && localeValid) mutation.mutate({ ...form, base_currency: form.base_currency.toUpperCase() }); }}>
    <label className="grid gap-1 text-sm font-medium">Currency<input list="currency-presets" className={control} value={form.base_currency} onChange={(event) => setForm({ ...form, base_currency: event.target.value })} /><datalist id="currency-presets"><option value="CRC" /><option value="USD" /><option value="EUR" /></datalist>{!currencyValid && <span className="text-xs text-destructive">Use a three-letter currency code.</span>}</label>
    <label className="grid gap-1 text-sm font-medium">Locale<input list="locale-presets" className={control} value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value })} /><datalist id="locale-presets"><option value="es-CR" /><option value="en-US" /></datalist>{!localeValid && <span className="text-xs text-destructive">Enter a valid BCP 47 locale tag.</span>}</label>
    <label className="grid gap-1 text-sm font-medium">First day of week<select className={control} value={form.first_day_of_week} onChange={(event) => setForm({ ...form, first_day_of_week: event.target.value as Settings["first_day_of_week"] })}><option value="monday">Monday</option><option value="sunday">Sunday</option></select></label>
    <label className="grid gap-1 text-sm font-medium">Theme<select className={control} value={form.theme} onChange={(event) => setForm({ ...form, theme: event.target.value as Settings["theme"] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    <div className="sm:col-span-2"><button disabled={mutation.isPending || !currencyValid || !localeValid} className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" type="submit">{mutation.isPending ? "Saving…" : "Save settings"}</button>{mutation.isError && <p className="mt-2 text-sm text-destructive" role="alert">{mutation.error.message}</p>}{message && <p className="mt-2 text-sm text-muted-foreground" role="status">{message}</p>}</div>
  </form></Card><Card title="Full transaction export" context="Every ledger row in a spreadsheet-safe CSV"><p className="mb-4 text-sm text-muted-foreground">The export uses {form.base_currency.toUpperCase()} and includes all dates, accounts, categories, tags, and transfers.</p><button className="h-10 rounded-lg border bg-background px-4 text-sm font-medium" type="button" onClick={() => { setExportError(""); void exportTransactions().catch((error: Error) => setExportError(error.message)); }}>Export full history</button>{exportError && <p className="mt-2 text-sm text-destructive" role="alert">{exportError}</p>}</Card><div className="xl:col-span-2"><DataSafetyCard locale={form.locale} /></div></div>;
}
