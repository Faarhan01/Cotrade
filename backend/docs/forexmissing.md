Forex Missing / Gaps in Cotrade

Audit of what the site, the EA (AIMT5Bridge.mq5), the SQLite schema, the knowledge base, the auto-trading bot, the MCP tool surface, and the frontend are not doing today. Everything below was verified by live queries against the running system (EA connected, Deriv-Demo, balance 9613.38, data quality LIVE), by direct MQL5 source inspection, and by running the MetaTrader 5 Python SDK against the same live terminal.

1\. Candle history is chart-bound — most symbols have no history at all

Symptom. GET /api/chart/history?symbol=EURUSD\&timeframe=M15 returns count: 0. The same call for the current chart (Step Index) returns 8 bars. The MCP tool mt5\_get\_chart\_history behaves identically.

Root cause. The EA's BuildChartHistoryJson calls CopyRates(\_Symbol, Period(), ...) — it only ever reads the currently displayed chart (backend/ea/AIMT5Bridge.mq5:1079). On every 500 ms sync, tradeStore.handleEASync stores those bars keyed by this.currentChart.symbol (backend/services/tradeStore.ts:245). So the candles\_history table only ever contains rows for whichever symbol is on the MT5 chart right now. Switch the chart and the previously stored symbol's history is never refreshed.

Consequence. Any analysis, backtest, or signal that targets a non-chart symbol silently runs on an empty series. The tools fixed last session (mt5\_knowledge\_auto\_detect, mt5\_calculate\_indicators, etc.) now fall back to the DB and return empty-candle default values (pivot 1.08633 for EURUSD) instead of the symbol's real levels — a silent, wrong-looking result rather than an obvious error.

What's missing. A way to pull history for an arbitrary symbol on demand. The EA does support this — the FETCH\_HISTORY command handler exists (AIMT5Bridge.mq5:977) and the response is carried back in the sync payload as historyPayload (AIMT5Bridge.mq5:550-553), which tradeStore.handleEASync does persist (tradeStore.ts:338-342). But nothing ever sends the command for a non-chart symbol. requestHistoryFromEA (tradeStore.ts:1303) is only called from signalWatcher.watchSymbol (signalWatcher.ts:75) and from the MCP /chart/pull path, and both only reach it as a last resort after the DB is already empty.

2\. Per-bar spread and real volume are sent by the EA but never stored

Symptom. The EA emits spread and realVolume on every candle, in both the sync payload (AIMT5Bridge.mq5:1095-1096) and the on-demand FETCH\_HISTORY payload (AIMT5Bridge.mq5:1012-1013). The CandleData TypeScript interface declares them (backend/types/mt5.ts:236-237). But dbInsertCandles (backend/database/db.ts:712-730) inserts only symbol, timeframe, time, open, high, low, close, volume, time\_iso — the schema has no spread or real\_volume column at all (backend/database/db.ts:190-202).

Consequence. Spread cost is invisible to every consumer: backtests, signal generation, the knowledge base, the bot, and the UI. A strategy that would be profitable before spread can look profitable after it, and the site has no way to know the difference. Real volume (as opposed to tick volume) is likewise discarded, so volume-based signals are computed on the wrong number.

3\. Symbol spec is a hand-rolled subset, and the fallbacks are hardcoded

Symptom. mt5\_get\_all\_symbols returns 16 fields per symbol. The EA's BuildSyncJson reads 18 individual SymbolInfo\* calls (AIMT5Bridge.mq5:491-515). The frontend SymbolSpecs interface (src/types/index.ts:115-135) and the client-side symbolEconomics.ts (src/utils/symbolEconomics.ts:18-36) both declare \~10 fields.

What the EA reads but never sends.

\- SYMBOL\_TRADE\_MODE — sent only as a boolean tradeAllowed (true when not SYMBOL\_TRADE\_MODE\_DISABLED). The actual mode (FULL / LONGONLY / SHORTONLY / CLOSEONLY) is lost. A symbol in CLOSEONLY mode still shows tradeAllowed: true and the UI offers BUY and SELL buttons that the broker will reject.

