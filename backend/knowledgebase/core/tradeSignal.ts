import { CandleData } from '../../types/mt5.js';
import { detectAllPatterns } from '../patterns/index.js';
import { calculateIndicators } from '../../services/indicatorEngine.js';
import { autoDetectMarketRegime } from './auto-detect.js';
import { analyzeSymbolNewsImpact } from '../news/symbolImpact.js';
import { autoDetectSupportResistanceAndPivots } from './auto-detect.js';
import { getSymbolDigits, getSymbolPoint, detectAssetClass } from '../../utils/symbolEconomics.js';

export interface TrailingProtectionRecommendation {
  breakevenTriggerPoints: number;
  breakevenLockPoints: number;
  trailingDistancePoints: number;
  trailingStepPoints: number;
  halfwayTargetPrice: number;
  recommendedTrailingType: 'ADAPTIVE_ATR' | 'FIXED_PIPS';
}

export interface TradeSignal {
  symbol: string;
  timeframe: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  trailingProtection?: TrailingProtectionRecommendation;
  reasons: string[];
  warnings: string[];
  components: {
    patternBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    patternCount: number;
    indicatorBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    regime: string;
    newsSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    eventRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    supportLevel: number | null;
    resistanceLevel: number | null;
  };
  dataQuality: 'LIVE' | 'SYNTHETIC';
  generatedAt: number;
}


export interface PositionSizeResult {
  symbol: string;
  accountBalance: number;
  riskPercent: number;
  riskAmount: number;
  entryPrice: number;
  stopLossPrice: number;
  stopLossDistance: number;
  contractSize: number;
  pipValue: number;
  recommendedLots: number;
  maxLotsByMargin: number;
  marginRequired: number;
  warnings: string[];
}

/**
 * Generate a comprehensive trade signal by aggregating multiple analysis sources.
 */
