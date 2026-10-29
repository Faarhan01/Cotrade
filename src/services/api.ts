import { AppState, DetailedSymbolInfo, MCPToolDefinition, RiskGuardConfig, TradeCommand, SymbolIntelligenceProfile } from '../types';

export const api = {
  async getState(): Promise<AppState> {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Failed to fetch state');
    return res.json();
  },

  async getSymbols(): Promise<{ success: boolean; count: number; symbols: DetailedSymbolInfo[] }> {
    const res = await fetch('/api/symbols');
    if (!res.ok) throw new Error('Failed to fetch symbols');
    return res.json();
  },

  async sendCommand(command: {
    action: TradeCommand['action'];
    symbol?: string;
    orderType?: TradeCommand['orderType'];
    volume?: number;
    price?: number;
    sl?: number;
    tp?: number;
    ticket?: number;
    magic?: number;
    comment?: string;
    source?: TradeCommand['source'];
  }): Promise<{ success: boolean; commandId?: string; error?: string }> {
    const res = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`Command failed: ${res.status}`);
    return res.json();
  },

  async updateRisk(risk: Partial<RiskGuardConfig>): Promise<{ status: string; riskGuard: RiskGuardConfig }> {
    const res = await fetch('/api/risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(risk),
    });
    if (!res.ok) throw new Error(`Risk update failed: ${res.status}`);
    return res.json();
  },

  async toggleKillSwitch(active: boolean): Promise<{ status: string; emergencyKillSwitch: boolean }> {
    const res = await fetch('/api/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) throw new Error(`Kill switch toggle failed: ${res.status}`);
    return res.json();
  },

  async getMcpTools(): Promise<{ tools: MCPToolDefinition[] }> {
    const res = await fetch('/api/mcp/tools');
    if (!res.ok) throw new Error(`Failed to fetch MCP tools: ${res.status}`);
    return res.json();
  },

  async executeMcpTool(name: string, args: Record<string, any>): Promise<{ success: boolean; result?: any; error?: string }> {
    const res = await fetch(`/api/mcp/tools/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    return res.json();
  },

  async callMcpJsonRpc(body: any): Promise<any> {
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async getEaCode(): Promise<{ code: string }> {
    const res = await fetch('/api/ea/code');
    return res.json();
  },

  async checkBridgeHealth(url = '/health'): Promise<{ ok: boolean; data?: any; latencyMs: number }> {
    const start = performance.now();
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, latencyMs };
      }
      return { ok: false, latencyMs };
    } catch {
      return { ok: false, latencyMs: Math.round(performance.now() - start) };
    }
  },

  async simulateTick(symbol: string, bid?: number, ask?: number) {
    const res = await fetch('/api/simulate-tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, bid, ask }),
    });
    return res.json();
  },

  async getDatabaseAnalytics(): Promise<any> {
    const res = await fetch('/api/database/analytics');
    if (!res.ok) throw new Error('Failed to fetch database analytics');
    return res.json();
  },

  async getDatabaseOrders(limit = 100): Promise<{ orders: any[] }> {
    const res = await fetch(`/api/database/orders?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch database orders');
    return res.json();
  },

  async getTableRows(table: string, limit = 100): Promise<{ success: boolean; table: string; columns: string[]; rows: any[]; totalCount: number }> {
    const res = await fetch(`/api/database/tables/${encodeURIComponent(table)}?limit=${limit}`);
    if (!res.ok) throw new Error(`Failed to fetch table ${table}`);
    return res.json();
  },

  async clearTable(table: string): Promise<{ success: boolean; table: string; purgedCount: number }> {
    const res = await fetch(`/api/database/tables/${encodeURIComponent(table)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to clear table ${table}`);
    return res.json();
  },

  async pruneDatabase(): Promise<{ success: boolean; purgedUnexecutedOrders: number; message: string }> {
    const res = await fetch('/api/database/prune', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to prune database');
    return res.json();
  },

  // Strategies Knowledge Base
  async getStrategies(symbol?: string): Promise<{ strategies: any[] }> {
    const url = symbol ? `/api/strategies?symbol=${encodeURIComponent(symbol)}` : '/api/strategies';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch strategies');
    return res.json();
  },

  async saveStrategy(strategy: any): Promise<{ success: boolean; strategy: any }> {
    const res = await fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(strategy),
    });
    if (!res.ok) throw new Error('Failed to save strategy');
    return res.json();
  },

  async deleteStrategy(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/strategies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete strategy');
    return res.json();
  },

  async runBacktest(
    strategyId: string,
    options?: {
      candleLimit?: number;
      initialDeposit?: number;
      useKnowledgeTools?: boolean;
      enableNewsRiskFilter?: boolean;
      enableRegimeFilter?: boolean;
    }
  ): Promise<{ success: boolean; result: any }> {
    const res = await fetch(`/api/strategies/${encodeURIComponent(strategyId)}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) throw new Error('Failed to run backtest');
    return res.json();
  },

  async runKnowledgeBacktest(
    strategyId: string,
    options?: {
      candleLimit?: number;
      initialDeposit?: number;
      enableNewsRiskFilter?: boolean;
      enableNewsDirectionalFilter?: boolean;
      enableRegimeFilter?: boolean;
      newsHazardWindowBars?: number;
    }
  ): Promise<{ success: boolean; result: any }> {
    const res = await fetch(`/api/strategies/${encodeURIComponent(strategyId)}/knowledge-backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) throw new Error('Failed to run knowledge-assisted backtest');
    return res.json();
  },

  async runIsolatedBacktest(options: {
    strategyId?: string;
    strategyName?: string;
    strategyType: string;
    symbol: string;
    timeframe: string;
    candleCount?: number;
    parameters?: Record<string, any>;
    initialBalance?: number;
    riskMode?: 'FIXED_LOT' | 'RISK_PERCENT';
    fixedLotSize?: number;
    riskPercent?: number;
    spreadPoints?: number;
    slippagePoints?: number;
    commissionPerLot?: number;
    knowledgeAssisted?: boolean;
  }): Promise<{ success: boolean; result: any; error?: string }> {
    const res = await fetch('/api/backtest/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return res.json();
  },

  async getIsolatedBacktests(): Promise<{ success: boolean; count: number; results: any[] }> {
    const res = await fetch('/api/backtest/results');
    return res.json();
  },

  async getIsolatedBacktestById(id: string): Promise<{ success: boolean; result: any }> {
    const res = await fetch(`/api/backtest/results/${encodeURIComponent(id)}`);
    return res.json();
  },

  async getNewsImpactCorrelation(symbol?: string, timeframe?: string, limit = 200): Promise<any> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    params.append('limit', String(limit));
    const res = await fetch(`/api/knowledge/news/impact-detector?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to detect news impact on symbol');
    return res.json();
  },


  // Observations Knowledge Base
  async getObservations(category?: string): Promise<{ observations: any[] }> {
    const url = category && category !== 'all' ? `/api/observations?category=${encodeURIComponent(category)}` : '/api/observations';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch observations');
    return res.json();
  },

  async saveObservation(obs: any): Promise<{ success: boolean; observation: any }> {
    const res = await fetch('/api/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obs),
    });
    if (!res.ok) throw new Error('Failed to save observation');
    return res.json();
  },

  async deleteObservation(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/observations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete observation');
    return res.json();
  },

  // Backtest Results
  async getBacktestHistory(strategyId?: string): Promise<{ results: any[] }> {
    const url = strategyId ? `/api/backtests?strategyId=${encodeURIComponent(strategyId)}` : '/api/backtests';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch backtests');
    return res.json();
  },

  // Knowledge Base Intelligence Endpoints
  async getKnowledgeAutoDetect(symbol?: string): Promise<{ success: boolean; profile: any }> {
    const url = symbol ? `/api/knowledge/auto-detect?symbol=${encodeURIComponent(symbol)}` : '/api/knowledge/auto-detect';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch auto-detect profile');
    return res.json();
  },

  async getKnowledgePatterns(symbol?: string, timeframe?: string): Promise<{ success: boolean; patterns: any }> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    const res = await fetch(`/api/knowledge/patterns?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to scan patterns');
    return res.json();
  },

  async getKnowledgeIndicators(symbol?: string, timeframe?: string): Promise<{ success: boolean; indicators: any }> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    const res = await fetch(`/api/knowledge/indicators?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch indicators');
    return res.json();
  },

  async getKnowledgeNews(symbol?: string, category?: string): Promise<{ success: boolean; count: number; news: any[] }> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (category) params.append('category', category);
    const res = await fetch(`/api/knowledge/news?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch news');
    return res.json();
  },

  async getKnowledgeCalendar(symbol?: string): Promise<{ success: boolean; events: any[]; activeAlerts: string[] }> {
    const url = symbol ? `/api/knowledge/calendar?symbol=${encodeURIComponent(symbol)}` : '/api/knowledge/calendar';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch economic calendar');
    return res.json();
  },

  async refreshKnowledgeCalendar(symbol?: string): Promise<{ success: boolean; count: number; events?: any[]; activeAlerts?: string[] }> {
    const url = symbol ? `/api/economic-calendar/refresh?symbol=${encodeURIComponent(symbol)}` : '/api/economic-calendar/refresh';
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to refresh economic calendar');
    return res.json();
  },

  async getKnowledgeImpact(symbol?: string): Promise<{ success: boolean; impact?: any; error?: string }> {
    const url = symbol ? `/api/knowledge/impact?symbol=${encodeURIComponent(symbol)}` : '/api/knowledge/impact';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch symbol news impact');
    return res.json();
  },

  async getKnowledgeTelemetry(): Promise<{ success: boolean; knowledge: any; recentMetrics?: any[] }> {
    const res = await fetch('/api/knowledge/telemetry');
    if (!res.ok) throw new Error('Failed to fetch telemetry knowledge');
    return res.json();
  },

  async updateKnowledgeTelemetry(symbol: string, telemetry: any[]): Promise<{ success: boolean; result: any }> {
    const res = await fetch('/api/knowledge/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, telemetry }),
    });
    if (!res.ok) throw new Error('Failed to update telemetry');
    return res.json();
  },

  async getKnowledgeInsights(symbol?: string): Promise<{ success: boolean; insights: any }> {
    const url = symbol ? `/api/knowledge/insights?symbol=${encodeURIComponent(symbol)}` : '/api/knowledge/insights';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch observation insights');
    return res.json();
  },

  async getKnowledgeTemplates(): Promise<{ success: boolean; templates: any[] }> {
    const res = await fetch('/api/knowledge/strategies/templates');
    if (!res.ok) throw new Error('Failed to fetch strategy templates');
    return res.json();
  },

  // Chart History & Candlestick/Tick Stream
  async getChartHistory(
    symbol?: string,
    timeframe?: string,
    limit = 100,
    includeTicks = true,
    includeIndicators = true,
    from?: number,
    to?: number
  ): Promise<{
    success: boolean;
    symbol: string;
    timeframe: string;
    count: number;
    candles: any[];
    stats: any;
    gapDiagnosis?: any;
    indicators: any;
    tickMovements: any[];
    tickStats: any;
  }> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    params.append('limit', String(limit));
    params.append('includeTicks', String(includeTicks));
    params.append('includeIndicators', String(includeIndicators));
    if (from !== undefined) params.append('from', String(from));
    if (to !== undefined) params.append('to', String(to));

    const res = await fetch(`/api/chart/history?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch chart history');
    return res.json();
  },

  async getChartGapStatus(symbol?: string, timeframe?: string): Promise<any> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    const res = await fetch(`/api/chart/gap-status?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch chart gap status');
    return res.json();
  },

  async pullChartHistory(
    symbol: string,
    timeframe = 'M1',
    count = 100,
    from?: number,
    to?: number
  ): Promise<{ success: boolean; commandId: string; message: string }> {
    const res = await fetch('/api/chart/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, timeframe, count, from, to }),
    });
    if (!res.ok) throw new Error('Failed to trigger chart history pull');
    return res.json();
  },

  // Extended Auto-Detection Suite
  async runKnowledgeAutoDetect(symbol?: string): Promise<{ success: boolean; analysis: any }> {
    const res = await fetch('/api/knowledge/auto-detect/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    if (!res.ok) throw new Error('Failed to run auto-detection analysis');
    return res.json();
  },

  async getSavedAutoDetectProfiles(limit = 50): Promise<{ success: boolean; count: number; profiles: any[] }> {
    const res = await fetch(`/api/knowledge/auto-detect/all?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch saved auto-detect profiles');
    return res.json();
  },

  async getKnowledgeMicrostructure(symbol?: string): Promise<{ success: boolean; microstructure: any }> {
    const url = symbol ? `/api/knowledge/auto-detect/microstructure?symbol=${encodeURIComponent(symbol)}` : '/api/knowledge/auto-detect/microstructure';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch symbol microstructure');
    return res.json();
  },

  async getKnowledgeVolatility(symbol?: string, timeframe?: string): Promise<{ success: boolean; volatility: any }> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    const res = await fetch(`/api/knowledge/auto-detect/volatility?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch volatility profile');
    return res.json();
  },

  async getKnowledgeLevels(symbol?: string, timeframe?: string): Promise<{ success: boolean; levels: any }> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    const res = await fetch(`/api/knowledge/auto-detect/levels?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch support/resistance levels');
    return res.json();
  },

  async getKnowledgeSafety(symbol?: string): Promise<{ success: boolean; safety: any }> {
    const url = symbol ? `/api/knowledge/auto-detect/safety?symbol=${encodeURIComponent(symbol)}` : '/api/knowledge/auto-detect/safety';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch execution safety score');
    return res.json();
  },

  async getKnowledgeScalping(symbol?: string): Promise<{ success: boolean; scalping: any }> {
    const url = symbol ? `/api/knowledge/auto-detect/scalping?symbol=${encodeURIComponent(symbol)}` : '/api/knowledge/auto-detect/scalping';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch scalping profile');
    return res.json();
  },

  async getKnowledgeFullAnalysis(symbol?: string): Promise<{ success: boolean; analysis: any }> {
    const url = symbol ? `/api/knowledge/full-analysis?symbol=${encodeURIComponent(symbol)}` : '/api/knowledge/full-analysis';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch full analysis');
    return res.json();
  },

  // Trade Signal & Position Sizing
  async generateTradeSignal(symbol?: string): Promise<{ success: boolean; signal: any }> {
    const res = await fetch('/api/trade/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    if (!res.ok) throw new Error('Failed to generate trade signal');
    return res.json();
  },

  async calculatePositionSize(params: {
    symbol?: string;
    entryPrice: number;
    stopLossPrice: number;
    riskPercent?: number;
    accountBalance?: number;
    contractSize?: number;
  }): Promise<{ success: boolean; positionSize: any }> {
    const res = await fetch('/api/trade/position-size', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Failed to calculate position size');
    return res.json();
  },

  // Trading Bot
  async getBotStatus(): Promise<any> {
    const res = await fetch('/api/bot/status');
    if (!res.ok) throw new Error('Failed to fetch bot status');
    return res.json();
  },
  async startBot(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/bot/start', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start bot');
    return res.json();
  },
  async stopBot(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/bot/stop', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to stop bot');
    return res.json();
  },
  async updateBotConfig(config: any): Promise<{ success: boolean; message: string; state: any }> {
    const res = await fetch('/api/bot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Failed to update bot config');
    return res.json();
  },
  async getBotTrades(limit = 50): Promise<{ success: boolean; trades: any[] }> {
    const res = await fetch(`/api/bot/trades?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch bot trades');
    return res.json();
  },
  async getBotSignals(limit = 50): Promise<{ success: boolean; signals: any[] }> {
    const res = await fetch(`/api/bot/signals?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch bot signals');
    return res.json();
  },

  async getRapidShocks(symbol?: string, timeframe?: string): Promise<any> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    const res = await fetch(`/api/knowledge/rapid-shocks?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch rapid shocks');
    return res.json();
  },

  async getChartDiagnostics(): Promise<any> {
    const res = await fetch('/api/knowledge/chart-diagnostics');
    if (!res.ok) throw new Error('Failed to fetch chart diagnostics');
    return res.json();
  },

  async getMultiTimeframeConsensus(symbol?: string, timeframe?: string, higherTimeframes?: string[]): Promise<any> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    if (higherTimeframes && higherTimeframes.length > 0) params.append('higherTimeframes', higherTimeframes.join(','));
    const res = await fetch(`/api/bot/multitimeframe?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to evaluate multi-timeframe consensus');
    return res.json();
  },

  async evaluateBotNow(): Promise<{ success: boolean; evaluated: number; signals: any[] }> {
    const res = await fetch('/api/bot/evaluate', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger bot evaluation');
    return res.json();
  },

  async updateBotMode(mode: string): Promise<{ success: boolean; mode: string; state: any }> {
    const res = await fetch('/api/bot/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) throw new Error('Failed to update bot mode');
    return res.json();
  },

  async getKnowledgeImbalances(symbol?: string, timeframe?: string): Promise<{ success: boolean; imbalances: any }> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    const res = await fetch(`/api/knowledge/imbalances?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch institutional imbalances');
    return res.json();
  },

  async getKnowledgeSessionOrderFlow(symbol?: string, timeframe?: string): Promise<{ success: boolean; sessionOrderFlow: any }> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (timeframe) params.append('timeframe', timeframe);
    const res = await fetch(`/api/knowledge/session-order-flow?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch session order flow');
    return res.json();
  },

  async protectPosition(ticket: number): Promise<{ success: boolean; message?: string; commandId?: string }> {
    const res = await fetch('/api/position/protect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    if (!res.ok) throw new Error(`Failed to protect position #${ticket}`);
    return res.json();
  },

  async trackSymbol(symbol: string): Promise<{ success: boolean; message?: string; symbol: string }> {
    const res = await fetch('/api/symbols/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    if (!res.ok) throw new Error(`Failed to track symbol ${symbol}`);
    return res.json();
  },

  async getSymbolIntelligence(symbol: string): Promise<{ success: boolean; intelligence: SymbolIntelligenceProfile }> {
    const res = await fetch(`/api/knowledge/symbol-intelligence/${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error(`Failed to fetch intelligence for ${symbol}`);
    return res.json();
  },

  async getAllSymbolIntelligences(): Promise<{ success: boolean; count: number; intelligences: Record<string, SymbolIntelligenceProfile> }> {
    const res = await fetch('/api/knowledge/symbol-intelligence');
    if (!res.ok) throw new Error('Failed to fetch symbol intelligences');
    return res.json();
  },

  async getTicksHistory(symbol?: string, from?: number, to?: number, limit = 500): Promise<{ success: boolean; count: number; ticks: any[] }> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (from !== undefined) params.append('from', from.toString());
    if (to !== undefined) params.append('to', to.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    const res = await fetch(`/api/ticks/history?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch ticks history');
    return res.json();
  },
};
