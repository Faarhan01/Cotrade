import { Router } from 'express';
import { runIsolatedBacktest } from '../backtest/backtestEngine.js';
import { backtestStore } from '../backtest/backtestStore.js';
import { tradeStore } from '../services/tradeStore.js';
import { dbGetCandles, dbInsertCandles, dbSaveBacktestResult, dbGetBacktestResults, dbGetBacktestById } from '../database/db.js';
import { normalizeSymbol } from '../utils/symbol.js';
import { normalizeTimeframe } from '../utils/timeframe.js';
import { timeframeToSeconds } from '../services/historySyncService.js';
import { CandleData } from '../types/mt5.js';

export const backtestRouter = Router();

// Run isolated backtest
backtestRouter.post('/run', async (req, res) => {
  try {
    const {
      strategyId = 'strat-backtest-custom',
      strategyName = 'Custom Strategy',
      strategyType = 'RSI_REVERSAL',
      symbol = 'EURUSD',
      timeframe = 'M1',
      candleCount = 300,
      parameters = {},
      initialBalance = 10000,
      riskMode = 'FIXED_LOT',
      fixedLotSize = 0.1,
      riskPercent = 1.0,
      spreadPoints = 15,
      slippagePoints = 2,
      commissionPerLot = 0,
      knowledgeAssisted = false,
    } = req.body;

    const normSym = normalizeSymbol(symbol) || 'EURUSD';
    const normTf = normalizeTimeframe(timeframe) || 'M1';

    // Retrieve real historical candles from SQLite or in-memory tradeStore
    let candles = await dbGetCandles(normSym, normTf, Math.min(2000, Math.max(50, candleCount)));

    if (!candles || candles.length < 30) {
      const inMem = tradeStore.getChartHistory();
      if (inMem && inMem.length >= 30 && tradeStore.getCurrentChart()?.symbol === normSym) {
        candles = inMem;
      }
    }

    // If candles are still insufficient, bootstrap realistic bars based on live price
    if (!candles || candles.length < 30) {
      const needed = Math.max(100, Math.min(1000, Number(candleCount) || 200));
      candles = generateBootstrapCandles(normSym, normTf, needed);
      dbInsertCandles(normSym, normTf, candles).catch((err) => {
        console.warn('[Backtest] Failed to persist bootstrap candles:', err?.message || err);
      });
    }

    const result = runIsolatedBacktest({
      strategyId,
      strategyName,
      strategyType,
      symbol: normSym,
      timeframe: normTf,
      candles,
      parameters,
      initialBalance: Number(initialBalance) || 10000,
      riskMode,
      fixedLotSize: Number(fixedLotSize) || 0.1,
      riskPercent: Number(riskPercent) || 1.0,
      spreadPoints: Number(spreadPoints) || 15,
      slippagePoints: Number(slippagePoints) || 2,
      commissionPerLot: Number(commissionPerLot) || 0,
      knowledgeAssisted: Boolean(knowledgeAssisted),
    });

    // Save to isolated in-memory store
    backtestStore.save(result);

    // Also persist summary to SQLite
    try {
      await dbSaveBacktestResult({
        id: result.id,
        strategyId: result.strategyId,
        strategyName: result.strategyName,
        symbol: result.symbol,
        timeframe: result.timeframe,
        evaluatedAt: result.evaluatedAt,
        candleCount: result.candleCount,
        initialBalance: result.initialBalance,
        finalEquity: result.finalEquity,
        netProfitUSD: result.netProfitUSD,
        winRate: result.winRate,
        profitFactor: result.profitFactor,
        maxDrawdownPercent: result.maxDrawdownPercent,
        totalTrades: result.totalTrades,
        winningTrades: result.winningTrades,
        losingTrades: result.losingTrades,
        tradesJson: JSON.stringify(result.trades.slice(0, 100)),
        parametersJson: JSON.stringify(result.parameters),
        dataQuality: result.dataQuality,
        knowledgeAssisted: result.knowledgeAssisted ? 1 : 0,
      });
    } catch (dbErr) {
      console.warn('[BacktestRouter] Notice persisting to db:', dbErr);
    }

    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('[BacktestRouter] Run error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Backtest failed' });
  }
});

// Get recent backtest results
backtestRouter.get('/results', async (req, res) => {
  try {
    const memoryResults = backtestStore.getAll(20);
    if (memoryResults.length > 0) {
      return res.json({ success: true, count: memoryResults.length, results: memoryResults });
    }

    // Fallback to SQLite results
    const dbResults = await dbGetBacktestResults(undefined, 20);
    res.json({ success: true, count: dbResults.length, results: dbResults });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Get single backtest result
backtestRouter.get('/results/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mem = backtestStore.get(id);
    if (mem) {
      return res.json({ success: true, result: mem });
    }

    const dbRes = await dbGetBacktestById(id);
    if (dbRes) {
      return res.json({ success: true, result: dbRes });
    }

    res.status(404).json({ success: false, error: 'Backtest result not found' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Delete backtest result
backtestRouter.delete('/results/:id', (req, res) => {
  const { id } = req.params;
  const deleted = backtestStore.delete(id);
  res.json({ success: true, deleted });
});

function generateBootstrapCandles(symbol: string, timeframe: string, count: number): CandleData[] {
  const normSym = normalizeSymbol(symbol);
  let basePrice = 1.0850;
  let typicalVolatility = 0.0008;

  if (normSym.includes('JPY')) {
    basePrice = 154.50;
    typicalVolatility = 0.15;
  } else if (normSym.includes('GBP')) {
    basePrice = 1.2950;
    typicalVolatility = 0.0012;
  } else if (normSym.includes('XAU')) {
    basePrice = 2650.0;
    typicalVolatility = 4.5;
  } else if (normSym.includes('BTC')) {
    basePrice = 67500.0;
    typicalVolatility = 250.0;
  } else if (normSym.includes('US30')) {
    basePrice = 42500.0;
    typicalVolatility = 80.0;
  }

  // Look up live tick if present
  const liveTick = tradeStore.getTicks().find((t: any) => t.symbol?.toUpperCase() === normSym.toUpperCase());
  if (liveTick?.bid && liveTick.bid > 0) {
    basePrice = liveTick.bid;
  }

  const tfSecs = timeframeToSeconds(timeframe);
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * tfSecs;

  const candles: CandleData[] = [];
  let current = basePrice;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * tfSecs;
    const wave = Math.sin(i / 10) * typicalVolatility * 0.9;
    const noise = (Math.random() - 0.49) * typicalVolatility * 1.6;
    const open = current;
    const close = Math.max(0.0001, open + wave + noise);
    const high = Math.max(open, close) + Math.random() * typicalVolatility * 0.9;
    const low = Math.min(open, close) - Math.random() * typicalVolatility * 0.9;
    const volume = Math.floor(50 + Math.random() * 250);

    candles.push({
      time,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume,
    });
    current = close;
  }

  return candles;
}

