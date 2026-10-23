export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
}

export function computeBollinger(
  closes: number[],
  period = 20,
  stdDev = 2
): BollingerResult | null {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mean + stdDev * sd;
  const lower = mean - stdDev * sd;
  const current = closes[closes.length - 1];
  const bandwidth = mean > 0 ? (upper - lower) / mean : 0;
  const percentB = upper !== lower ? (current - lower) / (upper - lower) : 0.5;

  return {
    upper: Number(upper.toFixed(5)),
    middle: Number(mean.toFixed(5)),
    lower: Number(lower.toFixed(5)),
    bandwidth: Number(bandwidth.toFixed(4)),
    percentB: Number(percentB.toFixed(4)),
  };
}
