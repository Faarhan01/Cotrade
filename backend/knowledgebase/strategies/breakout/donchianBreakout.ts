import { StrategyDefinition } from '../../core/strategyEngine.js';

export const breakoutStrategyTemplate: StrategyDefinition = {
  id: 'strat-breakout-expansion',
  name: 'Donchian Volatility Expansion Breakout',
  description:
    'Enters with aggressive institutional flow when price breaks through the 20-candle high or low channel with expanding volume surge.',
  type: 'DONCHIAN_BREAKOUT',
  symbol: 'XAUUSD',
  timeframe: 'M15',
  parameters: {
    channelPeriod: 20,
    breakoutBufferPoints: 20,
    stopLossPoints: 400,
    takeProfitPoints: 900,
    trailingStopPoints: 250,
    lotSize: 0.05,
    maxHoldBars: 60,
  },
  status: 'active',
  tags: ['Breakout', 'Gold', 'Expansion', 'Volatility'],
  author: 'KnowledgeBase Core',
  notes: 'Tailored for Gold (XAUUSD) and high-beta assets at market opens.',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
