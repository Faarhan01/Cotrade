import { tradeStore } from '../services/tradeStore.js';
import { commandDispatcher } from '../services/commandDispatcher.js';
import { tradingBot } from '../bot/index.js';
import { OrderType } from '../types/mt5.js';
import { normalizeSymbol } from '../utils/symbol.js';
import { normalizeTimeframe } from '../utils/timeframe.js';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'mt5_get_account_info',
    description: 'Retrieve real-time MetaTrader 5 account metrics including balance, equity, margin, free margin, margin level percentage, leverage, currency, and total floating profit.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_get_market_data',
    description: 'Get real-time live tick and price quote data for a symbol or all tracked symbols (bid, ask, spread, 24h high, 24h low).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD). Leave empty or specify "ALL" to get all quotes.',
        },
      },
    },
  },
  {
    name: 'mt5_get_open_positions',
    description: 'Retrieve all currently open trading positions in MetaTrader 5 including ticket ID, symbol, type (BUY/SELL), volume, open price, current market price, stop loss, take profit, floating profit, and magic number.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Filter positions by symbol (optional).',
        },
      },
    },
  },
  {
    name: 'mt5_execute_trade',
    description: 'Asynchronously dispatch a trade execution order (BUY or SELL) to MetaTrader 5. Returns a command ID for asynchronous status tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol to trade (e.g. EURUSD, XAUUSD, BTCUSD)',
        },
        orderType: {
          type: 'string',
          enum: ['BUY', 'SELL'],
          description: 'Order direction: BUY (long) or SELL (short)',
        },
        volume: {
          type: 'number',
          description: 'Volume in standard lots (e.g. 0.01, 0.1, 0.5, 1.0)',
        },
        sl: {
          type: 'number',
          description: 'Stop Loss absolute price (optional, 0 to disable)',
        },
        tp: {
          type: 'number',
          description: 'Take Profit absolute price (optional, 0 to disable)',
        },
        comment: {
          type: 'string',
          description: 'Custom comment or tag explaining AI trade rationale',
        },
        magic: {
          type: 'number',
          description: 'Magic number tag for the order (default: 889900)',
        },
      },
      required: ['symbol', 'orderType', 'volume'],
    },
  },
  {
    name: 'mt5_modify_position',
    description: 'Modify Stop Loss (SL) and Take Profit (TP) levels of an active MetaTrader 5 position ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket: {
          type: 'number',
          description: 'Unique ticket number of the open position to modify',
        },
        sl: {
          type: 'number',
          description: 'New Stop Loss absolute price level',
        },
        tp: {
          type: 'number',
          description: 'New Take Profit absolute price level',
        },
      },
      required: ['ticket'],
    },
  },
  {
    name: 'mt5_close_position',
    description: 'Close an open MetaTrader 5 position by ticket. Supports full close or partial lot closure.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket: {
          type: 'number',
          description: 'Unique ticket number of the open position to close',
        },
        volume: {
          type: 'number',
          description: 'Volume in lots to close. If omitted or 0, closes the entire position.',
        },
      },
      required: ['ticket'],
    },
  },
  {
    name: 'mt5_close_all',
    description: 'Emergency liquidation: Close all open positions immediately or all open positions for a designated symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol filter (e.g. "EURUSD"), or "ALL" to liquidate entire portfolio.',
        },
      },
    },
  },
  {
    name: 'mt5_configure_risk_guard',
    description: 'Update global risk parameters such as account-level take profit ($), stop loss ($), trailing stop distance, and maximum position caps.',
    inputSchema: {
      type: 'object',
      properties: {
        globalTakeProfitUSD: {
          type: 'number',
          description: 'Global portfolio floating profit target in USD (auto-closes all when reached). 0 to disable.',
        },
        globalStopLossUSD: {
          type: 'number',
          description: 'Global portfolio floating loss limit in USD (auto-liquidates when reached). 0 to disable.',
        },
        trailingStopEnabled: {
          type: 'boolean',
          description: 'Enable or disable the dynamic trailing stop engine',
        },
        trailingStopDistancePoints: {
          type: 'number',
          description: 'Trailing distance in broker points (e.g. 150 points = 15 pips)',
        },
        trailingStopStepPoints: {
          type: 'number',
          description: 'Trailing step in broker points (e.g. 30 points)',
        },
        maxLotSizePerTrade: {
          type: 'number',
          description: 'Maximum allowable lot size per individual trade order',
        },
        emergencyKillSwitch: {
          type: 'boolean',
          description: 'When true, halts all new trading and immediately liquidates open positions',
        },
      },
    },
  },
  {
    name: 'mt5_get_execution_queue',
    description: 'Inspect the status of asynchronous orders dispatched to MetaTrader 5 (pending, dispatched, executed, failed, execution latencies).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of recent queue commands to return (default 10)',
        },
      },
    },
  },
  {
    name: 'mt5_get_current_chart',
    description: 'Retrieve real-time details of the active chart and symbol that the MT5 EA is attached to (symbol, timeframe, spread, bid, ask, digits, contract size, min/max lot sizes).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_get_all_symbols',
    description: 'Retrieve all symbols that the MT5 EA is transmitting market quotes and broker specifications for.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_query_trade_history',
    description: 'Query historical trade orders from the persistent SQLite database, including order type, lots, execution prices, deal tickets, and broker latencies.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of historical trade orders to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'mt5_get_performance_analytics',
    description: 'Retrieve comprehensive performance analytics from the SQLite database: execution success rate, total orders, failed orders, and database metrics.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_get_chart_history',
    description: 'Retrieve real historical OHLCV candlestick data (open, high, low, close, volume, timestamps) with optional precomputed technical indicators (RSI, EMA, MACD, Bollinger Bands, ATR) for any symbol and timeframe (M1, M5, M15, H1, H4, D1).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, XAUUSD, BTCUSD). Defaults to active chart symbol.',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, M30, H1, H4, D1 (default: active chart period or M1)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of recent candles to return (default: 60, max: 500)',
        },
        includeIndicators: {
          type: 'boolean',
          description: 'Whether to include precomputed technical indicators (RSI, EMA, MACD, Bollinger, ATR) calculated on these candles (default: true)',
        },
      },
    },
  },
  {
    name: 'mt5_get_technical_indicators',
    description: 'Precomputed technical indicator suite for quantitative analysis: RSI (14), EMAs (9, 21, 50, 200), MACD (12,26,9), Bollinger Bands (20,2), ATR (14), and automated algorithmic market summary (STRONG_BUY, BUY, NEUTRAL, SELL, STRONG_SELL).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (default: active chart symbol)',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe (default: M1)',
        },
      },
    },
  },
  {
    name: 'mt5_get_pending_orders',
    description: 'Retrieve all active pending orders in MetaTrader 5 (BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP, BUY_STOP_LIMIT, SELL_STOP_LIMIT) including open prices, SL/TP, and order tickets.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Optional filter by symbol (e.g. EURUSD)',
        },
      },
    },
  },
  {
    name: 'mt5_cancel_pending_order',
    description: 'Cancel an active pending limit or stop order in MetaTrader 5 by ticket ID.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket: {
          type: 'number',
          description: 'Order ticket ID to cancel',
        },
      },
      required: ['ticket'],
    },
  },
  {
    name: 'mt5_request_chart_history',
    description: 'Trigger an on-demand historical candle pull from MetaTrader 5 for any symbol, timeframe (M1, M5, M15, H1, etc.), and count. The EA fetches CopyRates from MT5 and uploads to the database.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, GBPUSD, XAUUSD)',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, H1, H4, D1 (default: M1)',
        },
        count: {
          type: 'number',
          description: 'Number of historical candles to fetch from MT5 (e.g. 100, 250, 500)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'mt5_get_account_history',
    description: 'Retrieve persistent historical account snapshots (balance, equity, margin level %, floating profit) stored in SQLite across time.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum snapshots to return (default: 30)',
        },
      },
    },
  },
  {
    name: 'mt5_get_tick_history',
    description: 'Retrieve persisted historical tick stream data from SQLite with sub-second bids, asks, and spreads.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol filter (e.g. EURUSD), or ALL for all symbols',
        },
        limit: {
          type: 'number',
          description: 'Maximum ticks to return (default: 50)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_multi_timeframe',
    description: 'Perform comprehensive multi-timeframe consensus evaluation (e.g. M1 execution aligned with M5 and H1 trends). Evaluates EMA alignment, MACD momentum, RSI zones, and market regime concordance across multiple time horizons.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, GBPUSD, XAUUSD). Defaults to active chart symbol.',
        },
        primaryTimeframe: {
          type: 'string',
          description: 'Primary execution timeframe: M1, M5, M15, M30, H1 (default: M1)',
        },
        higherTimeframes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional higher timeframes to evaluate (e.g. ["M5", "H1"]). Defaults to standard cascading timeframes.',
        },
      },
    },
  },
  {
    name: 'mt5_list_strategies',
    description: 'List quantitative trading strategies stored in the persistent SQLite knowledge base. Filterable by symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Filter by symbol (e.g. EURUSD, XAUUSD), or leave empty for all.',
        },
      },
    },
  },
  {
    name: 'mt5_create_strategy',
    description: 'Create or update a quantitative trading strategy in the site knowledge base (e.g. RSI_REVERSAL, EMA_CROSSOVER, MACD_MOMENTUM, MULTI_INDICATOR_CONSENSUS). Strategies can then be backtested against stored MT5 candle history.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Descriptive strategy name',
        },
        description: {
          type: 'string',
          description: 'Strategy thesis and rules',
        },
        type: {
          type: 'string',
          enum: ['RSI_REVERSAL', 'EMA_CROSSOVER', 'MACD_MOMENTUM', 'BOLLINGER_BREAKOUT', 'MULTI_INDICATOR_CONSENSUS', 'CUSTOM_RULESET'],
          description: 'Strategy algorithmic type',
        },
        symbol: {
          type: 'string',
          description: 'Target symbol (e.g. EURUSD, XAUUSD)',
        },
        timeframe: {
          type: 'string',
          description: 'Target timeframe (M1, M5, M15, H1, H4, D1)',
        },
        parameters: {
          type: 'object',
          description: 'Indicator parameters (e.g. rsiOversold: 30, rsiOverbought: 70, fastEmaPeriod: 9, slowEmaPeriod: 21, stopLossPoints: 300, takeProfitPoints: 600, lotSize: 0.1)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords and tags',
        },
        author: {
          type: 'string',
          description: 'Author / Agent attribution (e.g. Claude, AI Agent, Quant)',
        },
        notes: {
          type: 'string',
          description: 'Execution conditions or market insights',
        },
      },
      required: ['name', 'symbol'],
    },
  },
  {
    name: 'mt5_backtest_strategy',
    description: 'Run an algorithmic backtest of a strategy against stored historical MT5 candlestick data. Evaluates trades, win rate, net profit, maximum drawdown, and return equity curve on the site server.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: {
          type: 'string',
          description: 'ID of strategy to test (e.g. strat-rsi-reversal-eurusd)',
        },
        candleLimit: {
          type: 'number',
          description: 'Number of historical candles to run backtest across (default: 300)',
        },
        initialDeposit: {
          type: 'number',
          description: 'Initial deposit capital in USD (default: 10000)',
        },
      },
      required: ['strategyId'],
    },
  },
  {
    name: 'mt5_list_observations',
    description: 'Retrieve observations, market patterns, and research insights stored in the knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'market_insight', 'pattern', 'execution_note', 'anomaly', 'research'],
          description: 'Filter by category (default: all)',
        },
      },
    },
  },
  {
    name: 'mt5_record_observation',
    description: 'Store a market observation, empirical pattern discovery, or execution insight in the persistent knowledge base for future review and algorithmic strategy design.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Observation headline or pattern name',
        },
        content: {
          type: 'string',
          description: 'Detailed analysis, notes, or empirical finding',
        },
        symbol: {
          type: 'string',
          description: 'Associated ticker symbol (optional)',
        },
        timeframe: {
          type: 'string',
          description: 'Associated timeframe (optional)',
        },
        category: {
          type: 'string',
          enum: ['market_insight', 'pattern', 'execution_note', 'anomaly', 'research'],
          description: 'Category classification',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Categorization tags',
        },
        metrics: {
          type: 'object',
          description: 'Key metrics observed (e.g. avgSpread, winRateBoost)',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'mt5_get_backtest_history',
    description: 'Retrieve archived backtest evaluation runs and performance results from SQLite.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: {
          type: 'string',
          description: 'Filter by strategy ID (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum backtest reports to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_auto_detect',
    description: 'Autonomous symbol intelligence engine: inspects asset class (Forex, Metals, Crypto, Indices), pip mechanics, spread-to-ATR ratio, volatility rating, active trading sessions (Asian, London, New York), recommended algorithmic strategies, and dynamic SL/TP risk parameters based on live MT5 data.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, XAUUSD, BTCUSD). Defaults to active MT5 chart symbol.',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_detect_patterns',
    description: 'Quantitative pattern recognition scanner: scans candlestick formations (Hammer, Engulfing, Morning/Evening Star, Doji), indicator formations (RSI divergence, MACD crossovers, Bollinger Squeezes), and chart shapes (Double Tops/Bottoms, Head & Shoulders, Triangles, Wedges) on MT5 historical bars.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD). Defaults to active chart.',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, H1 (default: M1)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_get_news_and_events',
    description: 'Retrieve live curated financial market news with sentiment ratings (-100 to +100) and macroeconomic calendar events (CPI, FOMC, NFP, ECB) with affected currencies and event risk ratings.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Filter news & events by symbol (e.g. EURUSD, XAUUSD), or leave empty for general market overview.',
        },
        category: {
          type: 'string',
          enum: ['ALL', 'FOREX', 'CRYPTO', 'COMMODITY', 'MACRO', 'CENTRAL_BANK'],
          description: 'News category filter',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_get_symbol_impact',
    description: 'Analyze net macroeconomic news impact, event risk level, and sentiment outlook for a specific symbol, with AI trading recommendations and volatility risk alerts.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol to analyze (e.g. EURUSD, XAUUSD, BTCUSD)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'mt5_knowledge_calculate_indicators',
    description: 'Calculate comprehensive quantitative indicators including RSI, MACD, Stochastic, Bollinger Bands, ATR, Volume Profile, and EMAs (9, 21, 50, 200) from MT5 candles.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD)',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, H1 (default: M1)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_get_strategy_templates',
    description: 'Retrieve built-in battle-tested algorithmic strategy templates (Dual EMA Trend Rider, Bollinger Mean Reversion, Donchian Channel Breakout, Multi-Factor AI Adaptive) with full parameter models and rules.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_knowledge_get_market_speed',
    description: 'Retrieve market telemetry speed metrics, peak velocities registered, and hourly time-of-day volatility patterns from the AI knowledge engine.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_knowledge_auto_detect_regime',
    description: 'Auto-detect market regime (Trending Bullish, Trending Bearish, Mean Reverting Range, Volatility Expansion Breakout, Compression Squeeze), trend strength (0-100), ADX estimate, Bollinger bandwidth %, key support/resistance levels, pivot points, and recommended tactical rules.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, XAUUSD, BTCUSD). Defaults to active chart.',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, H1 (default: M1)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_auto_detect_risk_profile',
    description: 'Auto-detect account-tailored risk parameters (exact lot sizing based on current MT5 equity & account currency, stop loss in points and USD, take profit in points and USD, risk-to-reward ratio, and margin requirements calibrated to real ATR and broker contract size).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, XAUUSD)',
        },
        riskPercent: {
          type: 'number',
          description: 'Percentage of account equity to risk (default: 1.0%)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_auto_detect_sessions',
    description: 'Auto-detect current global market session (Tokyo, London, London-NY overlap, New York, Rollover), liquidity score (0-100), spread widening risk, and whether the symbol is in its prime trading window.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (default: active chart)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_run_full_analysis',
    description: 'Comprehensive one-shot AI market diagnosis: combines symbol specifications, market regime, account risk calculation, session liquidity clock, pattern recognition, and macro news impact into a single comprehensive analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (default: active chart symbol)',
        },
      },
    },
  },
  {
    name: 'mt5_generate_trade_signal',
    description: 'Generate a comprehensive AI trade signal by aggregating pattern detection, indicator analysis, market regime, news sentiment, and support/resistance levels. Returns a BUY/SELL/HOLD recommendation with entry price, stop loss, take profit, confidence score, and reasoning.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (default: active chart symbol)',
        },
      },
    },
  },
  {
    name: 'mt5_calculate_position_size',
    description: 'Calculate the recommended lot size for a trade based on account balance, risk percentage, entry price, and stop loss distance. Returns position size, margin required, and risk amount.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol ticker' },
        entryPrice: { type: 'number', description: 'Entry price' },
        stopLossPrice: { type: 'number', description: 'Stop loss price' },
        riskPercent: { type: 'number', description: 'Risk percentage of account balance (default: 1)' },
        accountBalance: { type: 'number', description: 'Account balance (default: current balance)' },
        contractSize: { type: 'number', description: 'Contract size (default: 100000)' },
      },
      required: ['entryPrice', 'stopLossPrice'],
    },
  },
  {
    name: 'mt5_knowledge_auto_detect_microstructure',
    description: 'Auto-detect symbol microstructure and economics: calculates exact pip value in USD, spread cost per standard lot ($), swap rates, margin required per lot at account leverage, lot sizing constraints, and broker execution mode without hardcoded assumptions.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, GBPUSD, XAUUSD). Defaults to active chart symbol.',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_auto_detect_volatility_noise',
    description: 'Auto-detect volatility regime and market noise: computes Choppiness Index (0-100), Kaufman Efficiency Ratio (directionality), Bollinger Squeeze / Contraction status, ATR 14 in points and % of price, and recommended Stop Loss multiplier.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, XAUUSD)',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, H1 (default: M1)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_auto_detect_levels',
    description: 'Auto-detect key price barriers and pivots: Classic Floor Trader Pivots (P, R1, R2, R3, S1, S2, S3), Camarilla Breakout/Reversal levels (H4, H3, L3, L4), nearest support and resistance, and proximity breakout alerts.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (default: active chart)',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, H1 (default: M1)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_auto_detect_safety_score',
    description: 'Auto-detect trade execution safety score (0 - 100%) and slippage hazard: grades market conditions (A+, A, B, C, D) using real-time spread widening analysis, rollover window detection (21:00-23:00 UTC), account free margin cushion, and price action stability.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (default: active chart)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_auto_detect_scalping',
    description: 'Auto-detect 1-minute/5-minute high-frequency scalping viability: computes spread-to-range friction ratio (%), scalping suitability score (0-100), target TP/SL in pips, and maximum holding duration in minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (default: active chart)',
        },
      },
    },
  },
  {
    name: 'mt5_pull_chart_history_now',
    description: 'Instantly pull real historical candlestick bars and sub-second tick movements for any symbol and timeframe (M1, M5, M15, H1, etc.) directly into SQLite. Returns timestamps, OHLCV candles, price range stats, and tick direction/velocity.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, XAUUSD, BTCUSD)',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, H1 (default: M1)',
        },
        count: {
          type: 'number',
          description: 'Number of candles to pull (default: 100, max: 500)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'mt5_knowledge_get_saved_profiles',
    description: 'Retrieve all persisted auto-detection profiles stored in SQLite across tracked symbols with liquidity scores, safety grades, and full quantitative metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum profiles to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'mt5_optimize_database',
    description: 'Perform database maintenance (VACUUM, PRAGMA optimize, and purge unexecuted stale orders older than 24 hours).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_bot_get_status',
    description: 'Get real-time operational status, running state, execution metrics, win rate %, and active trades of the Automated Trading Bot.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_bot_start',
    description: 'Start the automated trading bot engine to continuously monitor knowledgebase signals and execute trades on MT5.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_bot_stop',
    description: 'Halt the automated trading bot engine and pause automated trade execution.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_bot_configure',
    description: 'Update the automated trading bot configuration (target symbols, timeframe, min confidence threshold, risk percentage per trade, max open positions, auto SL/TP).',
    inputSchema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Symbols to trade (e.g. ["EURUSD", "GBPUSD", "XAUUSD"])',
        },
        timeframe: {
          type: 'string',
          description: 'Analysis & execution timeframe (e.g. M1, M5, M15, H1)',
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum AI signal confidence score (0-100) required to trigger trade',
        },
        riskPercent: {
          type: 'number',
          description: 'Percentage of account equity to risk per individual trade (e.g. 1.0)',
        },
        maxOpenPositions: {
          type: 'number',
          description: 'Maximum concurrent open trades allowed for the bot',
        },
        autoStopLoss: {
          type: 'boolean',
          description: 'Whether to attach automatic ATR-calibrated stop loss',
        },
        autoTakeProfit: {
          type: 'boolean',
          description: 'Whether to attach automatic take profit target',
        },
        trailingStop: {
          type: 'boolean',
          description: 'Enable dynamic trailing stop for bot positions',
        },
      },
    },
  },
  {
    name: 'mt5_bot_get_signals',
    description: 'Retrieve latest market trade signals generated by the KnowledgeBase mind for all tracked symbols.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of recent signals to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'mt5_backtest_with_knowledge',
    description: 'Execute a KnowledgeBase-assisted algorithmic backtest for a trading strategy on real MT5 historical candles. Automatically correlates macroeconomic news releases and volatility catalysts, filters dangerous news hazard windows, and generates side-by-side performance proof (Delta Win Rate %, Delta Profit Factor, Drawdown Reduction %, and Trades Avoided).',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: {
          type: 'string',
          description: 'Strategy ID to backtest (e.g. strat-rsi-reversal-eurusd or template name)',
        },
        candleLimit: {
          type: 'number',
          description: 'Number of historical candles to run backtest across (default: 300, max: 2000)',
        },
        initialDeposit: {
          type: 'number',
          description: 'Initial deposit capital in USD (default: 10000)',
        },
        enableNewsRiskFilter: {
          type: 'boolean',
          description: 'Whether KnowledgeBase should pause trade entries during high-impact news spikes (default: true)',
        },
        enableRegimeFilter: {
          type: 'boolean',
          description: 'Whether to suppress entries during choppy compression regimes (default: true)',
        },
      },
      required: ['strategyId'],
    },
  },
  {
    name: 'mt5_knowledge_catch_symbol_news_impact',
    description: 'Examine historical candlesticks for a symbol and catch which macroeconomic news releases and news catalysts greatly affected the symbol with exact pip displacements, volatility spike multipliers (e.g. 3.2x ATR), and whipsaw liquidation detection.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, GBPUSD, XAUUSD). Defaults to active chart.',
        },
        timeframe: {
          type: 'string',
          description: 'Candle timeframe: M1, M5, M15, H1 (default: M1)',
        },
        limit: {
          type: 'number',
          description: 'Number of recent historical candles to scan for news impact (default: 200)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_get_symbol_behavior',
    description: 'Autonomous symbol detector: inspects symbol specifications, real-time spread-to-range friction, market regime, session liquidity clock, execution safety grade, and optimal algorithmic strategies.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, XAUUSD, BTCUSD). Defaults to active chart.',
        },
      },
    },
  },
  {
    name: 'mt5_detect_rapid_movements_and_catalysts',
    description: 'Detect sudden rapid movements, volatility impulses (>2.5x ATR), and whipsaw liquidation spikes on a symbol, and automatically attribute each shock to contemporaneous macroeconomic news events or calendar releases with exact pip displacement and attribution confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, XAUUSD, BTCUSD). Defaults to active chart.',
        },
        timeframe: {
          type: 'string',
          description: 'Candle timeframe: M1, M5, M15, H1 (default: M1)',
        },
      },
    },
  },
  {
    name: 'mt5_evaluate_multitimeframe_signal',
    description: 'Perform multi-timeframe concordance analysis (evaluating primary timeframe e.g. M1/M5 alongside higher timeframes M15, H1, H4). Returns overall consensus (STRONG_BUY, BUY, NEUTRAL, SELL, STRONG_SELL), concordance score %, higher timeframe trend, and counter-trend conflict detection.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, GBPUSD, XAUUSD). Defaults to active chart.',
        },
        primaryTimeframe: {
          type: 'string',
          description: 'Primary execution timeframe: M1, M5, M15, H1 (default: M1)',
        },
        higherTimeframes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional higher timeframes to evaluate (e.g. ["M15", "H1"])',
        },
      },
    },
  },
  {
    name: 'mt5_get_chart_diagnostics',
    description: 'Retrieve real-time MetaTrader 5 chart diagnostics and terminal status: exact broker server time, GMT time, timezone offset hours, bar open time, elapsed/remaining candle seconds, progress %, spread in points & pips, chart scale, viewport bars, and AutoTrading/MQL broker permissions.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function executeMcpTool(name: string, args: Record<string, any> = {}): Promise<any> {
  switch (name) {
    case 'mt5_query_trade_history': {
      const { dbGetOrders } = await import('../database/db.js');
      const limit = args.limit ? Number(args.limit) : 20;
      const orders = await dbGetOrders(limit);
      return {
        count: orders.length,
        orders,
      };
    }

    case 'mt5_get_performance_analytics': {
      const { dbGetAnalytics } = await import('../database/db.js');
      return await dbGetAnalytics();
    }

    case 'mt5_get_current_chart': {
      const chart = tradeStore.getCurrentChart();
      if (!chart) {
        return {
          status: 'awaiting_ea',
          message: 'Awaiting MT5 EA connection to retrieve active chart symbol.',
        };
      }
      return chart;
    }

    case 'mt5_get_all_symbols': {
      const allSyms = tradeStore.getAllSymbols();
      return {
        count: allSyms.length,
        symbols: allSyms,
      };
    }

    case 'mt5_get_account_info': {
      const account = tradeStore.getAccount();
      return {
        login: account.login,
        tradeMode: account.tradeMode,
        balance: account.balance,
        equity: account.equity,
        freeMargin: account.freeMargin,
        margin: account.margin,
        marginLevel: `${account.marginLevel}%`,
        floatingProfit: account.profit,
        currency: account.currency,
        leverage: `1:${account.leverage}`,
        server: account.server,
        lastUpdate: new Date(account.lastUpdate).toISOString(),
      };
    }

    case 'mt5_get_market_data': {
      const ticks = tradeStore.getTicks();
      if (args.symbol && args.symbol.toUpperCase() !== 'ALL') {
        const found = ticks.find((t) => t.symbol.toUpperCase() === args.symbol.toUpperCase());
        if (!found) {
          throw new Error(`Symbol ${args.symbol} not found in tracked market feed.`);
        }
        return found;
      }
      return ticks;
    }

    case 'mt5_get_open_positions': {
      let positions = tradeStore.getPositions();
      if (args.symbol) {
        positions = positions.filter((p) => p.symbol.toUpperCase() === args.symbol.toUpperCase());
      }
      return {
        count: positions.length,
        totalProfit: positions.reduce((acc, p) => acc + p.profit, 0),
        positions,
      };
    }

    case 'mt5_execute_trade': {
      const { symbol, orderType, volume, sl, tp, comment, magic, price, slippage } = args;
      if (!symbol || !orderType || !volume) {
        throw new Error('Missing required arguments: symbol, orderType, volume');
      }

      const res = commandDispatcher.executeTrade({
        symbol: String(symbol).trim(),
        orderType: String(orderType).trim().toUpperCase() as any,
        volume: Number(volume),
        price: price !== undefined ? Number(price) : undefined,
        sl: sl !== undefined ? Number(sl) : undefined,
        tp: tp !== undefined ? Number(tp) : undefined,
        comment: comment ? String(comment) : 'AI_MCP_TRADE',
        magic: magic ? Number(magic) : 889900,
        slippage: slippage ? Number(slippage) : 10,
        source: 'AI_MCP',
      });

      if (!res.success) {
        throw new Error(`Execution rejected by Risk Engine: ${res.error}`);
      }

      return res;
    }

    case 'mt5_modify_position': {
      const { ticket, sl, tp } = args;
      if (!ticket) throw new Error('Missing required argument: ticket');

      const res = commandDispatcher.modifyPosition({
        ticket: Number(ticket),
        sl: sl !== undefined ? Number(sl) : undefined,
        tp: tp !== undefined ? Number(tp) : undefined,
        source: 'AI_MCP',
        comment: 'AI_MCP_MODIFY',
      });

      if (!res.success) {
        throw new Error(`Modify rejected: ${res.error}`);
      }

      return res;
    }

    case 'mt5_close_position': {
      const { ticket, volume } = args;
      if (!ticket) throw new Error('Missing required argument: ticket');

      const res = commandDispatcher.closePosition({
        ticket: Number(ticket),
        volume: volume ? Number(volume) : undefined,
        source: 'AI_MCP',
        comment: 'AI_MCP_CLOSE',
      });

      if (!res.success) {
        throw new Error(`Close rejected: ${res.error}`);
      }

      return res;
    }

    case 'mt5_close_all': {
      const symbol = args.symbol ? String(args.symbol).toUpperCase() : 'ALL';
      const res = commandDispatcher.closeAll({
        symbol,
        source: 'AI_MCP',
        comment: 'AI_MCP_CLOSE_ALL',
      });

      if (!res.success) {
        throw new Error(`Bulk liquidation rejected: ${res.error}`);
      }

      return res;
    }

    case 'mt5_configure_risk_guard': {
      tradeStore.updateRiskGuard(args);
      return {
        status: 'success',
        riskGuard: tradeStore.getRiskGuard(),
      };
    }

    case 'mt5_get_execution_queue': {
      const state = tradeStore.getState();
      const limit = args.limit ? Number(args.limit) : 10;
      return state.commandQueue.slice(0, limit);
    }

    case 'mt5_get_chart_history': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const tf = args.timeframe ? String(args.timeframe).trim() : (tradeStore.getCurrentChart()?.timeframe || 'M1');
      const limit = args.limit ? Math.min(Number(args.limit), 500) : 60;
      const includeIndicators = args.includeIndicators !== false;
      const includeTicks = args.includeTicks !== false;

      // 1. Check SQLite database with rich statistics
      const { dbGetCandleHistoryWithStats, dbGetRecentTickMovements } = await import('../database/db.js');
      let result = await dbGetCandleHistoryWithStats(sym, tf, limit);

      // 2. Fallback to in-memory chartHistory if querying active chart and SQLite has fewer
      if (result.candles.length === 0 && (!args.symbol || sym.toLowerCase() === tradeStore.getCurrentChart()?.symbol.toLowerCase())) {
        const liveBars = tradeStore.getChartHistory().slice(-limit);
        if (liveBars.length > 0) {
          const { dbInsertCandles } = await import('../database/db.js');
          await dbInsertCandles(sym, tf, liveBars);
          result = await dbGetCandleHistoryWithStats(sym, tf, limit);
        }
      }

      // 3. If no candles are present yet, request real historical candles from MT5 EA if connected
      if (result.candles.length === 0) {
        if (tradeStore.getState().connection.isEaConnected) {
          commandDispatcher.requestHistory({ symbol: sym, timeframe: tf, count: limit, source: 'AI_MCP' });
          return {
            symbol: sym,
            timeframe: tf,
            count: 0,
            candles: [],
            stats: null,
            indicators: null,
            tickMovements: [],
            message: `Requested ${limit} real historical bars for ${sym} [${tf}] from MT5 EA. Data will arrive on next sync.`,
            awaitingEa: true,
          };
        } else {
          return {
            symbol: sym,
            timeframe: tf,
            count: 0,
            candles: [],
            stats: null,
            indicators: null,
            tickMovements: [],
            message: `No candlestick history in database for ${sym} [${tf}]. Awaiting MetaTrader 5 EA connection.`,
            awaitingEa: true,
          };
        }
      }

      // 4. Calculate indicators
      const { calculateIndicators } = await import('../services/indicatorEngine.js');
      const indicators = includeIndicators ? calculateIndicators(result.candles, sym, tf) : null;

      // 5. Pull recent tick movements for this symbol
      let tickData = null;
      if (includeTicks) {
        tickData = await dbGetRecentTickMovements(sym, 30);
      }

      const latestTick = tradeStore.getTicks().find((t) => t.symbol.toLowerCase() === sym.toLowerCase()) || null;

      return {
        symbol: sym,
        timeframe: tf,
        count: result.candles.length,
        candles: result.candles,
        stats: result.stats,
        tickMovements: tickData?.ticks || [],
        tickStats: tickData?.stats || null,
        indicators,
        latestTick,
      };
    }

    case 'mt5_get_technical_indicators': {
      const sym = normalizeSymbol(args.symbol || tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const tf = normalizeTimeframe(args.timeframe || tradeStore.getCurrentChart()?.timeframe || 'M1') || 'M1';

      const { dbGetCandles } = await import('../database/db.js');
      let candles = await dbGetCandles(sym, tf, 200);
      if (candles.length === 0) {
        candles = tradeStore.getChartHistory();
      }

      const { calculateIndicators } = await import('../services/indicatorEngine.js');
      const indicators = calculateIndicators(candles, sym, tf);
      if (!indicators) {
        return {
          status: 'insufficient_data',
          message: `Insufficient candle history for ${sym} [${tf}]. Need at least 5 candles to compute indicators.`,
          symbol: sym,
          timeframe: tf,
        };
      }
      return indicators;
    }

    case 'mt5_get_pending_orders': {
      let orders = tradeStore.getPendingOrders();
      if (args.symbol) {
        orders = orders.filter((o) => o.symbol.toUpperCase() === args.symbol.toUpperCase());
      }
      return {
        count: orders.length,
        pendingOrders: orders,
      };
    }

    case 'mt5_cancel_pending_order': {
      const ticket = Number(args.ticket);
      if (!ticket) throw new Error('Missing ticket parameter');
      const res = commandDispatcher.cancelPendingOrder({
        ticket,
        source: 'AI_MCP',
        comment: 'AI_MCP_CANCEL_PENDING',
      });
      if (!res.success) throw new Error(res.error);
      return res;
    }

    case 'mt5_request_chart_history': {
      const sym = String(args.symbol || '').toUpperCase();
      if (!sym) throw new Error('Missing symbol parameter');
      const tf = args.timeframe ? String(args.timeframe).toUpperCase() : 'M1';
      const count = args.count ? Number(args.count) : 100;
      const res = commandDispatcher.requestHistory({
        symbol: sym,
        timeframe: tf,
        count,
        source: 'AI_MCP',
      });
      return res;
    }

    case 'mt5_get_account_history': {
      const limit = args.limit ? Number(args.limit) : 30;
      const { dbGetAccountHistory } = await import('../database/db.js');
      const history = await dbGetAccountHistory(limit);
      return {
        count: history.length,
        history,
      };
    }

    case 'mt5_get_tick_history': {
      const limit = args.limit ? Number(args.limit) : 50;
      const { dbGetTicksHistory } = await import('../database/db.js');
      const ticks = await dbGetTicksHistory(args.symbol, limit);
      return {
        count: ticks.length,
        ticks,
      };
    }

    case 'mt5_knowledge_multi_timeframe': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const tf = args.primaryTimeframe ? String(args.primaryTimeframe).trim() : (tradeStore.getCurrentChart()?.timeframe || 'M1');
      const htf = Array.isArray(args.higherTimeframes) ? args.higherTimeframes : undefined;
      const { evaluateMultiTimeframeConsensus } = await import('../knowledgebase/signals/multiTimeframe.js');
      return await evaluateMultiTimeframeConsensus(sym, tf, htf);
    }

    case 'mt5_list_strategies': {
      const { dbGetStrategies } = await import('../database/db.js');
      const strategies = await dbGetStrategies(args.symbol);
      return {
        count: strategies.length,
        strategies,
      };
    }

    case 'mt5_create_strategy': {
      const { dbSaveStrategy } = await import('../database/db.js');
      const stratId = args.id || `strat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const strategyData = {
        id: stratId,
        name: args.name,
        description: args.description || '',
        type: args.type || 'RSI_REVERSAL',
        symbol: (args.symbol || 'EURUSD').toUpperCase(),
        timeframe: (args.timeframe || 'M1').toUpperCase(),
        parameters: args.parameters || {},
        status: args.status || 'active',
        tags: args.tags || [],
        author: args.author || 'AI_Agent',
        notes: args.notes || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await dbSaveStrategy(strategyData);
      return {
        success: true,
        strategy: strategyData,
        message: `Strategy "${strategyData.name}" created and stored in SQLite knowledge base.`,
      };
    }

    case 'mt5_backtest_strategy': {
      const { dbGetStrategyById, dbGetCandles, dbSaveBacktestResult } = await import('../database/db.js');
      const { runStrategyBacktest } = await import('../services/strategyEngine.js');

      const strategy = await dbGetStrategyById(args.strategyId);
      if (!strategy) throw new Error(`Strategy ${args.strategyId} not found`);

      const candleLimit = args.candleLimit ? Number(args.candleLimit) : 300;
      const initialDeposit = args.initialDeposit ? Number(args.initialDeposit) : 10000;

      let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, candleLimit);
      let dataQuality: 'LIVE' | 'SYNTHETIC' = candles.length >= 20 ? 'LIVE' : 'SYNTHETIC';
      if (candles.length < 20) {
        const live = tradeStore.getChartHistory();
        if (live && live.length >= 20) {
          candles = live;
          dataQuality = tradeStore.getDataQuality();
        } else {
          // Auto-seed synthetic candles for smooth testing experience.
          // These bars are a random walk and must be labelled as such.
          const seeded = await tradeStore.seedCandles(strategy.symbol, strategy.timeframe, 100);
          candles = seeded.candles;
          dataQuality = 'SYNTHETIC';
        }
      }

      const backtest = runStrategyBacktest(strategy, candles, initialDeposit);
      await dbSaveBacktestResult({ ...backtest, dataQuality });

      return {
        success: true,
        dataQuality,
        warning:
          dataQuality === 'SYNTHETIC'
            ? 'No live MT5 history was available. This backtest ran on generated random-walk bars and must NOT be treated as a measurement of real market performance.'
            : undefined,
        summary: {
          strategyName: backtest.strategyName,
          symbol: backtest.symbol,
          timeframe: backtest.timeframe,
          candleCount: backtest.candleCount,
          initialDeposit: backtest.initialDeposit,
          finalEquity: backtest.finalEquity,
          netProfit: backtest.netProfit,
          profitFactor: backtest.profitFactor,
          winRatePct: `${backtest.winRatePct}%`,
          totalTrades: backtest.totalTrades,
          winningTrades: backtest.winningTrades,
          losingTrades: backtest.losingTrades,
          maxDrawdownPct: `${backtest.maxDrawdownPct}%`,
          maxDrawdownUsd: backtest.maxDrawdownUsd,
          averageTradeProfit: backtest.averageTradeProfit,
          riskRewardRatio: backtest.riskRewardRatio,
        },
        backtestId: backtest.id,
        trades: backtest.trades,
      };
    }

    case 'mt5_list_observations': {
      const { dbGetObservations } = await import('../database/db.js');
      const observations = await dbGetObservations(args.category);
      return {
        count: observations.length,
        observations,
      };
    }

    case 'mt5_record_observation': {
      const { dbSaveObservation } = await import('../database/db.js');
      const obsId = args.id || `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const obs = {
        id: obsId,
        title: args.title,
        content: args.content,
        symbol: args.symbol ? args.symbol.toUpperCase() : null,
        timeframe: args.timeframe ? args.timeframe.toUpperCase() : null,
        strategyId: args.strategyId || null,
        category: args.category || 'market_insight',
        tags: args.tags || [],
        metrics: args.metrics || {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await dbSaveObservation(obs);
      return {
        success: true,
        observation: obs,
        message: `Market observation "${obs.title}" logged to persistent knowledge base.`,
      };
    }

    case 'mt5_get_backtest_history': {
      const { dbGetBacktestResults } = await import('../database/db.js');
      const limit = args.limit ? Number(args.limit) : 20;
      const results = await dbGetBacktestResults(args.strategyId, limit);
      return {
        count: results.length,
        results,
      };
    }

    case 'mt5_knowledge_auto_detect': {
      const currentChart = tradeStore.getCurrentChart();
      const symbolParam = (args.symbol as string) || currentChart?.symbol || 'EURUSD';
      const sym = symbolParam.trim();

      const { runComprehensiveAutoDetection } = await import('../knowledgebase/core/auto-detect.js');
      const account = tradeStore.getAccount();
      const allSymbols = tradeStore.getAllSymbols();
      const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === sym.toLowerCase()) || null;
      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length === 0) {
        const { dbGetCandles } = await import('../database/db.js');
        candles = await dbGetCandles(normalizeSymbol(sym), normalizeTimeframe(args.timeframe as string) || 'M1', 100);
      }
      const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === sym.toLowerCase());

      const analysis = runComprehensiveAutoDetection(sym, account, symbolInfo, candles, ticks);
      const { dbSaveSymbolAutoDetectProfile } = await import('../database/db.js');
      dbSaveSymbolAutoDetectProfile(analysis).catch((e) => console.error('DB save profile error:', e));

      return {
        symbol: sym,
        analysis,
      };
    }

    case 'mt5_knowledge_detect_patterns': {
      const currentChart = tradeStore.getCurrentChart();
      const symbol = (args.symbol as string) || currentChart?.symbol || 'EURUSD';
      const timeframe = (args.timeframe as string) || currentChart?.timeframe || 'M1';

      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length < 10) {
        const { dbGetCandles } = await import('../database/db.js');
        candles = await dbGetCandles(symbol, timeframe, 120);
      }

      const { detectAllPatterns } = await import('../knowledgebase/patterns/index.js');
      const patterns = detectAllPatterns(candles, symbol, timeframe);
      return patterns;
    }

    case 'mt5_knowledge_get_news_and_events': {
      const symbol = args.symbol as string;
      const category = args.category as string;
      const { fetchMarketNews } = await import('../knowledgebase/news/newsEngine.js');
      const { getUpcomingEconomicEvents } = await import('../knowledgebase/news/economicCalendar.js');

      let news = await fetchMarketNews(symbol);
      if (category && category !== 'ALL') {
        news = news.filter((item) => item.category === category);
      }
      const calendar = getUpcomingEconomicEvents(symbol);

      return {
        symbol: symbol || 'GLOBAL',
        newsCount: news.length,
        news,
        eventsCount: calendar.events.length,
        events: calendar.events,
        activeAlerts: calendar.activeAlerts,
      };
    }

    case 'mt5_knowledge_get_symbol_impact': {
      const currentChart = tradeStore.getCurrentChart();
      const symbol = (args.symbol as string) || currentChart?.symbol || 'EURUSD';
      const { analyzeSymbolNewsImpact } = await import('../knowledgebase/news/symbolImpact.js');
      const impact = await analyzeSymbolNewsImpact(symbol);
      return impact;
    }

    case 'mt5_knowledge_calculate_indicators': {
      const currentChart = tradeStore.getCurrentChart();
      const symbol = (args.symbol as string) || currentChart?.symbol || 'EURUSD';
      const timeframe = (args.timeframe as string) || currentChart?.timeframe || 'M1';

      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length < 10) {
        const { dbGetCandles } = await import('../database/db.js');
        candles = await dbGetCandles(symbol, timeframe, 120);
      }

      const { calculateIndicators } = await import('../knowledgebase/indicators/index.js');
      const indicators = calculateIndicators(candles, symbol, timeframe);
      return {
        symbol,
        timeframe,
        indicators,
      };
    }

    case 'mt5_knowledge_get_strategy_templates': {
      const { BUILT_IN_STRATEGY_TEMPLATES } = await import('../knowledgebase/strategies/index.js');
      return {
        count: BUILT_IN_STRATEGY_TEMPLATES.length,
        templates: BUILT_IN_STRATEGY_TEMPLATES,
      };
    }

    case 'mt5_knowledge_get_market_speed': {
      const { getAiKnowledge } = await import('../knowledgebase/knowledge.js');
      return getAiKnowledge();
    }

    case 'mt5_knowledge_auto_detect_regime': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const tf = args.timeframe ? String(args.timeframe).trim() : (tradeStore.getCurrentChart()?.timeframe || 'M1');

      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length < 15) {
        const { dbGetCandles } = await import('../database/db.js');
        candles = await dbGetCandles(sym, tf, 100);
      }

      const { autoDetectMarketRegime } = await import('../knowledgebase/core/auto-detect.js');
      const regime = autoDetectMarketRegime(sym, candles);

      const { dbSaveSymbolRegime } = await import('../database/db.js');
      dbSaveSymbolRegime(regime).catch((e) => console.error('DB save regime error:', e));

      return regime;
    }

    case 'mt5_knowledge_auto_detect_risk_profile': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const riskPercent = args.riskPercent ? Number(args.riskPercent) : 1.0;

      const { autoDetectSymbol, autoDetectAccountRiskProfile } = await import('../knowledgebase/core/auto-detect.js');
      const allSymbols = tradeStore.getAllSymbols();
      const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === sym.toLowerCase()) || null;
      const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === sym.toLowerCase());
      const candles = tradeStore.getChartHistory();

      const specs = autoDetectSymbol(sym, symbolInfo, candles, ticks);
      const account = tradeStore.getAccount();
      return autoDetectAccountRiskProfile(sym, account, specs, riskPercent);
    }

    case 'mt5_knowledge_auto_detect_sessions': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const { autoDetectLiquidityAndSessions } = await import('../knowledgebase/core/auto-detect.js');
      return autoDetectLiquidityAndSessions(sym);
    }

    case 'mt5_knowledge_auto_detect_microstructure': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const { autoDetectSymbolMicrostructure } = await import('../knowledgebase/core/auto-detect.js');
      const allSymbols = tradeStore.getAllSymbols();
      const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === sym.toLowerCase()) || null;
      const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === sym.toLowerCase());
      const account = tradeStore.getAccount();
      return autoDetectSymbolMicrostructure(sym, symbolInfo, ticks, account);
    }

    case 'mt5_knowledge_auto_detect_volatility_noise': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const tf = args.timeframe ? String(args.timeframe).trim() : (tradeStore.getCurrentChart()?.timeframe || 'M1');
      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length < 14) {
        const { dbGetCandles } = await import('../database/db.js');
        candles = await dbGetCandles(sym, tf, 100);
      }
      const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === sym.toLowerCase());
      const { autoDetectVolatilityAndNoise } = await import('../knowledgebase/core/auto-detect.js');
      return autoDetectVolatilityAndNoise(sym, candles, ticks);
    }

    case 'mt5_knowledge_auto_detect_levels': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const tf = args.timeframe ? String(args.timeframe).trim() : (tradeStore.getCurrentChart()?.timeframe || 'M1');
      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length < 10) {
        const { dbGetCandles } = await import('../database/db.js');
        candles = await dbGetCandles(sym, tf, 100);
      }
      const { autoDetectSupportResistanceAndPivots } = await import('../knowledgebase/core/auto-detect.js');
      return autoDetectSupportResistanceAndPivots(sym, candles);
    }

    case 'mt5_knowledge_auto_detect_safety_score': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const account = tradeStore.getAccount();
      const allSymbols = tradeStore.getAllSymbols();
      const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === sym.toLowerCase()) || null;
      const candles = tradeStore.getChartHistory();
      const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === sym.toLowerCase());
      const { autoDetectExecutionSafetyScore } = await import('../knowledgebase/core/auto-detect.js');
      return autoDetectExecutionSafetyScore(sym, account, symbolInfo, candles, ticks);
    }

    case 'mt5_knowledge_auto_detect_scalping': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const candles = tradeStore.getChartHistory();
      const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === sym.toLowerCase());
      const { autoDetectScalpingSuitability } = await import('../knowledgebase/core/auto-detect.js');
      return autoDetectScalpingSuitability(sym, candles, ticks);
    }

    case 'mt5_pull_chart_history_now': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const tf = args.timeframe ? String(args.timeframe).trim() : (tradeStore.getCurrentChart()?.timeframe || 'M1');
      const count = args.count ? Math.min(Number(args.count), 500) : 100;

      const eaRes = commandDispatcher.requestHistory({
        symbol: sym,
        timeframe: tf,
        count,
        source: 'AI_MCP',
      });

      const { dbGetCandleHistoryWithStats, dbGetRecentTickMovements } = await import('../database/db.js');
      const result = await dbGetCandleHistoryWithStats(sym, tf, count);
      const tickMovements = await dbGetRecentTickMovements(sym, 50);

      return {
        status: 'success',
        eaCommandId: eaRes.commandId,
        message: result.candles.length > 0
          ? `Chart history and tick stream retrieved for ${sym} [${tf}]. EA refresh queued.`
          : `History pull requested from MT5 EA for ${sym} [${tf}]. Awaiting next sync for candle data.`,
        symbol: sym,
        timeframe: tf,
        candleCount: result.candles.length,
        candles: result.candles,
        stats: result.stats,
        tickMovements: tickMovements.ticks,
        tickStats: tickMovements.stats,
        awaitingEaData: result.candles.length === 0,
      };
    }

    case 'mt5_knowledge_get_saved_profiles': {
      const limit = args.limit ? Number(args.limit) : 20;
      const { dbGetSymbolAutoDetectProfiles } = await import('../database/db.js');
      const profiles = await dbGetSymbolAutoDetectProfiles(limit);
      return {
        count: profiles.length,
        profiles,
      };
    }

    case 'mt5_knowledge_run_full_analysis': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const { runComprehensiveAutoDetection } = await import('../knowledgebase/core/auto-detect.js');
      const account = tradeStore.getAccount();
      const allSymbols = tradeStore.getAllSymbols();
      const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === sym.toLowerCase()) || null;
      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length === 0) {
        const { dbGetCandles } = await import('../database/db.js');
        candles = await dbGetCandles(sym, 'M1', 100);
      }
      const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === sym.toLowerCase());

      const fullAnalysis = runComprehensiveAutoDetection(sym, account, symbolInfo, candles, ticks);

      // Persist to SQLite
      const { dbSaveSymbolAutoDetectProfile } = await import('../database/db.js');
      dbSaveSymbolAutoDetectProfile(fullAnalysis).catch((e) => console.error('DB save full profile error:', e));

      return fullAnalysis;
    }

    case 'mt5_generate_trade_signal': {
      const sym = args.symbol ? String(args.symbol).trim() : (tradeStore.getCurrentChart()?.symbol || 'EURUSD');
      const account = tradeStore.getAccount();
      const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === sym.toLowerCase());
      const currentPrice = ticks.length > 0 ? ticks[0].bid : (tradeStore.getCurrentChart()?.bid || 0);

      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length < 20) {
        const { dbGetCandles } = await import('../database/db.js');
        candles = await dbGetCandles(sym, 'M1', 200);
      }

      const { generateTradeSignal } = await import('../knowledgebase/core/tradeSignal.js');
      const signal = await generateTradeSignal(sym, candles, currentPrice, account.balance, tradeStore.getDataQuality());

      return signal;
    }

    case 'mt5_calculate_position_size': {
      const sym = (args.symbol || 'EURUSD').trim();
      const entry = Number(args.entryPrice);
      const sl = Number(args.stopLossPrice);
      if (!Number.isFinite(entry) || !Number.isFinite(sl)) {
        throw new Error('entryPrice and stopLossPrice are required');
      }
      const risk = Number(args.riskPercent) || 1;
      const balance = Number(args.accountBalance) || tradeStore.getAccount().balance || 10000;
      const cs = Number(args.contractSize) || 100000;

      const { calculatePositionSize } = await import('../knowledgebase/core/tradeSignal.js');
      return calculatePositionSize(sym, balance, risk, entry, sl, cs);
    }

    case 'mt5_optimize_database': {
      tradeStore.pruneStaleOrders();
      const { dbOptimizeDatabase } = await import('../database/db.js');
      return await dbOptimizeDatabase();
    }

    case 'mt5_bot_get_status': {
      return tradingBot.getState();
    }

    case 'mt5_bot_start': {
      return tradingBot.start();
    }

    case 'mt5_bot_stop': {
      return tradingBot.stop();
    }

    case 'mt5_bot_configure': {
      return tradingBot.updateConfig(args || {});
    }

    case 'mt5_bot_get_signals': {
      const limit = args.limit ? Number(args.limit) : 20;
      const { dbGetBotSignals } = await import('../database/db.js');
      const signals = await dbGetBotSignals(limit);
      return { count: signals.length, signals };
    }

    case 'mt5_backtest_with_knowledge': {
      const { dbGetStrategyById, dbGetCandles, dbSaveBacktestResult } = await import('../database/db.js');
      const { runKnowledgeEnhancedBacktest } = await import('../services/strategyEngine.js');

      const strategy = await dbGetStrategyById(args.strategyId);
      if (!strategy) {
        return {
          success: false,
          error: `Strategy not found: ${args.strategyId}`,
        };
      }

      const initialDeposit = Number(args.initialDeposit) || 10000;
      const candleLimit = Math.min(Math.max(Number(args.candleLimit) || 300, 20), 2000);
      let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, candleLimit);
      let dataQuality: 'LIVE' | 'SYNTHETIC' = candles.length >= 20 ? 'LIVE' : 'SYNTHETIC';

      if (candles.length < 20) {
        const liveHistory = tradeStore.getChartHistory();
        if (liveHistory && liveHistory.length >= 20) {
          candles = liveHistory;
          dataQuality = tradeStore.getDataQuality();
        } else {
          return {
            success: false,
            error: `Insufficient historical candles for ${strategy.symbol} (${candles.length} available). Request history from EA via mt5_request_chart_history first.`,
          };
        }
      }

      const result = await runKnowledgeEnhancedBacktest(
        strategy,
        candles,
        {
          enableNewsRiskFilter: args.enableNewsRiskFilter !== false,
          enableRegimeFilter: args.enableRegimeFilter !== false,
        },
        initialDeposit
      );

      await dbSaveBacktestResult({ ...result, dataQuality });

      return {
        success: true,
        strategyName: strategy.name,
        symbol: strategy.symbol,
        dataQuality,
        result,
      };
    }

    case 'mt5_knowledge_catch_symbol_news_impact': {
      const currentChart = tradeStore.getCurrentChart();
      const symbol = (args.symbol as string) || currentChart?.symbol || 'EURUSD';
      const timeframe = (args.timeframe as string) || currentChart?.timeframe || 'M1';
      const limit = Math.min(Math.max(Number(args.limit) || 200, 20), 1000);

      const { dbGetCandles } = await import('../database/db.js');
      let candles = await dbGetCandles(symbol, timeframe, limit);
      if (candles.length < 15) {
        const inMem = tradeStore.getChartHistory();
        if (inMem && inMem.length >= 15) candles = inMem;
      }

      const { detectSymbolNewsImpactOnCandles } = await import('../knowledgebase/news/newsImpactDetector.js');
      const correlation = await detectSymbolNewsImpactOnCandles(symbol, candles, timeframe);
      return correlation;
    }

    case 'mt5_knowledge_get_symbol_behavior': {
      const currentChart = tradeStore.getCurrentChart();
      const symbol = (args.symbol as string) || currentChart?.symbol || 'EURUSD';
      const sym = symbol.trim().toUpperCase();

      const { runComprehensiveAutoDetection } = await import('../knowledgebase/core/auto-detect.js');
      const account = tradeStore.getAccount();
      const allSymbols = tradeStore.getAllSymbols();
      const symbolInfo = allSymbols.find((s) => s.symbol.toUpperCase() === sym) || null;
      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length === 0) {
        const { dbGetCandles } = await import('../database/db.js');
        candles = await dbGetCandles(sym, 'M1', 100);
      }
      const ticks = tradeStore.getTicks().filter((t) => t.symbol.toUpperCase() === sym);

      const analysis = runComprehensiveAutoDetection(sym, account, symbolInfo, candles, ticks);
      return analysis;
    }

    case 'mt5_detect_rapid_movements_and_catalysts': {
      const currentChart = tradeStore.getCurrentChart();
      const symbol = (args.symbol as string) || currentChart?.symbol || 'EURUSD';
      const timeframe = (args.timeframe as string) || currentChart?.timeframe || 'M1';
      const { detectRapidMovementsAndAttribution, isSymbolInShockCoolingOff, getAllRegisteredShocks } = await import('../knowledgebase/news/rapidShockDetector.js');
      const shocks = await detectRapidMovementsAndAttribution(symbol, undefined, timeframe);
      const coolingStatus = isSymbolInShockCoolingOff(symbol);
      return {
        symbol: symbol.toUpperCase(),
        timeframe,
        totalShocksDetected: shocks.length,
        shocks,
        coolingStatus,
        recentMarketShocksCount: getAllRegisteredShocks().length,
      };
    }

    case 'mt5_evaluate_multitimeframe_signal': {
      const currentChart = tradeStore.getCurrentChart();
      const symbol = (args.symbol as string) || currentChart?.symbol || 'EURUSD';
      const primaryTf = (args.primaryTimeframe as string) || currentChart?.timeframe || 'M1';
      const higherTfs = Array.isArray(args.higherTimeframes) ? args.higherTimeframes : undefined;
      const { evaluateMultiTimeframeConsensus } = await import('../knowledgebase/signals/multiTimeframe.js');
      return await evaluateMultiTimeframeConsensus(symbol, primaryTf, higherTfs);
    }

    case 'mt5_get_chart_diagnostics': {
      const diagnostics = tradeStore.getChartDiagnostics();
      const permissions = tradeStore.getTerminalPermissions();
      return {
        chartDiagnostics: diagnostics || { status: 'awaiting_mt5_chart', message: 'No active MT5 chart connected yet' },
        terminalPermissions: permissions || { status: 'awaiting_mt5_terminal', message: 'Permissions will populate on first EA sync' },
        bridgeStatus: {
          isEaConnected: tradeStore.getState().connection.isEaConnected,
          lastEaSync: tradeStore.getState().connection.lastEaSync,
          eaVersion: tradeStore.getState().connection.eaVersion,
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);

  }
}

// Handle JSON-RPC 2.0 MCP requests
export async function handleMcpJsonRpc(body: any): Promise<any> {
  const { jsonrpc, id, method, params } = body;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'mt5-ai-mcp-bridge',
          version: '2.10.0',
        },
      },
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};
    try {
      const toolResult = await executeMcpTool(name, toolArgs || {});
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolResult, null, 2),
            },
          ],
          isError: false,
        },
      };
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${err?.message || String(err)}`,
            },
          ],
          isError: true,
        },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  };
}
