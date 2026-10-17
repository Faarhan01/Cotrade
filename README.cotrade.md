# cotrade

A MetaTrader 5 gateway and web control panel. Python drives the terminal
through the official `MetaTrader5` package and exposes it three ways: a JSON
API for agents, a research API for strategy work, and a browser dashboard for
people.

Everything is local. The gateway binds `127.0.0.1` only.

> For basic project facts (tech stack, database, API counts, architecture), see [`backend/docs/context.md`](backend/docs/context.md).

---

## Requirements

| | |
|---|---|
| **Python** | **3.11, specifically.** The `MetaTrader5` package ships `_core.cp311-win_amd64.pyd` — a compiled extension bound to CPython 3.11's ABI. It will not import on 3.10 or 3.12. |
| **MetaTrader 5** | Installed, and **logged in**. The gateway attaches to the running terminal; it does not launch it. |
| **Dependencies** | `numpy` only, which the `MetaTrader5` package pulls in itself. |

### Install

```powershell
pip install MetaTrader5 numpy
```

If the package is **not** importable — a private copy, or a virtualenv that
cannot see it — point the gateway at the directory that contains a
`MetaTrader5\` folder:

```powershell
$env:CONY_MT5_PACKAGE = "C:\path\to\metatrader5_package"
```

`PERON_PACKAGE_PATH` is still honoured as a legacy alias.

---

## Setup

There is nothing to build and nothing to compile. Clone, install, run.

```powershell
pip install MetaTrader5 numpy

# start MetaTrader 5 and log in first

