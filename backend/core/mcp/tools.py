"""
MCP Tools
=========

Tool catalogue for the MCP surface. Every handler is a thin wrapper over an
object that already exists elsewhere in the system:

* `engine`   — the MT5 engine (`mt5_pkg_bridge.MT5Engine`): market data, account,
               positions, orders, execution.
* `container` — `core.application.container.AppContainer`: backtest, pattern
               scan, validation and sizing services, each of which already
               wraps the same `Research` object the CLI uses.

Nothing here imports HTTP, JSON-RPC or the daemon. The protocol layer lives in
`server.py`; this module only describes *what* an agent can do.

The CLI in `gateway/cli` is the terminal-facing sibling of this module. Where a
CLI command exists (`sweep`, `scan`, `list`, `report`, `db`, `routes`) the MCP
tool calls the same underlying service and returns JSON instead of a printed
table, so the two surfaces cannot drift apart.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional


# ── schema helpers ───────────────────────────────────────────────────────────

def _obj(props: Dict[str, Any], required: Optional[List[str]] = None) -> Dict[str, Any]:
    return {"type": "object", "properties": props, "required": required or []}


def _str(desc: str) -> Dict[str, Any]:
    return {"type": "string", "description": desc}


def _num(desc: str) -> Dict[str, Any]:
    return {"type": "number", "description": desc}


def _int(desc: str, default: Optional[int] = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {"type": "integer", "description": desc}
    if default is not None:
        out["default"] = default
    return out


def _bool(desc: str, default: Optional[bool] = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {"type": "boolean", "description": desc}
    if default is not None:
        out["default"] = default
    return out


def _arr(desc: str, items: Dict[str, Any]) -> Dict[str, Any]:
    return {"type": "array", "description": desc, "items": items}


# ── research / CLI-parity helpers ────────────────────────────────────────────

def _research(container) -> Any:
    """
    The `Research` object, reached through any service that holds one.

    The services keep theirs in `_research`, so probe the private name first.
    Probing only `research` missed every service, which silently fell through
    to the fallback below and built a `Research` with no store: strategies read
    back as an empty list and backtests stopped persisting their reports,
    with nothing in the response to say why.

    The store also has to reach this instance, so the fallback passes one
    rather than leaving every result unrecorded.
    """
    for service in (getattr(container, "backtest", None),
                     getattr(container, "pattern_scan", None),
                     getattr(container, "validation", None)):
        for attr in ("_research", "research"):
            found = getattr(service, attr, None)
            if found is not None:
                return found

    from managers.api_manager.api import Research
    try:
        from database.store import Store
        store = Store(getattr(getattr(container, "config", None), "db_path", None))
    except Exception:  # noqa: BLE001 - research still works, just does not persist
        store = None
    from tools.bot import datafeed

    return Research(fetch=datafeed.bars, store=store)


def _store(container) -> Any:
    from database.store import Store
    return Store(getattr(getattr(container, "config", None), "db_path", None))


def _library_specs(container) -> List[Dict]:
    """Starter strategy definitions, keyed by name, for sweep/backtest."""
    specs: Dict[str, Dict] = {}
    try:
        for item in _research(container).library() or []:
            if isinstance(item, dict) and item.get("name"):
                specs[item["name"]] = item
    except Exception:
        pass
    try:
        for row in _store(container).list_strategies():
            name = row.get("name") if isinstance(row, dict) else None
            if name and name not in specs:
                specs[name] = {
                    "name": name,
                    "timeframe": row.get("timeframe") or "M1",
                    "entry_name": row.get("entry_name"),
                    "entry_params": row.get("entry_params"),
                    "exit_rule": row.get("exit_rule"),
                    "sizing": row.get("sizing"),
                }
    except Exception:
        pass
    return list(specs.values())


def _decode(value: Any) -> Any:
    """Stored JSON columns come back as strings; parse them when possible."""
    if isinstance(value, str):
        stripped = value.strip()
        if stripped[:1] in ("{", "["):
            import json
            try:
                return json.loads(stripped)
            except Exception:
                return value
    return value


def _as_spec(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise a strategy spec supplied by an agent."""
    spec = dict(raw or {})
    for key in ("entry_params", "exit_rule", "sizing", "tags"):
        if key in spec:
            spec[key] = _decode(spec[key])
    spec.setdefault("timeframe", "M1")
    return spec


