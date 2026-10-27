// Bot types and interfaces

export type BotTradingMode = 'SCALPER' | 'DAY_TRADES' | 'SWING_TRADES' | 'MIXED_OPTIONS';

export interface ScalperSettings {
  targetTimeframe: string; // 'M1' | 'M5'
  maxSpreadPoints: number; // e.g. 20
  slAtrMultiplier: number; // e.g. 1.0
  tpAtrMultiplier: number; // e.g. 1.5
  quickBreakevenTriggerPoints: number; // e.g. 60
  quickBreakevenLockPoints: number; // e.g. 15
  tightTrailingDistancePoints: number; // e.g. 80
  tightTrailingStepPoints: number; // e.g. 20
  maxHoldBars: number; // e.g. 10
  cooldownMs: number; // e.g. 60000 (1 min)
}

export interface DayTradeSettings {
  targetTimeframe: string; // 'M5' | 'M15' | 'M30'
  higherTimeframe: string; // 'H1'
  slAtrMultiplier: number; // e.g. 1.5
  tpAtrMultiplier: number; // e.g. 2.5
  breakevenTriggerPoints: number; // e.g. 120
  breakevenLockPoints: number; // e.g. 25
  trailingDistancePoints: number; // e.g. 150
  trailingStepPoints: number; // e.g. 30
  sessionFilter: boolean; // only London & NY peak sessions
  cooldownMs: number; // e.g. 300000 (5 min)
}

export interface SwingTradeSettings {
  targetTimeframe: string; // 'H1' | 'H4'
  higherTimeframe: string; // 'H4' | 'D1'
  slAtrMultiplier: number; // e.g. 2.2
  tpAtrMultiplier: number; // e.g. 4.0
  breakevenTriggerPoints: number; // e.g. 250
  breakevenLockPoints: number; // e.g. 40
  trailingDistancePoints: number; // e.g. 300
  trailingStepPoints: number; // e.g. 60
  cooldownMs: number; // e.g. 1800000 (30 min)
}

export interface MixedOptionsSettings {
  adaptiveRegimeRouting: boolean; // auto-routes: range/squeeze -> scalper; breakout -> day trade; macro trend -> swing trade
  trancheExecution: boolean; // execute quick partial take-profit + trailing swing runner
  scalperWeight: number; // 0-100
  dayTradeWeight: number; // 0-100
  swingWeight: number; // 0-100
}

export interface BotConfig {
  enabled: boolean;
  mode: BotTradingMode;
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
  scalperSettings?: ScalperSettings;
  dayTradeSettings?: DayTradeSettings;
  swingTradeSettings?: SwingTradeSettings;
  mixedOptionsSettings?: MixedOptionsSettings;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  enabled: false,
  mode: 'DAY_TRADES',
  symbols: ['EURUSD', 'GBPUSD', 'XAUUSD'],
  timeframe: 'M15',
  higherTimeframes: ['M30', 'H1'],
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
  scalperSettings: {
    targetTimeframe: 'M1',
    maxSpreadPoints: 20,
    slAtrMultiplier: 1.0,
    tpAtrMultiplier: 1.5,
    quickBreakevenTriggerPoints: 60,
    quickBreakevenLockPoints: 15,
    tightTrailingDistancePoints: 80,
    tightTrailingStepPoints: 20,
    maxHoldBars: 10,
    cooldownMs: 60 * 1000,
  },
  dayTradeSettings: {
    targetTimeframe: 'M15',
    higherTimeframe: 'H1',
    slAtrMultiplier: 1.5,
    tpAtrMultiplier: 2.5,
    breakevenTriggerPoints: 120,
    breakevenLockPoints: 25,
    trailingDistancePoints: 150,
    trailingStepPoints: 30,
    sessionFilter: true,
    cooldownMs: 5 * 60 * 1000,
  },
  swingTradeSettings: {
    targetTimeframe: 'H1',
    higherTimeframe: 'H4',
    slAtrMultiplier: 2.2,
    tpAtrMultiplier: 4.0,
    breakevenTriggerPoints: 250,
    breakevenLockPoints: 40,
    trailingDistancePoints: 300,
    trailingStepPoints: 60,
    cooldownMs: 30 * 60 * 1000,
  },
  mixedOptionsSettings: {
    adaptiveRegimeRouting: true,
    trancheExecution: true,
    scalperWeight: 30,
    dayTradeWeight: 45,
    swingWeight: 25,
  },
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
  dataQuality: 'LIVE' | 'SYNTHETIC' | 'NONE';
  generatedAt: number;
  actedOn: boolean;
  tradeId?: string;
  multiTimeframeAlignment?: 'ALIGNED' | 'CONFLICT' | 'NEUTRAL';
  higherTimeframeTrend?: string;
  mode?: BotTradingMode;
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
  ticket?: number;
  status: 'PENDING' | 'EXECUTED' | 'FAILED' | 'CANCELLED';
  profit: number;
  openedAt: number;
  closedAt?: number;
  closeReason?: string;
  exitPrice?: number;
  mode?: BotTradingMode;
  errorMessage?: string;
}

export interface BotState {
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
