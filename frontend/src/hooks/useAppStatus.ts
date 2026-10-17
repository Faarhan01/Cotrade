import { useCallback, useEffect } from "react";
import { getStatus } from "../services/cotrade";

export interface StatusSyncOptions {
  onStatus: (data: any) => void;
  onInit?: (data: any) => void;
}

export function useAppStatus(options: StatusSyncOptions) {
  const { onStatus, onInit } = options;

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getStatus();
      onStatus(data);
      onInit?.(data);
    } catch {
      // Fallback
    }
  }, [onStatus, onInit]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { fetchStatus };
}