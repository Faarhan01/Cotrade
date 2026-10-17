"""
Bot Runtime
===========

Turns a stored strategy plus a symbol into a live signal, and optionally into
an executed trade.

Why this exists
---------------
`tools/bot/live.py` already defines `LiveTrader`, which can evaluate a strategy
against live bars and place an order. Nothing referenced it: no route, no CLI
command, no agent surface. A bot session was therefore a database row that
recorded intent and nothing more — "running" meant a row existed, not that a
strategy was being evaluated.

This module is the missing wiring. It owns the live `LiveTrader` instances,
keyed by session id, so:

* `signal_for` / `evaluate` answer "what does this strategy think right now?"
  without touching the market.
* `step` runs one evaluation cycle: read bars, ask the strategy, and when the
  signal fires either log it (`dry_run`) or place the order.
* Sessions survive across calls because the traders are held here, so an agent
  can start a session, poll it, and stop it.

Design constraints, in priority order:

1. **Never trade by accident.** `dry_run` defaults to true on every entry point
   and is re-checked immediately before `order_send`. A caller has to pass
   `dry_run=False` explicitly.
2. **Respect existing positions.** A step refuses to open a second position in
   the same symbol under the same magic, so a re-run cannot stack exposure.
3. **Failures are recorded, not swallowed.** An error during a step is written
   to the session log, because a bot that stops quietly is worse than one that
   stops loudly.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("mt5pkg.bot")


class BotRuntime:
    """
    Holds live bot sessions in memory and advances them on demand.

    A single instance is created by the daemon at startup and handed to the
    route registrar and the MCP server. Both surfaces therefore drive the same
    traders: an agent that starts a bot over MCP sees it in the web UI, and a
    session started from the UI is visible to `bot_status`.
    """

    def __init__(self, engine, container=None, research=None):
        self.engine = engine
        self.container = container
        self._research = research
        self._lock = threading.RLock()
        self._traders: Dict[str, Any] = {}
        self._started: Dict[str, float] = {}

    # ── strategy resolution ────────────────────────────────────────────────
    def _research_service(self):
        if self._research is not None:
            return self._research
        # The services hold theirs as `_research`; probing only `research`
        # missed them all and fell through to a store-less Research below,
        # where `get_strategy` returns None and every library name looked
        # unknown.
        for service in (getattr(self.container, "backtest", None),
                        getattr(self.container, "pattern_scan", None),
                        getattr(self.container, "validation", None)):
            for attr in ("_research", "research"):
                found = getattr(service, attr, None)
                if found is not None:
                    self._research = found
                    return found
        from managers.api_manager.api import Research
        from tools.bot import datafeed
        try:
            from database.store import Store
            store = Store(getattr(getattr(self.container, "config", None),
                                  "db_path", None))
        except Exception:  # noqa: BLE001 - keep working, just do not persist
            store = None
        self._research = Research(fetch=datafeed.bars, store=store)
        return self._research

    def strategy(self, name: str) -> Any:
        """
        Resolve a stored or library strategy name into a `Strategy` object.

        Stored rows keep their definition in JSON text columns, so they are
        decoded before being handed to the knowledgebase factory. Falls back to
        the built-in library when no stored definition matches.
        """
        from knowledgebase.strategies import Strategy

        research = self._research_service()

        spec = None
        try:
            spec = research.get_strategy(name)
        except Exception:  # noqa: BLE001
            spec = None

        if spec is None:
            for item in (research.library() or []):
                as_dict = item.to_dict() if hasattr(item, "to_dict") else item
                if isinstance(as_dict, dict) and as_dict.get("name") == name:
                    spec = as_dict
                    break

        if spec is None:
            raise ValueError(
                f"Unknown strategy {name!r}. Call list_strategies or "
                "list_knowledgebase to see what is available.")

        # Stored rows keep their definition in JSON text columns.
        for key in ("entry_params", "exit_rule", "sizing"):
            if isinstance(spec.get(key), str):
                import json
                try:
                    spec[key] = json.loads(spec[key])
                except Exception:  # noqa: BLE001
                    raise ValueError(
                        f"Strategy {name!r} has an unreadable {key} column")

        try:
            return Strategy.from_dict(spec)
        except KeyError as exc:
            raise ValueError(str(exc)) from exc

    # ── lifecycle ──────────────────────────────────────────────────────────
    def start(self, strategy_name: str, symbol: str, timeframe: str = "M1",
              magic: int = 0, dry_run: bool = True,
              session_id: Optional[str] = None,
              risk_amount: Optional[float] = None,
              stop_pips: Optional[float] = None) -> Dict[str, Any]:
        """
        Create a trader and register the session.

        The strategy is resolved first so a bad name fails here rather than on
        the first step, which would otherwise be minutes later.
        """
        from tools.bot.live import LiveTrader

        strategy = self.strategy(strategy_name)
        sid = session_id or f"bot_{time.strftime('%Y%m%dT%H%M%S')}"

        trader = LiveTrader(symbol=symbol, timeframe=timeframe, strategy=strategy,
                            magic=magic, dry_run=dry_run, session_id=None)
        if risk_amount is not None and stop_pips is not None:
            trader.risk_amount = float(risk_amount)
            trader.stop_pips = float(stop_pips)

        with self._lock:
            self._traders[sid] = trader
            self._started[sid] = time.time()

        self._record(sid, "start", symbol, success=True,
                     details=f"{strategy_name} {timeframe} magic={magic} "
                             f"{'dry_run' if dry_run else 'LIVE'}")
        return {
            "session_id": sid,
            "strategy": strategy_name,
            "symbol": symbol,
            "timeframe": timeframe,
            "magic": magic,
            "dry_run": dry_run,
            "running": True,
        }

    def stop(self, session_id: str, trades_count: int = 0,
             pnl_pips: float = 0.0) -> Dict[str, Any]:
        with self._lock:
            existed = session_id in self._traders
            trader = self._traders.pop(session_id, None)
            self._started.pop(session_id, None)
        self._record(session_id, "stop", getattr(trader, "symbol", ""),
                     success=True,
                     details=f"trades={trades_count} pnl={pnl_pips}")
        return {"session_id": session_id, "stopped": True, "was_running": existed}

    def running(self) -> List[Dict[str, Any]]:
        with self._lock:
            # Iterate items() rather than zipping two separately-built lists:
            # the second list was a list of floats, so the unpack `for sid,
            # (t, start) in` tried to iterate a number and every call with a
            # live session raised TypeError -> HTTP 500 on /bot/running.
            return [
                {
                    "session_id": sid,
                    "strategy": getattr(t.strategy, "name", None),
                    "symbol": t.symbol,
                    "timeframe": t.timeframe,
                    "magic": t.magic,
                    "dry_run": bool(t.dry_run),
                    "uptime_seconds": round(time.time() - start, 1),
                }
                for sid, t in self._traders.items()
                for start in (self._started.get(sid, time.time()),)
            ]

    def status(self) -> Dict[str, Any]:
        with self._lock:
            live = [t for t in self._traders.values() if not getattr(t, "dry_run", True)]
            total = len(self._traders)
        return {
            "status": "running" if total else "idle",
            "connected_to_mt5": bool(getattr(self.engine, "is_connected", False)),
            "engine": "live_mt5_bridge" if getattr(self.engine, "is_connected", False) else "detached",
            "sessions_active": total,
            "sessions_live_money": len(live),
            "sessions_dry_run": total - len(live),
            "subscribed_books": [],
        }

    # ── evaluation ─────────────────────────────────────────────────────────
    def signal_for(self, strategy_name: str, symbol: str,
                   timeframe: str = "M1", bars: int = 500) -> Dict[str, Any]:
        """
        What the strategy says right now, without trading anything.

        This is the safe way to ask "should I trade this?" and is what an agent
        should call before deciding to act.
        """
        strategy = self.strategy(strategy_name)
        from tools.bot.live import LiveTrader
        trader = LiveTrader(symbol=symbol, timeframe=timeframe, strategy=strategy,
                            dry_run=True, session_id=None)
        side = trader.current_signal(trader.bars(count=bars))
        return {
            "strategy": strategy_name,
            "symbol": symbol,
            "timeframe": timeframe,
            "bars": bars,
            "signal": side,
            "direction": {1: "buy", -1: "sell"}.get(side, "flat"),
            "pip": trader.pip,
        }

    def step(self, session_id: str, bars: int = 500) -> Dict[str, Any]:
        """
        Advance one session by a single bar.

        Returns the decision that was taken. A flat signal is a no-op; a
        signal in a session that already holds this symbol is refused rather
        than stacked.
        """
        with self._lock:
            trader = self._traders.get(session_id)
        if trader is None:
            return {"session_id": session_id, "error": "session is not running"}

        try:
            side = trader.current_signal(trader.bars(count=bars))
        except Exception as exc:  # noqa: BLE001
            self._record(session_id, "step", trader.symbol, success=False,
                         details=str(exc))
            return {"session_id": session_id, "error": str(exc)}

        if side == 0:
            return {"session_id": session_id, "signal": 0, "action": "none"}

        if self._already_open(trader):
            self._record(session_id, "step", trader.symbol, side="buy" if side == 1 else "sell",
                         success=True, details="position already open; not stacking")
            return {"session_id": session_id, "signal": side,
                    "action": "skipped", "reason": "position already open"}

        lots = self._lots(trader)
        if lots is None:
            self._record(session_id, "step", trader.symbol, success=False,
                         details="could not size a position")
            return {"session_id": session_id, "signal": side, "action": "error",
                    "reason": "could not size a position"}

        if getattr(trader, "dry_run", True):
            self._record(session_id, "signal", trader.symbol,
                         side="buy" if side == 1 else "sell", volume=lots,
                         success=True, details="dry_run: not sent")
            return {"session_id": session_id, "signal": side, "action": "dry_run",
                    "lots": lots}

        sent = trader.send(side, lots)
        ok = bool(sent.get("success"))
        self._record(session_id, "send", trader.symbol,
                     side="buy" if side == 1 else "sell", volume=lots,
                     success=ok, details=str(sent)[:200])
        return {"session_id": session_id, "signal": side,
                "action": "sent" if ok else "rejected", "lots": lots,
                "result": sent}

    def step_all(self, bars: int = 500) -> List[Dict[str, Any]]:
        with self._lock:
            ids = list(self._traders)
        return [self.step(sid, bars=bars) for sid in ids]

    # ── internals ──────────────────────────────────────────────────────────
    def _already_open(self, trader) -> bool:
        try:
            positions = self.engine.get_positions(symbol=trader.symbol) or []
        except Exception:  # noqa: BLE001
            return False
        return any(int(p.get("magic", 0) or 0) == int(trader.magic or 0)
                   for p in positions)

    def _lots(self, trader) -> Optional[float]:
        """
        Size the next position.

        With a risk budget the gateway's own `/calc/size` is authoritative,
        because it clamps to the symbol's lot step and min/max. Without one,
        the strategy's own sizing rule is used, which is what a backtest of
        that strategy would have assumed - so a dry-run bot and its backtest
        size the trade the same way.

        `datafeed.instrument()` already flattens the derived values, so this
        reads `pip_value_per_lot` off that rather than reaching into `_derived`.
        """
        risk = getattr(trader, "risk_amount", None)
        stop = getattr(trader, "stop_pips", None)
        if risk and stop:
            try:
                sized = trader.size_for(float(risk), float(stop))
                lots = float(sized.get("lots") or 0)
                if lots > 0:
                    return lots
            except Exception:  # noqa: BLE001
                pass

        sizing_rule = getattr(getattr(trader, "strategy", None), "sizing", None)
        if sizing_rule is not None:
            lots = getattr(sizing_rule, "lots", None)
            if lots:
                return float(lots)

        return None

    def _record(self, session_id: str, action: str, symbol: str,
                side: Optional[str] = None, volume: Optional[float] = None,
                success: bool = True, details: str = "") -> None:
        try:
            from database.store import Store
            with Store() as store:
                store.log_bot_action(
                    session_id=session_id, action=action, symbol=symbol,
                    side=side, volume=volume, price=None,
                    success=success, details=details[:500],
                )
        except Exception:  # noqa: BLE001 - logging must never break a step
            logger.debug("could not write bot log for %s", session_id, exc_info=True)