import { Database } from 'sql.js';
import { normalizeTimeframe } from '../utils/timeframe.js';
import { normalizeSymbol } from '../utils/symbol.js';
import { selectRows } from './helpers.js';

export function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      symbol TEXT,
      order_type TEXT,
      volume REAL,
      price REAL,
      sl REAL,
      tp REAL,
      ticket INTEGER,
      magic INTEGER,
      comment TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      deal_ticket INTEGER,
      execution_price REAL,
      execution_time_ms INTEGER,
      error_code INTEGER,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      executed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS positions_history (
      ticket INTEGER PRIMARY KEY,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      volume REAL NOT NULL,
      open_price REAL NOT NULL,
      close_price REAL,
      sl REAL,
      tp REAL,
      profit REAL,
      swap REAL,
      magic INTEGER,
      comment TEXT,
      open_time INTEGER NOT NULL,
      close_time INTEGER,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login INTEGER NOT NULL,
      balance REAL NOT NULL,
      equity REAL NOT NULL,
      margin REAL NOT NULL,
      free_margin REAL NOT NULL,
      margin_level REAL NOT NULL,
      profit REAL NOT NULL,
      currency TEXT,
      server TEXT,
      created_at INTEGER NOT NULL,
      created_at_iso TEXT
    );

    CREATE TABLE IF NOT EXISTS candles_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      time INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      spread REAL DEFAULT 0,
      real_volume REAL DEFAULT 0,
      time_iso TEXT,
      UNIQUE(symbol, timeframe, time)
    );

    CREATE TABLE IF NOT EXISTS ticks_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      bid REAL NOT NULL,
      ask REAL NOT NULL,
      spread INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      time_iso TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      source TEXT NOT NULL,
      ticket INTEGER
    );

    CREATE TABLE IF NOT EXISTS risk_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      global_tp_usd REAL NOT NULL,
      global_sl_usd REAL NOT NULL,
      max_drawdown_pct REAL NOT NULL,
      kill_switch INTEGER NOT NULL,
      trailing_enabled INTEGER NOT NULL,
      trailing_distance INTEGER NOT NULL,
      trailing_step INTEGER NOT NULL,
      max_lot_size REAL NOT NULL,
      max_open_positions INTEGER NOT NULL,
      allowed_symbols_json TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      status TEXT NOT NULL,
      tags_json TEXT,
      author TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      symbol TEXT,
      timeframe TEXT,
      strategy_id TEXT,
      category TEXT NOT NULL,
      tags_json TEXT,
      metrics_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backtest_results (
      id TEXT PRIMARY KEY,
      strategy_id TEXT NOT NULL,
      strategy_name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      candle_count INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      start_time_iso TEXT,
      end_time INTEGER NOT NULL,
      end_time_iso TEXT,
      initial_deposit REAL NOT NULL,
      final_equity REAL NOT NULL,
      net_profit REAL NOT NULL,
      profit_factor REAL NOT NULL,
      win_rate_pct REAL NOT NULL,
      total_trades INTEGER NOT NULL,
      winning_trades INTEGER NOT NULL,
      losing_trades INTEGER NOT NULL,
      max_drawdown_pct REAL NOT NULL,
      max_drawdown_usd REAL NOT NULL,
      average_trade_profit REAL NOT NULL,
      average_win REAL NOT NULL,
      average_loss REAL NOT NULL,
      risk_reward_ratio REAL NOT NULL,
      trades_json TEXT NOT NULL,
      equity_curve_json TEXT NOT NULL,
      evaluated_at INTEGER NOT NULL,
      data_quality TEXT NOT NULL DEFAULT 'LIVE',
      knowledge_assisted INTEGER DEFAULT 0,
      news_filter_active INTEGER DEFAULT 0,
      proof_summary TEXT,
      comparison_json TEXT,
      caught_news_json TEXT,
      trades_avoided_due_to_news INTEGER DEFAULT 0,
      losses_prevented_usd REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS knowledge_telemetry (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      velocity REAL NOT NULL,
      price REAL NOT NULL,
      direction TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      hour_key TEXT NOT NULL,
      tags_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_news_cache (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      source TEXT,
      sentiment TEXT NOT NULL,
      sentiment_score INTEGER NOT NULL,
      impact TEXT NOT NULL,
      relevant_symbols_json TEXT,
      published_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS economic_calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      country TEXT NOT NULL,
      currency TEXT NOT NULL,
      impact TEXT NOT NULL,
      scheduled_time INTEGER NOT NULL,
      scheduled_time_iso TEXT NOT NULL,
      forecast TEXT,
      previous TEXT,
      actual TEXT,
      affected_symbols_json TEXT NOT NULL,
      description TEXT,
      category TEXT,
      data_quality TEXT NOT NULL DEFAULT 'LIVE',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS symbol_regimes (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      regime TEXT NOT NULL,
      regime_label TEXT NOT NULL,
      trend_strength INTEGER NOT NULL,
      volatility_state TEXT NOT NULL,
      tradeability_score INTEGER NOT NULL,
      dominant_bias TEXT NOT NULL,
      support_price REAL,
      resistance_price REAL,
      pivot_point REAL,
      tactics_json TEXT,
      detected_at INTEGER NOT NULL,
      detected_at_iso TEXT
    );

    CREATE TABLE IF NOT EXISTS symbol_auto_detect_profiles (
      symbol TEXT PRIMARY KEY,
      asset_class TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      liquidity_score INTEGER NOT NULL,
      volatility_regime TEXT NOT NULL,
      safety_score INTEGER NOT NULL,
      safety_grade TEXT NOT NULL,
      analyzed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_trades (
      id TEXT PRIMARY KEY,
      signal_id TEXT,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      volume REAL NOT NULL,
      entry_price REAL NOT NULL,
      stop_loss REAL,
      take_profit REAL,
      command_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      profit REAL NOT NULL DEFAULT 0,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS bot_signals (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      direction TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      entry_price REAL NOT NULL,
      stop_loss REAL NOT NULL,
      take_profit REAL NOT NULL,
      risk_reward_ratio REAL NOT NULL,
      reasons_json TEXT,
      warnings_json TEXT,
      data_quality TEXT NOT NULL DEFAULT 'LIVE',
      generated_at INTEGER NOT NULL,
      acted_on INTEGER NOT NULL DEFAULT 0,
      trade_id TEXT
    );

    CREATE TABLE IF NOT EXISTS bot_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      config_json TEXT NOT NULL,
      mode TEXT,
      symbols_json TEXT,
      timeframe TEXT,
      min_confidence REAL,
      risk_percent REAL,
      max_open_positions INTEGER,
      cooldown_ms INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rapid_shocks_history (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      shock_type TEXT NOT NULL,
      reaction_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      pip_displacement REAL NOT NULL,
      pip_range REAL NOT NULL,
      atr_multiplier REAL NOT NULL,
      duration_seconds INTEGER NOT NULL,
      pip_velocity REAL NOT NULL,
      spread_points INTEGER NOT NULL,
      spread_pips REAL NOT NULL,
      cooling_off_minutes INTEGER NOT NULL,
      news_id TEXT,
      catalyst_title TEXT,
      catalyst_source TEXT,
      catalyst_time_iso TEXT,
      catalyst_delta_sec INTEGER,
      attribution_confidence INTEGER,
      attribution_reasoning TEXT,
      tactical_directive TEXT,
      safe_to_trade INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      timestamp_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chart_diagnostics_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      period_seconds INTEGER NOT NULL,
      server_time INTEGER NOT NULL,
      server_time_iso TEXT NOT NULL,
      gmt_time INTEGER NOT NULL,
      gmt_time_iso TEXT NOT NULL,
      broker_timezone_offset REAL,
      current_bar_time INTEGER,
      current_bar_time_iso TEXT,
      bar_elapsed_seconds INTEGER,
      bar_remaining_seconds INTEGER,
      bar_progress_pct INTEGER,
      is_bar_closed INTEGER NOT NULL,
      spread_points INTEGER NOT NULL,
      spread_pips REAL NOT NULL,
      tick_volume INTEGER,
      real_volume INTEGER,
      recorded_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_symbol_intelligence (
      symbol TEXT PRIMARY KEY,
      asset_class TEXT NOT NULL,
      typical_spread REAL DEFAULT 0,
      spread_min REAL DEFAULT 0,
      spread_max REAL DEFAULT 0,
      spread_rollover_expansion REAL DEFAULT 0,
      atr_m1 REAL DEFAULT 0,
      atr_m15 REAL DEFAULT 0,
      atr_h1 REAL DEFAULT 0,
      atr_d1 REAL DEFAULT 0,
      optimal_sessions_json TEXT,
      pattern_performance_json TEXT,
      key_levels_json TEXT,
      best_trading_hours_json TEXT,
      summary TEXT,
      protective_params_json TEXT,
      volatility_state TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_telemetry_aggregate (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_observations INTEGER NOT NULL,
      global_average_speed REAL NOT NULL,
      peak_velocity_registered REAL NOT NULL,
      time_of_day_patterns_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Indices for high performance queries
    CREATE INDEX IF NOT EXISTS idx_bot_trades_symbol ON bot_trades(symbol, opened_at);
    CREATE INDEX IF NOT EXISTS idx_bot_signals_symbol ON bot_signals(symbol, generated_at);
    CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles_history(symbol, timeframe, time);
    CREATE INDEX IF NOT EXISTS idx_ticks_lookup ON ticks_history(symbol, timestamp);
    CREATE INDEX IF NOT EXISTS idx_strategies_symbol ON strategies(symbol, status);
    CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON backtest_results(strategy_id, evaluated_at);
    CREATE INDEX IF NOT EXISTS idx_observations_cat ON observations(category, created_at);
    CREATE INDEX IF NOT EXISTS idx_account_created ON account_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_telemetry_sym ON knowledge_telemetry(symbol, timestamp);
    CREATE INDEX IF NOT EXISTS idx_news_published ON knowledge_news_cache(published_at);
    CREATE INDEX IF NOT EXISTS idx_regimes_sym ON symbol_regimes(symbol, detected_at);
    CREATE INDEX IF NOT EXISTS idx_autodetect_sym ON symbol_auto_detect_profiles(symbol, updated_at);
    CREATE INDEX IF NOT EXISTS idx_positions_hist_sym ON positions_history(symbol, open_time);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_candles_symbol_tf ON candles_history(UPPER(symbol), UPPER(timeframe), time);
    CREATE INDEX IF NOT EXISTS idx_ticks_symbol ON ticks_history(UPPER(symbol), timestamp);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_ts ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON knowledge_telemetry(timestamp);
    CREATE INDEX IF NOT EXISTS idx_rapid_shocks_sym ON rapid_shocks_history(symbol, timestamp);
    CREATE INDEX IF NOT EXISTS idx_chart_diag_sym ON chart_diagnostics_history(symbol, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_economic_events_time ON economic_calendar_events(scheduled_time);
  `);

  // Run dynamic schema migrations safely for existing tables
  try { db.exec('ALTER TABLE candles_history ADD COLUMN spread REAL DEFAULT 0;'); } catch (_) {}
  try { db.exec('ALTER TABLE candles_history ADD COLUMN real_volume REAL DEFAULT 0;'); } catch (_) {}
  try { db.exec('ALTER TABLE knowledge_symbol_intelligence ADD COLUMN protective_params_json TEXT;'); } catch (_) {}
  try { db.exec('ALTER TABLE knowledge_symbol_intelligence ADD COLUMN volatility_state TEXT;'); } catch (_) {}
}

export function migrateSchema(db: Database): void {
  try {
    const additions: { table: string; column: string; definition: string }[] = [
      { table: 'account_history', column: 'created_at_iso', definition: 'TEXT' },
      { table: 'candles_history', column: 'time_iso', definition: 'TEXT' },
      { table: 'ticks_history', column: 'time_iso', definition: 'TEXT' },
      { table: 'backtest_results', column: 'data_quality', definition: "TEXT NOT NULL DEFAULT 'LIVE'" },
      { table: 'backtest_results', column: 'knowledge_assisted', definition: 'INTEGER DEFAULT 0' },
      { table: 'backtest_results', column: 'news_filter_active', definition: 'INTEGER DEFAULT 0' },
      { table: 'backtest_results', column: 'proof_summary', definition: 'TEXT' },
      { table: 'backtest_results', column: 'comparison_json', definition: 'TEXT' },
      { table: 'backtest_results', column: 'caught_news_json', definition: 'TEXT' },
      { table: 'backtest_results', column: 'trades_avoided_due_to_news', definition: 'INTEGER DEFAULT 0' },
      { table: 'backtest_results', column: 'losses_prevented_usd', definition: 'REAL DEFAULT 0' },
      { table: 'risk_settings', column: 'allowed_symbols_json', definition: 'TEXT' },
    ];

    for (const { table, column, definition } of additions) {
      const info = db.exec(`PRAGMA table_info(${table})`);
      const cols = info.length > 0 ? info[0].values.map((r: any) => String(r[1])) : [];
      if (cols.length > 0 && !cols.includes(column)) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`[DB] Migrated ${table}: added missing column "${column}"`);
      }
    }
  } catch (err: any) {
    console.warn('[DB] Schema migration notice:', err?.message);
  }

  migrateSymbolAndTimeframeVocabulary(db);
}

export function migrateSymbolAndTimeframeVocabulary(db: Database): void {
  try {
    const candleRows = selectRows(db, 'SELECT DISTINCT symbol, timeframe FROM candles_history');
    for (const row of candleRows) {
      const oldSymbol = String(row.symbol);
      const oldTimeframe = String(row.timeframe);
      const symbol = normalizeSymbol(oldSymbol);
      const timeframe = normalizeTimeframe(oldTimeframe);
      if (symbol === oldSymbol && timeframe === oldTimeframe) continue;

      db.run('UPDATE OR REPLACE candles_history SET symbol = ?, timeframe = ? WHERE symbol = ? AND timeframe = ?', [
        symbol,
        timeframe,
        oldSymbol,
        oldTimeframe,
      ]);
    }

    const tickRows = selectRows(db, 'SELECT DISTINCT symbol FROM ticks_history');
    for (const row of tickRows) {
      const symbol = normalizeSymbol(row.symbol);
      if (!symbol || symbol === String(row.symbol)) continue;
      db.run('UPDATE ticks_history SET symbol = ? WHERE symbol = ?', [symbol, String(row.symbol)]);
    }
  } catch (err: any) {
    console.warn('[DB] Symbol/timeframe normalisation notice:', err?.message);
  }
}
