"""
server — HTTP API Layer
=========================
URL routing, request handlers, validation and HTTP error types for the
MetaTrader 5 gateway.

Imports mt5_pkg_bridge as its engine, so this layer never touches the MetaTrader5
package directly and can be swapped for a different transport without
changing anything below it.
"""
from core.server.handlers import RouteHandlers
from core.server.routes import Router
from services.error_handlers.errors import (
    BadRequest,
    Conflict,
    HTTPError,
    NotFound,
    PayloadTooLarge,
    UpstreamUnavailable,
)

__all__ = [
    "Router",
    "RouteHandlers",
    "HTTPError",
    "BadRequest",
    "NotFound",
    "Conflict",
    "UpstreamUnavailable",
    "PayloadTooLarge",
]