\- SYMBOL\_SPREAD\_FLOAT — whether the spread is fixed or floating. Never sent. A fixed-spread symbol (common on some brokers) behaves very differently for scalping strategies.

\- SYMBOL\_FILLING\_MODE — IOC/FOK/RETURN. The EA reads it internally when executing (AIMT5Bridge.mq5:806) to pick a filling type, but never reports it. The site cannot warn a user that a symbol rejects market orders.

\- SYMBOL\_TRADE\_TICK\_SIZE — sent for the current chart but missing from the per-symbol allSymbols block (AIMT5Bridge.mq5:491-515). So tick-value calculations for non-chart symbols have no tick size to work with.

\- SYMBOL\_MARGIN\_INITIAL, SYMBOL\_MARGIN\_MAINTENANCE, SYMBOL\_MARGIN\_HEDGED — marginInitial is sent, maintenance and hedged margin are not.

\- SYMBOL\_TICKS\_BOOKDEPTH — whether market depth (DOM) is available. The EA sends a marketDepth block (AIMT5Bridge.mq5:521-531) but never flags whether the broker supports it.

\- SYMBOL\_START\_TIME, SYMBOL\_EXPIRATION\_TIME, SYMBOL\_EXPIRATION\_MODE — for futures-style symbols with expiry. Never sent.

\- SYMBOL\_TRADE\_CALC\_MODE — how the broker computes margin. Never sent.

The hardcoded fallback problem. src/utils/symbolEconomics.ts does not just default missing fields — it infers them from the symbol name:

\- getSymbolDigits (symbolEconomics.ts:67): JPY→3, XAU→2, 6-char→5, else 4.

\- getSymbolContractSize (symbolEconomics.ts:85): XAU→100, XAG→5000, indices→1, crypto→1, else 100000.

\- calculatePipValue (symbolEconomics.ts:104): XAU→$10, XAG→$25, indices/crypto→contractSize, USD-quoted→$10, else $10.

These are guesses, and they are used when the EA's real values are absent. A broker can list XAUUSD with digits=3 or contract size 100 vs 200 and the site will silently use the hardcoded 2 / 100. The position-size calculator (calculatePositionSizeByRisk, symbolEconomics.ts:161) feeds on these, so lot sizes can be wrong by a factor of 2-5 for anything not in the hardcoded allowlist. The EA already has the true values in SymbolInfoDouble(\_Symbol, SYMBOL\_\*); — the site just doesn't ask for them.

This matters for the bot specifically. tradeExecutor.ts:33 looks up symbolInfo from tradeStore.getAllSymbols() before every trade, then tradeExecutor.ts:65-74 uses symbolInfo?.spread for the spread guard. If the symbol isn't in the tracked list (see §7), symbolInfo is undefined, currentSpread falls to 0, and the spread guard is silently bypassed — the bot can trade a symbol whose spread it cannot even measure.

4\. The broker's stops level is never enforced on the site side

Symptom. The EA does respect SYMBOL\_TRADE\_STOPS\_LEVEL when executing (AIMT5Bridge.mq5:827-842, 1164-1166, 1257-1258) — it clamps SL/TP to at least stopsLevel points from the price, or the broker rejects the order with retcode 10016. But the site's position-size and signal engines (symbolEconomics.ts, tradeSignal.ts) never check it. stopsLevel is shown in the UI (AllSymbolsPage.tsx:844, CurrentChartSymbolCard.tsx:199) as a display field only.

Consequence. The site can recommend a stop 5 pips from entry on a symbol whose broker requires a minimum of 20 points. The EA will silently widen it on execution, producing an actual risk figure that doesn't match what the site calculated. The user thinks they risked $X; they risked $Y.

5\. No terminal-metadata endpoint

