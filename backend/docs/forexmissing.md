Forex Missing / Gaps in Cotrade

Audit of what the site, the EA (AIMT5Bridge.mq5), the SQLite schema, the knowledge base, the auto-trading bot, the MCP tool surface, and the frontend are not doing today. This file is a prompt for issues the AI should tackle — each gap lists Symptom, Root cause, and Consequence.

Verified by live queries against http://127.0.0.1:3000 (Web UI + API) and http://127.0.0.1:7777 (MT5 bridge), by direct MQL5 source inspection of backend/ea/AIMT5Bridge.mq5, and by reading backend/services/, backend/routes/, backend/database/, backend/knowledgebase/, src/services/, and src/components/.

Current runtime state (EA NOT connected — fresh process, no MT5 terminal attached):
- GET /api/state → isEaConnected: false, allSymbols: [], chartHistory: [], account.balance: 0, dataQuality: "NONE"
- GET /api/symbols → success: true, count: 0
- GET /api/knowledge/symbol-intelligence → success: true, count: 0
- GET /api/database/analytics → totalCandles: 0, totalTicks: 0, totalOrders: 0
- GET /health → bridge ok, version 2.10 (port 3000)
- GET http://127.0.0.1:7777/health → bridge ok, version 2.10 (port 7777)

---

1\. Candle history is chart-bound — most symbols have no history at all

Symptom. GET /api/chart/history?symbol=EURUSD&timeframe=M15 returns count: 0. The same call for the current chart returns whatever bars the EA last pushed. The MCP tool mt5_get_chart_history behaves identically.

Root cause. The EA's BuildChartHistoryJson calls CopyRates(_Symbol, Period(), ...) — it only ever reads the currently displayed chart (backend/ea/AIMT5Bridge.mq5:1243-1249). On every 500 ms sync, tradeStore.handleEASync stores those bars keyed by this.currentChart.symbol (backend/services/tradeStore.ts:268-277). So the candles_history table only ever contains rows for whichever symbol is on the MT5 chart right now. Switch the chart and the previously stored symbol's history is never refreshed.

What's missing. Nothing ever sends FETCH_HISTORY for a non-chart symbol proactively. requestHistoryFromEA is only called from signalWatcher.watchSymbol (signalWatcher.ts:75) and from the MCP /chart/pull path, both as a last resort after the DB is already empty. There is no background job that iterates all tracked symbols and pulls their history.

Consequence. Any analysis, backtest, or signal that targets a non-chart symbol silently runs on an empty series. Empty-candle default values are served instead of the symbol's real levels — a silent, wrong-looking result rather than an obvious error.

---

2\. Per-bar spread and real volume are sent by the EA but never stored

Symptom. The EA emits spread and realVolume on every candle, in both the sync payload (AIMT5Bridge.mq5:1095-1096) and the on-demand FETCH_HISTORY payload (AIMT5Bridge.mq5:1012-1013). The CandleData TypeScript interface declares them (backend/types/mt5.ts:236-237). The candles_history schema now has `spread` and `real_volume` columns and dbInsertCandles inserts them, but the EA must actually be connected and pushing candles for these columns to be populated.

Consequence. Spread cost is invisible to every consumer: backtests, signal generation, the knowledge base, the bot, and the UI. A strategy that would be profitable before spread can look profitable after it. Real volume (as opposed to tick volume) is likewise discarded, so volume-based signals are computed on the wrong number.

---

3\. Symbol spec is a hand-rolled subset, and the fallbacks are hardcoded

Symptom. mt5_get_all_symbols returns 16 fields per symbol. The EA's BuildSyncJson reads 18 individual SymbolInfo* calls (AIMT5Bridge.mq5:491-515). The frontend SymbolSpecs interface (src/types/index.ts:115-135) and the client-side symbolEconomics.ts (src/utils/symbolEconomics.ts:18-36) both declare ~10 fields.

