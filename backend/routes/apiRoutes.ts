import { Router } from 'express';
import { tradeStore } from '../services/tradeStore.js';
import { commandDispatcher } from '../services/commandDispatcher.js';
import { tradingBot, getBotConfig } from '../bot/index.js';
import { MCP_TOOLS, executeMcpTool, handleMcpJsonRpc } from '../mcp/mcpServer.js';
import { broadcast } from '../services/websocketServer.js';
import { normalizeTimeframe } from '../utils/timeframe.js';
import { normalizeSymbol } from '../utils/symbol.js';
import fs from 'fs';
import path from 'path';

export const apiRouter = Router();

// Health check: reports bridge, database and EA status in one call.
apiRouter.get('/health', async (req, res) => {
  try {
    const { getDatabase } = await import('../database/db.js');
    const db = await getDatabase();
    const integrity = db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0] ?? 'unknown';
    const candleCount = db.exec('SELECT COUNT(*) FROM candles_history')[0]?.values?.[0]?.[0] ?? 0;
    const orderCount = db.exec('SELECT COUNT(*) FROM orders')[0]?.values?.[0]?.[0] ?? 0;
    res.json({
      status: 'ok',
      database: { integrity, candleCount, orderCount },
      ea: {
        connected: tradeStore.getState().connection.isEaConnected,
        lastSync: tradeStore.getState().connection.lastEaSync,
      },
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err?.message });
  }
});

/**
 * Resolve the timeframe to use for a candle read.
 *
 * Several routes used to hardcode `'M1'` regardless of the chart the EA was
 * actually attached to, so an H1 auto-detect would silently analyse M1 bars.
 */
function resolveTimeframe(queryTimeframe?: string): string {
  if (queryTimeframe && normalizeTimeframe(queryTimeframe)) {
    return normalizeTimeframe(queryTimeframe);
  }
  const chartTf = tradeStore.getCurrentChart()?.timeframe;
  return normalizeTimeframe(chartTf) || 'M1';
}

/**
 * Resolves historical candles specifically for the queried symbol.
 * Uses in-memory chart history only if the requested symbol matches the active chart.
 * Otherwise fetches the queried symbol's true historical candles from SQLite, and requests
 * on-demand history from MT5 EA if the local database does not have bars yet.
 */
async function resolveCandlesForSymbol(targetSymbol: string, queryTimeframe?: string, count = 200) {
  const currentChart = tradeStore.getCurrentChart();
  const tf = resolveTimeframe(queryTimeframe);
  const cleanTarget = normalizeSymbol(targetSymbol);

  if (
    currentChart &&
    normalizeSymbol(currentChart.symbol) === cleanTarget &&
    normalizeTimeframe(currentChart.timeframe) === tf
  ) {
    const mem = tradeStore.getChartHistory();
    if (mem && mem.length > 0) return mem;
  }

  const { dbGetCandles } = await import('../database/db.js');
  const dbCandles = await dbGetCandles(cleanTarget, tf, count);
  if (dbCandles && dbCandles.length > 0) return dbCandles;

  if (tradeStore.getState().connection.isEaConnected) {
    tradeStore.requestHistoryFromEA(cleanTarget, tf, count);
  }
  return [];
}

// Full state snapshot
apiRouter.get('/state', (req, res) => {
  res.json(tradeStore.getState());
});

// All tracked symbols transmitted by MT5 EA
apiRouter.get('/symbols', (req, res) => {
  const symbols = tradeStore.getAllSymbols();
  res.json({
    success: true,
    count: symbols.length,
    symbols,
  });
});


// Enqueue order command from UI or API via unified commandDispatcher
apiRouter.post('/commands', (req, res) => {
  const result = commandDispatcher.dispatchGeneric(req.body, 'MANUAL_UI');
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// Update risk guard parameters
apiRouter.post('/risk', (req, res) => {
  const updates = req.body;
  tradeStore.updateRiskGuard(updates);

  broadcast({
    type: 'risk:updated',
    payload: tradeStore.getRiskGuard(),
  });

  res.json({
    status: 'ok',
    riskGuard: tradeStore.getRiskGuard(),
  });
});

// Toggle emergency kill switch
apiRouter.post('/kill-switch', (req, res) => {
  const { active } = req.body;
  tradeStore.triggerKillSwitch(Boolean(active));

  broadcast({
    type: 'risk:kill_switch',
    payload: { active: Boolean(active) },
  });

  res.json({
    status: 'ok',
    emergencyKillSwitch: tradeStore.getRiskGuard().emergencyKillSwitch,
  });
});

// Active SSE clients for MCP protocol
const mcpSseClients = new Map<string, any>();

// MCP SSE Transport
apiRouter.get('/mcp/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sessionId = `mcp-session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  mcpSseClients.set(sessionId, res);

  // Send endpoint event with session URI per MCP specification
  res.write(`event: endpoint\ndata: /api/mcp/messages?sessionId=${sessionId}\n\n`);

  req.on('close', () => {
    mcpSseClients.delete(sessionId);
  });
});

// MCP Messages handler for SSE session
apiRouter.post('/mcp/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const sseClient = mcpSseClients.get(sessionId);

  try {
    const rpcResponse = await handleMcpJsonRpc(req.body);
    if (sseClient) {
      sseClient.write(`event: message\ndata: ${JSON.stringify(rpcResponse)}\n\n`);
      res.status(202).json({ status: 'accepted' });
    } else {
      res.json(rpcResponse);
    }
  } catch (err: any) {
    const errPayload = {
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32603, message: err?.message || 'Internal RPC error' },
    };
    if (sseClient) {
      sseClient.write(`event: message\ndata: ${JSON.stringify(errPayload)}\n\n`);
      res.status(202).json({ status: 'accepted' });
    } else {
      res.status(500).json(errPayload);
    }
  }
});

// MCP JSON-RPC 2.0 Direct POST Handler
apiRouter.post('/mcp', async (req, res) => {
  try {
    const rpcResponse = await handleMcpJsonRpc(req.body);
    res.json(rpcResponse);
  } catch (err: any) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32603, message: err?.message || 'Internal RPC error' },
    });
  }
});

// MCP Tool List
apiRouter.get('/mcp/tools', (req, res) => {
  res.json({
    tools: MCP_TOOLS,
  });
});