Symptom. The EA sends terminalName, terminalCompany, terminalBuild, and a terminalPermissions block (AIMT5Bridge.mq5:377-389) covering TERMINAL\_CONNECTED, TERMINAL\_TRADE\_ALLOWED, MQL\_TRADE\_ALLOWED, ACCOUNT\_TRADE\_ALLOWED, ACCOUNT\_TRADE\_EXPERT, ACCOUNT\_LIMIT\_ORDERS. The site stores terminalPermissions (tradeStore.ts:214) and exposes getTerminalPermissions(). But there is no terminal-metadata endpoint, and the EA never sends: TERMINAL\_MAXBARS (chart bar limit, 100000 on this broker), TERMINAL\_DLLS\_ALLOWED, TERMINAL\_TRADEAPI\_DISABLED, TERMINAL\_PING\_LAST, TERMINAL\_RETRANSMISSION, COMMUNITY\_ACCOUNT, or the terminal's codepage / build metadata.

Consequence. Two things are missing here:

\- Diagnostic signal. dlls\_allowed: false and tradeapi\_disabled: false are exactly the flags that distinguish a real terminal from a mock/simulated one. Without them the site cannot help a user prove the EA is talking to genuine broker quotes.

\- Capacity awareness. maxbars tells you how much chart history the terminal holds. The EA's CopyRates is silently capped by it; a request for 1000 candles on a symbol whose chart only ever showed 200 returns 200 with no error. The site has no way to know the ceiling exists.

6\. History requests are count-only — no absolute date windows

Symptom. Every history path takes a count (number of bars), never date\_from / date\_to:

\- commandDispatcher.requestHistory (commandDispatcher.ts:305) — params are symbol, timeframe, count.

\- tradeStore.requestHistoryFromEA (tradeStore.ts:1303) — same.

\- The EA's FETCH\_HISTORY handler (AIMT5Bridge.mq5:977) — calls CopyRates(symbol, tfEnum, 0, count, reqRates), i.e. the most recent count bars.

\- mt5\_get\_chart\_history and /api/chart/history — limit only.

Consequence. Backtests, pattern scans, and historical analysis can only ever inspect the most recent N bars. You cannot ask "show me EURUSD M15 between 2026-10-01 and 2026-10-15". The backtest routes (apiRoutes.ts:495, backtestRoutes.ts:12) work around this by reading dbGetCandles(symbol, timeframe, candleLimit) — which is also most-recent-N. So a backtest labeled "on 300 bars of MT5 real history" is silently the last 300 bars, whatever they are. There is no way to pin a backtest to a specific date range, which matters for walk-forward analysis and for reproducing a past result.

7\. Symbol universe is capped at the Market Watch list — the site must auto-pull all of them

Symptom. mt5\_get\_all\_symbols returns 40 symbols. The terminal actually contains 733. The EA's ParseSymbols (AIMT5Bridge.mq5:263) starts from the user-configured InpSymbolsToTrack list, always adds the current chart symbol, then auto-discovers Market Watch symbols up to a hard cap of 60 (AIMT5Bridge.mq5:292). Symbols the user has not added to Market Watch are invisible to the site entirely.

The number 733 is a snapshot, not a limit. That count comes from one live query against one demo account at one moment. A different broker, account, or Market Watch configuration returns a different number — it can be any amount, well above or below a few hundred. The terminal's SymbolsTotal(true) reports the full universe; the EA's cap of 60 is an arbitrary internal ceiling, not a property of MetaTrader 5. What matters is that the site must be able to automatically pull all of them, not a hand-picked 40.

Consequence. If a symbol you want to trade isn't in Market Watch, the site cannot see its price, cannot pull its history, cannot size a position for it, and the knowledge base has no profile for it. The terminal knows about the full universe; the site knows about a subset. There is no on-demand "make this symbol visible" path from the site to the EA, and no background scan that discovers what the user has not manually added.

8\. Tick history is fire-and-forget and may be empty

Symptom. dbInsertTicks (backend/database/db.ts:737) writes the tick stream to ticks\_history, and the EA pushes ticks for all tracked symbols (AIMT5Bridge.mq5:655). But dbGetRecentTickMovements is the only reader, and the site has no endpoint to fetch a tick range by symbol and time. The mt5\_get\_chart\_history tool attaches tickMovements from dbGetRecentTickMovements(sym, 30-40) — a fixed recent window, not a queryable history.

Consequence. Tick-based analysis (velocity, slippage detection, rapid-movement alerts) can only ever look at the last \~30 ticks. The rapidShockDetector (rapidShockDetector.ts:98) reads tradeStore.getChartHistory() instead, so it is candle-based, not tick-based. Real sub-second tick history exists in the DB but is not exposed.

