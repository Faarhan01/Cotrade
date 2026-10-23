import { CandleData } from '../../../types/mt5.js';
import { computeRSI } from '../../indicators/momentum/rsi.js';
import { computeMACD } from '../../indicators/momentum/macd.js';
import { computeBollinger } from '../../indicators/volatility/bollinger.js';

export interface IndicatorPatternMatch {
  pattern: string;
  name: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  description: string;
}

export function detectIndicatorPatterns(candles: CandleData[]): IndicatorPatternMatch[] {
  const matches: IndicatorPatternMatch[] = [];
  if (!candles || candles.length < 25) return matches;

  const closes = candles.map((c) => c.close);
  const n = closes.length;

  // 1. MACD Cross
  const currentMacd = computeMACD(closes);
  const prevMacd = computeMACD(closes.slice(0, n - 1));
  if (currentMacd && prevMacd) {
    if (prevMacd.histogram <= 0 && currentMacd.histogram > 0) {
      matches.push({
        pattern: 'MACD_GOLDEN_CROSS',
        name: 'MACD Bullish Crossover',
        bias: 'BULLISH',
        confidence: 85,
        description: 'MACD line crossed above the signal line, confirming emerging upward momentum.',
      });
    } else if (prevMacd.histogram >= 0 && currentMacd.histogram < 0) {
      matches.push({
        pattern: 'MACD_DEATH_CROSS',
        name: 'MACD Bearish Crossover',
        bias: 'BEARISH',
        confidence: 85,
        description: 'MACD line crossed below the signal line, confirming downward momentum acceleration.',
      });
    }
  }

  // 2. RSI Regular Divergence
  if (n >= 20) {
    const rsiCurrent = computeRSI(closes, 14);
    const rsiPrev = computeRSI(closes.slice(0, n - 5), 14);
    const priceCurrent = closes[n - 1];
    const pricePrev = closes[n - 6];

    if (rsiCurrent !== null && rsiPrev !== null) {
      // Bullish Divergence: Lower price low with higher RSI low
      if (priceCurrent < pricePrev && rsiCurrent > rsiPrev && rsiCurrent < 45) {
        matches.push({
          pattern: 'RSI_BULLISH_DIVERGENCE',
          name: 'RSI Bullish Regular Divergence',
          bias: 'BULLISH',
          confidence: 89,
          description: 'Price established a lower swing low while RSI printed a higher low, warning of seller exhaustion.',
        });
      }
      // Bearish Divergence: Higher price high with lower RSI high
      if (priceCurrent > pricePrev && rsiCurrent < rsiPrev && rsiCurrent > 55) {
        matches.push({
          pattern: 'RSI_BEARISH_DIVERGENCE',
          name: 'RSI Bearish Regular Divergence',
          bias: 'BEARISH',
          confidence: 89,
          description: 'Price pushed to a new swing high but RSI failed to confirm, indicating weakening buyer volume.',
        });
      }
    }
  }

  // 3. Bollinger Band Squeeze (Low Volatility Pre-Breakout)
  const bb = computeBollinger(closes, 20, 2);
  if (bb && bb.bandwidth < 0.0015) {
    matches.push({
      pattern: 'BOLLINGER_SQUEEZE',
      name: 'Bollinger Band Squeeze',
      bias: 'NEUTRAL',
      confidence: 80,
      description: 'Bandwidth has tightened to historically narrow levels, indicating imminent high-volatility expansion.',
    });
  }

  return matches;
}
