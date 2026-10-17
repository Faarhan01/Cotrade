# Cotrade gateway

Direct MetaTrader 5 gateway: a Python daemon that attaches straight to the MT5
terminal through the official `MetaTrader5` package and exposes it over HTTP so
an AI agent can drive it — market data, account state, every order operation,
and live streaming.

```
AI agent / app  →  deamon (:8890)  →  server (routing)  →  mt5_pkg_bridge (engine)  →  MetaTrader5  →  MT5 terminal
```

No Node.js. One process. One port.

> For basic project facts (tech stack, database, API counts, architecture), see [`docs/context.md`](docs/context.md).

## Layers

Three sibling packages. Dependencies run one way only: `deamon → server → mt5_pkg_bridge`.

| Package             | Responsibility | Knows about |
|---------------------|----------------|-------------|
| `mt5_pkg_bridge/`   | MT5 engine — connection, symbols, data, trading, DOM | the MetaTrader5 package only |
| `server/`           | HTTP routing, validation, JSON shaping, SSE streams | mt5_pkg_bridge, HTTP |
| `deamon/`           | Process lifecycle — config, logging, sockets, startup | server, mt5_pkg_bridge |

Neither `mt5_pkg_bridge` nor `server` imports `deamon`, so any layer can be
replaced without touching the others:

- Swap `deamon/` for an MCP server, a WebSocket front end or a CLI — the bridge and server stay as they are.
- Swap `server/` for FastAPI — the bridge and deamon stay as they are.
- Import `mt5_pkg_bridge` from a script or notebook with no server running at all.

## Coverage

All public functions of the MetaTrader5 package are wrapped, verified by
`tools/audit_coverage.py`. All enum maps are exposed as named constants through
`GET /enums`, read from the installed package at runtime rather than hardcoded.

## Layout

```
gateway/
├── mt5_pkg_bridge/         engine — no HTTP, no server
│   ├── __init__.py
│   ├── connection.py        terminal lifecycle, locking, auto-reconnect
│   ├── mt5_engine.py        every MT5 operation
│   ├── marketbook.py        level-2 depth of market
│   ├── enums.py             constant maps, derived from the package
│   ├── paths.py             package discovery
│   └── serializers.py       namedtuple / numpy → JSON-safe dicts
├── server/                  HTTP layer
│   ├── __init__.py
│   ├── routes.py            URL router
│   ├── handlers.py          endpoints
│   ├── validation.py        input parsing
│   ├── streaming.py         SSE producers
│   ├── research.py          optional /research routes (needs knowledgebase)
│   ├── responses.py         RawResponse, for non-JSON replies
│   └── errors.py            HTTP status mapping
├── deamon/                  service entry point
│   ├── __init__.py
│   ├── __main__.py          gateway assembly, sockets, SSE transport
│   ├── config.py            environment configuration
│   └── logger.py            logging setup
├── tools/
│   ├── verify.py            endpoint and error-path checks
│   ├── lifecycle_test.py    real order: open, modify, close, clean up
│   ├── audit_coverage.py    package function coverage
│   ├── audit_hardcode.py    hardcoded path / port / constant scan
│   └── introspect_package.py  dump the package surface
├── docs/
│   └── api-reference.md     full endpoint reference
└── README.md
```

## Running

```powershell
cd <repo>\backend\gateway
python -m deamon
```

Serves on `http://127.0.0.1:8890` and attaches to the terminal on startup.

Point it at the package if it is not already importable:

```powershell
$env:CONY_MT5_PACKAGE = "<path to a directory containing MetaTrader5\"
```

`PERON_PACKAGE_PATH` is still accepted as a legacy alias for the same variable.

## Research API

`/research/*` adds strategy work on top of the market data: a catalogue of
every indicator, pattern and entry rule; strategy validation and storage;
pattern scanning; and backtesting with a train/test split.

It is an **optional extension**. `server/research.py` registers its routes
only when `knowledgebase` and `tools.bot` are importable from `backend/`, so a
standalone gateway is still a pure MetaTrader 5 gateway.

## Dashboard

`GET /` serves a control panel: account summary, open positions, working
orders, recent deals, and a live Market Watch watchlist.

It is an **optional extension**, registered the same way as the research API
and living in `backend/frontconnect/` rather than in `gateway/`.

## Start here

An agent should call these, in order:

```powershell
curl http://127.0.0.1:8890/health          # am I connected?
curl http://127.0.0.1:8890/routes          # what can I call?
curl http://127.0.0.1:8890/enums           # what values are legal?
curl http://127.0.0.1:8890/symbol/EURUSD   # how does this instrument work?
curl http://127.0.0.1:8890/research        # what can I build with this?
```

## Trading

```powershell
# Size a position from a risk budget
curl -X POST http://127.0.0.1:8890/calc/size -H "Content-Type: application/json" `
  -d '{"symbol":"EURUSD","risk_amount":50,"stop_pips":20}'

# Dry run first - places nothing, reports margin and any problem
curl -X POST http://127.0.0.1:8890/order/check -H "Content-Type: application/json" `
  -d '{"symbol":"EURUSD","volume":0.24,"order_type":"buy","sl":1.1150,"tp":1.1300}'

# Then place it
curl -X POST http://127.0.0.1:8890/buy -H "Content-Type: application/json" `
  -d '{"symbol":"EURUSD","volume":0.24,"sl":1.1150,"tp":1.1300,"magic":1001,"comment":"ai"}'

# Read, adjust, exit
curl http://127.0.0.1:8890/positions
curl -X POST http://127.0.0.1:8890/modify -H "Content-Type: application/json" -d '{"ticket":123,"sl":1.1180}'
curl -X POST http://127.0.0.1:8890/close  -H "Content-Type: application/json" -d '{"ticket":123}'
```

## Live data

Server-Sent Events — no dependency, no extra protocol. Send
`Accept: text/event-stream`.

| Stream | Emits |
|--------|-------|
| `/stream/ticks?symbols=EURUSD,GBPUSD&interval=1` | Ticks, only when a price moved |
| `/stream/marketbook?symbols=EURUSD&interval=1` | Depth of market |
| `/stream/portfolio?interval=2` | Account and open positions together |

## Errors

| Status | Meaning |
|--------|---------|
| `400` | Missing, malformed or out-of-range parameter |
| `404` | Unknown route, symbol, or ticket |
| `409` | Terminal or broker refused it; body carries `retcode` |
| `503` | Terminal not connected |
| `500` | Unexpected engine failure |

## Configuration

All environment variables. See `backend/docs/context.md` for the full list.

## Testing

With the daemon running:

```powershell
python tools\verify.py           # read-only and error-path checks
python tools\audit_coverage.py   # package function coverage
python tools\audit_hardcode.py   # no hardcoded paths, ports or constants
python tools\lifecycle_test.py   # places and closes one real order
```

## Requirements

Python 3.11 on Windows. The MetaTrader5 package ships a `cp311-win_amd64`
binary extension, so the interpreter version and platform must match. The MT5
terminal must be installed, logged in and running, with Algo Trading enabled.

`mt5_pkg_bridge` never invents data. With the terminal down, reads reconnect or fail
rather than returning placeholders.
