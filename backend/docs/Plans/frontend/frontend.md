# Frontend Replacement Plan — ScalarAI React UI on Cotrade Backend

> **Constraint (updated):** Cotrade's Python backend may be improved to support the frontend (CORS, `/api` shim, SPA static serving, richer health). Core MT5 logic remains untouched. The frontend still adapts to Cotrade's data, but backend connection is now seamless.

---

## 0. Executive summary

- **Goal:** Delete `Cotrade/frontend`, copy `scalarai/frontend` (React 19 + TypeScript + Vite + Tailwind v4) into its place, then edit the copied frontend so it consumes Cotrade's existing REST + SSE surface.
- **No backend edits.** Cotrade already sends `Access-Control-Allow-Origin: *` by default (`CONY_CORS_ORIGIN`), so a separate Vite dev server on `:5173` can call Cotrade on `:3000` cross-origin without CORS work.
- **Cotrade is NOT EA-based.** It connects to MT5 through the official `MetaTrader5` Python package directly. There is no EA to download, no web-request verification, and no bridge polling. ScalarAI's "Downloads / EA bridge / MCP bridge" features must be dropped or repurposed (Downloads becomes an informational "About / How Cotrade works" page).
- **Core work is frontend-side:** a data-layer adapter mapping ScalarAI's `/api/*` + WebSocket calls to Cotrade's unprefixed REST + SSE streams, plus remapping ScalarAI's tabs onto Cotrade's 5 site pages (Dashboard, Symbols, Research, History, Bot & Database).
- **Estimated effort:** ~1 day mechanical + build; ~2-3 days adapter + component wiring; ~1-2 days remapping/dropping missing-feature tabs. Total ~1 week for a working, core-data dashboard.

---

## 1. What each codebase is

### Cotrade (backend we keep)

| Aspect | Detail |
|---|---|
| Backend | Python stdlib HTTP server (`backend/gateway/deamon/__main__.py`), threaded. |
| MT5 access | Official `MetaTrader5` package via `cony.MT5Engine` / `ConnectionManager`. Direct terminal connection. **Not** an EA/bridge model. |
| Site pages | `/` Dashboard (account overview), `/ui/symbols` Instrument browser, `/ui/research` Strategy & pattern lab, `/ui/history` Account history, `/ui/bot` Bot & database hub. Nav in `frontend/partials/header.html`. |
| Frontend model | Vanilla HTML/CSS/JS in `frontend/pages`, `frontend/partials`, `frontend/assets`. Served by `core/frontconnect` (page render + partial splice + `<!--#bootstrap-->` JSON injection). **No build step.** |
| Transport | REST JSON + Server-Sent Events. |
| URL layout | No `/api` prefix: `/health`, `/account`, `/terminal`, `/positions`, `/positions/{ticket}`, `/orders`, `/portfolio`, `/symbols`, `/symbols/search`, `/symbol/{s}`, `/symbol/{s}/select`, `/tick/{s}`, `/ticks`, `/ticks/history`, `/candles/{s}`, `/history/deals`, `/history/orders`, `/history/totals`, `/history/summary`, `/research/*`, `/bot/*`, `/db/*`, `/order`, `/order/check`, `/buy`, `/sell`, `/close`, `/close-all`, `/modify`, `/cancel`, `/stream/portfolio`, `/stream/ticks`, `/stream/marketbook`, `/metrics`, `/routes`, `/enums`, `/streams`. |
| CORS | `CONY_CORS_ORIGIN=*` default (see `_headers` in `deamon/__main__.py`). |
| Streams | SSE with events `open`, `portfolio`, `tick`, `marketbook`, `error`, `close`. Payloads documented in section 4. |
| Research | `/research/catalogue`, `/research/indicators`, `/research/patterns`, `/research/strategies`, `/research/library`, `/research/stored`, `/research/strategy/{name}`, `/research/strategy/{name}/compare`, `/research/strategy/{name}/history`, `/research/strategy/{name}/version/{version}`, `/research/strategy/{name}/performance`, `/research/strategy/{name}/optimize`, `/research/strategy/{name}/clone`, `/research/strategy/validate`, `/research/strategy/save`, `/research/strategy/export`, `/research/strategy/import`, `/research/backtest`, `/research/sweep`, `/research/patterns/scan`, `/research/indicator`, `/research/patterns/frequency`, `/research/patterns/cooccurrence`, `/research/bars/range`, `/research/reports/best`, `/research/reports/{run_id}`, `/research/hits/context`, `/research/strategy/{name}/delete` (DELETE). |
| Bot / DB | `/bot/status`, `/bot/strategies`, `/bot/sessions`, `/bot/sessions/{id}`, `/bot/sessions/{id}/stream`, pause/resume/stop, logs, update; `/db/stats` (also `/database/stats`), `/db/reports`, `/db/integrity`, `/db/sessions`, `/db/vacuum`. |

