import { CandleData } from '../../types/mt5.js';
import { dbGetCandles } from '../../database/db.js';
import { calculateIndicators } from '../../services/indicatorEngine.js';
import { autoDetectMarketRegime } from '../core/auto-detect.js';
import { tradeStore } from '../../services/tradeStore.js';

export interface TimeframeAnalysis {
  timeframe: string;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendStrength: number; // 0 to 100
  regime: string;
  rsi: number | null;
  macdHistogram: number | null;
  emaCross: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  priceVsEma200: 'ABOVE' | 'BELOW' | 'AT';
  candleCount: number;
}

export interface MultiTimeframeConsensusResult {
  symbol: string;
  primaryTimeframe: string;
  higherTimeframes: string[];
  overallConsensus: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  concordanceScore: number; // 0 to 100%
  primaryDirection: 'BUY' | 'SELL' | 'HOLD';
  higherTimeframeTrend: 'BULLISH' | 'BEARISH' | 'MIXED';
  isAligned: boolean;
  canExecute: boolean;
  reasons: string[];
  warnings: string[];
  timeframeBreakdown: Record<string, TimeframeAnalysis>;
  evaluatedAt: number;
  evaluatedAtIso: string;
}

/**
 * Determine higher timeframes based on the primary execution timeframe.
 */
export function getDefaultHigherTimeframes(primaryTf: string): string[] {
  const tf = (primaryTf || 'M1').toUpperCase();
  switch (tf) {
    case 'M1':
      return ['M5', 'H1'];
    case 'M5':
      return ['M15', 'H1'];
    case 'M15':
      return ['H1', 'H4'];
    case 'M30':
      return ['H1', 'H4'];
    case 'H1':
      return ['H4', 'D1'];
    case 'H4':
      return ['D1'];
    default:
      return ['H1', 'D1'];
  }
}

/**
 * Evaluate single timeframe indicators and trend direction.
 */
function analyzeCandlesForTimeframe(timeframe: string, candles: CandleData[], currentPrice: number): TimeframeAnalysis {
  if (!candles || candles.length < 10) {
    return {
      timeframe,
      trend: 'NEUTRAL',
      trendStrength: 50,
      regime: 'UNKNOWN',
      rsi: null,
      macdHistogram: null,
      emaCross: 'NEUTRAL',
      priceVsEma200: 'AT',
      candleCount: candles?.length || 0,
    };
  }

  const indicators = calculateIndicators(candles, 'SYM', timeframe);
  const regime = autoDetectMarketRegime('SYM', candles);

  let bullVotes = 0;
  let bearVotes = 0;

  if (indicators) {
    if (indicators.ema9 !== null && indicators.ema21 !== null) {
      if (indicators.ema9 > indicators.ema21) bullVotes += 2;
      else if (indicators.ema9 < indicators.ema21) bearVotes += 2;
    }

    if (indicators.ema21 !== null && indicators.ema50 !== null) {
      if (indicators.ema21 > indicators.ema50) bullVotes += 2;
      else if (indicators.ema21 < indicators.ema50) bearVotes += 2;
    }

    if (indicators.ema200 !== null) {
      if (currentPrice > indicators.ema200) bullVotes += 3;
      else if (currentPrice < indicators.ema200) bearVotes += 3;
    }

    if (indicators.macd) {
      if (indicators.macd.histogram > 0) bullVotes += 1;
      else if (indicators.macd.histogram < 0) bearVotes += 1;
    }

    if (indicators.rsi14 !== null) {
      if (indicators.rsi14 > 50 && indicators.rsi14 < 70) bullVotes += 1;
      else if (indicators.rsi14 < 50 && indicators.rsi14 > 30) bearVotes += 1;
    }
  }

  const total = bullVotes + bearVotes;
  let trend: TimeframeAnalysis['trend'] = 'NEUTRAL';
  let strength = 50;

  if (bullVotes >= bearVotes + 2) {
    trend = 'BULLISH';
    strength = total > 0 ? Math.round((bullVotes / total) * 100) : 65;
  } else if (bearVotes >= bullVotes + 2) {
    trend = 'BEARISH';
    strength = total > 0 ? Math.round((bearVotes / total) * 100) : 65;
  }

  const emaCross = (indicators?.ema9 && indicators?.ema21)
    ? (indicators.ema9 > indicators.ema21 ? 'BULLISH' : 'BEARISH')
    : 'NEUTRAL';

  const priceVsEma200 = indicators?.ema200
    ? (currentPrice > indicators.ema200 ? 'ABOVE' : 'BELOW')
    : 'AT';

  return {
    timeframe,
    trend,
    trendStrength: strength,
    regime: regime.regimeLabel,
    rsi: indicators?.rsi14 ?? null,
    macdHistogram: indicators?.macd?.histogram ?? null,
    emaCross,
    priceVsEma200,
    candleCount: candles.length,
  };
}

/**
 * Perform comprehensive Multi-Timeframe Consensus Evaluation.
 */
