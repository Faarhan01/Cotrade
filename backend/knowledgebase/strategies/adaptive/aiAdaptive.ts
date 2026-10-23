import { StrategyDefinition } from '../../core/strategyEngine.js';

export const aiAdaptiveStrategyTemplate: StrategyDefinition = {
  id: 'strat-ai-adaptive-consensus',
  name: 'Multi-Indicator Consensus Regime Engine',
  description:
    'Continuously votes across Trend (EMA 9/21/200), Momentum (RSI & MACD), and Volatility (Bollinger & ATR) to trade only when multiple indicators achieve strong directional consensus.',
  type: 'MULTI_INDICATOR_CONSENSUS',
  symbol: 'BTCUSD',
  timeframe: 'M15',
  parameters: {
    rsiPeriod: 14,
    fastEmaPeriod: 9,
    slowEmaPeriod: 21,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    stopLossPoints: 800,
    takeProfitPoints: 1800,
    trailingStopPoints: 400,
    lotSize: 0.05,
    maxHoldBars: 50,
  },
  status: 'active',
  tags: ['Consensus', 'MultiIndicator', 'Crypto', 'Adaptive'],
  author: 'KnowledgeBase Core',
  notes: 'Filters out choppy fakeouts and produces high win-rate signals.',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
