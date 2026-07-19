import { useRef, useState } from "react";

export type ExportStatus = "idle" | "exporting" | "success" | "error";

export function useCsvExport() {
  const active = useRef(false);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [message, setMessage] = useState("");

  const start = async (operation: () => Promise<unknown>) => {
    if (active.current) return;
    active.current = true;
    setStatus("exporting");
    setMessage("Exporting CSV…");
    try {
      await operation();
      setStatus("success");
      setMessage("CSV exported successfully.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The CSV export failed.");
    } finally {
      active.current = false;
    }
  };

  return { status, message, start };
}
