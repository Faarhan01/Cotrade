"""
deamon — Service Entry Point
==============================
Process lifecycle for the cony gateway: configuration, logging, HTTP routing,
and live streaming.

Wires the MT5Engine, URL Router, and Threaded HTTP Server into a cohesive daemon.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional
import socket
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlparse

# Ensure backend paths are accessible
_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
_backend = os.path.join(_root, "backend")
_managers = os.path.join(_backend, "managers")
_mt5_manager = os.path.join(_managers, "mt5_manager")
_database = os.path.join(_backend, "database")
_gateway = os.path.join(_backend, "gateway")
_services = os.path.join(_backend, "services")
_core = os.path.join(_backend, "core")
_knowledgebase = os.path.join(_backend, "knowledgebase")
_tools = os.path.join(_backend, "tools")

for _dir in (_root, _backend, _core, _gateway, _managers, _mt5_manager, _database, _knowledgebase, _services, _tools):
    if os.path.isdir(_dir) and _dir not in sys.path:
        sys.path.insert(0, _dir)

from core.config import GatewayConfig, validate
from core.server import RouteHandlers, Router
from core.server.responses import RawResponse
from core.server.streaming import (
    EventStream,
    marketbook_producer,
    portfolio_producer,
    require_symbols,
    stream_params,
    tick_producer,
)
from gateway.deamon.logger import get_logger, setup_logging
from managers.mt5_manager import cony
from services.error_handlers.errors import (
    BadRequest,
    HTTPError,
)

PRETTY_LIMIT = 64 * 1024
MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB

_ACTIVE_STREAMS = set()
_STREAM_LOCK = threading.Lock()
logger = logging.getLogger("deamon")


class PortUnavailable(RuntimeError):
    """The configured host:port is already taken."""


class GatewayServer(ThreadingMixIn, HTTPServer):
    """Threaded HTTP server that cleans up worker threads gracefully."""
    daemon_threads = True
    allow_reuse_address = True

    def server_bind(self):
        """Disable Nagle's algorithm for low-latency market data delivery."""
        try:
            self.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except Exception:
            pass
        return super().server_bind()


class GatewayRequestHandler(BaseHTTPRequestHandler):
    """Dispatches incoming HTTP and SSE stream requests."""
    server_version = "cony-gateway/1.0"

    def log_message(self, format, *args):
        logger.debug("%s - [%s] " + format, self.address_string(), self.log_date_time_string(), *args)

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def _dispatch(self, method: str):
        parsed = urlparse(self.path)
        clean_path = parsed.path.rstrip("/") or "/"

        if clean_path.startswith("/stream/"):
            self._handle_stream(clean_path, parsed.query)
            return

        self._handle_http(method, parsed)

    def _handle_stream(self, path: str, query_string: str):
        """Handle Server-Sent Event (SSE) streams."""
        query = {k: v[0] for k, v in parse_qs(query_string).items()}
        engine = self.server.gateway.engine

        if path not in ("/stream/ticks", "/stream/marketbook", "/stream/portfolio"):
            self._send_error_json(
                404,
                f"Unknown stream: {path}. Available streams: /stream/ticks, /stream/marketbook, /stream/portfolio",
                "NotFound",
            )
            return

        try:
            symbols, interval, book = stream_params(query)
            if path in ("/stream/ticks", "/stream/marketbook"):
                symbols = require_symbols(query, engine)
        except BadRequest as exc:
            self._send_error_json(exc.status, str(exc), exc.type_name)
            return
        except Exception as exc:
            self._send_error_json(500, str(exc), type(exc).__name__)
            return

        if path == "/stream/ticks":
            producer = tick_producer(engine, symbols, book=book)
            source_name = "tick"
        elif path == "/stream/marketbook":
            producer = marketbook_producer(engine, symbols)
            source_name = "marketbook"
        else:
            producer = portfolio_producer(engine, include_book=book)
            source_name = "portfolio"

        self._client_gone = False
        stream = EventStream(self, interval=interval, source=source_name)

        with _STREAM_LOCK:
            _ACTIVE_STREAMS.add(stream)

        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-transform")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self._send_cors_headers()
            self.end_headers()

            for chunk in stream.run(producer):
                try:
                    self.wfile.write(chunk)
                    self.wfile.flush()
                except (OSError, BrokenPipeError, ConnectionResetError):
                    self._client_gone = True
                    stream.stop()
                    break
        except Exception as exc:
            logger.debug("Stream error: %s", exc)
        finally:
            stream.stop()
            with _STREAM_LOCK:
                _ACTIVE_STREAMS.discard(stream)

    def _handle_http(self, method: str, parsed):
        body = {}
        content_length_header = self.headers.get("Content-Length")
        if content_length_header:
            try:
                content_len = int(content_length_header)
            except ValueError:
                self._send_error_json(400, "Invalid Content-Length header", "BadRequest")
                return

            if content_len > MAX_BODY_SIZE:
                self._send_error_json(413, "Payload exceeds maximum allowed size", "PayloadTooLarge")
                return

            if content_len > 0:
                raw_bytes = self.rfile.read(content_len)
                content_type = self.headers.get("Content-Type", "")
                if "application/json" in content_type or not content_type:
                    try:
                        raw_str = raw_bytes.decode("utf-8", "replace").strip()
                        if raw_str:
                            body = json.loads(raw_str)
                    except json.JSONDecodeError as exc:
                        self._send_error_json(400, f"Malformed JSON: {exc}", "BadRequest")
                        return

        handler, params, query = self.server.gateway.router.resolve(method, self.path)
        if handler is None:
            clean_path = parsed.path.rstrip("/") or "/"
            self._send_error_json(
                404,
                f"No such route: {clean_path}. See /routes for the full directory.",
                "NotFound",
            )
            return

        try:
            result = handler(params, query, body)
        except HTTPError as exc:
            self._send_error_json(exc.status, str(exc), exc.type_name)
            return
        except cony.mt5_engine.MT5ConnectionError as exc:
            self._send_error_json(503, str(exc), "UpstreamUnavailable")
            return
        except Exception as exc:
            logger.error("Unhandled handler error on %s %s: %s", method, self.path, exc, exc_info=True)
            self._send_error_json(500, str(exc), type(exc).__name__)
            return

        if isinstance(result, RawResponse):
            self.send_response(result.status)
            self.send_header("Content-Type", result.content_type)
            self.send_header("Content-Length", str(len(result.body)))
            for k, v in result.headers.items():
                self.send_header(k, v)
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(result.body)
            return

        try:
            rendered = json.dumps(
                result,
                indent=2 if len(json.dumps(result, default=str)) <= PRETTY_LIMIT else None,
                default=str,
            ).encode("utf-8")
        except Exception as exc:
            self._send_error_json(500, f"Serialization error: {exc}", "SerializationError")
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(rendered)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(rendered)

    def _send_error_json(self, status: int, error_msg: str, error_type: str):
        payload = json.dumps({"error": error_msg, "type": error_type}).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(payload)
        except Exception:
            pass


