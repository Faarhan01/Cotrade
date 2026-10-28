import { normalizeSymbol } from '../../utils/symbol.js';
import { getDatabase, persistDatabase } from '../connection.js';
import { selectRows, safeLimit } from '../helpers.js';

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

export async function dbSaveBotSettings(config: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bot_settings (
      id, config_json, mode, symbols_json, timeframe, min_confidence, risk_percent, max_open_positions, cooldown_ms, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    JSON.stringify(config),
    config.mode || 'DAY_TRADES',
    JSON.stringify(config.symbols || []),
    config.timeframe || 'M15',
    config.minConfidence || 70,
    config.riskPercent || 1.0,
    config.maxOpenPositions || 3,
    config.cooldownMs || 300000,
    Date.now(),
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbGetBotSettings(): Promise<any | null> {
  const db = await getDatabase();
  const rows = selectRows(db, 'SELECT * FROM bot_settings WHERE id = 1 LIMIT 1');
  if (rows.length === 0) return null;
  const r = rows[0];
  try {
    const parsed = JSON.parse(r.config_json);
    return {
      ...parsed,
      updatedAt: r.updated_at,
    };
  } catch {
    return null;
  }
}

