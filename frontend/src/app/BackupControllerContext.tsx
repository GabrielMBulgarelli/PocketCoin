import { createContext, type ReactNode, useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createBackup } from "../api/backups";
import { queryKeys } from "./queryKeys";

type BackupController = ReturnType<typeof useCreateBackupMutation>;

const BackupControllerContext = createContext<BackupController | null>(null);

function useCreateBackupMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createBackup,
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.backups }),
  });
}

export function BackupControllerProvider({ children }: { children: ReactNode }) {
  const controller = useCreateBackupMutation();
  return <BackupControllerContext.Provider value={controller}>{children}</BackupControllerContext.Provider>;
}

export function useBackupController() {
  const controller = useContext(BackupControllerContext);
  if (!controller) throw new Error("useBackupController must be used inside BackupControllerProvider");
  return controller;
}
