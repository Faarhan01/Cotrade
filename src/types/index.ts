export type OrderType = 'BUY' | 'SELL' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
export type CommandStatus = 'pending' | 'dispatched' | 'executed' | 'failed' | 'cancelled';
export type OrderAction = 'EXECUTE_TRADE' | 'MODIFY_POSITION' | 'CLOSE_POSITION' | 'CLOSE_ALL' | 'CANCEL_PENDING' | 'FETCH_HISTORY' | 'SET_RISK_GUARD' | 'TRACK_SYMBOL' | 'PROTECT_POSITION';

export interface AccountInfo {
  login: number;
  tradeMode: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  currency: string;
  server: string;
  company: string;
  profit: number;
  lastUpdate: number;
}

export interface TickData {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  last: number;
  volume: number;
  time: number;
  timeMsc?: number;
  flags?: number;
  high24h?: number;
  low24h?: number;
}

export interface Position {
  ticket: number;
  symbol: string;
  type: OrderType;
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  magic: number;
  comment: string;
  openTime: number;
  trailingEnabled?: boolean;
  trailingActive?: boolean;
  breakevenLocked?: boolean;
  stopDistancePoints?: number;
  trailingDistance?: number;
  trailingStep?: number;
}

export interface TradeCommand {
  id: string;
  action: OrderAction;
  symbol?: string;
  orderType?: OrderType;
  volume?: number;
  price?: number;
  sl?: number;
  tp?: number;
  ticket?: number;
  magic?: number;
  comment?: string;
  slippage?: number;
  timeframe?: string;
  count?: number;
  from?: number;
  to?: number;
  status: CommandStatus;
  createdAt: number;
  dispatchedAt?: number;
  executedAt?: number;
  source: 'AI_MCP' | 'MANUAL_UI' | 'RISK_GUARD' | 'API' | 'BOT';
  result?: {
    success: boolean;
    dealTicket?: number;
    orderTicket?: number;
    executionPrice?: number;
    comment?: string;
    errorCode?: number;
    errorMessage?: string;
    executionTimeMs?: number;
  };
}

export interface RiskGuardConfig {
  globalTakeProfitUSD: number;
  globalStopLossUSD: number;
  maxDrawdownPercent: number;
  emergencyKillSwitch: boolean;
  trailingStopEnabled: boolean;
  trailingStopDistancePoints: number;
  trailingStopStepPoints: number;
  maxLotSizePerTrade: number;
  maxOpenPositions: number;
  allowedSymbols: string[];
  autoCloseOnMarginLevelBelow: number;
}

export interface ExecutionLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'trade';
  title: string;
  details: string;
  source: string;
  ticket?: number;
}

export interface ChartSymbolInfo {
  symbol: string;
  timeframe: string;
  digits: number;
  point: number;
  bid: number;
  ask: number;
  spread: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  contractSize: number;
  tickValue: number;
  tradeAllowed: boolean;
  sessionOpen?: number;
  sessionHigh?: number;
  sessionLow?: number;
  sessionVolume?: number;
  stopsLevel?: number;
  freezeLevel?: number;
  description?: string;
  currencyBase?: string;
  currencyProfit?: string;
  periodSeconds?: number;
  currentBarTime?: number;
  currentBarTimeIso?: string;
  isBarClosed?: boolean;
}

export interface MT5TerminalPermissions {
  terminalConnected: boolean;
  terminalTradeAllowed: boolean;
  mqlTradeAllowed: boolean;
  accountTradeAllowed: boolean;
  accountExpertAllowed: boolean;
  accountLimitOrders: number;
  terminalMaxBars?: number;
  terminalDllsAllowed?: boolean;
  terminalTradeApiDisabled?: boolean;
  terminalPingLast?: number;
  totalBrokerSymbols?: number;
  marketWatchSymbolsCount?: number;
}

export interface MT5ChartDiagnostics {
  symbol: string;
  timeframe: string;
  periodSeconds: number;
  serverTime: number;
  serverTimeIso: string;
  gmtTime: number;
  gmtTimeIso: string;
  brokerTimezoneOffsetHours: number;
  currentBarTime: number;
  currentBarTimeIso: string;
  barElapsedSeconds: number;
  barRemainingSeconds: number;
  currentBarSecondsRemaining?: number;
  barProgressPct: number;
  isBarClosed: boolean;
  spreadPoints: number;
  spreadPips: number;
  tickVolume?: number;
  realVolume?: number;
  executionSlippageHistory?: {
    lastSlippagePoints: number;
    averageSlippagePoints: number;
    lastLatencyMs: number;
  };
  terminalPermissions?: MT5TerminalPermissions | null;
}