### ScalarAI frontend (what we copy)

| Aspect | Detail |
|---|---|
| Stack | React 19, TypeScript ~5.8, Vite 6, Tailwind v4 (`@tailwindcss/vite`), `lucide-react`, `motion`, `xstate`. |
| Location | `scalarai/frontend/` with own `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/`. |
| Backend it expects | Node/Express (ScalarAI's own) on same origin: `/api/status`, `/api/strategies`, `/api/settings`, `/api/toggle-trade`, `/api/reset-stats`, `/api/ai-study-feed`, `/api/market/candles`, `/api/status/switch-symbol`, `/api/health`, `/api/trades/*`, `/api/ea/*`, `/api/update-market`, `/api/market/bulk-candles`, `/api/test-webrequest/*`, `/api/github-status`, `/api/sync-from-github`, `/api/auth/github/logout`, `/api/market/history`. |
| Transport | REST `/api/*` **plus** WebSocket at `/ws/live` (messages: `init`, `tick`, `trades`, `log`, `config`, `connection`, `webrequest_test`, `ai_strategy`, `pong`). |
| Serving | Vite dev server (HMR off) with proxy `/api` -> `:3000`; production serves built `dist/` as SPA. |
| Key files | `src/App.tsx`, `src/services/api.ts`, `src/services/ws.ts`, `src/hooks/useWebSocket.ts`, `src/hooks/useAppStatus.ts`, `src/hooks/useTradingControls.ts`, `src/hooks/useSettings.ts`, `src/hooks/useDownloadBridge.ts`, `src/hooks/useAiStudyFeed.ts`, `src/hooks/useChartData.ts`, `src/types/api.ts`. |
| EA-specific (to drop/repurpose) | `components/downloads/DownloadsCenter.tsx`, `components/bridge/BridgeConsole.tsx`, `components/settings/WebRequestTest.tsx`, `hooks/useDownloadBridge.ts`, `lib/mql5_generator.ts`. Cotrade uses the official MT5 package directly, so there is no EA to download or bridge to poll. Downloads tab becomes an informational "About / How Cotrade works" page. |

---

## 2. Mechanical copy + build setup

No backend edits. Run from PowerShell:

```powershell
# 1. Replace frontend folder
Remove-Item -Recurse -Force C:\Users\faarh\Workspaces\Custom-apps\Cotrade\frontend
Copy-Item -Recurse C:\Users\faarh\Workspaces\Custom-apps\scalarai\frontend C:\Users\faarh\Workspaces\Custom-apps\Cotrade\frontend

# 2. Install frontend deps (frontend has its own package.json)
cd C:\Users\faarh\Workspaces\Custom-apps\Cotrade\frontend
npm install

# 3. Dev: two terminals
#   Terminal 1: python run.py            (Cotrade backend, :3000)
#   Terminal 2: npm run dev              (Vite, :5173)
```

Config tweaks in the copied frontend (frontend-only):

- `frontend/vite.config.ts`: remove/ignore the `/api` proxy block (Cotrade has no `/api`). Keep `outDir` (`../dist` or `frontend/dist`).
- Add `frontend/.env` (dev): `VITE_COTRADE_URL=http://localhost:3000`.
- `frontend/src/services/api.ts`: change `API_BASE` from `/api` to `import.meta.env.VITE_COTRADE_URL` (or a helper in a new `src/services/cotrade.ts` adapter). Production builds bake the real origin.

**Production serving without backend edits:** build with `npm run build`, then serve `frontend/dist` (or `dist/`) with any static server, with API calls pointed at the Cotrade origin. (Hosting the SPA on Cotrade's own origin would require a small backend change later — optional, deferred.)

---

## 3. Transport mapping — WebSocket to SSE

ScalarAI's `hooks/useWebSocket.ts` opens `ws://host/ws/live` and expects `init`, `tick`, `trades`, `log`, `config`, `connection`, `webrequest_test`, `ai_strategy`, `pong`. Cotrade has no WebSocket server; it has SSE.

**Plan:** rewrite `useWebSocket.ts` to use `EventSource`:

1. On mount, fetch the initial composed status (section 5 adapter `getStatus()`) and feed it as the `init`-equivalent.
2. Open `new EventSource(COTRADE_URL + "/stream/portfolio?interval=1")`:
   - event `portfolio` -> update account + positions (mirrors `onTrades` + account).
   - event `error` -> mark disconnected.
3. Open `new EventSource(COTRADE_URL + "/stream/ticks?symbols=...&interval=1")`:
   - event `tick` -> set `currentPrice` from first symbol's bid/ask, append to history, update watchlist rows.
4. Drop `pong`/ping (SSE has keepalives), `log`, `config`, `connection`, `webrequest_test`, `ai_strategy` (these come from missing features — see section 6).

Cotrade SSE payload shapes (from `backend/core/server/streaming.py`):

- `portfolio` event data:
  ```json
  { "sent_at_utc": <number>, "time_source": "broker server time",
    "balance": <number>, "equity": <number>, "margin": <number>,
    "margin_free": <number>, "currency": "USD", "position_count": <int>,
    "floating_profit": <number>, "positions": [ <mt5 position>, ... ] }
  ```
- `tick` event data:
  ```json
  { "sent_at_utc": <number>, "time_source": "...",
    "symbols": { "EURUSD": { "symbol": "EURUSD", "bid": ..., "ask": ..., "time": ..., "time_msc": ..., "last": ..., "volume": ..., "flags": ... }, ... } }
  ```
- First frame is an `open` event: `{ source, interval, status: "streaming" }`. Frames also include SSE `retry:` hint and `: keepalive` comments.

Note: Cotrade's SSE sends only symbols whose price moved; the first pass always sends. React state updates should merge, not replace blindly.

---

## 4. Cotrade REST surface we will use (no edits)

From `python run.py routes` + `streaming.py`. All unprefixed.

| Cotrade route | Purpose | Used by frontend for |
|---|---|---|
| `GET /health` | `{ status, service, mt5_connected, connection, time_source, symbol_cache }` | connection indicator, health. |
| `GET /account` | Full MT5 account info (balance, equity, margin, leverage, currency, name, server, …). | account panel. |
| `GET /terminal` | Terminal info (build, path, trade_allowed, …). | connection/terminal panel. |
| `GET /totals` | `{ symbols, positions, orders }`. | counts. |
| `GET /portfolio` | `{ account, summary, positions }`. | combined snapshot. |
| `GET /positions` | `{ count, positions: [...] }`. | open positions table. |
| `GET /positions/{ticket}` | single position. | trade detail modal. |
| `GET /orders` | `{ count, orders: [...] }`. | pending orders table. |
| `GET /symbols` | `{ symbols: [full MT5 symbol objects] }` (731 on this broker). | symbol list / watchlist (filter to selected/visible, cap 24). |
| `GET /symbols/search?q=` | filtered symbols. | search on demand. |
| `GET /symbol/{symbol}` | single symbol spec. | symbol detail. |
| `POST /symbol/{symbol}/select` | select symbol. | switching active symbol. |
| `GET /tick/{symbol}` | `{ time, bid, ask, last, volume, time_msc, flags, volume_real }`. | single price. |
| `GET /ticks?symbols=...` | ticks for set. | bulk price. |
| `GET /ticks/history` | tick history. | chart seed. |
| `GET /candles/{symbol}?timeframe=M1&count=N` | `{ symbol, timeframe, timeframe_name, count, candles: [{time,open,high,low,close,tick_volume,spread,real_volume}] }`. | PriceChart. |
| `POST /order`, `/buy`, `/sell`, `/close`, `/close-all`, `/modify`, `/cancel`, `/order/check` | order execution. | trade actions. |
| `GET /history/deals?days=N` | `{ count, from, to, deals: [...] }`. | TradeList / history. |
| `GET /history/orders` | order history. | history. |
| `GET /history/totals` | `{ from, to, deals, orders }`. | stats. |
| `GET /history/summary` | `{ from, to, deal_count, realized_profit, commission, swap, net, by_side }`. | stats cards. |
| `GET /research/stored` | `{ strategies: [...] }`. | strategies list. |
| `GET /research/strategy/{name}` | single strategy. | strategy detail. |
| `GET /research/library` | research library. | knowledge base. |
| `GET /research/catalogue`, `/research/indicators`, `/research/patterns`, `/research/strategies` | catalogues. | risk tab. |
| `POST /research/backtest`, `/research/sweep`, `/research/patterns/scan`, `/research/indicator`, etc. | research actions. | research tab. |
| `GET /bot/status`, `/bot/strategies`, `/bot/sessions`, … | bot API. | bot tab. |
| `GET /db/stats`, `/db/reports`, `/db/integrity`, `/db/sessions`, `POST /db/vacuum` | DB stats. | DB hub. |
| `GET /metrics`, `/routes`, `/enums`, `/streams` | diagnostics. | optional. |
| `GET /marketbook`, `/marketbook/{symbol}`, subscribe/unsubscribe | depth of market. | optional. |

**No Cotrade route exists for:** `/api/ai-study-feed`, `/api/settings`, `/api/toggle-trade`, `/api/reset-stats`, `/api/test-webrequest/*`, `/api/github-status`, `/api/sync-from-github`, `/api/auth/github/logout`, `/api/trades/*`, `/api/ea/*`, `/api/update-market`, `/api/market/bulk-candles`, `/api/market/history`, `/ws/live`. These are ScalarAI-backend features (see section 6).

---

## 5. Adapter design (`src/services/cotrade.ts`)

Create a single adapter module so components/hooks change minimally. It wraps Cotrade calls and reshapes responses into ScalarAI's types (`src/types/api.ts`).

```ts
// src/services/cotrade.ts (new)
const BASE = import.meta.env.VITE_COTRADE_URL || "http://localhost:3000";

export async function cotradeGet(path: string) { /* fetch BASE+path, throw on !ok with server message */ }
export async function cotradePost(path: string, body?: any) { ... }

export async function getStatus(): Promise<StatusResponse> {
  const [health, account, terminal, totals, positions, orders, portfolio, summary, symbols] =
    await Promise.all([
      cotradeGet("/health"), cotradeGet("/account"), cotradeGet("/terminal"),
      cotradeGet("/totals"), cotradeGet("/positions"), cotradeGet("/orders"),
      cotradeGet("/portfolio"), cotradeGet("/history/summary"),
      cotradeGet("/symbols"),
    ]);
  const selected = (symbols.symbols || []).filter((s: any) => s.select || s.visible).slice(0, 24);
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
      isEaConnected: health.mt5_connected, clientIp: null, lastPing: null,
      broker: account.server, accountNumber: account.login,
      balance: account.balance, symbol: selected[0]?.name ?? null,
      symbolDigits: selected[0]?.digits ?? null,
      symbolTickSize: selected[0]?.trade_tick_size ?? null,
      symbolDescription: selected[0]?.description ?? null,
    },
    isBridgeConnected: health.mt5_connected,
    logs: [],
    trades: (positions.positions || []).map(toTradeRecord),
    history: [],
    status: health.status,
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
      activePositionsCount: positions.count ?? 0,
      lastHeartbeatTime: null,
    },
    webRequestStatus: null,
  };
}

export async function getCandles(symbol: string, limit = 1000) {
  const data = await cotradeGet(`/candles/${encodeURIComponent(symbol)}?timeframe=M1&count=${limit}`);
  return { candles: data.candles || [] };
}

export async function getStrategies() {
  const data = await cotradeGet("/research/stored");
  return data.strategies || [];
}

export async function switchSymbol(symbol: string) {
  try { await cotradePost(`/symbol/${encodeURIComponent(symbol)}/select`); } catch {}
  return { success: true, activeSymbol: symbol };
}
```

`toTradeRecord` maps Cotrade position fields (`ticket`, `_type`, `volume`, `price_open`, `sl`, `tp`, `price_current`, `profit`, `symbol`, `time`, `comment`) to ScalarAI's `TradeRecord`.

Also update `src/services/api.ts` `ApiClient` to delegate to these adapters, or replace call sites in `App.tsx` directly. Recommended: keep `api.ts` but implement methods via adapter so existing call sites mostly survive.

---

## 6. Feature gaps and remapping (frontend only)

Cotrade is **not** EA-based: it connects to MT5 through the official Python package, so there is no EA to download, no web-request verification, and no bridge polling. Several ScalarAI features must be dropped or repurposed. Cotrade's own site has 5 pages (Dashboard, Symbols, Research, History, Bot & Database) — map ScalarAI's tabs onto those.

### 6.1 Cotrade site pages to ScalarAI tab mapping

| Cotrade page | Route | ScalarAI tab to reuse | Cotrade endpoints to wire |
|---|---|---|---|
| Dashboard (account overview) | `/` | Live Trading (home) | `/account`, `/terminal`, `/positions`, `/orders`, `/portfolio`, `/stream/portfolio`, `/stream/ticks`, `/history/summary`, `/history/totals`. |
| Symbols (instrument browser) | `/ui/symbols` | (new tab or section in Risk) | `/symbols/search`, `/symbol/{s}`, `/symbol/{s}/select`, `/tick/{s}`, `/ticks`. Search on demand — never fetch all 731 at once. |
| Research (pattern lab) | `/ui/research` | Risk & Strategy | `/research/catalogue`, `/research/indicators`, `/research/patterns`, `/research/strategies`, `/research/stored`, `/research/strategy/{name}`, `/research/backtest`, `/research/sweep`, `/research/patterns/scan`, `/research/indicator`, `/research/library`, `/research/reports/best`. |
| History (account history) | `/ui/history` | (new tab or section) | `/history/deals`, `/history/orders`, `/history/totals`, `/history/summary`. |
| Bot & Database | `/ui/bot` | (new tab) | `/bot/status`, `/bot/strategies`, `/bot/sessions`, `/bot/sessions/{id}`, `/db/stats`, `/db/reports`, `/db/integrity`, `/db/sessions`, `/db/vacuum`. |

### 6.2 ScalarAI features with no Cotrade equivalent

| Feature | ScalarAI files | Action |
|---|---|---|
| AI study feed / synthesized strategy | `hooks/useAiStudyFeed.ts`, `components/ai/AiStudyFeed.tsx`, `components/ai/StrategyPanel.tsx` | Cotrade research has patterns/indicators but no AI synthesis. Stub `useAiStudyFeed` to return calibrating state; hide `AiStudyFeed` banner. Reuse `KnowledgeBase` component fed from `/research/stored`. |
| Settings persistence | `hooks/useSettings.ts` (`applySettings` -> POST /api/settings), `components/settings/SettingsForm.tsx`, `AssetSelector.tsx` | Cotrade has no config store. Keep settings in React state + `localStorage` (already does for endpoint). Make `applySettings` update local state only + `fetchStatus()`. Lot size / TP / SL become inputs applied to `/buy`/`/sell`/`/order`/`/modify` calls. |
| Toggle trade / reset stats | `hooks/useTradingControls.ts` | Map toggle -> start/stop a bot session via `/bot/sessions` (or a local flag). Reset stats -> no-op + local counter clear (or `/close-all`). Stub with toasts if not wiring bot. |
| Test web request | `components/settings/WebRequestTest.tsx`, `/api/test-webrequest/*` | This verified EA web requests — irrelevant. Remove from Settings form. |
| GitHub sync/status/logout | `/api/github-status`, `/api/sync-from-github`, `/api/auth/github/logout` | Remove buttons. |
| Downloads center / EA generator | `components/downloads/DownloadsCenter.tsx`, `hooks/useDownloadBridge.ts`, `lib/mql5_generator.ts`, `/api/ea/*`, `/api/update-market`, `/api/market/bulk-candles`, `/api/trades/*` | **Repurpose the tab into an informational "About / How Cotrade works" page**: explain that Cotrade connects directly to MT5 via the official Python package, exposes REST + SSE streams, research lab, bot sessions, and database tools. No EA to download. Remove `useDownloadBridge` and `mql5_generator` usage. |
| Bridge console (MCP) | `components/bridge/BridgeConsole.tsx` | Cotrade has no MCP endpoint. Remove tab. |
| Strategy list | `fetchStrategies` -> `/api/strategies` | Map to `/research/stored`. |
| Logs | `LogsViewer` | Cotrade has no log stream. Feed from `/db/*` or bot session logs (`/bot/sessions/{id}/logs`), or hide. |

**Pragmatic recommendation:** keep the visual shell (Header, TabBar, PriceChart, TradeList, LogsViewer, StatusBar) and core data flows. Remap tabs to Cotrade's 5 pages (Dashboard, Symbols, Research, History, Bot & DB) plus an informational About tab. Drop EA/bridge/MCP/GitHub/web-request features. Risk/Strategy tab displays research strategies and pattern scans.

---

## 7. `App.tsx` wiring changes (file-level)

- Replace `fetch("/api/status")` -> adapter `getStatus()`.
- Replace `fetch("/api/market/candles?...")` -> adapter `getCandles(activeSymbol, 1000)`.
- Replace `fetch("/api/strategies")` -> adapter `getStrategies()`.
- Replace `switchSymbol` POST to `/api/status/switch-symbol` -> local state + adapter `switchSymbol` + refetch candles.
- Remove calls to `/api/toggle-trade`, `/api/reset-stats`, `/api/settings`, `/api/test-webrequest/*`, `/api/github-status`, `/api/sync-from-github`, `/api/auth/github/logout`, `/api/trades/*`, `/api/ea/*`.
- Remove `useWebSocket` usage; use SSE hook (section 3). Map callbacks:
  - `onInit` <- initial composed status.
  - `onTick` <- `/stream/ticks` event.
  - `onTrades` <- `/stream/portfolio` event.
  - `onLog` / `onConfig` / `onConnection` / `onWebRequestTest` / `onAiStrategy` -> drop or no-op.
- Replace `useWebSocket` import with new `useCotradeStream` (or inline EventSource in `App.tsx`).
- `useAiStudyFeed(sendWsMessage)` -> stub or remove; if removed, delete its `useEffect` sync block.
- `useDownloadBridge` -> remove usage (Downloads tab becomes About page).
- `fetchStrategies` -> use adapter.

---

## 8. Component prop adjustments

Components that receive props tied to removed features need prop cleanup, but most can stay with stubbed data:

- `Header`: `isBridgeConnected`, `connection`, `activeSymbol`, `symbolStates`, `currentPrice` — all available from composed status.
- `TradeList`: `tradesList`, `currentPrice`, `selectedStrategy`, `onCloseAllPositions` -> map close-all to `POST /close-all` via adapter.
- `PriceChart`: candles/history from adapter; `lastStrategySignal` -> null (no strategy signals from Cotrade backend).
- `StatsCards`: stats from `/history/summary` + totals.
- `LogsViewer`: logs -> `[]` or fetch from `/db/*` / bot session logs; Cotrade has no log stream. Could poll `/db/stats`.
- `SettingsForm` / `AssetSelector`: remove web-request test + GitHub; keep local settings.
- `DownloadsCenter`: repurpose into About/How-it-works page (static content + maybe `/health`, `/db/stats`).
- `BridgeConsole`: remove tab.
- `KnowledgeBase`: feed from `/research/stored`.

---

## 9. Incremental execution phases

1. **Copy + build + dev servers** (section 2). Verify Vite serves the copied app and can reach Cotrade (`/health`).
2. **Adapter `getStatus()`** (section 5). Render Header + account + positions + watchlist.
3. **SSE hook** (section 3). Live price + positions updating.
4. **Candles** (`/candles/{s}`) -> PriceChart.
5. **History** (`/history/deals`, `/history/summary`) -> TradeList/history tab + stats.
6. **Symbols** (`/symbols/search`, `/symbol/{s}`) -> Symbols tab.
7. **Research** (`/research/*`) -> Risk & Strategy tab.
8. **Bot & DB** (`/bot/*`, `/db/*`) -> Bot tab.
9. **Trade actions** (`/buy`, `/sell`, `/close`, `/close-all`, `/modify`) -> TradeList buttons.
10. **Repurpose Downloads into About page**; remove EA/bridge/MCP/GitHub/web-request features.
11. **Production build** + static serving.

---

## 10. Risks / caveats

- **No AI study feed, no EA bridge, no MCP, no GitHub sync, no persisted settings, no web-request test** on Cotrade backend. These ScalarAI features must be removed or stubbed; they cannot be "wired up" without backend additions (which we are avoiding).
- **Symbol count:** `/symbols` returns ~731 instruments (~1.5 MB). Cotrade's old frontend filtered to visible/selected (<=24). The adapter must filter to `select || visible` and cap, otherwise the React app will choke. Cotrade's `_watchlist` logic in `views.py` does exactly this — mirror it in the adapter.
- **Candle timeframe:** Cotrade default `timeframe=M1`. ScalarAI expects arbitrary; keep M1 for now or pass through.
- **History size:** `/history/deals` defaults to 2 days; pass `?days=N`. Cap rows for UI.
- **Stats:** Cotrade has no "win rate" directly. `/history/summary` gives realized_profit, commission, swap, net, by_side. Win rate would need client-side computation from deals (count profitable / total). Optional.
- **Auth:** Cotrade has no auth on most routes (CORS `*`). State-changing routes (none critical for read-only dashboard) are open. Fine for local dev.
- **Order execution shapes:** Cotrade `/buy`/`/sell`/`/order` expect `{ symbol, volume, ... }`. Verify exact body fields in `handlers.py` before wiring trade buttons (not fully captured here).
- **SSE reconnection:** EventSource auto-reconnects; mark stale on `error`, clear on `open`. Don't schedule manual retries.
- **MT5 may be disconnected:** `/health.mt5_connected=false`. Adapter should degrade gracefully (empty positions, zero price) and surface status.
- **Research verdicts:** all computed server-side; frontend only displays. Pattern scan requires symbol + timeframe params.

---

## 11. Files to touch (frontend only)

New:
- `frontend/src/services/cotrade.ts` (adapter).
- `frontend/src/hooks/useCotradeStream.ts` (SSE-based, replaces `useWebSocket`).

Edited:
- `frontend/src/services/api.ts` (delegate to adapter or change base).
- `frontend/src/App.tsx` (swap fetches/WS, remap tabs, remove missing-feature tabs).
- `frontend/src/hooks/useAppStatus.ts` (use adapter `getStatus`).
- `frontend/src/hooks/useTradingControls.ts` (map to Cotrade or stub).
- `frontend/src/hooks/useSettings.ts` (local-only apply; drop webrequest test).
- `frontend/src/hooks/useAiStudyFeed.ts` (stub).
- `frontend/src/types/api.ts` (relax fields to optional where Cotrade shapes differ).
- `frontend/vite.config.ts` (remove `/api` proxy; env base).
- `frontend/.env` (dev base URL).

Removed from `App.tsx` renders / features:
- `BridgeConsole` (MCP) tab.
- `WebRequestTest` in settings.
- GitHub sync/status/logout buttons.
- `useDownloadBridge` / `mql5_generator` usage; Downloads tab becomes About/How-it-works page (static content).

Untouched:
- All of `backend/`, `deamon/`, `cony/`, `run.py`, `app.py`, `cli.py`.
- Cotrade's own `frontend/` is deleted and replaced by the copy (this is the one intended filesystem change).

---

## 12. Success criteria

- Vite dev server (`:5173`) loads the copied ScalarAI UI.
- Header shows account balance/equity/currency and connection state from Cotrade.
- Positions table shows Cotrade's open positions and updates via `/stream/portfolio`.
- Watchlist shows selected symbols with live bid/ask via `/stream/ticks`.
- PriceChart renders M1 candles from `/candles/{symbol}`.
- Symbols tab searches via `/symbols/search` and shows specs via `/symbol/{s}`.
- Research tab calls `/research/*` endpoints and displays results.
- History tab shows deals and summary from `/history/*`.
- Bot tab shows sessions and DB stats from `/bot/*` and `/db/*`.
- About tab shows informational content (no EA download).
- Trade actions (buy/sell/close) call Cotrade endpoints successfully.
- Backend improvements applied (see preparation.md): `/api` shim, SPA serving, SPA fallback. `git diff` touches `frontend/` plus a few backend files.

---

## 13. Frontend code edit checklist (what to change in copied code)

Concrete edits required in the copied ScalarAI frontend so it talks to Cotrade. Each maps to a stage.

### Services
- `src/services/api.ts`: change `API_BASE` from `/api` to `import.meta.env.VITE_COTRADE_URL`.
- New `src/services/cotrade.ts`: adapter with `cotradeGet`, `cotradePost`, `getStatus`, `getCandles`, `getStrategies`, `switchSymbol`, `searchSymbols`, `getSymbol`, `selectSymbol`, `getHistoryDeals`, `getHistorySummary`, `getHistoryTotals`, `getHistoryOrders`, `getResearch*`, `runBacktest`, `runSweep`, `scanPatterns`, `runIndicator`, `getReportsBest`, `getBot*`, `getDb*`, `buyOrder`, `sellOrder`, `closePosition`, `closeAll`, `modifyPosition`, `cancelOrder`, `checkOrder`, `placeOrder`, `toTradeRecord`.

### Hooks
- `src/hooks/useAppStatus.ts`: use adapter `getStatus`.
- New `src/hooks/useCotradeStream.ts`: EventSource for `/stream/portfolio` + `/stream/ticks`.
- `src/hooks/useWebSocket.ts`: remove usage (or delete).
- `src/hooks/useTradingControls.ts`: use adapter REST calls; remove WS messages.
- `src/hooks/useSettings.ts`: `applySettings` updates local state only + `fetchStatus()`; remove web-request test.
- `src/hooks/useAiStudyFeed.ts`: stub or remove.
- `src/hooks/useDownloadBridge.ts`: remove usage.

### App.tsx
- Swap `fetch("/api/status")` -> `getStatus()`.
- Swap `fetch("/api/market/candles?...")` -> `getCandles(activeSymbol, 1000)`.
- Swap `fetch("/api/strategies")` -> `getStrategies()`.
- Swap `switchSymbol` POST -> adapter `switchSymbol` + refetch candles.
- Remove calls to `/api/toggle-trade`, `/api/reset-stats`, `/api/settings`, `/api/test-webrequest/*`, `/api/github-status`, `/api/sync-from-github`, `/api/auth/github/logout`, `/api/trades/*`, `/api/ea/*`.
- Remove `useWebSocket` usage; use `useCotradeStream`.
- Remove `useAiStudyFeed` usage (or stub).
- Remove `useDownloadBridge` usage.
- Remap TabBar tabs to Cotrade pages (Dashboard, Symbols, Research, History, Bot & DB, About, Settings, optional Logs).
- Remove `BridgeConsole`, `WebRequestTest`, `DownloadsCenter` (repurpose to About) renders.

### Types
- `src/types/api.ts`: make fields optional to match Cotrade shapes.

### Config
- `vite.config.ts`: remove `/api` proxy; keep `outDir`.
- Add `frontend/.env`: `VITE_COTRADE_URL=http://localhost:3000`.

### Components
- `Header`: map Cotrade fields to `EAConnectionDetails`.
- `TradeList`: close/modify via adapter.
- `PriceChart`: candles from adapter; `lastStrategySignal` = null.
- `StatsCards`: stats from `/history/summary` + totals.
- `KnowledgeBase`: feed from `/research/stored`.
- `SettingsForm`/`AssetSelector`: remove web-request test + GitHub; local settings.
- `DownloadsCenter`: repurpose to About page (static + `/health`, `/db/stats`).
- Remove `BridgeConsole` tab.

### Verification
- No `/api/*` 404s remain.
- All tabs functional against Cotrade.

---

## 14. Stage files (execution order)

Detailed per-stage instructions live in this folder:

| Stage | File | Summary |
|---|---|---|
| 1 | [stage1.md](stage1.md) | Copy frontend, install deps, dev servers. |
| 2 | [stage2.md](stage2.md) | Adapter skeleton + composed status. |
| 3 | [stage3.md](stage3.md) | SSE streams (live price + positions). |
| 4 | [stage4.md](stage4.md) | Candles + PriceChart. |
| 5 | [stage5.md](stage5.md) | Symbols browser. |
| 6 | [stage6.md](stage6.md) | History. |
| 7 | [stage7.md](stage7.md) | Research (Risk & Strategy). |
| 8 | [stage8.md](stage8.md) | Bot & Database. |
| 9 | [stage9.md](stage9.md) | Trade actions. |
| 10 | [stage10.md](stage10.md) | Repurpose Downloads -> About; remove missing features. |
| 11 | [stage11.md](stage11.md) | Production build + serving. |