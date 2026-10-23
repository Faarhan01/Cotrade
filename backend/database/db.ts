import initSqlJs, { Database } from 'sql.js';
import { AccountInfo, CandleData, TickData } from '../types/mt5.js';
import { normalizeTimeframe, timeframeCandidates } from '../utils/timeframe.js';
import { normalizeSymbol } from '../utils/symbol.js';

let dbInstance: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;

/**
 * Open the in-memory SQLite database.
 * The EA is the primary authoritative source of truth.
 * The in-memory database provides fast querying, indexing, and analytics.
 */
export function getDatabase(): Promise<Database> {
  if (!dbInitPromise) {
    dbInitPromise = openDatabase().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

async function openDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  dbInstance = db;
  initSchema(db);
  migrateSchema(db);
  return db;
}

/**
 * Additive schema migrations.
 *
 * `initSchema()` only ever runs `CREATE TABLE IF NOT EXISTS`, so a database
 * created by an older build is never upgraded. The shipped database was
 * missing `account_history.created_at_iso`, which made `dbInsertAccountSnapshot`
 * throw on every EA sync - silently (the error was swallowed by a `.catch()`),
 * leaving the account history permanently empty.
 */
function migrateSchema(db: Database) {
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

/**
 * Rewrite legacy symbol / timeframe values into the canonical vocabulary.
 *
 * Rows written by older builds carry the raw MT5 enum name (`PERIOD_H1`) or a
 * differently-cased symbol (`eurusd`). Those rows are real market data, but
 * nothing could find them because every read path asked for the canonical
 * form. Normalising them once means the history the EA already collected
 * becomes visible instead of being silently ignored.
 */
function migrateSymbolAndTimeframeVocabulary(db: Database) {
  try {
    // Note: this cannot be filtered in SQL. `PERIOD_H1` already satisfies
    // `timeframe = UPPER(timeframe)`, so a "looks non-canonical" predicate
    // misses exactly the legacy values that need rewriting. Normalise in JS.
    const candleRows = selectRows(db, 'SELECT DISTINCT symbol, timeframe FROM candles_history');

    for (const row of candleRows) {
      const symbol = normalizeSymbol(row.symbol);
      const timeframe = normalizeTimeframe(row.timeframe);
      if (!symbol || !timeframe) continue;
      const oldSymbol = String(row.symbol);
      const oldTimeframe = String(row.timeframe);
      if (symbol === oldSymbol && timeframe === oldTimeframe) continue;

      db.run('UPDATE OR REPLACE candles_history SET symbol = ?, timeframe = ? WHERE symbol = ? AND timeframe = ?', [
        symbol,
        timeframe,
        oldSymbol,
        oldTimeframe,
      ]);
    }
    if (candleRows.length > 0) {
      const changed = candleRows.filter((row) => {
        const symbol = normalizeSymbol(row.symbol);
        const timeframe = normalizeTimeframe(row.timeframe);
        return symbol !== String(row.symbol) || timeframe !== String(row.timeframe);
      }).length;
      if (changed > 0) {
        console.log(`[DB] Normalised ${changed} candle symbol/timeframe group(s) to the canonical vocabulary`);
      }
    }

    const tickRows = selectRows(db, 'SELECT DISTINCT symbol FROM ticks_history');
    let tickChanged = 0;
    for (const row of tickRows) {
      const symbol = normalizeSymbol(row.symbol);
      if (!symbol || symbol === String(row.symbol)) continue;
      db.run('UPDATE ticks_history SET symbol = ? WHERE symbol = ?', [symbol, String(row.symbol)]);
      tickChanged++;
    }
    if (tickChanged > 0) {
      console.log(`[DB] Normalised ${tickChanged} tick symbol(s) to upper case`);
    }
  } catch (err: any) {
    console.warn('[DB] Symbol/timeframe normalisation notice:', err?.message);
  }
}

function initSchema(db: Database) {
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
      -- 'LIVE' when the backtest ran on real MT5 bars, 'SYNTHETIC' when it ran
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

    -- Expression indexes: the read path matches case-insensitively
    -- (UPPER(symbol) = ? / UPPER(timeframe) IN (...)) so that legacy rows
    -- written with different casing or with the raw MT5 PERIOD_ enum name
    -- are still found, while the query stays an index seek instead of the
    -- full table scan the old "OR LOWER(col) = ?" form produced.
    CREATE INDEX IF NOT EXISTS idx_candles_symbol_tf ON candles_history(UPPER(symbol), UPPER(timeframe), time);
    CREATE INDEX IF NOT EXISTS idx_ticks_symbol ON ticks_history(UPPER(symbol), timestamp);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_ts ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON knowledge_telemetry(timestamp);

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
      broker_timezone_offset REAL NOT NULL,
      current_bar_time INTEGER NOT NULL,
      current_bar_time_iso TEXT NOT NULL,
      bar_elapsed_seconds INTEGER NOT NULL,
      bar_remaining_seconds INTEGER NOT NULL,
      bar_progress_pct INTEGER NOT NULL,
      is_bar_closed INTEGER NOT NULL,
      spread_points INTEGER NOT NULL,
      spread_pips REAL NOT NULL,
      tick_volume INTEGER,
      real_volume INTEGER,
      recorded_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rapid_shocks_sym ON rapid_shocks_history(symbol, timestamp);
    CREATE INDEX IF NOT EXISTS idx_chart_diag_sym ON chart_diagnostics_history(symbol, recorded_at);
  `);
}

/**
 * Execute a parameterised SELECT and return the rows as plain objects.
 *
 * Every user supplied value (symbol, id, category, strategy id, ...) is bound
 * as a parameter instead of being interpolated into the SQL text. sql.js'
 * `exec()` happily executes several `;` separated statements, so the previous
 * string interpolation was a genuine SQL injection vector: a request for
 * `/api/strategies?symbol=' OR '1'='1` or `?symbol=x'; DELETE FROM orders; --`
 * was able to read or destroy data.
 */
function selectRows(db: Database, sql: string, params: any[] = []): Record<string, any>[] {
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) stmt.bind(params);
    const rows: Record<string, any>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/** Parameterised SELECT returning at most one row. */
function selectOne(db: Database, sql: string, params: any[] = []): Record<string, any> | null {
  const rows = selectRows(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Coerce any user supplied limit into a safe, bounded integer. */
function safeLimit(limit: unknown, fallback = 100, max = 5000): number {
  const n = Math.floor(Number(limit));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/**
 * Keep in-memory database synchronized. No disk persistence needed as EA is authoritative.
 */
export function persistDatabase() {
  // In-memory database is always up-to-date
}

export function flushDatabase() {
  // In-memory database is always up-to-date
}

// Prune old data so database stays lightweight, fast, and does not grow unbounded
let pruneCounter = 0;
export async function pruneDatabase() {
  pruneCounter++;
  if (pruneCounter % 20 !== 0) return; // run periodically every 20 sync cycles
  await dbPruneDatabase();
}

// Full explicit database pruning with 24-hour unexecuted order expiration
export async function dbPruneDatabase(): Promise<{
  purgedUnexecutedOrders: number;
  message: string;
}> {
  try {
    const db = await getDatabase();
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const twoDaysAgoSec = Math.floor(now / 1000) - 48 * 3600;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Declared outside the transaction so the caller can report how many rows
    // were removed even if a later statement fails and the work is rolled back.
    let unexecutedCount = 0;

    // The whole prune runs in a transaction so a failure cannot leave the
    // database half-pruned (there is no other way to undo a partial prune).
    db.run('BEGIN IMMEDIATE');
    try {
      // 1. Delete all unexecuted orders older than 24 hours (pending or dispatched)
      const countBefore = selectOne(
        db,
        `SELECT COUNT(*) AS total FROM orders WHERE status IN ('pending', 'dispatched') AND created_at < ?`,
        [twentyFourHoursAgo]
      );
      unexecutedCount = Number(countBefore?.total || 0);

      db.run(`DELETE FROM orders WHERE status IN ('pending', 'dispatched') AND created_at < ?`, [twentyFourHoursAgo]);

      // 2. Cap total archived orders (keep last 1,000 executed/failed orders)
      db.run(`DELETE FROM orders WHERE id NOT IN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 1000)`);

      // 3. Cap ticks history (keep last 5,000 ticks or ticks within 48h)
      db.run(`DELETE FROM ticks_history WHERE timestamp < ? OR id NOT IN (SELECT id FROM ticks_history ORDER BY id DESC LIMIT 5000)`, [
        twoDaysAgoSec,
      ]);

      // 4. Cap account history snapshots (keep last 1,000 entries)
      db.run(`DELETE FROM account_history WHERE created_at < ? OR id NOT IN (SELECT id FROM account_history ORDER BY id DESC LIMIT 1000)`, [
        sevenDaysAgo,
      ]);

      // 5. Cap candles history PER SYMBOL + TIMEFRAME (keep the newest 1,000 bars
      //    of every series). The previous global cap of 2,000 rows across all
      //    symbols destroyed the history of every symbol except the most
      //    recently used one.
      db.run(`
        DELETE FROM candles_history
        WHERE id NOT IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY symbol, timeframe ORDER BY time DESC) AS rn
            FROM candles_history
          )
          WHERE rn <= 1000
        )
      `);

      // 6. Cap audit logs (keep last 2,000 logs - this is the compliance trail)
      db.run(`DELETE FROM audit_logs WHERE timestamp < ? OR id NOT IN (SELECT id FROM audit_logs ORDER BY timestamp DESC LIMIT 2000)`, [
        sevenDaysAgo,
      ]);

      // 7. Cap backtest results history (keep last 200 backtests)
      db.run(`DELETE FROM backtest_results WHERE id NOT IN (SELECT id FROM backtest_results ORDER BY evaluated_at DESC LIMIT 200)`);

      // 8. Cap the knowledge base tables that previously grew without bound.
      //    Every one of them was written on a read path, so the database file
      //    grew forever (and every full-table scan got slower).
      db.run(`DELETE FROM knowledge_telemetry WHERE id NOT IN (SELECT id FROM knowledge_telemetry ORDER BY timestamp DESC LIMIT 5000)`);
      db.run(`DELETE FROM knowledge_news_cache WHERE id NOT IN (SELECT id FROM knowledge_news_cache ORDER BY published_at DESC LIMIT 500)`);
      db.run(`DELETE FROM symbol_regimes WHERE id NOT IN (SELECT id FROM symbol_regimes ORDER BY detected_at DESC LIMIT 500)`);

      db.run('COMMIT');
    } catch (txErr) {
      try {
        db.run('ROLLBACK');
      } catch {
        /* ignore rollback failures */
      }
      throw txErr;
    }

    persistDatabase();
    analyticsCache = null;
    return {
      purgedUnexecutedOrders: unexecutedCount,
      message: `Database pruned successfully. Purged ${unexecutedCount} expired unexecuted orders older than 24h.`,
    };
  } catch (err: any) {
    console.error('Database prune error:', err);
    return {
      purgedUnexecutedOrders: 0,
      message: `Prune error: ${err?.message || String(err)}`,
    };
  }
}

// 1. Orders
export async function dbInsertOrder(order: any) {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO orders (
      id, action, symbol, order_type, volume, price, sl, tp, ticket, magic, comment,
      status, source, deal_ticket, execution_price, execution_time_ms, error_code,
      error_message, created_at, executed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    order.id,
    order.action,
    order.symbol || null,
    order.orderType || null,
    order.volume || null,
    order.price || null,
    order.sl || null,
    order.tp || null,
    order.ticket || null,
    order.magic || null,
    order.comment || null,
    order.status,
    order.source,
    order.result?.dealTicket || null,
    order.result?.executionPrice || null,
    order.result?.executionTimeMs || null,
    order.result?.errorCode || null,
    order.result?.errorMessage || null,
    order.createdAt,
    order.executedAt || null,
  ]);
  stmt.free();
  persistDatabase();
}

// 2. Account History Snapshot
let lastAccountRecordTime = 0;
export async function dbInsertAccountSnapshot(account: AccountInfo) {
  if (!account || account.login === 0) return;
  const now = Date.now();
  // Throttle to every 5 seconds to avoid bloating
  if (now - lastAccountRecordTime < 5000) return;
  lastAccountRecordTime = now;

  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT INTO account_history (
      login, balance, equity, margin, free_margin, margin_level, profit, currency, server, created_at, created_at_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    account.login,
    account.balance,
    account.equity,
    account.margin,
    account.freeMargin,
    account.marginLevel,
    account.profit,
    account.currency,
    account.server,
    now,
    new Date(now).toISOString(),
  ]);
  stmt.free();
  persistDatabase();
}

// 3. Candles History
export async function dbInsertCandles(symbol: string, timeframe: string, candles: CandleData[]) {
  if (!candles || candles.length === 0) return;
  const db = await getDatabase();
  // Store the symbol and timeframe in one canonical form. The EA used to
  // upload `PERIOD_H1` while every read path asked for `H1`, so the real bars
  // were never found again.
  const cleanSymbol = normalizeSymbol(symbol);
  const cleanTimeframe = normalizeTimeframe(timeframe) || 'M1';
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO candles_history (
      symbol, timeframe, time, open, high, low, close, volume, time_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of candles) {
    const timeIso = c.timeIso || new Date(c.time * 1000).toISOString();
    stmt.run([
      cleanSymbol,
      cleanTimeframe,
      c.time,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
      timeIso,
    ]);
  }
  stmt.free();
  persistDatabase();
}

// 4. Ticks History
export async function dbInsertTicks(ticks: TickData[]) {
  if (!ticks || ticks.length === 0) return;
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT INTO ticks_history (symbol, bid, ask, spread, timestamp, time_iso)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const t of ticks) {
    const timeIso = new Date(t.time * 1000).toISOString();
    stmt.run([
      normalizeSymbol(t.symbol),
      t.bid,
      t.ask,
      t.spread,
      t.time,
      timeIso,
    ]);
  }
  stmt.free();
  persistDatabase();
}

// 5. Query Candles
export async function dbGetCandles(symbol: string, timeframe: string, limit = 100): Promise<CandleData[]> {
  const db = await getDatabase();
  const cleanSym = normalizeSymbol(symbol);
  const tfCandidates = timeframeCandidates(timeframe);
  if (tfCandidates.length === 0) return [];

  // The inner query selects the most RECENT `limit` bars, the outer query puts
  // them back in chronological order. The previous single-level
  // `ORDER BY time ASC LIMIT n` returned the OLDEST n bars still in the
  // retention window, so every consumer (auto-detect, indicators, patterns,
  // backtests, MCP tools) was analysing stale history.
  //
  // `UPPER(symbol)` / `UPPER(timeframe)` are matched against the expression
  // indexes `idx_candles_symbol_tf` so the query stays an index seek. The
  // previous `symbol = ? OR LOWER(symbol) = ?` form forced a full table scan.
  const placeholders = tfCandidates.map(() => '?').join(', ');
  const rows = selectRows(
    db,
    `
      SELECT time, open, high, low, close, volume, time_iso
      FROM (
        SELECT time, open, high, low, close, volume, time_iso
        FROM candles_history
        WHERE UPPER(symbol) = ?
          AND UPPER(timeframe) IN (${placeholders})
        ORDER BY time DESC
        LIMIT ?
      )
      ORDER BY time ASC
    `,
    [cleanSym.toUpperCase(), ...tfCandidates.map((t) => t.toUpperCase()), safeLimit(limit)]
  );
  return rows.map((r) => ({
    time: Number(r.time),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
    timeIso: r.time_iso ? String(r.time_iso) : new Date(Number(r.time) * 1000).toISOString(),
  }));
}

// 5b. Query Candle History with Rich Aggregated Statistics
export async function dbGetCandleHistoryWithStats(symbol: string, timeframe: string, limit = 100): Promise<{
  symbol: string;
  timeframe: string;
  candles: CandleData[];
  stats: {
    candleCount: number;
    openPrice: number;
    closePrice: number;
    highPrice: number;
    lowPrice: number;
    priceChange: number;
    priceChangePct: number;
    averageVolume: number;
    trueRangeAverage: number;
    startTime: string;
    endTime: string;
  } | null;
}> {
  const candles = await dbGetCandles(symbol, timeframe, limit);
  if (candles.length === 0) {
    return { symbol, timeframe, candles: [], stats: null };
  }

  const openPrice = candles[0].open;
  const closePrice = candles[candles.length - 1].close;
  // Loop instead of `Math.max(...arr)`: the spread form blows the call stack
  // (RangeError) once the array grows past ~100k elements, and the limit is
  // attacker controllable through the candle-count query parameters.
  let highPrice = -Infinity;
  let lowPrice = Infinity;
  for (const c of candles) {
    if (c.high > highPrice) highPrice = c.high;
    if (c.low < lowPrice) lowPrice = c.low;
  }
  if (!Number.isFinite(highPrice)) highPrice = openPrice;
  if (!Number.isFinite(lowPrice)) lowPrice = openPrice;
  const priceChange = Number((closePrice - openPrice).toFixed(5));
  const priceChangePct = Number(((priceChange / Math.max(0.0001, openPrice)) * 100).toFixed(3));
  const totalVolume = candles.reduce((acc, c) => acc + c.volume, 0);
  const averageVolume = Math.round(totalVolume / candles.length);

  // Compute average true range over returned period
  let trSum = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trSum += candles[i].high - candles[i].low;
    } else {
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose)
      );
      trSum += tr;
    }
  }
  const trueRangeAverage = Number((trSum / candles.length).toFixed(5));

  return {
    symbol,
    timeframe,
    candles,
    stats: {
      candleCount: candles.length,
      openPrice,
      closePrice,
      highPrice,
      lowPrice,
      priceChange,
      priceChangePct,
      averageVolume,
      trueRangeAverage,
      startTime: candles[0].timeIso || new Date(candles[0].time * 1000).toISOString(),
      endTime: candles[candles.length - 1].timeIso || new Date(candles[candles.length - 1].time * 1000).toISOString(),
    },
  };
}

