# Stage 2 — Adapter skeleton + composed status (core data)

**Goal:** Create the data-layer adapter that maps ScalarAI's `/api/*` expectations to Cotrade's unprefixed REST, starting with a composed `/api/status` equivalent so the shell renders real account/positions/symbols data.

**Depends on:** Stage 1 (dev servers running, `VITE_COTRADE_URL` set).

## 2.1 Create adapter file

Create `frontend/src/services/cotrade.ts`. This is the single place Cotrade calls live; components/hooks import from here instead of `/api`.

```ts
const BASE = import.meta.env.VITE_COTRADE_URL || "http://localhost:3000";

export async function cotradeGet(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function cotradePost(path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}
```

## 2.2 Map Cotrade position to TradeRecord

Add a helper in the same file:

```ts
export function toTradeRecord(p: any) {
  return {
    ticket: p.ticket,
    type: (p._type || (p.type === 0 ? "BUY" : "SELL")).toUpperCase(),
    lotSize: p.volume,
    entryPrice: p.price_open,
    sl: p.sl,
    tp: p.tp,
    closePrice: p.price_current,
    profit: p.profit,
    status: "OPEN",
    openTime: new Date((p.time_msc || p.time * 1000)).toLocaleString(),
    symbol: p.symbol,
    strategy: p.comment || "",
    reason: p.comment || "",
  };
}
```

## 2.3 Implement `getStatus()`

Compose from 9 parallel Cotrade calls. **Filter symbols to selected/visible and cap at 24** (Cotrade's `_watchlist` logic in `views.py`); never send all 731.

```ts
export async function getStatus(): Promise<StatusResponse> {
  const [health, account, terminal, totals, positions, orders, portfolio, summary, symbols] =
    await Promise.all([
      cotradeGet("/health"), cotradeGet("/account"), cotradeGet("/terminal"),
      cotradeGet("/totals"), cotradeGet("/positions"), cotradeGet("/orders"),
      cotradeGet("/portfolio"), cotradeGet("/history/summary"),
      cotradeGet("/symbols"),
    ]);
  const selected = (symbols.symbols || [])
    .filter((s: any) => s.select || s.visible)
    .slice(0, 24);

  return {
    config: {
      isActive: false,
      selectedStrategy: "TREND_FOLLOWING",
      lotSize: 0.1, takeProfitPoints: 300, stopLossPoints: 150,
      trailingStopPoints: 100, useTrailingStop: true, maxTrades: 3,
      isAiModeEnabled: false, tradingMode: "Scalping",
      selectedAssets: selected.map((s: any) => s.name),
      mt5Path: terminal.path, appEndpoint: BASE,
    },
    connection: {
      isEaConnected: !!health.mt5_connected, clientIp: null, lastPing: null,
      broker: account.server, accountNumber: account.login,
      balance: account.balance, symbol: selected[0]?.name ?? null,
      symbolDigits: selected[0]?.digits ?? null,
      symbolTickSize: selected[0]?.trade_tick_size ?? null,
      symbolDescription: selected[0]?.description ?? null,
    },
    isBridgeConnected: !!health.mt5_connected,
    logs: [],
    trades: (positions.positions || []).map(toTradeRecord),
    history: [],
    status: health.status || "ok",
    currentPrice: selected[0]?.bid ?? 0,
    activeSymbol: selected[0]?.name ?? "",
    symbolStates: selected.map((s: any) => ({
      symbol: s.name, connection: health.connection,
      currentPrice: s.bid, tickCount: 0,
    })),
    aiSynthesizedStrategy: null,
    stats: {
      totalProfit: summary.realized_profit ?? 0,
      tradesCount: summary.deal_count ?? 0,
      winRate: 0,
      activePositionsCount: positions.count ?? (positions.positions || []).length,
      lastHeartbeatTime: null,
    },
    webRequestStatus: null,
  };
}
```

## 2.4 Wire `useAppStatus` to adapter

Edit `frontend/src/hooks/useAppStatus.ts`:

```ts
import { getStatus } from "../services/cotrade";

export function useAppStatus(options) {
  const { onStatus, onInit } = options;
  const fetchStatus = useCallback(async () => {
    try {
      const data = await getStatus();
      onStatus(data);
      onInit?.(data);
    } catch (e) { /* fallback */ }
  }, [onStatus, onInit]);
  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  return { fetchStatus };
}
```

## 2.4b Header prop mapping (Cotrade -> ScalarAI)

`Header` expects `connection: EAConnectionDetails` with fields `isEaConnected, clientIp, lastPing, broker, accountNumber, balance, symbol, symbolDigits, symbolTickSize, symbolDescription`. Cotrade `/account` provides `server, login, balance, currency`; `/terminal` provides `build, path, trade_allowed`; `/symbols` selected entry provides `name, digits, trade_tick_size, description`. Map accordingly. `isBridgeConnected` <- `/health.mt5_connected`. `symbolStates` <- selected symbols (max 24) with `currentPrice = bid`.

## 2.5 Update `App.tsx` initial status

Replace `fetch("/api/status")` block with adapter. Keep the same state setters; just change the fetch call to `getStatus()`.

```ts
import { getStatus } from "./services/cotrade";
// ...
const fetchStatus = useCallback(async () => {
  try {
    const data = await getStatus();
    if (data.config) setConfig(data.config);
    if (data.connection) setConnection(data.connection);
    if (data.isBridgeConnected !== undefined) setIsBridgeConnected(!!data.isBridgeConnected);
    if (data.logs) setLogs(data.logs);
    if (data.trades) setTradesList(data.trades);
    if (data.history) setHistory(data.history);
    if (data.candles) setCandles(data.candles);
    if (data.currentPrice !== undefined) setCurrentPrice(data.currentPrice);
    if (data.symbolStates) setSymbolStates(data.symbolStates);
    if (data.activeSymbol) setActiveSymbol(data.activeSymbol);
    else if (data.symbolStates?.length) setActiveSymbol(data.symbolStates[0].symbol);
    if (data.stats) setStats(data.stats);
    if (data.aiSynthesizedStrategy) setAiSynthesizedStrategy(data.aiSynthesizedStrategy);
  } catch (e) { showError("Failed to fetch server status"); }
}, [showError]);
```

## 2.6 Relax types

Edit `frontend/src/types/api.ts`: make most fields optional to accommodate Cotrade shapes. At minimum, `StatusResponse` fields should be optional (`config?`, `connection?`, etc.) so partial compositions don't fail typecheck.

## 2.7 Remove `/api/strategies` call site (temporarily)

In `App.tsx`, `fetchStrategies` calls `/api/strategies`. Stub it to `[]` for now (Stage 7 wires `/research/stored`).

```ts
const fetchStrategies = useCallback(async () => {
  setStrategiesList([]);
}, []);
```

## 2.8 Verify

- Reload `:5173`. Header should show account balance/equity from Cotrade.
- Positions table should show open positions.
- Watchlist should show up to 24 selected symbols.
- No `/api/*` 404s except the ones we stubbed.

## 2.9 CORS / environment note

Cotrade sends `Access-Control-Allow-Origin: *` by default, so dev cross-origin works. In production, set `CONY_CORS_ORIGIN` to the frontend origin. No backend code change needed.

## Success criteria

- `getStatus()` returns composed data without runtime errors.
- Header + positions + watchlist render real Cotrade data.
- TypeScript compiles (`npm run lint`) with only warnings.