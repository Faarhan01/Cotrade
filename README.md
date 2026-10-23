# MT5 AI Copilot & MCP Bridge Terminal.

An open-source, full-stack bridge and real-time operational terminal connecting **MetaTrader 5 (MT5)** to **External AI Models** (such as Claude Desktop, Cursor, OpenAI Agents, Gemini, or custom Python agents) via the **Model Context Protocol (MCP)**, REST APIs, and low-latency **WebSockets**.

Designed for **real account & broker execution** without synthetic or fake simulated trades.

---

## 🏛️ System Architecture

```
┌─────────────────────────────────┐                 ┌────────────────────────────────┐
│      External AI Agent          │                 │     Manual User Terminal       │
│  (Claude, Cursor, Python, etc.) │                 │  (React + Tailwind Dashboard)  │
└────────────────┬────────────────┘                 └───────────────┬────────────────┘
                 │                                                  │
                 │ JSON-RPC 2.0 / SSE                               │ REST & WebSocket
                 ▼                                                  ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                    Node.js & Express Bridge Server (Port 3000)                     │
│                                                                                    │
│  • MCP Server (/api/mcp, /api/mcp/sse)    • WebSocket Broadcaster (/ws)            │
│  • Async Order Queue & Dispatcher         • Dynamic Risk Guard & Trailing Engine   │
│  • Persistent SQLite Database (data/mt5_bridge.sqlite via WASM SQL)                │
└────────────────────────────────────────┬───────────────────────────────────────────┘
                                         │
                                         │ High-Frequency WebRequest Polling (500ms)
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                   Dedicated MT5 Bridge Tunnel (http://127.0.0.1:7777)              │
│                     Endpoints: /sync  |  /tick  |  /result  |  /health             │
└────────────────────────────────────────┬───────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                     MetaTrader 5 Expert Advisor (MQL5)                             │
│                           AIMT5Bridge.mq5                                          │
│                                                                                    │
│  • Broker Filling Auto-Detection (IOC / FOK / RETURN)                              │
│  • Lot Size & Digits Normalization       • Active Chart Symbol Inspection          │
│  • OrderSend Execution & Ticket Return   • Real-Time Market Watch Ticks            │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

- **No Fake / Simulated Data**: Initialized with clean states. All ticks, chart trajectories, and positions are populated exclusively from your live MT5 broker.
- **Model Context Protocol (MCP)**: Native support for both standard HTTP JSON-RPC 2.0 (`/api/mcp`) and Server-Sent Events (`/api/mcp/sse`), enabling any external AI agent to inspect market conditions, execute orders, and modify positions.
- **Dual-Listener Network**:
  - `http://localhost:3000`: Web UI, WebSocket server, REST API, and MCP endpoints.
  - `http://127.0.0.1:7777`: Dedicated local tunnel for MT5 `WebRequest` (bypassing localhost restrictions).
- **Asynchronous Execution Pipeline**: Every order moves through a monitored state machine (`pending` → `dispatched` → `executed` / `failed`), returning deal tickets and broker latency in milliseconds.
- **Connected Chart Symbol Section**: Automatically detects the exact symbol and timeframe the EA is running on (e.g., `EURUSD M1`), complete with broker contract specifications, min/max lot limits, and live spreads.
- **All Tracked Symbols Matrix**: Live table displaying real-time quotes, lot step constraints, and trading permissions for all symbols transmitted by the EA.
- **Embedded SQLite Database (`data/mt5_bridge.sqlite`)**: Persistent storage for orders, execution logs, account history, and risk settings with 1-click database binary downloads.
- **Risk Guard & Trailing Stop Engine**: Global portfolio Take Profit ($), Stop Loss ($), maximum position caps, margin call cutoff protection, and emergency kill switch.

---

## 🛠️ Prerequisites

1. **Node.js** (v18.0.0 or higher) and **npm**
2. **MetaTrader 5 Desktop Terminal** (Windows, or via Wine/CrossOver on macOS/Linux)
3. Any MT5 broker account (Demo or Live)

---

## 🚀 Local Installation & Setup

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/mt5-ai-copilot-mcp.git
cd mt5-ai-copilot-mcp

# Install dependencies
npm install
```

### 2. Start the Local Bridge & Web Terminal

```bash
npm run dev
```

The application will start:
- **Web Terminal & MCP Hub**: `http://localhost:3000`
- **MT5 Dedicated Listener**: `http://127.0.0.1:7777`
- **WebSocket Feed**: `ws://localhost:3000/ws`

