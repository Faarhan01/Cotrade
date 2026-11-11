import { TradeSignal, generateTradeSignal } from '../core/tradeSignal.js';
import { tradeStore } from '../../services/tradeStore.js';
import { dbGetCandles, dbInsertBotSignal, dbGetStrategyById, dbGetStrategies } from '../../database/db.js';
import { evaluateMultiTimeframeConsensus } from './multiTimeframe.js';

export interface SignalWatcherConfig {
  symbols: string[];
  timeframe: string;
  higherTimeframes?: string[];
  multiTimeframeConsensus?: boolean;
  minConfidence: number;
  dataQualityFilter: 'LIVE' | 'ANY';
  activeStrategyId?: string;
}

export interface MonitoredSignal extends TradeSignal {
  id: string;
  actedOn: boolean;
  tradeId?: string;
  multiTimeframeAlignment?: 'ALIGNED' | 'CONFLICT' | 'NEUTRAL';
  higherTimeframeTrend?: string;
}

/**
 * SignalWatcher (KnowledgeBase Mind)
 * Continuously evaluates market data, technical indicators, candlestick/chart patterns,
 * market regimes, and macroeconomic news sentiment to formulate high-conviction trade signals.
 * The KnowledgeBase is the "Mind" that generates intelligent signals.
 * The Bot is the "Body" that performs the physical execution on MetaTrader 5.
 */
export class SignalWatcher {
  private config: SignalWatcherConfig;
  private lastSignals: Map<string, MonitoredSignal> = new Map();
  private signalCallbacks: Array<(signal: MonitoredSignal) => void> = [];

  constructor(config: SignalWatcherConfig) {
    this.config = { ...config };
  }

  public updateConfig(config: Partial<SignalWatcherConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): SignalWatcherConfig {
    return { ...this.config };
  }

  public onSignal(callback: (signal: MonitoredSignal) => void): void {
    this.signalCallbacks.push(callback);
  }

  public removeSignalListener(callback: (signal: MonitoredSignal) => void): void {
    this.signalCallbacks = this.signalCallbacks.filter((cb) => cb !== callback);
  }

