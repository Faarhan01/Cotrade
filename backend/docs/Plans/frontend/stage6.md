# Stage 6 — History

**Goal:** Wire the history view to Cotrade's `/history/*` endpoints (deals, orders, totals, summary).

**Depends on:** Stage 2.

## 6.1 Adapter methods

Add to `frontend/src/services/cotrade.ts`:

```ts
export async function getHistoryDeals(days = 7, limit = 500) {
  const data = await cotradeGet(`/history/deals?days=${days}`);
  return { count: data.count, deals: data.deals || [] };
}

export async function getHistorySummary(days = 7) {
  return cotradeGet(`/history/summary?days=${days}`); // { from, to, deal_count, realized_profit, commission, swap, net, by_side }
}

export async function getHistoryTotals(days = 7) {
  return cotradeGet(`/history/totals?days=${days}`); // { from, to, deals, orders }
}

export async function getHistoryOrders(days = 7) {
  return cotradeGet(`/history/orders?days=${days}`);
}
```

Note: Cotrade's `/history/deals` accepts `days` (default 2) and `symbol` (optional). Also `/history/deals?from=&to=` for explicit date range (ISO). `/history/orders` same. `/history/summary?days=N` or `?from=&to=`. `/history/totals?days=N`. Date range capped at 365 days (HISTORY_MAX_DAYS).

## 6.2 Deal shape

```json
{
  "ticket": 9709110341, "order": 9836301539,
  "time": 1791643105, "time_msc": 1791643105093,
  "type": 0, "entry": 0, "magic": 889900,
  "position_id": 9836301539, "reason": 3,
  "volume": 0.1, "price": 7350.7,
  "commission": 0.0, "swap": 0.0, "profit": 0.0, "fee": 0.0,
  "symbol": "Step Index", "comment": "COPILOT_DESK",
  "external_id": "", "_type": "buy", "_entry": "in"
}
```

`_type` is "buy"/"sell"; `_entry` is "in"/"out". Profit is on "out" deals.

## 6.3 Summary shape

```json
{
  "from": "...", "to": "...", "deal_count": 70,
  "realized_profit": -237.82, "commission": 0.0,
  "swap": -10.59, "net": -248.41,
  "by_side": { "buy": 48.91, "sell": -286.73 }
}
```

Note: Cotrade's `net` = realized + swap (commission excluded per known issue in TODO). Display as reported; don't recompute.

## 6.4 Component work

ScalarAI has no dedicated history component beyond `TradeList`. Options:

- **Reuse `TradeList`** with deals mapped to trade records, plus a summary card row (realized profit, commission, swap, net) using `StatsCards` or a new small component.
- Add a "History" tab in `App.tsx` TabBar.

Mapping deals to `TradeRecord`-like rows for `TradeList`:

```ts
function dealToRow(d: any) {
  return {
    ticket: d.ticket, type: d._type?.toUpperCase() || (d.type === 0 ? "BUY" : "SELL"),
    lotSize: d.volume, entryPrice: d.price, sl: 0, tp: 0,
    closePrice: d.price, profit: d.profit, status: d._entry === "out" ? "CLOSED" : "OPEN",
    openTime: new Date((d.time_msc || d.time * 1000)).toLocaleString(),
    symbol: d.symbol, strategy: d.comment || "", reason: d.comment || "",
  };
}
```

## 6.5 Stats wiring

In `App.tsx`, after `getStatus()`, also fetch summary for stats cards:

```ts
const summary = await getHistorySummary(7);
setStats((prev) => ({
  ...prev,
  totalProfit: summary.realized_profit ?? 0,
  tradesCount: summary.deal_count ?? 0,
}));
```

Win rate: compute client-side from deals (count `_entry === "out"` with profit > 0 / total out deals). Optional.

## 6.5b StatsCards props (from ScalarAI)

`StatsCards` expects:
```
stats: { totalProfit, tradesCount, winRate, activePositionsCount }
config: { isActive }
onResetStats: () => void
```
Map from Cotrade:
- `totalProfit` <- `/history/summary.realized_profit`
- `tradesCount` <- `/history/summary.deal_count`
- `winRate` <- compute client-side (profitable out-deals / total out-deals) or 0
- `activePositionsCount` <- `/positions.count` or `/totals.positions`
- `config.isActive` <- local flag (Cotrade has no global toggle; default false)
- `onResetStats` <- local counter clear or `/close-all`

## 6.6 Verification

- History tab renders deals with time, symbol, side, volume, price, P/L, swap, comment.
- Summary cards show realized profit, commission, swap, net.
- Date range filter works (pass days).

## Success criteria

- No `/history/*` 404s.
- Deals render with correct broker-time formatting.