class Gateway:
    """Wires the engine, router and HTTP server into one runnable service."""

    def __init__(self, config: Optional[GatewayConfig] = None):
        self.config = config or GatewayConfig.from_env()
        validate(self.config)
        setup_logging(self.config.log_level, self.config.log_file)
        global logger
        logger = get_logger("deamon")
        self.engine = self.build_engine()
        self.router = Router()

        try:
            from core.composition import build_container
            self.container = build_container(self.config, self.engine)
        except Exception as exc:
            logger.debug("container not available: %s", exc)
            self.container = None

        self._start_time = time.time()
        RouteHandlers(
            self.engine,
            self.router,
            base=f"http://{self.config.host}:{self.config.port}",
            container=getattr(self, "container", None),
        )

        self.router.get("/metrics")(self.metrics)

        try:
            self.server = GatewayServer((self.config.host, self.config.port), GatewayRequestHandler)
            self.server.gateway = self
        except OSError as exc:
            raise PortUnavailable(
                f"Port {self.config.port} is unavailable on {self.config.host}: {exc}"
            ) from exc

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
                info.get("terminal", {}).get("build"),
                info.get("account", {}).get("login") if info.get("account") else "?",
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
        logger.info("cony gateway %s", getattr(cony, "__version__", "1.0.0"))
        logger.info("listening      http://%s:%s", self.config.host, self.config.port)
        logger.info("package path   %s", self.config.mt5_package_path or "importable directly")
        logger.info("routes         http://%s:%s/routes", self.config.host, self.config.port)
        logger.info("endpoints      http://%s:%s/enums", self.config.host, self.config.port)
        logger.info("=" * 58)

        if self.config.auto_connect:
            threading.Thread(target=self.connect, name="cony-connect", daemon=True).start()

        try:
            self.server.serve_forever()
        finally:
            self.shutdown()

    def shutdown(self):
        logger.info("Shutting down gateway daemon.")
        self.stream_shutdown()
        try:
            self.server.shutdown()
            self.server.server_close()
        except Exception:
            pass

    def stream_shutdown(self):
        with _STREAM_LOCK:
            for stream in list(_ACTIVE_STREAMS):
                try:
                    stream.stop()
                except Exception:
                    pass
            _ACTIVE_STREAMS.clear()


def main():
    try:
        gateway = Gateway()
    except PortUnavailable as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Failed to start gateway: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1

    try:
        gateway.serve_forever()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received.")
        gateway.shutdown()
    except Exception as exc:
        logger.error("Server exception: %s", exc, exc_info=True)
        gateway.shutdown()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())