---

## 📈 MetaTrader 5 Expert Advisor Setup

### 1. Whitelist Bridge URL in MT5 (**CRITICAL**)
Because MT5 restricts outbound network connections by default, you must whitelist the local tunnel:
1. In MetaTrader 5, press `Ctrl + O` or go to **Tools → Options**.
2. Select the **Expert Advisors** tab.
3. Check **"Allow WebRequest for listed URL"**.
4. Click the green `+` icon and add:
   ```text
   http://127.0.0.1:7777
   ```
5. *(Optional fallback)* Add `http://127.0.0.1:3000`.
6. Ensure **"Allow Algo Trading"** is checked.
7. Click **OK**.

### 2. Install the Expert Advisor
1. In MetaTrader 5, go to **File → Open Data Folder**.
2. Open `MQL5` → `Experts`.
3. Copy `backend/ea/AIMT5Bridge.mq5` into this folder (or download it from the **MT5 EA Setup** tab in the web UI).
4. Return to MT5, press `Ctrl + N` to open the **Navigator** panel.
5. Right-click on **Expert Advisors** and click **Refresh**.
6. Drag `AIMT5Bridge` onto any chart (e.g., `EURUSD` or `XAUUSD`).

### 3. Verify EA Inputs
In the EA properties dialog:
- **InpBridgeUrl**: `http://127.0.0.1:7777`
- **InpApiKey**: `mt5_bridge_secret_key`
- **InpTimerIntervalMs**: `500` (500ms sync loop)
- **InpMagicNumber**: `889900`
- **InpSymbolsToTrack**: `EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD`

Ensure the **"Algo Trading"** button in MT5's top toolbar is **Green**. You will see:
```text
SUCCESS: Connected to AI MT5 Bridge at http://127.0.0.1:7777 (HTTP 200)
```
in the MT5 **Experts** log, and the web interface will instantly turn green with **"MT5 EA Live & Running"**.

---

## 🤖 Connecting External AI via MCP

### A. Claude Desktop
Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mt5-bridge": {
      "url": "http://127.0.0.1:3000/api/mcp/sse"
    }
  }
}
```

### B. Cursor IDE
In Cursor **Settings → Features → MCP**, add a new server:
- **Name**: `mt5-bridge`
- **Type**: `sse`
- **URL**: `http://127.0.0.1:3000/api/mcp/sse`

### C. Python AI Agent (HTTP JSON-RPC 2.0)

```python
import requests

MCP_ENDPOINT = "http://127.0.0.1:3000/api/mcp"

def call_mt5_tool(tool_name: str, arguments: dict):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }
    res = requests.post(MCP_ENDPOINT, json=payload)
    return res.json()["result"]

# 1. Inspect live account equity & balance
account = call_mt5_tool("mt5_get_account_info", {})
print("Account Status:", account)

# 2. Get current active chart symbol & market spread
chart = call_mt5_tool("mt5_get_current_chart", {})
print("Active Chart:", chart)

# 3. Execute an AI-directed order
order = call_mt5_tool("mt5_execute_trade", {
    "symbol": "EURUSD",
    "orderType": "BUY",
    "volume": 0.1,
    "sl": 1.0820,
    "tp": 1.0920,
    "comment": "PYTHON_AI_COPILOT"
})
print("Order Queued:", order)
```

---

## 🧰 Available MCP Tools (21 Comprehensive Tools)

