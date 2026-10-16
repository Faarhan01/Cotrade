# AI Agent & Automation Readiness

## Overview
Cotrade is designed from the ground up to be easily consumable by AI agents, automated trading systems, and algorithmic workflows. Its architecture emphasizes machine-readable interfaces, real-time data flows, and minimal integration friction.

## Key Features for AI Agents

### 1. Machine-First API Design
- **JSON REST API**: All endpoints return structured JSON, easily parsed by any programming language
- **Consistent Naming**: Resource-oriented endpoint structure (`/account`, `/positions`, `/order`)
- **Discoverable Endpoints**: `/routes` returns complete API map for dynamic client generation
- **Standard HTTP Methods**: GET for queries, POST for actions, PUT/PATCH for updates, DELETE for removals
- **Query Parameters**: Filtering, sorting, and pagination where applicable

### 2. Real-Time Data Streaming
- **Server-Sent Events (SSE)**: Efficient, browser-compatible real-time data push
  - `/stream/ticks`: Live price movements for subscribed symbols
  - `/stream/marketbook`: Level-2 depth of market updates
  - `/stream/portfolio`: Account balance, margin, and open positions
- **Low Latency**: Sub-second updates from MT5 terminal to client
- **Bandwidth Efficient**: Only sends data when it changes (no polling overhead)

### 3. Deterministic Behavior
- **No Fake Data**: All data originates from the real MT5 terminal
- **Honest Statistics**: Strategy evaluations use t-statistics, not just profit
- **Time Synchronization**: All timestamps provided in broker time with published offset
- **Case Preservation**: MT5 symbol names used exactly as provided by the broker
- **Atomic Operations**: Critical operations (like order placement) are indivisible

### 4. Error Handling & Diagnostics
- **Standardized Errors**: Consistent error response structure across endpoints
- **Detailed Messages**: Human-readable descriptions with machine-readable codes
- **MT5 Integration Errors**: Original MT5 return codes preserved for advanced debugging
- **Health Checks**: `/health` endpoint for rapid system status verification
- **Logging**: Comprehensive request/response logging available for troubleshooting

### 5. Workflow Support
Typical AI agent interaction patterns are streamlined:
```
1. System Check   → GET /health
2. Market Data    → GET /stream/ticks (SSE) or GET /symbols
3. Analysis       → Local computation or POST /research/* for indicators/patterns
4. Strategy Test  → POST /research/backtest or POST /research/sweep
5. Deployment     → POST /bot/sessions (create bot)
6. Control        → PATCH /bot/sessions/{id} (pause/resume/stop)
7. Monitoring     → GET /bot/sessions/{id} or GET /stream/portfolio (SSE)
8. Feedback Loop  → Update strategy based on performance metrics
```

### 6. Language & Platform Agnostic
- **HTTP/JSON**: Works with any language that can make HTTP requests and parse JSON
- **SSE Support**: Native browser support, libraries available for Python, JavaScript, Java, etc.
- **No Special Dependencies**: No proprietary SDKs or language-specific bindings required
- **Firewall Friendly**: Standard HTTP/HTTPS ports (configurable)
- **Proxy Compatible**: Works through standard HTTP proxies

## Integration Patterns

### For Python-Based Agents
```python
import requests
import json

# Health check
health = requests.get("http://localhost:8890/health").json()
if not health["mt5_connected"]:
    raise Exception("MT5 not connected")

# Get live data stream (using requests for SSE)
with requests.get("http://localhost:8890/stream/ticks?symbol=EURUSD", stream=True) as resp:
    for line in resp.iter_lines():
        if line:
            tick = json.loads(line)
            # Process tick data
            signal = my_strategy(tick)
            if signal == "BUY":
                # Place order
                order_data = {
                    "symbol": "EURUSD",
                    "action": "buy",
                    "volume": 0.1,
                    "type": "market"
                }
                requests.post("http://localhost:8890/order", json=order_data)
```

### For JavaScript/Browser-Based Agents
```javascript
// Connect to live tick stream
const eventSource = new EventSource("http://localhost:8890/stream/ticks?symbol=EURUSD");

eventSource.onmessage = function(event) {
    const tick = JSON.parse(event.data);
    const signal = myStrategy(tick);
    
    if (signal === "BUY") {
        fetch("http://localhost:8890/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                symbol: "EURUSD",
                action: "buy",
                volume: 0.1,
                type: "market"
            })
        });
    }
};

// Handle connection errors
eventSource.onerror = function(err) {
    console.error("Stream error:", err);
};
```

### For REST-Only Interactions
```python
import time
import requests

def get_latest_tick(symbol):
    response = requests.get(f"http://localhost:8890/tick/{symbol}")
    return response.json()

# Simple trading loop
while True:
    tick = get_latest_tick("EURUSD")
    signal = evaluate_strategy(tick)
    
    if signal == "BUY" and not has_open_position():
        requests.post("http://localhost:8890/order", json={
            "symbol": "EURUSD",
            "action": "buy",
            "volume": 0.1,
            "type": "market"
        })
    
    time.sleep(1)  # Adjust based on strategy timeframe
```

