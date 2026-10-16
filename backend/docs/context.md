# Cotrade — Project Context

> Single source of truth for the basic facts about this project. If anything
> changes (versions, counts, stack), update this file first, then update the
> docs that reference it.

---

## What this is

Cotrade is a MetaTrader 5 gateway and trading dashboard. A Python daemon
attaches to the MT5 terminal through the official `MetaTrader5` package and
exposes it as a JSON REST API with SSE streams and a vanilla HTML/CSS/JS
dashboard. It includes a research layer for backtesting, pattern scanning,
and strategy validation.

---

## Tech stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Language | Python 3.11+ | MT5 package ships `cp311-win_amd64` binary |
| HTTP server | Pure Python stdlib (`http.server`) | No framework, no async |
| SSE | Server-Sent Events via stdlib | No dependency |
| Database | SQLite (WAL mode) | `backend/database/data/peron.db` |
| Frontend | Vanilla HTML/CSS/JS | No build step, no npm, no CDN |
| MT5 bridge | Official `MetaTrader5` package | Windows only |
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

### Route breakdown

| Prefix | Count | Purpose |
|--------|-------|---------|
| `/research` | 29 | Strategy validation, backtests, pattern scans, indicators |
| `/bot` | 12 | Bot session management, logs, pause/resume |
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
| Enum maps | 28 | `gateway/cony/enums.py` |

### Indicator categories

Trend: SMA, EMA, WMA, ADX, slope, parabolic_sar, supertrend, trix, ichimoku
Momentum: RSI, MACD, stochastic, CCI, stoch_rsi, williams_r
Volatility: ATR, bollinger, donchian, keltner
Volume: VWAP, OBV, CMF, MFI, ADL
Statistical: Z-score

### Pattern families

Candlestick (20): doji, hammer, shooting_star, bullish/bearish_engulfing, morning/evening_star, marubozu, pinbar_bullish/bearish, fvg_bullish/bearish, abandoned_baby, three_line_strike, tasuki_gap, mat_hold, dark_cloud_cover, piercing_line, tweezer_top, tweezer_bottom, gap_up, gap_down
Price action (4): support_touch, resistance_touch, higher_low, lower_high, breakout_up/down

### Entry rules

rsi_reversion, ma_cross, breakout_entry, pattern_entry, momentum_entry, trend_strength_entry, bollinger_band_entry, macd_cross_entry, stoch_cross_entry, vwap_reversion_entry, ichimoku_cross_entry

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
gateway/cony/ (MT5 engine — no HTTP knowledge)
  ↓
MetaTrader5 package → MT5 terminal
```

Optional extensions registered via `core/plugins.py`:
- `core/server/research.py` — `/research/*` routes
- `core/server/bot_routes.py` — `/bot/*` routes
- `core/server/db_routes.py` — `/db/*` and `/database/*` routes
- `core/frontconnect/` — `/`, `/ui/*`, `/assets/*` (web UI)

---

## Entry points

| Command | Purpose |
|---------|---------|
| `python run.py` | Start dev server + dashboard (default 0.0.0.0:3000) |
| `python run.py server --port P --host H` | Custom port/host |
| `python run.py db` | Database stats + integrity |
| `python run.py routes` | List all routes |
| `python run.py bot sweep EURUSD` | Strategy sweep |
| `python run.py bot scan EURUSD` | Pattern scan |
| `python app.py` | AI Studio entry point (0.0.0.0:3000) |
| `python cli.py` | Unified CLI shim |

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
| `run.py` | Root entry point, CLI |
| `app.py` | AI Studio entry point |
| `backend/core/config.py` | Centralized env config |
| `backend/core/composition.py` | Container factory |
| `backend/core/plugins.py` | Extension registration |
| `backend/core/server/handlers.py` | Core HTTP handlers |
| `backend/core/server/research.py` | Research API routes |
| `backend/core/server/validation.py` | Input validation |
| `backend/core/server/streaming.py` | SSE producers |
| `backend/core/frontconnect/views.py` | Dashboard rendering |
| `backend/gateway/cony/mt5_engine.py` | MT5 engine (35 functions) |
| `backend/gateway/cony/connection.py` | Connection lifecycle |
| `backend/gateway/cony/enums.py` | MT5 constant maps |
| `backend/gateway/deamon/__main__.py` | Daemon assembly + HTTP server |
| `backend/knowledgebase/indicators.py` | 25 indicators |
| `backend/knowledgebase/patterns.py` | 28 patterns |
| `backend/knowledgebase/strategies.py` | 11 entry rules + 13 templates |
| `backend/knowledgebase/api.py` | Research service |
| `backend/tools/bot/engine.py` | Backtest engine |
| `backend/tools/bot/patternchecker.py` | Pattern follow-through analysis |
| `backend/tools/bot/datafeed.py` | Market data fetcher |
| `backend/tools/bot/runner.py` | CLI sweep/scan orchestration |
| `backend/tools/bot/live.py` | Live order execution |
| `backend/database/store.py` | SQLite access layer |
| `backend/database/schema.py` | Schema definition |
| `backend/database/repositories.py` | Repository wrappers |

---

## Configuration

All environment variables (see `.env.example`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `CONY_HOST` | `0.0.0.0` | Bind address |
| `CONY_PORT` | `3000` | Bind port |
| `CONY_URL` | — | Override gateway URL |
| `CONY_MT5_PACKAGE` | auto | MT5 package directory |
| `MT5_LOGIN` / `MT5_PASSWORD` / `MT5_SERVER` | — | Account credentials |
| `MT5_PATH` | — | terminal64.exe path |
| `MT5_TIMEOUT` | `60000` | Connect timeout (ms) |
| `CONY_AUTO_CONNECT` | `true` | Attach on startup |
| `CONY_AUTO_RECONNECT` | `true` | Reattach on drop |
| `CONY_RECONNECT_INTERVAL` | `20` | Seconds between retries |
| `CONY_SYMBOL_CACHE_TTL` | `300` | Symbol cache TTL (seconds) |
| `CONY_LOG_LEVEL` | `INFO` | Log level |
| `CONY_LOG_FILE` | — | Also log to file |
| `CONY_FRONTEND_DIR` | `frontend/` | Web UI directory |
| `PERON_DB` / `CONY_DB_PATH` | `backend/database/data/peron.db` | Database path |
| `CONY_CORS_ORIGIN` | `*` | CORS origin |

---

## Design principles

1. **No external dependencies** — frontend is pure HTML/CSS/JS, no build step
2. **Layer separation** — `deamon → server → cony`, dependencies point one way
3. **No fake data** — all data comes from the real MT5 terminal
4. **Honest statistics** — verdicts based on t-statistics, not profit
5. **Case preservation** — MT5 symbol names used as-is
6. **Timezone awareness** — all times in broker time with published offset
7. **Knowledgebase purity** — no I/O, no database, no gateway imports
8. **Cony isolation** — no HTTP, no server, no JSON concerns
