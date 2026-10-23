import { CandleData, TechnicalIndicatorsResult } from '../../types/mt5.js';
import { computeRSI, computeRSISeries } from './momentum/rsi.js';
import { computeMACD, MACDResult } from './momentum/macd.js';
import { computeStochastic, StochasticResult } from './momentum/stochastic.js';
import { computeEMA, computeEMASeries } from './trend/ema.js';
import { computeSMA, computeSMASeries } from './trend/sma.js';
import { computeATR } from './volatility/atr.js';
import { computeBollinger, BollingerResult } from './volatility/bollinger.js';
import { computeVolumeProfile, VolumeProfileResult } from './volume/volumeProfile.js';

export {
  computeRSI,
  computeRSISeries,
  computeMACD,
  computeStochastic,
  computeEMA,
  computeEMASeries,
  computeSMA,
  computeSMASeries,
  computeATR,
  computeBollinger,
  computeVolumeProfile,
};
export type { MACDResult, StochasticResult, BollingerResult, VolumeProfileResult };

export interface ComprehensiveIndicatorsResult extends TechnicalIndicatorsResult {
  stochastic?: StochasticResult | null;
  volumeProfile?: VolumeProfileResult | null;
}

export function calculateIndicators(
  candles: CandleData[],
  symbol: string,
  timeframe: string
): ComprehensiveIndicatorsResult | null {
  if (!candles || candles.length < 5) return null;

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const n = closes.length;
  const currentPrice = closes[n - 1];
  const lastTime = candles[n - 1].time;

  // Momentum Indicators
  const rsi14 = computeRSI(closes, 14);
  const macd = computeMACD(closes, 12, 26, 9);
  const stochastic = computeStochastic(highs, lows, closes, 14, 3, 3);

  // Trend Indicators
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, Math.min(200, n));
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);

  // Volatility Indicators
  const bollinger = computeBollinger(closes, 20, 2);
  const atr14 = computeATR(highs, lows, closes, 14);

  // Volume Indicators
  const volumeProfile = computeVolumeProfile(candles, 20);

  // Directional Signals
  let rsiSignal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' = 'NEUTRAL';
  if (rsi14 !== null) {
    if (rsi14 >= 70) rsiSignal = 'OVERBOUGHT';
    else if (rsi14 <= 30) rsiSignal = 'OVERSOLD';
  }

  let macdSignal: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NEUTRAL' = 'NEUTRAL';
  if (macd) {
    if (macd.histogram > 0) macdSignal = 'BULLISH_CROSS';
    else if (macd.histogram < 0) macdSignal = 'BEARISH_CROSS';
  }

  let emaSignal: 'ABOVE_200' | 'BELOW_200' | 'NEUTRAL' = 'NEUTRAL';
  if (ema200 !== null) {
    if (currentPrice > ema200) emaSignal = 'ABOVE_200';
    else if (currentPrice < ema200) emaSignal = 'BELOW_200';
  }

  // Consensus Scoring
  let bullScore = 0;
  let bearScore = 0;

  if (rsi14 !== null) {
    if (rsi14 > 50 && rsi14 < 70) bullScore++;
    else if (rsi14 < 50 && rsi14 > 30) bearScore++;
    else if (rsi14 <= 30) bullScore += 2; // Oversold rebound potential
    else if (rsi14 >= 70) bearScore += 2; // Overbought exhaustion
  }

  if (macd) {
    if (macd.histogram > 0) bullScore++;
    else bearScore++;
  }

  if (ema9 !== null && ema21 !== null) {
    if (ema9 > ema21) bullScore++;
    else bearScore++;
  }

  if (ema200 !== null) {
    if (currentPrice > ema200) bullScore++;
    else bearScore++;
  }

  if (stochastic) {
    if (stochastic.k < 20) bullScore++;
    else if (stochastic.k > 80) bearScore++;
  }

  let summary: TechnicalIndicatorsResult['summary'] = 'NEUTRAL';
  if (bullScore >= 5) summary = 'STRONG_BUY';
  else if (bullScore > bearScore) summary = 'BUY';
  else if (bearScore >= 5) summary = 'STRONG_SELL';
  else if (bearScore > bullScore) summary = 'SELL';

  return {
    symbol,
    timeframe,
    timestamp: lastTime,
    timestampIso: new Date(lastTime * 1000).toISOString(),
    price: currentPrice,
    rsi14,
    ema9,
    ema21,
    ema50,
    ema200,
    sma20,
    sma50,
    macd,
    bollinger,
    atr14,
    summary,
    signals: {
      rsiSignal,
      macdSignal,
      emaSignal,
    },
    stochastic,
    volumeProfile,
  };
}
