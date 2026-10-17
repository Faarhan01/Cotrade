# Stage 8 — Bot & Database tab

**Goal:** Wire the Bot & Database tab to Cotrade's `/bot/*` and `/db/*` endpoints.

**Depends on:** Stage 2.

## 8.1 Adapter methods

Add to `frontend/src/services/cotrade.ts`:

```ts
export async function getBotStatus() { return cotradeGet("/bot/status"); }
export async function getBotStrategies() { return cotradeGet("/bot/strategies"); }
export async function getBotSessions() { return cotradeGet("/bot/sessions"); }
export async function getBotSession(id: string) { return cotradeGet(`/bot/sessions/${encodeURIComponent(id)}`); }
export async function getBotSessionLogs(id: string) { return cotradeGet(`/bot/sessions/${id}/logs`); }
export async function pauseBotSession(id: string) { return cotradePost(`/bot/sessions/${id}/pause`); }
export async function resumeBotSession(id: string) { return cotradePost(`/bot/sessions/${id}/resume`); }
export async function stopBotSession(id: string) { return cotradePost(`/bot/sessions/${id}/stop`); }
export async function createBotSession(body: any) { return cotradePost("/bot/sessions", body); }

export async function getDbStats() { return cotradeGet("/db/stats"); }
export async function getDbReports() { return cotradeGet("/db/reports"); }
export async function getDbIntegrity() { return cotradeGet("/db/integrity"); }
export async function getDbSessions() { return cotradeGet("/db/sessions"); }
export async function vacuumDb() { return cotradePost("/db/vacuum"); }
```

## 8.2 Bot status shape

```json
{ "status": "ready", "connected_to_mt5": true, "engine": "live_mt5_bridge", "subscribed_books": [] }
```

## 8.3 DB stats shape

```json
{
  "path": "C:\\...\\peron.db",
  "strategies": 18, "reports": 0, "report_trades": 0,
  "pattern_hits": 0, "indicators": 25, "patterns": 28,
  "cached_bars": 0, "bot_sessions": 2, "bot_logs": 0
}
```

## 8.3b Exact endpoint shapes

Bot status:
```json
{ "status": "ready", "connected_to_mt5": true, "engine": "live_mt5_bridge", "subscribed_books": [] }
```

Bot strategies:
```json
{ "builtin_strategies": [...], "stored_strategies": [...], "total": <int> }
```

List sessions: `GET /bot/sessions?limit=50` -> `{ sessions: [...], count }`.

Get session: `GET /bot/sessions/{id}` -> `{ session: {...}, logs: [...] }`.

Create session body:
```json
{ "session_id": "bot_...", "strategy_name": "ma_cross_20_50", "symbol": "EURUSD", "timeframe": "M1", "magic": 0, "dry_run": true }
```
All of `strategy_name` and `symbol` required; others optional with defaults.

Pause/resume/stop: `POST /bot/sessions/{id}/pause|resume|stop`. Stop accepts `{ trades_count, pnl_pips }`.

Logs: `GET /bot/sessions/{id}/logs?limit=200` -> `{ session_id, logs: [...], count }`.

DB stats: `GET /db/stats` -> `{ path, strategies, reports, report_trades, pattern_hits, indicators, patterns, cached_bars, bot_sessions, bot_logs }`.

DB reports: `GET /db/reports?limit=50&strategy=&verdict=` -> `{ count, reports: [...] }`.

Integrity: `GET /db/integrity` -> `{ status, path }`.

Sessions: `GET /db/sessions?limit=25` -> `{ sessions: [...] }`.

Vacuum: `POST /db/vacuum` -> `{ success, message }`.

## 8.4 Component work

ScalarAI has no bot/DB component. Create a "Bot & Database" tab in `App.tsx` rendering:

- Bot status card (status, connected_to_mt5, engine).
- Strategies list (from `/bot/strategies`).
- Sessions table (id, status, metrics) with pause/resume/stop buttons.
- DB stats cards (strategies, reports, pattern_hits, cached_bars, bot_sessions, bot_logs).
- Integrity check button -> `/db/integrity`.
- Vacuum button -> `/db/vacuum`.
- Reports list -> `/db/reports`.

Reuse `Card`, `Badge`, `Button`, `StatsCards`-style layout. Use `useErrorHandler` for action results.

## 8.5 Verification

- Bot status shows connected_to_mt5.
- DB stats render numbers.
- Vacuum button returns success.

## Success criteria

- Bot & Database tab functional.
- No `/api/*` calls for bot/DB.