export async function generateTradeSignal(
  symbol: string,
  candles: CandleData[],
  currentPrice: number,
  accountBalance: number = 10000,
  dataQuality: 'LIVE' | 'SYNTHETIC' = 'LIVE',
  timeframe: string = 'M1'
): Promise<TradeSignal> {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const sym = symbol.toUpperCase();
  const tf = timeframe || 'M1';

  // 1. Pattern detection across full suite
  const patterns = detectAllPatterns(candles, sym, tf);
  const patternBias = patterns.overallPatternBias;
  if (patternBias === 'BULLISH') reasons.push(`Pattern confluence bullish (${patterns.totalPatternsFound} pattern(s) identified)`);
  else if (patternBias === 'BEARISH') reasons.push(`Pattern confluence bearish (${patterns.totalPatternsFound} pattern(s) identified)`);

  // Highlight specific high-conviction candlestick and shape formations
  for (const cp of patterns.candlestick.slice(0, 2)) {
    reasons.push(`${cp.name} (${cp.bias.toLowerCase()}): ${cp.description}`);
  }
  for (const sp of patterns.shape.slice(0, 1)) {
    reasons.push(`${sp.name} [Shape]: ${sp.description}`);
  }
  for (const ip of patterns.indicator.slice(0, 2)) {
    reasons.push(`${ip.name} [Indicator]: ${ip.description}`);
  }

  // 2. Indicator analysis
  const indicators = calculateIndicators(candles, sym, tf);
  let indicatorBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let realAtr = 0;

  if (indicators) {
    if (indicators.atr14 && indicators.atr14 > 0) {
      realAtr = indicators.atr14;
    }

    const signals: number[] = [];
    if (indicators.rsi14 !== null) {
      if (indicators.rsi14 < 30) { signals.push(1); reasons.push(`RSI (${indicators.rsi14.toFixed(1)}) oversold - rebound potential`); }
      else if (indicators.rsi14 > 70) { signals.push(-1); reasons.push(`RSI (${indicators.rsi14.toFixed(1)}) overbought - pullback risk`); }
    }
    if (indicators.macd) {
      if (indicators.macd.histogram > 0) {
        signals.push(1);
        reasons.push(`MACD histogram positive (+${indicators.macd.histogram.toFixed(5)})`);
      } else if (indicators.macd.histogram < 0) {
        signals.push(-1);
        reasons.push(`MACD histogram negative (${indicators.macd.histogram.toFixed(5)})`);
      }
    }
    if (indicators.ema9 !== null && indicators.ema21 !== null) {
      if (indicators.ema9 > indicators.ema21) {
        signals.push(1);
        reasons.push(`Fast EMA-9 (${indicators.ema9.toFixed(5)}) trading above EMA-21 (${indicators.ema21.toFixed(5)})`);
      } else {
        signals.push(-1);
        reasons.push(`Fast EMA-9 (${indicators.ema9.toFixed(5)}) trading below EMA-21 (${indicators.ema21.toFixed(5)})`);
      }
    }
    if (indicators.ema200 !== null) {
      if (currentPrice > indicators.ema200) {
        signals.push(1);
        reasons.push(`Price above baseline 200 EMA (${indicators.ema200.toFixed(5)}) - macro uptrend`);
      } else if (currentPrice < indicators.ema200) {
        signals.push(-1);
        reasons.push(`Price below baseline 200 EMA (${indicators.ema200.toFixed(5)}) - macro downtrend`);
      }
    }

    const sum = signals.reduce((a, b) => a + b, 0);
    if (sum >= 2) indicatorBias = 'BULLISH';
    else if (sum <= -2) indicatorBias = 'BEARISH';
  }

  // 3. Market regime
  const regime = autoDetectMarketRegime(sym, candles);
  if (regime.regime === 'TRENDING_BULLISH') { reasons.push(`Market regime: ${regime.regimeLabel} (Strength: ${regime.trendStrength}%)`); }
  else if (regime.regime === 'TRENDING_BEARISH') { reasons.push(`Market regime: ${regime.regimeLabel} (Strength: ${regime.trendStrength}%)`); }
  else if (regime.regime === 'VOLATILITY_EXPANSION_BREAKOUT') { reasons.push(`Market regime: Volatility Breakout (${regime.dominantBias} bias)`); }
  else if (regime.regime === 'COMPRESSION_SQUEEZE') { warnings.push('Market in tight compression squeeze - breakout imminent, watch for whipsaws'); }
  else if (regime.regime === 'MEAN_REVERTING_RANGE') { reasons.push(`Market regime: Range-bound consolidation (Range: ${regime.keySupport.toFixed(5)} - ${regime.keyResistance.toFixed(5)})`); }

  // 4. Macroeconomic news sentiment & event risk
  let newsSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let eventRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  try {
    const impact = await analyzeSymbolNewsImpact(sym);
    newsSentiment = impact.overallSentiment;
    eventRisk = impact.eventRiskLevel;
    if (eventRisk === 'CRITICAL') {
      warnings.push('CRITICAL tier-1 macroeconomic release imminent - avoid initiating market orders');
    } else if (eventRisk === 'HIGH') {
      warnings.push('Elevated event risk from scheduled macroeconomic catalysts');
    }
    if (newsSentiment === 'BULLISH') reasons.push(`Macro sentiment bullish (+${impact.netSentimentScore}) for ${sym} underlying currencies`);
    else if (newsSentiment === 'BEARISH') reasons.push(`Macro sentiment bearish (${impact.netSentimentScore}) for ${sym} underlying currencies`);
  } catch {
    // News analysis gracefully bypassed if offline
  }

  // 5. Support/Resistance and Pivots
  const sr = autoDetectSupportResistanceAndPivots(sym, candles);
  const supportLevel = sr.nearestSupport || null;
  const resistanceLevel = sr.nearestResistance || null;

  // Determine direction with multi-factor scoring
  let bullScore = 0;
  let bearScore = 0;

  if (patternBias === 'BULLISH') bullScore += 3;
  if (patternBias === 'BEARISH') bearScore += 3;
  if (indicatorBias === 'BULLISH') bullScore += 3;
  if (indicatorBias === 'BEARISH') bearScore += 3;
  if (regime.regime === 'TRENDING_BULLISH' || (regime.regime === 'VOLATILITY_EXPANSION_BREAKOUT' && regime.dominantBias === 'BULLISH')) bullScore += 2;
  if (regime.regime === 'TRENDING_BEARISH' || (regime.regime === 'VOLATILITY_EXPANSION_BREAKOUT' && regime.dominantBias === 'BEARISH')) bearScore += 2;
  if (newsSentiment === 'BULLISH') bullScore += 1;
  if (newsSentiment === 'BEARISH') bearScore += 1;

  let direction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  const totalScore = bullScore + bearScore;
  let confidence = totalScore > 0 ? Math.min(95, Math.round((Math.max(bullScore, bearScore) / (totalScore + 2)) * 100)) : 50;

  if (bullScore >= 4 && bullScore > bearScore + 1) direction = 'BUY';
  else if (bearScore >= 4 && bearScore > bullScore + 1) direction = 'SELL';

  // Tri-factor alignment bonus (Patterns + Indicators + Regime all agreeing)
  if (
    (direction === 'BUY' && patternBias === 'BULLISH' && indicatorBias === 'BULLISH' && regime.dominantBias === 'BULLISH') ||
    (direction === 'SELL' && patternBias === 'BEARISH' && indicatorBias === 'BEARISH' && regime.dominantBias === 'BEARISH')
  ) {
    confidence = Math.min(96, confidence + 8);
    reasons.push('High-Conviction Confluence: Patterns, Indicators, and Trend Regime are fully aligned.');
  }

  if (eventRisk === 'CRITICAL') {
    direction = 'HOLD';
    confidence = Math.min(confidence, 40);
    warnings.push('Signal overridden to HOLD due to critical event risk');
  }

  // Calculate real ATR for SL/TP calibration
  if (realAtr <= 0) {
    if (candles && candles.length >= 5) {
      const ranges = candles.slice(-14).map((c) => c.high - c.low);
      realAtr = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    }
    if (realAtr <= 0) {
      realAtr = currentPrice > 100 ? currentPrice * 0.0015 : currentPrice * 0.001;
    }
  }

  const digits = getSymbolDigits(sym);
  const point = getSymbolPoint(sym);

  let stopLoss = 0;
  let takeProfit = 0;

  if (direction === 'BUY') {
    // Sane ATR bracket (1.2 to 2.0 ATR for SL, 2.0 to 3.5 ATR for TP)
    const slDist = realAtr * 1.5;
    const tpDist = Math.max(slDist * 1.8, realAtr * 2.7);

    // If support level exists and is within a reasonable distance (0.8x to 2.2x ATR), anchor to it
    if (supportLevel && supportLevel < currentPrice && (currentPrice - supportLevel) >= realAtr * 0.8 && (currentPrice - supportLevel) <= realAtr * 2.5) {
      stopLoss = supportLevel - point * 10;
    } else {
      stopLoss = currentPrice - slDist;
    }

    if (resistanceLevel && resistanceLevel > currentPrice && (resistanceLevel - currentPrice) >= (currentPrice - stopLoss) * 1.5) {
      takeProfit = resistanceLevel;
    } else {
      takeProfit = currentPrice + tpDist;
    }
  } else if (direction === 'SELL') {
    const slDist = realAtr * 1.5;
    const tpDist = Math.max(slDist * 1.8, realAtr * 2.7);

    if (resistanceLevel && resistanceLevel > currentPrice && (resistanceLevel - currentPrice) >= realAtr * 0.8 && (resistanceLevel - currentPrice) <= realAtr * 2.5) {
      stopLoss = resistanceLevel + point * 10;
    } else {
      stopLoss = currentPrice + slDist;
    }

    if (supportLevel && supportLevel < currentPrice && (currentPrice - supportLevel) >= (stopLoss - currentPrice) * 1.5) {
      takeProfit = supportLevel;
    } else {
      takeProfit = currentPrice - tpDist;
    }
  }

    const riskRewardRatio = direction !== 'HOLD' && Math.abs(currentPrice - stopLoss) > 0
    ? Math.abs(takeProfit - currentPrice) / Math.abs(currentPrice - stopLoss)
    : 0;

  // Calculate dynamic trailing stop and breakeven parameters tailored to the symbol & ATR
  const assetClass = detectAssetClass(sym);
  let beTriggerPts = 120;
  let beLockPts = 20;
  let trailDistPts = 150;
  let trailStepPts = 30;

  if (assetClass === 'METALS') {
    beTriggerPts = 250;
    beLockPts = 30;
    trailDistPts = 350;
    trailStepPts = 50;
  } else if (assetClass === 'INDICES') {
    beTriggerPts = 200;
    beLockPts = 25;
    trailDistPts = 250;
    trailStepPts = 40;
  } else if (assetClass === 'CRYPTO') {
    beTriggerPts = 450;
    beLockPts = 50;
    trailDistPts = 500;
    trailStepPts = 80;
  } else if (realAtr > 0 && point > 0) {
    const atrPoints = Math.round(realAtr / point);
    beTriggerPts = Math.max(80, Math.round(atrPoints * 0.7));
    trailDistPts = Math.max(100, Math.round(atrPoints * 1.0));
    trailStepPts = Math.max(20, Math.round(atrPoints * 0.2));
  }

  const halfwayTargetPrice = direction !== 'HOLD'
    ? Number(((currentPrice + takeProfit) / 2).toFixed(digits))
    : currentPrice;

  return {
    symbol: sym,
    timeframe: tf,
    direction,
    confidence,
    entryPrice: Number(currentPrice.toFixed(digits)),
    stopLoss: Number(stopLoss.toFixed(digits)),
    takeProfit: Number(takeProfit.toFixed(digits)),
    riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
    trailingProtection: {
      breakevenTriggerPoints: beTriggerPts,
      breakevenLockPoints: beLockPts,
      trailingDistancePoints: trailDistPts,
      trailingStepPoints: trailStepPts,
      halfwayTargetPrice,
      recommendedTrailingType: realAtr > 0 ? 'ADAPTIVE_ATR' : 'FIXED_PIPS',
    },
    reasons,
    warnings,
    components: {
      patternBias,
      patternCount: patterns.totalPatternsFound,
      indicatorBias,
      regime: regime.regime,
      newsSentiment,
      eventRisk,
      supportLevel,
      resistanceLevel,
    },
    dataQuality,
    generatedAt: Date.now(),
  };
}


