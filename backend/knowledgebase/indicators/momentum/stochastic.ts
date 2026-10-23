export interface StochasticResult {
  k: number;
  d: number;
}

export function computeStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  periodK = 14,
  smoothK = 3,
  periodD = 3
): StochasticResult | null {
  const n = closes.length;
  if (n < periodK + smoothK + periodD) return null;

  const rawKs: number[] = [];
  for (let i = periodK - 1; i < n; i++) {
    const highestHigh = Math.max(...highs.slice(i - periodK + 1, i + 1));
    const lowestLow = Math.min(...lows.slice(i - periodK + 1, i + 1));
    const close = closes[i];
    const denom = highestHigh - lowestLow;
    const rawK = denom > 0 ? ((close - lowestLow) / denom) * 100 : 50;
    rawKs.push(rawK);
  }

  // Smooth K with SMA
  const smoothedKs: number[] = [];
  for (let i = smoothK - 1; i < rawKs.length; i++) {
    const avg = rawKs.slice(i - smoothK + 1, i + 1).reduce((a, b) => a + b, 0) / smoothK;
    smoothedKs.push(avg);
  }

  if (smoothedKs.length < periodD) return null;

  // %D is SMA of smoothed %K
  const currentK = smoothedKs[smoothedKs.length - 1];
  const currentD =
    smoothedKs.slice(-periodD).reduce((a, b) => a + b, 0) / periodD;

  return {
    k: Number(currentK.toFixed(2)),
    d: Number(currentD.toFixed(2)),
  };
}