9\. Synthetic-data guard is a flag, not a contract

Symptom. tradeStore.seedCandles (tradeStore.ts:1323) generates a random-walk bar series and marks the store SYNTHETIC via markSyntheticDataActive. Several routes check dataQuality === 'SYNTHETIC' and refuse to run (e.g. signalWatcher.ts:82, backtest routes at apiRoutes.ts:547). But the guard is a runtime flag on a single in-memory object. If the EA reconnects and pushes real bars, the flag clears — correct. If the store is reconstructed, the flag is false — meaning a fresh process with no EA yet reports dataQuality: LIVE on an empty history. getChartDiagnostics and getState() both report dataQuality (tradeStore.ts:1187), and the frontend trusts it.

Consequence. dataQuality: LIVE is reported whenever the EA is connected, regardless of whether any real bars have actually arrived for the symbol being queried. The empty-candle default values described in §1 are served under a LIVE label.

10\. MCP tool surface has no input validation or error taxonomy

Symptom. The MCP switch in mcpServer.ts (the case ladder from line \~1100 to \~1900) casts args.symbol, args.timeframe, args.limit with String(...) / Number(...) and falls back to defaults. There is no schema declaration for any tool, no parameter validation, and no structured error type. Failures surface as res.status(500).json({ success: false, error: err?.message }) or as a thrown exception caught one layer up. The bot status tool returns a duplicate enabled key (once at root, once inside config) because autoTrader.ts:29 sets enabled on the state object and getState() spreads ...this.state while also returning config: { ...this.config } which has its own enabled (autoTrader.ts:111-119).

Consequence. Consumers cannot distinguish "tool not implemented", "bad argument", "EA not connected", "broker rejected", and "internal error". The duplicate-key JSON is a code smell that breaks strict parsers.

11\. The knowledge base is largely in-memory and decoupled from the database

What exists. The knowledge base (backend/knowledgebase/) has six sub-modules:

\- core/ — auto-detect symbol intelligence, common statistics, the strategy engine, and backtesting.

\- indicators/ — momentum, trend, volatility, and volume calculations.

\- patterns/ — candlestick, indicator, and chart-shape detectors.

\- strategies/ — built-in strategy templates and adaptive rule models.

\- news/ — live news feed, macroeconomic calendar, symbol impact analyzer, and rapid-shock detector.

\- signals/signalWatcher.ts — multi-timeframe signal orchestration feeding the bot.

\- knowledge.ts — global market telemetry (average speed, peak velocity, time-of-day patterns).

\- observations.ts — recorded market observations with tags and metadata.

What is persisted. The DB has symbol\_auto\_detect\_profiles, symbol\_regimes, knowledge\_telemetry, knowledge\_news\_cache, observations, bot\_signals, bot\_trades, backtest\_results, and rapid\_shocks\_history. So the outputs of the knowledge base are stored.

What is NOT persisted. The knowledge base itself — knowledge.ts (knowledge.ts:21-27) and observations.ts (observations.ts:27) — are module-level in-memory variables. They start empty. On server restart both are blank: totalObservations: 0, globalAverageSpeed: 0, timeOfDayPatterns: {}. The comment in knowledge.ts:16-20 explains why (the previous build shipped fabricated statistics presented as measured) — which is the right call for correctness, but it means every restart loses the accumulated telemetry.

Consequence. /knowledge/telemetry and /knowledge/insights report real data only for the current process lifetime. A bot that runs for weeks accumulates a rich profile; restart it and the profile is gone. There is no table to reload it from — knowledge\_telemetry stores raw tick-velocity samples, but nothing replays them into the aggregated AiKnowledgeBase on startup. So the "knowledge" the bot relies on for regime detection and strategy selection is volatile memory.

12\. The news feed and economic calendar are static fallbacks

