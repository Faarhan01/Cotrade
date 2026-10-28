import { normalizeTimeframe } from '../../utils/timeframe.js';
import { normalizeSymbol } from '../../utils/symbol.js';
import { getDatabase, persistDatabase } from '../connection.js';
import { selectRows, safeLimit } from '../helpers.js';

function selectOne(db: any, query: string, params: any[] = []): any | null {
  const rows = selectRows(db, query, params);
  return rows.length > 0 ? rows[0] : null;
}

// ==========================================
// Strategies Knowledge Base CRUD
// ==========================================

export async function dbSaveStrategy(strategy: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO strategies (
      id, name, description, type, symbol, timeframe, parameters_json,
      status, tags_json, author, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    strategy.id,
    strategy.name,
    strategy.description || '',
    strategy.type,
    strategy.symbol.toUpperCase(),
    strategy.timeframe.toUpperCase(),
    JSON.stringify(strategy.parameters || {}),
    strategy.status || 'active',
    JSON.stringify(strategy.tags || []),
    strategy.author || 'User',
    strategy.notes || '',
    strategy.createdAt || Date.now(),
    Date.now(),
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbGetStrategies(symbol?: string): Promise<any[]> {
  const db = await getDatabase();
  const filterSymbol = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filterSymbol ? (symbol as string).trim().toUpperCase() : '';

  if (!filterSymbol) {
    const total = selectOne(db, 'SELECT COUNT(*) AS total FROM strategies');
    if (Number(total?.total || 0) === 0) {
      await seedDefaultStrategies();
    }
  }

  const rows = selectRows(
    db,
    `SELECT * FROM strategies ${filterSymbol ? 'WHERE symbol = ?' : ''} ORDER BY updated_at DESC`,
    filterSymbol ? [cleanSym] : []
  );

  return rows.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    symbol: item.symbol,
    timeframe: item.timeframe,
    parameters: item.parameters_json ? JSON.parse(item.parameters_json) : {},
    status: item.status,
    tags: item.tags_json ? JSON.parse(item.tags_json) : [],
    author: item.author,
    notes: item.notes,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

export async function dbGetStrategyById(id: string): Promise<any | null> {
  const db = await getDatabase();
  const item = selectOne(db, `SELECT * FROM strategies WHERE id = ? LIMIT 1`, [id]);
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    symbol: item.symbol,
    timeframe: item.timeframe,
    parameters: item.parameters_json ? JSON.parse(item.parameters_json) : {},
    status: item.status,
    tags: item.tags_json ? JSON.parse(item.tags_json) : [],
    author: item.author,
    notes: item.notes,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function dbDeleteStrategy(id: string): Promise<boolean> {
  const db = await getDatabase();
  db.run(`DELETE FROM strategies WHERE id = ?`, [id]);
  persistDatabase();
  return true;
}

async function seedDefaultStrategies() {
  const defaults = [
    {
      id: 'strat-rsi-reversal-eurusd',
      name: 'RSI Reversal Mean Reversion',
      description: 'Enters BUY when 14-period RSI drops below 30 (oversold) and SELL when RSI exceeds 70 (overbought). Optimal for oscillating range-bound FX pairs.',
      type: 'RSI_REVERSAL',
      symbol: 'EURUSD',
      timeframe: 'M1',
      parameters: {
        rsiOversold: 30,
        rsiOverbought: 70,
        rsiPeriod: 14,
        stopLossPoints: 250,
        takeProfitPoints: 500,
        lotSize: 0.1,
        maxHoldBars: 40,
      },
      status: 'active',
      tags: ['RSI', 'Oscillator', 'MeanReversion', 'Forex'],
      author: 'Cotrade Algorithmic Suite',
      notes: 'Best performed during London/New York session overlap with moderate volatility.',
      createdAt: Date.now() - 3600000 * 24,
      updatedAt: Date.now() - 3600000 * 24,
    },
    {
      id: 'strat-ema-trend-gold',
      name: 'EMA 9/21 Trend Scalper',
      description: 'Captures fast trend continuation when EMA 9 crosses above EMA 21 with price confirmation. Wide 2:1 profit ratio.',
      type: 'EMA_CROSSOVER',
      symbol: 'XAUUSD',
      timeframe: 'M5',
      parameters: {
        fastEmaPeriod: 9,
        slowEmaPeriod: 21,
        stopLossPoints: 400,
        takeProfitPoints: 800,
        lotSize: 0.05,
        maxHoldBars: 60,
      },
      status: 'active',
      tags: ['EMA', 'Trend', 'Gold', 'CrossOver'],
      author: 'Cotrade Algorithmic Suite',
      notes: 'Ensure gold spread is below 35 points before live execution.',
      createdAt: Date.now() - 3600000 * 12,
      updatedAt: Date.now() - 3600000 * 12,
    },
    {
      id: 'strat-consensus-multi-ind',
      name: 'Multi-Indicator Consensus Alpha',
      description: 'Requires synchronous alignment between RSI momentum, MACD histogram positive slope, and EMA trend bias before emitting trade signal.',
      type: 'MULTI_INDICATOR_CONSENSUS',
      symbol: 'EURUSD',
      timeframe: 'M1',
      parameters: {
        stopLossPoints: 300,
        takeProfitPoints: 600,
        lotSize: 0.1,
        maxHoldBars: 50,
      },
      status: 'active',
      tags: ['Consensus', 'RSI', 'MACD', 'EMA'],
      author: 'AI Quantitative Engine',
      notes: 'Produces high-conviction signals with lower frequency.',
      createdAt: Date.now() - 3600000 * 6,
      updatedAt: Date.now() - 3600000 * 6,
    },
  ];

  for (const s of defaults) {
    await dbSaveStrategy(s);
  }
}

// ==========================================
// Observations Knowledge Base CRUD
// ==========================================

export async function dbSaveObservation(obs: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO observations (
      id, title, content, symbol, timeframe, strategy_id, category,
      tags_json, metrics_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    obs.id,
    obs.title,
    obs.content,
    obs.symbol ? obs.symbol.toUpperCase() : null,
    obs.timeframe ? obs.timeframe.toUpperCase() : null,
    obs.strategyId || null,
    obs.category || 'market_insight',
    JSON.stringify(obs.tags || []),
    JSON.stringify(obs.metrics || {}),
    obs.createdAt || Date.now(),
    Date.now(),
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbGetObservations(category?: string): Promise<any[]> {
  const db = await getDatabase();
  const filterCategory = category && category !== 'all';

  if (!filterCategory) {
    const total = selectOne(db, 'SELECT COUNT(*) AS total FROM observations');
    if (Number(total?.total || 0) === 0) {
      await seedDefaultObservations();
    }
  }

  const rows = selectRows(
    db,
    `SELECT * FROM observations ${filterCategory ? 'WHERE category = ?' : ''} ORDER BY created_at DESC`,
    filterCategory ? [category] : []
  );

  return rows.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    symbol: item.symbol,
    timeframe: item.timeframe,
    strategyId: item.strategy_id,
    category: item.category,
    tags: item.tags_json ? JSON.parse(item.tags_json) : [],
    metrics: item.metrics_json ? JSON.parse(item.metrics_json) : {},
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

export async function dbDeleteObservation(id: string): Promise<boolean> {
  const db = await getDatabase();
  db.run(`DELETE FROM observations WHERE id = ?`, [id]);
  persistDatabase();
  return true;
}

async function seedDefaultObservations() {
  const defaults = [
    {
      id: 'obs-london-breakout',
      title: 'London Open Spread Expansion & False Breaks',
      content: 'Consistently observed that around 08:00 UTC (London open), EURUSD spread widens from 3 to 12 points for ~90 seconds. Breakout strategies entering immediately on the first M1 candle frequently encounter whipsaws. Waiting for 3 candles (08:03 UTC) filters out 68% of false breakouts.',
      symbol: 'EURUSD',
      timeframe: 'M1',
      category: 'market_insight',
      tags: ['LondonOpen', 'Spread', 'Liquidity', 'FalseBreak'],
      metrics: { avgSpreadExpansion: '8.4 points', winRateImprovement: '+14%' },
      createdAt: Date.now() - 3600000 * 18,
      updatedAt: Date.now() - 3600000 * 18,
    },
    {
      id: 'obs-gold-volatility-us-cpi',
      title: 'Gold (XAUUSD) M5 Momentum Persistence during US CPI',
      content: 'During major US CPI releases, Gold forms impulsive 40-60 point candles. Standard RSI triggers false overbought/oversold prematurely. Trend continuation with trailing stops in 150-point increments captures 2.4x more profit than fixed TP.',
      symbol: 'XAUUSD',
      timeframe: 'M5',
      category: 'pattern',
      tags: ['Gold', 'Macro', 'CPI', 'Volatility', 'TrailingStop'],
      metrics: { avgImpulsePoints: '52.3', trailingStopGain: '2.4x' },
      createdAt: Date.now() - 3600000 * 8,
      updatedAt: Date.now() - 3600000 * 8,
    },
  ];

  for (const o of defaults) {
    await dbSaveObservation(o);
  }
}

// ==========================================
// Backtest Results Storage CRUD
// ==========================================

export async function dbSaveBacktestResult(result: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO backtest_results (
      id, strategy_id, strategy_name, symbol, timeframe, candle_count,
      start_time, start_time_iso, end_time, end_time_iso, initial_deposit,
      final_equity, net_profit, profit_factor, win_rate_pct, total_trades,
      winning_trades, losing_trades, max_drawdown_pct, max_drawdown_usd,
      average_trade_profit, average_win, average_loss, risk_reward_ratio,
      trades_json, equity_curve_json, evaluated_at, data_quality,
      knowledge_assisted, news_filter_active, proof_summary, comparison_json,
      caught_news_json, trades_avoided_due_to_news, losses_prevented_usd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const dataQuality = result.dataQuality === 'SYNTHETIC' || result.dataQuality === 'NONE' ? result.dataQuality : 'LIVE';

  stmt.run([
    result.id,
    result.strategyId,
    result.strategyName,
    normalizeSymbol(result.symbol),
    normalizeTimeframe(result.timeframe) || 'M1',
    result.candleCount,
    result.startTime,
    result.startTimeIso || new Date(result.startTime * 1000).toISOString(),
    result.endTime,
    result.endTimeIso || new Date(result.endTime * 1000).toISOString(),
    result.initialDeposit,
    result.finalEquity,
    result.netProfit,
    result.profitFactor,
    result.winRatePct,
    result.totalTrades,
    result.winningTrades,
    result.losingTrades,
    result.maxDrawdownPct,
    result.maxDrawdownUsd,
    result.averageTradeProfit,
    result.averageWin,
    result.averageLoss,
    result.riskRewardRatio,
    JSON.stringify(result.trades || []),
    JSON.stringify(result.equityCurve || []),
    result.evaluatedAt || Date.now(),
    dataQuality,
    result.knowledgeAssisted ? 1 : 0,
    result.newsFilterActive ? 1 : 0,
    result.proofSummary || null,
    result.comparison ? JSON.stringify(result.comparison) : null,
    result.caughtNewsEvents ? JSON.stringify(result.caughtNewsEvents) : null,
    result.tradesAvoidedDueToNews || 0,
    result.lossesPreventedUsd || 0,
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbGetBacktestResults(strategyId?: string, limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const rows = selectRows(
    db,
    `SELECT * FROM backtest_results ${strategyId ? 'WHERE strategy_id = ?' : ''} ORDER BY evaluated_at DESC LIMIT ?`,
    strategyId ? [strategyId, safeLimit(limit, 50, 500)] : [safeLimit(limit, 50, 500)]
  );

  return rows.map((item) => ({
    id: item.id,
    strategyId: item.strategy_id,
    strategyName: item.strategy_name,
    symbol: item.symbol,
    timeframe: item.timeframe,
    candleCount: item.candle_count,
    startTime: item.start_time,
    startTimeIso: item.start_time_iso,
    endTime: item.end_time,
    endTimeIso: item.end_time_iso,
    initialDeposit: item.initial_deposit,
    finalEquity: item.final_equity,
    netProfit: item.net_profit,
    profitFactor: item.profit_factor,
    winRatePct: item.win_rate_pct,
    totalTrades: item.total_trades,
    winningTrades: item.winning_trades,
    losingTrades: item.losing_trades,
    maxDrawdownPct: item.max_drawdown_pct,
    maxDrawdownUsd: item.max_drawdown_usd,
    averageTradeProfit: item.average_trade_profit,
    averageWin: item.average_win,
    averageLoss: item.average_loss,
    riskRewardRatio: item.risk_reward_ratio,
    trades: item.trades_json ? JSON.parse(item.trades_json) : [],
    equityCurve: item.equity_curve_json ? JSON.parse(item.equity_curve_json) : [],
    evaluatedAt: item.evaluated_at,
    dataQuality: item.data_quality === 'SYNTHETIC' || item.data_quality === 'NONE' ? item.data_quality : 'LIVE',
    knowledgeAssisted: Boolean(item.knowledge_assisted),
    newsFilterActive: Boolean(item.news_filter_active),
    proofSummary: item.proof_summary || undefined,
    comparison: item.comparison_json ? JSON.parse(item.comparison_json) : undefined,
    caughtNewsEvents: item.caught_news_json ? JSON.parse(item.caught_news_json) : undefined,
    tradesAvoidedDueToNews: item.trades_avoided_due_to_news || 0,
    lossesPreventedUsd: item.losses_prevented_usd || 0,
  }));
}

export async function dbGetBacktestById(id: string): Promise<any | null> {
  const db = await getDatabase();
  const item = selectOne(db, `SELECT * FROM backtest_results WHERE id = ? LIMIT 1`, [id]);
  if (!item) return null;
  return {
    id: item.id,
    strategyId: item.strategy_id,
    strategyName: item.strategy_name,
    symbol: item.symbol,
    timeframe: item.timeframe,
    candleCount: item.candle_count,
    startTime: item.start_time,
    startTimeIso: item.start_time_iso,
    endTime: item.end_time,
    endTimeIso: item.end_time_iso,
    initialDeposit: item.initial_deposit,
    finalEquity: item.final_equity,
    netProfit: item.net_profit,
    profitFactor: item.profit_factor,
    winRatePct: item.win_rate_pct,
    totalTrades: item.total_trades,
    winningTrades: item.winning_trades,
    losingTrades: item.losing_trades,
    maxDrawdownPct: item.max_drawdown_pct,
    maxDrawdownUsd: item.max_drawdown_usd,
    averageTradeProfit: item.average_trade_profit,
    averageWin: item.average_win,
    averageLoss: item.average_loss,
    riskRewardRatio: item.risk_reward_ratio,
    trades: item.trades_json ? JSON.parse(item.trades_json) : [],
    equityCurve: item.equity_curve_json ? JSON.parse(item.equity_curve_json) : [],
    evaluatedAt: item.evaluated_at,
    dataQuality: item.data_quality === 'SYNTHETIC' || item.data_quality === 'NONE' ? item.data_quality : 'LIVE',
    knowledgeAssisted: Boolean(item.knowledge_assisted),
    newsFilterActive: Boolean(item.news_filter_active),
    proofSummary: item.proof_summary || undefined,
    comparison: item.comparison_json ? JSON.parse(item.comparison_json) : undefined,
    caughtNewsEvents: item.caught_news_json ? JSON.parse(item.caught_news_json) : undefined,
    tradesAvoidedDueToNews: item.trades_avoided_due_to_news || 0,
    lossesPreventedUsd: item.losses_prevented_usd || 0,
  };
}

// ==========================================
// Knowledge Base Telemetry Storage CRUD
// ==========================================

export async function dbSaveTelemetryMetric(metric: {
  id?: string;
  symbol: string;
  velocity: number;
  price?: number;
  direction?: string;
  timestamp?: number;
  tags?: string[];
}): Promise<void> {
  const db = await getDatabase();
  const id = metric.id || `tel-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const ts = metric.timestamp || Date.now();
  const d = new Date(ts);
  const hourKey = String(d.getUTCHours()).padStart(2, '0');
  const dir = metric.direction || (metric.velocity >= 0 ? 'up' : 'down');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_telemetry (
      id, symbol, velocity, price, direction, timestamp, hour_key, tags_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    id,
    metric.symbol.toUpperCase(),
    metric.velocity,
    metric.price || 0,
    dir,
    ts,
    hourKey,
    JSON.stringify(metric.tags || []),
    Date.now(),
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbSaveTelemetryMetrics(
  metrics: Array<{ symbol: string; velocity: number; price?: number; timestamp?: number; tags?: string[]; direction?: string }>
): Promise<void> {
  if (!metrics || metrics.length === 0) return;
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_telemetry (
      id, symbol, velocity, price, direction, timestamp, hour_key, tags_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.run('BEGIN IMMEDIATE');
  try {
    for (const metric of metrics) {
      const id = `tel-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const ts = metric.timestamp || Date.now();
      const d = new Date(ts);
      const hourKey = String(d.getUTCHours()).padStart(2, '0');
      const dir = metric.direction || (metric.velocity >= 0 ? 'up' : 'down');
      stmt.run([
        id,
        normalizeSymbol(metric.symbol),
        metric.velocity,
        metric.price || 0,
        dir,
        ts,
        hourKey,
        JSON.stringify(metric.tags || []),
        Date.now(),
      ]);
    }
    db.run('COMMIT');
  } catch (err) {
    try {
      db.run('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    stmt.free();
  }
  persistDatabase();
}

export async function dbGetTelemetryMetrics(symbol?: string, limit = 100): Promise<any[]> {
  const db = await getDatabase();
  const filterSymbol = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filterSymbol ? (symbol as string).trim().toUpperCase() : '';
  const rows = selectRows(
    db,
    `SELECT * FROM knowledge_telemetry ${filterSymbol ? 'WHERE symbol = ?' : ''} ORDER BY timestamp DESC LIMIT ?`,
    filterSymbol ? [cleanSym, safeLimit(limit)] : [safeLimit(limit)]
  );

  return rows.map((item) => ({
    id: item.id,
    symbol: item.symbol,
    velocity: item.velocity,
    price: item.price,
    direction: item.direction,
    timestamp: item.timestamp,
    hourKey: item.hour_key,
    tags: item.tags_json ? JSON.parse(item.tags_json) : [],
    createdAt: item.created_at,
  }));
}

// ==========================================
// Knowledge Base News Cache Storage CRUD
// ==========================================

export async function dbSaveNewsCache(items: any[]): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_news_cache (
      id, category, title, summary, source, sentiment, sentiment_score,
      impact, relevant_symbols_json, published_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const n of items) {
    stmt.run([
      n.id,
      n.category || 'MACRO',
      n.title,
      n.summary || '',
      n.source || 'Market Intelligence',
      n.sentiment || 'NEUTRAL',
      n.sentimentScore || 0,
      n.impact || 'MEDIUM',
      JSON.stringify(n.relevantSymbols || []),
      n.publishedAt || Date.now(),
      Date.now(),
    ]);
  }

  stmt.free();
  persistDatabase();
}

export async function dbGetCachedNews(symbol?: string, category?: string, limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const filterCategory = category && category !== 'ALL';
  const filterSymbol = symbol && symbol !== 'ALL';
  const clauses: string[] = [];
  const params: any[] = [];
  if (filterCategory) {
    clauses.push('category = ?');
    params.push(category);
  }
  if (filterSymbol) {
    clauses.push('relevant_symbols_json LIKE ?');
    params.push(`%${(symbol as string).trim().toUpperCase()}%`);
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  params.push(safeLimit(limit, 50, 500));

  const rows = selectRows(
    db,
    `SELECT * FROM knowledge_news_cache${where} ORDER BY published_at DESC LIMIT ?`,
    params
  );

  return rows.map((item) => ({
    id: item.id,
    category: item.category,
    title: item.title,
    summary: item.summary,
    source: item.source,
    sentiment: item.sentiment,
    sentimentScore: item.sentiment_score,
    impact: item.impact,
    relevantSymbols: item.relevant_symbols_json ? JSON.parse(item.relevant_symbols_json) : [],
    publishedAt: item.published_at,
    createdAt: item.created_at,
  }));
}

// ==========================================
// Economic Calendar Storage CRUD
// ==========================================

export async function dbSaveEconomicEvents(events: any[]): Promise<void> {
  if (!Array.isArray(events) || events.length === 0) return;
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO economic_calendar_events (
      id, title, country, currency, impact, scheduled_time, scheduled_time_iso,
      forecast, previous, actual, affected_symbols_json, description, category,
      data_quality, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const e of events) {
    stmt.run([
      e.id,
      e.title,
      e.country,
      e.currency,
      e.impact,
      e.scheduledTime,
      e.scheduledTimeIso || new Date(e.scheduledTime).toISOString(),
      e.forecast || '',
      e.previous || '',
      e.actual || '',
      JSON.stringify(e.affectedSymbols || []),
      e.description || '',
      e.category || 'MACRO',
      e.dataQuality || 'LIVE',
      Date.now(),
    ]);
  }

  stmt.free();
  persistDatabase();
}

export async function dbGetEconomicEvents(symbol?: string, limit = 100): Promise<any[]> {
  const db = await getDatabase();
  const clauses: string[] = [];
  const params: any[] = [];
  if (symbol && symbol !== 'ALL') {
    const sym = symbol.trim().toUpperCase();
    clauses.push('(affected_symbols_json LIKE ? OR currency = ?)');
    params.push(`%${sym}%`, sym.slice(0, 3));
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  params.push(safeLimit(limit, 100, 500));

  const rows = selectRows(
    db,
    `SELECT * FROM economic_calendar_events${where} ORDER BY scheduled_time ASC LIMIT ?`,
    params
  );

  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    country: r.country,
    currency: r.currency,
    impact: r.impact,
    scheduledTime: r.scheduled_time,
    scheduledTimeIso: r.scheduled_time_iso,
    forecast: r.forecast,
    previous: r.previous,
    actual: r.actual,
    affectedSymbols: r.affected_symbols_json ? JSON.parse(r.affected_symbols_json) : [],
    description: r.description,
    category: r.category,
    dataQuality: r.data_quality,
  }));
}

// ==========================================
// Symbol Regimes
// ==========================================

export async function dbSaveSymbolRegime(regime: any): Promise<void> {
  const db = await getDatabase();
  const id = `regime-${regime.symbol}-${Date.now()}`;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO symbol_regimes (
      id, symbol, regime, regime_label, trend_strength, volatility_state,
      tradeability_score, dominant_bias, support_price, resistance_price,
      pivot_point, tactics_json, detected_at, detected_at_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    id,
    regime.symbol,
    regime.regime,
    regime.regimeLabel || regime.regime,
    regime.trendStrength || 50,
    regime.volatilityState || 'NORMAL',
    regime.tradeabilityScore || 70,
    regime.dominantBias || 'NEUTRAL',
    regime.keySupport || 0,
    regime.keyResistance || 0,
    regime.pivotPoint || 0,
    JSON.stringify(regime.recommendedTactics || []),
    regime.detectedAt || Date.now(),
    new Date(regime.detectedAt || Date.now()).toISOString(),
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbGetSymbolRegimes(symbol?: string, limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const filterSymbol = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filterSymbol ? (symbol as string).trim().toLowerCase() : '';
  const rows = selectRows(
    db,
    `SELECT * FROM symbol_regimes ${filterSymbol ? 'WHERE LOWER(symbol) = ?' : ''} ORDER BY detected_at DESC LIMIT ?`,
    filterSymbol ? [cleanSym, safeLimit(limit, 50, 500)] : [safeLimit(limit, 50, 500)]
  );

  return rows.map((item) => ({
    id: item.id,
    symbol: item.symbol,
    regime: item.regime,
    regimeLabel: item.regime_label,
    trendStrength: item.trend_strength,
    volatilityState: item.volatility_state,
    tradeabilityScore: item.tradeability_score,
    dominantBias: item.dominant_bias,
    keySupport: item.support_price,
    keyResistance: item.resistance_price,
    pivotPoint: item.pivot_point,
    recommendedTactics: item.tactics_json ? JSON.parse(item.tactics_json) : [],
    detectedAt: item.detected_at,
    detectedAtIso: item.detected_at_iso,
  }));
}

// ==========================================
// Auto-Detect Symbol Profiles Persistence
// ==========================================

export async function dbSaveSymbolAutoDetectProfile(profile: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO symbol_auto_detect_profiles (
      symbol, asset_class, profile_json, liquidity_score, volatility_regime,
      safety_score, safety_grade, analyzed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  stmt.run([
    profile.symbol,
    profile.specs?.assetClass || profile.assetClass || 'OTHER',
    JSON.stringify(profile),
    profile.session?.liquidityScore ?? 70,
    profile.regime?.regime || profile.volatilityNoise?.volatilityState || 'NORMAL',
    profile.executionSafety?.safetyScore ?? 85,
    profile.executionSafety?.grade || 'A',
    profile.analyzedAt || now,
    now,
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbGetSymbolAutoDetectProfiles(limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const rows = selectRows(
    db,
    `
    SELECT symbol, asset_class, profile_json, liquidity_score, volatility_regime,
           safety_score, safety_grade, analyzed_at, updated_at
    FROM symbol_auto_detect_profiles
    ORDER BY updated_at DESC
    LIMIT ?
  `,
    [safeLimit(limit, 50, 500)]
  );

  return rows.map((item) => ({
    symbol: item.symbol,
    assetClass: item.asset_class,
    liquidityScore: item.liquidity_score,
    volatilityRegime: item.volatility_regime,
    safetyScore: item.safety_score,
    safetyGrade: item.safety_grade,
    profile: item.profile_json ? JSON.parse(item.profile_json) : null,
    analyzedAt: item.analyzed_at,
    updatedAt: item.updated_at,
  }));
}

export async function dbGetSymbolAutoDetectProfile(symbol: string): Promise<any | null> {
  const db = await getDatabase();
  const cleanSym = (symbol || '').trim();
  const item = selectOne(
    db,
    `
    SELECT profile_json FROM symbol_auto_detect_profiles
    WHERE symbol = ? OR LOWER(symbol) = ?
    LIMIT 1
  `,
    [cleanSym, cleanSym.toLowerCase()]
  );
  if (!item) return null;
  const raw = item.profile_json;
  return raw ? JSON.parse(String(raw)) : null;
}

// ==========================================
// Rapid Price Shocks & Attributions
// ==========================================

export async function dbInsertRapidShock(shock: any): Promise<void> {
  try {
    const db = await getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO rapid_shocks_history (
        id, symbol, timeframe, shock_type, reaction_type, severity, pip_displacement, pip_range,
        atr_multiplier, duration_seconds, pip_velocity, spread_points, spread_pips,
        cooling_off_minutes, news_id, catalyst_title, catalyst_source, catalyst_time_iso,
        catalyst_delta_sec, attribution_confidence, attribution_reasoning, tactical_directive,
        safe_to_trade, timestamp, timestamp_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      shock.id,
      normalizeSymbol(shock.symbol),
      shock.timeframe || 'M1',
      shock.shockType,
      shock.reactionType,
      shock.severity,
      shock.pipDisplacement,
      shock.pipRange,
      shock.volatilityAtrMultiplier,
      shock.durationSeconds,
      shock.pipVelocityPipsPerMinute,
      shock.spreadAtShockPoints,
      shock.spreadAtShockPips,
      shock.coolingOffMinutesRemaining,
      shock.attributedCatalyst?.id || null,
      shock.attributedCatalyst?.title || null,
      shock.attributedCatalyst?.sourceType || null,
      shock.attributedCatalyst?.scheduledOrPublishedTimeIso || null,
      shock.attributedCatalyst?.timeDeltaSeconds || null,
      shock.attributedCatalyst?.attributionConfidence || null,
      shock.attributedCatalyst?.attributionReasoning || null,
      shock.tacticalDirective || '',
      shock.safeToTrade ? 1 : 0,
      shock.timestamp,
      shock.timestampIso || new Date(shock.timestamp * 1000).toISOString(),
    ]);

    stmt.free();
    persistDatabase();
  } catch (err) {
    console.warn('[DB] Failed to persist rapid shock:', err);
  }
}

export async function dbGetRapidShocks(symbol?: string, limit = 50): Promise<any[]> {
  const db = await getDatabase();
  const filter = symbol && symbol.toUpperCase() !== 'ALL';
  const cleanSym = filter ? normalizeSymbol(symbol as string) : '';

  const rows = selectRows(
    db,
    `SELECT * FROM rapid_shocks_history
     ${filter ? 'WHERE UPPER(symbol) = ?' : ''}
     ORDER BY timestamp DESC
     LIMIT ?`,
    filter ? [cleanSym.toUpperCase(), safeLimit(limit, 50, 200)] : [safeLimit(limit, 50, 200)]
  );

  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    shockType: r.shock_type,
    reactionType: r.reaction_type,
    severity: r.severity,
    pipDisplacement: r.pip_displacement,
    pipRange: r.pip_range,
    volatilityAtrMultiplier: r.atr_multiplier,
    durationSeconds: r.duration_seconds,
    pipVelocityPipsPerMinute: r.pip_velocity,
    spreadAtShockPoints: r.spread_points,
    spreadAtShockPips: r.spread_pips,
    coolingOffMinutesRemaining: r.cooling_off_minutes,
    tacticalDirective: r.tactical_directive,
    safeToTrade: r.safe_to_trade === 1,
    timestamp: r.timestamp,
    timestampIso: r.timestamp_iso,
    attributedCatalyst: r.catalyst_title
      ? {
          id: r.news_id,
          title: r.catalyst_title,
          sourceType: r.catalyst_source,
          scheduledOrPublishedTimeIso: r.catalyst_time_iso,
          timeDeltaSeconds: r.catalyst_delta_sec,
          attributionConfidence: r.attribution_confidence,
          attributionReasoning: r.attribution_reasoning,
        }
      : null,
  }));
}

// ==========================================
// Knowledge Symbol Intelligence Persistence
// ==========================================

export async function dbSaveSymbolIntelligence(data: {
  symbol: string;
  assetClass: string;
  typicalSpread: number;
  spreadMin: number;
  spreadMax: number;
  spreadRolloverExpansion: number;
  atrM1: number;
  atrM15: number;
  atrH1: number;
  atrD1: number;
  optimalSessions: any;
  patternPerformance: any;
  keyLevels: any;
  bestTradingHours: any;
  summary: string;
  protectiveParameters?: any;
  volatilityState?: string;
}): Promise<void> {
  const db = await getDatabase();
  const cleanSym = normalizeSymbol(data.symbol);
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_symbol_intelligence (
      symbol, asset_class, typical_spread, spread_min, spread_max, spread_rollover_expansion,
      atr_m1, atr_m15, atr_h1, atr_d1, optimal_sessions_json, pattern_performance_json,
      key_levels_json, best_trading_hours_json, summary, protective_params_json, volatility_state, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    cleanSym,
    data.assetClass,
    data.typicalSpread,
    data.spreadMin,
    data.spreadMax,
    data.spreadRolloverExpansion,
    data.atrM1,
    data.atrM15,
    data.atrH1,
    data.atrD1,
    JSON.stringify(data.optimalSessions || []),
    JSON.stringify(data.patternPerformance || {}),
    JSON.stringify(data.keyLevels || {}),
    JSON.stringify(data.bestTradingHours || []),
    data.summary,
    JSON.stringify(data.protectiveParameters || null),
    data.volatilityState || 'NORMAL',
    Date.now(),
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbGetSymbolIntelligence(symbol: string): Promise<any | null> {
  const db = await getDatabase();
  const cleanSym = normalizeSymbol(symbol);
  const rows = selectRows(
    db,
    `SELECT * FROM knowledge_symbol_intelligence WHERE UPPER(symbol) = ?`,
    [cleanSym.toUpperCase()]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    symbol: r.symbol,
    assetClass: r.asset_class,
    typicalSpread: Number(r.typical_spread),
    spreadMin: Number(r.spread_min),
    spreadMax: Number(r.spread_max),
    spreadRolloverExpansion: Number(r.spread_rollover_expansion),
    atrM1: Number(r.atr_m1),
    atrM15: Number(r.atr_m15),
    atrH1: Number(r.atr_h1),
    atrD1: Number(r.atr_d1),
    optimalSessions: r.optimal_sessions_json ? JSON.parse(r.optimal_sessions_json) : [],
    patternPerformance: r.pattern_performance_json ? JSON.parse(r.pattern_performance_json) : {},
    keyLevels: r.key_levels_json ? JSON.parse(r.key_levels_json) : {},
    bestTradingHours: r.best_trading_hours_json ? JSON.parse(r.best_trading_hours_json) : [],
    summary: r.summary,
    protectiveParameters: r.protective_params_json ? JSON.parse(r.protective_params_json) : null,
    volatilityState: r.volatility_state || 'NORMAL',
    updatedAt: Number(r.updated_at),
  };
}

export async function dbGetAllSymbolIntelligences(): Promise<any[]> {
  const db = await getDatabase();
  const rows = selectRows(db, `SELECT * FROM knowledge_symbol_intelligence ORDER BY symbol ASC`);
  return rows.map((r) => ({
    symbol: r.symbol,
    assetClass: r.asset_class,
    typicalSpread: Number(r.typical_spread),
    spreadMin: Number(r.spread_min),
    spreadMax: Number(r.spread_max),
    spreadRolloverExpansion: Number(r.spread_rollover_expansion),
    atrM1: Number(r.atr_m1),
    atrM15: Number(r.atr_m15),
    atrH1: Number(r.atr_h1),
    atrD1: Number(r.atr_d1),
    optimalSessions: r.optimal_sessions_json ? JSON.parse(r.optimal_sessions_json) : [],
    patternPerformance: r.pattern_performance_json ? JSON.parse(r.pattern_performance_json) : {},
    keyLevels: r.key_levels_json ? JSON.parse(r.key_levels_json) : {},
    bestTradingHours: r.best_trading_hours_json ? JSON.parse(r.best_trading_hours_json) : [],
    summary: r.summary,
    updatedAt: Number(r.updated_at),
  }));
}

// ==========================================
// Global Knowledge Telemetry Aggregate Persistence
// ==========================================

export async function dbSaveKnowledgeTelemetryAggregate(data: {
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  timeOfDayPatterns: any;
}): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_telemetry_aggregate (
      id, total_observations, global_average_speed, peak_velocity_registered, time_of_day_patterns_json, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    data.totalObservations,
    data.globalAverageSpeed,
    data.peakVelocityRegistered,
    JSON.stringify(data.timeOfDayPatterns || {}),
    new Date().toISOString(),
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbGetKnowledgeTelemetryAggregate(): Promise<{
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  timeOfDayPatterns: any;
  updatedAt: string;
} | null> {
  const db = await getDatabase();
  const rows = selectRows(db, `SELECT * FROM knowledge_telemetry_aggregate WHERE id = 1`);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    totalObservations: Number(r.total_observations),
    globalAverageSpeed: Number(r.global_average_speed),
    peakVelocityRegistered: Number(r.peak_velocity_registered),
    timeOfDayPatterns: r.time_of_day_patterns_json ? JSON.parse(r.time_of_day_patterns_json) : {},
    updatedAt: String(r.updated_at),
  };
}
