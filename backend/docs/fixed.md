# Fixes Applied — Cotrade

All fixes verified with `tsc --noEmit` (clean) and live API queries against http://127.0.0.1:3000 and http://127.0.0.1:7777.

---

## Gap #9 — Synthetic-data guard: `dataQuality` now reports `NONE` with no EA data

**Problem.** A fresh process with no EA connected reported `dataQuality: "LIVE"` despite `allSymbols: []`, `chartHistory: []`, and `account.balance: 0`. Consumers couldn't distinguish "no EA/no data" from "live EA data".

**Fix.** `tradeStore.getState()` and `tradeStore.getDataQuality()` now return `dataQuality: 'NONE'` when there are no symbols, no chart history, and no account login. Return types widened to `'LIVE' | 'SYNTHETIC' | 'NONE'` across `tradeStore.ts`, `src/types/index.ts`, `backend/bot/types.ts`, `backend/knowledgebase/core/tradeSignal.ts`, and `backend/mcp/mcpServer.ts`.

**Verified.** `GET /api/state` on a fresh server returns `dataQuality: "NONE"`.

---

## Gap #9b — `dataQuality` consumers updated for `'NONE'`

**Problem.** Multiple consumers checked only for `'SYNTHETIC'` and would incorrectly treat `'NONE'` as `'LIVE'`.

**Fix.**
- `signalWatcher.ts:82` — dataQuality filter now blocks both `'SYNTHETIC'` and `'NONE'` when `dataQualityFilter === 'LIVE'`
- `auto-detect.ts` — `DataQuality` type widened to include `'NONE'`; all 6 places that assigned `'SYNTHETIC'` for insufficient data now assign `'NONE'` (no real data ≠ seeded fake data)
- `db.ts` — 3 backtest result passthroughs (lines 1657, 1737, 1780) now pass through `'NONE'` instead of mapping it to `'LIVE'`
- `mcpServer.ts:1423` — backtest warning message now covers both `'SYNTHETIC'` and `'NONE'` with appropriate wording

---

## Gap #10 — Duplicate `enabled` key in bot status

**Problem.** `BotState` interface had `enabled: boolean` at root level, and `config.enabled` also existed — producing a duplicate key in `GET /api/bot/status`.

**Fix.** Removed `enabled` from `BotState` interface and from `this.state` initialization/updates in `autoTrader.ts`. `config.enabled` is now the single source of truth. Bot status response has `enabled` only inside `config.enabled`.

---

## Gap #2 — Per-bar spread and real volume storage

**Problem.** `dbInsertCandles` inserted only symbol, timeframe, time, open, high, low, close, volume, time_iso. The schema had no `spread` or `real_volume` columns even though the EA sends them.

**Fix.** `candles_history` table now has `spread REAL DEFAULT 0` and `real_volume REAL DEFAULT 0` columns (ALTER TABLE migration). `dbInsertCandles` inserts `c.spread ?? 0` and `c.realVolume ?? 0`. Needs EA connected to populate actual values.

---

## Gap #6 — Absolute date-window history support (site side)

**Problem.** All history paths took only a `count` parameter — no `date_from` / `date_to`.

**Fix.** `tradeStore.requestHistoryFromEA` now accepts optional `from`/`to` parameters. `/chart/pull` and `/chart/history` accept date-window query params. The EA's `FETCH_HISTORY` handler still ignores date windows (returns most-recent-N only) — that's an EA-side remaining gap.

---

## Gap #11 — Knowledge base persistence across restarts

**Problem.** Knowledge base modules (`knowledge.ts`, `observations.ts`) were in-memory only and lost on restart. Symbol intelligence profiles also not persisted.

**Fix.** All knowledge modules now persist to SQLite and load on boot:
- `knowledge.ts` — loads/persists via `dbGetKnowledgeTelemetryAggregate` / `dbSaveKnowledgeTelemetryAggregate` (`knowledge_telemetry_aggregate` table)
- `observations.ts` — loads/persists via `dbGetObservations` / `dbSaveObservation` (`observations` table)
- `symbolLearning.ts` — persists symbol intelligence profiles via `dbSaveSymbolIntelligence` / `dbGetSymbolIntelligence` (`knowledge_symbol_intelligence` table)

**Verified.** All three modules read from DB on module load and write back on update.

---

## Gap #13 — Bot trade-result feedback loop (partial)

**Problem.** After dispatching an order, the bot never observed whether it filled.

**Fix.** `tradeStore.resolveExecutionResult()` now feeds execution results back into `tradingBot.handleExecutionResult(cmd, res)` when `cmd.source === 'BOT'`. Command results from the EA's sync payload are stored and stuck dispatched commands are reaped.

**Remaining.** BotTrade is still written at dispatch time (before EA receives the command). `tradesExecuted` counts dispatches not fills. `totalProfit` uses projected PnL not fill price.

---

## Gap #15 — Frontend `.replace()` crashes on undefined API data

**Problem.** Multiple components called `.replace()` on null/undefined API-derived values before first EA sync, causing runtime crashes.

**Fix.** All `.replace()` call sites now use null-safe patterns (e.g. `(config.mode || '').replace('_', ' ')`, `(mtfData?.overallConsensus || '').replace('_', ' ')`).

---

## Gap #14 — Trailing/breakeven — BY DESIGN / OK (no fix needed)

Verified the EA owns execution (`ProcessTrailingStops`, `ProcessBreakevenProtection` run inside MT5 on every tick). The site only sends on-demand commands (`MODIFY_POSITION`, `PROTECT_POSITION`, `SET_RISK_GUARD`) when the user clicks — no constant monitoring loop. No change needed.
