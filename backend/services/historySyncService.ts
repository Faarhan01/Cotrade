import { dbGetCandleTimeRange, dbInsertCandles } from '../database/db.js';
import { normalizeSymbol } from '../utils/symbol.js';
import { normalizeTimeframe } from '../utils/timeframe.js';
import { tradeStore } from './tradeStore.js';
import { CandleData } from '../types/mt5.js';

export function timeframeToSeconds(tf: string): number {
  const clean = normalizeTimeframe(tf) || 'M1';
  switch (clean.toUpperCase()) {
    case 'M1': return 60;
    case 'M2': return 120;
    case 'M3': return 180;
    case 'M4': return 240;
    case 'M5': return 300;
    case 'M6': return 360;
    case 'M10': return 600;
    case 'M12': return 720;
    case 'M15': return 900;
    case 'M20': return 1200;
    case 'M30': return 1800;
    case 'H1': return 3600;
    case 'H2': return 7200;
    case 'H3': return 10800;
    case 'H4': return 14400;
    case 'H6': return 21600;
    case 'H8': return 28800;
    case 'H12': return 43200;
    case 'D1': return 86400;
    case 'W1': return 604800;
    case 'MN1': return 2592000;
    default: return 60;
  }
}

interface GapCheckResult {
  status: 'UP_TO_DATE' | 'INITIAL_BOOTSTRAP_REQUESTED' | 'GAP_FILL_REQUESTED' | 'EA_OFFLINE';
  symbol: string;
  timeframe: string;
  existingCount: number;
  minTime?: number;
  maxTime?: number;
  missingBars?: number;
  requestedFrom?: number;
  requestedTo?: number;
  message: string;
}

// Anti-spam cooldown per symbol + timeframe
const pendingGapRequests = new Map<string, number>();

/**
 * Inspects whether SQLite database has historical candles for this symbol and timeframe.
 * If candles exist, checks the timestamp of the newest candle against MT5 broker time.
 * If a gap is detected (e.g. dev server was closed or EA was offline), it requests
 * ONLY the missing date window from the MT5 EA (from maxTime to now) instead of
 * blindly pulling duplicate bars that waste storage and bandwidth.
 */
export async function inspectAndFillChartGaps(
  symbol: string,
  timeframe = 'M1',
  requestedLimit = 200
): Promise<GapCheckResult> {
  const cleanSym = normalizeSymbol(symbol);
  const cleanTf = normalizeTimeframe(timeframe) || 'M1';
  const range = await dbGetCandleTimeRange(cleanSym, cleanTf);

  const state = tradeStore.getState();
  const isEaOnline = state.connection.isEaConnected;
  const nowSec = state.connection.serverTime ? Math.floor(state.connection.serverTime / 1000) : Math.floor(Date.now() / 1000);
  const periodSec = timeframeToSeconds(cleanTf);
  const key = `${cleanSym}_${cleanTf}`;

  // 1. No historical candles in SQLite: Initial Bootstrap
  if (!range || range.count === 0) {
    if (!isEaOnline) {
      return {
        status: 'EA_OFFLINE',
        symbol: cleanSym,
        timeframe: cleanTf,
        existingCount: 0,
        message: `No candles in database for ${cleanSym} [${cleanTf}] and MT5 EA is offline. Waiting for EA connection.`,
      };
    }

    const lastReq = pendingGapRequests.get(key) || 0;
    if (Date.now() - lastReq > 4000) {
      pendingGapRequests.set(key, Date.now());
      tradeStore.trackSymbolInEA(cleanSym);
      tradeStore.requestHistoryFromEA(cleanSym, cleanTf, Math.min(requestedLimit, 1000));
    }

    return {
      status: 'INITIAL_BOOTSTRAP_REQUESTED',
      symbol: cleanSym,
      timeframe: cleanTf,
      existingCount: 0,
      missingBars: requestedLimit,
      message: `Initial history bootstrap of ${requestedLimit} bars requested from MT5 EA for ${cleanSym} [${cleanTf}].`,
    };
  }

  // 2. Existing candles present: Check forward gap
  const timeSinceNewest = nowSec - range.maxTime;
  const missingBars = Math.floor(timeSinceNewest / periodSec);

  // If missingBars <= 1, data is completely up to date!
  if (missingBars <= 1) {
    return {
      status: 'UP_TO_DATE',
      symbol: cleanSym,
      timeframe: cleanTf,
      existingCount: range.count,
      minTime: range.minTime,
      maxTime: range.maxTime,
      missingBars: 0,
      message: `${cleanSym} [${cleanTf}] is up to date (${range.count} bars in DB, latest: ${new Date(range.maxTime * 1000).toISOString()}). Zero duplicate bars needed.`,
    };
  }

  // 3. Gap detected: Only fetch the missing window!
  if (!isEaOnline) {
    return {
      status: 'EA_OFFLINE',
      symbol: cleanSym,
      timeframe: cleanTf,
      existingCount: range.count,
      minTime: range.minTime,
      maxTime: range.maxTime,
      missingBars,
      message: `${missingBars} bars missing for ${cleanSym} [${cleanTf}] since ${new Date(range.maxTime * 1000).toISOString()}, but MT5 EA is currently offline.`,
    };
  }

  const lastReq = pendingGapRequests.get(key) || 0;
  if (Date.now() - lastReq > 4000) {
    pendingGapRequests.set(key, Date.now());
    const fromTime = range.maxTime; // Fetch from last known candle timestamp
    const toTime = nowSec;

    tradeStore.trackSymbolInEA(cleanSym);
    // Request ONLY the missing gap bars
    tradeStore.requestHistoryFromEA(cleanSym, cleanTf, Math.min(missingBars + 2, 2000), fromTime, toTime);

    tradeStore.addLog(
      'info',
      'Chart History Gap Detected & Request Dispatched',
      `Identified ${missingBars} missing bars on ${cleanSym} [${cleanTf}] from ${new Date(fromTime * 1000).toLocaleTimeString()} to ${new Date(toTime * 1000).toLocaleTimeString()}. Dispatched targeted gap-fill without duplicate history waste.`,
      'HISTORY_SYNC'
    );
  }

  return {
    status: 'GAP_FILL_REQUESTED',
    symbol: cleanSym,
    timeframe: cleanTf,
    existingCount: range.count,
    minTime: range.minTime,
    maxTime: range.maxTime,
    missingBars,
    requestedFrom: range.maxTime,
    requestedTo: nowSec,
    message: `Gap of ${missingBars} bars detected on ${cleanSym} [${cleanTf}]. Targeted gap-fill requested from MT5 EA for ${new Date(range.maxTime * 1000).toISOString()} -> ${new Date(nowSec * 1000).toISOString()}.`,
  };
}