# ── tool catalogue ───────────────────────────────────────────────────────────

def build_tools(engine, container, runtime=None) -> Dict[str, Dict[str, Any]]:
    """Return ``{name: {name, description, inputSchema, handler}}``."""

    tools: Dict[str, Dict[str, Any]] = {}

    def _runtime():
        """The shared bot runtime. Built lazily so tools work without one."""
        nonlocal runtime
        if runtime is None:
            from core.bot_runtime import BotRuntime
            runtime = BotRuntime(engine, container=container)
        return runtime

    def add(name: str, description: str, schema: Dict[str, Any],
            handler: Callable[..., Any]) -> None:
        tools[name] = {
            "name": name,
            "description": description,
            "inputSchema": schema,
            "handler": handler,
        }

    # ── diagnostics ─────────────────────────────────────────────────────────
    add("get_health", "Gateway status, MT5 connection and package version.",
        _obj({}),
        lambda: {
            "status": "ok",
            "mt5_connected": bool(getattr(engine, "is_connected", False)),
            "package_version": _safe(engine.package_version),
            "connection": _safe(engine.connection_info),
            "clock_offset": _safe(engine.clock_offset),
        })

    add("list_routes", "Every registered route with method and pattern.",
        _obj({}),
        lambda: {"routes": getattr(getattr(engine, "_router", None), "list_routes", lambda: [])()
                 or _routes_from_container(container)})

    add("get_enums", "Name-to-integer maps the gateway accepts, plus return codes.",
        _obj({}),
        lambda: _safe(_enums_all))

    # ── account / portfolio ─────────────────────────────────────────────────
    add("get_account", "Live account: balance, equity, margin, leverage, currency.",
        _obj({}),
        lambda: _safe(engine.get_account_info))

    add("get_terminal", "MetaTrader 5 terminal build, path and trading permissions.",
        _obj({}),
        lambda: _safe(engine.get_terminal_info))

    add("get_totals", "Counts of symbols, positions and pending orders.",
        _obj({}),
        lambda: _safe(engine.get_totals))

    add("get_portfolio", "Account figures plus open positions and exposure, in one call.",
        _obj({}),
        lambda: _portfolio(engine))

    # ── positions / orders ──────────────────────────────────────────────────
    add("get_positions", "Open positions, optionally filtered by symbol or magic.",
        _obj({
            "symbol": _str("Filter by exact MT5 symbol name."),
            "magic": _int("Filter by magic number."),
        }),
        lambda symbol=None, magic=None: {
            "positions": _safe(engine.get_positions, symbol=symbol, magic=magic)
        })

    add("get_position", "One open position by ticket.",
        _obj({"ticket": _int("Position ticket.")}, ["ticket"]),
        lambda ticket: _safe(engine.get_position, ticket))

    add("get_orders", "Pending working orders.",
        _obj({"symbol": _str("Filter by symbol."), "magic": _int("Filter by magic.")}),
        lambda symbol=None, magic=None: {"orders": _safe(engine.get_orders, symbol=symbol, magic=magic)})

    # ── market data ─────────────────────────────────────────────────────────
    add("get_symbols", "Instruments from the broker. Large by default; filter it.",
        _obj({
            "query": _str("Optional substring filter on name or description."),
            "visible": _bool("Only Market Watch instruments."),
            "limit": _int("Maximum symbols to return.", 50),
        }),
        lambda query=None, visible=None, limit=50: _symbols(engine, query, visible, limit))

    add("get_symbol_info", "Full specification and derived values for one instrument.",
        _obj({"symbol": _str("Exact MT5 symbol name.")}, ["symbol"]),
        lambda symbol: _safe(engine.get_symbol_info, symbol))

    add("get_tick", "Latest bid/ask for one instrument.",
        _obj({"symbol": _str("Exact MT5 symbol name.")}, ["symbol"]),
        lambda symbol: _safe(engine.get_tick, symbol))

    add("get_candles", "OHLC bars for an instrument.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "timeframe": _str("M1, M5, M15, M30, H1, H4, D1..."),
            "count": _int("Number of bars, newest last."),
        }, ["symbol"]),
        lambda symbol, timeframe="M1", count=400: _candles(engine, symbol, timeframe, count))

    # ── execution ───────────────────────────────────────────────────────────
    add("buy", "Market buy.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "volume": _num("Volume in lots."),
            "sl": _num("Stop loss, optional."),
            "tp": _num("Take profit, optional."),
            "comment": _str("Order comment."),
            "magic": _int("Magic number."),
        }, ["symbol", "volume"]),
        lambda symbol, volume, sl=None, tp=None, comment="", magic=0:
            _safe(engine.buy, symbol=symbol, volume=volume, sl=sl, tp=tp,
                  comment=comment, magic=magic))

    add("sell", "Market sell.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "volume": _num("Volume in lots."),
            "sl": _num("Stop loss, optional."),
            "tp": _num("Take profit, optional."),
            "comment": _str("Order comment."),
            "magic": _int("Magic number."),
        }, ["symbol", "volume"]),
        lambda symbol, volume, sl=None, tp=None, comment="", magic=0:
            _safe(engine.sell, symbol=symbol, volume=volume, sl=sl, tp=tp,
                  comment=comment, magic=magic))

    add("close_position", "Close one position, fully or partially.",
        _obj({
            "ticket": _int("Position ticket."),
            "volume": _num("Partial close volume, optional."),
        }, ["ticket"]),
        lambda ticket, volume=None: _safe(engine.close_position, ticket=ticket, volume=volume))

    add("close_all", "Close every open position, optionally filtered by symbol.",
        _obj({"symbol": _str("Limit to one symbol."), "magic": _int("Limit to one magic.")}),
        lambda symbol=None, magic=0: _safe(engine.close_all, symbol=symbol, magic=magic))

    add("modify_position", "Change stop loss or take profit on an open position.",
        _obj({
            "ticket": _int("Position ticket."),
            "sl": _num("New stop loss."),
            "tp": _num("New take profit."),
        }, ["ticket"]),
        lambda ticket, sl=None, tp=None: _safe(engine.modify_position, ticket=ticket, sl=sl, tp=tp))

    add("cancel_order", "Cancel a pending order by ticket.",
        _obj({"ticket": _int("Order ticket.")}, ["ticket"]),
        lambda ticket: _safe(engine.cancel_order, ticket=ticket))

    add("check_order", "Dry run: what the terminal would do and the margin needed.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "volume": _num("Volume in lots."),
            "order_type": _str("buy, sell, buy_limit, sell_limit, buy_stop, sell_stop..."),
        }, ["symbol", "volume"]),
        lambda symbol, volume, order_type="buy":
            _safe(engine.check_order, {
                "symbol": symbol, "volume": volume,
                "type": _order_type_code(order_type),
            }))

    # ── calculators ─────────────────────────────────────────────────────────
    add("calc_margin", "Margin required for a hypothetical position.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "volume": _num("Volume in lots."),
            "order_type": _str("buy or sell."),
        }, ["symbol", "volume"]),
        lambda symbol, volume, order_type="buy":
            _safe(_calc_margin, engine, symbol, volume, order_type))

    add("calc_profit", "Profit or loss for a price move.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "volume": _num("Volume in lots."),
            "open_price": _num("Entry price."),
            "close_price": _num("Exit price."),
            "order_type": _str("buy or sell."),
        }, ["symbol", "volume", "open_price", "close_price"]),
        lambda symbol, volume, open_price, close_price, order_type="buy":
            _safe(engine.calc_profit, symbol, volume, _order_type_code(order_type),
                  open_price, close_price))

    add("calc_size", "Risk-based lot size from a stop distance and amount at risk.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "risk_amount": _num("Amount to risk in account currency."),
            "stop_pips": _num("Stop distance in pips."),
        }, ["symbol", "risk_amount", "stop_pips"]),
        lambda symbol, risk_amount, stop_pips:
            _safe(_risk_size, container, engine, symbol, risk_amount, stop_pips))

    # ── history ─────────────────────────────────────────────────────────────
    add("get_history_deals", "Closed deals over a window.",
        _obj({
            "days": _int("Look back this many days.", 7),
            "symbol": _str("Limit to one symbol."),
        }),
        lambda days=7, symbol=None: _deals(engine, days, symbol))

    add("get_history_summary", "Realised profit, commission, swap and net over a window.",
        _obj({"days": _int("Look back this many days.", 7)}),
        lambda days=7: _safe(_history_summary, engine, days))

    # ── research (same services the CLI uses) ────────────────────────────────
    add("list_knowledgebase", "Indicators, patterns, entry rules and strategy templates.",
        _obj({}),
        lambda: _safe(lambda: _research(container).catalogue()))

    add("list_strategies", "Stored strategy definitions.",
        _obj({}),
        lambda: {"strategies": _safe(lambda: _research(container).list_strategies())})

    add("get_strategy", "One stored strategy by name.",
        _obj({"name": _str("Strategy name.")}, ["name"]),
        lambda name: _safe(lambda: _research(container).get_strategy(name)))

    add("validate_strategy", "Check a strategy definition before running it.",
        _obj({"strategy": {"type": "object", "description": "Strategy definition."}}, ["strategy"]),
        lambda strategy: _safe(lambda: _research(container).validate_strategy(_as_spec(strategy))))

    add("backtest", "Backtest one strategy definition over historical bars.",
        _obj({
            "strategy": {"type": "object", "description": "Strategy definition."},
            "symbol": _str("Exact MT5 symbol name."),
            "timeframe": _str("Bar timeframe."),
            "bars": _int("Bars to test."),
        }, ["symbol"]),
        lambda symbol, strategy=None, timeframe="M1", bars=2000:
            _safe(lambda: _research(container).backtest(
                _as_spec(strategy or {}), symbol, timeframe=timeframe, count=bars)))

    add("sweep", "Backtest several strategies over one instrument and rank them.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "timeframe": _str("Bar timeframe."),
            "bars": _int("Bars per strategy."),
            "strategies": _arr("Strategy definitions. Empty means every library template.",
                               {"type": "object"}),
        }, ["symbol"]),
        lambda symbol, timeframe="M1", bars=2000, strategies=None:
            _safe(lambda: _research(container).sweep(
                [_as_spec(s) for s in strategies] if strategies else _library_specs(container),
                symbol, timeframe=timeframe, count=bars)))

    add("scan_patterns", "Scan an instrument for known chart patterns and measure follow-through.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "timeframe": _str("Bar timeframe."),
            "bars": _int("Bars to scan."),
        }, ["symbol"]),
        lambda symbol, timeframe="M1", bars=3000:
            _safe(lambda: _research(container).pattern_scan(symbol, timeframe=timeframe, count=bars)))

    add("indicator", "Evaluate one indicator over historical bars.",
        _obj({
            "symbol": _str("Exact MT5 symbol name."),
            "name": _str("Indicator name, e.g. rsi, macd, atr, bollinger."),
            "timeframe": _str("Bar timeframe."),
            "bars": _int("Bars to load."),
        }, ["symbol", "name"]),
        lambda symbol, name, timeframe="M1", bars=1000:
            _safe(lambda: _research(container).indicator(symbol, name, timeframe=timeframe, count=bars)))

    # ── database / bot ──────────────────────────────────────────────────────
    add("db_stats", "Row counts and database path.",
        _obj({}),
        lambda: _safe(lambda: _store(container).stats()))

    add("db_reports", "Stored backtest reports, newest first.",
        _obj({
            "limit": _int("Maximum reports.", 25),
            "strategy": _str("Filter by strategy name."),
            "verdict": _str("Filter by verdict."),
        }),
        lambda limit=25, strategy=None, verdict=None:
            _safe(lambda: {"reports": _store(container).reports(strategy=strategy, verdict=verdict, limit=limit)}))

    add("db_integrity", "Integrity check result and database path.",
        _obj({}),
        lambda: _safe(lambda: {"status": _store(container).check_integrity(),
                               "path": _store(container).path}))

    add("bot_status", "Bot engine status, MT5 connectivity and live sessions.",
        _obj({}),
        lambda: _safe(_runtime().status))

    add("bot_sessions", "Stored bot sessions.",
        _obj({"limit": _int("Maximum sessions.", 50)}),
        lambda limit=50: _safe(lambda: {"sessions": _store(container).list_bot_sessions(limit=limit)}))

    # ── bot control (runtime-backed) ───────────────────────────────────────
    add("bot_signal",
        "Evaluate a strategy against live bars without trading. Safe to call "
        "first: returns buy/sell/flat for the current bar.",
        _obj({
            "strategy": _str("Strategy name from list_strategies."),
            "symbol": _str("Exact MT5 symbol name."),
            "timeframe": _str("Bar timeframe."),
            "bars": _int("Bars to evaluate over."),
        }, ["strategy", "symbol"]),
        lambda strategy, symbol, timeframe="M1", bars=500:
            _safe(_runtime().signal_for, strategy, symbol, timeframe, bars))

    add("bot_start",
        "Start a live bot session that evaluates a strategy on each step. "
        "dry_run defaults to true; pass dry_run=false to place real orders.",
        _obj({
            "strategy": _str("Strategy name."),
            "symbol": _str("Exact MT5 symbol name."),
            "timeframe": _str("Bar timeframe."),
            "magic": _int("Magic number to tag orders with."),
            "dry_run": _bool("True = log signals only. False = place orders.", True),
            "risk_amount": _num("Risk budget in account currency, for sizing."),
            "stop_pips": _num("Stop distance in pips, for sizing."),
        }, ["strategy", "symbol"]),
        lambda strategy, symbol, timeframe="M1", magic=0, dry_run=True,
                risk_amount=None, stop_pips=None:
            _safe(_runtime().start, strategy, symbol, timeframe, magic, dry_run,
                  None, risk_amount, stop_pips))

    add("bot_step",
        "Advance a running bot session by one bar.",
        _obj({
            "session_id": _str("Session from bot_start."),
            "bars": _int("Bars to evaluate over."),
        }, ["session_id"]),
        lambda session_id, bars=500:
            _safe(_runtime().step, session_id, bars))

    add("bot_step_all", "Advance every running bot session by one bar.",
        _obj({"bars": _int("Bars to evaluate over.", 500)}),
        lambda bars=500: _safe(lambda: _runtime().step_all(bars)))

    add("bot_stop", "Stop a running bot session.",
        _obj({
            "session_id": _str("Session to stop."),
            "trades_count": _int("Final trade count."),
            "pnl_pips": _num("Final P/L in pips."),
        }, ["session_id"]),
        lambda session_id, trades_count=0, pnl_pips=0.0:
            _safe(_runtime().stop, session_id, trades_count, pnl_pips))

    add("bot_running", "Bot sessions currently held by the runtime.",
        _obj({}),
        lambda: _safe(lambda: {"sessions": _runtime().running()}))

    add("bot_logs", "Execution log for a bot session.",
        _obj({
            "session_id": _str("Session to read."),
            "limit": _int("Maximum log rows.", 50),
        }, ["session_id"]),
        lambda session_id, limit=50:
            _safe(lambda: {"logs": _store(container).list_bot_logs(session_id=session_id, limit=limit)}))

    return tools


