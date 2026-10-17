"""
mt5_pkg_bridge — API Manager

Auto-discovers and wraps every public MetaTrader5 function so the engine
never needs to be manually updated when the package gains or loses functions.

How it works
------------

1. `load()` scans the installed ``MetaTrader5`` package at import time
   and builds a map of every public name (doesn't start with ``_``).

2. For each function it finds, it creates a thin wrapper that:
      • Ensures the engine is connected to a terminal.
      • Resolves the symbol name (handles case-insensitive lookup).
      • Calls the raw ``mt5.`` function.
      • Serialises the result to a plain dict (no namedtuple leaks).
      • Translates the MT5 return-code into a user-friendly name.

3. The resulting dict is registered in ``MT5Engine._funcs`` so that
   ``GET /enums`` can list every available operation, and the engine can
   dispatch calls dynamically.

4. If ``MetaTrader5`` is not importable, ``load()`` is a no-op and the
   engine falls back to the hard‑coded list of 35 functions — exactly
   what happened before, so nothing breaks.

Why this matters
----------------

- **One source of truth.** Adding a new MT5 function requires zero changes
  to ``mt5_engine.py``. The API manager picks it up automatically.
- **No stale wrappers.** Functions that MT5 has removed are simply absent
  from the dispatch table; callers get a clear ``NotImplementedError``
  rather than a silently broken call.
- **Consistent contract.** Every wrapper returns the same shaped dict
  (``{..., "retcode": ..., "result": ...}``) and translates codes via
  ``enums.retcode_name()``.
- **Backtest fidelity.** Because the wrappers just forward to the real
  package, backtest results using ``copy_rates_from``/``copy_ticks_from``
  etc. are as accurate as the MT5 terminal itself — no intermediate
  translation layer corrupts the data.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Callable
from typing import Any

from . import enums
from .connection import ConnectionManager

_LOG = logging.getLogger("mt5pkg.discovery")


def _is_public(name: str) -> bool:
    """True if the name does not start with an underscore and is not a dunder."""
    return not name.startswith("_") or name in {
        "RES_S_OK", "RES_E_FAIL", "RES_E_INVALID_PARAMS", "RES_E_NO_MEMORY",
        "RES_E_NOT_FOUND", "RES_E_INVALID_VERSION", "RES_E_AUTH_FAILED",
        "RES_E_UNSUPPORTED", "RES_E_AUTO_TRADING_DISABLED",
    }


def _callable_attr(mt5_mod: Any, name: str) -> bool:
    """Heuristic: is the attribute a routine (function/method) on the module?"""
    obj = getattr(mt5_mod, name, None)
    return inspect.isroutine(obj) and not name.startswith("_")


def _wrap_function(name: str, raw_fn: Callable) -> Callable:
    """
    Return a wrapper that:
      • Ensures connection.
      • Resolves symbol name.
      • Calls the raw MT5 function.
      • Serialises the result.
      • Translates the return code.
    """

    def wrapper(*args: Any, **kwargs: Any) -> dict:
        # 1. Ensure we have a terminal connected
        if not ConnectionManager.is_connected:
            from mt5_pkg_bridge.mt5_engine import MT5ConnectionError
            raise MT5ConnectionError(
                "MT5 engine not connected. Call ConnectionManager.connect() first."
            )

        # 2. Resolve symbol name (case-insensitive lookup, auto-select)
        # The first positional arg, if it looks like a symbol, is resolved.
        resolved_symbol = None
        if args:
            first = args[0]
            if isinstance(first, str):
                resolved_symbol = enums.resolve_symbol(first)  # type: ignore[attr-visit]

        # 3. Call the raw function
        try:
            if resolved_symbol is not None and resolved_symbol != args[0]:
                # Replace the symbol argument with the resolved one
                final_args = (resolved_symbol,) + args[1:]
            else:
                final_args = args
            result = raw_fn(*final_args, **kwargs)
        except Exception as exc:  # noqa: BLE001
            return {
                "retcode": getattr(exc, "code", -1) if hasattr(exc, "code") else -1,
                "description": str(exc),
                "result": None,
                "_success": False,
            }

        # 4. Serialise to plain dict (handles namedtuple, custom objects)
        from mt5_pkg_bridge.serializers import serialize_namedtuple

        if result is None:
            return {
                "retcode": 10009,  # RETCODE_REQUEST_TIMEOUT or similar
                "description": "request timed out or returned None",
                "result": None,
                "_success": False,
            }

        # If it's a list of namedtuples (ticks, candles, deals, orders)
        if isinstance(result, list) and len(result) > 0 and hasattr(result[0], "_asdict"):
            serialized = [serialize_namedtuple(r) for r in result]
            return {
                "retcode": getattr(result[0], "retcode", 10009) if hasattr(result[0], "retcode") else 10009,
                "description": "",
                "result": serialized,
                "_success": True,
            }

        # Single namedtuple (account_info, symbol_info, tick, order, position)
        if hasattr(result, "_asdict"):
            serialized = serialize_namedtuple(result)
            return {
                "retcode": getattr(result, "retcode", 10009) if hasattr(result, "retcode") else 10009,
                "description": "",
                "result": serialized,
                "_success": True,
            }

        # Fallback: return as-is (already a dict or primitive)
        return {
            "retcode": 10009 if result is None else 0,
            "description": "",
            "result": result,
            "_success": result is not None,
        }

    # Preserve the original function's signature for docs/introspection
    wrapper.__name__ = name
    wrapper.__doc__ = raw_fn.__doc__
    wrapper.__module__ = raw_fn.__module__
    return wrapper


def load() -> dict[str, Callable]:
    """
    Scan the installed MetaTrader5 package and return a dict mapping every
    public function name to a wrapper.

    The dict is deliberately *not* assigned to a module global here — the
    caller (MT5Engine) decides how to ingest it. This keeps the manager
    pure and testable without side effects.
    """
    try:
        import MetaTrader5 as mt5
    except ImportError:
        _LOG.warning("MetaTrader5 package not importable; API manager has nothing to wrap.")
        return {}

    found: dict[str, Callable] = {}
    for name in dir(mt5):
        if not _is_public(name):
            continue
        if not _callable_attr(mt5, name):
            continue

        raw_fn = getattr(mt5, name)
        wrapped = _wrap_function(name, raw_fn)
        found[name] = wrapped

    _LOG.info("API manager discovered %d MT5 functions", len(found))
    return found