## Operational Advantages

### 1. Zero-Configuration Deployment
- **Single Process**: Daemon handles HTTP server, MT5 connection, and real-time streams
- **Environment Variables**: All configuration via standard environment variables
- **No External Services**: No databases, message queues, or caching layers required beyond SQLite
- **Self-Contained**: All necessary components in one deployable unit

### 2. Observability & Debugging
- **Structured Logging**: JSON-compatible log output for log aggregation systems
- **Performance Metrics**: Endpoint latency and error rates available
- **Request Tracing**: Correlation IDs for tracking requests across layers (planned)
- **Health Endpoints**: Rapid identification of system issues

### 3. Security & Safety
- **Localhost-First**: Designed to run on localhost or trusted networks
- **Network Isolation**: Can be bound to specific interfaces or firewalled
- **Read-Only Mode**: Operations can be restricted to data queries only
- **Rate Limiting**: Configurable request limits to prevent abuse
- **Input Validation**: Strict validation on all incoming data

### 4. Scalability Characteristics
- **Vertical Scaling**: Single instance handles substantial workload (limited by MT5 terminal capacity)
- **Horizontal Federation**: Multiple independent instances for different symbols/strategies
- **Stateless Workers**: HTTP workers don't store session state between requests
- **Efficient Resource Use**: Minimal memory footprint, CPU usage proportional to market activity

## Extensibility for AI Workflows

### Custom Indicator Integration
While the knowledgebase provides 25+ indicators, AI agents can:
1. Compute custom indicators locally from streamed tick data
2. Use the research API for complex multi-timeframe analysis
3. Export data for external model training and import back signals

### Strategy Evolution
- **Template System**: Predefined strategy structures for rapid iteration
- **Parameter Sweeping**: Automated optimization via `/research/sweep`
- **Version Control**: Strategy history and snapshots for reproducibility
- **A/B Testing**: Run multiple strategy versions concurrently in bot sessions

### Risk Management Integration
- **Pre-Trade Checks**: Agents can implement custom validation before order submission
- **Position Limits**: Enforce maximum exposure per symbol or portfolio
- **Stop-Loss Automation**: Automatically attach SL/TP to new positions
- **Margin Monitoring**: Real-time alerts for margin maintenance requirements

## Production Considerations

### Reliability
- **Connection Resilience**: Automatic recovery from temporary MT5 terminal disconnections
- **Data Integrity**: WAL-mode SQLite with foreign key constraints and integrity checks
- **Graceful Degradation**: Non-critical features fail without affecting core trading
- **Backup & Recovery**: Simple file-based database backup/restore

### Monitoring
- **Health Endpoints**: System and component health checks
- **Metrics Export**: Prometheus-compatible metrics endpoint (planned)
- **Alerting**: Integration with monitoring systems via webhook or log analysis
- **Audit Trails**: Complete logs of all trading operations and strategy changes

### Safety Mechanisms
- **Dry-Run Mode**: Test strategies without real market exposure
- **Position Validation**: Verify order parameters against symbol constraints
- **Emergency Stop**: Single endpoint to cancel all orders and close positions
- **Permission Tiers**: Different API keys for trading vs. data-only access (planned)

## Getting Started for AI Developers

### 1. Verify Installation
```bash
# Check if system is running
curl http://localhost:8890/health
# Should return: {"status":"ok","mt5_connected":true,...}
```

### 2. Explore the API
```bash
# Get complete route listing
curl http://localhost:8890/routes
# Returns JSON array of all available endpoints with methods
```

### 3. Subscribe to Live Data
```bash
# In one terminal, listen to EURUSD ticks
curl -N http://localhost:8890/stream/ticks?symbol=EURUSD
# In another, place a market order
curl -X POST http://localhost:8890/order \
  -H "Content-Type: application/json" \
  -d '{"symbol":"EURUSD","action":"buy","volume":0.1,"type":"market"}'
```

### 4. Test a Strategy
```bash
# Validate a strategy definition
curl -X POST http://localhost:8890/research/strategy/validate \
  -H "Content-Type: application/json" \
  -d '{"strategy_name":"ma_cross","parameters":{"fast":10,"slow":20}}'

# Run a backtest
curl -X POST http://localhost:8890/research/backtest \
  -H "Content-Type: application/json" \
  -d '{
      "strategy":{"name":"ma_cross","parameters":{"fast":10,"slow":20}},
      "symbol":"EURUSD",
      "timeframe":"H1",
      "count":500
    }'
```

## Conclusion
Cotrade provides a production-ready foundation for AI-driven trading systems. Its combination of real-time data, deterministic behavior, machine-friendly APIs, and operational robustness makes it ideal for everything from simple rule-based agents to complex reinforcement learning systems. The zero-maintenance MT5 integration ensures that AI agents always work with the true market data as seen by the MT5 terminal, eliminating concerns about data fidelity or simulation accuracy.