# ── internal helpers ─────────────────────────────────────────────────────────

def _safe(fn: Callable[..., Any], *args, **kwargs) -> Any:
    """Call something that may raise; return a structured error instead."""
    try:
        return fn(*args, **kwargs)
    except Exception as exc:  # noqa: BLE001 - the protocol layer reports this
        return {"error": str(exc), "type": type(exc).__name__}


def _routes_from_container(container) -> List[Dict[str, Any]]:
    router = getattr(container, "router", None)
    if router is not None and hasattr(router, "list_routes"):
        return router.list_routes()
    return []


def _enums_all() -> Dict[str, Any]:
    from mt5_pkg_bridge import enums
    return {
        "enums": enums.all_enums(),
        "retcodes": enums.retcode_glossary(),
    }


def _order_type_code(name: str) -> int:
    """Map a name like `buy_limit` to its MT5 integer code."""
    from mt5_pkg_bridge import enums
    key = str(name).lower()
    codes = getattr(enums, "ORDER_TYPES", {})
    if key in codes:
        return codes[key]
    raise ValueError(
        f"Unknown order_type {name!r}. Valid: {', '.join(sorted(codes))}")


def _timeframe_code(name: str) -> int:
    """
    Map a name like `M15` or `H1` to its MT5 integer code.

    `enums.TIMEFRAME_NAMES` is code -> name, so the lookup is inverted here
    rather than at each call site. Passing the raw name through instead would
    reach `copy_rates` as a string and fail deep inside the terminal call.
    """
    from mt5_pkg_bridge import enums
    key = str(name).upper()
    for code, label in getattr(enums, "TIMEFRAME_NAMES", {}).items():
        if str(label).upper() == key:
            return code
    raise ValueError(
        "Unknown timeframe %r. Valid: %s"
        % (name, ", ".join(str(v) for v in enums.TIMEFRAME_NAMES.values())))