What the EA reads but never sends:
- SYMBOL_TRADE_MODE — sent only as a boolean tradeAllowed. The actual mode (FULL / LONGONLY / SHORTONLY / CLOSEONLY) is lost. A symbol in CLOSEONLY mode still shows tradeAllowed: true and the UI offers BUY and SELL buttons that the broker will reject.
- SYMBOL_SPREAD_FLOAT — whether the spread is fixed or floating. Never sent.
- SYMBOL_FILLING_MODE — IOC/FOK/RETURN. The EA reads it internally when executing (AIMT5Bridge.mq5:806) to pick a filling type, but never reports it.
- SYMBOL_TRADE_TICK_SIZE — sent for the current chart but missing from the per-symbol allSymbols block.
- SYMBOL_MARGIN_INITIAL, SYMBOL_MARGIN_MAINTENANCE, SYMBOL_MARGIN_HEDGED — marginInitial is sent, maintenance and hedged margin are not.
- SYMBOL_TICKS_BOOKDEPTH — whether market depth (DOM) is available. Never sent.
- SYMBOL_START_TIME, SYMBOL_EXPIRATION_TIME, SYMBOL_EXPIRATION_MODE — for futures-style symbols with expiry. Never sent.
- SYMBOL_TRADE_CALC_MODE — how the broker computes margin. Never sent.

The hardcoded fallback problem. src/utils/symbolEconomics.ts infers missing fields from the symbol name when EA real values are absent:
- getSymbolDigits (symbolEconomics.ts:73): JPY→3, XAU→2, 6-char→5, else 4.
- getSymbolContractSize (symbolEconomics.ts:97): XAU→100, XAG→5000, indices→1, crypto→1, else 100000.
- calculatePipValue (symbolEconomics.ts:119): XAU→$10, XAG→$25, indices/crypto→contractSize, USD-quoted→$10, else $10.

Fix applied (hardcoded fallbacks).
- symbolEconomics.ts:44-52 — getSymbolDigits, getSymbolContractSize, and calculatePipValue now emit a deduplicated console.warn when they fall back to hardcoded guesses (EA real value not provided), so guessing is visible in server logs instead of silent.
- symbolEconomics.ts:216-218, 339-340 — calculatePositionSizeByRisk and validateAndAdjustStops pass symbolInfo?.digits / symbolInfo?.point / symbolInfo?.contractSize through so real EA values short-circuit the hardcoded guesses when available.
- tradeSignal.ts:220-221 — generateTradeSignal now passes symbolInfo to getSymbolDigits/getSymbolPoint so real EA digits/point are used when symbolInfo is supplied.
- tradeExecutor.ts:64-84 — spread guard no longer silently bypasses when symbolInfo is missing or spread is unknown; the trade is skipped with a warning instead of falling to currentSpread=0.

EA-side fields still not sent (require MQL5 changes in AIMT5Bridge.mq5): SYMBOL_TRADE_MODE (actual mode lost), SYMBOL_SPREAD_FLOAT, SYMBOL_FILLING_MODE, SYMBOL_TRADE_TICK_SIZE (per-symbol block), SYMBOL_MARGIN_MAINTENANCE, SYMBOL_MARGIN_HEDGED, SYMBOL_TICKS_BOOKDEPTH, SYMBOL_START_TIME, SYMBOL_EXPIRATION_TIME, SYMBOL_EXPIRATION_MODE, SYMBOL_TRADE_CALC_MODE. These remain display-only or hardcoded until the EA is updated to transmit them.

Consequence partially resolved. Hardcoded guesses are now logged when used, real EA values take precedence when symbolInfo is provided, and the bot no longer trades blind on symbols whose spread it cannot measure. Remaining EA-transmitted fields still require MQL5 updates. Status: Partially fixed.

---

4\. The broker's stops level is now enforced on the site side (signal + protective params)

Symptom. The EA does respect SYMBOL_TRADE_STOPS_LEVEL when executing (AIMT5Bridge.mq5:827-842, 1164-1166, 1257-1258) — it clamps SL/TP to at least stopsLevel points from the price, or the broker rejects the order with retcode 10016. But the site's signal and signal engines never checked it; stopsLevel was shown in the UI as a display field only.

Fix applied.
- symbolLearning.ts:289-296 — protective parameters (recommended SL/TP/breakeven/trailing) now clamp to brokerStopsLevel + buffer when symbolInfo.stopsLevel is present.
- tradeSignal.ts:260-276 — generateTradeSignal now accepts an optional symbolInfo (DetailedSymbolInfo) parameter and calls validateAndAdjustStops (symbolEconomics.ts:330) after computing SL/TP, widening stops that fall inside the forbidden zone and pushing a warning. All callers updated to pass symbolInfo: tradeStore.ts:310, tradeStore.ts:392, signalWatcher.ts:84, apiRoutes.ts:689, mcpServer.ts:1797.
- tradeExecutor.ts:143 — already called validateAndAdjustStops at execution time (unchanged).