export async function evaluateMultiTimeframeConsensus(
  symbol: string,
  primaryTimeframe = 'M1',
  higherTimeframes?: string[]
): Promise<MultiTimeframeConsensusResult> {
  const sym = symbol.toUpperCase().trim();
  const htfList = (higherTimeframes && higherTimeframes.length > 0)
    ? higherTimeframes
    : getDefaultHigherTimeframes(primaryTimeframe);

  const ticks = tradeStore.getTicks().filter((t) => t.symbol?.toUpperCase() === sym);
  const currentPrice = ticks.length > 0 ? ticks[0].bid : (tradeStore.getCurrentChart()?.bid || 0);

  // Load candles for primary timeframe
  let primaryCandles = tradeStore.getChartHistory();
  if (!primaryCandles || primaryCandles.length < 20 || (tradeStore.getCurrentChart()?.symbol?.toUpperCase() !== sym)) {
    primaryCandles = await dbGetCandles(sym, primaryTimeframe, 200);
  }

  const breakdown: Record<string, TimeframeAnalysis> = {};
  breakdown[primaryTimeframe] = analyzeCandlesForTimeframe(primaryTimeframe, primaryCandles || [], currentPrice);

  // Load and evaluate each higher timeframe
  for (const htf of htfList) {
    let htfCandles = await dbGetCandles(sym, htf, 150);
    // If not in DB, fall back to in-memory chart history
    if (!htfCandles || htfCandles.length < 10) {
      htfCandles = primaryCandles || [];
    }
    breakdown[htf] = analyzeCandlesForTimeframe(htf, htfCandles, currentPrice);
  }

  const primaryAnalysis = breakdown[primaryTimeframe];
  const primaryTrend = primaryAnalysis.trend;

  let htfBullCount = 0;
  let htfBearCount = 0;

  for (const htf of htfList) {
    const a = breakdown[htf];
    if (a.trend === 'BULLISH') htfBullCount++;
    else if (a.trend === 'BEARISH') htfBearCount++;
  }

  let higherTimeframeTrend: MultiTimeframeConsensusResult['higherTimeframeTrend'] = 'MIXED';
  if (htfBullCount > htfBearCount && htfBullCount >= Math.ceil(htfList.length / 2)) {
    higherTimeframeTrend = 'BULLISH';
  } else if (htfBearCount > htfBullCount && htfBearCount >= Math.ceil(htfList.length / 2)) {
    higherTimeframeTrend = 'BEARISH';
  }

  const isAligned =
    (primaryTrend === 'BULLISH' && higherTimeframeTrend === 'BULLISH') ||
    (primaryTrend === 'BEARISH' && higherTimeframeTrend === 'BEARISH');

  const isConflict =
    (primaryTrend === 'BULLISH' && higherTimeframeTrend === 'BEARISH') ||
    (primaryTrend === 'BEARISH' && higherTimeframeTrend === 'BULLISH');

  let concordanceScore = 50;
  if (isAligned) {
    concordanceScore = 85 + Math.min(10, htfBullCount * 5);
  } else if (isConflict) {
    concordanceScore = 30;
  } else {
    concordanceScore = 60;
  }

  let overallConsensus: MultiTimeframeConsensusResult['overallConsensus'] = 'NEUTRAL';
  let primaryDirection: MultiTimeframeConsensusResult['primaryDirection'] = 'HOLD';
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (isAligned && primaryTrend === 'BULLISH') {
    overallConsensus = 'STRONG_BUY';
    primaryDirection = 'BUY';
    reasons.push(`Primary [${primaryTimeframe}] aligns with higher timeframes (${htfList.join(', ')}): Strong Bullish Trend`);
  } else if (isAligned && primaryTrend === 'BEARISH') {
    overallConsensus = 'STRONG_SELL';
    primaryDirection = 'SELL';
    reasons.push(`Primary [${primaryTimeframe}] aligns with higher timeframes (${htfList.join(', ')}): Strong Bearish Trend`);
  } else if (primaryTrend === 'BULLISH') {
    overallConsensus = 'BUY';
    primaryDirection = 'BUY';
    if (isConflict) {
      warnings.push(`Counter-trend Warning: Primary [${primaryTimeframe}] is Bullish but Higher Timeframe Trend is Bearish`);
    }
  } else if (primaryTrend === 'BEARISH') {
    overallConsensus = 'SELL';
    primaryDirection = 'SELL';
    if (isConflict) {
      warnings.push(`Counter-trend Warning: Primary [${primaryTimeframe}] is Bearish but Higher Timeframe Trend is Bullish`);
    }
  }

  const canExecute = isAligned || !isConflict;

  return {
    symbol: sym,
    primaryTimeframe,
    higherTimeframes: htfList,
    overallConsensus,
    concordanceScore,
    primaryDirection,
    higherTimeframeTrend,
    isAligned,
    canExecute,
    reasons,
    warnings,
    timeframeBreakdown: breakdown,
    evaluatedAt: Date.now(),
    evaluatedAtIso: new Date().toISOString(),
  };
}
