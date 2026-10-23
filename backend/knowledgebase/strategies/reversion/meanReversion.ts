import { StrategyDefinition } from '../../core/strategyEngine.js';

export const meanReversionStrategyTemplate: StrategyDefinition = {
  id: 'strat-mean-reversion-rsi',
  name: 'Bollinger & RSI Exhaustion Mean Reversion',
  description:
    'Fades extreme statistical price deviations when candles pierce the lower/upper Bollinger Bands and RSI confirms oversold (<= 30) or overbought (>= 70) territory.',
  type: 'RSI_REVERSAL',
  symbol: 'EURUSD',
  timeframe: 'M1',
  parameters: {
    rsiPeriod: 14,
    rsiOversold: 28,
    rsiOverbought: 72,
    bollingerPeriod: 20,
    bollingerStdDev: 2,
    stopLossPoints: 180,
    takeProfitPoints: 320,
    trailingStopPoints: 100,
    lotSize: 0.1,
    maxHoldBars: 30,
  },
  status: 'active',
  tags: ['MeanReversion', 'RSI', 'Bollinger', 'Oscillator'],
  author: 'KnowledgeBase Core',
  notes: 'Highly effective during Asian consolidation and quiet European ranges.',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