Symptom. newsEngine.ts (newsEngine.ts:26-117) ships a hardcoded BASE\_MARKET\_NEWS array of six fabricated headlines (Fed policy, gold, Bitcoin, ECB, BOJ, oil), each with hardcoded sentiment scores and timestamps relative to Date.now(). fetchMarketNews (newsEngine.ts:122) tries three RSS feeds (MarketWatch, Dow Jones, Yahoo Finance) with a 3-second timeout each, and if any one succeeds it uses only that feed's items — it does not merge. If all three fail, it falls back to BASE\_MARKET\_NEWS tagged dataQuality: 'SIMULATED'.

economicCalendar.ts (economicCalendar.ts:27-151) ships a hardcoded 10-event calendar (CPI, FOMC, ECB, NFP, BOJ, UK GDP, Bitcoin ETF flows, EIA oil inventory, RBA) with hardcoded forecast/previous/actual values and offsets relative to Date.now(). It has no live source at all — the return type even hardcodes dataQuality: 'SIMULATED' (economicCalendar.ts:20).

Consequence. Two layers of the "live market intelligence" that the bot's news-risk filter (enableNewsRiskFilter) and directional filter (enableNewsDirectionalFilter) depend on are static text that regenerates identically on every page load. The newsImpactDetector (newsImpactDetector.ts) consumes this output, so news-impact scores are derived from placeholder data. The bot's newsRiskFilter and newsDirectionalFilter config flags (bot/types.ts, BotTradingPage.tsx) therefore gate behaviour that is fed by content that never changes and was never measured.

13\. The auto-trading bot has no trade-result feedback loop

What the bot does. autoTrader.ts runs a cycle every 15 seconds (autoTrader.ts:87). Each cycle calls signalWatcher to generate signals, then tradeExecutor.executeSignal (tradeExecutor.ts:20) to place orders via commandDispatcher. The result is queued to the EA as an EXECUTE\_TRADE command (commandDispatcher.ts).

What the bot does NOT do. After dispatching an order, the bot never observes whether it filled, at what price, or whether the EA's trailing/breakeven engines moved the stop. It increments tradesExecuted (autoTrader.ts) on dispatch, not on fill. The BotTrade record (bot/types.ts) is written by dbInsertOrder at dispatch time (tradeExecutor.ts), before the EA has even received the command.

