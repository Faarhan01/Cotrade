# Cotrade — Project Context (Legacy)

> This file has been superseded by [`docs/context.md`](../context.md).
>
> The canonical source of truth for basic project facts (tech stack, database,
> API counts, architecture, configuration) now lives in `backend/docs/context.md`.
> This file is preserved for historical reference only.

---

## Overview

- **Project name:** Cotrade
- **Repo root:** `/workspaces/trader`
- **Purpose:** MetaTrader 5 gateway, real-time trading dashboard, research analytics platform, and algorithmic strategy engine
- **Languages:** Python (backend), HTML/CSS/JS (frontend)
- **Dependencies:** `MetaTrader5` (system), standard library only (Python). Frontend: no build step, no npm, no CDN, no web fonts.
- **Database:** SQLite (`backend/database/data/peron.db`) in WAL mode with auto-indexing
- **Gateway default port:** 8890 (not 8888 — Cotrade's `peron_bridge.py` uses 8888)

## Architecture (3-Layer Gateway)

```
AI agent / app  →  deamon (HTTP)  →  server (routing)  →  cony (engine)  →  MetaTrader5  →  MT5 terminal
```

| Package | Location | Responsibility |
|---------|----------|----------------|
| `cony` | `backend/gateway/cony/` | MT5 engine — no HTTP, no server. Just MT5 operations returning dicts |
| `server` | `backend/core/server/` | HTTP routing, validation, JSON shaping, SSE streams |
| `deamon` | `backend/gateway/deamon/` | Process lifecycle — config, logging, sockets, startup |
| `frontconnect` | `backend/core/frontconnect/` | Web UI routes — optional extension |
| `knowledgebase` | `backend/knowledgebase/` | Indicators, patterns, strategies as pure logic (no I/O) |
| `tools/bot` | `backend/tools/bot/` | Backtesting, pattern checking, live execution |
| `database` | `backend/database/` | SQLite access layer + schema |

Dependencies run one way: `deamon → server → cony`. Neither `cony` nor `server` imports `deamon`.

## Entry Points

- `run.py` (root) — Unified application runner & dev server (CLI entry point)
- `app.py` (root) — Entry point for AI Studio, runs daemon on host 0.0.0.0:3000
- `backend/gateway/deamon/__main__.py` — Gateway assembly, sockets, SSE transport
- `python -m deamon` (from `backend/gateway/`) — starts daemon

## Key Components

### 1. MetaTrader 5 Gateway (`backend/gateway/cony/`)

**connection.py** — `ConnectionManager`: Thread-safe terminal lifecycle with auto-reconnect.

**mt5_engine.py** — `MT5Engine`: Wraps all public functions of MetaTrader5 with derived symbol fields (pip size, lot rules, spread, margin, pip value per lot).

**enums.py** — All MT5 constant maps derived from the installed package at runtime.

### 2. HTTP Server (`backend/core/server/`)

**routes.py** — `Router`: URL pattern matching with `{param}` and `{param...}` wildcards.

**handlers.py** — `RouteHandlers`: All core HTTP endpoints.

**Optional extensions:** Research API, Database API, Bot API, Dashboard.

### 3. Knowledgebase (`backend/knowledgebase/`)

**Pure logic only:** no I/O, no database, no gateway, no numpy.

- **Indicators** (`indicators.py`) — SMA, EMA, WMA, RSI, ATR, Bollinger, MACD, Stochastic, ADX, Donchian, Slope, VWAP, CCI, Z-Score, OBV, CMF, Parabolic SAR, SuperTrend, Keltner, Ichimoku, MFI, Williams %R, Trix, ADL, Stochastic RSI
- **Patterns** (`patterns.py`) — Candlestick and price-action detectors with `scan()` and `describe()`
- **Strategies** (`strategies.py`) — `Context`, `ExitRule`, `SizingRule`, `Strategy` dataclasses with `ENTRY_RULES` and `library()`

### 4. Backtest Engine (`backend/tools/bot/engine.py`)

Event-driven simulation with t-statistic verdicts, train/test splits, walk-forward analysis, and parameter sensitivity testing.

### 5. Database (`backend/database/`)

**Store** (`store.py`) — Thread-safe SQLite wrapper with full CRUD for strategies, reports, pattern hits, bar cache, bot sessions.

**schema.py** — 11 tables with indexes and triggers.

## Configuration

All environment variables are centralized in `backend/core/config.py`. See `backend/docs/context.md` for the full reference.

## Design Principles

1. **No external dependencies** — frontend is pure HTML/CSS/JS
2. **Layer separation** — `deamon → server → cony` strict boundaries
3. **No fake data** — all data from real MT5 terminal
4. **Honest statistics** — verdicts based on t-statistics, not profit
5. **Case preservation** — MT5 symbol names as-is
6. **Timezone awareness** — all times in broker time with published offset
