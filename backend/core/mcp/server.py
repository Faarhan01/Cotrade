"""
MCP Server
==========

JSON-RPC 2.0 dispatcher for the Model Context Protocol, served on
`POST /mcp`.

The protocol layer lives here and nowhere else. It knows about JSON-RPC
envelopes, method dispatch and MCP method names; it does not know what
MetaTrader 5 is. Every call is forwarded to a handler from `tools.py`.

Supported methods:

    initialize                     handshake / capability negotiation
    notifications/initialized      client acknowledgement (no response)
    tools/list                     tool catalogue
    tools/call                     invoke one tool
    resources/list                 read-only resources
    resources/read                 read one resource
    prompts/list                   prompt templates
    prompts/get                    render one prompt
    ping                           keepalive

Batch requests (a JSON array) are supported, per JSON-RPC 2.0.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from .prompts import build_prompts
from .resources import build_resources
from .tools import build_tools

logger = logging.getLogger("mt5pkg.mcp")

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "cotrade"
SERVER_VERSION = "1.0.0"

# JSON-RPC 2.0 reserved error codes.
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603


def _ok(request_id: Any, result: Any) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _err(request_id: Any, code: int, message: str, data: Any = None) -> Dict[str, Any]:
    error: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"jsonrpc": "2.0", "id": request_id, "error": error}


class MCPServer:
    """Holds the tool/resource/prompt catalogue and dispatches JSON-RPC calls."""

    def __init__(self, engine, container=None, base: Optional[str] = None, runtime=None):
        self.engine = engine
        self.container = container
        self.base = base
        self._tools = build_tools(engine, container, runtime)
        self._resources = build_resources(engine, container, base)
        self._prompts = build_prompts()

    # ── catalogue views (handler-free, for tools/list etc.) ─────────────────
    def tool_catalogue(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": spec["name"],
                "description": spec["description"],
                "inputSchema": spec["inputSchema"],
            }
            for spec in self._tools.values()
        ]

    def resource_catalogue(self) -> List[Dict[str, Any]]:
        return [
            {"uri": spec["uri"], "name": spec["name"], "description": spec["description"],
             "mimeType": spec.get("mimeType", "application/json")}
            for spec in self._resources.values()
        ]

    def prompt_catalogue(self) -> List[Dict[str, Any]]:
        return [
            {"name": spec["name"], "description": spec["description"],
             "arguments": spec.get("arguments", [])}
            for spec in self._prompts.values()
        ]

    # ── dispatch ────────────────────────────────────────────────────────────
    def handle(self, payload: Any) -> Any:
        """Handle one JSON-RPC request, or a batch of them."""
        if isinstance(payload, list):
            if not payload:
                return _err(None, INVALID_REQUEST, "Empty batch")
            return [r for r in (self.handle(item) for item in payload) if r is not None]
        if not isinstance(payload, dict):
            return _err(None, INVALID_REQUEST, "Request must be a JSON object")
        return self._handle_one(payload)

    def _handle_one(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        request_id = payload.get("id")
        method = payload.get("method")
        params = payload.get("params") or {}

        # Notifications carry no id and expect no response.
        is_notification = "id" not in payload

        if not isinstance(method, str) or not method:
            return None if is_notification else _err(request_id, INVALID_REQUEST, "Missing method")

        try:
            handler = getattr(self, f"_rpc_{method.replace('/', '_')}", None)
            if handler is None:
                return None if is_notification else _err(
                    request_id, METHOD_NOT_FOUND, f"Unknown method: {method}")
            result = handler(params)
            return None if is_notification else _ok(request_id, result)
        except ValueError as exc:
            return None if is_notification else _err(request_id, INVALID_PARAMS, str(exc))
        except Exception as exc:  # noqa: BLE001 - protocol boundary
            logger.exception("MCP method %s failed", method)
            return None if is_notification else _err(request_id, INTERNAL_ERROR, str(exc))

    # ── MCP methods ─────────────────────────────────────────────────────────
    def _rpc_initialize(self, params):
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {
                "tools": {"listChanged": False},
                "resources": {"subscribe": False, "listChanged": False},
                "prompts": {"listChanged": False},
            },
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        }

    def _rpc_notifications_initialized(self, params):
        return {}

    def _rpc_ping(self, params):
        return {}

    def _rpc_tools_list(self, params):
        return {"tools": self.tool_catalogue()}

    def _rpc_tools_call(self, params):
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not name:
            raise ValueError("tools/call requires 'name'")
        spec = self._tools.get(name)
        if spec is None:
            return {
                "isError": True,
                "content": [{"type": "text", "text": f"Unknown tool: {name}"}],
            }
        try:
            payload = spec["handler"](**arguments)
        except TypeError as exc:
            # Argument mismatch: report the signature back so the agent can retry.
            return {
                "isError": True,
                "content": [{"type": "text",
                             "text": f"Invalid arguments for {name}: {exc}"}],
            }
        except Exception as exc:  # noqa: BLE001
            logger.exception("MCP tool %s failed", name)
            return {"isError": True, "content": [{"type": "text", "text": str(exc)}]}
        return _as_tool_result(name, payload)

    def _rpc_resources_list(self, params):
        return {"resources": self.resource_catalogue()}

    def _rpc_resources_read(self, params):
        uri = params.get("uri")
        if not uri:
            raise ValueError("resources/read requires 'uri'")
        spec = self._resources.get(uri)
        if spec is None:
            raise ValueError(f"Unknown resource: {uri}")
        body = spec["read"]()
        return {"contents": [{"uri": uri, "mimeType": spec.get("mimeType", "application/json"),
                              "text": json.dumps(body, indent=2, default=str)}]}

    def _rpc_prompts_list(self, params):
        return {"prompts": self.prompt_catalogue()}

    def _rpc_prompts_get(self, params):
        name = params.get("name")
        arguments = params.get("arguments") or {}
        spec = self._prompts.get(name)
        if spec is None:
            raise ValueError(f"Unknown prompt: {name}")
        text = spec["render"](arguments)
        return {
            "description": spec["description"],
            "messages": [{"role": "user", "content": {"type": "text", "text": text}}],
        }


def _as_tool_result(name: str, payload: Any) -> Dict[str, Any]:
    """Wrap a handler return value in MCP's content envelope."""
    if isinstance(payload, dict) and payload.get("error") and len(payload) <= 3:
        return {"isError": True,
                "content": [{"type": "text", "text": payload.get("error", "unknown error")}]}
    return {
        "isError": False,
        "content": [{"type": "text", "text": json.dumps(payload, indent=2, default=str)}],
        "structuredContent": payload if isinstance(payload, dict) else {"result": payload},
    }


class _NullContainer:
    """Placeholder used when the composition root is unavailable."""

    config = None
    engine = None
    market_data = None
    account = None
    trading = None
    connection = None
    strategy_repo = None
    report_repo = None
    pattern_hit_repo = None
    backtest = None
    pattern_scan = None
    validation = None
    sizing = None