Consequence. bot/status reports tradesExecuted and totalProfit that count dispatches, not executions. If the broker rejects an order (retcode 10016 for a stop inside stops\_level, or 10030 for an unsupported filling mode — both real failure modes the EA handles at AIMT5Bridge.mq5:827-842 and :806), the bot still counts it as executed and still includes its notional in totalProfit (which is computed from the signal's projected PnL, not the fill price). The bot's win-rate and PnL metrics are therefore optimistic by construction: they are forward estimates, not realised results.

What's missing. The bot needs to consume the EA's command-result queue (g\_resultQueue, AIMT5Bridge.mq5:157-158), which the EA already populates with success, dealTicket, executionPrice, errorCode, errorMessage, executionTimeMs, and slippagePoints (AIMT5Bridge.mq5:690-699). The sync payload carries these results (AIMT5Bridge.mq5:686-699) and tradeStore stores command results, but nothing feeds them back into the bot's trade ledger. Until it does, winRate, totalProfit, and activeTrades in bot/status are estimates, not measurements.

14\. Trailing stops and breakeven are executed by the EA — the site must not duplicate that logic

Symptom. The EA owns the trailing-stop and breakeven engines entirely:

\- ProcessTrailingStops() (AIMT5Bridge.mq5:1149) runs on every tick and on every bar close. It walks every open position, computes an adaptive trailing distance scaled to the symbol's point (AIMT5Bridge.mq5:1168-1186), checks whether price has moved favorably past the trailing threshold (AIMT5Bridge.mq5:1197-1228), and calls m\_trade.PositionModify(ticket, newSL, m\_position.TakeProfit()) to move the stop.

\- ProcessBreakevenProtection() (AIMT5Bridge.mq5:1243) does the same for breakeven: once profit reaches g\_BreakevenTrigger points, it moves SL to entry + g\_BreakevenLock points, again via PositionModify (AIMT5Bridge.mq5:1260-1289).

\- Both engines obey the broker's SYMBOL\_TRADE\_STOPS\_LEVEL (AIMT5Bridge.mq5:1257-1258, 1270, 1285) — a move that would land inside the forbidden zone is skipped rather than rejected.

\- The parameters (g\_TrailingPoints, g\_TrailingStep, g\_EnableTrailing, g\_EnableBreakeven, g\_BreakevenTrigger, g\_BreakevenLock) are runtime mirrors updated by the SET\_RISK\_GUARD command (AIMT5Bridge.mq5:1027-1042), so the site can change them without recompiling the EA.

What the site currently does. The frontend displays trailing state (LiveTrailingRadar.tsx:167-175 shows "EA Trailing: ACTIVE / STANDBY") and configures it (RiskSettingsPanel.tsx:177-220, BotTradingPage.tsx:793-1024). It also offers a manual "set breakeven" button (OpenPositionsTable.tsx:34-59) that sends a MODIFY\_POSITION command with a hardcoded 2-pip lock offset — independent of the EA's configured g\_BreakevenLock.

The problem. The site has no view of whether trailing is actually running for a given position. The EA's sync payload reports each position's raw sl and tp (AIMT5Bridge.mq5:596-597) but never flags that the SL was moved by the trailing engine rather than set at entry. So:

\- The UI cannot show "this position is being trailed" vs "this position has a fixed SL".

\- The manual breakeven button (OpenPositionsTable.tsx:34) overrides the EA's g\_BreakevenLock with a hardcoded 2-pip offset, creating two independent breakeven behaviours that can fight each other across the next tick.

\- If the site recomputes and re-sends an SL (e.g. from a signal or a risk rule), it can undo a trailing move the EA had already made.

The principle. Trailing stops and breakeven are execution-time safeguards. They depend on the broker's fill behaviour, the symbol's stops\_level, the position's current unrealised PnL, and sub-second price moves — all of which only the EA, sitting inside the terminal, can see. The site should not recompute, re-send, or override SL/TP after an order is filled.

What's missing. The site should treat the EA as the sole authority on trade progress. It should:

\- Only receive trade-progress information from the EA — position state, current SL/TP, unrealised PnL, and whether trailing/breakeven is active on each position. It should never compute an SL/TP value and send it back.

\- Report trailing/breakeven status per position as part of the sync payload, so the UI can show "EA Trailing: ACTIVE" for that specific ticket rather than a global setting.

\- Remove the manual breakeven button's hardcoded offset (OpenPositionsTable.tsx:39) and instead have it ask the EA to activate its own breakeven engine for that ticket, using the parameters already configured via SET\_RISK\_GUARD.

\- Make MODIFY\_POSITION a manual override only, clearly labelled as such, and never let an automated signal or risk rule issue one — because any value the site sends can collide with the EA's trailing engine on the very next tick.

Summary table

\#	Gap	EA sends it?	Site stores it?	Site uses it?

1	Per-symbol candle history	only for current chart	only current chart	no

2	Per-bar spread, realVolume	yes	no (schema + insert)	no

3	trade\_mode, spread\_float, filling\_mode, tick\_size, margin fields, expiry, DOM flag	partially	no	no

4	Broker stops-level enforcement	yes (on execution)	no	no (display only)

5	Terminal metadata (maxbars, dlls\_allowed, tradeapi\_disabled, ping)	no	no	no

6	Absolute date-window history (date\_from/date\_to)	no	no	no

7	Symbol universe beyond Market Watch (any number, auto-pull all)	capped at 60	40 of 733	no

8	Queryable tick history by symbol+range	yes	yes	no (fixed recent window)

9	Synthetic-data contract	n/a	flag only	trusts flag

10	Tool schema / error taxonomy / duplicate keys	n/a	n/a	n/a

11	Knowledge base persistence across restarts	n/a	in-memory only	loses everything on restart

12	Live news feed + economic calendar	n/a	static fallbacks	fed by unchanging placeholder text

13	Bot trade-result feedback loop	yes (result queue)	dispatch-time only	counts dispatches, not fills

14	Trailing/breakeven owned by EA; site must only receive progress, never re-send SL/TP	yes (executes)	position SL/TP only	overrides it (manual breakeven, hardcoded 2 pips)

