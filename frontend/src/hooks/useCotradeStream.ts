import { useEffect, useRef } from "react";

const BASE = import.meta.env.VITE_COTRADE_URL || "";

export function useCotradeStream(options: {
  symbols: string[];
  onPortfolio: (msg: any) => void;
  onTick: (msg: any) => void;
  onStatusChange?: (connected: boolean) => void;
}) {
  const { symbols } = options;
  const onPortfolioRef = useRef(options.onPortfolio);
  const onTickRef = useRef(options.onTick);
  const onStatusRef = useRef(options.onStatusChange);
  onPortfolioRef.current = options.onPortfolio;
  onTickRef.current = options.onTick;
  onStatusRef.current = options.onStatusChange;

  const portfolioRef = useRef<EventSource | null>(null);
  const tickRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const p = new EventSource(`${BASE}/stream/portfolio?interval=1`);
    portfolioRef.current = p;
    p.addEventListener("open", () => onStatusRef.current?.(true));
    p.addEventListener("portfolio", (e) => {
      try { onPortfolioRef.current(JSON.parse((e as MessageEvent).data)); } catch {}
    });
    p.addEventListener("error", () => onStatusRef.current?.(false));

    const symParam = symbols.length ? `&symbols=${symbols.map(encodeURIComponent).join(",")}` : "";
    const t = new EventSource(`${BASE}/stream/ticks?interval=1${symParam}`);
    tickRef.current = t;
    t.addEventListener("tick", (e) => {
      try { onTickRef.current(JSON.parse((e as MessageEvent).data)); } catch {}
    });
    t.addEventListener("error", () => onStatusRef.current?.(false));

    return () => { p.close(); t.close(); };
  }, [symbols.join(",")]);

  return { portfolioRef, tickRef };
}