export interface AttributedNewsCatalyst {
  id: string;
  title: string;
  sourceType: 'ECONOMIC_EVENT' | 'BREAKING_NEWS' | 'MACRO_CATALYST';
  scheduledOrPublishedTime: number;
  scheduledOrPublishedTimeIso: string;
  timeDeltaSeconds: number;
  currencyOrAsset: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  attributionConfidence: number;
  attributionReasoning: string;
}

export interface RapidPriceShock {
  id: string;
  symbol: string;
  timeframe: string;
  shockType: 'VOLATILITY_EXPANSION' | 'FLASH_IMPULSE' | 'SPREAD_BLOWOUT' | 'WHIPSAW_LIQUIDATION' | 'BREAKOUT_SURGE';
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE';
  timestamp: number;
  timestampIso: string;
  priceStart: number;
  pricePeak: number;
  priceEnd: number;
  pipDisplacement: number;
  pipRange: number;
  volatilityAtrMultiplier: number;
  spreadAtShockPoints: number;
  spreadAtShockPips: number;
  durationSeconds: number;
  pipVelocityPipsPerMinute: number;
  reactionType: 'INSTANT_DIRECT_BURST' | 'PRE_RELEASE_POSITIONING' | 'POST_RELEASE_CONTINUATION' | 'WHIPSAW_REVERSAL_TRAP' | 'TECHNICAL_LIQUIDITY_RUN';
  attributedCatalyst: AttributedNewsCatalyst | null;
  tacticalDirective: string;
  safeToTrade: boolean;
  coolingOffMinutesRemaining: number;
}

export interface DetailedSymbolInfo {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  point: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  contractSize: number;
  tradeAllowed: boolean;
  stopsLevel?: number;
  freezeLevel?: number;
  tradeMode?: string;
  spreadFloat?: boolean;
  fillingMode?: number;
  tickSize?: number;
  tickValue?: number;
  marginMaintenance?: number;
  marginInitial?: number;
  marginHedged?: number;
  tradeCalcMode?: number;
  bookDepth?: boolean;
  currencyBase?: string;
  currencyProfit?: string;
  currencyMargin?: string;
  description?: string;
  high24h?: number;
  low24h?: number;
  sessionOpen?: number;
  sessionHigh?: number;
  sessionLow?: number;
  sessionVolume?: number;
  volume?: number;
  time?: number;
  swapLong?: number;
  swapShort?: number;
  isCurrentChart?: boolean;
}

export interface CandleData {
  time: number;
  timeIso?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tickCount?: number;
  spread?: number;
  isClosed?: boolean;
  realVolume?: number;
}

export type PendingOrderType = 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | 'BUY_STOP_LIMIT' | 'SELL_STOP_LIMIT';

export interface PendingOrder {
  ticket: number;
  symbol: string;
  type: PendingOrderType;
  volume: number;
  priceOpen: number;
  currentPrice?: number;
  sl: number;
  tp: number;
  magic: number;
  comment: string;
  timeSetup: number;
  timeSetupIso?: string;
}

export interface MarketDepthItem {
  type: 'BUY' | 'SELL';
  price: number;
  volume: number;
}

export interface TechnicalIndicatorsResult {
  symbol: string;
  timeframe: string;
  timestamp: number;
  timestampIso: string;
  price: number;
  rsi14: number | null;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  sma20: number | null;
  sma50: number | null;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  } | null;
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
    percentB: number;
  } | null;
  atr14: number | null;
  summary: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  signals: {
    rsiSignal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
    macdSignal: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NEUTRAL';
    emaSignal: 'ABOVE_200' | 'BELOW_200' | 'NEUTRAL';
  };
}

