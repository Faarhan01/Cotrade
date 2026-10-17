import { useCallback, useState } from "react";
import { closeAll, createBotSession, stopBotSession } from "../services/cotrade";

export interface TradingControls {
  botSessionId: string | null;
  toggleTradingExecution: (sendWsMessage: (msg: any) => boolean, config: any, fetchStatus: () => void) => Promise<void>;
  closeAllPositions: (sendWsMessage: (msg: any) => boolean, fetchStatus: () => void) => Promise<void>;
  resetStats: (sendWsMessage: (msg: any) => boolean, fetchStatus: () => void) => Promise<void>;
}

export function useTradingControls(): TradingControls {
  const [botSessionId, setBotSessionId] = useState<string | null>(null);

  const toggleTradingExecution = useCallback(async (_sendWsMessage, config, fetchStatus) => {
    const symbol = config?.selectedAssets?.[0] || config?.symbol || "EURUSD";
    const strategy = config?.selectedStrategy || "ma_cross_20_50";
    if (config?.isActive && botSessionId) {
      try {
        await stopBotSession(botSessionId, { trades_count: 0, pnl_pips: 0 });
        setBotSessionId(null);
      } catch (e) {
        console.error("Error stopping bot:", e);
      }
    } else {
      try {
        const res = await createBotSession({
          strategy_name: strategy,
          symbol,
          timeframe: "M1",
          magic: 0,
          dry_run: true,
        });
        setBotSessionId(res.session_id || null);
      } catch (e) {
        console.error("Error starting bot:", e);
      }
    }
    fetchStatus();
  }, [botSessionId]);

  const closeAllPositions = useCallback(async (_sendWsMessage, fetchStatus) => {
    try {
      await closeAll();
      fetchStatus();
    } catch (e) {
      console.error("Error closing positions:", e);
    }
  }, []);

  const resetStats = useCallback(async (_sendWsMessage, fetchStatus) => {
    fetchStatus();
  }, []);

  return { botSessionId, toggleTradingExecution, closeAllPositions, resetStats };
}