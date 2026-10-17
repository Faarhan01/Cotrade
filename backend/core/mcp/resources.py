"""
MCP Resources
=============

Read-only views an agent can fetch without invoking a tool: account state,
the broker's instrument list, and the gateway's own route catalogue.

Resources are addressed by URI, so an agent can hold a stable reference and
re-read it rather than remembering a tool call.

    cotrade://account
    cotrade://portfolio
    cotrade://symbols
    cotrade://positions
    cotrade://routes
    cotrade://health

Each entry is `{uri, name, description, mimeType, read}` where `read()` returns
plain JSON-serialisable data.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional


def build_resources(engine, container, base: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    resources: Dict[str, Dict[str, Any]] = {}

    def add(uri: str, name: str, description: str, read: Callable[[], Any]) -> None:
        resources[uri] = {
            "uri": uri,
            "name": name,
            "description": description,
            "mimeType": "application/json",
            "read": read,
        }

    def _safe(fn: Callable[..., Any], *args, **kwargs) -> Any:
        try:
            return fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc), "type": type(exc).__name__}

    add("cotrade://health",
        "Health",
        "Gateway status, MT5 connection, package version and broker clock offset.",
        lambda: {
            "status": "ok",
            "mt5_connected": bool(getattr(engine, "is_connected", False)),
            "package_version": _safe(engine.package_version),
            "connection": _safe(engine.connection_info),
            "clock_offset": _safe(engine.clock_offset),
            "base_url": base,
        })

    add("cotrade://account",
        "Account",
        "Live account figures as MetaTrader 5 reports them.",
        lambda: _safe(engine.get_account_info))

    add("cotrade://terminal",
        "Terminal",
        "MetaTrader 5 terminal build, path and trading permissions.",
        lambda: _safe(engine.get_terminal_info))

    add("cotrade://portfolio",
        "Portfolio",
        "Account figures plus open positions and exposure in one document.",
        lambda: _portfolio(engine))

    add("cotrade://positions",
        "Positions",
        "Every open position with live P/L.",
        lambda: {"positions": _safe(engine.get_positions) or []})

    add("cotrade://symbols",
        "Symbols",
        "Broker instrument list, trimmed to display-relevant fields.",
        lambda: _symbols(engine))

    add("cotrade://routes",
        "Routes",
        "Every route the gateway serves, so an agent can discover the REST surface.",
        lambda: {"routes": _routes(container), "base_url": base})

    return resources


def _portfolio(engine) -> Dict[str, Any]:
    account = {}
    try:
        account = engine.get_account_info() or {}
    except Exception as exc:  # noqa: BLE001
        account = {"error": str(exc)}
    try:
        positions = engine.get_positions() or []
    except Exception:
        positions = []
    return {
        "account": {k: account.get(k) for k in
                    ("balance", "equity", "margin", "margin_free", "margin_level",
                     "currency", "leverage")},
        "summary": {
            "position_count": len(positions),
            "floating_profit": round(sum(float(p.get("profit", 0) or 0) for p in positions), 2),
        },
        "positions": positions,
    }


def _symbols(engine) -> Dict[str, Any]:
    try:
        rows = engine.get_symbols() or []
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc), "symbols": []}
    trimmed = [
        {k: r.get(k) for k in
         ("name", "description", "bid", "ask", "spread", "digits", "point",
          "trade_tick_size", "trade_contract_size", "volume_min", "volume_max",
          "_trade_mode")}
        for r in rows
    ]
    return {"count": len(trimmed), "symbols": trimmed}


def _routes(container) -> list:
    router = getattr(container, "router", None)
    if router is not None and hasattr(router, "list_routes"):
        return router.list_routes()
    return []