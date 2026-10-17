# Stage 9 — Trade actions

**Goal:** Wire buy/sell/close/modify/cancel actions to Cotrade's order endpoints.

**Depends on:** Stage 3 (positions updating).

## 9.1 Cotrade order endpoints

From `handlers.py` / `routes`: `POST /order`, `/buy`, `/sell`, `/close`, `/close-all`, `/modify`, `/cancel`, `/order/check`. Also `/calc/margin`, `/calc/profit`, `/calc/size`.

Exact body fields must be verified in `handlers.py` before wiring. General shape expected:

- `/buy` body: `{ "symbol": "EURUSD", "volume": 0.1, "sl": 0, "tp": 0, "comment": "..." }`
- `/sell` same.
- `/close` body: `{ "ticket": 12345 }` or `{ "symbol": "EURUSD" }`.
- `/close-all` body: `{ "symbol": "EURUSD" }` (optional) — closes all or by symbol.
- `/modify` body: `{ "ticket": 12345, "sl": ..., "tp": ... }`.
- `/cancel` body: `{ "ticket": 12345 }`.
- `/order/check` body: same as /order, returns margin check.

## 9.2 Adapter methods

Add to `frontend/src/services/cotrade.ts`:

```ts
// Buy: { symbol, volume (min 1e-5), sl?, tp?, comment?, magic?, deviation? }
export async function buyOrder(body: any) { return cotradePost("/buy", body); }
// Sell: same shape
export async function sellOrder(body: any) { return cotradePost("/sell", body); }
// Close: { ticket (required), volume? (partial close), deviation?, magic?, comment? }
export async function closePosition(body: any) { return cotradePost("/close", body); }
// Close all: { symbol? (optional, else all), magic? }
export async function closeAll(body?: any) { return cotradePost("/close-all", body || {}); }
// Modify: { ticket (required), sl? and/or tp? (at least one) }
export async function modifyPosition(body: any) { return cotradePost("/modify", body); }
// Cancel pending order: { ticket (required) }
export async function cancelOrder(body: any) { return cotradePost("/cancel", body); }
// Dry run: same body as /order
export async function checkOrder(body: any) { return cotradePost("/order/check", body); }
// Generic pending order: { symbol, volume, order_type, action, type_filling?, type_time?, deviation?, magic?, comment?, sl?, tp?, price?, position?, order?, expiration? }
export async function placeOrder(body: any) { return cotradePost("/order", body); }
```

## 9.3 TradingControls rewrite

Replace `frontend/src/hooks/useTradingControls.ts` to use adapter instead of WS/`/api/*`:

```ts
export function useTradingControls() {
  const toggleTradingExecution = useCallback(async (_send, config, fetchStatus) => {
    // Cotrade has no global toggle; map to local flag or bot session.
    // For now, toggle local state only:
    fetchStatus();
  }, []);

  const closeAllPositions = useCallback(async (_send, fetchStatus) => {
    try { await closeAll(); fetchStatus(); } catch (e) { console.error(e); }
  }, []);

  const resetStats = useCallback(async (_send, fetchStatus) => {
    // Cotrade has no reset-stats; clear local counters only.
    fetchStatus();
  }, []);

  return { toggleTradingExecution, closeAllPositions, resetStats };
}
```

## 9.4 TradeList wiring

- Close button on a row -> `closePosition({ ticket })` then `fetchStatus()`.
- "Close all" -> `closeAll()` (or `closeAll({ symbol: activeSymbol })`) then `fetchStatus()`.
- Modify SL/TP in trade detail modal -> `modifyPosition({ ticket, sl, tp })` then `fetchStatus()`.
- Buy/Sell buttons (if added) -> `buyOrder`/`sellOrder` with `{ symbol: activeSymbol, volume: lotSize, sl, tp, comment }`.

## 9.5 Settings apply -> order params

`useSettings.applySettings` currently POSTs to `/api/settings`. Change to local state only (no backend call), then `fetchStatus()`. Lot size / TP / SL / trailing inputs are used when placing orders (Stage 9.4).

## 9.6 Verification

- Close a position -> position disappears from list after refresh.
- Modify SL/TP -> position updates.
- Close all -> all positions close.

## Success criteria

- Trade actions call Cotrade endpoints and reflect in UI.
- No `/api/toggle-trade`, `/api/reset-stats`, `/api/settings` 404s.