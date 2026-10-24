import { CandleData } from '../../../types/mt5.js';

export interface ShapePatternMatch {
  pattern: string;
  name: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  levelPrice?: number;
  description: string;
}

export function detectShapePatterns(candles: CandleData[]): ShapePatternMatch[] {
  const matches: ShapePatternMatch[] = [];
  if (!candles || candles.length < 30) return matches;

  const n = candles.length;
  const recent = candles.slice(-30);
  const currentPrice = recent[recent.length - 1].close;

  // Find swing highs and swing lows
  const swingHighs: { index: number; price: number }[] = [];
  const swingLows: { index: number; price: number }[] = [];

  for (let i = 2; i < recent.length - 2; i++) {
    const high = recent[i].high;
    const low = recent[i].low;

    if (
      high > recent[i - 1].high &&
      high > recent[i - 2].high &&
      high > recent[i + 1].high &&
      high > recent[i + 2].high
    ) {
      swingHighs.push({ index: i, price: high });
    }

    if (
      low < recent[i - 1].low &&
      low < recent[i - 2].low &&
      low < recent[i + 1].low &&
      low < recent[i + 2].low
    ) {
      swingLows.push({ index: i, price: low });
    }
  }

  // 1. Double Top
  if (swingHighs.length >= 2) {
    const h1 = swingHighs[swingHighs.length - 2];
    const h2 = swingHighs[swingHighs.length - 1];
    const diffPct = Math.abs(h1.price - h2.price) / h1.price;
    if (diffPct < 0.0025 && h2.index - h1.index >= 4) {
      matches.push({
        pattern: 'DOUBLE_TOP',
        name: 'Double Top Reversal',
        bias: 'BEARISH',
        confidence: 84,
        levelPrice: Number(((h1.price + h2.price) / 2).toFixed(5)),
        description: `Two consecutive peaks stalled at key resistance level ~${h1.price.toFixed(5)}, forming a bearish M-top.`,
      });
    }
  }

  // 2. Double Bottom
  if (swingLows.length >= 2) {
    const l1 = swingLows[swingLows.length - 2];
    const l2 = swingLows[swingLows.length - 1];
    const diffPct = Math.abs(l1.price - l2.price) / l1.price;
    if (diffPct < 0.0025 && l2.index - l1.index >= 4) {
      matches.push({
        pattern: 'DOUBLE_BOTTOM',
        name: 'Double Bottom Reversal',
        bias: 'BULLISH',
        confidence: 84,
        levelPrice: Number(((l1.price + l2.price) / 2).toFixed(5)),
        description: `Two consecutive troughs defended at support level ~${l1.price.toFixed(5)}, forming a bullish W-bottom.`,
      });
    }
  }

  // 3. Head and Shoulders Top Reversal
  if (swingHighs.length >= 3) {
    const leftShoulder = swingHighs[swingHighs.length - 3];
    const head = swingHighs[swingHighs.length - 2];
    const rightShoulder = swingHighs[swingHighs.length - 1];

    if (
      head.price > leftShoulder.price &&
      head.price > rightShoulder.price &&
      Math.abs(leftShoulder.price - rightShoulder.price) / leftShoulder.price < 0.003 &&
      rightShoulder.index > head.index &&
      head.index > leftShoulder.index
    ) {
      matches.push({
        pattern: 'HEAD_AND_SHOULDERS',
        name: 'Head & Shoulders Reversal',
        bias: 'BEARISH',
        confidence: 91,
        levelPrice: Number(head.price.toFixed(5)),
        description: `Classic institutional Head & Shoulders top confirmed: Left Shoulder (${leftShoulder.price.toFixed(5)}), Peak Head (${head.price.toFixed(5)}), Right Shoulder (${rightShoulder.price.toFixed(5)}). Signals major trend exhaustion.`,
      });
    }
  }

  // 4. Inverted Head and Shoulders Bottom Reversal
  if (swingLows.length >= 3) {
    const leftShoulder = swingLows[swingLows.length - 3];
    const head = swingLows[swingLows.length - 2];
    const rightShoulder = swingLows[swingLows.length - 1];

    if (
      head.price < leftShoulder.price &&
      head.price < rightShoulder.price &&
      Math.abs(leftShoulder.price - rightShoulder.price) / leftShoulder.price < 0.003 &&
      rightShoulder.index > head.index &&
      head.index > leftShoulder.index
    ) {
      matches.push({
        pattern: 'INVERTED_HEAD_AND_SHOULDERS',
        name: 'Inverted Head & Shoulders',
        bias: 'BULLISH',
        confidence: 91,
        levelPrice: Number(head.price.toFixed(5)),
        description: `Bullish Inverted Head & Shoulders bottom confirmed: Left trough (${leftShoulder.price.toFixed(5)}), Deep Head (${head.price.toFixed(5)}), Right trough (${rightShoulder.price.toFixed(5)}). Signals major accumulation breakout.`,
      });
    }
  }

  // 5. 20-bar Donchian Range Breakout
  const past20High = Math.max(...recent.slice(-21, -1).map((c) => c.high));
  const past20Low = Math.min(...recent.slice(-21, -1).map((c) => c.low));

  if (currentPrice > past20High) {
    matches.push({
      pattern: 'HIGH_BREAKOUT_20',
      name: '20-Bar Channel High Breakout',
      bias: 'BULLISH',
      confidence: 86,
      levelPrice: past20High,
      description: `Price broke out above the 20-candle resistance ceiling at ${past20High.toFixed(5)}.`,
    });
  } else if (currentPrice < past20Low) {
    matches.push({
      pattern: 'LOW_BREAKOUT_20',
      name: '20-Bar Channel Low Breakdown',
      bias: 'BEARISH',
      confidence: 86,
      levelPrice: past20Low,
      description: `Price broke down below the 20-candle support floor at ${past20Low.toFixed(5)}.`,
    });
  }

  return matches;
}
