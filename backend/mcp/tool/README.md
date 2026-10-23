# MCP Tool — Direct AI & Terminal Interface

This folder provides universal utilities allowing **any outside AI agent** (Claude Desktop, Cursor IDE, Windsurf, Cline, Gemini CLI, custom Python/Bash agents) to directly interact with MetaTrader 5 via the Model Context Protocol (MCP) or command-line shortcuts.

---

## 🚀 1. Direct Stdio MCP Server (`stdio.js`)
Any MCP-compatible desktop host or agent can run this tool natively over standard input/output.

### Claude Desktop Configuration (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "mt5-bridge": {
      "command": "node",
      "args": ["backend/mcp/tool/stdio.js"]
    }
  }
}
```

### Cursor IDE Configuration (Settings → Features → MCP)
- **Type**: `command`
- **Command**: `node backend/mcp/tool/stdio.js`

---

## ⚡ 2. Instant AI CLI Shortcuts (`cli.js`)
An AI or terminal user can run high-level trading and market commands with no JSON boilerplate:

```bash
# 1. Inspect live account equity, balance & active chart
node backend/mcp/tool/cli.js status

# 2. Get real-time bid, ask, spread, and session range for any symbol
node backend/mcp/tool/cli.js quote EURUSD

# 3. List open MT5 positions
node backend/mcp/tool/cli.js positions

# 4. List pending orders (Limit & Stop orders)
node backend/mcp/tool/cli.js orders

# 5. Execute AI-directed BUY or SELL order with Stop Loss & Take Profit
node backend/mcp/tool/cli.js buy EURUSD 0.01 1.0820 1.0920 "AI_ENTRY"
node backend/mcp/tool/cli.js sell XAUUSD 0.05 2640.50 2615.00 "MOMENTUM_SHORT"

# 6. Close an open position ticket
node backend/mcp/tool/cli.js close 123456

# 7. Cancel a pending order ticket
node backend/mcp/tool/cli.js cancel 789101

# 8. Compute technical indicators (RSI, EMA, MACD, Bollinger, summary)
node backend/mcp/tool/cli.js indicators EURUSD M1

# 9. Fetch past OHLCV chart candles
node backend/mcp/tool/cli.js candles EURUSD M1 50

# 10. Purge 24-hour unexecuted orders & trim database
node backend/mcp/tool/cli.js prune
```

---

## 🛠️ 3. Standard MCP Protocol Invocation
You can still query tool definitions or run raw JSON-RPC:

```bash
# List all 21 MCP tool definitions
node backend/mcp/tool/cli.js list

# Call any tool by name with JSON payload
node backend/mcp/tool/cli.js call mt5_get_account_info '{}'
node backend/mcp/tool/cli.js call mt5_get_chart_history '{"symbol":"EURUSD","timeframe":"M1","limit":50}'

# Execute raw JSON-RPC method
node backend/mcp/tool/cli.js rpc tools/list '{}'
```

---

## 🧪 4. SSE Network Tests
- `node backend/mcp/tool/sse.js`: Minimal raw socket test connecting to `GET /api/mcp/sse`.
- `node backend/mcp/tool/sse-roundtrip.js`: Full Server-Sent Events round-trip testing session initialization and message handling.