def _portfolio(engine) -> Dict[str, Any]:
    account = _safe(engine.get_account_info) or {}
    positions = _safe(engine.get_positions) or []
    return {
        "account": {k: account.get(k) for k in
                    ("balance", "equity", "margin", "margin_free", "margin_level",
                     "currency", "leverage")},
        "summary": {
            "position_count": len(positions),
            "total_volume": round(sum(float(p.get("volume", 0) or 0) for p in positions), 8),
            "floating_profit": round(sum(float(p.get("profit", 0) or 0) for p in positions), 2),
        },
        "positions": positions,
    }


def _symbols(engine, query, visible, limit) -> Dict[str, Any]:
    rows = _safe(engine.get_symbols) or []
    if visible is not None:
        rows = [r for r in rows if bool(r.get("visible")) is bool(visible)]
    if query:
        needle = str(query).casefold()
        rows = [r for r in rows
                if needle in str(r.get("name", "")).casefold()
                or needle in str(r.get("description", "")).casefold()]
    trimmed = [
        {k: r.get(k) for k in
         ("name", "description", "bid", "ask", "spread", "digits", "point",
          "trade_tick_size", "trade_contract_size", "volume_min", "volume_max",
          "swap_long", "swap_short", "session_open", "_trade_mode")}
        for r in rows[: max(1, int(limit or 50))]
    ]
    return {"count": len(trimmed), "symbols": trimmed}