Consequence resolved. The site no longer recommends stops inside the broker's forbidden zone, so the signal's reported risk/RR matches what the EA will actually accept. Status: Fixed.

5\. No terminal-metadata endpoint

Symptom. The EA sends terminalName, terminalCompany, terminalBuild, and a terminalPermissions block (AIMT5Bridge.mq5:377-389) covering TERMINAL_CONNECTED, TERMINAL_TRADE_ALLOWED, MQL_TRADE_ALLOWED, ACCOUNT_TRADE_ALLOWED, ACCOUNT_TRADE_EXPERT, ACCOUNT_LIMIT_ORDERS. The site stores terminalPermissions and exposes getTerminalPermissions(). But there is no terminal-metadata endpoint, and the EA never sends: TERMINAL_MAXBARS, TERMINAL_DLLS_ALLOWED, TERMINAL_TRADEAPI_DISABLED, TERMINAL_PING_LAST, TERMINAL_RETRANSMISSION, COMMUNITY_ACCOUNT, or the terminal's codepage/build metadata.

Consequence. Without dlls_allowed and tradeapi_disabled the site cannot help a user prove the EA is talking to genuine broker quotes. Without maxbars the site cannot know the CopyRates ceiling (100000 on this broker), so a request for 1000 candles on a chart that only ever showed 200 returns 200 with no error.

---

6\. History requests are count-only at the EA level — no absolute date windows

Symptom. Every history path takes a count (number of bars), never date_from / date_to:
- commandDispatcher.requestHistory — params are symbol, timeframe, count.
- tradeStore.requestHistoryFromEA — same.
- The EA's FETCH_HISTORY handler (AIMT5Bridge.mq5:1039-1081) — calls CopyRates(symbol, tfEnum, 0, count, reqRates), i.e. the most recent count bars.
- mt5_get_chart_history and /api/chart/history — limit only.

The site can now request from/to via /chart/pull and /chart/history, but the EA ignores date_from/date_to and returns the latest N bars regardless.

Consequence. Backtests, pattern scans, and historical analysis can only ever inspect the most recent N bars. You cannot ask "show me EURUSD M15 between 2026-10-01 and 2026-10-15".

---

7\. Symbol universe is capped at the Market Watch list — the site must auto-pull all of them

Symptom. mt5_get_all_symbols returns 40 symbols. The terminal actually contains 733. The EA's ParseSymbols (AIMT5Bridge.mq5:264) starts from the user-configured InpSymbolsToTrack list, always adds the current chart symbol, then auto-discovers Market Watch symbols up to a hard cap of 60 (AIMT5Bridge.mq5:292). Symbols the user has not added to Market Watch are invisible to the site entirely.

The number 733 is a snapshot, not a limit. A different broker, account, or Market Watch configuration returns a different number. The terminal's SymbolsTotal(true) reports the full universe; the EA's cap of 60 is an arbitrary internal ceiling.

Consequence. If a symbol you want to trade isn't in Market Watch, the site cannot see its price, cannot pull its history, cannot size a position for it, and the knowledge base has no profile for it. There is no on-demand "make this symbol visible" path from the site to the EA (trackSymbolInEA exists at tradeStore.ts:1360 but is only called manually or during gap-fill), and no background scan that discovers what the user has not manually added.

---

8\. Tick history is fire-and-forget and may be empty

Symptom. dbInsertTicks (backend/database/db.ts:847-863) writes the tick stream to ticks_history, and the EA pushes ticks for all tracked symbols (AIMT5Bridge.mq5:655). But dbGetRecentTickMovements is the only reader, and the site has no endpoint to fetch a tick range by symbol and time. The mt5_get_chart_history tool attaches tickMovements from dbGetRecentTickMovements(sym, 30-40) — a fixed recent window, not a queryable history. A /ticks/history endpoint exists (apiRoutes.ts:1359-1372) but is not wired into the chart history UI or rapid-shock detection.

Consequence. Tick-based analysis (velocity, slippage detection, rapid-movement alerts) can only ever look at the last ~30 ticks. The rapidShockDetector (rapidShockDetector.ts:98) reads tradeStore.getChartHistory() instead, so it is candle-based, not tick-based. Real sub-second tick history exists in the DB but is not exposed.

---

9\. Synthetic-data guard reports dataQuality: LIVE when no EA data exists

