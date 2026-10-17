# Cotrade

MetaTrader 5 gateway, real-time trading dashboard, research analytics, and algorithmic strategy engine.

Python drives the terminal through the official `MetaTrader5` package and exposes it three ways: a JSON REST API for autonomous agents, a research API for strategy work, and a React/Vite dashboard for users.

> For basic project facts (tech stack, database, API counts, architecture), see [`backend/docs/context.md`](backend/docs/context.md).

---

## Quick Start from Root

Run both backend and frontend with a single command:

```bash
# Start backend (:3000) + Vite dev server (:5173)
python dev.py
```

Or start them separately:

```bash
# Backend only (binds 0.0.0.0:3000)
python run.py

# Frontend only (Vite on :5173)
cd frontend && npm install && npm run dev
```

Other commands:

```bash
python run.py server --port 8890 --host 127.0.0.1
python run.py db
python run.py routes
python run.py bot sweep EURUSD
```

---

## Web Dashboard & Navigation

| Route | Description |
|---|---|
| `http://localhost:5173/` | **Dev dashboard** (Vite + HMR) |
| `http://localhost:3000/` | **Built SPA dashboard** (served by backend) |
| `http://localhost:3000/mcp` | **MCP endpoint** — JSON-RPC 2.0 for AI agents (39 tools, 7 resources, 6 prompts) |
| `/` | **Live Trading** — account overview, positions, market watch, live chart |
| `/#/symbols` | **Symbols** — all broker symbols with live price cards |
| `/#/risk` | **Knowledgebase** — strategies, indicators, patterns, entry rules, pattern scan |
| `/#/history` | **History** — deals, summary stats (P/L, commission, swap, net) |
| `/#/bot` | **Bot & Database** — live bot status, sessions, DB stats, integrity, vacuum |
| `/#/about` | **About** — site info |
| `/#/settings` | **Settings** — local trade params + backend info |
| `http://localhost:3000/health` | **Health Probe** — gateway status |
| `http://localhost:3000/routes` | **Route Directory** — all API routes |

---

## Architecture

- **Backend**: Pure Python HTTP server with SSE event streaming (`/stream/portfolio`, `/stream/ticks`, `/stream/marketbook`). Zero external dependencies.
- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind v4 in `frontend/`. Built output goes to `dist/` and is served by the backend on the same origin.
- **Database**: Embedded SQLite in `backend/database/data/peron.db` running in WAL mode with auto-indexing.
- **Gateway**: Decoupled 3-layer architecture (`deamon` → `server` → `mt5_pkg_bridge`).
- **MT5 Package**: Official `MetaTrader5` package from `C:\Users\faarh\Workspaces\Tools\peron\metatrader5_package` (all 35 public functions wrapped).
- **Knowledgebase**: Pure-logic indicators, patterns, and strategies (see `backend/docs/context.md` for counts).

## MCP — AI agent access

`POST /mcp` speaks JSON-RPC 2.0, so an agent can drive the gateway directly:

```bash
# List available tools
curl -X POST http://localhost:3000/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call one
curl -X POST http://localhost:3000/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"get_portfolio","arguments":{}}}'
```

39 tools covering diagnostics, account/portfolio, positions/orders, market data,
execution, calculators, history, research (backtest, sweep, pattern scan),
database and bot. Where a CLI command exists (`sweep`, `scan`, `list`, `report`,
`db`, `routes`) the MCP tool calls the same service, so the two surfaces cannot
drift apart.

---

## Environment variables
- `PERON_DB` / `CONY_DB_PATH` — SQLite database path.
- `CONY_MT5_PACKAGE` / `MT5_PACKAGE_PATH` — installed MetaTrader5 package location.
- `PORT` / `HOST` / `CONY_PORT` / `CONY_HOST` — listener selection.
- `CONY_URL` — explicit gateway base URL.
- `CONY_FRONTEND_DIR` — override frontend assets location.
- `CONY_CORS_ORIGIN` — allowed browser Origin (default `*`).
- `CONY_AUTO_CONNECT=false` — run without MT5 for UI development.
- `VITE_COTRADE_URL` — frontend base URL for API calls (default `http://localhost:3000`).