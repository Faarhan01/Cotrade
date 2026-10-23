import { StrategyDefinition } from '../../core/strategyEngine.js';

export const emaCrossoverStrategyTemplate: StrategyDefinition = {
  id: 'strat-trend-ema-cross',
  name: 'Dual EMA Dynamic Trend Follower',
  description:
    'Rides directional momentum by triggering BUY orders when Fast EMA (9) crosses above Slow EMA (21) in an established uptrend, and SELL orders on bearish cross.',
  type: 'EMA_CROSSOVER',
  symbol: 'EURUSD',
  timeframe: 'M5',
  parameters: {
    fastEmaPeriod: 9,
    slowEmaPeriod: 21,
    stopLossPoints: 200,
    takeProfitPoints: 450,
    trailingStopPoints: 120,
    lotSize: 0.1,
    maxHoldBars: 45,
  },
  status: 'active',
  tags: ['Trend', 'EMA', 'Momentum', 'Scalping'],
  author: 'KnowledgeBase Core',
  notes: 'Best performed during London and New York overlaps with ATR > 15 pips.',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
