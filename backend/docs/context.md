# Cotrade — Project Context

> Single source of truth for the basic facts about this project. If anything
> changes (versions, counts, stack), update this file first, then update the
> docs that reference it.

---

## What this is

Cotrade is a MetaTrader 5 gateway and trading dashboard. A Python daemon
attaches to the MT5 terminal through the official `MetaTrader5` package and
exposes it as a JSON REST API with SSE streams and a React/Vite dashboard.
It includes a research layer for backtesting, pattern scanning, and strategy
validation.

---

## Tech stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Language | Python 3.11+ | MT5 package ships `cp311-win_amd64` binary |
| HTTP server | Pure Python stdlib (`http.server`) | No framework, no async |
| SSE | Server-Sent Events via stdlib | No dependency |
| Database | SQLite (WAL mode) | `backend/database/data/peron.db` |
| Frontend | React 19 + TypeScript + Vite 6 + Tailwind v4 | `frontend/`, builds to `dist/` |
| MT5 bridge | Official `MetaTrader5` package | Windows only, `C:\Users\faarh\Workspaces\Tools\peron\metatrader5_package` |
| Testing | pytest | `backend/tools/simulatedtester/tests` |
| Linting | ruff | `backend/pyproject.toml` |

---

## Database

- **Engine:** SQLite in WAL mode with `busy_timeout=5000`
- **Location:** `backend/database/data/peron.db`
- **Tables:** 11 — `strategies`, `strategy_versions`, `indicators`, `patterns`, `reports`, `pattern_hits`, `hit_context`, `bars`, `report_trades`, `bot_sessions`, `bot_logs`
- **Indexes:** 13 + 1 trigger (`trg_strategies_updated`)
- **Access:** `database.store.Store` (thread-safe, RLock)
- **Repositories:** `database/repositories.py` (thin wrappers over Store)

---

## API

- **Total routes:** 99
- **Protocol:** JSON over HTTP, SSE for streams
- **Default port:** 3000 (dev), 8890 (gateway)
- **Auth:** None (localhost-only by default)
- **Compatibility:** `/api/*` prefix is stripped so both `/api/health` and `/health` resolve

### Route breakdown

| Prefix | Count | Purpose |
|--------|-------|---------|
| `/mcp` | 1 | JSON-RPC 2.0 surface for AI agents: 39 tools, 7 resources, 6 prompts |
| `/research` | 29 | Strategy validation, backtests, pattern scans, indicators |
| `/bot` | 12 | Bot session management, logs, pause/resume/stop |
| `/database` + `/db` | 10 | DB stats, reports, integrity, vacuum, sessions |
| `/marketbook` | 5 | Depth of market subscribe/get/unsubscribe |
| `/calc` | 3 | Position sizing, margin, profit calculators |
| `/history` | 4 | Deals, orders, totals, summary |
| `/symbol` + `/symbols` | 4 | Instrument specs and search |
| `/stream` | 3 | SSE: ticks, marketbook, portfolio |
| Other | 29 | Account, terminal, positions, orders, trading, health, routes, enums |

### SSE streams

| Stream | Emits |
|--------|-------|
| `/stream/ticks` | Ticks when price moves |
| `/stream/marketbook` | Depth of market |
| `/stream/portfolio` | Account + open positions |

---

## Knowledgebase

| Category | Count | Location |
|----------|-------|----------|
| Indicators | 25 | `knowledgebase/indicators.py` |
| Patterns | 28 | `knowledgebase/patterns.py` |
| Entry rules | 11 | `knowledgebase/strategies.py` |
| Strategy templates | 13 | `knowledgebase/strategies.py` → `library()` |
| Enum maps | 28 | `gateway/mt5_pkg_bridge/enums.py` |

---

## MT5 coverage

- **Public functions wrapped:** 35/35 (all of them)
- **Enum maps exposed:** 28 (order types, timeframes, filling modes, trade return codes, position/order/deal reasons, symbol calc/trade/swap modes, tick flags, etc.)
- **Package:** `MetaTrader5>=5.0.45` (Windows only, CPython 3.11)

---

## Architecture

```
deamon/ (HTTP, sockets, SSE, process lifecycle)
  ↓
core/server/ (routing, handlers, validation, research, bot, db routes)
  ↓
gateway/mt5_pkg_bridge/ (MT5 engine — no HTTP knowledge)
  ↓
MetaTrader5 package → MT5 terminal
```

Optional extensions registered via `core/plugins.py`:
- `core/mcp/` — `POST /mcp`, the Model Context Protocol surface (see below)
- `core/server/research.py` — `/research/*` routes
- `core/server/bot_routes.py` — `/bot/*` routes
- `core/server/db_routes.py` — `/db/*` and `/database/*` routes
- `managers/front_manager/frontconnect/` — `/`, `/ui/*`, `/assets/*`, SPA serving from `dist/`

---

## MCP (Model Context Protocol)

`POST /mcp` speaks JSON-RPC 2.0 so an AI agent can drive the gateway directly.

```bash
curl -X POST http://localhost:3000/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -X POST http://localhost:3000/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"get_portfolio","arguments":{}}}'
```

- **Files:** `core/mcp/__init__.py` (plugin registration), `server.py` (JSON-RPC dispatcher),
  `tools.py` (tool catalogue), `resources.py` (read-only views), `prompts.py` (workflow templates)
