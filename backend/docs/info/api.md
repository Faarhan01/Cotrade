# Cotrade API Overview

## REST API
The Cotrade gateway exposes a comprehensive JSON REST API for autonomous agents and applications.

### Endpoint Categories
- **Research** (`/research/*`): Strategy validation, backtesting, pattern scanning, indicators
- **Bot** (`/bot/*`): Bot session management, control, monitoring
- **Database** (`/database/*`, `/db/*`): Statistics, reports, integrity checks, maintenance
- **Market Data** (`/symbol/*`, `/symbols/*`): Instrument specifications and search
- **History** (`/history/*`): Deals, orders, totals
- **Calculations** (`/calc/*`): Position sizing, margin, profit calculators
- **Real-time Streams** (`/stream/*`): Server-Sent Events for ticks, market book, portfolio
- **MetaTrader 5** (`/order/*`, `/position/*`, etc.): Direct trading and account operations
- **Utilities** (`/health`, `/routes`, `/enums`): System information and discovery

### Key Features
- **JSON over HTTP**: Machine-readable interface for all operations
- **SSE Streams**: Real-time data feeds for live trading and monitoring
- **No Authentication**: Designed for localhost-only use (secure via network configuration)
- **Consistent Error Handling**: Standardized error responses across endpoints
- **Discoverable**: `/routes` endpoint lists all available endpoints
- **Health Check**: `/health` endpoint for system status verification

### Typical Workflow for AI Agents
1. Verify system readiness: `GET /health`
2. Retrieve account info: `GET /account`
3. Get latest market data: `GET /stream/ticks` (SSE) or `GET /tick/{symbol}`
4. Validate strategy: `POST /research/strategy/validate`
5. Run backtest: `POST /research/backtest`
6. Create bot session: `POST /bot/sessions`
7. Execute trade: `POST /order` with appropriate action
8. Monitor performance: `GET /bot/sessions/{id}` or `GET /stream/portfolio`

## Design Principles
- **Stateless**: Each request contains all necessary information
- **Discoverable**: Clients can explore available endpoints
- **Real-time Capable**: SSE streams for live data without polling
- **Error Transparent**: Clear error codes and messages for debugging
- **Extensible**: New features added as new endpoints without breaking changes

## Versioning
The API is versionless by design, with backward compatibility maintained through careful evolution.
Breaking changes are avoided; instead, new endpoints are added for new functionality.