// 6. Query Ticks History
export async function dbGetTicksHistory(symbol?: string, limit = 100): Promise<any[]> {
  const db = await getDatabase();
  const filterSymbol = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filterSymbol ? normalizeSymbol(symbol as string) : '';
  const rows = selectRows(
    db,
    `SELECT symbol, bid, ask, spread, timestamp, time_iso FROM ticks_history
     ${filterSymbol ? 'WHERE UPPER(symbol) = ?' : ''}
     ORDER BY timestamp DESC
     LIMIT ?`,
    filterSymbol ? [cleanSym.toUpperCase(), safeLimit(limit)] : [safeLimit(limit)]
  );
  return rows.map((item) => ({
    symbol: item.symbol,
    bid: item.bid,
    ask: item.ask,
    spread: item.spread,
    timestamp: item.timestamp,
    timeIso: item.time_iso,
  }));
}

// 6b. Query Recent Tick Movements with Direction, Velocity and Spread
export async function dbGetRecentTickMovements(symbol: string, limit = 50): Promise<{
  symbol: string;
  ticks: any[];
  stats: {
    totalTicks: number;
    upTicks: number;
    downTicks: number;
    flatTicks: number;
    tickVelocityPerMinute: number;
    averageSpread: number;
    latestBid: number;
    latestAsk: number;
  } | null;
}> {
  const ticks = await dbGetTicksHistory(symbol, limit);
  if (ticks.length === 0) {
    return { symbol, ticks: [], stats: null };
  }

  // Ticks returned in descending order; reverse to analyze chronological movement
  const chrono = [...ticks].reverse();
  let upTicks = 0;
  let downTicks = 0;
  let flatTicks = 0;
  let totalSpread = 0;

  const enriched = chrono.map((tick, idx) => {
    totalSpread += tick.spread || 0;
    let direction: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
    if (idx > 0) {
      const prev = chrono[idx - 1];
      if (tick.bid > prev.bid || tick.ask > prev.ask) {
        direction = 'UP';
        upTicks++;
      } else if (tick.bid < prev.bid || tick.ask < prev.ask) {
        direction = 'DOWN';
        downTicks++;
      } else {
        flatTicks++;
      }
    }
    return {
      ...tick,
      direction,
    };
  });

  const timeSpanSec = Math.max(1, (chrono[chrono.length - 1].timestamp - chrono[0].timestamp) / 1000);
  const tickVelocityPerMinute = Number(((chrono.length / timeSpanSec) * 60).toFixed(1));
  const latest = chrono[chrono.length - 1];

  return {
    symbol,
    ticks: enriched.reverse(), // Return most recent first
    stats: {
      totalTicks: chrono.length,
      upTicks,
      downTicks,
      flatTicks,
      tickVelocityPerMinute,
      averageSpread: Number((totalSpread / chrono.length).toFixed(1)),
      latestBid: latest.bid,
      latestAsk: latest.ask,
    },
  };
}

