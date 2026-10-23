import { CandleData } from '../../types/mt5.js';
import { detectAllPatterns } from '../patterns/index.js';
import { calculateIndicators } from '../../services/indicatorEngine.js';
import { autoDetectMarketRegime } from './auto-detect.js';
import { analyzeSymbolNewsImpact } from '../news/symbolImpact.js';
import { autoDetectSupportResistanceAndPivots } from './auto-detect.js';

export interface TradeSignal {
  symbol: string;
  timeframe: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
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
  dataQuality: 'LIVE' | 'SYNTHETIC' = 'LIVE'
): Promise<TradeSignal> {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const sym = symbol.toUpperCase();

  // 1. Pattern detection
  const patterns = detectAllPatterns(candles, sym, 'M1');
  const patternBias = patterns.overallPatternBias;
  if (patternBias === 'BULLISH') reasons.push(`Pattern bias bullish (${patterns.totalPatternsFound} patterns)`);
  else if (patternBias === 'BEARISH') reasons.push(`Pattern bias bearish (${patterns.totalPatternsFound} patterns)`);

  // 2. Indicator analysis
  const indicators = calculateIndicators(candles, sym, 'M1');
  let indicatorBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (indicators) {
    const signals: number[] = [];
    if (indicators.rsi14 !== null) {
      if (indicators.rsi14 < 30) { signals.push(1); reasons.push('RSI oversold (<30)'); }
      else if (indicators.rsi14 > 70) { signals.push(-1); reasons.push('RSI overbought (>70)'); }
    }
    if (indicators.macd && indicators.macd.histogram > 0) { signals.push(1); }
    else if (indicators.macd && indicators.macd.histogram < 0) { signals.push(-1); }
    if (indicators.ema21 !== null && indicators.ema50 !== null) {
      if (indicators.ema21 > indicators.ema50) signals.push(1);
      else signals.push(-1);
    }
    if (indicators.ema200 !== null && currentPrice > indicators.ema200) signals.push(1);
    else if (indicators.ema200 !== null && currentPrice < indicators.ema200) signals.push(-1);

    const sum = signals.reduce((a, b) => a + b, 0);
    if (sum >= 2) indicatorBias = 'BULLISH';
    else if (sum <= -2) indicatorBias = 'BEARISH';
  }

  // 3. Market regime
  const regime = autoDetectMarketRegime(sym, candles);
  if (regime.regime === 'TRENDING_BULLISH') { reasons.push('Market regime: trending bullish'); }
  else if (regime.regime === 'TRENDING_BEARISH') { reasons.push('Market regime: trending bearish'); }
  else if (regime.regime === 'MEAN_REVERTING_RANGE') { reasons.push('Market regime: range bound'); }

  // 4. News sentiment
  let newsSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let eventRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  try {
    const impact = await analyzeSymbolNewsImpact(sym);
    newsSentiment = impact.overallSentiment;
    eventRisk = impact.eventRiskLevel;
    if (eventRisk === 'CRITICAL') {
      warnings.push('CRITICAL news event imminent - avoid initiating market orders');
    }
    if (newsSentiment === 'BULLISH') reasons.push('News sentiment bullish');
    else if (newsSentiment === 'BEARISH') reasons.push('News sentiment bearish');
  } catch {
    // News analysis failed, continue without it
  }

  // 5. Support/Resistance
  const sr = autoDetectSupportResistanceAndPivots(sym, candles);
  const supportLevel = sr.nearestSupport || null;
  const resistanceLevel = sr.nearestResistance || null;

  // Determine direction
  let bullScore = 0;
  let bearScore = 0;

  if (patternBias === 'BULLISH') bullScore += 2;
  if (patternBias === 'BEARISH') bearScore += 2;
  if (indicatorBias === 'BULLISH') bullScore += 2;
  if (indicatorBias === 'BEARISH') bearScore += 2;
  if (regime.regime === 'TRENDING_BULLISH') bullScore += 1;
  if (regime.regime === 'TRENDING_BEARISH') bearScore += 1;
  if (newsSentiment === 'BULLISH') bullScore += 1;
  if (newsSentiment === 'BEARISH') bearScore += 1;

  let direction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  const totalScore = bullScore + bearScore;
  const confidence = totalScore > 0 ? Math.min(95, Math.round((Math.max(bullScore, bearScore) / totalScore) * 100)) : 50;

  if (bullScore >= 4 && bullScore > bearScore + 1) direction = 'BUY';
  else if (bearScore >= 4 && bearScore > bullScore + 1) direction = 'SELL';

  if (eventRisk === 'CRITICAL') {
    direction = 'HOLD';
    warnings.push('Signal overridden to HOLD due to critical event risk');
  }

  // Calculate SL/TP
  const atr = regime.volatilityState === 'EXTREME' || regime.volatilityState === 'EXPANDING' ? currentPrice * 0.002 : currentPrice * 0.001;
  let stopLoss = 0;
  let takeProfit = 0;

  if (direction === 'BUY') {
    stopLoss = supportLevel ? Math.min(supportLevel, currentPrice - atr) : currentPrice - atr * 2;
    takeProfit = resistanceLevel ? Math.max(resistanceLevel, currentPrice + atr * 3) : currentPrice + atr * 3;
  } else if (direction === 'SELL') {
    stopLoss = resistanceLevel ? Math.max(resistanceLevel, currentPrice + atr) : currentPrice + atr * 2;
    takeProfit = supportLevel ? Math.min(supportLevel, currentPrice - atr * 3) : currentPrice - atr * 3;
  }

  const riskRewardRatio = direction !== 'HOLD' && Math.abs(currentPrice - stopLoss) > 0
    ? Math.abs(takeProfit - currentPrice) / Math.abs(currentPrice - stopLoss)
    : 0;

  return {
    symbol: sym,
    timeframe: 'M1',
    direction,
    confidence,
    entryPrice: currentPrice,
    stopLoss: Number(stopLoss.toFixed(5)),
    takeProfit: Number(takeProfit.toFixed(5)),
    riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
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