  public async watchSymbol(symbol: string): Promise<MonitoredSignal | null> {
    try {
      const sym = symbol.toUpperCase().trim();
      const ticks = tradeStore.getTicks().filter((t: any) => t.symbol?.toUpperCase() === sym);
      const currentPrice = ticks.length > 0 ? ticks[0].bid : (tradeStore.getCurrentChart()?.bid || 0);
      if (currentPrice <= 0) return null;

      let candles = tradeStore.getChartHistory();
      if (!candles || candles.length < 20 || (tradeStore.getCurrentChart()?.symbol?.toUpperCase() !== sym)) {
        candles = await dbGetCandles(sym, this.config.timeframe, 200);
      }

      if (!candles || candles.length < 20) {
        candles = await dbGetCandles(sym, 'M1', 200);
      }
      if (!candles || candles.length < 20) {
        candles = await dbGetCandles(sym, 'M5', 200);
      }

      if (!candles || candles.length < 20) {
        // Fallback to in-memory chart history if available
        const inMem = tradeStore.getChartHistory();
        if (inMem && inMem.length >= 20 && tradeStore.getCurrentChart()?.symbol?.toUpperCase() === sym) {
          candles = inMem;
        } else {
          // If EA is connected, proactively request real candle history and fill gaps from MT5
          if (tradeStore.getState().connection.isEaConnected) {
            import('../../services/historySyncService.js').then(({ inspectAndFillChartGaps }) => {
              inspectAndFillChartGaps(sym, this.config.timeframe, 150).catch(() => {});
            }).catch(() => {
              tradeStore.requestHistoryFromEA(sym, this.config.timeframe, 100);
            });
          }
          return null;
        }
      }

      const dataQuality = tradeStore.getDataQuality();
      if (this.config.dataQualityFilter === 'LIVE' && (dataQuality === 'SYNTHETIC' || dataQuality === 'NONE')) return null;

      const baseSignal = await generateTradeSignal(
        sym,
        candles,
        currentPrice,
        tradeStore.getAccount().balance,
        dataQuality,
        this.config.timeframe,
        tradeStore.getAllSymbols().find((s) => s.symbol.toUpperCase() === sym.toUpperCase())
      );

      // Evaluate Multi-Timeframe Concordance
      let mtfAlignment: 'ALIGNED' | 'CONFLICT' | 'NEUTRAL' = 'NEUTRAL';
      let htfTrend = 'NEUTRAL';
      let finalDirection = baseSignal.direction;
      let finalConfidence = baseSignal.confidence;
      const reasons = [...baseSignal.reasons];
      const warnings = [...baseSignal.warnings];

      try {
        const mtf = await evaluateMultiTimeframeConsensus(sym, this.config.timeframe, this.config.higherTimeframes);
        htfTrend = mtf.higherTimeframeTrend;
        if (mtf.isAligned && finalDirection !== 'HOLD') {
          mtfAlignment = 'ALIGNED';
          finalConfidence = Math.min(98, finalConfidence + 8);
          reasons.push(`Higher Timeframe (${mtf.higherTimeframes.join('/')}) Concordance Confirmed: ${htfTrend}`);
        } else if (
          (finalDirection === 'BUY' && htfTrend === 'BEARISH') ||
          (finalDirection === 'SELL' && htfTrend === 'BULLISH')
        ) {
          mtfAlignment = 'CONFLICT';
          if (this.config.multiTimeframeConsensus !== false) {
            finalDirection = 'HOLD';
            finalConfidence = Math.max(30, finalConfidence - 20);
            warnings.push(`Counter-Trend Protected: Entry suppressed because higher timeframe (${mtf.higherTimeframes.join('/')}) is trending ${htfTrend.toLowerCase()}`);
          }
        }
      } catch (err) {
        console.warn(`[SignalWatcher] Multi-timeframe analysis notice for ${sym}:`, err);
      }

      // Evaluate Active KnowledgeBase Strategy Confluence
      try {
        let activeStrat: any = null;
        if (this.config.activeStrategyId) {
          activeStrat = await dbGetStrategyById(this.config.activeStrategyId);
        }
        if (!activeStrat) {
          const strats = await dbGetStrategies(sym);
          activeStrat = strats.find((s: any) => s.status === 'active' && s.symbol?.toUpperCase() === sym) || strats.find((s: any) => s.status === 'active') || null;
        }

        if (activeStrat) {
          const sType = activeStrat.type;
          const sParams = activeStrat.parameters || {};
          reasons.push(`Armed Knowledge Strategy: "${activeStrat.name}" [${sType}]`);

          if (sType === 'ORDER_BLOCK_CONFLUENCE') {
            if (baseSignal.components.institutionalBias || baseSignal.components.judasSwing) {
              finalConfidence = Math.min(99, finalConfidence + 12);
              reasons.push(`Institutional Order Block & FVG structure aligned with "${activeStrat.name}"`);
            }
          } else if (sType === 'RSI_REVERSAL') {
            const hasRsi = reasons.some((r) => r.toLowerCase().includes('rsi'));
            if (hasRsi) {
              finalConfidence = Math.min(99, finalConfidence + 10);
              reasons.push(`RSI threshold confirmed by strategy rule: ${sParams.rsiOversold || 30}/${sParams.rsiOverbought || 70}`);
            }
          } else if (sType === 'EMA_CROSSOVER') {
            const hasEma = reasons.some((r) => r.toLowerCase().includes('ema'));
            if (hasEma) {
              finalConfidence = Math.min(99, finalConfidence + 10);
              reasons.push(`EMA trend continuation aligned with "${activeStrat.name}"`);
            }
          } else if (sType === 'BREAKOUT_MOMENTUM') {
            if (baseSignal.components.regime?.includes('BREAKOUT') || baseSignal.components.regime?.includes('VOLATILITY')) {
              finalConfidence = Math.min(99, finalConfidence + 12);
              reasons.push(`Volatility expansion breakout confirmed by "${activeStrat.name}"`);
            }
          }
        }
      } catch (stratErr) {
        console.warn(`[SignalWatcher] Strategy evaluation notice for ${sym}:`, stratErr);
      }

      const monitoredSignal: MonitoredSignal = {
        ...baseSignal,
        id: `sig-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timeframe: this.config.timeframe,
        direction: finalDirection,
        confidence: finalConfidence,
        reasons,
        warnings,
        multiTimeframeAlignment: mtfAlignment,
        higherTimeframeTrend: htfTrend,
        actedOn: false,
      };

      // Persist signal to in-memory DB index
      dbInsertBotSignal({
        id: monitoredSignal.id,
        symbol: monitoredSignal.symbol,
        timeframe: monitoredSignal.timeframe,
        direction: monitoredSignal.direction,
        confidence: monitoredSignal.confidence,
        entryPrice: monitoredSignal.entryPrice,
        stopLoss: monitoredSignal.stopLoss,
        takeProfit: monitoredSignal.takeProfit,
        riskRewardRatio: monitoredSignal.riskRewardRatio,
        reasons: monitoredSignal.reasons,
        warnings: monitoredSignal.warnings,
        dataQuality: monitoredSignal.dataQuality,
        generatedAt: monitoredSignal.generatedAt,
        actedOn: monitoredSignal.actedOn,
      }).catch((e) => console.error('DB insert bot signal error:', e));

      this.lastSignals.set(sym, monitoredSignal);

      // Notify mind listeners (e.g., physical trade executors, UI streams, WebSocket broadcasts)
      for (const cb of this.signalCallbacks) {
        try {
          cb(monitoredSignal);
        } catch (err) {
          console.error('[SignalWatcher] Callback error:', err);
        }
      }

      return monitoredSignal;
    } catch (err) {
      console.error(`[SignalWatcher] Error evaluating ${symbol}:`, err);
      return null;
    }
  }

  public async watchAll(): Promise<MonitoredSignal[]> {
    const signals: MonitoredSignal[] = [];
    for (const symbol of this.config.symbols) {
      const signal = await this.watchSymbol(symbol);
      if (signal) signals.push(signal);
    }
    return signals;
  }

  public getLastSignal(symbol: string): MonitoredSignal | undefined {
    return this.lastSignals.get(symbol.toUpperCase().trim());
  }

  public getAllLastSignals(): MonitoredSignal[] {
    return Array.from(this.lastSignals.values());
  }
}