- **Methods:** `initialize`, `tools/list`, `tools/call`, `resources/list`,
  `resources/read`, `prompts/list`, `prompts/get`, `ping`
- **Tools:** 39 — diagnostics, account/portfolio, positions/orders, market data,
  execution (buy/sell/close/modify/cancel), calculators, history, research
  (catalogue/validate/backtest/sweep/scan/indicator), database, bot
- **Resources:** `cotrade://health`, `://account`, `://terminal`, `://portfolio`,
  `://positions`, `://symbols`, `://routes`
- **Prompts:** `market_overview`, `research_symbol`, `risk_position`,
  `close_exposure`, `audit_risk`, `session_report`

**CLI parity.** Where a CLI command exists, the MCP tool calls the same
underlying service and returns JSON instead of a printed table:

| `python cli.py` | MCP tool | Shared implementation |
|---|---|---|
| `sweep SYMBOL` | `sweep` | `Research.sweep` |
| `scan SYMBOL` | `scan_patterns` | `Research.pattern_scan` |
| `list` | `list_knowledgebase` / `list_strategies` | `Research.catalogue` / `.list_strategies` |
| `report` | `db_reports` | `Store.reports` |
| `db` | `db_stats` / `db_integrity` | `Store.stats` / `.check_integrity` |
| `routes` | `list_routes` | router |

This is why MCP lives in `core/` rather than `gateway/`: `gateway/` is the MT5
bridge and must stay free of HTTP and protocol concerns.

---

## Entry points

| Command | Purpose |
|---------|---------|
| `python dev.py` | Start backend + Vite frontend together |
| `python run.py` | Start backend + built SPA (default 0.0.0.0:3000) |
| `python run.py server --port P --host H` | Custom port/host |
| `python run.py db` | Database stats + integrity |
| `python run.py routes` | List all routes |
| `python run.py bot sweep EURUSD` | Strategy sweep |
| `python run.py bot scan EURUSD` | Pattern scan |
| `python app.py` | AI Studio entry point (0.0.0.0:3000) |
| `cd frontend && npm run dev` | Vite dev server (port 5173, HMR) |
| `cd frontend && npm run build` | Production build to `dist/` |

---

## Testing

```bash
cd backend && PYTHONPATH=. python -m pytest tools/simulatedtester/tests -q
```

- **Test count:** 21 tests across 5 files
- **Coverage:** knowledgebase (indicators, patterns, strategies), engine fills, database store
- **Not covered:** live MT5 integration (requires Windows + terminal)

---

## Key files

| File | Purpose |
|------|---------|
| `dev.py` | Unified dev launcher (backend + Vite) |
| `run.py` | Root entry point, CLI |
| `app.py` | AI Studio entry point |
| `frontend/src/App.tsx` | React root component (tabs, data flow) |
| `frontend/src/services/cotrade.ts` | Backend API adapter |
| `frontend/src/hooks/useCotradeStream.ts` | SSE stream hook |
| `backend/core/config.py` | Centralized env config |
| `backend/core/mcp/server.py` | JSON-RPC 2.0 dispatcher for `POST /mcp` |
| `backend/core/mcp/tools.py` | 39 MCP tools over engine + Research |
| `backend/core/mcp/resources.py` | Read-only `cotrade://` resources |
| `backend/core/mcp/prompts.py` | Agent workflow prompts |
| `backend/gateway/cli/app.py` | Unified CLI (`serve`, `db`, `routes`, `sweep`, `scan`, `list`, `report`) |
| `backend/core/plugins.py` | Extension registration |
| `backend/core/server/handlers.py` | Core HTTP handlers |
| `backend/core/server/streaming.py` | SSE producers |
| `backend/managers/front_manager/frontconnect/assets.py` | SPA + static asset serving |
| `backend/gateway/mt5_pkg_bridge/mt5_engine.py` | MT5 engine (35 functions) |
| `backend/gateway/deamon/__main__.py` | Daemon assembly + HTTP server |
| `backend/knowledgebase/indicators.py` | 25 indicators |
| `backend/knowledgebase/patterns.py` | 28 patterns |
| `backend/knowledgebase/strategies.py` | 11 entry rules + 13 templates |
| `backend/tools/bot/engine.py` | Backtest engine |
| `backend/database/store.py` | SQLite access layer |

---

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `CONY_HOST` | `0.0.0.0` | Bind address |
| `CONY_PORT` | `3000` | Bind port |
| `CONY_URL` | — | Override gateway URL |
| `CONY_MT5_PACKAGE` | auto | MT5 package directory |
| `MT5_LOGIN` / `MT5_PASSWORD` / `MT5_SERVER` | — | Account credentials |
| `MT5_PATH` | — | terminal64.exe path |
| `CONY_AUTO_CONNECT` | `true` | Attach on startup |
| `CONY_CORS_ORIGIN` | `*` | CORS origin |
| `VITE_COTRADE_URL` | `http://localhost:3000` | Frontend API base URL |

---

## Design principles

1. **Layer separation** — `deamon → server → mt5_pkg_bridge`, dependencies point one way
2. **No fake data** — all data comes from the real MT5 terminal
3. **Honest statistics** — verdicts based on t-statistics, not profit
4. **Case preservation** — MT5 symbol names used as-is
5. **Knowledgebase purity** — no I/O, no database, no gateway imports
6. **Cony isolation** — no HTTP, no server, no JSON concerns