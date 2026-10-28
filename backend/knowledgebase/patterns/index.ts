import { CandleData } from '../../types/mt5.js';
import {
  detectCandlestickPatterns,
  CandlestickPatternMatch,
} from './candlestick/candlestickPatterns.js';
import {
  detectIndicatorPatterns,
  IndicatorPatternMatch,
} from './indicator/indicatorPatterns.js';
import {
  detectShapePatterns,
  ShapePatternMatch,
} from './shape/shapePatterns.js';

export type PatternCategory = 'CANDLESTICK' | 'INDICATOR' | 'SHAPE';

export interface ComprehensivePatternResult {
  symbol: string;
  timeframe: string;
  totalPatternsFound: number;
  overallPatternBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  candlestick: CandlestickPatternMatch[];
  indicator: IndicatorPatternMatch[];
  shape: ShapePatternMatch[];
  detectedAt: number;
}

export function detectAllPatterns(
  candles: CandleData[],
  symbol = 'EURUSD',
  timeframe = 'M1',
  lookbackBars?: number
): ComprehensivePatternResult {
  const candlestick = detectCandlestickPatterns(candles, lookbackBars);
  const indicator = detectIndicatorPatterns(candles);
  const shape = detectShapePatterns(candles);

  let bullWeight = 0;
  let bearWeight = 0;

  for (const p of candlestick) {
    if (p.bias === 'BULLISH') bullWeight += p.confidence;
    if (p.bias === 'BEARISH') bearWeight += p.confidence;
  }
  for (const p of indicator) {
    if (p.bias === 'BULLISH') bullWeight += p.confidence;
    if (p.bias === 'BEARISH') bearWeight += p.confidence;
  }
  for (const p of shape) {
    if (p.bias === 'BULLISH') bullWeight += p.confidence;
    if (p.bias === 'BEARISH') bearWeight += p.confidence;
  }

  let overallPatternBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (bullWeight > bearWeight + 50) overallPatternBias = 'BULLISH';
  else if (bearWeight > bullWeight + 50) overallPatternBias = 'BEARISH';

  return {
    symbol,
    timeframe,
    totalPatternsFound: candlestick.length + indicator.length + shape.length,
    overallPatternBias,
    candlestick,
    indicator,
    shape,
    detectedAt: Date.now(),
  };
}

export {
  detectCandlestickPatterns,
  detectIndicatorPatterns,
  detectShapePatterns,
};
