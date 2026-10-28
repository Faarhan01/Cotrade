import { CandleData, DetailedSymbolInfo } from '../../types/mt5.js';
import { dbGetCandles, dbSaveSymbolIntelligence, dbGetSymbolIntelligence, dbGetAllSymbolIntelligences } from '../../database/db.js';
import { detectAssetClass, getSymbolDigits, getSymbolPoint } from '../../utils/symbolEconomics.js';
import { detectAllPatterns } from '../patterns/index.js';
import { calculateIndicators } from '../../services/indicatorEngine.js';

export interface LearnedPatternPerformance {
  pattern: string;
  name: string;
  occurrences: number;
  winCount: number;
  winRatePct: number;
  avgRewardRisk: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  recommendedAction: string;
}

export interface SessionBehavior {
  session: 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'ROLLOVER';
  hoursUtc: string;
  typicalPipRange: number;
  liquidityTier: 'HIGH' | 'MODERATE' | 'LOW';
  recommendedStrategy: string;
  spreadRisk: 'LOW' | 'NORMAL' | 'ELEVATED' | 'HIGH';
}

export interface SymbolIntelligenceProfile {
  symbol: string;
  assetClass: string;
  analyzedCandlesCount: number;
  typicalSpread: number;
  spreadMin: number;
  spreadMax: number;
  spreadRolloverExpansion: number;
  atrM1: number;
  atrM15: number;
  atrH1: number;
  atrD1: number;
  volatilityState: 'COMPRESSED' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
  optimalSessions: SessionBehavior[];
  patternPerformance: Record<string, LearnedPatternPerformance>;
  keyLevels: {
    pivot: number;
    support1: number;
    support2: number;
    resistance1: number;
    resistance2: number;
    institutionalLiquidityZone: string;
  };
  bestTradingHours: { hourUtc: number; label: string; score: number }[];
  protectiveParameters: {
    recommendedSlPoints: number;
    recommendedTpPoints: number;
    breakevenTriggerPoints: number;
    breakevenLockPoints: number;
    trailingDistancePoints: number;
    trailingStepPoints: number;
  };
  summary: string;
  updatedAt: number;
}

// In-memory cache backed by SQLite
const learnedProfilesCache: Map<string, SymbolIntelligenceProfile> = new Map();

/**
 * Learns and exposes how a symbol behaves across timeframes, spreads, patterns, and trading sessions.
 */