| Tool Name | Description |
| :--- | :--- |
| `mt5_get_account_info` | Retrieves balance, equity, margin, free margin, margin level %, currency, and floating PnL. |
| `mt5_get_current_chart` | Returns the active symbol and timeframe the EA is running on, along with broker specifications and session aggregates. |
| `mt5_get_all_symbols` | Returns quotes, spreads, session range, and broker lot rules for all symbols tracked by the EA. |
| `mt5_get_market_data` | Live bid, ask, spread, volume, and 24h high/low for tracked symbols. |
| `mt5_get_open_positions` | Open tickets, volume, open price, SL, TP, floating profit, and magic numbers. |
| `mt5_execute_trade` | Asynchronously dispatches `BUY`, `SELL`, `BUY_LIMIT`, `SELL_LIMIT`, `BUY_STOP`, `SELL_STOP` orders. |
| `mt5_modify_position` | Adjusts Stop Loss and Take Profit levels for an open position ticket. |
| `mt5_close_position` | Closes full or partial lot volume for a specific ticket. |
| `mt5_close_all` | Liquidates all open positions or all positions for a specific symbol. |
| `mt5_get_pending_orders` | Retrieves all active pending limit & stop orders in MT5. |
| `mt5_cancel_pending_order` | Cancels an active pending order ticket in MT5. |
| `mt5_get_chart_history` | Returns multi-timeframe OHLCV candles (M1, M5, M15, H1, H4, D1) with precomputed technical indicators. |
| `mt5_get_technical_indicators` | Precalculated RSI(14), EMA(9, 21, 50, 200), SMA(20, 50), MACD(12,26,9), Bollinger Bands, ATR(14), and consensus summary. |
| `mt5_request_chart_history` | Triggers an on-demand historical candle pull from MT5 for any symbol and timeframe. |
| `mt5_get_tick_history` | Retrieves persisted sub-second tick stream data from SQLite database. |
| `mt5_get_account_history` | Queries historical equity & balance snapshots persisted over time. |
| `mt5_query_trade_history` | Queries historical trade orders from the persistent SQLite database. |
| `mt5_get_performance_analytics` | Retrieves execution success rate, order counts, and database storage metrics. |
| `mt5_configure_risk_guard` | Granularly updates global dollar TP/SL, max lot sizes, and trailing stop distance. |
| `mt5_get_execution_queue` | Inspects in-flight commands (`pending` → `dispatched` → `executed` / `failed`). |
| `mt5_simulate_candles` | Seeds synthetic historical OHLCV data & indicators for instant testing and backtesting without waiting for live ticks. |

---

## 🌐 REST Endpoints

- `GET /api/state` - Complete real-time snapshot of connection, account, positions, ticks, orders, and chart
- `POST /api/commands` - Enqueue an order for execution in MT5 (`EXECUTE_TRADE`, `MODIFY_POSITION`, `CLOSE_POSITION`, `CLOSE_ALL`, `CANCEL_PENDING`)
- `GET /api/database/candles` - Query stored candles by symbol (`?symbol=EURUSD&timeframe=M1&limit=100`)
- `GET /api/database/ticks` - Query stored ticks by symbol (`?symbol=EURUSD&limit=100`)
- `GET /api/database/account-history` - Query stored equity/balance snapshots (`?limit=50`)
- `GET /api/database/orders` - Query order execution audit history
- `POST /api/candles/simulate` - Seed synthetic candles and indicators for testing
- `POST /api/candles/request` - Request EA to pull historical bars for a symbol and timeframe
- `GET /api/mcp/tools` - List all 21 MCP tool schemas
- `POST /api/mcp` - JSON-RPC 2.0 direct MCP tool execution
- `GET /api/mcp/sse` - Server-Sent Events transport for Claude Desktop / Cursor
- `POST /sync` / `POST /api/mt5/sync` - High-frequency MT5 EA synchronization loop (500ms)

---

## 🗄️ Database & Storage

The bridge uses an embedded, zero-configuration **SQLite WASM** database stored at:
```text
data/mt5_bridge.sqlite
```
- **Tables**: `orders`, `positions_history`, `account_history`, `symbol_ticks`, `risk_settings`, `audit_logs`.
- **Export**: Download the SQLite binary directly through the **Database & SQLite** tab or via `GET /api/database/download`.

---

## ❓ Troubleshooting

### 1. MT5 WebRequest Error 4060 (`ERR_FUNCTION_NOT_ALLOWED`)
- You forgot to add `http://127.0.0.1:7777` to MT5's allowed URL list.
- Open **Tools → Options → Expert Advisors**, check **"Allow WebRequest for listed URL"**, and add `http://127.0.0.1:7777`.

### 2. Trade Execution Error 4756 (`TRADE_RETCODE_AUTO_TRADING_DISABLED`)
- The **"Algo Trading"** button in MT5's top toolbar is disabled (Red). Click it to turn it **Green**.
- Also check **"Allow Algo Trading"** in the EA's Common properties tab.

### 3. Trade Order Error 10030 (`TRADE_RETCODE_UNSUPPORTED_FILLING_MODE`)
- The EA automatically detects and handles broker filling modes (`IOC`, `FOK`, `RETURN`). Ensure you are using the latest `AIMT5Bridge.mq5`.

---

## 📄 License

MIT License. Free for personal, algorithmic, and commercial trading integration.
