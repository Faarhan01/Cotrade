import { CandleData, TickData } from '../../types/mt5.js';
import { normalizeTimeframe, timeframeCandidates } from '../../utils/timeframe.js';
import { normalizeSymbol } from '../../utils/symbol.js';
import { getDatabase, persistDatabase } from '../connection.js';
import { selectRows, safeLimit } from '../helpers.js';

function selectOne(db: any, query: string, params: any[] = []): any | null {
  const rows = selectRows(db, query, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function dbInsertCandles(symbol: string, timeframe: string, candles: CandleData[]): Promise<void> {
  if (!candles || candles.length === 0) return;
  const db = await getDatabase();
  const cleanSymbol = normalizeSymbol(symbol);
  const cleanTimeframe = normalizeTimeframe(timeframe) || 'M1';
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO candles_history (
      symbol, timeframe, time, open, high, low, close, volume, spread, real_volume, time_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      c.spread ?? 0,
      c.realVolume ?? 0,
      timeIso,
    ]);
  }
  stmt.free();
  persistDatabase();
}

export async function dbInsertTicks(ticks: TickData[]): Promise<void> {
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

export async function dbGetCandles(symbol: string, timeframe: string, limit = 100): Promise<CandleData[]> {
  const db = await getDatabase();
  const cleanSym = normalizeSymbol(symbol);
  const tfCandidates = timeframeCandidates(timeframe);
  if (tfCandidates.length === 0) return [];

  const placeholders = tfCandidates.map(() => '?').join(', ');
  const rows = selectRows(
    db,
    `
      SELECT time, open, high, low, close, volume, spread, real_volume, time_iso
      FROM (
        SELECT time, open, high, low, close, volume, spread, real_volume, time_iso
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
    spread: r.spread !== undefined && r.spread !== null ? Number(r.spread) : undefined,
    realVolume: r.real_volume !== undefined && r.real_volume !== null ? Number(r.real_volume) : undefined,
    timeIso: r.time_iso ? String(r.time_iso) : new Date(Number(r.time) * 1000).toISOString(),
  }));
}

export async function dbGetCandlesRange(
  symbol: string,
  timeframe: string,
  fromTime: number,
  toTime: number,
  limit = 5000
): Promise<CandleData[]> {
  const db = await getDatabase();
  const cleanSym = normalizeSymbol(symbol);
  const tfCandidates = timeframeCandidates(timeframe);
  if (tfCandidates.length === 0) return [];

  const placeholders = tfCandidates.map(() => '?').join(', ');
  const rows = selectRows(
    db,
    `
      SELECT time, open, high, low, close, volume, spread, real_volume, time_iso
      FROM candles_history
      WHERE UPPER(symbol) = ?
        AND UPPER(timeframe) IN (${placeholders})
        AND time >= ?
        AND time <= ?
      ORDER BY time ASC
      LIMIT ?
    `,
    [cleanSym.toUpperCase(), ...tfCandidates.map((t) => t.toUpperCase()), fromTime, toTime, safeLimit(limit)]
  );
  return rows.map((r) => ({
    time: Number(r.time),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
    spread: r.spread !== undefined && r.spread !== null ? Number(r.spread) : undefined,
    realVolume: r.real_volume !== undefined && r.real_volume !== null ? Number(r.real_volume) : undefined,
    timeIso: r.time_iso ? String(r.time_iso) : new Date(Number(r.time) * 1000).toISOString(),
  }));
}

export async function dbGetCandleTimeRange(
  symbol: string,
  timeframe: string
): Promise<{ minTime: number; maxTime: number; count: number } | null> {
  const db = await getDatabase();
  const cleanSym = normalizeSymbol(symbol);
  const tfCandidates = timeframeCandidates(timeframe);
  if (tfCandidates.length === 0) return null;

  const placeholders = tfCandidates.map(() => '?').join(', ');
  const row = selectOne(
    db,
    `
      SELECT MIN(time) AS min_time, MAX(time) AS max_time, COUNT(*) AS total
      FROM candles_history
      WHERE UPPER(symbol) = ?
        AND UPPER(timeframe) IN (${placeholders})
    `,
    [cleanSym.toUpperCase(), ...tfCandidates.map((t) => t.toUpperCase())]
  );

  if (!row || !row.total || Number(row.total) === 0 || row.min_time === null || row.max_time === null) {
    return null;
  }

  return {
    minTime: Number(row.min_time),
    maxTime: Number(row.max_time),
    count: Number(row.total),
  };
}

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
    ticks: enriched.reverse(),
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
      diag.timeframe ?? null,
      diag.periodSeconds ?? null,
      diag.serverTime ?? null,
      diag.serverTimeIso ?? null,
      diag.gmtTime ?? null,
      diag.gmtTimeIso ?? null,
      diag.timezoneOffsetHours ?? diag.brokerTimezoneOffsetHours ?? null,
      diag.currentBarOpenTime ?? diag.currentBarTime ?? null,
      diag.currentBarOpenTimeIso ?? diag.currentBarTimeIso ?? null,
      diag.currentBarSecondsElapsed ?? diag.barElapsedSeconds ?? null,
      diag.currentBarSecondsRemaining ?? diag.barRemainingSeconds ?? null,
      diag.currentBarProgressPercent ?? diag.barProgressPct ?? null,
      diag.isBarClosed ? 1 : 0,
      diag.spreadPoints ?? null,
      diag.spreadPips ?? null,
      diag.tickVolume ?? null,
      diag.realVolume ?? null,
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
    brokerTimezoneOffset: r.broker_timezone_offset,
    currentBarTime: r.current_bar_time,
    currentBarTimeIso: r.current_bar_time_iso,
    barElapsedSeconds: r.bar_elapsed_seconds,
    barRemainingSeconds: r.bar_remaining_seconds,
    barProgressPct: r.bar_progress_pct,
    isBarClosed: Boolean(r.is_bar_closed),
    spreadPoints: r.spread_points,
    spreadPips: r.spread_pips,
    tickVolume: r.tick_volume,
    realVolume: r.real_volume,
    recordedAt: r.recorded_at,
  }));
}

export async function dbGetTicksHistoryRange(
  symbol?: string,
  fromTime?: number,
  toTime?: number,
  limit = 1000
): Promise<any[]> {
  const db = await getDatabase();
  const filterSymbol = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filterSymbol ? normalizeSymbol(symbol as string) : '';
  const conditions: string[] = [];
  const params: any[] = [];

  if (filterSymbol) {
    conditions.push('UPPER(symbol) = ?');
    params.push(cleanSym.toUpperCase());
  }
  if (fromTime) {
    conditions.push('timestamp >= ?');
    params.push(fromTime);
  }
  if (toTime) {
    conditions.push('timestamp <= ?');
    params.push(toTime);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(safeLimit(limit));

  const rows = selectRows(
    db,
    `SELECT symbol, bid, ask, spread, timestamp, time_iso FROM ticks_history
     ${whereClause}
     ORDER BY timestamp ASC
     LIMIT ?`,
    params
  );
  return rows.map((item) => ({
    symbol: item.symbol,
    bid: Number(item.bid),
    ask: Number(item.ask),
    spread: Number(item.spread),
    timestamp: Number(item.timestamp),
    timeIso: item.time_iso,
  }));
}
