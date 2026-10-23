// Shared statistical and mathematical helpers for the knowledgebase
export interface Bar {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timeIso?: string;
}

export type Series = (number | null)[];

/**
 * Welch's t-test for unequal variance mean comparison.
 * Compares two sample groups to test whether their means differ significantly.
 */
export function welchT(
  a: number[],
  b: number[]
): { t: number; p: number; meanA: number; meanB: number; nA: number; nB: number } {
  const nA = a.length;
  const nB = b.length;
  if (nA < 2 || nB < 2) return { t: 0, p: 1, meanA: 0, meanB: 0, nA, nB };

  const meanA = a.reduce((s, v) => s + v, 0) / nA;
  const meanB = b.reduce((s, v) => s + v, 0) / nB;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (nA - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (nB - 1);

  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) return { t: 0, p: 1, meanA, meanB, nA, nB };

  const t = (meanA - meanB) / se;

  // Degrees of freedom via Welch-Satterthwaite equation
  const num = (varA / nA + varB / nB) ** 2;
  const den = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
  const df = den > 0 ? num / den : 1;

  // Approximate p-value using normal approximation for moderate df
  const z = Math.abs(t);
  const p = 2 * (1 - normalCdf(z));

  return { t, p, meanA, meanB, nA, nB };
}

/**
 * Cumulative distribution function of standard normal distribution
 */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/**
 * Calculate arithmetic mean
 */
export function mean(arr: number[]): number {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((acc, v) => acc + v, 0) / arr.length;
}

/**
 * Calculate sample variance
 */
export function variance(arr: number[]): number {
  if (!arr || arr.length < 2) return 0;
  const avg = mean(arr);
  return arr.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (arr.length - 1);
}

/**
 * Calculate sample standard deviation
 */
export function stdDev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

/**
 * Calculate Pearson correlation coefficient between two series
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);
  const meanX = mean(xSlice);
  const meanY = mean(ySlice);

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

/**
 * Auto-correlation of a series at given lag
 */
export function autoCorrelation(arr: number[], lag: number = 1): number {
  if (!arr || arr.length <= lag + 1) return 0;
  const x = arr.slice(0, arr.length - lag);
  const y = arr.slice(lag);
  return pearsonCorrelation(x, y);
}

/**
 * Calculate rolling average
 */
export function rollingMean(arr: number[], window: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      const slice = arr.slice(i - window + 1, i + 1);
      result.push(mean(slice));
    }
  }
  return result;
}

/**
 * Calculate Z-Scores for an array of numbers
 */
export function zScores(arr: number[]): number[] {
  if (!arr || arr.length === 0) return [];
  const avg = mean(arr);
  const sd = stdDev(arr);
  if (sd === 0) return arr.map(() => 0);
  return arr.map((v) => (v - avg) / sd);
}
