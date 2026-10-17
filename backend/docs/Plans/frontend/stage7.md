# Stage 7 — Research (Risk & Strategy tab)

**Goal:** Wire the Risk & Strategy tab to Cotrade's `/research/*` endpoints (catalogue, patterns, indicators, strategies, stored strategies, backtest, sweep, pattern scan, library).

**Depends on:** Stage 2.

## 7.1 Adapter methods

Add to `frontend/src/services/cotrade.ts`:

```ts
export async function getResearchStored() {
  const data = await cotradeGet("/research/stored");
  return data.strategies || [];
}
export async function getResearchStrategy(name: string) {
  return cotradeGet(`/research/strategy/${encodeURIComponent(name)}`);
}
export async function getResearchLibrary() {
  return cotradeGet("/research/library");
}
export async function getResearchCatalogue() {
  return cotradeGet("/research/catalogue");
}
export async function getResearchIndicators() {
  return cotradeGet("/research/indicators");
}
export async function getResearchPatterns() {
  return cotradeGet("/research/patterns");
}
export async function getResearchStrategies() {
  return cotradeGet("/research/strategies");
}
export async function runBacktest(body: any) {
  return cotradePost("/research/backtest", body);
}
export async function runSweep(body: any) {
  return cotradePost("/research/sweep", body);
}
export async function scanPatterns(body: any) {
  return cotradePost("/research/patterns/scan", body);
}
export async function runIndicator(body: any) {
  return cotradePost("/research/indicator", body);
}
export async function getReportsBest() {
  return cotradeGet("/research/reports/best");
}
```

## 7.1b Exact request/response payloads

Pattern scan:
```
POST /research/patterns/scan
body: { "symbol": "Step Index 200", "timeframe": "M15", "count": 2000 }
response: { symbol, timeframe, bars, spread_pct, matches, density_per_100_bars,
  busiest_pattern_per_100_bars, significant_after_correction: [...],
  cost_marginal: [...], tradable_as_signalled: [...], tradable_inverted: [...],
  follow_through: { "<pattern>": { n, hit_rate, mean_move_pct, mean_edge_pct,
    mean_edge_pct_net, t_statistic_edge, t_statistic_net, verdict,
    trade_direction, cost_marginal, baseline_pct } } }
```

Strategy validate:
```
POST /research/strategy/validate
body: <strategy JSON object>  OR  { "strategy_name": "<name>" }
response: { valid: bool, problems: [...], strategy, interpretation, split_check: { consistent, test_t } }
```

Backtest:
```
POST /research/backtest
body: { "strategy": <strategy or name>, "symbol": "...", "timeframe": "M15", "count": 2000 }
response: { verdict, interpretation, split_check, ... metrics }
```

Library:
```
GET /research/library  -> { strategies: [ { name, description, entry_name, entry_params (JSON string), exit_rule (JSON string), sizing (JSON string), ... } ] }
```

Catalogues:
```
GET /research/catalogue   -> list of available entries
GET /research/indicators  -> indicator catalogue
GET /research/patterns    -> pattern catalogue
GET /research/strategies  -> strategy templates
```

## 7.2 Stored strategy shape

```json
{
  "id": 21, "name": "bollinger_reversion",
  "description": "Buy at lower Bollinger Band, sell at upper.",
  "symbol": "", "timeframe": "M1",
  "entry_name": "bollinger_band_entry",
  "entry_params": "{\"period\": 20, \"mult\": 2.0, \"mode\": \"reversion\"}",
  "exit_rule": "{\"take_profit\": 15, \"stop_loss\": 15, ...}",
  "sizing": "{\"mode\": \"fixed\", \"lots\": 0.1, ...}",
  "spread_pips": 0.0, "tags": "[]", "enabled": 1,
  "version": 1, "created": "...", "updated": "...", "deleted_at": null
}
```

`entry_params`, `exit_rule`, `sizing` are JSON strings — parse with `JSON.parse` when displaying.

## 7.3 fetchStrategies wiring

Replace `fetchStrategies` in `App.tsx`:

```ts
const fetchStrategies = useCallback(async () => {
  try {
    const list = await getResearchStored();
    setStrategiesList(list);
  } catch (e) { showError("Failed to fetch strategies"); }
}, [showError]);
```

## 7.4 KnowledgeBase component

`KnowledgeBase` expects `strategiesList: StrategyItem[]` where `StrategyItem = { id, name, description, mode, category, tags, performance? }`.

Cotrade `/research/stored` returns strategies with `{ id, name, description, symbol, timeframe, entry_name, entry_params (JSON string), exit_rule (JSON string), sizing (JSON string), tags ("[]"), ... }`. Map:

```ts
const items = stored.map((s) => ({
  id: String(s.id),
  name: s.name,
  description: s.description || s.entry_name,
  mode: s.timeframe || "M1",
  category: s.entry_name || "strategy",
  tags: JSON.parse(s.tags || "[]"),
}));
```

Pass `strategiesList={items}`.

## 7.4b TradePanel props (from ScalarAI)

`TradePanel` expects:
```
config, aiStudyStatus, aiKnowledgeBase, aiSynthesizedStrategy,
strategiesList, onToggleTradingExecution, onApplySettings, selectedStrategy
```
- `aiStudyStatus` -> stub "calibrating" or "optimized".
- `aiKnowledgeBase` -> null (or stub).
- `aiSynthesizedStrategy` -> null.
- `strategiesList` -> mapped items above.
- `onToggleTradingExecution` -> local flag toggle or bot session start.
- `onApplySettings` -> local settings apply (Stage 9).

Feed `strategiesList` (from `/research/stored`) into `KnowledgeBase`. It currently expects a list; Cotrade's list has `name`, `description`, `entry_name`, `entry_params`, etc. Display name + description + entry rule.

## 7.5 Risk & Strategy tab layout

Reuse ScalarAI's `TradePanel` (shows selected strategy, lot size, TP/SL inputs) + `KnowledgeBase`. Wire:

- Strategy dropdown from `strategiesList`.
- "Apply settings" -> local state update (Stage 6/9: apply to order calls).
- Pattern scan / backtest forms -> call adapter methods, display results in a panel.

For pattern scan: form with symbol, timeframe, pattern -> `scanPatterns({ symbol, timeframe, ... })`. Display returned hits/frequency.

For backtest: form with strategy name, symbol, timeframe, from/to -> `runBacktest(...)`. Display metrics (profit, win rate, trades).

## 7.6 Verification

- Strategies list populates from `/research/stored`.
- Backtest form returns results and renders without errors.
- Pattern scan returns hits.

## Success criteria

- Risk & Strategy tab functional against Cotrade research endpoints.
- No `/api/strategies` or `/api/ai-study-feed` 404s.