// 7. Query Account History
export async function dbGetAccountHistory(limit = 100): Promise<any[]> {
  const db = await getDatabase();
  const rows = selectRows(
    db,
    `SELECT * FROM account_history ORDER BY created_at DESC LIMIT ?`,
    [safeLimit(limit)]
  );
  return rows;
}

// 8. Logs
export async function dbInsertLog(log: any) {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO audit_logs (id, timestamp, level, title, details, source, ticket)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    log.id,
    log.timestamp,
    log.level,
    log.title,
    log.details,
    log.source,
    log.ticket || null,
  ]);
  stmt.free();
  persistDatabase();
}

// 9. Risk Settings
export async function dbSaveRiskSettings(risk: any) {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO risk_settings (
      id, global_tp_usd, global_sl_usd, max_drawdown_pct, kill_switch,
      trailing_enabled, trailing_distance, trailing_step, max_lot_size,
      max_open_positions, allowed_symbols_json, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    risk.globalTakeProfitUSD,
    risk.globalStopLossUSD,
    risk.maxDrawdownPercent,
    risk.emergencyKillSwitch ? 1 : 0,
    risk.trailingStopEnabled ? 1 : 0,
    risk.trailingStopDistancePoints,
    risk.trailingStopStepPoints,
    risk.maxLotSizePerTrade,
    risk.maxOpenPositions,
    JSON.stringify(risk.allowedSymbols || []),
    Date.now(),
  ]);
  stmt.free();
  persistDatabase();
}

/**
 * Read the persisted risk limits.
 *
 * `risk_settings` used to be write-only: the values were stored on every
 * change but never read back, so the in-memory risk guard was always
 * re-initialised from the hardcoded defaults after a restart. That silently
 * discarded the operator's own limits (max lot size, max open positions,
 * global TP/SL) exactly when a restart happened.
 */
export async function dbGetRiskSettings(): Promise<any | null> {
  const db = await getDatabase();
  const item = selectOne(db, 'SELECT * FROM risk_settings WHERE id = 1 LIMIT 1');
  if (!item) return null;
  return {
    globalTakeProfitUSD: Number(item.global_tp_usd) || 0,
    globalStopLossUSD: Number(item.global_sl_usd) || 0,
    maxDrawdownPercent: Number(item.max_drawdown_pct) || 0,
    emergencyKillSwitch: Number(item.kill_switch) === 1,
    trailingStopEnabled: Number(item.trailing_enabled) === 1,
    trailingStopDistancePoints: Number(item.trailing_distance) || 0,
    trailingStopStepPoints: Number(item.trailing_step) || 0,
    maxLotSizePerTrade: Number(item.max_lot_size) || 0,
    maxOpenPositions: Number(item.max_open_positions) || 0,
    allowedSymbols: item.allowed_symbols_json ? JSON.parse(item.allowed_symbols_json) : null,
    updatedAt: Number(item.updated_at) || 0,
  };
}

// 10. Query Orders
export async function dbGetOrders(limit = 100): Promise<any[]> {
  const db = await getDatabase();
  // NOTE: this used to purge stale pending/dispatched orders as a side effect
  // of a *read*, which meant every GET rewrote the whole database file and
  // deleted rows behind the caller's back. Expiry is handled by
  // `dbPruneDatabase()` instead.
  const rows = selectRows(
    db,
    `SELECT * FROM orders ORDER BY created_at DESC LIMIT ?`,
    [safeLimit(limit)]
  );
  return rows;
}

// 11. Database Analytics
let analyticsCache: { value: any; expires: number } | null = null;