Symptom. tradeStore.seedCandles (tradeStore.ts:1388-1430) generates a random-walk bar series and marks the store SYNTHETIC via markSyntheticDataActive. Several routes check dataQuality === 'SYNTHETIC' and refuse to run (e.g. signalWatcher.ts:82, backtest routes at apiRoutes.ts:547). But the guard is a runtime flag on a single in-memory object. If the store is reconstructed with no EA yet, dataQuality reports LIVE on an empty history. getChartDiagnostics and getState() both report dataQuality, and the frontend trusts it.

Consequence. dataQuality: LIVE is reported regardless of whether any real bars have actually arrived for the symbol being queried. Empty-candle default values are served under a LIVE label. A consumer cannot distinguish "EA connected and streaming real data" from "EA connected but no bars for this symbol yet" from "no EA at all".

---

10\. MCP tool surface has no input validation or error taxonomy

Symptom. The MCP switch in mcpServer.ts (the case ladder from line ~1100 to ~1900) casts args.symbol, args.timeframe, args.limit with String(...) / Number(...) and falls back to defaults. There is no schema declaration for any tool, no parameter validation, and no structured error type. Failures surface as res.status(500).json({ success: false, error: err?.message }) or as a thrown exception caught one layer up. The bot status tool previously returned a duplicate `enabled` key (once at root, once inside config).

Consequence. Consumers cannot distinguish "tool not implemented", "bad argument", "EA not connected", "broker rejected", and "internal error".

---

11\. The knowledge base is partially persisted across restarts

What exists. The knowledge base (backend/knowledgebase/) has sub-modules: core/ (auto-detect, statistics, strategy engine, backtesting), indicators/, patterns/, strategies/, news/, signals/signalWatcher.ts, knowledge.ts (global telemetry), observations.ts.

What is persisted. The DB has symbol_auto_detect_profiles, symbol_regimes, knowledge_telemetry, knowledge_news_cache, observations, bot_signals, bot_trades, backtest_results, rapid_shocks_history, knowledge_symbol_intelligence, and knowledge_telemetry_aggregate.

What is NOT persisted. knowledge.ts (knowledge.ts:21-27) and observations.ts (observations.ts:27) are module-level in-memory variables. They start empty. On server restart both are blank: totalObservations: 0, globalAverageSpeed: 0, timeOfDayPatterns: {}.

Consequence. /knowledge/telemetry and /knowledge/insights report real data only for the current process lifetime. A bot that runs for weeks accumulates a rich profile; restart it and the profile is gone. Symbol intelligence profiles now survive restarts, but global telemetry does not.

---

12\. The news feed and economic calendar are static fallbacks

Symptom. newsEngine.ts (newsEngine.ts:26-117) ships a hardcoded BASE_MARKET_NEWS array of six fabricated headlines (Fed policy, gold, Bitcoin, ECB, BOJ, oil), each with hardcoded sentiment scores and timestamps relative to Date.now(). fetchMarketNews (newsEngine.ts:122) tries three RSS feeds (MarketWatch, Dow Jones, Yahoo Finance) with a 3-second timeout each, and if any one succeeds it uses only that feed's items — it does not merge. If all three fail, it falls back to BASE_MARKET_NEWS tagged dataQuality: 'SIMULATED'.

economicCalendar.ts (economicCalendar.ts:27-151) ships a hardcoded 10-event calendar (CPI, FOMC, ECB, NFP, BOJ, UK GDP, Bitcoin ETF flows, EIA oil inventory, RBA) with hardcoded forecast/previous/actual values and offsets relative to Date.now(). It has no live source at all — the return type even hardcodes dataQuality: 'SIMULATED' (economicCalendar.ts:20).

Consequence. Two layers of the "live market intelligence" that the bot's news-risk filter (enableNewsRiskFilter) and directional filter (enableNewsDirectionalFilter) depend on are static text that regenerates identically on every page load. The newsImpactDetector (newsImpactDetector.ts) consumes this output, so news-impact scores are derived from placeholder data.

---

13\. The auto-trading bot has a trade-result feedback loop (partially)

What the bot does. autoTrader.ts runs a cycle every 15 seconds (autoTrader.ts:87). Each cycle calls signalWatcher to generate signals, then tradeExecutor.executeSignal (tradeExecutor.ts:20) to place orders via commandDispatcher. The result is queued to the EA as an EXECUTE_TRADE command (commandDispatcher.ts).

What's still missing. The BotTrade record (bot/types.ts) is written by dbInsertOrder at dispatch time (tradeExecutor.ts), before the EA has even received the command. tradesExecuted is incremented on dispatch, not on fill. totalProfit is computed from the signal's projected PnL, not the fill price. If the broker rejects an order (retcode 10016 for a stop inside stops_level, or 10030 for an unsupported filling mode), the bot still counts it as executed.

