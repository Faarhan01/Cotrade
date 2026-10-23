import { CandleData } from '../../../types/mt5.js';

export interface CandlestickPatternMatch {
  pattern: string;
  name: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // 0 - 100
  candleIndex: number;
  timeIso?: string;
  description: string;
}

export function detectCandlestickPatterns(candles: CandleData[]): CandlestickPatternMatch[] {
  const matches: CandlestickPatternMatch[] = [];
  if (!candles || candles.length < 3) return matches;

  const n = candles.length;
  // Inspect last 5 candles
  const start = Math.max(1, n - 5);

  for (let i = start; i < n; i++) {
    const c = candles[i];
    const prev = candles[i - 1];

    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range === 0) continue;

    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const isBullishCandle = c.close > c.open;
    const isBearishCandle = c.close < c.open;

    const prevBody = Math.abs(prev.close - prev.open);
    const prevIsBullish = prev.close > prev.open;
    const prevIsBearish = prev.close < prev.open;

    // 1. Bullish Engulfing
    if (
      prevIsBearish &&
      isBullishCandle &&
      c.open <= prev.close &&
      c.close >= prev.open &&
      body > prevBody * 1.1
    ) {
      matches.push({
        pattern: 'BULLISH_ENGULFING',
        name: 'Bullish Engulfing',
        bias: 'BULLISH',
        confidence: 88,
        candleIndex: i,
        timeIso: c.timeIso,
        description: 'Large bullish candle completely engulfs previous bearish body, signaling buyer takeover.',
      });
    }

    // 2. Bearish Engulfing
    if (
      prevIsBullish &&
      isBearishCandle &&
      c.open >= prev.close &&
      c.close <= prev.open &&
      body > prevBody * 1.1
    ) {
      matches.push({
        pattern: 'BEARISH_ENGULFING',
        name: 'Bearish Engulfing',
        bias: 'BEARISH',
        confidence: 88,
        candleIndex: i,
        timeIso: c.timeIso,
        description: 'Substantial bearish candle completely engulfs previous green body, indicating seller reversal.',
      });
    }

    // 3. Hammer (Bullish Rejection at Lows)
    if (
      lowerWick >= body * 2 &&
      upperWick <= body * 0.5 &&
      body / range <= 0.35
    ) {
      matches.push({
        pattern: 'HAMMER',
        name: 'Hammer / Bullish Pinbar',
        bias: 'BULLISH',
        confidence: 82,
        candleIndex: i,
        timeIso: c.timeIso,
        description: 'Long lower shadow with small upper body, showing aggressive price rejection by buyers.',
      });
    }

    // 4. Shooting Star (Bearish Rejection at Highs)
    if (
      upperWick >= body * 2 &&
      lowerWick <= body * 0.5 &&
      body / range <= 0.35
    ) {
      matches.push({
        pattern: 'SHOOTING_STAR',
        name: 'Shooting Star / Bearish Pinbar',
        bias: 'BEARISH',
        confidence: 82,
        candleIndex: i,
        timeIso: c.timeIso,
        description: 'Long upper shadow with small lower body, indicating exhaustion at resistance and seller defense.',
      });
    }

    // 5. Doji (Indecision)
    if (body / range < 0.1) {
      let dojiType = 'Standard Doji';
      let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      if (lowerWick >= range * 0.65) {
        dojiType = 'Dragonfly Doji (Bullish Reversal)';
        bias = 'BULLISH';
      } else if (upperWick >= range * 0.65) {
        dojiType = 'Gravestone Doji (Bearish Reversal)';
        bias = 'BEARISH';
      }
      matches.push({
        pattern: 'DOJI',
        name: dojiType,
        bias,
        confidence: 75,
        candleIndex: i,
        timeIso: c.timeIso,
        description: 'Open and close virtually equal, representing market equilibrium and potential momentum shift.',
      });
    }

    // 6. Morning Star (3-candle bullish reversal)
    if (i >= 2) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1];
      const c3 = c;
      const c1Body = Math.abs(c1.close - c1.open);
      const c2Body = Math.abs(c2.close - c2.open);
      const c3Body = Math.abs(c3.close - c3.open);

      if (
        c1.close < c1.open && // Bearish first candle
        c2Body < c1Body * 0.4 && // Small middle star
        c3.close > c3.open && // Bullish third candle
        c3.close > (c1.open + c1.close) / 2 // Closes well into first candle
      ) {
        matches.push({
          pattern: 'MORNING_STAR',
          name: 'Morning Star',
          bias: 'BULLISH',
          confidence: 90,
          candleIndex: i,
          timeIso: c.timeIso,
          description: 'Three-candle reversal pattern confirming transition from strong selling to fresh bull control.',
        });
      }
    }
  }

  return matches;
}
