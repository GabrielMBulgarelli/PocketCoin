import { apiGet, apiJson } from "./client";

export type Backup = {
  id: string;
  created_at: string;
  size_bytes: number;
  reason: "manual" | "pre_restore";
};

export type RestoreResult = {
  restored_backup_id: string;
  pre_restore_backup: Backup;
};

export function listBackups(signal?: AbortSignal): Promise<Backup[]> {
  return apiGet<Backup[]>("/api/backups", { signal });
}

export function createBackup(): Promise<Backup> {
  return apiJson<Backup>("/api/backups", { method: "POST" });
}

export function restoreBackup(id: string, confirmation: string): Promise<RestoreResult> {
  return apiJson<RestoreResult>(`/api/backups/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
}