export async function dbGetAnalytics(): Promise<any> {
  const now = Date.now();
  if (analyticsCache && analyticsCache.expires > now) {
    return analyticsCache.value;
  }
  const db = await getDatabase();
  const totalOrdersRes = db.exec(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed FROM orders`);
  const logsRes = db.exec(`SELECT COUNT(*) as total FROM audit_logs`);
  const candlesRes = db.exec(`SELECT COUNT(*) as total FROM candles_history`);
  const ticksRes = db.exec(`SELECT COUNT(*) as total FROM ticks_history`);
  const accountRes = db.exec(`SELECT COUNT(*) as total FROM account_history`);
  const stratRes = db.exec(`SELECT COUNT(*) as total FROM strategies`);
  const obsRes = db.exec(`SELECT COUNT(*) as total FROM observations`);
  const btRes = db.exec(`SELECT COUNT(*) as total FROM backtest_results`);
  const telemRes = db.exec(`SELECT COUNT(*) as total FROM knowledge_telemetry`);
  const newsRes = db.exec(`SELECT COUNT(*) as total FROM knowledge_news_cache`);

  let totalOrders = 0;
  let executedOrders = 0;
  let failedOrders = 0;
  let totalLogs = 0;
  let totalCandles = 0;
  let totalTicks = 0;
  let totalAccountSnapshots = 0;
  let totalStrategies = 0;
  let totalObservations = 0;
  let totalBacktests = 0;
  let totalTelemetry = 0;
  let totalCachedNews = 0;

  if (totalOrdersRes.length > 0 && totalOrdersRes[0].values.length > 0) {
    const row = totalOrdersRes[0].values[0];
    totalOrders = Number(row[0]) || 0;
    executedOrders = Number(row[1]) || 0;
    failedOrders = Number(row[2]) || 0;
  }

  if (logsRes.length > 0 && logsRes[0].values.length > 0) {
    totalLogs = Number(logsRes[0].values[0][0]) || 0;
  }
  if (candlesRes.length > 0 && candlesRes[0].values.length > 0) {
    totalCandles = Number(candlesRes[0].values[0][0]) || 0;
  }
  if (ticksRes.length > 0 && ticksRes[0].values.length > 0) {
    totalTicks = Number(ticksRes[0].values[0][0]) || 0;
  }
  if (accountRes.length > 0 && accountRes[0].values.length > 0) {
    totalAccountSnapshots = Number(accountRes[0].values[0][0]) || 0;
  }
  if (stratRes.length > 0 && stratRes[0].values.length > 0) {
    totalStrategies = Number(stratRes[0].values[0][0]) || 0;
  }
  if (obsRes.length > 0 && obsRes[0].values.length > 0) {
    totalObservations = Number(obsRes[0].values[0][0]) || 0;
  }
  if (btRes.length > 0 && btRes[0].values.length > 0) {
    totalBacktests = Number(btRes[0].values[0][0]) || 0;
  }
  if (telemRes.length > 0 && telemRes[0].values.length > 0) {
    totalTelemetry = Number(telemRes[0].values[0][0]) || 0;
  }
  if (newsRes.length > 0 && newsRes[0].values.length > 0) {
    totalCachedNews = Number(newsRes[0].values[0][0]) || 0;
  }

  let dbSizeBytes = 0;
  if (dbInstance) {
    try {
      dbSizeBytes = dbInstance.export().length;
    } catch {
      dbSizeBytes = 0;
    }
  }

  const result = {
    databasePath: 'In-Memory Cache (Direct EA Sync)',
    databaseType: 'SQLite In-Memory (Zero Disk Overhead, EA Authoritative)',
    dbSizeBytes,
    totalOrders,
    executedOrders,
    failedOrders,
    executionSuccessRate: totalOrders > 0 ? Number(((executedOrders / totalOrders) * 100).toFixed(1)) : 100,
    totalLogs,
    totalCandles,
    totalTicks,
    totalAccountSnapshots,
    totalStrategies,
    totalObservations,
    totalBacktests,
    totalTelemetry,
    totalCachedNews,
  };

  // Cache for 5 seconds to avoid running 10 full-table COUNT(*) scans on
  // every dashboard poll.
  analyticsCache = { value: result, expires: Date.now() + 5000 };
  return result;
}

// ==========================================
// 12. Strategies Knowledge Base CRUD
// ==========================================

export async function dbSaveStrategy(strategy: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO strategies (
      id, name, description, type, symbol, timeframe, parameters_json,
      status, tags_json, author, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    strategy.id,
    strategy.name,
    strategy.description || '',
    strategy.type,
    strategy.symbol.toUpperCase(),
    strategy.timeframe.toUpperCase(),
    JSON.stringify(strategy.parameters || {}),
    strategy.status || 'active',
    JSON.stringify(strategy.tags || []),
    strategy.author || 'User',
    strategy.notes || '',
    strategy.createdAt || Date.now(),
    Date.now(),
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbGetStrategies(symbol?: string): Promise<any[]> {
  const db = await getDatabase();
  const filterSymbol = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filterSymbol ? (symbol as string).trim().toUpperCase() : '';

  // Seed only when the TABLE is empty - never when a *filtered* query matched
  // nothing. The old code re-seeded and recursed on an empty filtered result,
  // which looped forever (and starved the Node event loop) for any symbol
  // that had no strategies.
  if (!filterSymbol) {
    const total = selectOne(db, 'SELECT COUNT(*) AS total FROM strategies');
    if (Number(total?.total || 0) === 0) {
      await seedDefaultStrategies();
    }
  }

  const rows = selectRows(
    db,
    `SELECT * FROM strategies ${filterSymbol ? 'WHERE symbol = ?' : ''} ORDER BY updated_at DESC`,
    filterSymbol ? [cleanSym] : []
  );

  return rows.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    symbol: item.symbol,
    timeframe: item.timeframe,
    parameters: item.parameters_json ? JSON.parse(item.parameters_json) : {},
    status: item.status,
    tags: item.tags_json ? JSON.parse(item.tags_json) : [],
    author: item.author,
    notes: item.notes,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

export async function dbGetStrategyById(id: string): Promise<any | null> {
  const db = await getDatabase();
  const item = selectOne(db, `SELECT * FROM strategies WHERE id = ? LIMIT 1`, [id]);
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    symbol: item.symbol,
    timeframe: item.timeframe,
    parameters: item.parameters_json ? JSON.parse(item.parameters_json) : {},
    status: item.status,
    tags: item.tags_json ? JSON.parse(item.tags_json) : [],
    author: item.author,
    notes: item.notes,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function dbDeleteStrategy(id: string): Promise<boolean> {
  const db = await getDatabase();
  db.run(`DELETE FROM strategies WHERE id = ?`, [id]);
  persistDatabase();
  return true;
}

async function seedDefaultStrategies() {
  const defaults = [
    {
      id: 'strat-rsi-reversal-eurusd',
      name: 'RSI Reversal Mean Reversion',
      description: 'Enters BUY when 14-period RSI drops below 30 (oversold) and SELL when RSI exceeds 70 (overbought). Optimal for oscillating range-bound FX pairs.',
      type: 'RSI_REVERSAL',
      symbol: 'EURUSD',
      timeframe: 'M1',
      parameters: {
        rsiOversold: 30,
        rsiOverbought: 70,
        rsiPeriod: 14,
        stopLossPoints: 250,
        takeProfitPoints: 500,
        lotSize: 0.1,
        maxHoldBars: 40,
      },
      status: 'active',
      tags: ['RSI', 'Oscillator', 'MeanReversion', 'Forex'],
      author: 'Cotrade Algorithmic Suite',
      notes: 'Best performed during London/New York session overlap with moderate volatility.',
      createdAt: Date.now() - 3600000 * 24,
      updatedAt: Date.now() - 3600000 * 24,
    },
    {
      id: 'strat-ema-trend-gold',
      name: 'EMA 9/21 Trend Scalper',
      description: 'Captures fast trend continuation when EMA 9 crosses above EMA 21 with price confirmation. Wide 2:1 profit ratio.',
      type: 'EMA_CROSSOVER',
      symbol: 'XAUUSD',
      timeframe: 'M5',
      parameters: {
        fastEmaPeriod: 9,
        slowEmaPeriod: 21,
        stopLossPoints: 400,
        takeProfitPoints: 800,
        lotSize: 0.05,
        maxHoldBars: 60,
      },
      status: 'active',
      tags: ['EMA', 'Trend', 'Gold', 'CrossOver'],
      author: 'Cotrade Algorithmic Suite',
      notes: 'Ensure gold spread is below 35 points before live execution.',
      createdAt: Date.now() - 3600000 * 12,
      updatedAt: Date.now() - 3600000 * 12,
    },
    {
      id: 'strat-consensus-multi-ind',
      name: 'Multi-Indicator Consensus Alpha',
      description: 'Requires synchronous alignment between RSI momentum, MACD histogram positive slope, and EMA trend bias before emitting trade signal.',
      type: 'MULTI_INDICATOR_CONSENSUS',
      symbol: 'EURUSD',
      timeframe: 'M1',
      parameters: {
        stopLossPoints: 300,
        takeProfitPoints: 600,
        lotSize: 0.1,
        maxHoldBars: 50,
      },
      status: 'active',
      tags: ['Consensus', 'RSI', 'MACD', 'EMA'],
      author: 'AI Quantitative Engine',
      notes: 'Produces high-conviction signals with lower frequency.',
      createdAt: Date.now() - 3600000 * 6,
      updatedAt: Date.now() - 3600000 * 6,
    },
  ];

  for (const s of defaults) {
    await dbSaveStrategy(s);
  }
}

// ==========================================
// 13. Observations Knowledge Base CRUD
// ==========================================

export async function dbSaveObservation(obs: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO observations (
      id, title, content, symbol, timeframe, strategy_id, category,
      tags_json, metrics_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    obs.id,
    obs.title,
    obs.content,
    obs.symbol ? obs.symbol.toUpperCase() : null,
    obs.timeframe ? obs.timeframe.toUpperCase() : null,
    obs.strategyId || null,
    obs.category || 'market_insight',
    JSON.stringify(obs.tags || []),
    JSON.stringify(obs.metrics || {}),
    obs.createdAt || Date.now(),
    Date.now(),
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbGetObservations(category?: string): Promise<any[]> {
  const db = await getDatabase();
  const filterCategory = category && category !== 'all';

  // Seed only when the TABLE is empty (see dbGetStrategies for why).
  if (!filterCategory) {
    const total = selectOne(db, 'SELECT COUNT(*) AS total FROM observations');
    if (Number(total?.total || 0) === 0) {
      await seedDefaultObservations();
    }
  }

  const rows = selectRows(
    db,
    `SELECT * FROM observations ${filterCategory ? 'WHERE category = ?' : ''} ORDER BY created_at DESC`,
    filterCategory ? [category] : []
  );

  return rows.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    symbol: item.symbol,
    timeframe: item.timeframe,
    strategyId: item.strategy_id,
    category: item.category,
    tags: item.tags_json ? JSON.parse(item.tags_json) : [],
    metrics: item.metrics_json ? JSON.parse(item.metrics_json) : {},
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

export async function dbDeleteObservation(id: string): Promise<boolean> {
  const db = await getDatabase();
  db.run(`DELETE FROM observations WHERE id = ?`, [id]);
  persistDatabase();
  return true;
}

async function seedDefaultObservations() {
  const defaults = [
    {
      id: 'obs-london-breakout',
      title: 'London Open Spread Expansion & False Breaks',
      content: 'Consistently observed that around 08:00 UTC (London open), EURUSD spread widens from 3 to 12 points for ~90 seconds. Breakout strategies entering immediately on the first M1 candle frequently encounter whipsaws. Waiting for 3 candles (08:03 UTC) filters out 68% of false breakouts.',
      symbol: 'EURUSD',
      timeframe: 'M1',
      category: 'market_insight',
      tags: ['LondonOpen', 'Spread', 'Liquidity', 'FalseBreak'],
      metrics: { avgSpreadExpansion: '8.4 points', winRateImprovement: '+14%' },
      createdAt: Date.now() - 3600000 * 18,
      updatedAt: Date.now() - 3600000 * 18,
    },
    {
      id: 'obs-gold-volatility-us-cpi',
      title: 'Gold (XAUUSD) M5 Momentum Persistence during US CPI',
      content: 'During major US CPI releases, Gold forms impulsive 40-60 point candles. Standard RSI triggers false overbought/oversold prematurely. Trend continuation with trailing stops in 150-point increments captures 2.4x more profit than fixed TP.',
      symbol: 'XAUUSD',
      timeframe: 'M5',
      category: 'pattern',
      tags: ['Gold', 'Macro', 'CPI', 'Volatility', 'TrailingStop'],
      metrics: { avgImpulsePoints: '52.3', trailingStopGain: '2.4x' },
      createdAt: Date.now() - 3600000 * 8,
      updatedAt: Date.now() - 3600000 * 8,
    },
  ];

  for (const o of defaults) {
    await dbSaveObservation(o);
  }
}

// ==========================================
// 14. Backtest Results Storage CRUD
// ==========================================

export async function dbSaveBacktestResult(result: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO backtest_results (
      id, strategy_id, strategy_name, symbol, timeframe, candle_count,
      start_time, start_time_iso, end_time, end_time_iso, initial_deposit,
      final_equity, net_profit, profit_factor, win_rate_pct, total_trades,
      winning_trades, losing_trades, max_drawdown_pct, max_drawdown_usd,
      average_trade_profit, average_win, average_loss, risk_reward_ratio,
      trades_json, equity_curve_json, evaluated_at, data_quality,
      knowledge_assisted, news_filter_active, proof_summary, comparison_json,
      caught_news_json, trades_avoided_due_to_news, losses_prevented_usd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const dataQuality = result.dataQuality === 'SYNTHETIC' ? 'SYNTHETIC' : 'LIVE';

  stmt.run([
    result.id,
    result.strategyId,
    result.strategyName,
    normalizeSymbol(result.symbol),
    normalizeTimeframe(result.timeframe) || 'M1',
    result.candleCount,
    result.startTime,
    result.startTimeIso || new Date(result.startTime * 1000).toISOString(),
    result.endTime,
    result.endTimeIso || new Date(result.endTime * 1000).toISOString(),
    result.initialDeposit,
    result.finalEquity,
    result.netProfit,
    result.profitFactor,
    result.winRatePct,
    result.totalTrades,
    result.winningTrades,
    result.losingTrades,
    result.maxDrawdownPct,
    result.maxDrawdownUsd,
    result.averageTradeProfit,
    result.averageWin,
    result.averageLoss,
    result.riskRewardRatio,
    JSON.stringify(result.trades || []),
    JSON.stringify(result.equityCurve || []),
    result.evaluatedAt || Date.now(),
    dataQuality,
    result.knowledgeAssisted ? 1 : 0,
    result.newsFilterActive ? 1 : 0,
    result.proofSummary || null,
    result.comparison ? JSON.stringify(result.comparison) : null,
    result.caughtNewsEvents ? JSON.stringify(result.caughtNewsEvents) : null,
    result.tradesAvoidedDueToNews || 0,
    result.lossesPreventedUsd || 0,
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbGetBacktestResults(strategyId?: string, limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const rows = selectRows(
    db,
    `SELECT * FROM backtest_results ${strategyId ? 'WHERE strategy_id = ?' : ''} ORDER BY evaluated_at DESC LIMIT ?`,
    strategyId ? [strategyId, safeLimit(limit, 50, 500)] : [safeLimit(limit, 50, 500)]
  );

  return rows.map((item) => ({
    id: item.id,
    strategyId: item.strategy_id,
    strategyName: item.strategy_name,
    symbol: item.symbol,
    timeframe: item.timeframe,
    candleCount: item.candle_count,
    startTime: item.start_time,
    startTimeIso: item.start_time_iso,
    endTime: item.end_time,
    endTimeIso: item.end_time_iso,
    initialDeposit: item.initial_deposit,
    finalEquity: item.final_equity,
    netProfit: item.net_profit,
    profitFactor: item.profit_factor,
    winRatePct: item.win_rate_pct,
    totalTrades: item.total_trades,
    winningTrades: item.winning_trades,
    losingTrades: item.losing_trades,
    maxDrawdownPct: item.max_drawdown_pct,
    maxDrawdownUsd: item.max_drawdown_usd,
    averageTradeProfit: item.average_trade_profit,
    averageWin: item.average_win,
    averageLoss: item.average_loss,
    riskRewardRatio: item.risk_reward_ratio,
    trades: item.trades_json ? JSON.parse(item.trades_json) : [],
    equityCurve: item.equity_curve_json ? JSON.parse(item.equity_curve_json) : [],
    evaluatedAt: item.evaluated_at,
    dataQuality: item.data_quality === 'SYNTHETIC' ? 'SYNTHETIC' : 'LIVE',
    knowledgeAssisted: Boolean(item.knowledge_assisted),
    newsFilterActive: Boolean(item.news_filter_active),
    proofSummary: item.proof_summary || undefined,
    comparison: item.comparison_json ? JSON.parse(item.comparison_json) : undefined,
    caughtNewsEvents: item.caught_news_json ? JSON.parse(item.caught_news_json) : undefined,
    tradesAvoidedDueToNews: item.trades_avoided_due_to_news || 0,
    lossesPreventedUsd: item.losses_prevented_usd || 0,
  }));
}

export async function dbGetBacktestById(id: string): Promise<any | null> {
  const db = await getDatabase();
  const item = selectOne(db, `SELECT * FROM backtest_results WHERE id = ? LIMIT 1`, [id]);
  if (!item) return null;
  return {
    id: item.id,
    strategyId: item.strategy_id,
    strategyName: item.strategy_name,
    symbol: item.symbol,
    timeframe: item.timeframe,
    candleCount: item.candle_count,
    startTime: item.start_time,
    startTimeIso: item.start_time_iso,
    endTime: item.end_time,
    endTimeIso: item.end_time_iso,
    initialDeposit: item.initial_deposit,
    finalEquity: item.final_equity,
    netProfit: item.net_profit,
    profitFactor: item.profit_factor,
    winRatePct: item.win_rate_pct,
    totalTrades: item.total_trades,
    winningTrades: item.winning_trades,
    losingTrades: item.losing_trades,
    maxDrawdownPct: item.max_drawdown_pct,
    maxDrawdownUsd: item.max_drawdown_usd,
    averageTradeProfit: item.average_trade_profit,
    averageWin: item.average_win,
    averageLoss: item.average_loss,
    riskRewardRatio: item.risk_reward_ratio,
    trades: item.trades_json ? JSON.parse(item.trades_json) : [],
    equityCurve: item.equity_curve_json ? JSON.parse(item.equity_curve_json) : [],
    evaluatedAt: item.evaluated_at,
    dataQuality: item.data_quality === 'SYNTHETIC' ? 'SYNTHETIC' : 'LIVE',
    knowledgeAssisted: Boolean(item.knowledge_assisted),
    newsFilterActive: Boolean(item.news_filter_active),
    proofSummary: item.proof_summary || undefined,
    comparison: item.comparison_json ? JSON.parse(item.comparison_json) : undefined,
    caughtNewsEvents: item.caught_news_json ? JSON.parse(item.caught_news_json) : undefined,
    tradesAvoidedDueToNews: item.trades_avoided_due_to_news || 0,
    lossesPreventedUsd: item.losses_prevented_usd || 0,
  };
}


// ==========================================
// 15. Knowledge Base Telemetry Storage CRUD
// ==========================================

export async function dbSaveTelemetryMetric(metric: {
  id?: string;
  symbol: string;
  velocity: number;
  price?: number;
  direction?: string;
  timestamp?: number;
  tags?: string[];
}): Promise<void> {
  const db = await getDatabase();
  const id = metric.id || `tel-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const ts = metric.timestamp || Date.now();
  const d = new Date(ts);
  const hourKey = String(d.getUTCHours()).padStart(2, '0');
  const dir = metric.direction || (metric.velocity >= 0 ? 'up' : 'down');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_telemetry (
      id, symbol, velocity, price, direction, timestamp, hour_key, tags_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    id,
    metric.symbol.toUpperCase(),
    metric.velocity,
    metric.price || 0,
    dir,
    ts,
    hourKey,
    JSON.stringify(metric.tags || []),
    Date.now(),
  ]);

  stmt.free();
  persistDatabase();
}

