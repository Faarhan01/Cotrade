export type OrderType = 'BUY' | 'SELL' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
export type PendingOrderType = 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | 'BUY_STOP_LIMIT' | 'SELL_STOP_LIMIT';
export type CommandStatus = 'pending' | 'dispatched' | 'executed' | 'failed' | 'cancelled';
export type OrderAction = 'EXECUTE_TRADE' | 'MODIFY_POSITION' | 'CLOSE_POSITION' | 'CLOSE_ALL' | 'CANCEL_PENDING' | 'FETCH_HISTORY' | 'SET_RISK_GUARD';

export interface AccountInfo {
  login: number;
  tradeMode: string; // 'DEMO' | 'REAL' | 'CONTEST'
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number; // percentage
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
  globalTakeProfitUSD: number; // 0 = disabled
  globalStopLossUSD: number; // 0 = disabled
  maxDrawdownPercent: number; // 0 = disabled
  emergencyKillSwitch: boolean;
  trailingStopEnabled: boolean;
  trailingStopDistancePoints: number; // in points
  trailingStopStepPoints: number; // in points
  maxLotSizePerTrade: number;
  maxOpenPositions: number;
  allowedSymbols: string[];
  autoCloseOnMarginLevelBelow: number; // e.g. 50%
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

export interface MT5TerminalPermissions {
  terminalConnected: boolean;
  terminalTradeAllowed: boolean;
  mqlTradeAllowed: boolean;
  accountTradeAllowed: boolean;
  accountExpertAllowed: boolean;
  accountLimitOrders?: number;
}

export interface MT5ChartDiagnostics {
  symbol: string;
  timeframe: string;
  periodSeconds: number;
  digits: number;
  point: number;
  spreadPoints: number;
  spreadPips: number;
  serverTime: number;
  serverTimeIso: string;
  gmtTime: number;
  gmtTimeIso: string;
  localTime?: number;
  timezoneOffsetHours: number;
  currentBarOpenTime: number;
  currentBarOpenTimeIso: string;
  currentBarSecondsElapsed: number;
  currentBarSecondsRemaining: number;
  currentBarProgressPercent: number;
  isBarClosed: boolean;
  firstVisibleBar: number;
  visibleBars: number;
  priceMax: number;
  priceMin: number;
  scale: number;
  mode: 'BARS' | 'CANDLESTICKS' | 'LINE';
  autoscroll: boolean;
  tickVolume?: number;
  realVolume?: number;
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
  description?: string;
  currencyBase?: string;
  currencyProfit?: string;
  // MT5 Chart exact behaviors & telemetry
  periodSeconds?: number;
  currentBarTime?: number;
  currentBarTimeIso?: string;
  currentBarSecondsRemaining?: number;
  currentBarProgressPercent?: number;
  isBarClosed?: boolean;
  chartFirstVisibleBar?: number;
  chartVisibleBars?: number;
  chartPriceMax?: number;
  chartPriceMin?: number;
  chartScale?: number;
  chartMode?: number;
  chartAutoscroll?: boolean;
  gmtTime?: number;
  gmtTimeIso?: string;
  timezoneOffsetHours?: number;
  tickVolume?: number;
  realVolume?: number;
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
  currencyBase?: string;
  currencyProfit?: string;
  description?: string;
  high24h?: number;
  low24h?: number;
  sessionOpen?: number;
  sessionHigh?: number;
  sessionLow?: number;
  sessionVolume?: number;
  volume?: number;
  time?: number;
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
  realVolume?: number;
  isClosed?: boolean;
}

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

export interface EASyncPayload {
  apiKey: string;
  account: AccountInfo;
  positions: Position[];
  pendingOrders?: PendingOrder[];
  ticks: TickData[];
  eaVersion: string;
  mt5Time: number;
  mt5TimeIso?: string;
  gmtTime?: number;
  gmtTimeIso?: string;
  localTime?: number;
  timezoneOffsetHours?: number;
  currentChart?: ChartSymbolInfo;
  allSymbols?: DetailedSymbolInfo[];
  chartHistory?: CandleData[];
  marketDepth?: Record<string, { bids: MarketDepthItem[]; asks: MarketDepthItem[] }>;
  terminalPermissions?: MT5TerminalPermissions;
  historyPayload?: {
    symbol: string;
    timeframe: string;
    candles: CandleData[];
  };
  terminalName?: string;
  terminalCompany?: string;
  terminalBuild?: number;
  pendingExecutionResults?: {
    commandId: string;
    success: boolean;
    dealTicket?: number;
    orderTicket?: number;
    executionPrice?: number;
    errorCode?: number;
    errorMessage?: string;
    executionTimeMs?: number;
    slippagePoints?: number;
    timestampIso?: string;
  }[];
}

export interface EASyncResponse {
  status: 'ok' | 'error';
  serverTime: number;
  commands: TradeCommand[];
  riskGuard: RiskGuardConfig;
  message?: string;
}
