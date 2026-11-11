import { Router } from 'express';
import { runIsolatedBacktest } from '../backtest/backtestEngine.js';
import { backtestStore } from '../backtest/backtestStore.js';
import { tradeStore } from '../services/tradeStore.js';
import { dbGetCandles, dbSaveBacktestResult, dbGetBacktestResults, dbGetBacktestById } from '../database/db.js';
import { normalizeSymbol } from '../utils/symbol.js';
import { normalizeTimeframe } from '../utils/timeframe.js';

export const backtestRouter = Router();

// Run isolated backtest
backtestRouter.post('/run', async (req, res) => {
  try {
    const {
      strategyId = 'strat-backtest-custom',
      strategyName = 'Custom Strategy',
      strategyType = 'RSI_REVERSAL',
      symbol = '',
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

    const normSym = normalizeSymbol(symbol) || tradeStore.resolveActiveSymbol();
    if (!normSym) {
      return res.status(400).json({ success: false, error: 'A valid trading symbol is required for backtesting.' });
    }
    const normTf = normalizeTimeframe(timeframe) || 'M1';

    // Retrieve real historical candles from SQLite or in-memory tradeStore
    let candles = await dbGetCandles(normSym, normTf, Math.min(2000, Math.max(50, candleCount)));

    if (!candles || candles.length < 20) {
      const inMem = tradeStore.getChartHistory();
      if (inMem && inMem.length >= 20 && tradeStore.getCurrentChart()?.symbol === normSym) {
        candles = inMem;
      }
    }

    // If candles for this timeframe are insufficient, inspect alternative timeframes in DB
    if (!candles || candles.length < 20) {
      for (const altTf of ['M1', 'M5', 'M15', 'M30', 'H1']) {
        if (altTf !== normTf) {
          const altCandles = await dbGetCandles(normSym, altTf, Math.min(2000, Math.max(50, candleCount)));
          if (altCandles && altCandles.length >= 20) {
            candles = altCandles;
            break;
          }
        }
      }
    }

    // Reject backtesting on non-existent or synthetic data: demand authentic broker bars
    if (!candles || candles.length < 20) {
      const neededBars = Math.max(100, Math.min(1000, Number(candleCount) || 200));
      if (tradeStore.getState().connection.isEaConnected) {
        tradeStore.requestHistoryFromEA(normSym, normTf, neededBars);
        return res.status(400).json({
          success: false,
          error: `History sync for ${normSym} [${normTf}] dispatched to MT5 EA. Please allow a few seconds for authentic broker candles to sync before backtesting.`,
        });
      }
      return res.status(400).json({
        success: false,
        error: `Insufficient authentic historical candles for ${normSym} [${normTf}]. Please connect the MetaTrader 5 EA to stream live historical bars rather than simulated random data.`,
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
      await dbSaveBacktestResult(result);
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
});