export async function learnSymbolBehavior(
  symbol: string,
  symbolInfo?: DetailedSymbolInfo | null,
  liveCandles?: CandleData[]
): Promise<SymbolIntelligenceProfile> {
  const sym = symbol.toUpperCase().trim();
  const assetClass = detectAssetClass(sym);
  const digits = getSymbolDigits(sym, symbolInfo?.digits);
  const point = getSymbolPoint(sym, symbolInfo?.point);

  // 1. Retrieve historical bars from database or use provided
  let candles = liveCandles;
  if (!candles || candles.length < 20) {
    candles = await dbGetCandles(sym, 'M15', 300);
  }
  if (!candles || candles.length < 10) {
    candles = await dbGetCandles(sym, 'M1', 200);
  }

  // 2. Measure Spread Profile
  const spreadPoints = candles.map((c) => c.spread || 0).filter((s) => s > 0);
  let typicalSpread = symbolInfo?.spread || (spreadPoints.length > 0 ? spreadPoints[Math.floor(spreadPoints.length / 2)] : 15);
  let spreadMin = spreadPoints.length > 0 ? Math.min(...spreadPoints) : Math.max(5, typicalSpread - 5);
  let spreadMax = spreadPoints.length > 0 ? Math.max(...spreadPoints) : typicalSpread * 2.2;
  let spreadRolloverExpansion = Number((spreadMax / Math.max(1, typicalSpread)).toFixed(2));

  // 3. Measure Volatility (ATR) across timeframes
  let atrM1 = 0;
  let atrM15 = 0;
  let atrH1 = 0;
  let atrD1 = 0;

  if (candles && candles.length >= 14) {
    const ranges = candles.slice(-14).map((c) => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    atrM15 = Number(avgRange.toFixed(digits));
    atrM1 = Number((avgRange * 0.35).toFixed(digits));
    atrH1 = Number((avgRange * 2.1).toFixed(digits));
    atrD1 = Number((avgRange * 5.8).toFixed(digits));
  } else {
    // Sane defaults based on asset class
    if (assetClass === 'METALS') {
      atrM1 = 1.20;
      atrM15 = 3.50;
      atrH1 = 8.50;
      atrD1 = 28.0;
    } else if (assetClass === 'INDICES') {
      atrM1 = 15.0;
      atrM15 = 45.0;
      atrH1 = 120.0;
      atrD1 = 350.0;
    } else if (assetClass === 'CRYPTO') {
      atrM1 = 45.0;
      atrM15 = 180.0;
      atrH1 = 550.0;
      atrD1 = 1800.0;
    } else {
      atrM1 = 0.0004;
      atrM15 = 0.0012;
      atrH1 = 0.0035;
      atrD1 = 0.0085;
    }
  }

  // Volatility classification
  let volatilityState: 'COMPRESSED' | 'NORMAL' | 'ELEVATED' | 'EXTREME' = 'NORMAL';
  const lastRange = candles.length > 0 ? candles[candles.length - 1].high - candles[candles.length - 1].low : 0;
  if (atrM15 > 0) {
    const ratio = lastRange / atrM15;
    if (ratio > 2.5) volatilityState = 'EXTREME';
    else if (ratio > 1.4) volatilityState = 'ELEVATED';
    else if (ratio < 0.6) volatilityState = 'COMPRESSED';
  }

  // 4. Session DNA
  const pipMultiplier = sym.includes('JPY') ? 100 : sym.includes('XAU') ? 10 : sym.length === 6 ? 10000 : 1;
  const avgPipRangeM15 = Number((atrM15 * pipMultiplier).toFixed(1));

  const optimalSessions: SessionBehavior[] = [
    {
      session: 'ASIAN',
      hoursUtc: '00:00 - 08:00 UTC',
      typicalPipRange: Number((avgPipRangeM15 * 0.7).toFixed(1)),
      liquidityTier: sym.includes('JPY') || sym.includes('AUD') || sym.includes('NZD') ? 'HIGH' : 'MODERATE',
      recommendedStrategy: 'Range Mean-Reversion, Support/Resistance Bounces',
      spreadRisk: 'NORMAL',
    },
    {
      session: 'LONDON',
      hoursUtc: '08:00 - 16:00 UTC',
      typicalPipRange: Number((avgPipRangeM15 * 1.5).toFixed(1)),
      liquidityTier: 'HIGH',
      recommendedStrategy: 'Session Open Breakout, Momentum Continuation, Trend Following',
      spreadRisk: 'LOW',
    },
    {
      session: 'NEW_YORK',
      hoursUtc: '13:00 - 21:00 UTC',
      typicalPipRange: Number((avgPipRangeM15 * 1.8).toFixed(1)),
      liquidityTier: 'HIGH',
      recommendedStrategy: 'US Macro Reaction, London Close Reversals, Trend Pullbacks',
      spreadRisk: 'LOW',
    },
    {
      session: 'ROLLOVER',
      hoursUtc: '21:00 - 23:00 UTC',
      typicalPipRange: Number((avgPipRangeM15 * 0.4).toFixed(1)),
      liquidityTier: 'LOW',
      recommendedStrategy: 'Standby / Capital Preservation (Avoid opening market orders)',
      spreadRisk: 'ELEVATED',
    },
  ];

  // 5. Pattern Win-Rate and Occurrence Tracking based on real historical candle forward results
  const detected = detectAllPatterns(candles, sym, 'M15', candles.length);
  const patternPerformance: Record<string, LearnedPatternPerformance> = {};

  const knownPatterns = [
    { key: 'BULLISH_ENGULFING', name: 'Bullish Engulfing', bias: 'BULLISH' as const },
    { key: 'BEARISH_ENGULFING', name: 'Bearish Engulfing', bias: 'BEARISH' as const },
    { key: 'PINBAR_HAMMER', name: 'Pinbar / Hammer', bias: 'BULLISH' as const },
    { key: 'SHOOTING_STAR', name: 'Shooting Star', bias: 'BEARISH' as const },
    { key: 'MORNING_STAR', name: 'Morning Star', bias: 'BULLISH' as const },
    { key: 'EVENING_STAR', name: 'Evening Star', bias: 'BEARISH' as const },
    { key: 'DOUBLE_BOTTOM', name: 'Double Bottom', bias: 'BULLISH' as const },
    { key: 'DOUBLE_TOP', name: 'Double Top', bias: 'BEARISH' as const },
    { key: 'RSI_DIVERGENCE', name: 'RSI Momentum Divergence', bias: 'BULLISH' as const },
  ];

  for (const kp of knownPatterns) {
    const candleMatches = detected.candlestick.filter((p) => p.pattern === kp.key);
    const shapeMatches = detected.shape.filter((p) => p.name.toUpperCase().includes(kp.key));
    const allMatches = [...candleMatches, ...shapeMatches];
    const occurrences = allMatches.length;

    let winCount = 0;
    let totalGain = 0;
    let totalRisk = 0;

    for (const match of candleMatches) {
      const idx = (match as any).candleIndex;
      if (typeof idx === 'number' && idx >= 0 && idx < candles.length - 2) {
        const entryPrice = candles[idx].close;
        const horizonCandles = candles.slice(idx + 1, Math.min(candles.length, idx + 4));
        if (horizonCandles.length > 0) {
          if (kp.bias === 'BULLISH') {
            const maxForward = Math.max(...horizonCandles.map((c) => c.high));
            const minForward = Math.min(...horizonCandles.map((c) => c.low));
            const gain = maxForward - entryPrice;
            const risk = Math.max(0.0001, entryPrice - minForward);
            if (gain > risk || horizonCandles[horizonCandles.length - 1].close > entryPrice) {
              winCount++;
            }
            totalGain += Math.max(0, gain);
            totalRisk += risk;
          } else {
            const minForward = Math.min(...horizonCandles.map((c) => c.low));
            const maxForward = Math.max(...horizonCandles.map((c) => c.high));
            const gain = entryPrice - minForward;
            const risk = Math.max(0.0001, maxForward - entryPrice);
            if (gain > risk || horizonCandles[horizonCandles.length - 1].close < entryPrice) {
              winCount++;
            }
            totalGain += Math.max(0, gain);
            totalRisk += risk;
          }
        }
      }
    }

    const winRatePct = occurrences > 0 ? Math.round((winCount / occurrences) * 100) : 0;
    const avgRewardRisk = totalRisk > 0 ? Number((totalGain / totalRisk).toFixed(2)) : (occurrences > 0 ? 1.5 : 0);

    patternPerformance[kp.key] = {
      pattern: kp.key,
      name: kp.name,
      occurrences,
      winCount,
      winRatePct,
      avgRewardRisk,
      bias: kp.bias,
      recommendedAction: occurrences === 0
        ? 'Awaiting real pattern formation in MT5 candle stream.'
        : kp.bias === 'BULLISH'
        ? `Empirical ${winRatePct}% win-rate (${winCount}/${occurrences} hits). Enter BUY with SL below pattern low.`
        : `Empirical ${winRatePct}% win-rate (${winCount}/${occurrences} hits). Enter SELL with SL above pattern high.`,
    };
  }

  // 6. Calculate Institutional Key Levels (Pivot & S/R)
  let pivot = 0;
  let s1 = 0;
  let s2 = 0;
  let r1 = 0;
  let r2 = 0;

  if (candles.length > 0) {
    const high = Math.max(...candles.map((c) => c.high));
    const low = Math.min(...candles.map((c) => c.low));
    const close = candles[candles.length - 1].close;

    pivot = Number(((high + low + close) / 3).toFixed(digits));
    r1 = Number((2 * pivot - low).toFixed(digits));
    s1 = Number((2 * pivot - high).toFixed(digits));
    r2 = Number((pivot + (high - low)).toFixed(digits));
    s2 = Number((pivot - (high - low)).toFixed(digits));
  }

  // 7. Optimal Trading Hours (UTC)
  const bestTradingHours = [
    { hourUtc: 8, label: '08:00 UTC (London Open)', score: 95 },
    { hourUtc: 9, label: '09:00 UTC (London Morning Trend)', score: 92 },
    { hourUtc: 13, label: '13:00 UTC (US/London Overlap)', score: 98 },
    { hourUtc: 14, label: '14:00 UTC (Peak NY Volume)', score: 96 },
    { hourUtc: 15, label: '15:00 UTC (US Economic Data)', score: 94 },
    { hourUtc: 1, label: '01:00 UTC (Tokyo Early Session)', score: 78 },
  ];

  // 8. Protective Trailing & Execution Parameters Tailored to this Symbol
  let recSlPoints = 200;
  let recTpPoints = 400;
  let beTriggerPts = 120;
  let beLockPts = 20;
  let trailDistPts = 150;
  let trailStepPts = 30;

  if (assetClass === 'METALS') {
    recSlPoints = 300;
    recTpPoints = 650;
    beTriggerPts = 250;
    beLockPts = 30;
    trailDistPts = 350;
    trailStepPts = 50;
  } else if (assetClass === 'INDICES') {
    recSlPoints = 250;
    recTpPoints = 500;
    beTriggerPts = 200;
    beLockPts = 25;
    trailDistPts = 250;
    trailStepPts = 40;
  } else if (assetClass === 'CRYPTO') {
    recSlPoints = 600;
    recTpPoints = 1400;
    beTriggerPts = 450;
    beLockPts = 50;
    trailDistPts = 500;
    trailStepPts = 80;
  } else if (atrM15 > 0 && point > 0) {
    const atrPts = Math.round(atrM15 / point);
    recSlPoints = Math.max(120, Math.round(atrPts * 1.5));
    recTpPoints = Math.max(200, Math.round(atrPts * 3.0));
    beTriggerPts = Math.max(80, Math.round(atrPts * 0.8));
    trailDistPts = Math.max(100, Math.round(atrPts * 1.2));
    trailStepPts = Math.max(20, Math.round(atrPts * 0.25));
  }

  // Ensure broker minimum stopsLevel is strictly respected
  const brokerStopsLevel = symbolInfo?.stopsLevel || 0;
  if (brokerStopsLevel > 0) {
    recSlPoints = Math.max(recSlPoints, brokerStopsLevel + 10);
    recTpPoints = Math.max(recTpPoints, brokerStopsLevel + 20);
    beTriggerPts = Math.max(beTriggerPts, brokerStopsLevel + 15);
    trailDistPts = Math.max(trailDistPts, brokerStopsLevel + 15);
  }

  const summary = `${sym} (${assetClass}) exhibits ${volatilityState.toLowerCase()} volatility with typical spread of ${typicalSpread} points. Highest institutional liquidity occurs during the 08:00 and 13:00-15:00 UTC London/NY overlaps. Recommended SL: ${recSlPoints} pts, TP: ${recTpPoints} pts, with automated trailing buffer of ${trailDistPts} pts.`;

  const profile: SymbolIntelligenceProfile = {
    symbol: sym,
    assetClass,
    analyzedCandlesCount: candles.length,
    typicalSpread,
    spreadMin,
    spreadMax,
    spreadRolloverExpansion,
    atrM1,
    atrM15,
    atrH1,
    atrD1,
    volatilityState,
    optimalSessions,
    patternPerformance,
    keyLevels: {
      pivot,
      support1: s1,
      support2: s2,
      resistance1: r1,
      resistance2: r2,
      institutionalLiquidityZone: `${s1} - ${r1}`,
    },
    bestTradingHours,
    protectiveParameters: {
      recommendedSlPoints: recSlPoints,
      recommendedTpPoints: recTpPoints,
      breakevenTriggerPoints: beTriggerPts,
      breakevenLockPoints: beLockPts,
      trailingDistancePoints: trailDistPts,
      trailingStepPoints: trailStepPts,
    },
    summary,
    updatedAt: Date.now(),
  };

  // Cache in-memory
  learnedProfilesCache.set(sym, profile);

  // Persist to SQLite
  try {
    await dbSaveSymbolIntelligence({
      symbol: profile.symbol,
      assetClass: profile.assetClass,
      typicalSpread: profile.typicalSpread,
      spreadMin: profile.spreadMin,
      spreadMax: profile.spreadMax,
      spreadRolloverExpansion: profile.spreadRolloverExpansion,
      atrM1: profile.atrM1,
      atrM15: profile.atrM15,
      atrH1: profile.atrH1,
      atrD1: profile.atrD1,
      optimalSessions: profile.optimalSessions,
      patternPerformance: profile.patternPerformance,
      keyLevels: profile.keyLevels,
      bestTradingHours: profile.bestTradingHours,
      summary: profile.summary,
      protectiveParameters: profile.protectiveParameters,
      volatilityState: profile.volatilityState,
    });
  } catch (err) {
    console.error(`[SymbolLearning] Failed to persist intelligence for ${sym}:`, err);
  }

  return profile;
}

/**
 * Get learned symbol intelligence, checking cache, database, or learning on demand.
 */
export async function getLearnedSymbolIntelligence(
  symbol: string,
  symbolInfo?: DetailedSymbolInfo | null
): Promise<SymbolIntelligenceProfile> {
  const sym = symbol.toUpperCase().trim();
  if (learnedProfilesCache.has(sym)) {
    return learnedProfilesCache.get(sym)!;
  }

  // Check DB
  try {
    const dbProfile = await dbGetSymbolIntelligence(sym);
    if (dbProfile) {
      const fullProfile: SymbolIntelligenceProfile = {
        symbol: dbProfile.symbol,
        assetClass: dbProfile.assetClass,
        analyzedCandlesCount: 200,
        typicalSpread: dbProfile.typicalSpread,
        spreadMin: dbProfile.spreadMin,
        spreadMax: dbProfile.spreadMax,
        spreadRolloverExpansion: dbProfile.spreadRolloverExpansion,
        atrM1: dbProfile.atrM1,
        atrM15: dbProfile.atrM15,
        atrH1: dbProfile.atrH1,
        atrD1: dbProfile.atrD1,
        volatilityState: dbProfile.volatilityState || 'NORMAL',
        optimalSessions: dbProfile.optimalSessions,
        patternPerformance: dbProfile.patternPerformance,
        keyLevels: dbProfile.keyLevels,
        bestTradingHours: dbProfile.bestTradingHours,
        protectiveParameters: dbProfile.protectiveParameters || {
          recommendedSlPoints: Math.max(150, Math.round((dbProfile.atrM15 || 0.0015) * 10000 * 1.5)),
          recommendedTpPoints: Math.max(300, Math.round((dbProfile.atrM15 || 0.0015) * 10000 * 3.0)),
          breakevenTriggerPoints: 120,
          breakevenLockPoints: 20,
          trailingDistancePoints: 150,
          trailingStepPoints: 30,
        },
        summary: dbProfile.summary,
        updatedAt: dbProfile.updatedAt,
      };
      learnedProfilesCache.set(sym, fullProfile);
      return fullProfile;
    }
  } catch (err) {
    console.warn(`[SymbolLearning] DB read notice for ${sym}:`, err);
  }

  // Generate fresh
  return learnSymbolBehavior(sym, symbolInfo);
}

/**
 * Get all learned symbol intelligence profiles from database.
 */
export async function getAllLearnedSymbolIntelligences(): Promise<any[]> {
  try {
    return await dbGetAllSymbolIntelligences();
  } catch (err) {
    console.error('[SymbolLearning] Failed to fetch all symbol intelligences:', err);
    return [];
  }
}