# Run directly from repository root:
python run.py
```

Then open **http://localhost:3000/**.

Or specify a custom port:
```powershell
python run.py server --port 8890
```

---

## The site

| URL | What it is |
|---|---|
| <http://127.0.0.1:8890/> | Account overview — balance, equity, positions, orders, deals, live Market Watch |
| <http://127.0.0.1:8890/ui/symbols> | Instrument browser with full derived spec |
| <http://127.0.0.1:8890/ui/research> | Pattern scans, strategy validation, backtests |
| <http://127.0.0.1:8890/ui/history> | Account history, filters, realised/net P/L |
| <http://127.0.0.1:8890/ui/bot> | Stored strategies, reports, database tools |

Plain HTML, CSS and JavaScript. No npm, no build step, no CDN, no web fonts —
it renders with no internet access, which is the normal condition for a trading
desk.

Prices update over SSE (`/stream/portfolio`, `/stream/ticks`), not polling, so
a quiet account costs nothing.

`frontend/` is entirely static. Edit a page, partial, stylesheet or script and
reload the browser — no restart. Only `backend/dashboard/*.py` needs the daemon
restarted.

---

## Layout

```
cotrade/
├── backend/
│   ├── gateway/          the MT5 bridge and HTTP server
│   │   ├── mt5_pkg_bridge/  engine — no HTTP, no server
│   │   ├── server/       HTTP layer
│   │   └── deamon/       entry point, sockets, SSE transport
│   ├── core/             application layer (config, composition, plugins)
│   ├── frontconnect/     serves the web UI; the only Python the frontend needs
│   ├── knowledgebase/    indicators, patterns, strategies — pure logic, no I/O
│   ├── database/         SQLite store
│   ├── tools/bot/        backtesting, pattern checking, CLI
│   ├── data/             peron.db
│   └── docs/             strategy findings
└── frontend/
    ├── pages/            one .html per screen
    ├── partials/         shared header, footer, head
    └── assets/           css/ and js/, split into shared lib and per-page
```

The gateway is three layers with dependencies pointing one way only:
`deamon → server → mt5_pkg_bridge`. The engine never knows HTTP exists.

`backend/frontconnect/` and `backend/knowledgebase/` are **optional extensions**.
They register their routes on startup and log a warning if they cannot load;
a stripped-down gateway still serves the full JSON API.

---

## Verifying an install

```powershell
cd backend\gateway
python tools\verify.py          # endpoint and error-path checks
python tools\audit_coverage.py  # MetaTrader5 package coverage
python tools\audit_hardcode.py  # no baked-in paths, ports or constants
```

`verify.py` needs the daemon running and MetaTrader 5 connected. It checks
error paths, not just happy ones: unknown symbols return 404 rather than 500,
window sizes are bounded, position sizing does not lose a step to float error,
and static-asset traversal attempts are refused.

---

## Configuration

All optional. Every one has a working default. See `backend/docs/context.md`
for the full environment variable reference.

---

## Using the API

Start here:

```powershell
curl http://127.0.0.1:8890/health     # connected?
curl http://127.0.0.1:8890/routes     # what can I call?
curl http://127.0.0.1:8890/enums      # what values are legal?
curl http://127.0.0.1:8890/symbol/EURUSD   # how does this instrument work?
curl http://127.0.0.1:8890/research   # what can I build with this?
```

`/symbol/{symbol}` returns the broker's spec plus a `_derived` block carrying
pip size, lot rules, minimum stop distance, supported filling modes and the
account-currency value of one pip — everything needed to size a position and
place valid stops without knowing MetaTrader 5 internals.

**Symbols must use MT5's exact spelling.** Case is not normalised. `EURUSD`
works; `eurusd` does not. Look the spelling up rather than guessing it.

Full reference: [`backend/gateway/docs/api-reference.md`](backend/gateway/docs/api-reference.md).
Gateway internals: [`backend/gateway/README.md`](backend/gateway/README.md).
Frontend conventions: [`frontend/README.md`](frontend/README.md).

---

## Research and strategies

`/research/*` adds strategy work on top of the market data: a catalogue of
every indicator, pattern and entry rule; strategy validation and storage;
pattern scanning; and backtesting with a train/test split.

An agent should read `/research/catalogue` before composing a strategy so it
builds from documented names rather than guessing.

### Reading a verdict

`verdict` is the only field that decides whether anything is worth doing:

| verdict | meaning |
|---|---|
| `noise` | indistinguishable from chance — **do not trade this** |
| `fragile` | significant but net negative, or significant only because gross beat costs |
| `promising` / `strong` | significant and profitable after costs — still replicate before trusting |

Always check `split_check.consistent`. A rule that made its money in the first
half of the sample is not a rule.

---

## Live trading

The gateway can place real orders. Nothing will send one unless you ask
explicitly.

```powershell
# always check first
curl -X POST http://127.0.0.1:8890/order/check -d '{"symbol":"EURUSD","volume":0.1,"order_type":"buy"}'

# then place it
curl -X POST http://127.0.0.1:8890/buy -d '{"symbol":"EURUSD","volume":0.1,"magic":1234}'
```

`tools/bot/live.py` defaults to `dry_run=True` and refuses to send without
`dry_run=False`.

What does **not** exist yet: a continuous trading loop. There is no EA-style
event loop, no position state machine, and no trailing-stop management on live
positions — `engine.py` implements those for backtests only. Live trading today
means one explicitly requested order at a time.

---

## Limits worth knowing

The gateway bounds anything that could return an unbounded response, and says
so in the payload when it truncates — but a truncated history is easy to
misread as complete data:

- **History is capped at 365 days and 20,000 rows.** A wider request is
  silently narrowed and the response says `capped`.
- **Candle and tick windows are bounded** for the same reason.
- **MetaTrader 5's own retention applies on top of this.** Ticks are roughly
  24 hours, M1 candles 90–180 days, H1 around 26 months.
- **The gateway binds one terminal.** `MetaTrader5` attaches to a single
  running terminal, so only one daemon process can hold it at a time.

---

## Known gaps

Worth knowing before relying on any of this:

- **The database is still named `peron.db`** and `PERON_PACKAGE_PATH` is still
  accepted as an alias. Both predate the rename to cotrade.
- **No CI.** `verify.py` is run by hand.
- **The gateway has not been load-tested.** It is threaded, and SSE clients hold
  threads for their lifetime; that is bounded but not proven under many
  concurrent clients.
