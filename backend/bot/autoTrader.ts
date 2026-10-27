import { BotConfig, BotState, BotSignal, DEFAULT_BOT_CONFIG } from './types.js';
import { getBotConfig, setBotConfig, validateBotConfig, loadBotConfigFromDb } from './config.js';
import { SignalWatcher } from '../knowledgebase/signals/signalWatcher.js';
import { TradeExecutor } from './tradeExecutor.js';
import { tradeStore } from '../services/tradeStore.js';
import { broadcast } from '../services/websocketServer.js';

export class TradingBot {
  private config: BotConfig;
  private signalWatcher: SignalWatcher;
  private tradeExecutor: TradeExecutor;
  private state: BotState;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<BotConfig> = {}) {
    this.config = { ...DEFAULT_BOT_CONFIG, ...config };
    this.signalWatcher = new SignalWatcher({
      symbols: this.config.symbols,
      timeframe: this.config.timeframe,
      higherTimeframes: this.config.higherTimeframes,
      multiTimeframeConsensus: this.config.multiTimeframeConsensus,
      minConfidence: this.config.minConfidence,
      dataQualityFilter: this.config.dataQualityFilter,
    });
    this.tradeExecutor = new TradeExecutor(this.config);

    this.state = {
      config: { ...this.config },
      lastRunAt: null,
      lastSignal: null,
      lastTradeAt: {},
      tradesExecuted: 0,
      signalsGenerated: 0,
      errors: [],
      running: false,
      totalProfit: 0,
      winRate: 0,
      activeTrades: 0,
    };

    // Listen for new signals
    this.signalWatcher.onSignal((signal) => {
      this.state.signalsGenerated++;
      this.state.lastSignal = signal;

      // Auto-execute if confidence meets threshold and not HOLD
      if (signal.direction !== 'HOLD' && signal.confidence >= this.config.minConfidence) {
        this.executeSignal(signal);
      }
    });
  }

  public async initialize(): Promise<void> {
    await loadBotConfigFromDb();
    this.config = getBotConfig();
    await this.tradeExecutor.hydrateTradesFromDb();
    const stats = this.tradeExecutor.getStats();
    this.state.tradesExecuted = stats.totalTrades;
    this.signalWatcher.updateConfig({
      symbols: this.config.symbols,
      timeframe: this.config.timeframe,
      higherTimeframes: this.config.higherTimeframes,
      multiTimeframeConsensus: this.config.multiTimeframeConsensus,
      minConfidence: this.config.minConfidence,
      dataQualityFilter: this.config.dataQualityFilter,
    });
    this.tradeExecutor.updateConfig(this.config);
    this.state.config = { ...this.config };
  }

  public start(): { success: boolean; message: string } {
    if (this.isRunning) {
      return { success: false, message: 'Bot is already running' };
    }

    const validation = validateBotConfig(this.config);
    if (!validation.valid) {
      return { success: false, message: validation.errors.join(', ') };
    }

    this.config.enabled = true;
    this.isRunning = true;
    this.state.running = true;
    this.state.errors = [];

    this.runCycle();
    this.intervalId = setInterval(() => this.runCycle(), 15000);

    tradeStore.addLog('info', 'Trading Bot Started', `Auto-trading enabled for ${this.config.symbols.join(', ')} [${this.config.timeframe}] (MTF: ${this.config.multiTimeframeConsensus ? 'ON' : 'OFF'})`, 'BOT');
    broadcast({ type: 'bot:status', payload: this.getState() });

    return { success: true, message: `Trading bot started on ${this.config.timeframe}` };
  }

  public stop(): { success: boolean; message: string } {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.state.running = false;
    this.config.enabled = false;

    tradeStore.addLog('info', 'Trading Bot Stopped', 'Auto-trading disabled', 'BOT');
    broadcast({ type: 'bot:status', payload: { running: false } });

    return { success: true, message: 'Trading bot stopped' };
  }

  public getState(): BotState {
    const stats = this.tradeExecutor.getStats();
    return {
      ...this.state,
      config: { ...this.config },
      totalProfit: stats.totalProfit,
      winRate: stats.winRate,
      activeTrades: stats.activeTrades,
    };
  }

  public updateConfig(updates: Partial<BotConfig>): { success: boolean; message: string } {
    const validation = validateBotConfig(updates);
    if (!validation.valid) {
      return { success: false, message: validation.errors.join(', ') };
    }

    const wasRunning = this.isRunning;
    if (wasRunning) this.stop();

    // If mode changed without explicit timeframe, adopt mode target timeframe
    if (updates.mode && !updates.timeframe) {
      if (updates.mode === 'SCALPER') updates.timeframe = updates.scalperSettings?.targetTimeframe || 'M1';
      else if (updates.mode === 'DAY_TRADES') updates.timeframe = updates.dayTradeSettings?.targetTimeframe || 'M15';
      else if (updates.mode === 'SWING_TRADES') updates.timeframe = updates.swingTradeSettings?.targetTimeframe || 'H1';
    }

    this.config = { ...this.config, ...updates };
    setBotConfig(updates);
    this.signalWatcher.updateConfig({
      symbols: this.config.symbols,
      timeframe: this.config.timeframe,
      higherTimeframes: this.config.higherTimeframes,
      multiTimeframeConsensus: this.config.multiTimeframeConsensus,
      minConfidence: this.config.minConfidence,
      dataQualityFilter: this.config.dataQualityFilter,
    });
    this.tradeExecutor.updateConfig(this.config);
    this.state.config = { ...this.config };

    if (wasRunning && this.config.enabled) this.start();

    return { success: true, message: `Bot config updated (Mode: ${this.config.mode})` };
  }

  public async evaluateNow(): Promise<{ evaluated: number; signals: BotSignal[] }> {
    const signals = await this.signalWatcher.watchAll();
    this.state.lastRunAt = Date.now();
    tradeStore.addLog(
      'info',
      'Manual Bot Strategy Scan Triggered',
      `Evaluated ${this.config.symbols.length} symbols [${this.config.timeframe}]. Formulated ${signals.length} market signal(s).`,
      'BOT'
    );
    return {
      evaluated: this.config.symbols.length,
      signals,
    };
  }

  private async runCycle(): Promise<void> {
    if (!this.config.enabled) return;

    this.state.lastRunAt = Date.now();
    const account = tradeStore.getAccount();
    const positions = tradeStore.getPositions();

    if (positions.length >= this.config.maxOpenPositions) return;

    const signals = await this.signalWatcher.watchAll();

    const modeCooldown = this.config.mode === 'SCALPER'
      ? (this.config.scalperSettings?.cooldownMs || 60000)
      : this.config.mode === 'SWING_TRADES'
      ? (this.config.swingTradeSettings?.cooldownMs || 1800000)
      : this.config.cooldownMs;

    for (const signal of signals) {
      if (signal.direction !== 'HOLD' && signal.confidence >= this.config.minConfidence) {
        const lastTrade = this.state.lastTradeAt[signal.symbol] || 0;
        if (Date.now() - lastTrade < modeCooldown) continue;

        const existingOnSymbol = positions.filter((p: any) => p.symbol === signal.symbol);
        if (existingOnSymbol.length >= this.config.maxTradesPerSymbol) continue;

        await this.executeSignal(signal);
      }
    }
  }

  private async executeSignal(signal: BotSignal): Promise<void> {
    // If news risk filter is active, check for imminent or current high-impact macro catalysts
    if (this.config.newsRiskFilter) {
      try {
        const { getUpcomingEconomicEvents } = await import('../knowledgebase/news/economicCalendar.js');
        const calendar = getUpcomingEconomicEvents(signal.symbol);
        const now = Date.now();
        const imminentHighImpact = (calendar.events || []).find((evt) => {
          if (evt.impact !== 'HIGH') return false;
          const diffMins = Math.round((evt.scheduledTime - now) / (60 * 1000));
          return diffMins >= -15 && diffMins <= 30;
        });

        if (imminentHighImpact) {
          tradeStore.addLog(
            'warn',
            `Bot News Guard: Held ${signal.direction} ${signal.symbol}`,
            `Execution suppressed due to imminent high-impact catalyst: "${imminentHighImpact.title}" (${imminentHighImpact.currency}). Avoided spread spike.`,
            'BOT'
          );
          return;
        }
      } catch (err) {
        console.warn('[TradingBot] News guard check error:', err);
      }
    }

    // If shock protection filter is active, check for recent rapid sudden movement or whipsaw shock
    if (this.config.shockProtectionFilter !== false) {
      try {
        const { isSymbolInShockCoolingOff } = await import('../knowledgebase/news/rapidShockDetector.js');
        const shockStatus = isSymbolInShockCoolingOff(signal.symbol);
        if (shockStatus.inShock) {
          tradeStore.addLog(
            'warn',
            `Bot Shock Shield: Held ${signal.direction} ${signal.symbol}`,
            `Execution suppressed: Rapid price movement or whipsaw detected. ${shockStatus.reason || 'Cooling off to protect against post-shock spread blowout.'}`,
            'BOT'
          );
          return;
        }
      } catch (err) {
        console.warn('[TradingBot] Shock shield check error:', err);
      }
    }

    const trade = await this.tradeExecutor.executeSignal(signal);
    if (trade) {
      this.state.tradesExecuted++;
      this.state.lastTradeAt[signal.symbol] = Date.now();

      tradeStore.addLog(
        'trade',
        `Bot Auto-Trade: ${signal.direction} ${signal.symbol}`,
        `Confidence: ${signal.confidence}% | Lots: ${trade.volume} | SL: ${signal.stopLoss} | TP: ${signal.takeProfit} | RR: ${signal.riskRewardRatio}`,
        'BOT'
      );

      broadcast({
        type: 'bot:trade',
        payload: { symbol: signal.symbol, direction: signal.direction, signal, trade },
      });
    }
  }


  public handleExecutionResult(cmd: any, res: any): void {
    this.tradeExecutor.handleExecutionResult(cmd.id, res);
    const trade = this.tradeExecutor.getTrades().find((t) => t.commandId === cmd.id);
    if (trade) {
      broadcast({
        type: 'bot:trade_update',
        payload: { trade, result: res },
      });
    }
  }

  public reconcilePositions(openPositions: any[]): void {
    if (!Array.isArray(openPositions)) return;
    const openTickets = new Set(openPositions.map((p) => p.ticket));
    const trades = this.tradeExecutor.getTrades();
    for (const trade of trades) {
      const ticket = trade.ticket;
      if (trade.status === 'EXECUTED' && ticket && !trade.closedAt) {
        if (!openTickets.has(ticket)) {
          this.tradeExecutor.closeTrade(trade.id);
          broadcast({
            type: 'bot:trade_closed',
            payload: { trade },
          });
        }
      }
    }
  }

  public reconcileDeals(closedDeals: any[]): void {
    if (!Array.isArray(closedDeals) || closedDeals.length === 0) return;
    this.tradeExecutor.reconcileDeals(closedDeals);
    broadcast({
      type: 'bot:status',
      payload: this.getState(),
    });
  }

  public getTrades(): any[] {
    return this.tradeExecutor.getTrades();
  }

  public getActiveTrades(): any[] {
    return this.tradeExecutor.getActiveTrades();
  }

  public getStats(): any {
    return this.tradeExecutor.getStats();
  }
}

export const tradingBot = new TradingBot();
export { getBotConfig, setBotConfig, validateBotConfig } from './config.js';
export { SignalWatcher } from '../knowledgebase/signals/signalWatcher.js';
export { TradeExecutor } from './tradeExecutor.js';
export * from './types.js';
