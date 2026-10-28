import { ALLOWED_TABLES, AllowedTableName } from './config.js';
import { getDatabase, flushDatabase, persistDatabase } from './connection.js';
import { selectRows, safeLimit } from './helpers.js';

function selectOne(db: any, query: string, params: any[] = []): any | null {
  const rows = selectRows(db, query, params);
  return rows.length > 0 ? rows[0] : null;
}

let pruneCounter = 0;
let analyticsCache: { value: any; expires: number } | null = null;

export function invalidateAnalyticsCache(): void {
  analyticsCache = null;
}

/**
 * Periodically called to clean up old stale data. Runs every 20 sync cycles.
 */
export async function pruneDatabase(): Promise<void> {
  pruneCounter++;
  if (pruneCounter % 20 !== 0) return;
  await dbPruneDatabase();
}

/**
 * Full explicit database pruning with 24-hour unexecuted order expiration and row caps.
 */
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

    let unexecutedCount = 0;

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
      db.run(
        `DELETE FROM ticks_history WHERE timestamp < ? OR id NOT IN (SELECT id FROM ticks_history ORDER BY id DESC LIMIT 5000)`,
        [twoDaysAgoSec]
      );

      // 4. Cap account history snapshots (keep last 1,000 entries)
      db.run(
        `DELETE FROM account_history WHERE created_at < ? OR id NOT IN (SELECT id FROM account_history ORDER BY id DESC LIMIT 1000)`,
        [sevenDaysAgo]
      );

      // 5. Cap candles history PER SYMBOL + TIMEFRAME (keep the newest 1,000 bars of every series)
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

      // 6. Cap audit logs (keep last 2,000 logs)
      db.run(
        `DELETE FROM audit_logs WHERE timestamp < ? OR id NOT IN (SELECT id FROM audit_logs ORDER BY timestamp DESC LIMIT 2000)`,
        [sevenDaysAgo]
      );

      // 7. Cap backtest results history (keep last 200 backtests)
      db.run(`DELETE FROM backtest_results WHERE id NOT IN (SELECT id FROM backtest_results ORDER BY evaluated_at DESC LIMIT 200)`);

      // 8. Cap knowledge base tables
      db.run(`DELETE FROM knowledge_telemetry WHERE id NOT IN (SELECT id FROM knowledge_telemetry ORDER BY timestamp DESC LIMIT 5000)`);
      db.run(`DELETE FROM knowledge_news_cache WHERE id NOT IN (SELECT id FROM knowledge_news_cache ORDER BY published_at DESC LIMIT 500)`);
      db.run(`DELETE FROM symbol_regimes WHERE id NOT IN (SELECT id FROM symbol_regimes ORDER BY detected_at DESC LIMIT 500)`);

      db.run('COMMIT');
    } catch (txErr) {
      try {
        db.run('ROLLBACK');
      } catch {}
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

/**
 * Optimizes the SQLite database using PRAGMA optimize, VACUUM, and flushes to disk.
 */
export async function dbOptimizeDatabase(): Promise<{ status: string; dbSizeBytes: number }> {
  const db = await getDatabase();
  try {
    db.run('PRAGMA optimize;');
    db.run('VACUUM;');
    flushDatabase();
  } catch (err: any) {
    console.warn('[DB] Optimize notice:', err?.message);
    let size = 0;
    try { size = db.export().length; } catch {}
    return { status: 'error', dbSizeBytes: size };
  }
  let dbSizeBytes = 0;
  try { dbSizeBytes = db.export().length; } catch {}
  analyticsCache = null;
  return { status: 'optimized', dbSizeBytes };
}

/**
 * Inspects a table for the Database Explorer UI
 */
export async function dbGetTableRows(
  tableName: string,
  limit = 100
): Promise<{ columns: string[]; rows: any[]; totalCount: number }> {
  if (!ALLOWED_TABLES.includes(tableName as AllowedTableName)) {
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

  const columns = Object.keys(rows[0]);
  return { columns, rows, totalCount };
}

/**
 * Clears rows from an allowed table and records an audit log
 */
export async function dbClearTable(tableName: string): Promise<number> {
  if (!ALLOWED_TABLES.includes(tableName as AllowedTableName)) {
    throw new Error(`Table ${tableName} is not permitted for clearing`);
  }
  const db = await getDatabase();
  const countRes = db.exec(`SELECT COUNT(*) FROM ${tableName}`);
  const count = countRes.length > 0 && countRes[0].values.length > 0 ? Number(countRes[0].values[0][0]) || 0 : 0;

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
  analyticsCache = null;
  return count;
}

/**
 * Returns overall database analytics and telemetry counts
 */
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
  try {
    dbSizeBytes = db.export().length;
  } catch {
    dbSizeBytes = 0;
  }

  const result = {
    databasePath: '/backend/database/data/market_data.sqlite',
    databaseType: 'SQLite Persistent (Isolated Backend Storage)',
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

  analyticsCache = { value: result, expires: Date.now() + 5000 };
  return result;
}