def _calc_margin(engine, symbol, volume, order_type) -> Dict[str, Any]:
    """Margin for a hypothetical position, using the live quote for a price."""
    code = _order_type_code(order_type or "buy")
    tick = _safe(engine.get_tick, symbol) or {}
    price = tick.get("ask") if code == 0 else tick.get("bid")
    if price is None:
        raise ValueError(f"no live tick for {symbol}")
    return {
        "symbol": symbol,
        "volume": float(volume),
        "price": price,
        "margin": _safe(engine.calc_margin, symbol, float(volume), code, price),
    }


def _candles(engine, symbol, timeframe, count) -> Dict[str, Any]:
    tf = _timeframe_code(timeframe or "M1")
    bars = _safe(engine.copy_rates, symbol, tf, int(count or 400)) or []
    if isinstance(bars, dict) and bars.get("error"):
        return {"symbol": symbol, "timeframe": timeframe, "count": 0,
                "candles": [], "error": bars["error"]}
    return {"symbol": symbol, "timeframe": timeframe, "count": len(bars), "candles": bars}


def _deals(engine, days, symbol) -> Dict[str, Any]:
    from datetime import datetime, timedelta, timezone
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=int(days or 7))
    deals = _safe(engine.get_history_deals, start, end, symbol) or []
    deals = sorted(deals, key=lambda d: d.get("time_msc") or d.get("time") or 0, reverse=True)
    return {"count": len(deals), "deals": deals}


