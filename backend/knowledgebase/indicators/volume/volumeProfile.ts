import { CandleData } from '../../../types/mt5.js';

export interface VolumeProfileResult {
  averageVolume: number;
  recentVolume: number;
  volumeSurgeRatio: number; // > 1.5 indicates volume spike
  isVolumeSurge: boolean;
  vwap: number | null;
}

export function computeVolumeProfile(candles: CandleData[], period = 20): VolumeProfileResult | null {
  if (!candles || candles.length < period) return null;
  const recentCandles = candles.slice(-period);
  const totalVol = recentCandles.reduce((acc, c) => acc + (c.volume || 0), 0);
  const avgVol = totalVol / period;

  const lastCandle = candles[candles.length - 1];
  const lastVol = lastCandle.volume || 0;
  const volumeSurgeRatio = avgVol > 0 ? Number((lastVol / avgVol).toFixed(2)) : 1.0;
  const isVolumeSurge = volumeSurgeRatio >= 1.75;

  // Compute intraday VWAP
  let cumulativeTypicalVol = 0;
  let cumulativeVol = 0;
  for (const c of recentCandles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumulativeTypicalVol += typicalPrice * vol;
    cumulativeVol += vol;
  }
  const vwap = cumulativeVol > 0 ? Number((cumulativeTypicalVol / cumulativeVol).toFixed(5)) : null;

  return {
    averageVolume: Math.round(avgVol),
    recentVolume: lastVol,
    volumeSurgeRatio,
    isVolumeSurge,
    vwap,
  };
}
