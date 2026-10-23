// Bot types and interfaces

export interface BotConfig {
  enabled: boolean;
  symbols: string[];
  timeframe: string;
  higherTimeframes: string[];
  multiTimeframeConsensus: boolean;
  minConfidence: number;
  riskPercent: number;
  maxOpenPositions: number;
  maxTradesPerSymbol: number;
  cooldownMs: number;
  autoStopLoss: boolean;
  autoTakeProfit: boolean;
  trailingStop: boolean;
  trailingDistancePoints: number;
  trailingStepPoints: number;
  dataQualityFilter: 'LIVE' | 'ANY';
  maxSpreadPoints: number;
  allowedSessions: string[];
  newsRiskFilter: boolean;
  shockProtectionFilter: boolean;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  enabled: false,
  symbols: ['EURUSD', 'GBPUSD', 'XAUUSD'],
  timeframe: 'M1',
  higherTimeframes: ['M5', 'H1'],
  multiTimeframeConsensus: true,
  minConfidence: 70,
  riskPercent: 1.0,
  maxOpenPositions: 3,
  maxTradesPerSymbol: 1,
  cooldownMs: 5 * 60 * 1000,
  autoStopLoss: true,
  autoTakeProfit: true,
  trailingStop: true,
  trailingDistancePoints: 150,
  trailingStepPoints: 30,
  dataQualityFilter: 'LIVE',
  maxSpreadPoints: 30,
  allowedSessions: ['ALL'],
  newsRiskFilter: true,
  shockProtectionFilter: true,
};

export interface BotSignal {
  id: string;
  symbol: string;
  timeframe: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  reasons: string[];
  warnings: string[];
  dataQuality: 'LIVE' | 'SYNTHETIC';
  generatedAt: number;
  actedOn: boolean;
  tradeId?: string;
  multiTimeframeAlignment?: 'ALIGNED' | 'CONFLICT' | 'NEUTRAL';
  higherTimeframeTrend?: string;
}

export interface BotTrade {
  id: string;
  signalId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  commandId?: string;
  status: 'PENDING' | 'EXECUTED' | 'FAILED' | 'CANCELLED';
  profit: number;
  openedAt: number;
  closedAt?: number;
  closeReason?: string;
}

export interface BotState {
  enabled: boolean;
  config: BotConfig;
  lastRunAt: number | null;
  lastSignal: BotSignal | null;
  lastTradeAt: Record<string, number>;
  tradesExecuted: number;
  signalsGenerated: number;
  errors: string[];
  running: boolean;
  totalProfit: number;
  winRate: number;
  activeTrades: number;
}

export interface BotStatus {
  running: boolean;
  enabled: boolean;
  lastRunAt: number | null;
  tradesExecuted: number;
  signalsGenerated: number;
  activeTrades: number;
  totalProfit: number;
  winRate: number;
  errors: string[];
}