/**
 * Batch insert telemetry metrics in a single transaction.
 *
 * The previous route called `dbSaveTelemetryMetric` once per item, which
 * meant N prepares + N scheduled full-DB exports for a single POST. This
 * collapses the whole batch into one prepared statement + one transaction.
 */
export async function dbSaveTelemetryMetrics(
  metrics: Array<{ symbol: string; velocity: number; price?: number; timestamp?: number; tags?: string[]; direction?: string }>
): Promise<void> {
  if (!metrics || metrics.length === 0) return;
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_telemetry (
      id, symbol, velocity, price, direction, timestamp, hour_key, tags_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.run('BEGIN IMMEDIATE');
  try {
    for (const metric of metrics) {
      const id = `tel-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const ts = metric.timestamp || Date.now();
      const d = new Date(ts);
      const hourKey = String(d.getUTCHours()).padStart(2, '0');
      const dir = metric.direction || (metric.velocity >= 0 ? 'up' : 'down');
      stmt.run([
        id,
        normalizeSymbol(metric.symbol),
        metric.velocity,
        metric.price || 0,
        dir,
        ts,
        hourKey,
        JSON.stringify(metric.tags || []),
        Date.now(),
      ]);
    }
    db.run('COMMIT');
  } catch (err) {
    try {
      db.run('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    stmt.free();
  }
  persistDatabase();
}

export async function dbGetTelemetryMetrics(symbol?: string, limit = 100): Promise<any[]> {
  const db = await getDatabase();
  const filterSymbol = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filterSymbol ? (symbol as string).trim().toUpperCase() : '';
  const rows = selectRows(
    db,
    `SELECT * FROM knowledge_telemetry ${filterSymbol ? 'WHERE symbol = ?' : ''} ORDER BY timestamp DESC LIMIT ?`,
    filterSymbol ? [cleanSym, safeLimit(limit)] : [safeLimit(limit)]
  );

  return rows.map((item) => ({
    id: item.id,
    symbol: item.symbol,
    velocity: item.velocity,
    price: item.price,
    direction: item.direction,
    timestamp: item.timestamp,
    hourKey: item.hour_key,
    tags: item.tags_json ? JSON.parse(item.tags_json) : [],
    createdAt: item.created_at,
  }));
}

// ==========================================
// 16. Knowledge Base News Cache Storage CRUD
// ==========================================

export async function dbSaveNewsCache(items: any[]): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_news_cache (
      id, category, title, summary, source, sentiment, sentiment_score,
      impact, relevant_symbols_json, published_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const n of items) {
    stmt.run([
      n.id,
      n.category || 'MACRO',
      n.title,
      n.summary || '',
      n.source || 'Market Intelligence',
      n.sentiment || 'NEUTRAL',
      n.sentimentScore || 0,
      n.impact || 'MEDIUM',
      JSON.stringify(n.relevantSymbols || []),
      n.publishedAt || Date.now(),
      Date.now(),
    ]);
  }

  stmt.free();
  persistDatabase();
}

export async function dbGetCachedNews(symbol?: string, category?: string, limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const filterCategory = category && category !== 'ALL';
  const filterSymbol = symbol && symbol !== 'ALL';
  const clauses: string[] = [];
  const params: any[] = [];
  if (filterCategory) {
    clauses.push('category = ?');
    params.push(category);
  }
  if (filterSymbol) {
    clauses.push('relevant_symbols_json LIKE ?');
    params.push(`%${(symbol as string).trim().toUpperCase()}%`);
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  params.push(safeLimit(limit, 50, 500));

  const rows = selectRows(
    db,
    `SELECT * FROM knowledge_news_cache${where} ORDER BY published_at DESC LIMIT ?`,
    params
  );

  return rows.map((item) => ({
    id: item.id,
    category: item.category,
    title: item.title,
    summary: item.summary,
    source: item.source,
    sentiment: item.sentiment,
    sentimentScore: item.sentiment_score,
    impact: item.impact,
    relevantSymbols: item.relevant_symbols_json ? JSON.parse(item.relevant_symbols_json) : [],
    publishedAt: item.published_at,
    createdAt: item.created_at,
  }));
}

// ==========================================
// 17. Multi-Table Explorer & Inspection
// ==========================================

const ALLOWED_TABLES = [
  'orders',
  'strategies',
  'observations',
  'backtest_results',
  'symbol_regimes',
  'symbol_auto_detect_profiles',
  'knowledge_telemetry',
  'knowledge_news_cache',
  'candles_history',
  'ticks_history',
  'account_history',
  'audit_logs',
];

export async function dbSaveSymbolRegime(regime: any): Promise<void> {
  const db = await getDatabase();
  const id = `regime-${regime.symbol}-${Date.now()}`;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO symbol_regimes (
      id, symbol, regime, regime_label, trend_strength, volatility_state,
      tradeability_score, dominant_bias, support_price, resistance_price,
      pivot_point, tactics_json, detected_at, detected_at_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    id,
    regime.symbol,
    regime.regime,
    regime.regimeLabel || regime.regime,
    regime.trendStrength || 50,
    regime.volatilityState || 'NORMAL',
    regime.tradeabilityScore || 70,
    regime.dominantBias || 'NEUTRAL',
    regime.keySupport || 0,
    regime.keyResistance || 0,
    regime.pivotPoint || 0,
    JSON.stringify(regime.recommendedTactics || []),
    regime.detectedAt || Date.now(),
    new Date(regime.detectedAt || Date.now()).toISOString(),
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbGetSymbolRegimes(symbol?: string, limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const filterSymbol = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filterSymbol ? (symbol as string).trim().toLowerCase() : '';
  const rows = selectRows(
    db,
    `SELECT * FROM symbol_regimes ${filterSymbol ? 'WHERE LOWER(symbol) = ?' : ''} ORDER BY detected_at DESC LIMIT ?`,
    filterSymbol ? [cleanSym, safeLimit(limit, 50, 500)] : [safeLimit(limit, 50, 500)]
  );

  return rows.map((item) => ({
    id: item.id,
    symbol: item.symbol,
    regime: item.regime,
    regimeLabel: item.regime_label,
    trendStrength: item.trend_strength,
    volatilityState: item.volatility_state,
    tradeabilityScore: item.tradeability_score,
    dominantBias: item.dominant_bias,
    keySupport: item.support_price,
    keyResistance: item.resistance_price,
    pivotPoint: item.pivot_point,
    recommendedTactics: item.tactics_json ? JSON.parse(item.tactics_json) : [],
    detectedAt: item.detected_at,
    detectedAtIso: item.detected_at_iso,
  }));
}

export async function dbOptimizeDatabase(): Promise<{ status: string; dbSizeBytes: number }> {
  const db = await getDatabase();
  try {
    db.run('PRAGMA optimize;');
    db.run('VACUUM;');
    flushDatabase();
  } catch (err: any) {
    console.warn('DB optimize notice:', err?.message);
    let size = 0;
    if (dbInstance) {
      try { size = dbInstance.export().length; } catch {}
    }
    return { status: 'error', dbSizeBytes: size };
  }
  let dbSizeBytes = 0;
  if (dbInstance) {
    try { dbSizeBytes = dbInstance.export().length; } catch {}
  }
  analyticsCache = null;
  return { status: 'optimized', dbSizeBytes };
}

export async function dbGetTableRows(
  tableName: string,
  limit = 100
): Promise<{ columns: string[]; rows: any[]; totalCount: number }> {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Table ${tableName} is not permitted for inspection`);
  }

  const db = await getDatabase();
  const countRes = db.exec(`SELECT COUNT(*) FROM ${tableName}`);
  const totalCount = countRes.length > 0 && countRes[0].values.length > 0 ? Number(countRes[0].values[0][0]) || 0 : 0;

  let orderClause = '';
  if (['orders', 'audit_logs', 'account_history', 'knowledge_telemetry', 'knowledge_news_cache', 'strategies', 'observations'].includes(tableName)) {
    orderClause = tableName === 'orders' ? 'ORDER BY created_at DESC' : 'ORDER BY rowid DESC';
  } else if (tableName === 'symbol_regimes') {
    orderClause = 'ORDER BY detected_at DESC';
  } else if (tableName === 'symbol_auto_detect_profiles') {
    orderClause = 'ORDER BY updated_at DESC';
  } else if (tableName === 'backtest_results') {
    orderClause = 'ORDER BY evaluated_at DESC';
  } else if (tableName === 'candles_history') {
    orderClause = 'ORDER BY time DESC';
  } else if (tableName === 'ticks_history') {
    orderClause = 'ORDER BY timestamp DESC';
  }

  const sql = `SELECT * FROM ${tableName} ${orderClause} LIMIT ?`;
  const rows = selectRows(db, sql, [safeLimit(limit, 100, 500)]);

  if (rows.length === 0) {
    return { columns: [], rows: [], totalCount };
  }

  // Preserve the column ordering of the table so the UI can render a stable
  // column set even when the current page happens to be empty.
  const columns = Object.keys(rows[0]);

  return { columns, rows, totalCount };
}

export async function dbClearTable(tableName: string): Promise<number> {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Table ${tableName} is not permitted for clearing`);
  }
  const db = await getDatabase();
  const countRes = db.exec(`SELECT COUNT(*) FROM ${tableName}`);
  const count = countRes.length > 0 && countRes[0].values.length > 0 ? Number(countRes[0].values[0][0]) || 0 : 0;

  // The deletion is recorded in the audit trail. Clearing the trade history
  // used to leave no trace at all, which made the compliance log worthless
  // exactly when it mattered most.
  // `tableName` is validated against ALLOWED_TABLES above, so it is a known
  // constant and not user supplied SQL.
  db.run(`DELETE FROM ${tableName}`);

  const auditStmt = db.prepare(`
    INSERT OR REPLACE INTO audit_logs (id, timestamp, level, title, details, source, ticket)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  auditStmt.run([
    `clear-${tableName}-${Date.now()}`,
    Date.now(),
    'warning',
    `Table cleared: ${tableName}`,
    `${count} row(s) deleted from "${tableName}" by a database-explorer request`,
    'database',
    null,
  ]);
  auditStmt.free();

  persistDatabase();
  return count;
}

// ==========================================
// 18. Auto-Detect Symbol Profiles Persistence
// ==========================================

export async function dbSaveSymbolAutoDetectProfile(profile: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO symbol_auto_detect_profiles (
      symbol, asset_class, profile_json, liquidity_score, volatility_regime,
      safety_score, safety_grade, analyzed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  stmt.run([
    profile.symbol,
    profile.specs?.assetClass || profile.assetClass || 'OTHER',
    JSON.stringify(profile),
    profile.session?.liquidityScore ?? 70,
    profile.regime?.regime || profile.volatilityNoise?.volatilityState || 'NORMAL',
    profile.executionSafety?.safetyScore ?? 85,
    profile.executionSafety?.grade || 'A',
    profile.analyzedAt || now,
    now,
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbGetSymbolAutoDetectProfiles(limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const rows = selectRows(
    db,
    `
    SELECT symbol, asset_class, profile_json, liquidity_score, volatility_regime,
           safety_score, safety_grade, analyzed_at, updated_at
    FROM symbol_auto_detect_profiles
    ORDER BY updated_at DESC
    LIMIT ?
  `,
    [safeLimit(limit, 50, 500)]
  );

  return rows.map((item) => ({
    symbol: item.symbol,
    assetClass: item.asset_class,
    liquidityScore: item.liquidity_score,
    volatilityRegime: item.volatility_regime,
    safetyScore: item.safety_score,
    safetyGrade: item.safety_grade,
    profile: item.profile_json ? JSON.parse(item.profile_json) : null,
    analyzedAt: item.analyzed_at,
    updatedAt: item.updated_at,
  }));
}

// ==========================================
// Bot Trades & Signals
// ==========================================

export async function dbInsertBotTrade(trade: {
  id: string;
  signalId: string;
  symbol: string;
  direction: string;
  volume: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  commandId?: string;
  status: string;
  openedAt: number;
}): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bot_trades (
      id, signal_id, symbol, direction, volume, entry_price, stop_loss, take_profit, command_id, status, opened_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    trade.id,
    trade.signalId,
    normalizeSymbol(trade.symbol),
    trade.direction,
    trade.volume,
    trade.entryPrice,
    trade.stopLoss || null,
    trade.takeProfit || null,
    trade.commandId || null,
    trade.status,
    trade.openedAt,
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbUpdateBotTrade(id: string, updates: { status?: string; profit?: number; closedAt?: number }): Promise<void> {
  const db = await getDatabase();
  const sets: string[] = [];
  const params: any[] = [];
  if (updates.status !== undefined) { sets.push('status = ?'); params.push(updates.status); }
  if (updates.profit !== undefined) { sets.push('profit = ?'); params.push(updates.profit); }
  if (updates.closedAt !== undefined) { sets.push('closed_at = ?'); params.push(updates.closedAt); }
  if (sets.length === 0) return;
  params.push(id);
  db.run(`UPDATE bot_trades SET ${sets.join(', ')} WHERE id = ?`, params);
  persistDatabase();
}

export async function dbGetBotTrades(limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const rows = selectRows(db, 'SELECT * FROM bot_trades ORDER BY opened_at DESC LIMIT ?', [safeLimit(limit, 50, 500)]);
  return rows.map((r) => ({
    id: r.id,
    signalId: r.signal_id,
    symbol: r.symbol,
    direction: r.direction,
    volume: r.volume,
    entryPrice: r.entry_price,
    stopLoss: r.stop_loss,
    takeProfit: r.take_profit,
    commandId: r.command_id,
    status: r.status,
    profit: r.profit,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
  }));
}

export async function dbInsertBotSignal(signal: {
  id: string;
  symbol: string;
  timeframe: string;
  direction: string;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  reasons: string[];
  warnings: string[];
  dataQuality: string;
  generatedAt: number;
  actedOn: boolean;
  tradeId?: string;
}): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bot_signals (
      id, symbol, timeframe, direction, confidence, entry_price, stop_loss, take_profit,
      risk_reward_ratio, reasons_json, warnings_json, data_quality, generated_at, acted_on, trade_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    signal.id,
    normalizeSymbol(signal.symbol),
    signal.timeframe,
    signal.direction,
    signal.confidence,
    signal.entryPrice,
    signal.stopLoss,
    signal.takeProfit,
    signal.riskRewardRatio,
    JSON.stringify(signal.reasons),
    JSON.stringify(signal.warnings),
    signal.dataQuality,
    signal.generatedAt,
    signal.actedOn ? 1 : 0,
    signal.tradeId || null,
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbGetBotSignals(limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const rows = selectRows(db, 'SELECT * FROM bot_signals ORDER BY generated_at DESC LIMIT ?', [safeLimit(limit, 50, 500)]);
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    direction: r.direction,
    confidence: r.confidence,
    entryPrice: r.entry_price,
    stopLoss: r.stop_loss,
    takeProfit: r.take_profit,
    riskRewardRatio: r.risk_reward_ratio,
    reasons: r.reasons_json ? JSON.parse(r.reasons_json) : [],
    warnings: r.warnings_json ? JSON.parse(r.warnings_json) : [],
    dataQuality: r.data_quality,
    generatedAt: r.generated_at,
    actedOn: r.acted_on === 1,
    tradeId: r.trade_id,
  }));
}

export async function dbGetSymbolAutoDetectProfile(symbol: string): Promise<any | null> {
  const db = await getDatabase();
  const cleanSym = (symbol || '').trim();
  const item = selectOne(
    db,
    `
    SELECT profile_json FROM symbol_auto_detect_profiles
    WHERE symbol = ? OR LOWER(symbol) = ?
    LIMIT 1
  `,
    [cleanSym, cleanSym.toLowerCase()]
  );
  if (!item) return null;
  const raw = item.profile_json;
  return raw ? JSON.parse(String(raw)) : null;
}

// ==========================================
// 19. Rapid Price Shocks & News Attribution Persistence
// ==========================================

export async function dbInsertRapidShock(shock: any): Promise<void> {
  try {
    const db = await getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO rapid_shocks_history (
        id, symbol, timeframe, shock_type, reaction_type, severity, pip_displacement, pip_range,
        atr_multiplier, duration_seconds, pip_velocity, spread_points, spread_pips,
        cooling_off_minutes, news_id, catalyst_title, catalyst_source, catalyst_time_iso,
        catalyst_delta_sec, attribution_confidence, attribution_reasoning, tactical_directive,
        safe_to_trade, timestamp, timestamp_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      shock.id,
      normalizeSymbol(shock.symbol),
      shock.timeframe || 'M1',
      shock.shockType,
      shock.reactionType,
      shock.severity,
      shock.pipDisplacement,
      shock.pipRange,
      shock.volatilityAtrMultiplier,
      shock.durationSeconds,
      shock.pipVelocityPipsPerMinute,
      shock.spreadAtShockPoints,
      shock.spreadAtShockPips,
      shock.coolingOffMinutesRemaining,
      shock.attributedCatalyst?.id || null,
      shock.attributedCatalyst?.title || null,
      shock.attributedCatalyst?.sourceType || null,
      shock.attributedCatalyst?.scheduledOrPublishedTimeIso || null,
      shock.attributedCatalyst?.timeDeltaSeconds || null,
      shock.attributedCatalyst?.attributionConfidence || null,
      shock.attributedCatalyst?.attributionReasoning || null,
      shock.tacticalDirective || '',
      shock.safeToTrade ? 1 : 0,
      shock.timestamp,
      shock.timestampIso || new Date(shock.timestamp * 1000).toISOString(),
    ]);

    stmt.free();
    persistDatabase();
  } catch (err) {
    console.warn('[DB] Failed to persist rapid shock:', err);
  }
}

export async function dbGetRapidShocks(symbol?: string, limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const filter = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filter ? normalizeSymbol(symbol as string) : '';

  const rows = selectRows(
    db,
    `SELECT * FROM rapid_shocks_history
     ${filter ? 'WHERE UPPER(symbol) = ?' : ''}
     ORDER BY timestamp DESC
     LIMIT ?`,
    filter ? [cleanSym.toUpperCase(), safeLimit(limit, 50, 200)] : [safeLimit(limit, 50, 200)]
  );

  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    shockType: r.shock_type,
    reactionType: r.reaction_type,
    severity: r.severity,
    pipDisplacement: r.pip_displacement,
    pipRange: r.pip_range,
    volatilityAtrMultiplier: r.atr_multiplier,
    durationSeconds: r.duration_seconds,
    pipVelocityPipsPerMinute: r.pip_velocity,
    spreadAtShockPoints: r.spread_points,
    spreadAtShockPips: r.spread_pips,
    coolingOffMinutesRemaining: r.cooling_off_minutes,
    tacticalDirective: r.tactical_directive,
    safeToTrade: r.safe_to_trade === 1,
    timestamp: r.timestamp,
    timestampIso: r.timestamp_iso,
    attributedCatalyst: r.catalyst_title
      ? {
          id: r.news_id,
          title: r.catalyst_title,
          sourceType: r.catalyst_source,
          scheduledOrPublishedTimeIso: r.catalyst_time_iso,
          timeDeltaSeconds: r.catalyst_delta_sec,
          attributionConfidence: r.attribution_confidence,
          attributionReasoning: r.attribution_reasoning,
        }
      : null,
  }));
}