def _history_summary(engine, days: int) -> Dict[str, Any]:
    """
    Aggregate closed deals into the same figures the REST `/history/summary`
    reports, so an agent reading either surface sees one number, not two.
    """
    from datetime import datetime, timedelta, timezone
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=int(days or 7))
    deals = _safe(engine.get_history_deals, start, end) or []
    if isinstance(deals, dict) and deals.get("error"):
        return {"days": days, "deal_count": 0, "realized_profit": 0,
                "commission": 0, "swap": 0, "net": 0, "error": deals["error"]}
    realized = round(sum(float(d.get("profit", 0) or 0) for d in deals), 2)
    commission = round(sum(float(d.get("commission", 0) or 0) for d in deals), 2)
    swaps = round(sum(float(d.get("swap", 0) or 0) for d in deals), 2)
    by_side: Dict[str, float] = {}
    for deal in deals:
        side = str(deal.get("_type") or ("buy" if deal.get("type") == 0 else "sell"))
        by_side[side] = round(by_side.get(side, 0.0) + float(deal.get("profit", 0) or 0), 2)
    return {
        "days": days,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "deal_count": len(deals),
        "realized_profit": realized,
        "commission": commission,
        "swap": swaps,
        "net": round(realized + swaps, 2),
        "by_side": by_side,
    }


