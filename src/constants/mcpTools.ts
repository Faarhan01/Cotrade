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
    name: 'mt5_get_backtest_history',
    description: 'Retrieve archived backtest evaluation runs and quantitative metrics from SQLite.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: {
          type: 'string',
          description: 'Filter backtest runs by strategy ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum backtest runs to retrieve (default: 20)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_auto_detect',
    description: 'Auto-detect symbol asset class, pip mechanics, spread-to-ATR rating, volatility profile, trading sessions, and recommended strategies.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Trading symbol (e.g. EURUSD, XAUUSD, BTCUSD). Defaults to active chart symbol.',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_detect_patterns',
    description: 'Scan stored chart candles for candlestick formations (Engulfing, Pinbar, Morning Star), chart geometry (Double Top, Head & Shoulders), and indicator momentum patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Trading symbol (e.g. EURUSD)',
        },
        timeframe: {
          type: 'string',
          description: 'Chart timeframe (M1, M5, M15, H1, D1)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_get_news_and_events',
    description: 'Retrieve live macro news headlines with sentiment classification, alongside upcoming high-impact economic calendar events.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Filter events by currency or symbol (e.g. EUR, USD, XAUUSD)',
        },
        category: {
          type: 'string',
          description: 'Filter news by category: CENTRAL_BANK, INFLATION, EMPLOYMENT, GEOPOLITICAL, TECHNICAL',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_get_symbol_impact',
    description: 'Perform deep macroeconomic impact analysis: decomposes symbol into base vs quote currency drivers, calculates net pair pressure (-100 to +100), directional bias with confidence %, expected ATR volatility multiplier, spread widening hazard rating, tactical precautions, and driving catalysts.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, USDJPY, XAUUSD, BTCUSD)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'mt5_knowledge_calculate_indicators',
    description: 'Calculate comprehensive technical indicator suite (RSI, EMAs, MACD, Bollinger Bands, ATR, SuperTrend, Stochastic) on live MT5 bars.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker',
        },
        timeframe: {
          type: 'string',
          description: 'Chart timeframe (M1, M5, H1)',
        },
      },
    },
  },
  {
    name: 'mt5_knowledge_get_strategy_templates',
    description: 'Fetch battle-tested strategy templates from the Knowledge Base (EMA Trend Rider, Bollinger Reversion, Donchian Breakout, Multi-Indicator Consensus).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_knowledge_get_market_speed',
    description: 'Retrieve real-time market velocity, tick momentum speed, hourly speed heatmap, and peak velocity records.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker',
        },
      },
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