export interface AppState {
  connection: {
    isEaConnected: boolean;
    lastEaSync: number;
    eaVersion: string;
    bridgeEndpoint: string;
    fallbackEndpoint: string;
    serverTime: number;
    mt5ServerTime: number;
    terminalName?: string;
    terminalCompany?: string;
    terminalBuild?: number;
    chartSymbol?: string;
    chartTimeframe?: string;
  };
  currentChart: ChartSymbolInfo | null;
  chartDiagnostics?: MT5ChartDiagnostics | null;
  terminalPermissions?: MT5TerminalPermissions | null;
  allSymbols: DetailedSymbolInfo[];
  chartHistory: CandleData[];
  indicators?: TechnicalIndicatorsResult | null;
  account: AccountInfo;
  positions: Position[];
  pendingOrders: PendingOrder[];
  ticks: TickData[];
  tickHistory: Record<string, { time: number; bid: number; ask: number }[]>;
  marketDepth?: Record<string, { bids: MarketDepthItem[]; asks: MarketDepthItem[] }>;
  commandQueue: TradeCommand[];
  riskGuard: RiskGuardConfig;
  riskGuardBreach?: { tp: boolean; sl: boolean; drawdown: boolean; margin: boolean };
  dataQuality?: 'LIVE' | 'SYNTHETIC' | 'NONE';
  logs: ExecutionLog[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export type StrategyType =
  | 'RSI_REVERSAL'
  | 'EMA_CROSSOVER'
  | 'MACD_MOMENTUM'
  | 'BOLLINGER_BREAKOUT'
  | 'ORDER_BLOCK_CONFLUENCE'
  | 'BREAKOUT_MOMENTUM'
  | 'MULTI_INDICATOR_CONSENSUS'
  | 'CUSTOM_RULESET';

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  type: StrategyType;
  symbol: string;
  timeframe: string;
  parameters: Record<string, any>;
  status: 'active' | 'draft' | 'archived' | 'testing';
  tags?: string[];
  author?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Observation {
  id: string;
  title: string;
  content: string;
  symbol?: string;
  timeframe?: string;
  strategyId?: string;
  category: 'market_insight' | 'pattern' | 'execution_note' | 'anomaly' | 'research';
  tags: string[];
  metrics?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface SimulatedTrade {
  id: string;
  type: 'BUY' | 'SELL';
  entryIndex: number;
  entryTime: number;
  entryTimeIso: string;
  entryPrice: number;
  exitIndex: number;
  exitTime: number;
  exitTimeIso: string;
  exitPrice: number;
  profitPoints: number;
  profitUsd: number;
  returnPct: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'SIGNAL_REVERSAL' | 'MAX_HOLD_BARS' | 'END_OF_DATA';
  lotSize: number;
  slPrice?: number;
  tpPrice?: number;
}

export interface AffectedNewsEvent {
  id: string;
  title: string;
  sourceType: 'ECONOMIC_EVENT' | 'NEWS_HEADLINE';
  timestamp: number;
  timestampIso: string;
  currencyOrAsset: string;
  category: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number;
  candleIndex: number;
  candleTime: number;
  candleTimeIso: string;
  preEventAtrPips: number;
  eventBarRangePips: number;
  postEventExcursionPips: number;
  pipDisplacement: number;
  volatilityMultiplier: number;
  impactLevel: 'EXTREME' | 'HIGH' | 'MODERATE' | 'SUBDUED';
  greatlyAffected: boolean;
  whipsawTrapDetected: boolean;
  sentimentCorrelation: 'CONFIRMED' | 'INVERTED_FADE' | 'NEUTRAL';
  tacticalPrecaution: string;
}

export interface NewsImpactCorrelationResult {
  symbol: string;
  timeframe: string;
  candleCount: number;
  startTime: number;
  startTimeIso: string;
  endTime: number;
  endTimeIso: string;
  totalEventsAnalyzed: number;
  greatlyAffectedCount: number;
  averageVolatilityMultiplier: number;
  maxPipDisplacement: number;
  whipsawCount: number;
  caughtEvents: AffectedNewsEvent[];
  summary: string;
  dataQuality: 'LIVE' | 'SYNTHETIC' | 'NONE';
}

export interface BacktestResult {
  id: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  startTime: number;
  startTimeIso: string;
  endTime: number;
  endTimeIso: string;
  initialDeposit: number;
  finalEquity: number;
  netProfit: number;
  profitFactor: number;
  winRatePct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdownPct: number;
  maxDrawdownUsd: number;
  averageTradeProfit: number;
  averageWin: number;
  averageLoss: number;
  riskRewardRatio: number;
  trades: SimulatedTrade[];
  equityCurve: { time: number; timeIso: string; equity: number }[];
  evaluatedAt: number;
  dataQuality?: 'LIVE' | 'SYNTHETIC' | 'NONE';

  // KnowledgeBase Tools Integration & Performance Proof
  knowledgeAssisted?: boolean;
  newsFilterActive?: boolean;
  regimeFilterActive?: boolean;
  tradesAvoidedDueToNews?: number;
  lossesPreventedUsd?: number;
  caughtNewsEvents?: AffectedNewsEvent[];
  caughtNews?: any[];
  proofSummary?: string;
  comparison?: {
    baselineWinRatePct: number;
    baselineProfitFactor: number;
    baselineMaxDrawdownPct: number;
    baselineDrawdownPct?: number;
    baselineNetProfit: number;
    deltaWinRatePct: number;
    deltaProfitFactor: number;
    drawdownReductionPct: number;
    netProfitGainUsd: number;
    knowledgeWinRatePct?: number;
    knowledgeProfitFactor?: number;
    knowledgeDrawdownPct?: number;
    tradesAvoidedDueToNews?: number;
    lossesPreventedUsd?: number;
  };
}

export type BotTradingMode = 'SCALPER' | 'DAY_TRADES' | 'SWING_TRADES' | 'MIXED_OPTIONS';

export interface ScalperSettings {
  targetTimeframe: string;
  maxSpreadPoints: number;
  slAtrMultiplier: number;
  tpAtrMultiplier: number;
  quickBreakevenTriggerPoints: number;
  quickBreakevenLockPoints: number;
  tightTrailingDistancePoints: number;
  tightTrailingStepPoints: number;
  maxHoldBars: number;
  cooldownMs: number;
}

export interface DayTradeSettings {
  targetTimeframe: string;
  higherTimeframe: string;
  slAtrMultiplier: number;
  tpAtrMultiplier: number;
  breakevenTriggerPoints: number;
  breakevenLockPoints: number;
  trailingDistancePoints: number;
  trailingStepPoints: number;
  sessionFilter: boolean;
  cooldownMs: number;
}

export interface SwingTradeSettings {
  targetTimeframe: string;
  higherTimeframe: string;
  slAtrMultiplier: number;
  tpAtrMultiplier: number;
  breakevenTriggerPoints: number;
  breakevenLockPoints: number;
  trailingDistancePoints: number;
  trailingStepPoints: number;
  cooldownMs: number;
}

export interface MixedOptionsSettings {
  adaptiveRegimeRouting: boolean;
  trancheExecution: boolean;
  scalperWeight: number;
  dayTradeWeight: number;
  swingWeight: number;
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

export interface BotSignal {
  id: string;
  symbol: string;
  timeframe: string;
  action: 'BUY' | 'SELL';
  mode: BotTradingMode;
  confidence: number;
  price: number;
  sl: number;
  tp: number;
  reasons: string[];
  indicators: Record<string, any>;
  patterns: string[];
  higherTimeframeConfirmed: boolean;
  newsSafe: boolean;
  shockSafe: boolean;
  timestamp: number;
  status: 'PENDING' | 'EXECUTED' | 'REJECTED' | 'EXPIRED';
  rejectionReason?: string;
  executionTicket?: number;
}

export interface BotTrade {
  id: string;
  signalId: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  mode: BotTradingMode;
  ticket?: number;
  volume: number;
  entryPrice: number;
  entryTime: number;
  sl: number;
  tp: number;
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitTime?: number;
  exitReason?: string;
  profitUsd?: number;
  profitPoints?: number;
  trailingActive?: boolean;
}

export interface LearnedPatternPerformance {
  pattern: string;
  name: string;
  occurrences: number;
  winCount: number;
  winRatePct: number;
  avgRewardRisk: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  recommendedAction: string;
}

export interface SessionBehavior {
  session: 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'ROLLOVER';
  hoursUtc: string;
  typicalPipRange: number;
  liquidityTier: 'HIGH' | 'MODERATE' | 'LOW';
  recommendedStrategy: string;
  spreadRisk: 'LOW' | 'NORMAL' | 'ELEVATED' | 'HIGH';
}

export interface SymbolIntelligenceProfile {
  symbol: string;
  assetClass: string;
  analyzedCandlesCount: number;
  typicalSpread: number;
  spreadMin: number;
  spreadMax: number;
  spreadRolloverExpansion: number;
  atrM1: number;
  atrM15: number;
  atrH1: number;
  atrD1: number;
  volatilityState: 'COMPRESSED' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
  optimalSessions: SessionBehavior[];
  patternPerformance: Record<string, LearnedPatternPerformance>;
  keyLevels: {
    pivot: number;
    support1: number;
    support2: number;
    resistance1: number;
    resistance2: number;
    institutionalLiquidityZone: string;
  };
  bestTradingHours: { hourUtc: number; label: string; score: number }[];
  protectiveParameters: {
    recommendedSlPoints: number;
    recommendedTpPoints: number;
    breakevenTriggerPoints: number;
    breakevenLockPoints: number;
    trailingDistancePoints: number;
    trailingStepPoints: number;
  };
  summary: string;
  updatedAt: number;
}