def _risk_size(container, engine, symbol, risk_amount, stop_pips) -> Dict[str, Any]:
    """
    Risk-based lot size, mirroring the REST `/calc/size` contract.

    Two details matter and are easy to get wrong:

    * `pip_value_per_lot` is derived per instrument. Without it the honest
      answer is that this symbol cannot be sized from a pip distance.
    * The lot count is rounded *down* to the symbol's lot step so sizing never
      exceeds the stated risk.
    """
    info = engine.get_symbol_info(symbol) or {}
    derived = (info.get("_derived") or {})
    pip_value = derived.get("pip_value_per_lot")
    if not pip_value:
        raise ValueError(
            f"{symbol} has no published pip value, so risk cannot be converted "
            "to lots. Use calc_profit with a known pip distance instead.")

    lot_info = derived.get("lot_info") or {}
    step = lot_info.get("lot_step") or 0.01
    minimum = lot_info.get("min_lot") or 0.01
    maximum = lot_info.get("max_lot")

    raw = float(risk_amount) / (float(stop_pips) * float(pip_value))
    epsilon = 1e-9
    lots = int((raw / step + epsilon)) * step
    lots = max(minimum, min(lots, maximum if maximum else lots))

    return {
        "symbol": symbol,
        "risk_amount": float(risk_amount),
        "stop_pips": float(stop_pips),
        "pip_value_per_lot": pip_value,
        "raw_lots": round(raw, 8),
        "lots": round(lots, 8),
        "lot_step": step,
        "within_limits": bool(minimum <= lots <= maximum) if maximum else True,
        "actual_risk": round(lots * float(stop_pips) * float(pip_value), 2),
    }