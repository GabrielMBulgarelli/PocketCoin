import { getApiErrorMessage } from "./error";

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

async function backupRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(await getApiErrorMessage(response));
  return response.json() as Promise<T>;
}

export function listBackups(): Promise<Backup[]> {
  return backupRequest<Backup[]>("/api/backups");
}

export function createBackup(): Promise<Backup> {
  return backupRequest<Backup>("/api/backups", { method: "POST" });
}

export function restoreBackup(id: string, confirmation: string): Promise<RestoreResult> {
  return backupRequest<RestoreResult>(`/api/backups/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
}
