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

export function detectCandlestickPatterns(candles: CandleData[], lookbackBars?: number): CandlestickPatternMatch[] {
  const matches: CandlestickPatternMatch[] = [];
  if (!candles || candles.length < 3) return matches;

  const n = candles.length;
  // Inspect specified lookback or default to last 5 candles for live pulse
  const bars = typeof lookbackBars === 'number' && lookbackBars > 0 ? lookbackBars : 5;
  const start = Math.max(1, n - bars);

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

      // 7. Evening Star (3-candle bearish reversal)
      if (
        c1.close > c1.open && // Bullish first candle
        c2Body < c1Body * 0.4 && // Small middle star
        c3.close < c3.open && // Bearish third candle
        c3.close < (c1.open + c1.close) / 2 // Closes deep into first candle
      ) {
        matches.push({
          pattern: 'EVENING_STAR',
          name: 'Evening Star',
          bias: 'BEARISH',
          confidence: 90,
          candleIndex: i,
          timeIso: c.timeIso,
          description: 'Three-candle top reversal confirming exhaustion of buyers and aggressive seller takeover.',
        });
      }

      // 8. Three White Soldiers (Bullish Continuation / Inception)
      if (
        c1.close > c1.open &&
        c2.close > c2.open &&
        c3.close > c3.open &&
        c2.close > c1.close &&
        c3.close > c2.close &&
        c2.open > c1.open &&
        c3.open > c2.open
      ) {
        matches.push({
          pattern: 'THREE_WHITE_SOLDIERS',
          name: 'Three White Soldiers',
          bias: 'BULLISH',
          confidence: 92,
          candleIndex: i,
          timeIso: c.timeIso,
          description: 'Three consecutive strong bullish candles printing higher closes with minimal upper wicks, confirming robust upward trend inception.',
        });
      }

      // 9. Three Black Crows (Bearish Continuation / Breakdown)
      if (
        c1.close < c1.open &&
        c2.close < c2.open &&
        c3.close < c3.open &&
        c2.close < c1.close &&
        c3.close < c2.close &&
        c2.open < c1.open &&
        c3.open < c2.open
      ) {
        matches.push({
          pattern: 'THREE_BLACK_CROWS',
          name: 'Three Black Crows',
          bias: 'BEARISH',
          confidence: 92,
          candleIndex: i,
          timeIso: c.timeIso,
          description: 'Three consecutive strong bearish candles with progressive lower closes, signaling intense institutional liquidation.',
        });
      }
    }

    // 10. Bullish Harami (Inside Bar Bullish Turn)
    if (
      prevIsBearish &&
      isBullishCandle &&
      c.open > prev.close &&
      c.close < prev.open &&
      body < prevBody * 0.6
    ) {
      matches.push({
        pattern: 'BULLISH_HARAMI',
        name: 'Bullish Harami (Inside Bar)',
        bias: 'BULLISH',
        confidence: 78,
        candleIndex: i,
        timeIso: c.timeIso,
        description: 'Small bullish inside bar contained completely within the prior bearish body, signaling downward momentum deceleration.',
      });
    }

    // 11. Bearish Harami (Inside Bar Bearish Turn)
    if (
      prevIsBullish &&
      isBearishCandle &&
      c.open < prev.close &&
      c.close > prev.open &&
      body < prevBody * 0.6
    ) {
      matches.push({
        pattern: 'BEARISH_HARAMI',
        name: 'Bearish Harami (Inside Bar)',
        bias: 'BEARISH',
        confidence: 78,
        candleIndex: i,
        timeIso: c.timeIso,
        description: 'Small bearish inside bar contained within the prior bullish expansion candle, indicating buyer pause and possible distribution.',
      });
    }

    // 12. Bullish & Bearish Marubozu (Strong Conviction Candle)
    if (range > 0 && body / range >= 0.88) {
      if (isBullishCandle) {
        matches.push({
          pattern: 'BULLISH_MARUBOZU',
          name: 'Bullish Marubozu',
          bias: 'BULLISH',
          confidence: 86,
          candleIndex: i,
          timeIso: c.timeIso,
          description: 'Solid green candle with virtually no shadows; buyers dominated the entire session from open to close.',
        });
      } else if (isBearishCandle) {
        matches.push({
          pattern: 'BEARISH_MARUBOZU',
          name: 'Bearish Marubozu',
          bias: 'BEARISH',
          confidence: 86,
          candleIndex: i,
          timeIso: c.timeIso,
          description: 'Solid red candle with minimal shadows; sellers exerted total directional control throughout.',
        });
      }
    }

    // 13. Tweezer Bottoms (Double Low Defense)
    const lowDiffPct = Math.abs(c.low - prev.low) / Math.max(c.low, 0.00001);
    if (lowDiffPct < 0.0003 && prevIsBearish && isBullishCandle && (lowerWick > body * 0.8)) {
      matches.push({
        pattern: 'TWEEZER_BOTTOM',
        name: 'Tweezer Bottom Reversal',
        bias: 'BULLISH',
        confidence: 84,
        candleIndex: i,
        timeIso: c.timeIso,
        description: `Matching lows at ${c.low.toFixed(5)} with buyer rejection shadows confirm institutional floor defense.`,
      });
    }

    // 14. Tweezer Tops (Double High Defense)
    const highDiffPct = Math.abs(c.high - prev.high) / Math.max(c.high, 0.00001);
    if (highDiffPct < 0.0003 && prevIsBullish && isBearishCandle && (upperWick > body * 0.8)) {
      matches.push({
        pattern: 'TWEEZER_TOP',
        name: 'Tweezer Top Reversal',
        bias: 'BEARISH',
        confidence: 84,
        candleIndex: i,
        timeIso: c.timeIso,
        description: `Matching highs at ${c.high.toFixed(5)} with upper rejection wicks indicate strong resistance barrier.`,
      });
    }
  }

  return matches;
}
