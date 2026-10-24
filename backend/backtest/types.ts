/**
 * Types for the Isolated Backtesting Engine (/backtest)
 */

import { CandleData } from '../types/mt5.js';

export type BacktestStrategyType =
  | 'RSI_REVERSAL'
  | 'EMA_CROSSOVER'
  | 'MACD_MOMENTUM'
  | 'BOLLINGER_BREAKOUT'
  | 'ORDER_BLOCK_CONFLUENCE'
  | 'BREAKOUT_MOMENTUM';

export interface BacktestOptions {
  id?: string;
  strategyId: string;
  strategyName?: string;
  strategyType: BacktestStrategyType;
  symbol: string;
  timeframe: string;
  candles: CandleData[];
  parameters: Record<string, any>;
  initialBalance: number;
  riskMode: 'FIXED_LOT' | 'RISK_PERCENT';
  fixedLotSize?: number;
  riskPercent?: number;
  spreadPoints?: number;
  slippagePoints?: number;
  commissionPerLot?: number;
  knowledgeAssisted?: boolean;
}

export interface BacktestTradeLog {
  id: string;
  ticket: number;
  type: 'BUY' | 'SELL';
  openTime: number;
  openTimeIso: string;
  openPrice: number;
  closeTime: number;
  closeTimeIso: string;
  closePrice: number;
  volume: number;
  profitUSD: number;
  returnPercent: number;
  sl: number;
  tp: number;
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'SIGNAL_REVERSAL' | 'END_OF_SERIES';
  barsHeld: number;
}

export interface EquityPoint {
  time: number;
  timeIso: string;
  equity: number;
  balance: number;
  drawdownUSD: number;
  drawdownPercent: number;
}

export interface BacktestExecutionResult {
  id: string;
  strategyId: string;
  strategyName: string;
  strategyType: BacktestStrategyType;
  symbol: string;
  timeframe: string;
  evaluatedAt: number;
  candleCount: number;
  initialBalance: number;
  finalEquity: number;
  netProfitUSD: number;
  returnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // 0-100
  profitFactor: number;
  maxDrawdownUSD: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  expectancyUSD: number;
  avgWinUSD: number;
  avgLossUSD: number;
  riskRewardRatio: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  equityCurve: EquityPoint[];
  trades: BacktestTradeLog[];
  parameters: Record<string, any>;
  dataQuality: 'LIVE' | 'SYNTHETIC';
  knowledgeAssisted?: boolean;
  tradesAvoidedDueToNews?: number;
  lossesPreventedUSD?: number;
}
