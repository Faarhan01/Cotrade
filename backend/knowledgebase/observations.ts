export interface ObservationItem {
  id: string;
  symbol: string;
  timestamp: number;
  direction: 'up' | 'down' | 'flat';
  velocity: number;
  price: number;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: string;
}

export interface ObservationInsights {
  symbol: string;
  totalObservations: number;
  avgVelocity: number;
  peakVelocity: number;
  directionDistribution: { up: number; down: number; flat: number };
  topActiveHours: { hour: number; count: number }[];
  suggestedStrategies: string[];
}

// The knowledge base starts empty. The previous build seeded three fabricated
// observations (EURUSD/USD/XAUUSD/BTCUSD) that were indistinguishable from
// real market measurements. Real observations are recorded via
// `recordObservation()` as the terminal collects telemetry.
let inMemoryObservations: ObservationItem[] = [];

export function listObservations(symbol?: string): ObservationItem[] {
  if (!symbol || symbol === 'ALL') return inMemoryObservations;
  const clean = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return inMemoryObservations.filter((o) => o.symbol.toUpperCase() === clean);
}

export function recordObservation(item: Omit<ObservationItem, 'id' | 'createdAt'>): ObservationItem {
  const newObs: ObservationItem = {
    ...item,
    id: `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
  };
  inMemoryObservations.unshift(newObs);
  if (inMemoryObservations.length > 500) {
    inMemoryObservations = inMemoryObservations.slice(0, 500);
  }
  return newObs;
}

export function getObservationInsights(symbol: string): ObservationInsights {
  const clean = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const list = listObservations(clean);

  if (list.length === 0) {
    return {
      symbol: clean,
      totalObservations: 0,
      avgVelocity: 0,
      peakVelocity: 0,
      directionDistribution: { up: 0, down: 0, flat: 0 },
      topActiveHours: [],
      suggestedStrategies: ['EMA_CROSSOVER', 'MULTI_INDICATOR_CONSENSUS'],
    };
  }

  const velocities = list.map((o) => Math.abs(o.velocity));
  const avgVelocity = Number((velocities.reduce((a, b) => a + b, 0) / velocities.length).toFixed(2));
  const peakVelocity = Number(Math.max(...velocities).toFixed(2));

  const dist = { up: 0, down: 0, flat: 0 };
  const hourCounts: Record<number, number> = {};

  for (const o of list) {
    dist[o.direction]++;
    const h = new Date(o.timestamp).getUTCHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }

  const topActiveHours = Object.entries(hourCounts)
    .map(([h, c]) => ({ hour: Number(h), count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const suggestedStrategies: string[] = [];
  if (avgVelocity > 35) {
    suggestedStrategies.push('BOLLINGER_BREAKOUT', 'EMA_CROSSOVER');
  } else {
    suggestedStrategies.push('RSI_REVERSAL', 'MULTI_INDICATOR_CONSENSUS');
  }

  return {
    symbol: clean,
    totalObservations: list.length,
    avgVelocity,
    peakVelocity,
    directionDistribution: dist,
    topActiveHours,
    suggestedStrategies,
  };
}
