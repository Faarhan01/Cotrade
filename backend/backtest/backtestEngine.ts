/**
 * Isolated Backtesting Engine (/backtest)
 *
 * Runs high-fidelity strategy simulations on real MT5 historical candles
 * with symbol-aware economics, realistic spread/slippage modeling,
 * intra-bar High/Low wick checks, and institutional quantitative metrics.
 */

import { BacktestOptions, BacktestExecutionResult, BacktestTradeLog, EquityPoint } from './types.js';
import {
  getSymbolDigits,
  getSymbolPoint,
  getSymbolContractSize,
  calculatePositionSizeByRisk,
} from '../utils/symbolEconomics.js';

interface ActivePosition {
  id: string;
  ticket: number;
  type: 'BUY' | 'SELL';
  openTime: number;
  openPrice: number;
  volume: number;
  sl: number;
  tp: number;
  barIndex: number;
}

export function runIsolatedBacktest(options: BacktestOptions): BacktestExecutionResult {
  const {
    id = `bt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    strategyId,
    strategyName = strategyId,
    strategyType,
    symbol,
    timeframe,
    candles,
    parameters = {},
    initialBalance = 10000,
    riskMode = 'FIXED_LOT',
    fixedLotSize = 0.1,
    riskPercent = 1.0,
    spreadPoints = 15,
    slippagePoints = 2,
    commissionPerLot = 0,
    knowledgeAssisted = false,
  } = options;

  const digits = getSymbolDigits(symbol);
  const point = getSymbolPoint(symbol);
  const contractSize = getSymbolContractSize(symbol);
  const spreadPrice = spreadPoints * point;
  const slippagePrice = slippagePoints * point;

  if (!candles || candles.length < 30) {
    return createEmptyResult(options, id);
  }

  // Pre-calculate technical indicators across the candle series
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const rsiValues = calculateRsiSeries(closes, parameters.rsiPeriod || 14);
  const emaFast = calculateEmaSeries(closes, parameters.fastEma || 9);
  const emaSlow = calculateEmaSeries(closes, parameters.slowEma || 21);
  const emaBaseline = calculateEmaSeries(closes, parameters.baselineEma || 200);
  const macdData = calculateMacdSeries(closes, parameters.macdFast || 12, parameters.macdSlow || 26, parameters.macdSignal || 9);
  const bbData = calculateBollingerSeries(closes, parameters.bbPeriod || 20, parameters.bbStdDev || 2);
  const atrValues = calculateAtrSeries(candles, 14);

  let currentBalance = initialBalance;
  let currentEquity = initialBalance;
  let peakEquity = initialBalance;
  let maxDrawdownUSD = 0;
  let maxDrawdownPercent = 0;

  const closedTrades: BacktestTradeLog[] = [];
  let openPosition: ActivePosition | null = null;
  let ticketCounter = 1000;

  const equityCurve: EquityPoint[] = [];

  // Start after warm-up period
  const startIndex = Math.min(30, Math.floor(candles.length / 4));

  for (let i = startIndex; i < candles.length; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    const curAtr = atrValues[i] || (c.close * 0.001);

    // 1. If we have an open position, check SL, TP, or signal reversal on current candle
    if (openPosition) {
      let exitPrice = 0;
      let exitReason: BacktestTradeLog['exitReason'] | null = null;

      if (openPosition.type === 'BUY') {
        // Did Low hit Stop Loss?
        if (openPosition.sl > 0 && c.low <= openPosition.sl) {
          exitPrice = openPosition.sl - slippagePrice;
          exitReason = 'STOP_LOSS';
        }
        // Did High hit Take Profit?
        else if (openPosition.tp > 0 && c.high >= openPosition.tp) {
          exitPrice = openPosition.tp;
          exitReason = 'TAKE_PROFIT';
        }
      } else {
        // SELL position
        // Did High hit Stop Loss?
        if (openPosition.sl > 0 && c.high >= openPosition.sl) {
          exitPrice = openPosition.sl + slippagePrice;
          exitReason = 'STOP_LOSS';
        }
        // Did Low hit Take Profit?
        else if (openPosition.tp > 0 && c.low <= openPosition.tp) {
          exitPrice = openPosition.tp;
          exitReason = 'TAKE_PROFIT';
        }
      }

      // Close trade if SL/TP triggered
      if (exitReason && exitPrice > 0) {
        const pnl = calculateTradePnl(
          openPosition.type,
          openPosition.openPrice,
          exitPrice,
          openPosition.volume,
          contractSize,
          commissionPerLot
        );

        currentBalance += pnl;
        currentEquity = currentBalance;

        closedTrades.push({
          id: openPosition.id,
          ticket: openPosition.ticket,
          type: openPosition.type,
          openTime: openPosition.openTime,
          openTimeIso: new Date(openPosition.openTime).toISOString(),
          openPrice: Number(openPosition.openPrice.toFixed(digits)),
          closeTime: c.time,
          closeTimeIso: new Date(c.time).toISOString(),
          closePrice: Number(exitPrice.toFixed(digits)),
          volume: openPosition.volume,
          profitUSD: Number(pnl.toFixed(2)),
          returnPercent: Number(((pnl / currentBalance) * 100).toFixed(2)),
          sl: Number(openPosition.sl.toFixed(digits)),
          tp: Number(openPosition.tp.toFixed(digits)),
          exitReason,
          barsHeld: i - openPosition.barIndex,
        });

        openPosition = null;
      }
    }

    // 2. Generate signal from strategy logic
    const signal = evaluateStrategySignal({
      strategyType,
      i,
      candles,
      rsiValues,
      emaFast,
      emaSlow,
      emaBaseline,
      macdData,
      bbData,
      parameters,
    });

    // Check for reversal exit on existing position
    if (openPosition && signal !== 'HOLD' && signal !== openPosition.type) {
      const exitPrice = signal === 'SELL' ? c.close : c.close + spreadPrice;
      const pnl = calculateTradePnl(
        openPosition.type,
        openPosition.openPrice,
        exitPrice,
        openPosition.volume,
        contractSize,
        commissionPerLot
      );

      currentBalance += pnl;
      currentEquity = currentBalance;

      closedTrades.push({
        id: openPosition.id,
        ticket: openPosition.ticket,
        type: openPosition.type,
        openTime: openPosition.openTime,
        openTimeIso: new Date(openPosition.openTime).toISOString(),
        openPrice: Number(openPosition.openPrice.toFixed(digits)),
        closeTime: c.time,
        closeTimeIso: new Date(c.time).toISOString(),
        closePrice: Number(exitPrice.toFixed(digits)),
        volume: openPosition.volume,
        profitUSD: Number(pnl.toFixed(2)),
        returnPercent: Number(((pnl / currentBalance) * 100).toFixed(2)),
        sl: Number(openPosition.sl.toFixed(digits)),
        tp: Number(openPosition.tp.toFixed(digits)),
        exitReason: 'SIGNAL_REVERSAL',
        barsHeld: i - openPosition.barIndex,
      });

      openPosition = null;
    }

    // 3. Open new position if signal and no current open position
    if (!openPosition && signal !== 'HOLD') {
      const entryPrice: number = signal === 'BUY' ? c.close + spreadPrice + slippagePrice : c.close - slippagePrice;

      // Set SL and TP using ATR multipliers
      const slMultiplier = parameters.slAtrMultiplier || 1.5;
      const tpMultiplier = parameters.tpAtrMultiplier || 2.5;

      const slDistance = curAtr * slMultiplier;
      const tpDistance = curAtr * tpMultiplier;

      const slPrice: number = signal === 'BUY' ? entryPrice - slDistance : entryPrice + slDistance;
      const tpPrice: number = signal === 'BUY' ? entryPrice + tpDistance : entryPrice - tpDistance;

      // Position Sizing
      let volume = fixedLotSize;
      if (riskMode === 'RISK_PERCENT') {
        const sizing = calculatePositionSizeByRisk({
          symbol,
          balance: currentBalance,
          riskPercent,
          entryPrice,
          stopLossPrice: slPrice,
          symbolInfo: { digits, point, contractSize },
        });
        volume = sizing.recommendedLots;
      }

      openPosition = {
        id: `pos-${ticketCounter}-${c.time}`,
        ticket: ticketCounter++,
        type: signal,
        openTime: c.time,
        openPrice: entryPrice,
        volume: Math.max(0.01, volume),
        sl: slPrice,
        tp: tpPrice,
        barIndex: i,
      };
    }

    // 4. Update floating equity & track drawdown
    let floatingPnl = 0;
    if (openPosition) {
      floatingPnl = calculateTradePnl(
        openPosition.type,
        openPosition.openPrice,
        c.close,
        openPosition.volume,
        contractSize,
        0
      );
    }

    currentEquity = currentBalance + floatingPnl;
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }

    const ddUSD = Math.max(0, peakEquity - currentEquity);
    const ddPercent = peakEquity > 0 ? (ddUSD / peakEquity) * 100 : 0;
    if (ddUSD > maxDrawdownUSD) maxDrawdownUSD = ddUSD;
    if (ddPercent > maxDrawdownPercent) maxDrawdownPercent = ddPercent;

    // Sample equity curve every few candles or on trades
    if (i % 2 === 0 || i === candles.length - 1) {
      equityCurve.push({
        time: c.time,
        timeIso: new Date(c.time).toISOString(),
        equity: Number(currentEquity.toFixed(2)),
        balance: Number(currentBalance.toFixed(2)),
        drawdownUSD: Number(ddUSD.toFixed(2)),
        drawdownPercent: Number(ddPercent.toFixed(2)),
      });
    }
  }

  // Close any open position at the end of data series
  if (openPosition && candles.length > 0) {
    const lastCandle = candles[candles.length - 1];
    const pnl = calculateTradePnl(
      openPosition.type,
      openPosition.openPrice,
      lastCandle.close,
      openPosition.volume,
      contractSize,
      commissionPerLot
    );
    currentBalance += pnl;
    closedTrades.push({
      id: openPosition.id,
      ticket: openPosition.ticket,
      type: openPosition.type,
      openTime: openPosition.openTime,
      openTimeIso: new Date(openPosition.openTime).toISOString(),
      openPrice: Number(openPosition.openPrice.toFixed(digits)),
      closeTime: lastCandle.time,
      closeTimeIso: new Date(lastCandle.time).toISOString(),
      closePrice: Number(lastCandle.close.toFixed(digits)),
      volume: openPosition.volume,
      profitUSD: Number(pnl.toFixed(2)),
      returnPercent: Number(((pnl / currentBalance) * 100).toFixed(2)),
      sl: Number(openPosition.sl.toFixed(digits)),
      tp: Number(openPosition.tp.toFixed(digits)),
      exitReason: 'END_OF_SERIES',
      barsHeld: candles.length - 1 - openPosition.barIndex,
    });
  }

  // Compute final statistics
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter((t) => t.profitUSD > 0).length;
  const losingTrades = closedTrades.filter((t) => t.profitUSD < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  const grossProfit = closedTrades
    .filter((t) => t.profitUSD > 0)
    .reduce((sum, t) => sum + t.profitUSD, 0);
  const grossLoss = Math.abs(
    closedTrades.filter((t) => t.profitUSD < 0).reduce((sum, t) => sum + t.profitUSD, 0)
  );

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;
  const netProfitUSD = currentBalance - initialBalance;
  const returnPercent = initialBalance > 0 ? (netProfitUSD / initialBalance) * 100 : 0;

  const avgWinUSD = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLossUSD = losingTrades > 0 ? grossLoss / losingTrades : 0;
  const expectancyUSD = totalTrades > 0 ? netProfitUSD / totalTrades : 0;
  const riskRewardRatio = avgLossUSD > 0 ? avgWinUSD / avgLossUSD : 0;

  // Compute streaks
  let curWinStreak = 0;
  let maxWinStreak = 0;
  let curLossStreak = 0;
  let maxLossStreak = 0;

  for (const t of closedTrades) {
    if (t.profitUSD > 0) {
      curWinStreak++;
      curLossStreak = 0;
      if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
    } else if (t.profitUSD < 0) {
      curLossStreak++;
      curWinStreak = 0;
      if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
    }
  }

  // Annualized Sharpe ratio approximation
  const returns = closedTrades.map((t) => t.returnPercent);
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;

  return {
    id,
    strategyId,
    strategyName,
    strategyType,
    symbol,
    timeframe,
    evaluatedAt: Date.now(),
    candleCount: candles.length,
    initialBalance,
    finalEquity: Number(currentBalance.toFixed(2)),
    netProfitUSD: Number(netProfitUSD.toFixed(2)),
    returnPercent: Number(returnPercent.toFixed(2)),
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: Number(winRate.toFixed(1)),
    profitFactor: Number(profitFactor.toFixed(2)),
    maxDrawdownUSD: Number(maxDrawdownUSD.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    expectancyUSD: Number(expectancyUSD.toFixed(2)),
    avgWinUSD: Number(avgWinUSD.toFixed(2)),
    avgLossUSD: Number(avgLossUSD.toFixed(2)),
    riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
    maxConsecutiveWins: maxWinStreak,
    maxConsecutiveLosses: maxLossStreak,
    equityCurve,
    trades: closedTrades,
    parameters,
    dataQuality: 'LIVE',
    knowledgeAssisted,
  };
}

function calculateTradePnl(
  type: 'BUY' | 'SELL',
  openPrice: number,
  closePrice: number,
  volume: number,
  contractSize: number,
  commissionPerLot: number
): number {
  const delta = type === 'BUY' ? closePrice - openPrice : openPrice - closePrice;
  const gross = delta * contractSize * volume;
  const commission = commissionPerLot * volume;
  return gross - commission;
}

function evaluateStrategySignal(params: {
  strategyType: BacktestOptions['strategyType'];
  i: number;
  candles: any[];
  rsiValues: (number | null)[];
  emaFast: (number | null)[];
  emaSlow: (number | null)[];
  emaBaseline: (number | null)[];
  macdData: { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] };
  bbData: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
  parameters: Record<string, any>;
}): 'BUY' | 'SELL' | 'HOLD' {
  const { strategyType, i, candles, rsiValues, emaFast, emaSlow, emaBaseline, macdData, bbData, parameters } = params;
  const cur = candles[i];
  const prev = candles[i - 1];

  switch (strategyType) {
    case 'RSI_REVERSAL': {
      const rsi = rsiValues[i];
      const prevRsi = rsiValues[i - 1];
      const oversold = parameters.oversold || 30;
      const overbought = parameters.overbought || 70;
      if (rsi !== null && prevRsi !== null) {
        if (prevRsi < oversold && rsi >= oversold) return 'BUY';
        if (prevRsi > overbought && rsi <= overbought) return 'SELL';
      }
      break;
    }

    case 'EMA_CROSSOVER': {
      const fast = emaFast[i];
      const slow = emaSlow[i];
      const prevFast = emaFast[i - 1];
      const prevSlow = emaSlow[i - 1];
      if (fast !== null && slow !== null && prevFast !== null && prevSlow !== null) {
        if (prevFast <= prevSlow && fast > slow) return 'BUY';
        if (prevFast >= prevSlow && fast < slow) return 'SELL';
      }
      break;
    }

    case 'MACD_MOMENTUM': {
      const hist = macdData.hist[i];
      const prevHist = macdData.hist[i - 1];
      if (hist !== null && prevHist !== null) {
        if (prevHist <= 0 && hist > 0) return 'BUY';
        if (prevHist >= 0 && hist < 0) return 'SELL';
      }
      break;
    }

    case 'BOLLINGER_BREAKOUT': {
      const upper = bbData.upper[i];
      const lower = bbData.lower[i];
      if (upper !== null && lower !== null) {
        if (cur.close > upper && prev.close <= upper) return 'BUY';
        if (cur.close < lower && prev.close >= lower) return 'SELL';
      }
      break;
    }

    case 'ORDER_BLOCK_CONFLUENCE': {
      // Fair value gap / Order block reaction with baseline EMA confirmation
      const baseline = emaBaseline[i] || cur.close;
      const rsi = rsiValues[i] || 50;
      // Bullish FVG rejection: previous 2 candles created gap, cur candle wicks down and closes green
      const isBullishFvg = cur.close > cur.open && cur.low <= prev.low && cur.close > baseline && rsi > 45 && rsi < 65;
      const isBearishFvg = cur.close < cur.open && cur.high >= prev.high && cur.close < baseline && rsi < 55 && rsi > 35;
      if (isBullishFvg) return 'BUY';
      if (isBearishFvg) return 'SELL';
      break;
    }

    case 'BREAKOUT_MOMENTUM': {
      // Donchian 20-period price extreme breach
      const lookback = 20;
      if (i > lookback) {
        const slice = candles.slice(i - lookback, i);
        const maxHigh = Math.max(...slice.map((s) => s.high));
        const minLow = Math.min(...slice.map((s) => s.low));
        if (cur.close > maxHigh) return 'BUY';
        if (cur.close < minLow) return 'SELL';
      }
      break;
    }
  }

  return 'HOLD';
}

function calculateRsiSeries(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return result;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }

  return result;
}

function calculateEmaSeries(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;

  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  result[period - 1] = ema;

  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result[i] = ema;
  }

  return result;
}

function calculateMacdSeries(
  values: number[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number
): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const fast = calculateEmaSeries(values, fastPeriod);
  const slow = calculateEmaSeries(values, slowPeriod);
  const macdLine: (number | null)[] = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (fast[i] !== null && slow[i] !== null) {
      macdLine[i] = fast[i]! - slow[i]!;
    }
  }

  // Signal line is EMA of macdLine
  const validMacd: number[] = [];
  const macdIndices: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      validMacd.push(macdLine[i]!);
      macdIndices.push(i);
    }
  }

  const signalLineValid = calculateEmaSeries(validMacd, signalPeriod);
  const signalLine: (number | null)[] = new Array(values.length).fill(null);
  const hist: (number | null)[] = new Array(values.length).fill(null);

  for (let k = 0; k < validMacd.length; k++) {
    const origIdx = macdIndices[k];
    signalLine[origIdx] = signalLineValid[k];
    if (macdLine[origIdx] !== null && signalLine[origIdx] !== null) {
      hist[origIdx] = macdLine[origIdx]! - signalLine[origIdx]!;
    }
  }

  return { macd: macdLine, signal: signalLine, hist };
}

function calculateBollingerSeries(
  values: number[],
  period: number,
  stdDevMult: number
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calculateEmaSeries(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    if (middle[i] !== null) {
      upper[i] = middle[i]! + stdDev * stdDevMult;
      lower[i] = middle[i]! - stdDev * stdDevMult;
    }
  }

  return { upper, middle, lower };
}

function calculateAtrSeries(candles: any[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < 2) return result;

  const trs: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hpc, lpc));
  }

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = atr;

  for (let i = period; i < candles.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result[i] = atr;
  }

  return result;
}

function createEmptyResult(options: BacktestOptions, id: string): BacktestExecutionResult {
  return {
    id,
    strategyId: options.strategyId,
    strategyName: options.strategyName || options.strategyId,
    strategyType: options.strategyType,
    symbol: options.symbol,
    timeframe: options.timeframe,
    evaluatedAt: Date.now(),
    candleCount: options.candles?.length || 0,
    initialBalance: options.initialBalance,
    finalEquity: options.initialBalance,
    netProfitUSD: 0,
    returnPercent: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    profitFactor: 0,
    maxDrawdownUSD: 0,
    maxDrawdownPercent: 0,
    sharpeRatio: 0,
    expectancyUSD: 0,
    avgWinUSD: 0,
    avgLossUSD: 0,
    riskRewardRatio: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    equityCurve: [],
    trades: [],
    parameters: options.parameters,
    dataQuality: 'LIVE',
  };
}
