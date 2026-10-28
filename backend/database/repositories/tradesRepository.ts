import { AccountInfo } from '../../types/mt5.js';
import { getDatabase, persistDatabase } from '../connection.js';
import { selectRows, safeLimit } from '../helpers.js';

function selectOne(db: any, query: string, params: any[] = []): any | null {
  const rows = selectRows(db, query, params);
  return rows.length > 0 ? rows[0] : null;
}

let lastAccountRecordTime = 0;

export async function dbInsertOrder(order: any): Promise<void> {
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

export async function dbInsertAccountSnapshot(account: AccountInfo): Promise<void> {
  if (!account || account.login === 0) return;
  const now = Date.now();
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

export async function dbGetAccountHistory(limit = 100): Promise<any[]> {
  const db = await getDatabase();
  return selectRows(db, `SELECT * FROM account_history ORDER BY created_at DESC LIMIT ?`, [safeLimit(limit)]);
}

export async function dbInsertLog(log: any): Promise<void> {
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

export async function dbSaveRiskSettings(risk: any): Promise<void> {
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

export async function dbGetOrders(limit = 100): Promise<any[]> {
  const db = await getDatabase();
  return selectRows(db, `SELECT * FROM orders ORDER BY created_at DESC LIMIT ?`, [safeLimit(limit)]);
}

export async function dbSaveClosedDeals(deals: any[]): Promise<void> {
  if (!Array.isArray(deals) || deals.length === 0) return;
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO positions_history (
      ticket, symbol, type, volume, open_price, close_price,
      sl, tp, profit, swap, magic, comment, open_time, close_time, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const d of deals) {
    stmt.run([
      d.positionId || d.ticket,
      d.symbol,
      d.type,
      d.volume,
      d.price,
      d.price,
      0,
      0,
      (d.profit || 0) + (d.swap || 0) + (d.commission || 0) + (d.fee || 0),
      d.swap || 0,
      d.magic || 0,
      d.comment || '',
      d.time ? (d.time - 3600) : Date.now(),
      d.time ? d.time : Date.now(),
      'CLOSED',
    ]);
  }
  stmt.free();
  persistDatabase();
}