// Execute specific MCP tool directly via REST
apiRouter.post('/mcp/tools/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const result = await executeMcpTool(name, req.body);
    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    const isMcp = err?.name === 'McpError' || err?.code;
    const code = isMcp ? err.code : 'INTERNAL_ERROR';
    const status =
      code === 'TOOL_NOT_FOUND'
        ? 404
        : code === 'INVALID_ARGUMENTS'
        ? 400
        : code === 'EA_NOT_CONNECTED'
        ? 503
        : code === 'BROKER_REJECTED'
        ? 422
        : 500;

    res.status(status).json({
      success: false,
      code,
      error: err?.message || String(err),
      details: err?.details,
    });
  }
});

// Get MQL5 source code text
apiRouter.get('/ea/code', (req, res) => {
  try {
    const eaPath = path.resolve(process.cwd(), 'backend/ea/AIMT5Bridge.mq5');
    if (fs.existsSync(eaPath)) {
      const code = fs.readFileSync(eaPath, 'utf-8');
      return res.json({ code });
    }
    res.status(404).json({ error: 'EA source file not found' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Download MQL5 file directly
apiRouter.get('/ea/download', (req, res) => {
  const eaPath = path.resolve(process.cwd(), 'backend/ea/AIMT5Bridge.mq5');
  if (fs.existsSync(eaPath)) {
    res.setHeader('Content-Disposition', 'attachment; filename="AIMT5Bridge.mq5"');
    res.setHeader('Content-Type', 'text/plain');
    fs.createReadStream(eaPath).pipe(res);
  } else {
    res.status(404).send('File not found');
  }
});

// Get database analytics & statistics
apiRouter.get('/database/analytics', async (req, res) => {
  try {
    const { dbGetAnalytics } = await import('../database/db.js');
    const analytics = await dbGetAnalytics();
    res.json(analytics);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query orders history from SQLite database
apiRouter.get('/database/orders', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const { dbGetOrders } = await import('../database/db.js');
    const orders = await dbGetOrders(limit);
    res.json({ orders });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Dynamic Multi-Table Inspection for Database & KnowledgeBase
apiRouter.get('/database/tables/:table', async (req, res) => {
  try {
    const table = req.params.table.toLowerCase();
    const limit = Number(req.query.limit) || 100;
    const { dbGetTableRows } = await import('../database/db.js');
    const data = await dbGetTableRows(table, limit);
    res.json({ success: true, table, ...data });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// Clear a specific table from database
apiRouter.delete('/database/tables/:table', async (req, res) => {
  try {
    const table = req.params.table.toLowerCase();
    const { dbClearTable } = await import('../database/db.js');
    const purged = await dbClearTable(table);
    res.json({ success: true, table, purgedCount: purged });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

// Export table data as downloadable JSON
apiRouter.get('/database/export/:table', async (req, res) => {
  try {
    const table = req.params.table.toLowerCase();
    const { dbGetTableRows } = await import('../database/db.js');
    const data = await dbGetTableRows(table, 1000);
    res.setHeader('Content-Disposition', `attachment; filename="${table}_export.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(data.rows);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});


// Explicitly prune database & purge unexecuted orders older than 24 hours
apiRouter.post('/database/prune', async (req, res) => {
  try {
    tradeStore.pruneStaleOrders();
    const { dbPruneDatabase } = await import('../database/db.js');
    const result = await dbPruneDatabase();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query candles history from SQLite database
apiRouter.get('/database/candles', async (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || 'EURUSD';
    const timeframe = (req.query.timeframe as string) || 'M1';
    const limit = Number(req.query.limit) || 100;
    const { dbGetCandles } = await import('../database/db.js');
    const candles = await dbGetCandles(symbol, timeframe, limit);
    res.json({ symbol, timeframe, count: candles.length, candles });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query ticks history from SQLite database
apiRouter.get('/database/ticks', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const limit = Number(req.query.limit) || 100;
    const { dbGetTicksHistory } = await import('../database/db.js');
    const ticks = await dbGetTicksHistory(symbol, limit);
    res.json({ count: ticks.length, ticks });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query account history snapshots from SQLite database
apiRouter.get('/database/account-history', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const { dbGetAccountHistory } = await import('../database/db.js');
    const history = await dbGetAccountHistory(limit);
    res.json({ count: history.length, history });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Simulate synthetic candles for strategy backtesting without waiting for live ticks
apiRouter.post('/candles/simulate', async (req, res) => {
  try {
    const { symbol, timeframe, count, basePrice } = req.body;
    const result = await tradeStore.seedCandles(
      symbol || 'EURUSD',
      timeframe || 'M1',
      Number(count) || 60,
      Number(basePrice) || 1.085
    );
    broadcast({
      type: 'ea:sync',
      payload: {
        chartHistory: result.candles,
      },
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Request historical candles from EA on demand via unified commandDispatcher
apiRouter.post('/candles/request', (req, res) => {
  try {
    const { symbol, timeframe, count } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    const dispatchRes = commandDispatcher.requestHistory({
      symbol,
      timeframe: timeframe || 'M1',
      count: Number(count) || 100,
      source: 'MANUAL_UI',
    });
    res.json(dispatchRes);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Export in-memory SQLite state as downloadable binary
apiRouter.get('/database/download', async (req, res) => {
  try {
    const { getDatabase } = await import('../database/db.js');
    const db = await getDatabase();
    const data = db.export();
    res.setHeader('Content-Disposition', 'attachment; filename="mt5_in_memory_state.sqlite"');
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.send(Buffer.from(data));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to export in-memory database' });
  }
});

// Trigger a live tick update for testing
apiRouter.post('/simulate-tick', (req, res) => {
  const { symbol, bid, ask } = req.body;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const current = tradeStore.getTicks().find((t) => t.symbol === symbol);
  const newBid = bid || (current ? current.bid * (1 + (Math.random() - 0.5) * 0.001) : 1.085);
  const newAsk = ask || newBid + 0.00015;

  tradeStore.updateTick({
    symbol,
    bid: Number(newBid.toFixed(5)),
    ask: Number(newAsk.toFixed(5)),
    last: Number(newBid.toFixed(5)),
    spread: 15,
    volume: 500,
    time: Math.floor(Date.now() / 1000),
  });

  broadcast({
    type: 'tick',
    payload: tradeStore.getTicks().find((t) => t.symbol === symbol),
  });

  res.json({ success: true, tick: tradeStore.getTicks().find((t) => t.symbol === symbol) });
});

// ==========================================
// Strategies Knowledge Base Endpoints
// ==========================================

// Get all strategies
apiRouter.get('/strategies', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const { dbGetStrategies } = await import('../database/db.js');
    const strategies = await dbGetStrategies(symbol);
    res.json({ strategies });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Get strategy by ID
apiRouter.get('/strategies/:id', async (req, res) => {
  try {
    const { dbGetStrategyById } = await import('../database/db.js');
    const strategy = await dbGetStrategyById(req.params.id);
    if (!strategy) return res.status(404).json({ error: 'Strategy not found' });
    res.json(strategy);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Create or update strategy
apiRouter.post('/strategies', async (req, res) => {
  try {
    const { id, name, description, type, symbol, timeframe, parameters, status, tags, author, notes } = req.body;
    if (!name || !symbol) {
      return res.status(400).json({ error: 'Strategy name and symbol are required' });
    }

    const stratId = id || `strat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const strategyData = {
      id: stratId,
      name,
      description: description || '',
      type: type || 'RSI_REVERSAL',
      symbol: symbol ? String(symbol).trim() : 'EURUSD',
      timeframe: timeframe ? String(timeframe).trim() : 'M1',
      parameters: parameters || {},
      status: status || 'active',
      tags: tags || [],
      author: author || 'User',
      notes: notes || '',
      createdAt: req.body.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    const { dbSaveStrategy } = await import('../database/db.js');
    await dbSaveStrategy(strategyData);

    tradeStore.addLog({
      level: 'info',
      title: 'Strategy Saved',
      details: `Saved strategy "${name}" [${strategyData.type}] for ${strategyData.symbol} ${strategyData.timeframe}`,
      source: 'STRATEGY_ENGINE',
    });

    res.json({ success: true, strategy: strategyData });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Delete strategy
apiRouter.delete('/strategies/:id', async (req, res) => {
  try {
    const { dbDeleteStrategy } = await import('../database/db.js');
    await dbDeleteStrategy(req.params.id);
    res.json({ success: true, message: `Strategy ${req.params.id} deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Run backtest for strategy
apiRouter.post('/strategies/:id/backtest', async (req, res) => {
  try {
    const { dbGetStrategyById, dbGetCandles, dbSaveBacktestResult } = await import('../database/db.js');
    const { runStrategyBacktest } = await import('../knowledgebase/core/strategyEngine.js');

    const strategy = await dbGetStrategyById(req.params.id);
    if (!strategy) return res.status(404).json({ error: 'Strategy not found' });

    // Allow overriding test parameters or candle limits in request body
    const initialDeposit = Number(req.body.initialDeposit) || 10000;

    // Pull historical candles from SQLite (collected from MT5 EA)
    const candleLimit = Math.min(Math.max(Math.floor(Number(req.body.candleLimit)) || 300, 20), 5000);
    let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, candleLimit);
    let dataQuality: 'LIVE' | 'SYNTHETIC' | 'NONE' = candles.length >= 20 ? 'LIVE' : 'NONE';

    // If local DB doesn't have enough candles, fall back to currently active chart history if matching
    if (candles.length < 20) {
      const liveHistory = tradeStore.getChartHistory();
      if (
        liveHistory &&
        liveHistory.length >= 20 &&
        tradeStore.getCurrentChart()?.symbol?.toUpperCase() === strategy.symbol.toUpperCase()
      ) {
        candles = liveHistory;
        dataQuality = 'LIVE';
      } else {
        return res.status(400).json({
          error: `Insufficient historical candlestick data for ${strategy.symbol} [${strategy.timeframe}] (${candles.length} bars available in database). Please pull real historical candles from MetaTrader 5 via the History Pull dock or connect the MT5 EA.`,
        });
      }
    }

    const useKnowledge = req.body?.useKnowledgeTools !== false;
    let result;
    if (useKnowledge) {
      const { runKnowledgeEnhancedBacktest } = await import('../knowledgebase/core/strategyEngine.js');
      result = await runKnowledgeEnhancedBacktest(
        strategy,
        candles,
        {
          enableNewsRiskFilter: req.body?.enableNewsRiskFilter ?? true,
          enableNewsDirectionalFilter: req.body?.enableNewsDirectionalFilter ?? false,
          enableRegimeFilter: req.body?.enableRegimeFilter ?? true,
        },
        initialDeposit
      );
    } else {
      result = runStrategyBacktest(strategy, candles, initialDeposit);
    }

    // The quality marker travels with the stored result so the UI can never
    // present a random-walk backtest as a live-data measurement.
    await dbSaveBacktestResult({ ...result, dataQuality });

    tradeStore.addLog({
      level: 'trade',
      title: useKnowledge ? 'KnowledgeBase-Assisted Backtest Completed' : 'Strategy Backtest Completed',
      details: `Backtested "${strategy.name}" on ${strategy.symbol} (${candles.length} bars MT5 real history). Net Profit: $${result.netProfit}, Win Rate: ${result.winRatePct}%, Trades: ${result.totalTrades}${result.proofSummary ? ` • Proof: ${result.proofSummary}` : ''}`,
      source: 'STRATEGY_ENGINE',
    });

    res.json({ success: true, result: { ...result, dataQuality } });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Explicit KnowledgeBase-Assisted Strategy Backtest with News Impact Correlation
apiRouter.post('/strategies/:id/knowledge-backtest', async (req, res) => {
  try {
    const { dbGetStrategyById, dbGetCandles, dbSaveBacktestResult } = await import('../database/db.js');
    const { runKnowledgeEnhancedBacktest } = await import('../knowledgebase/core/strategyEngine.js');

    const strategy = await dbGetStrategyById(req.params.id);
    if (!strategy) return res.status(404).json({ error: 'Strategy not found' });

    const initialDeposit = Number(req.body.initialDeposit) || 10000;
    const candleLimit = Math.min(Math.max(Math.floor(Number(req.body.candleLimit)) || 300, 20), 5000);
    let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, candleLimit);
    let dataQuality: 'LIVE' | 'SYNTHETIC' | 'NONE' = candles.length >= 20 ? 'LIVE' : 'NONE';

    if (candles.length < 20) {
      const liveHistory = tradeStore.getChartHistory();
      if (liveHistory && liveHistory.length >= 20) {
        candles = liveHistory;
        dataQuality = tradeStore.getDataQuality();
      }
    }

    if (candles.length < 20) {
      return res.status(400).json({
        error: `Insufficient historical candles for ${strategy.symbol} (${candles.length} available). Request history from EA via /chart/pull first.`,
      });
    }

    const result = await runKnowledgeEnhancedBacktest(
      strategy,
      candles,
      {
        enableNewsRiskFilter: req.body?.enableNewsRiskFilter ?? true,
        enableNewsDirectionalFilter: req.body?.enableNewsDirectionalFilter ?? false,
        enableRegimeFilter: req.body?.enableRegimeFilter ?? true,
        newsHazardWindowBars: Number(req.body?.newsHazardWindowBars) || 4,
      },
      initialDeposit
    );

    await dbSaveBacktestResult({ ...result, dataQuality });

    tradeStore.addLog({
      level: 'trade',
      title: 'KnowledgeBase Backtest Evaluated',
      details: `${result.proofSummary || `Evaluated ${strategy.name} on ${strategy.symbol}`}`,
      source: 'KNOWLEDGE_ENGINE',
    });

    res.json({ success: true, result: { ...result, dataQuality } });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Detect which news events greatly affected a symbol on historical candles
apiRouter.get('/knowledge/news/impact-detector', async (req, res) => {
  try {
    const symbolParam = (req.query.symbol as string) || tradeStore.getCurrentChart()?.symbol || 'EURUSD';
    const sym = symbolParam.trim().toUpperCase();
    const tf = resolveTimeframe(req.query.timeframe as string);
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 20), 1000);

    const { dbGetCandles } = await import('../database/db.js');
    let candles = await dbGetCandles(sym, tf, limit);

    if (candles.length < 15) {
      const inMem = tradeStore.getChartHistory();
      if (inMem.length >= 15 && (tradeStore.getCurrentChart()?.symbol || '').toUpperCase() === sym) {
        candles = inMem;
      }
    }

    const { detectSymbolNewsImpactOnCandles } = await import('../knowledgebase/news/newsImpactDetector.js');
    const result = await detectSymbolNewsImpactOnCandles(sym, candles, tf);

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/knowledge/news/impact-detector', async (req, res) => {
  try {
    const symbolParam = (req.body?.symbol as string) || tradeStore.getCurrentChart()?.symbol || 'EURUSD';
    const sym = symbolParam.trim().toUpperCase();
    const tf = resolveTimeframe(req.body?.timeframe as string);
    const limit = Math.min(Math.max(Number(req.body?.limit) || 200, 20), 1000);

    const { dbGetCandles } = await import('../database/db.js');
    let candles = await dbGetCandles(sym, tf, limit);

    if (candles.length < 15) {
      const inMem = tradeStore.getChartHistory();
      if (inMem.length >= 15) candles = inMem;
    }

    const { detectSymbolNewsImpactOnCandles } = await import('../knowledgebase/news/newsImpactDetector.js');
    const result = await detectSymbolNewsImpactOnCandles(sym, candles, tf);

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});


// ==========================================
// Trade Signal & Position Sizing (AI-assisted trade decisions)
// ==========================================
apiRouter.post('/trade/signal', async (req, res) => {
  try {
    const symbol = (req.body?.symbol as string) || tradeStore.getCurrentChart()?.symbol || 'EURUSD';
    const targetSymbol = symbol.trim();
    const account = tradeStore.getAccount();
    const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === targetSymbol.toLowerCase());
    const currentPrice = ticks.length > 0 ? ticks[0].bid : (tradeStore.getCurrentChart()?.bid || 0);

    let candles = tradeStore.getChartHistory();
    if (!candles || candles.length < 20) {
      const { dbGetCandles } = await import('../database/db.js');
      candles = await dbGetCandles(targetSymbol, 'M1', 200);
    }

    const dataQuality = tradeStore.getDataQuality();
    const { generateTradeSignal } = await import('../knowledgebase/core/tradeSignal.js');
    const signal = await generateTradeSignal(targetSymbol, candles, currentPrice, account.balance, dataQuality, undefined, tradeStore.getAllSymbols().find((s) => s.symbol.toUpperCase() === targetSymbol.toUpperCase()));

    res.json({ success: true, signal });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/trade/position-size', async (req, res) => {
  try {
    const { symbol, entryPrice, stopLossPrice, riskPercent, accountBalance, contractSize } = req.body;
    const targetSymbol = (symbol || 'EURUSD').trim();
    const balance = Number(accountBalance) || tradeStore.getAccount().balance || 10000;
    const risk = Number(riskPercent) || 1;
    const entry = Number(entryPrice) || 0;
    const sl = Number(stopLossPrice) || 0;
    const cs = Number(contractSize) || 100000;

    const { calculatePositionSize } = await import('../knowledgebase/core/tradeSignal.js');
    const result = calculatePositionSize(targetSymbol, balance, risk, entry, sl, cs);

    res.json({ success: true, positionSize: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// ==========================================
// Trading Bot (Auto-Trader) Endpoints
// ==========================================
apiRouter.get('/bot/status', (req, res) => {
  res.json({ success: true, ...tradingBot.getState() });
});

apiRouter.get('/bot/config', (req, res) => {
  res.json({ success: true, config: getBotConfig(), state: tradingBot.getState() });
});

apiRouter.post('/bot/start', (req, res) => {
  const result = tradingBot.start();
  res.json({ success: result.success, message: result.message });
});

apiRouter.post('/bot/stop', (req, res) => {
  const result = tradingBot.stop();
  res.json({ success: result.success, message: result.message });
});

apiRouter.post('/bot/config', (req, res) => {
  const result = tradingBot.updateConfig(req.body || {});
  res.json({ success: result.success, message: result.message, state: tradingBot.getState() });
});

apiRouter.post('/bot/evaluate', async (_req, res) => {
  try {
    const result = await tradingBot.evaluateNow();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/bot/mode', (req, res) => {
  const { mode } = req.body;
  if (!['SCALPER', 'DAY_TRADES', 'SWING_TRADES', 'MIXED_OPTIONS'].includes(mode)) {
    return res.status(400).json({ success: false, error: 'Invalid mode. Must be SCALPER, DAY_TRADES, SWING_TRADES, or MIXED_OPTIONS' });
  }
  const result = tradingBot.updateConfig({ mode });
  res.json({ success: result.success, message: result.message, mode, state: tradingBot.getState() });
});

apiRouter.get('/bot/trades', async (req, res) => {
  try {
    const { dbGetBotTrades } = await import('../database/db.js');
    const limit = Number(req.query.limit) || 50;
    const trades = await dbGetBotTrades(limit);
    res.json({ success: true, trades });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/bot/signals', async (req, res) => {
  try {
    const { dbGetBotSignals } = await import('../database/db.js');
    const limit = Number(req.query.limit) || 50;
    const signals = await dbGetBotSignals(limit);
    res.json({ success: true, signals });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// ==========================================
// Observations Knowledge Base Endpoints
// ==========================================

// Get observations
apiRouter.get('/observations', async (req, res) => {
  try {
    const category = req.query.category as string;
    const { dbGetObservations } = await import('../database/db.js');
    const observations = await dbGetObservations(category);
    res.json({ observations });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Create observation
apiRouter.post('/observations', async (req, res) => {
  try {
    const { title, content, symbol, timeframe, strategyId, category, tags, metrics } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const obsId = req.body.id || `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const observation = {
      id: obsId,
      title,
      content,
      symbol: symbol || null,
      timeframe: timeframe || null,
      strategyId: strategyId || null,
      category: category || 'market_insight',
      tags: tags || [],
      metrics: metrics || {},
      createdAt: req.body.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    const { dbSaveObservation } = await import('../database/db.js');
    await dbSaveObservation(observation);

    tradeStore.addLog({
      level: 'info',
      title: 'Observation Recorded',
      details: `Added observation "${title}" in category [${observation.category}]`,
      source: 'KNOWLEDGE_BASE',
    });

    res.json({ success: true, observation });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Delete observation
apiRouter.delete('/observations/:id', async (req, res) => {
  try {
    const { dbDeleteObservation } = await import('../database/db.js');
    await dbDeleteObservation(req.params.id);
    res.json({ success: true, message: `Observation ${req.params.id} deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Get backtest results history
apiRouter.get('/backtests', async (req, res) => {
  try {
    const strategyId = req.query.strategyId as string;
    const limit = Number(req.query.limit) || 50;
    const { dbGetBacktestResults } = await import('../database/db.js');
    const results = await dbGetBacktestResults(strategyId, limit);
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Get single backtest result
apiRouter.get('/backtests/:id', async (req, res) => {
  try {
    const { dbGetBacktestById } = await import('../database/db.js');
    const result = await dbGetBacktestById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Backtest not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ==========================================
// Knowledge Base Core & Analysis Endpoints
// ==========================================

// Auto-detect symbol profile, asset class, session windows, optimal risk & strategies
apiRouter.get('/knowledge/auto-detect', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();

    const { autoDetectSymbol } = await import('../knowledgebase/core/auto-detect.js');
    const allSymbols = tradeStore.getAllSymbols();
    const symbolInfo =
      allSymbols.find((s) => s.symbol.toLowerCase() === targetSymbol.toLowerCase()) ||
      (currentChart && currentChart.symbol.toLowerCase() === targetSymbol.toLowerCase() ? (currentChart as any) : null);

    const candles = await resolveCandlesForSymbol(targetSymbol, req.query.timeframe as string, 200);
    const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === targetSymbol.toLowerCase());

    const profile = autoDetectSymbol(targetSymbol, symbolInfo, candles, ticks);
    res.json({ success: true, profile });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect Market Regime (Trending, Range, Squeeze, Breakout)
apiRouter.get('/knowledge/regime', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();
    const tf = (req.query.timeframe as string) || currentChart?.timeframe || 'M1';

    const candles = await resolveCandlesForSymbol(targetSymbol, tf, 200);

    const { autoDetectMarketRegime } = await import('../knowledgebase/core/auto-detect.js');
    const regime = autoDetectMarketRegime(targetSymbol, candles);

    // Save regime detection snapshot to SQLite
    const { dbSaveSymbolRegime } = await import('../database/db.js');
    dbSaveSymbolRegime(regime).catch((e) => console.error('DB save regime error:', e));

    res.json({ success: true, regime });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect Account-Tailored Risk & Position Sizing Profile
apiRouter.get('/knowledge/risk-profile', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();
    const riskPercent = Number(req.query.riskPercent) || 1.0;

    const { autoDetectSymbol, autoDetectAccountRiskProfile } = await import('../knowledgebase/core/auto-detect.js');
    const allSymbols = tradeStore.getAllSymbols();
    const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === targetSymbol.toLowerCase()) || null;
    const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === targetSymbol.toLowerCase());
    const candles = await resolveCandlesForSymbol(targetSymbol, req.query.timeframe as string, 200);

    const specs = autoDetectSymbol(targetSymbol, symbolInfo, candles, ticks);
    const account = tradeStore.getAccount();
    const riskProfile = autoDetectAccountRiskProfile(targetSymbol, account, specs, riskPercent);

    res.json({ success: true, riskProfile });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect Global Market Clock & Session Liquidity
apiRouter.get('/knowledge/sessions', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();

    const { autoDetectLiquidityAndSessions } = await import('../knowledgebase/core/auto-detect.js');
    const session = autoDetectLiquidityAndSessions(targetSymbol);
    res.json({ success: true, session });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Comprehensive Full-Spectrum Symbol Analysis (Specs + Regime + Session + Risk + Microstructure + Volatility + Levels + Safety + Scalping)
apiRouter.get('/knowledge/full-analysis', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();

    const { runComprehensiveAutoDetection } = await import('../knowledgebase/core/auto-detect.js');
    const account = tradeStore.getAccount();
    const allSymbols = tradeStore.getAllSymbols();
    const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === targetSymbol.toLowerCase()) || null;
    const candles = await resolveCandlesForSymbol(targetSymbol, req.query.timeframe as string, 200);
    const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === targetSymbol.toLowerCase());

    const analysis = runComprehensiveAutoDetection(targetSymbol, account, symbolInfo, candles, ticks);

    // Persist to database
    const { dbSaveSymbolAutoDetectProfile } = await import('../database/db.js');
    dbSaveSymbolAutoDetectProfile(analysis).catch((e) => console.error('DB save full profile error:', e));

    res.json({ success: true, analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Run and persist Auto-Detection on a symbol
apiRouter.post('/knowledge/auto-detect/run', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbol = (req.body?.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbol.trim();

    const { runComprehensiveAutoDetection } = await import('../knowledgebase/core/auto-detect.js');
    const account = tradeStore.getAccount();
    const allSymbols = tradeStore.getAllSymbols();
    const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === targetSymbol.toLowerCase()) || null;
    const candles = await resolveCandlesForSymbol(targetSymbol, req.body?.timeframe, 150);
    const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === targetSymbol.toLowerCase());

    const analysis = runComprehensiveAutoDetection(targetSymbol, account, symbolInfo, candles, ticks);
    const { dbSaveSymbolAutoDetectProfile } = await import('../database/db.js');
    await dbSaveSymbolAutoDetectProfile(analysis);

    const { broadcast } = await import('../services/websocketServer.js');
    broadcast({
      type: 'knowledge:autodetect',
      payload: analysis,
    });

    res.json({ success: true, analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Get all saved auto-detection profiles from database
apiRouter.get('/knowledge/auto-detect/all', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const { dbGetSymbolAutoDetectProfiles } = await import('../database/db.js');
    const profiles = await dbGetSymbolAutoDetectProfiles(limit);
    res.json({ success: true, count: profiles.length, profiles });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect symbol microstructure and economics
apiRouter.get('/knowledge/auto-detect/microstructure', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();

    const { autoDetectSymbolMicrostructure } = await import('../knowledgebase/core/auto-detect.js');
    const allSymbols = tradeStore.getAllSymbols();
    const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === targetSymbol.toLowerCase()) || null;
    const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === targetSymbol.toLowerCase());
    const account = tradeStore.getAccount();

    const microstructure = autoDetectSymbolMicrostructure(targetSymbol, symbolInfo, ticks, account);
    res.json({ success: true, microstructure });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect Volatility Regime, Choppiness Index and Noise
apiRouter.get('/knowledge/auto-detect/volatility', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();
    const tf = (req.query.timeframe as string) || currentChart?.timeframe || 'M1';

    const candles = await resolveCandlesForSymbol(targetSymbol, tf, 100);
    const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === targetSymbol.toLowerCase());
    const { autoDetectVolatilityAndNoise } = await import('../knowledgebase/core/auto-detect.js');

    const volatility = autoDetectVolatilityAndNoise(targetSymbol, candles, ticks);
    res.json({ success: true, volatility });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect Floor Trader Pivots and Camarilla Levels
apiRouter.get('/knowledge/auto-detect/levels', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();
    const tf = (req.query.timeframe as string) || currentChart?.timeframe || 'M1';

    const candles = await resolveCandlesForSymbol(targetSymbol, tf, 100);
    const { autoDetectSupportResistanceAndPivots } = await import('../knowledgebase/core/auto-detect.js');

    const levels = autoDetectSupportResistanceAndPivots(targetSymbol, candles);
    res.json({ success: true, levels });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect Execution Safety Score
apiRouter.get('/knowledge/auto-detect/safety', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();

    const account = tradeStore.getAccount();
    const allSymbols = tradeStore.getAllSymbols();
    const symbolInfo = allSymbols.find((s) => s.symbol.toLowerCase() === targetSymbol.toLowerCase()) || null;
    const candles = await resolveCandlesForSymbol(targetSymbol, req.query.timeframe as string, 100);
    const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === targetSymbol.toLowerCase());
    const { autoDetectExecutionSafetyScore } = await import('../knowledgebase/core/auto-detect.js');

    const safety = autoDetectExecutionSafetyScore(targetSymbol, account, symbolInfo, candles, ticks);
    res.json({ success: true, safety });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect Scalping Viability
apiRouter.get('/knowledge/auto-detect/scalping', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();

    const candles = await resolveCandlesForSymbol(targetSymbol, req.query.timeframe as string, 100);
    const ticks = tradeStore.getTicks().filter((t) => t.symbol.toLowerCase() === targetSymbol.toLowerCase());
    const { autoDetectScalpingSuitability } = await import('../knowledgebase/core/auto-detect.js');

    const scalping = autoDetectScalpingSuitability(targetSymbol, candles, ticks);
    res.json({ success: true, scalping });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect Institutional Fair Value Gaps (FVG) and Liquidity Pools
apiRouter.get(['/knowledge/auto-detect/imbalances', '/knowledge/imbalances'], async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();
    const tf = (req.query.timeframe as string) || currentChart?.timeframe || 'M1';

    const candles = await resolveCandlesForSymbol(targetSymbol, tf, 100);
    const { autoDetectInstitutionalImbalances } = await import('../knowledgebase/core/auto-detect.js');
    const point = currentChart?.point || 0.0001;
    const imbalances = autoDetectInstitutionalImbalances(targetSymbol, candles, point);
    res.json({ success: true, imbalances });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-detect Session Order Flow Bias & Asian Range Liquidity Sweeps
apiRouter.get(['/knowledge/auto-detect/session-order-flow', '/knowledge/session-order-flow', '/knowledge/order-flow'], async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbolParam = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const targetSymbol = symbolParam.trim();
    const tf = (req.query.timeframe as string) || currentChart?.timeframe || 'M1';

    const candles = await resolveCandlesForSymbol(targetSymbol, tf, 100);
    const { autoDetectSessionOrderFlowBias } = await import('../knowledgebase/core/auto-detect.js');
    const sessionOrderFlow = autoDetectSessionOrderFlowBias(targetSymbol, candles);
    res.json({ success: true, sessionOrderFlow });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Pull chart history with timestamps, OHLCV candlesticks, price statistics and sub-second tick movements
apiRouter.get('/chart/history', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const sym = (req.query.symbol as string)?.trim() || currentChart?.symbol || 'EURUSD';
    const tf = (req.query.timeframe as string)?.trim() || currentChart?.timeframe || 'M1';
    const limit = Math.min(Number(req.query.limit) || 100, 5000);
    const includeIndicators = req.query.includeIndicators !== 'false';
    const includeTicks = req.query.includeTicks !== 'false';
    const fromTime = req.query.from ? Number(req.query.from) : undefined;
    const toTime = req.query.to ? Number(req.query.to) : undefined;

    const { dbGetCandleHistoryWithStats, dbGetCandlesRange, dbGetRecentTickMovements } = await import('../database/db.js');
    let candles: any[] = [];
    let stats: any = null;

    if (fromTime && toTime) {
      candles = await dbGetCandlesRange(sym, tf, fromTime, toTime, limit);
    } else {
      const candleResult = await dbGetCandleHistoryWithStats(sym, tf, limit);
      candles = candleResult.candles;
      stats = candleResult.stats;
    }

    let gapDiagnosis: any = null;
    if (!fromTime && !toTime) {
      const { inspectAndFillChartGaps } = await import('../services/historySyncService.js');
      gapDiagnosis = await inspectAndFillChartGaps(sym, tf, limit);
    }

    // If no candles stored yet, check in-memory chart history or trigger pull from MT5 EA
    if (candles.length === 0) {
      if (currentChart && currentChart.symbol.toLowerCase() === sym.toLowerCase()) {
        const inMem = tradeStore.getChartHistory();
        if (inMem.length > 0) {
          const { dbInsertCandles } = await import('../database/db.js');
          await dbInsertCandles(sym, tf, inMem);
          candles = inMem.slice(-limit);
        }
      }
    }

    let indicators = null;
    if (includeIndicators && candles.length > 0) {
      const { calculateIndicators } = await import('../services/indicatorEngine.js');
      indicators = calculateIndicators(candles, sym, tf);
    }

    let tickMovements = null;
    if (includeTicks) {
      tickMovements = await dbGetRecentTickMovements(sym, 40);
    }

    res.json({
      success: true,
      symbol: sym,
      timeframe: tf,
      count: candles.length,
      candles,
      stats,
      gapDiagnosis,
      indicators,
      tickMovements: tickMovements?.ticks || [],
      tickStats: tickMovements?.stats || null,
      awaitingEaData: candles.length === 0,
      isEaConnected: tradeStore.getState().connection.isEaConnected,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Explicit Chart Gap Inspector & Reconciler
apiRouter.get('/chart/gap-status', async (req, res) => {
  try {
    const sym = (req.query.symbol as string)?.trim() || tradeStore.getCurrentChart()?.symbol || 'EURUSD';
    const tf = (req.query.timeframe as string)?.trim() || tradeStore.getCurrentChart()?.timeframe || 'M1';
    const { inspectAndFillChartGaps } = await import('../services/historySyncService.js');
    const result = await inspectAndFillChartGaps(sym, tf);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Trigger chart history pull from MT5 EA via unified commandDispatcher
apiRouter.post('/chart/pull', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const sym = (req.body.symbol as string)?.trim() || currentChart?.symbol || 'EURUSD';
    const tf = (req.body.timeframe as string)?.trim() || currentChart?.timeframe || 'M1';
    const count = Math.min(Number(req.body.count) || 100, 2000);
    const from = req.body.from ? Number(req.body.from) : undefined;
    const to = req.body.to ? Number(req.body.to) : undefined;

    tradeStore.trackSymbolInEA(sym);
    const resCmd = tradeStore.requestHistoryFromEA(sym, tf, count, from, to);

    res.json({
      success: true,
      commandId: resCmd.commandId,
      message: `Requested ${count} candles for ${sym} [${tf}] from MT5 EA`,
      status: 'queued',
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Instruct EA to activate native authoritative breakeven on a position ticket
apiRouter.post('/position/protect', (req, res) => {
  try {
    const ticket = Number(req.body.ticket);
    if (!ticket || ticket <= 0) {
      return res.status(400).json({ success: false, error: 'Valid position ticket required' });
    }
    const result = commandDispatcher.dispatchGeneric({
      action: 'PROTECT_POSITION',
      ticket,
      source: 'MANUAL_UI',
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Dynamically request EA to track any symbol from the terminal's universe
apiRouter.post('/symbols/track', (req, res) => {
  try {
    const symbol = (req.body.symbol as string)?.trim();
    if (!symbol) return res.status(400).json({ success: false, error: 'Symbol required' });
    const result = commandDispatcher.dispatchGeneric({
      action: 'TRACK_SYMBOL',
      symbol,
      source: 'MANUAL_UI',
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Learned Symbol Intelligence Profile (Symbol DNA & Pattern Exposure)
apiRouter.get('/knowledge/symbol-intelligence/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.trim();
    const { getLearnedSymbolIntelligence } = await import('../knowledgebase/core/symbolLearning.js');
    const allSymbols = tradeStore.getAllSymbols();
    const symInfo = allSymbols.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase()) || null;
    const profile = await getLearnedSymbolIntelligence(symbol, symInfo);
    res.json({ success: true, intelligence: profile, profile });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// All learned symbol intelligences
apiRouter.get('/knowledge/symbol-intelligence', async (_req, res) => {
  try {
    const { getAllLearnedSymbolIntelligences } = await import('../knowledgebase/core/symbolLearning.js');
    const profiles = await getAllLearnedSymbolIntelligences();
    res.json({ success: true, count: profiles.length, profiles });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Query ticks history by symbol and date/time range
apiRouter.get('/ticks/history', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const fromTime = req.query.from ? Number(req.query.from) : undefined;
    const toTime = req.query.to ? Number(req.query.to) : undefined;
    const limit = Math.min(Number(req.query.limit) || 200, 2000);

    const { dbGetTicksHistoryRange } = await import('../database/db.js');
    const ticks = await dbGetTicksHistoryRange(symbol, fromTime, toTime, limit);
    res.json({ success: true, count: ticks.length, ticks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Database optimization (Vacuum, analyze, purge stale unexecuted orders)
apiRouter.post('/database/optimize', async (req, res) => {
  try {
    tradeStore.pruneStaleOrders();
    const { dbOptimizeDatabase } = await import('../database/db.js');
    const result = await dbOptimizeDatabase();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Scan candlestick, indicator, and shape patterns
apiRouter.get('/knowledge/patterns', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbol = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const timeframe = (req.query.timeframe as string) || currentChart?.timeframe || 'M1';

    const candles = await resolveCandlesForSymbol(symbol, timeframe, 120);

    const { detectAllPatterns } = await import('../knowledgebase/patterns/index.js');
    const patterns = detectAllPatterns(candles, symbol, timeframe);
    res.json({ success: true, patterns });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Comprehensive technical indicators calculation
apiRouter.get('/knowledge/indicators', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbol = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const timeframe = (req.query.timeframe as string) || currentChart?.timeframe || 'M1';

    const candles = await resolveCandlesForSymbol(symbol, timeframe, 120);

    const { calculateIndicators } = await import('../knowledgebase/indicators/index.js');
    const indicators = calculateIndicators(candles, symbol, timeframe);
    res.json({ success: true, indicators });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Real-time market news and sentiment
apiRouter.get('/knowledge/news', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const category = req.query.category as string;
    const { fetchMarketNews } = await import('../knowledgebase/news/newsEngine.js');
    let news = await fetchMarketNews(symbol);
    if (category && category !== 'ALL') {
      news = news.filter((item) => item.category === category);
    }
    const { dbSaveNewsCache } = await import('../database/db.js');
    dbSaveNewsCache(news).catch((e) => console.error('DB save news cache error:', e));
    res.json({ success: true, count: news.length, news });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Macroeconomic economic calendar events
apiRouter.get('/knowledge/calendar', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const { getUpcomingEconomicEvents } = await import('../knowledgebase/news/economicCalendar.js');
    const calendar = getUpcomingEconomicEvents(symbol);
    res.json({ success: true, ...calendar });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/knowledge/calendar/refresh', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const { refreshLiveEconomicCalendar, getUpcomingEconomicEvents } = await import('../knowledgebase/news/economicCalendar.js');
    const count = await refreshLiveEconomicCalendar(true);
    const calendar = getUpcomingEconomicEvents(symbol);
    res.json({ success: true, count, ...calendar });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.get('/economic-calendar', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const { getUpcomingEconomicEvents } = await import('../knowledgebase/news/economicCalendar.js');
    const calendar = getUpcomingEconomicEvents(symbol);
    res.json({ success: true, ...calendar });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

apiRouter.post('/economic-calendar/refresh', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const { refreshLiveEconomicCalendar, getUpcomingEconomicEvents } = await import('../knowledgebase/news/economicCalendar.js');
    const count = await refreshLiveEconomicCalendar(true);
    const calendar = getUpcomingEconomicEvents(symbol);
    res.json({ success: true, count, ...calendar });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Comprehensive symbol news and macro impact analysis
apiRouter.get('/knowledge/impact', async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbol = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const { analyzeSymbolNewsImpact } = await import('../knowledgebase/news/symbolImpact.js');
    const impact = await analyzeSymbolNewsImpact(symbol);
    res.json({ success: true, impact });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Market telemetry and velocity knowledge
apiRouter.get('/knowledge/telemetry', async (req, res) => {
  try {
    const { getAiKnowledge } = await import('../knowledgebase/knowledge.js');
    const knowledge = getAiKnowledge();
    const { dbGetTelemetryMetrics } = await import('../database/db.js');
    const recentMetrics = await dbGetTelemetryMetrics(undefined, 20);
    res.json({ success: true, knowledge, recentMetrics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Update market telemetry knowledge
apiRouter.post('/knowledge/telemetry', async (req, res) => {
  try {
    const { symbol, telemetry } = req.body;
    const sym = symbol || 'EURUSD';
    const { updateKnowledgeBaseFromTelemetry } = await import('../knowledgebase/knowledge.js');
    const result = updateKnowledgeBaseFromTelemetry(sym, telemetry || []);

    const { dbSaveTelemetryMetrics } = await import('../database/db.js');
    if (Array.isArray(telemetry)) {
      dbSaveTelemetryMetrics(
        telemetry.map((t: any) => ({
          symbol: sym,
          velocity: t.velocity,
          price: t.price || 0,
          timestamp: t.timestamp || Date.now(),
        }))
      ).catch((e) => console.error('DB save telemetry error:', e));
    }
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Observation insights and velocity statistics
apiRouter.get('/knowledge/insights', async (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || 'EURUSD';
    const { getObservationInsights } = await import('../knowledgebase/observations.js');
    const insights = getObservationInsights(symbol);
    res.json({ success: true, insights });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Built-in strategy templates
apiRouter.get('/knowledge/strategies/templates', async (req, res) => {
  try {
    const { BUILT_IN_STRATEGY_TEMPLATES } = await import('../knowledgebase/strategies/index.js');
    res.json({ success: true, templates: BUILT_IN_STRATEGY_TEMPLATES });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Rapid Sudden Movements & News Event Attribution
apiRouter.get(['/knowledge/rapid-shocks', '/knowledge/shocks'], async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbol = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const timeframe = (req.query.timeframe as string) || currentChart?.timeframe || 'M1';
    const { detectRapidMovementsAndAttribution, isSymbolInShockCoolingOff, getAllRegisteredShocks } = await import('../knowledgebase/news/rapidShockDetector.js');
    const shocks = await detectRapidMovementsAndAttribution(symbol, undefined, timeframe);
    const coolingStatus = isSymbolInShockCoolingOff(symbol);
    const allShocks = getAllRegisteredShocks();

    res.json({
      success: true,
      symbol,
      timeframe,
      shocks,
      coolingStatus,
      totalRegisteredShocks: allShocks.length,
      recentMarketShocks: allShocks.slice(0, 10),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// MT5 Chart Diagnostics & Terminal Telemetry
apiRouter.get('/knowledge/chart-diagnostics', async (_req, res) => {
  try {
    const diagnostics = tradeStore.getChartDiagnostics();
    const permissions = tradeStore.getTerminalPermissions();
    res.json({
      success: true,
      diagnostics,
      permissions,
      serverTime: Date.now(),
      serverTimeIso: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Terminal Metadata Endpoint — exposes EA-reported terminal identity & capabilities
// (terminalName, terminalCompany, terminalBuild, terminalPermissions, plus
// TERMINAL_MAXBARS / TERMINAL_DLLS_ALLOWED / TERMINAL_TRADEAPI_DISABLED when
// the EA reports them). Helps operators verify the EA is talking to genuine
// broker quotes and whether DLLs/tradeAPI are enabled.
apiRouter.get(['/terminal/metadata', '/api/terminal/metadata'], async (_req, res) => {
  try {
    const state = tradeStore.getState();
    const permissions = tradeStore.getTerminalPermissions();
    res.json({
      success: true,
      terminalName: state.connection.terminalName || '',
      terminalCompany: state.connection.terminalCompany || '',
      terminalBuild: state.connection.terminalBuild || 0,
      terminalPermissions: permissions || null,
      terminalMaxBars: permissions?.terminalMaxBars ?? null,
      terminalDllsAllowed: permissions?.terminalDllsAllowed ?? null,
      terminalTradeApiDisabled: permissions?.terminalTradeApiDisabled ?? null,
      terminalPingLast: permissions?.terminalPingLast ?? null,
      totalBrokerSymbols: permissions?.totalBrokerSymbols ?? null,
      marketWatchSymbolsCount: permissions?.marketWatchSymbolsCount ?? null,
      isEaConnected: state.connection.isEaConnected,
      serverTime: state.connection.serverTime || Date.now(),
      eaVersion: state.connection.eaVersion || '2.30',
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Multi-Timeframe Trend & Signal Concordance
apiRouter.get(['/bot/multitimeframe', '/knowledge/multi-timeframe'], async (req, res) => {
  try {
    const currentChart = tradeStore.getCurrentChart();
    const symbol = (req.query.symbol as string) || currentChart?.symbol || 'EURUSD';
    const timeframe = (req.query.timeframe as string) || currentChart?.timeframe || 'M1';
    const higherTfs = req.query.higherTimeframes ? String(req.query.higherTimeframes).split(',').map((s) => s.trim()) : undefined;

    const { evaluateMultiTimeframeConsensus } = await import('../knowledgebase/signals/multiTimeframe.js');
    const result = await evaluateMultiTimeframeConsensus(symbol, timeframe, higherTfs);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});


