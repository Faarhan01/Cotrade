# Stage 3 — SSE streams (live price + positions)

**Goal:** Replace ScalarAI's WebSocket transport with Cotrade's SSE streams so prices and positions update live.

**Depends on:** Stage 2 (adapter + composed status working).

## 3.1 Why SSE, not WebSocket

Cotrade has no WebSocket server. It exposes:

- `GET /stream/portfolio?interval=1` -> event `portfolio`
- `GET /stream/ticks?symbols=...&interval=1` -> event `tick`
- `GET /stream/marketbook?symbols=...&interval=1` -> event `marketbook`

EventSource handles reconnection and applies the server's `retry:` hint automatically. Do not wrap in fetch.

## 3.2 Create SSE hook

Create `frontend/src/hooks/useCotradeStream.ts`:

```ts
import { useEffect, useRef, useCallback } from "react";

const BASE = import.meta.env.VITE_COTRADE_URL || "http://localhost:3000";

export function useCotradeStream(options: {
  symbols: string[];
  onPortfolio: (msg: any) => void;
  onTick: (msg: any) => void;
  onStatusChange?: (connected: boolean) => void;
}) {
  const { symbols, onPortfolio, onTick, onStatusChange } = options;
  const portfolioRef = useRef<EventSource | null>(null);
  const tickRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const p = new EventSource(`${BASE}/stream/portfolio?interval=1`);
    portfolioRef.current = p;
    p.addEventListener("open", () => onStatusChange?.(true));
    p.addEventListener("portfolio", (e) => {
      try { onPortfolio(JSON.parse((e as MessageEvent).data)); } catch {}
    });
    p.addEventListener("error", () => onStatusChange?.(false));

    const symParam = symbols.length ? `&symbols=${symbols.map(encodeURIComponent).join(",")}` : "";
    const t = new EventSource(`${BASE}/stream/ticks?interval=1${symParam}`);
    tickRef.current = t;
    t.addEventListener("tick", (e) => {
      try { onTick(JSON.parse((e as MessageEvent).data)); } catch {}
    });
    t.addEventListener("error", () => onStatusChange?.(false));

    return () => { p.close(); t.close(); };
  }, [symbols.join(",")]);

  return { portfolioRef, tickRef };
}
```

## 3.3 Wire into App.tsx

Replace `useWebSocket` usage:

```ts
import { useCotradeStream } from "./hooks/useCotradeStream";

const { wsConnected, ... } = ...; // keep wsConnected state for Header
const [wsConnected, setWsConnected] = useState(false);

useCotradeStream({
  symbols: symbolStates.map((s) => s.symbol),
  onPortfolio: (msg) => {
    if (msg.balance !== undefined) setConfig((prev) => ({ ...prev })); // placeholder
    // update account via setConnection? Instead update a new account state
    setTradesList((prev) => prev); // positions update below
    // positions
    if (msg.positions) setTradesList(msg.positions.map(toTradeRecord));
    // account figures: store in a state or pass to Header via connection
    setConnection((prev) => ({
      ...prev,
      balance: msg.balance, /* if connection has balance */
    }));
    setStats((prev) => ({ ...prev, activePositionsCount: msg.position_count }));
  },
  onTick: (msg) => {
    const symbols = msg.symbols || {};
    const first = Object.values(symbols)[0] as any;
    if (first?.bid !== undefined) setCurrentPrice(first.bid);
    // append tick to history for chart seed (optional)
    if (first) {
      setHistory((prev) => [...prev, {
        time: first.time, price: first.bid, open: first.bid,
        high: first.bid, low: first.bid, close: first.bid,
      }].slice(-100));
    }
    // update watchlist rows price in symbolStates
    setSymbolStates((prev) => prev.map((s) => {
      const t = symbols[s.symbol];
      return t ? { ...s, currentPrice: t.bid } : s;
    }));
  },
  onStatusChange: setWsConnected,
});
```

Note: Cotrade's `portfolio` event sends `positions` as MT5 position objects; convert with `toTradeRecord` before storing in `tradesList`. You may want separate state for account figures; reuse `connection` or add `account` state. Keep minimal: store balance/equity in `connection` if its type allows, else add `const [account, setAccount]`.

## 3.4 Handle SSE merge semantics

Cotrade sends only changed symbols in `tick` events. When updating `symbolStates`, merge by symbol rather than replacing the whole list:

```ts
setSymbolStates((prev) => {
  const next = [...prev];
  for (const [name, t] of Object.entries(msg.symbols || {})) {
    const idx = next.findIndex((s) => s.symbol === name);
    if (idx >= 0) next[idx] = { ...next[idx], currentPrice: (t as any).bid };
  }
  return next;
});
```

## 3.5 Remove useWebSocket import

Delete `import { useWebSocket } from "./hooks/useWebSocket"` and remove the old `useWebSocket({...})` call. Keep `sendWsMessage` references replaced: trading controls no longer use WS; handle via REST in Stage 9.

## 3.6 Verification

- Open DevTools Network: two EventSource connections to `/stream/portfolio` and `/stream/ticks`.
- Prices in Header/watchlist update without polling.
- Positions update when a trade opens/closes.

## Success criteria

- No WebSocket errors in console.
- Live price updates visible in Header.
- Positions list updates on portfolio event.