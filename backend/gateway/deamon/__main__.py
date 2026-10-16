import uuid
"""
deamon — Service Entry Point
==============================
        self.router.get("/metrics")(self.metrics)
Process lifecycle for the cony gateway: configuration, logging, the HTTP

This is the only layer that knows about sockets. It assembles cony (engine)
and server (routing) and exposes them on the network, which is what makes
the daemon replaceable - an MCP server or a WebSocket front end would sit
here instead without touching the layers below.
"""

import time
import json
import os
import select
import signal
import socket
import sys
import threading
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from managers.mt5_manager import cony
from core.server import Router, RouteHandlers
from services.error_handlers.errors import BadRequest, HTTPError, PayloadTooLarge
from core.server.responses import RawResponse
from core.server.streaming import (
    EventStream,
    marketbook_producer,
    portfolio_producer,
    tick_producer,
    require_symbols,
    stream_params,
)
from core.config import GatewayConfig, validate
from gateway.deamon.logger import setup_logging, get_logger
PRETTY_LIMIT = 64 * 1024


class PortUnavailable(RuntimeError):
    """The configured host:port is already taken."""


class GatewayServer(ThreadingMixIn, HTTPServer):
    """
    Threaded HTTP server.

    We disable the server's internal handling of Ctrl+C so that we can handle
    it ourselves and shut down cleanly.
    """

    def server_bind(self):
        """Disable the socket's Nagle algorithm."""
        self.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        return super().server_bind()


class Gateway:
    """Wires the engine, router and HTTP server into one runnable thing."""

    def __init__(self):
        self.config = GatewayConfig.from_env()
        validate(self.config)
        setup_logging(self.config.log_level, self.config.log_file)
        global logger
        logger = get_logger("deamon")
        self.engine = self.build_engine()
        self.router = Router()
        # Stage 5: single composition root.
        try:
            from core.composition import build_container
            self.container = build_container(self.config, self.engine)
        except Exception as exc:  # noqa: BLE001
            logger.debug("container not available: %s", exc)
            self.container = None
        self._start_time = time.time()
        RouteHandlers(self.engine, self.router,
                          base=f"http://{self.config.host}:{self.config.port}",
                          container=getattr(self, "container", None))

    def build_engine(self) -> cony.mt5_engine.MT5Engine:
        conn = cony.ConnectionManager(
            {
                "package_path": self.config.mt5_package_path,
                "login": self.config.mt5_login,
                "password": self.config.mt5_password,
                "server": self.config.mt5_server,
                "terminal_path": self.config.mt5_path,
                "timeout": self.config.mt5_timeout,
                "auto_reconnect": self.config.auto_reconnect,
            }
        )
        return cony.mt5_engine.MT5Engine(conn, symbol_cache_ttl=self.config.symbol_cache_ttl)

    def metrics(self, params, query, body):
        from database.store import Store
        with Store() as store:
            db_stats = store.stats()
        uptime = time.time() - self._start_time
        with _STREAM_LOCK:
            active_streams = len(_ACTIVE_STREAMS)
        return {
            "service": "cony-gateway",
            "mt5_connected": self.engine.is_connected,
            "database": db_stats,
            "uptime_seconds": uptime,
            "active_streams": active_streams,
            "timestamp": time.time(),
        }

    def connect(self) -> bool:
        """Attach to the terminal, reporting rather than raising."""
        try:
            info = self.engine.connect()
            logger.info(
                "Connected to MT5 terminal (build %s, account %s)",
                info["terminal"]["build"],
                info["account"]["login"] if info.get("account") else "?",
            )
            if self.config.auto_reconnect:
                self.engine.start_auto_reconnect(self.config.reconnect_interval)
            return True
        except (ConnectionError, cony.mt5_engine.MT5ConnectionError) as exc:
            logger.warning("Could not connect to MT5: %s", exc)
            logger.warning("Serving anyway; POST /connect to retry.")
            return False

    def serve_forever(self):
        logger.info("=" * 58)
        logger.info("cony gateway %s", __import__("cony").__version__)
        logger.info("listening      http://%s:%s", self.config.host, self.config.port)
        logger.info("package path   %s", self.config.mt5_package_path or "importable directly")
        logger.info("routes         http://%s:%s/routes", self.config.host, self.config.port)
        logger.info("endpoints      http://%s:%s/enums", self.config.host, self.config.port)
        logger.info("=" * 58)

        # The initial MT5 attach happens on a worker thread, never inline.
        # mt5.initialize() can block for far longer than its own timeout, and
        # running it before serve_forever() left the port listening but serving
        # nothing - unreachable, with no /health to explain why.
        if self.config.auto_connect:
            threading.Thread(
                target=self.connect, name="cony-connect", daemon=True
            ).start()

        try:
            self.server.serve_forever()
        finally:
            self.shutdown()

    def shutdown(self):
        logger.info("Shutting down.")
        self.stream_shutdown()
        self.server.shutdown()

    def stream_shutdown(self):
        with _STREAM_LOCK:
            for stream in list(_ACTIVE_STREAMS):
                stream.stop()


# Streaming connections currently open, so shutdown can stop them.
_ACTIVE_STREAMS = set()
_STREAM_LOCK = threading.Lock()

# Responses at or below this size are pretty-printed for readability; larger
# ones go out compact, where the saving is worth more than the looks.