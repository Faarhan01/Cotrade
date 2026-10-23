import { TradeSignal, generateTradeSignal } from '../core/tradeSignal.js';
import { tradeStore } from '../../services/tradeStore.js';
import { dbGetCandles, dbInsertBotSignal } from '../../database/db.js';
import { evaluateMultiTimeframeConsensus } from './multiTimeframe.js';

export interface SignalWatcherConfig {
  symbols: string[];
  timeframe: string;
  higherTimeframes?: string[];
  multiTimeframeConsensus?: boolean;
  minConfidence: number;
  dataQualityFilter: 'LIVE' | 'ANY';
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
        // Fallback to in-memory chart history if available
        const inMem = tradeStore.getChartHistory();
        if (inMem && inMem.length >= 20) {
          candles = inMem;
        } else {
          return null;
        }
      }

      const dataQuality = tradeStore.getDataQuality();
      if (this.config.dataQualityFilter === 'LIVE' && dataQuality === 'SYNTHETIC') return null;

      const baseSignal = await generateTradeSignal(
        sym,
        candles,
        currentPrice,
        tradeStore.getAccount().balance,
        dataQuality
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
