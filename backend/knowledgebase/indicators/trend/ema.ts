export function computeEMA(values: number[], period: number): number | null {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return Number(ema.toFixed(5));
}

export function computeEMASeries(values: number[], period: number): (number | null)[] {
  if (!values || values.length < period) return values.map(() => null);
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      result.push(Number(ema.toFixed(5)));
    } else {
      ema = values[i] * k + ema * (1 - k);
      result.push(Number(ema.toFixed(5)));
    }
  }
  return result;
}
