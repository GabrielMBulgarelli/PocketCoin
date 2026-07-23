import type { ExportStatus } from "../lib/useCsvExport";

export function ExportStatusAlert({ status, message }: { status: ExportStatus; message: string }) {
  if (!message) return null;

  const isError = status === "error";

  return (
    <p
      aria-label="CSV export status"
      aria-live={isError ? "assertive" : "polite"}
      className={`rounded-lg border px-3 py-2 text-sm ${
        isError
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-primary/25 bg-primary/5 text-foreground"
      }`}
      role={isError ? "alert" : "status"}
    >
      {message}
    </p>
  );
}
