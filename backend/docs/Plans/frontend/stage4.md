# Stage 4 — Candles + PriceChart

**Goal:** Feed the PriceChart component with M1 candles from Cotrade's `/candles/{symbol}` endpoint.

**Depends on:** Stage 3 (SSE live price working).

## 4.1 Adapter method

Add to `frontend/src/services/cotrade.ts`:

```ts
export async function getCandles(symbol: string, limit = 1000, timeframe = "M1") {
  const data = await cotradeGet(
    `/candles/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}&count=${limit}`
  );
  return { candles: data.candles || [] };
}
```

Cotrade response shape:

```json
{
  "symbol": "Step Index 200",
  "timeframe": 1,
  "timeframe_name": "M1",
  "count": 1000,
  "candles": [
    { "time": 1792209480, "open": 10810.5, "high": 10812.3,
      "low": 10810.3, "close": 10810.7, "tick_volume": 60,
      "spread": 2, "real_volume": 0 }
  ]
}
```

## 4.2 Replace fetch in App.tsx

Find the `useEffect` that fetches `/api/market/candles` on `activeSymbol` change:

```ts
useEffect(() => {
  if (!activeSymbol) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  getCandles(activeSymbol, 1000)
    .then((data) => {
      if (data.candles && Array.isArray(data.candles)) {
        setCandles((prev) => mergeCandles(prev, data.candles).slice(-2000));
      }
    })
    .catch(() => { /* keep existing candles */ })
    .finally(() => clearTimeout(timeout));

  return () => { clearTimeout(timeout); controller.abort(); };
}, [activeSymbol]);
```

Remove the old `fetch("/api/market/candles?...")` block.

## 4.3 mergeCandles compatibility

Cotrade candles already have `{ time, open, high, low, close }`, matching `useChartData`'s `CandleData`. No transform needed. `tick_volume`/`spread`/`real_volume` are extra fields; ignored by chart.

## 4.3b Cotrade candle query options

Cotrade `/candles/{symbol}` supports multiple query forms:
- `?count=N` — N bars back from now (default 100, max MAX_CANDLES).
- `?from=&to=` — date window (ISO), capped to MAX_CANDLES bars; narrowed if too wide.
- `?start=N&count=M` — positional, 0 is the forming bar.
- `?timeframe=M1|M5|M15|M30|H1|H4|D1|W1|MN1` (default M1).

For the chart, use `?timeframe=M1&count=400` (Cotrade old frontend used 400 bars). Timeframe names map to MT5 constants server-side.

## 4.4 Timeframe handling

Cotrade supports timeframe names (M1, M5, M15, M30, H1, H4, D1, etc.). ScalarAI's chart uses whatever candles it receives. For now hardcode M1. Later, add a timeframe selector calling `getCandles(symbol, 1000, selectedTimeframe)`.

## 4.5 lastStrategySignal

Cotrade has no strategy signal stream. Set `lastStrategySignal` to null always (or remove prop). PriceChart should handle null gracefully (check component; it likely does).

## 4.5b PriceChart props (from ScalarAI)

`PriceChart` expects:
```
activeSymbol, currentPrice, candleDataLength, latency,
showEma, showBollingerBands, chartData (from useChartData),
lastStrategySignal, selectedStrategy,
onToggleEma, onToggleBollingerBands
```
- `chartData` comes from `useChartData(candles, history, 80)`.
- `lastStrategySignal` -> pass `null` (Cotrade has no strategy signal stream).
- `selectedStrategy` -> `config.selectedStrategy` (default TREND_FOLLOWING).
- `showEma`/`showBollingerBands` -> local state (default true/false).
- `latency` -> pingLatency or 0.

## 4.6 Verification

- Select a symbol; chart should render M1 candles.
- Switching symbols refetches candles.
- Live tick updates (Stage 3) append to history for chart continuity.

## Success criteria

- PriceChart displays candles from Cotrade.
- No `/api/market/candles` 404s.
- Chart updates on symbol switch within ~1s.