/**
 * Calculate position size based on risk parameters.
 */
export function calculatePositionSize(
  symbol: string,
  accountBalance: number,
  riskPercent: number,
  entryPrice: number,
  stopLossPrice: number,
  contractSize: number = 100000,
  maxLotSize: number = 10
): PositionSizeResult {
  const warnings: string[] = [];
  const riskAmount = accountBalance * (riskPercent / 100);
  const slDistance = Math.abs(entryPrice - stopLossPrice);

  if (slDistance === 0) {
    warnings.push('Stop loss distance is zero - cannot calculate position size');
    return {
      symbol,
      accountBalance,
      riskPercent,
      riskAmount,
      entryPrice,
      stopLossPrice,
      stopLossDistance: 0,
      contractSize,
      pipValue: 0,
      recommendedLots: 0,
      maxLotsByMargin: 0,
      marginRequired: 0,
      warnings,
    };
  }

  // Risk amount / (SL distance * contract size) = lots
  const rawLots = riskAmount / (slDistance * contractSize);
  const recommendedLots = Math.min(Math.max(0.01, Math.floor(rawLots * 100) / 100), maxLotSize);

  // Margin check (assuming 1:100 leverage default)
  const leverage = 100;
  const marginRequired = (recommendedLots * contractSize * entryPrice) / leverage;
  const maxLotsByMargin = (accountBalance * leverage) / (contractSize * entryPrice);

  if (recommendedLots > maxLotsByMargin) {
    warnings.push(`Recommended lots (${recommendedLots}) exceeds margin capacity (${maxLotsByMargin.toFixed(2)})`);
  }
  if (riskPercent > 5) {
    warnings.push('Risk per trade exceeds 5% - consider reducing');
  }

  const pipValue = contractSize * 0.0001; // for 4-decimal pairs

  return {
    symbol,
    accountBalance,
    riskPercent,
    riskAmount: Number(riskAmount.toFixed(2)),
    entryPrice,
    stopLossPrice,
    stopLossDistance: Number(slDistance.toFixed(5)),
    contractSize,
    pipValue: Number(pipValue.toFixed(2)),
    recommendedLots: Number(recommendedLots.toFixed(2)),
    maxLotsByMargin: Number(maxLotsByMargin.toFixed(2)),
    marginRequired: Number(marginRequired.toFixed(2)),
    warnings,
  };
}
