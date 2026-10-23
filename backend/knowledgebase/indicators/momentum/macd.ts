export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export function computeMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): MACDResult | null {
  if (!closes || closes.length < slow + signal) return null;
  const macdLine: number[] = [];
  const kFast = 2 / (fast + 1);
  const kSlow = 2 / (slow + 1);

  let emaFast = closes.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let emaSlow = closes.slice(0, slow).reduce((a, b) => a + b, 0) / slow;

  // Warm up the fast EMA across the bars used to seed the slow EMA.
  // Without this the MACD line compares a 15-bar-stale fast EMA against a
  // freshly-seeded slow EMA, which inverts the sign of the first MACD values
  // on short series (the common 40-60 bar case).
  for (let i = fast; i < slow; i++) {
    emaFast = closes[i] * kFast + emaFast * (1 - kFast);
  }

  for (let i = slow; i < closes.length; i++) {
    emaFast = closes[i] * kFast + emaFast * (1 - kFast);
    emaSlow = closes[i] * kSlow + emaSlow * (1 - kSlow);
    macdLine.push(emaFast - emaSlow);
  }

  if (macdLine.length < signal) return null;
  const kSignal = 2 / (signal + 1);
  let sig = macdLine.slice(0, signal).reduce((a, b) => a + b, 0) / signal;

  for (let i = signal; i < macdLine.length; i++) {
    sig = macdLine[i] * kSignal + sig * (1 - kSignal);
  }

  const currentMacd = macdLine[macdLine.length - 1];
  const hist = currentMacd - sig;

  return {
    macd: Number(currentMacd.toFixed(5)),
    signal: Number(sig.toFixed(5)),
    histogram: Number(hist.toFixed(5)),
  };
}
