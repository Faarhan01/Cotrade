# MetaTrader 5 Integration

## Overview
Cotrade integrates with the MetaTrader 5 trading platform through the official `MetaTrader5` Python package. This integration provides direct access to MT5 functionality while maintaining a clean abstraction layer.

## Key Features

### Complete API Coverage
- **100% Function Wrapping**: All 35 public functions in the MetaTrader5 package are automatically wrapped and exposed
- **Zero Maintenance**: Adding new MT5 functions requires **zero code changes** - the API manager dynamically discovers and wraps functions at runtime
- **Future-Proof**: Functions removed from future MT5 versions are gracefully handled with clear error messages

### Architecture Layers
```
User/Agent → HTTP API → Server Layer → Cony (MT5 Engine) → MetaTrader5 Package → MT5 Terminal
```

### MT5 Engine (`cony.mt5_engine.MT5Engine`)
The high-level MT5 engine provides:
- **Connection Management**: Automatic connection/reconnection handling
- **Symbol Resolution**: Case-insensitive symbol lookup with broker-specific spelling
- **Error Handling**: Consistent translation of MT5 return codes to user-friendly exceptions
- **Data Serialization**: Automatic conversion of MT5 namedtuples/lists to plain JSON-serializable dicts
- **Market Book Support**: Full Level-2 depth of market via subscribe/get/unsubscribe
- **Trading Operations**: Order execution, position modification, cancellation
- **Account & Terminal Info**: Balance, margin, trade permission queries
- **Historical Data**: Candles, ticks, deals, orders with flexible querying
- **Utility Functions**: Margin/profit calculations, symbol properties

### Abstraction Benefits
1. **Transport Agnostic**: Same engine works for HTTP API, direct Python usage, or testing
2. **No HTTP Leakage**: Engine layer knows nothing about HTTP, JSON, or web concerns
3. **Testable**: Easy to mock or substitute for unit tests
4. **Performant**: Thin wrappers with minimal overhead - direct calls to MT5 package
5. **Reliable**: Preserves all MT5 behavior and return codes for accurate backtesting

### Data Flow
```
MT5 Package Function
      ↓
[Connection Check] → [Symbol Resolution] → [Raw MT5 Call] → [Result Serialization] → [Return Code Translation] → Plain Dict Response
```

### Backtest Fidelity
Because the wrappers forward directly to the real MT5 package:
- Historical data (`copy_rates_from*`, `copy_ticks_from*`) is identical to what MT5 provides
- Technical indicator calculations match MT5's built-in indicators
- Strategy backtests produce bit-for-bit identical results to running in MT5 Strategy Tester
- No intermediate translation layer corrupts numerical precision or timing

### Error Handling
- MT5 return codes are translated to meaningful exception types:
  - `MT5ConnectionError`: Terminal not connected
  - `SymbolNotFoundError`: Broker doesn't expose the symbol
  - `NotFoundError`: Position/order ticket doesn't exist
  - `InvalidRequestError`: Invalid parameters
  - `OrderRejectedError`: Broker rejected the order
- All exceptions include the original MT5 return code and description for debugging

### Usage Examples
```python
# Direct Python usage
from cony import ConnectionManager, MT5Engine

conn = ConnectionManager()
conn.connect()
engine = MT5Engine(conn)

# Get account info
account = engine.get_account_info()
print(f"Balance: {account['balance']}")

# Get latest tick
tick = engine.get_tick("EURUSD")
print(f"EURUSD bid: {tick['bid']}, ask: {tick['ask']}")

# Execute a market order
request = {
    "action": mt5.TRADE_ACTION_DEAL,
    "symbol": "EURUSD",
    "volume": 0.1,
    "type": mt5.ORDER_TYPE_BUY,
    "price": mt5.symbol_info_tick("EURUSD").ask,
    "deviation": 10,
    "magic": 123456,
    "comment": "python script",
    "type_time": mt5.ORDER_TIME_GTC,
    "type_filling": mt5.ORDER_FILLING_RETURN,
}
result = engine.execute_order(request)
```

### HTTP API Exposure
All MT5 functionality is available via REST endpoints:
- `GET /account` → Account information
- `GET /tick/{symbol}` → Latest tick data
- `POST /order` → Execute trades (supports all order types)
- `GET /positions` → Open positions
- `GET /history_deals` → Historical deals
- `POST /calc/margin` → Margin calculation
- And all other MT5 functions via appropriately named endpoints

## Reliability Features
- **Automatic Reconnection**: Configurable auto-reconnect on connection loss
- **Symbol Caching**: Reduces overhead of frequent symbol lookups
- **Market Book Management**: Automatic subscription cleanup on disconnect
- **Thread Safety**: Safe for use in multi-threaded environments
- **Connection Validation**: Operations automatically verify connection state

## Zero Maintenance Guarantee
The integration is designed to require **zero code changes** when:
- New versions of the MetaTrader5 package are released
- Functions are added to or removed from the MT5 API
- The underlying MT5 terminal protocol evolves
Only the official MetaTrader5 Python package needs to be updated; the Cotrade gateway adapts automatically.