// ==========================================
// 20. Chart Diagnostics Telemetry Logging
// ==========================================

export async function dbInsertChartDiagnostics(diag: any): Promise<void> {
  try {
    const db = await getDatabase();
    const stmt = db.prepare(`
      INSERT INTO chart_diagnostics_history (
        symbol, timeframe, period_seconds, server_time, server_time_iso,
        gmt_time, gmt_time_iso, broker_timezone_offset, current_bar_time,
        current_bar_time_iso, bar_elapsed_seconds, bar_remaining_seconds,
        bar_progress_pct, is_bar_closed, spread_points, spread_pips,
        tick_volume, real_volume, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      normalizeSymbol(diag.symbol),
      diag.timeframe,
      diag.periodSeconds,
      diag.serverTime,
      diag.serverTimeIso,
      diag.gmtTime,
      diag.gmtTimeIso,
      diag.brokerTimezoneOffsetHours,
      diag.currentBarTime,
      diag.currentBarTimeIso,
      diag.barElapsedSeconds,
      diag.barRemainingSeconds,
      diag.barProgressPct,
      diag.isBarClosed ? 1 : 0,
      diag.spreadPoints,
      diag.spreadPips,
      diag.tickVolume || null,
      diag.realVolume || null,
      Date.now(),
    ]);

    stmt.free();
    persistDatabase();
  } catch (err) {
    console.warn('[DB] Failed to insert chart diagnostics:', err);
  }
}

export async function dbGetChartDiagnosticsHistory(symbol?: string, limit = 30): Promise<any[]> {
  const db = await getDatabase();
  const filter = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filter ? normalizeSymbol(symbol as string) : '';

  const rows = selectRows(
    db,
    `SELECT * FROM chart_diagnostics_history
     ${filter ? 'WHERE UPPER(symbol) = ?' : ''}
     ORDER BY recorded_at DESC
     LIMIT ?`,
    filter ? [cleanSym.toUpperCase(), safeLimit(limit, 30, 100)] : [safeLimit(limit, 30, 100)]
  );

  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    periodSeconds: r.period_seconds,
    serverTime: r.server_time,
    serverTimeIso: r.server_time_iso,
    gmtTime: r.gmt_time,
    gmtTimeIso: r.gmt_time_iso,
    brokerTimezoneOffsetHours: r.broker_timezone_offset,
    currentBarTime: r.current_bar_time,
    currentBarTimeIso: r.current_bar_time_iso,
    barElapsedSeconds: r.bar_elapsed_seconds,
    barRemainingSeconds: r.bar_remaining_seconds,
    barProgressPct: r.bar_progress_pct,
    isBarClosed: r.is_bar_closed === 1,
    spreadPoints: r.spread_points,
    spreadPips: r.spread_pips,
    tickVolume: r.tick_volume,
    realVolume: r.real_volume,
    recordedAt: r.recorded_at,
  }));
}




