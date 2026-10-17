"""
MCP Extension
=============

Model Context Protocol surface for the Cotrade gateway.

An optional extension in the same shape as the research, bot and database
extensions: `register()` attaches `POST /mcp` to an existing router and
returns the number of routes added, so the caller can log the reason instead of
leaving an agent to interpret a 404.

Layering: this module speaks HTTP because it is registered on the router, but
the tool catalogue in `tools.py` has no transport knowledge — it calls the same
`MT5Engine` and `Research` objects the REST routes and the CLI use, so MCP and
the REST API cannot drift apart.

Usage from an agent:

    POST /mcp
    {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}

    POST /mcp
    {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
     "params": {"name": "get_portfolio", "arguments": {}}}
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from core.server import responses
from services.error_handlers.errors import BadRequest

from .server import MCPServer

logger = logging.getLogger("mt5pkg.mcp")

__all__ = ["register", "MCPServer"]

# A single JSON-RPC call should never be unbounded; MT5 calls can block on a
# slow terminal and a huge batch would tie up the request thread.
MAX_BODY_CHARS = 1_000_000


def register(router, engine, base: Optional[str] = None, container=None, runtime=None) -> int:
    """Attach ``POST /mcp`` to `router`. Returns the number of routes added."""
    before = len(router.list_routes())
    server = MCPServer(engine, container=container, base=base, runtime=runtime)

    @router.post("/mcp")
    def mcp_endpoint(params, query, body):
        payload = _coerce(body)
        result = server.handle(payload)
        if result is None:
            # Notification: nothing to send back.
            return {"ok": True}
        if isinstance(result, list) and not result:
            return {"ok": True}
        return responses.html(
            json.dumps(result, indent=2, default=str),
            headers={"Content-Type": "application/json; charset=utf-8"},
        )

    added = len(router.list_routes()) - before
    if added:
        logger.info("MCP enabled: POST /mcp (%d tools)", len(server.tool_catalogue()))
    return added


def _coerce(body):
    """
    Accept the request body as decoded, as raw text, or as a single JSON string.

    Clients differ: some send an object, some pre-serialise it. All three are
    accepted so the endpoint does not reject a well-formed request over a
    packaging difference.
    """
    if body is None:
        raise BadRequest(
            "POST /mcp expects a JSON-RPC 2.0 body, e.g. "
            '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}')
    if isinstance(body, (dict, list)):
        return body
    if isinstance(body, str):
        text = body.strip()
        if len(text) > MAX_BODY_CHARS:
            raise BadRequest("MCP request body is too large")
        try:
            return json.loads(text)
        except ValueError as exc:
            raise BadRequest(f"MCP body is not valid JSON: {exc}")
    raise BadRequest(f"Unsupported MCP body type: {type(body).__name__}")