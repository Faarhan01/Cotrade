"""
server — Bot Routes
====================
HTTP endpoints for algorithmic bot management, strategy queries, and signal evaluations.
Integrates the knowledgebase strategy evaluation with the live MT5 engine feed.
"""

import logging
from datetime import datetime
from services.error_handlers.errors import BadRequest, HTTPError

logger = logging.getLogger("mt5pkg.server.bot")


def register(router, engine=None, runtime=None) -> int:
    """Register bot monitoring and signal evaluation routes."""
    before = len(router.list_routes())

    @router.get("/bot/status")
    def bot_status(params, query, body):
        is_conn = bool(getattr(engine, "is_connected", False)) if engine else False
        # When a runtime is present it is authoritative: it knows which sessions
        # are actually being evaluated, not merely which rows exist in SQLite.
        if runtime is not None:
            return runtime.status()
        return {
            "status": "ready",
            "connected_to_mt5": is_conn,
            "engine": "live_mt5_bridge" if is_conn else "detached",
            "subscribed_books": engine.market_book.subscribed if engine else [],
        }

    @router.get("/bot/running")
    def bot_running(params, query, body):
        if runtime is None:
            return {"sessions": [], "note": "bot runtime unavailable"}
        return {"sessions": runtime.running()}

    @router.get("/bot/signal")
    def bot_signal(params, query, body):
        """Evaluate a strategy against live bars without trading."""
        if runtime is None:
            raise BadRequest("bot runtime unavailable")
        name = query.get("strategy")
        symbol = query.get("symbol")
        if not name or not symbol:
            raise BadRequest("'strategy' and 'symbol' are required")
        return runtime.signal_for(
            name, symbol,
            timeframe=query.get("timeframe") or "M1",
            bars=int(query.get("bars") or 500),
        )

    @router.post("/bot/start")
    def bot_start(params, query, body):
        """
        Start a live bot session.

        `dry_run` defaults to true, so this cannot place a real order unless
        the caller explicitly opts in.
        """
        if runtime is None:
            raise BadRequest("bot runtime unavailable")
        body = body or {}
        strategy = body.get("strategy_name") or body.get("strategy")
        symbol = body.get("symbol")
        if not strategy:
            raise BadRequest("'strategy_name' is required")
        if not symbol:
            raise BadRequest("'symbol' is required")
        return runtime.start(
            strategy, symbol,
            timeframe=body.get("timeframe", "M1"),
            magic=int(body.get("magic", 0) or 0),
            dry_run=bool(body.get("dry_run", True)),
            session_id=body.get("session_id"),
            risk_amount=body.get("risk_amount"),
            stop_pips=body.get("stop_pips"),
        )

    @router.post("/bot/step")
    def bot_step(params, query, body):
        """Advance one session, or every session, by a single bar."""
        if runtime is None:
            raise BadRequest("bot runtime unavailable")
        body = body or {}
        bars = int(body.get("bars") or 500)
        sid = body.get("session_id")
        if sid:
            return runtime.step(sid, bars=bars)
        return {"results": runtime.step_all(bars=bars)}

    @router.post("/bot/stop")
    def bot_stop(params, query, body):
        if runtime is None:
            raise BadRequest("bot runtime unavailable")
        body = body or {}
        sid = body.get("session_id")
        if not sid:
            raise BadRequest("'session_id' is required")
        return runtime.stop(
            sid,
            trades_count=int(body.get("trades_count", 0) or 0),
            pnl_pips=float(body.get("pnl_pips", 0.0) or 0.0),
        )

    @router.get("/bot/strategies")
    def bot_strategies(params, query, body):
        try:
            from knowledgebase import strategies as kstrategies
            builtin = [s.name for s in kstrategies.library()]
        except Exception:
            builtin = []

        stored = []
        try:
            from database.store import Store
            with Store() as store:
                stored = [s["name"] for s in store.list_strategies()]
        except Exception:
            pass

        return {
            "builtin_strategies": builtin,
            "stored_strategies": stored,
            "total": len(builtin) + len(stored),
        }

    # ── Bot Session Management ───────────────────────────────────────────

    @router.post("/bot/sessions")
    def create_bot_session(params, query, body):
        """
        Create a bot session and actually start it.

        This used to write a SQLite row and nothing else, so the session showed
        up as "running" in the database while no strategy was ever evaluated —
        `bot_step` then reported "session is not running". Creating the row is
        now delegated to the runtime, which owns the trader and writes the row
        as part of starting, so the two can no longer disagree.
        """
        body = body or {}
        if runtime is None:
            raise BadRequest("bot runtime unavailable")

        strategy_name = body.get("strategy_name") or body.get("strategy")
        symbol = body.get("symbol")
        if not strategy_name:
            raise BadRequest("'strategy_name' is required")
        if not symbol:
            raise BadRequest("'symbol' is required")

        try:
            return runtime.start(
                strategy_name, symbol,
                timeframe=body.get("timeframe", "M1"),
                magic=int(body.get("magic", 0) or 0),
                dry_run=bool(body.get("dry_run", True)),
                session_id=body.get("session_id"),
                risk_amount=body.get("risk_amount"),
                stop_pips=body.get("stop_pips"),
            )
        except ValueError as exc:
            # Unknown strategy: a bad request, not a server fault.
            raise BadRequest(str(exc))

    @router.get("/bot/sessions")
    def list_bot_sessions(params, query, body):
        """List all bot sessions."""
        from database.store import Store
        try:
            with Store() as store:
                limit = int(query.get("limit", 50))
                sessions = store.list_bot_sessions(limit=limit)
                return {"sessions": sessions, "count": len(sessions)}
        except Exception as e:
            return {"sessions": [], "count": 0, "error": str(e)}

    @router.get("/bot/sessions/{session_id}")
    def get_bot_session(params, query, body):
        """Get details of a specific bot session including logs."""
        session_id = params["session_id"]
        from database.store import Store
        try:
            with Store() as store:
                sessions = store.list_bot_sessions(limit=1000)
                session = next((s for s in sessions if s.get("session_id") == session_id), None)
                if not session:
                    from services.error_handlers.errors import NotFound
                    raise NotFound("Session not found")

                logs = store.list_bot_logs(session_id=session_id, limit=200)
                return {"session": session, "logs": logs}
        except Exception as e:
            from services.error_handlers.errors import BadRequest, HTTPError
            if isinstance(e, HTTPError):
                raise
            raise BadRequest(str(e))

    @router.post("/bot/sessions/{session_id}/pause")
    def pause_bot_session(params, query, body):
        session_id = params["session_id"]
        from database.store import Store
        try:
            with Store() as store:
                # Preserve existing metrics — only change status
                sessions = store.list_bot_sessions(limit=1000)
                session = next((s for s in sessions if s.get("session_id") == session_id), None)
                if not session:
                    from services.error_handlers.errors import NotFound
                    raise NotFound("Session not found")
                store.update_bot_session(session_id,
                                       trades_count=session.get("trades_count", 0),
                                       pnl_pips=session.get("pnl_pips", 0.0),
                                       status="paused", stopped=False)
                return {"success": True, "session_id": session_id, "status": "paused"}
        except Exception as e:  # noqa: BLE001
            from services.error_handlers.errors import BadRequest, HTTPError
            if isinstance(e, HTTPError):
                raise
            raise BadRequest(str(e))

    @router.post("/bot/sessions/{session_id}/resume")
    def resume_bot_session(params, query, body):
        session_id = params["session_id"]
        from database.store import Store
        try:
            with Store() as store:
                # Preserve existing metrics — only change status
                sessions = store.list_bot_sessions(limit=1000)
                session = next((s for s in sessions if s.get("session_id") == session_id), None)
                if not session:
                    from services.error_handlers.errors import NotFound
                    raise NotFound("Session not found")
                store.update_bot_session(session_id,
                                       trades_count=session.get("trades_count", 0),
                                       pnl_pips=session.get("pnl_pips", 0.0),
                                       status="running", stopped=False)
                return {"success": True, "session_id": session_id, "status": "running"}
        except Exception as e:  # noqa: BLE001
            if isinstance(e, HTTPError):
                raise
            raise BadRequest(str(e))

    @router.post("/bot/sessions/{session_id}/stop")
    def stop_bot_session(params, query, body):
        """
        Stop a running bot session.

        The runtime is stopped first so the trader is torn down and the row
        marked stopped in one step. Previously this only wrote the row, which
        left the in-memory trader running and stepping against a session the
        database reported as stopped.
        """
        session_id = params["session_id"]
        body = body or {}
        if runtime is not None:
            result = runtime.stop(
                session_id,
                trades_count=int(body.get("trades_count", 0) or 0),
                pnl_pips=float(body.get("pnl_pips", 0.0) or 0.0),
            )
            return {"success": True, "status": "stopped", **result}

        from database.store import Store
        try:
            with Store() as store:
                store.update_bot_session(
                    session_id,
                    trades_count=int(body.get("trades_count", 0) or 0),
                    pnl_pips=float(body.get("pnl_pips", 0.0) or 0.0),
                    status="stopped",
                    stopped=True
                )
                return {"success": True, "session_id": session_id, "status": "stopped"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @router.get("/bot/sessions/{session_id}/logs")
    def get_bot_logs(params, query, body):
        """Get execution logs for a bot session."""
        session_id = params["session_id"]
        limit = int(query.get("limit", 200))
        from database.store import Store
        try:
            with Store() as store:
                logs = store.list_bot_logs(session_id=session_id, limit=limit)
                return {"session_id": session_id, "logs": logs, "count": len(logs)}
        except Exception as e:
            return {"logs": [], "count": 0, "error": str(e)}

    @router.post("/bot/sessions/{session_id}/log")
    def log_bot_action(params, query, body):
        """Record a bot action (order, evaluation, etc.)"""
        session_id = params["session_id"]
        body = body or {}
        from database.store import Store
        try:
            with Store() as store:
                log_id = store.log_bot_action(
                    session_id=session_id,
                    action=body.get("action", "unknown"),
                    symbol=body.get("symbol", ""),
                    side=body.get("side"),
                    volume=body.get("volume"),
                    price=body.get("price"),
                    success=bool(body.get("success", True)),
                    details=body.get("details", "")
                )
                return {"success": True, "log_id": log_id}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @router.post("/bot/sessions/{session_id}/update")
    def update_bot_session(params, query, body):
        """Update session performance metrics."""
        session_id = params["session_id"]
        body = body or {}
        from database.store import Store
        try:
            with Store() as store:
                trades_count = int(body.get("trades_count", 0))
                pnl_pips = float(body.get("pnl_pips", 0.0))
                status = body.get("status", "running")
                stopped = bool(body.get("stopped", False))
                store.update_bot_session(
                    session_id,
                    trades_count=trades_count,
                    pnl_pips=pnl_pips,
                    status=status,
                    stopped=stopped
                )
                return {"success": True, "session_id": session_id}
        except Exception as e:
            return {"success": False, "error": str(e)}

    return len(router.list_routes()) - before