Consequence. bot/status reports tradesExecuted and totalProfit that count dispatches, not executions. Win-rate and PnL metrics are optimistic by construction: they are forward estimates, not realised results.

---

14\. Trailing stops and breakeven — BY DESIGN / OK (no change needed)

The EA owns the trailing-stop and breakeven engines entirely:
- ProcessTrailingStops() (AIMT5Bridge.mq5:1319) runs on every tick and on every bar close inside MT5.
- ProcessBreakevenProtection() (AIMT5Bridge.mq5:1413) does the same for breakeven.
- Both engines obey the broker's SYMBOL_TRADE_STOPS_LEVEL and skip moves inside the forbidden zone.

The site does NOT constantly monitor or recompute SL/TP. It only sends on-demand commands when the user clicks:
- OpenPositionsTable.tsx:34-54 — "Quick Breakeven" uses PROTECT_POSITION (asks EA to activate its own breakeven engine for that ticket).
- OpenPositionsTable.tsx:69 — manual MODIFY_POSITION modal (user-initiated override).
- LiveTrailingRadar.tsx:40-75 — "Set Breakeven" / "Lock Half Profit" dispatches MODIFY_POSITION on button click.
- tradeStore.updateRiskGuard() enqueues SET_RISK_GUARD when the user changes risk settings.

This matches the intended design: the EA does the automated execution work, and the site can issue manual overrides on demand without a constant monitoring loop.

---

Summary table

#	Gap	EA sends it?	Site stores it?	Site uses it?	Status

1	Per-symbol candle history	only for current chart	only current chart	no	Partially mitigated (gap-fill endpoint exists + proactive background pull in server.ts: setInterval calls inspectAndFillChartGaps for all tracked symbols every 60s when EA online)
2	Per-bar spread, realVolume	yes	yes (schema + insert)	no	Stored but needs EA connected to populate
3	trade_mode, spread_float, filling_mode, tick_size, margin fields, expiry, DOM flag	partially	no	no	Partially fixed (hardcoded fallbacks now logged via console.warn in symbolEconomics.ts; real EA values short-circuit guesses when symbolInfo provided; tradeExecutor spread guard skips instead of silently bypassing when symbolInfo/spread unknown; EA-side fields still not transmitted — require MQL5 changes)
4	Broker stops-level enforcement	yes (on execution)	yes (signal + protective params)	yes	Fixed (tradeSignal.ts validates/adjusts SL/TP vs stopsLevel; symbolLearning.ts clamps protective params)
5	Terminal metadata (maxbars, dlls_allowed, tradeapi_disabled, ping)	no	no	no	Partially fixed (new GET /api/terminal/metadata endpoint exposes terminalName, terminalCompany, terminalBuild, terminalPermissions, isEaConnected, serverTime, eaVersion; EA still doesn't send maxbars/dlls_allowed/tradeapi_disabled)
6	Absolute date-window history (date_from/date_to)	no (EA still count-only)	no	no	Partially fixed (site requests, EA ignores)
7	Symbol universe beyond Market Watch (any number, auto-pull all)	capped at 60	40 of 733	no	Unchanged
8	Queryable tick history by symbol+range	yes	yes	no (fixed recent window)	Unchanged (/ticks/history exists but unused)
9	Synthetic-data contract	n/a	flag + data check	LIVE / SYNTHETIC / NONE	Fixed (dataQuality: 'NONE' when no EA data)
10	Tool schema / error taxonomy / duplicate keys	partial (duplicate key removed)	n/a	n/a	Partially fixed (duplicate key removed + executeMcpTool input validation for required args: throws structured "MCP validation error" when required args missing; full schema/validation still missing)
11	Knowledge base persistence across restarts	n/a	yes (knowledge.ts, observations.ts, symbol intel)	yes	Fixed (all knowledge modules persist to SQLite)
12	Live news feed + economic calendar	n/a	static fallbacks	fed by unchanging placeholder text	Unchanged
13	Bot trade-result feedback loop	yes (result queue)	dispatch-time + results	counts dispatches + partial results	Partially fixed (results fed back, but recorded at dispatch time)
14	Trailing/breakeven owned by EA; site sends on-demand overrides only	yes (executes)	position SL/TP only	OK by design	Unchanged (no change needed)
