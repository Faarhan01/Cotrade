import {
  AccountInfo,
  CandleData,
  ChartSymbolInfo,
  CommandStatus,
  DetailedSymbolInfo,
  EASyncPayload,
  ExecutionLog,
  MarketDepthItem,
  MT5ChartDiagnostics,
  MT5TerminalPermissions,
  PendingOrder,
  Position,
  RiskGuardConfig,
  TechnicalIndicatorsResult,
  TickData,
  TradeCommand,
} from '../types/mt5.js';
import {
  getDatabase,
  dbInsertOrder,
  dbInsertLog,
  dbSaveRiskSettings,
  dbGetRiskSettings,
  dbGetOrders,
  dbGetAnalytics,
  dbInsertAccountSnapshot,
  dbInsertCandles,
  dbInsertTicks,
  dbGetCandles,
  dbGetTicksHistory,
  dbGetAccountHistory,
  pruneDatabase,
} from '../database/db.js';
import { calculateIndicators } from './indicatorEngine.js';
import { normalizeTimeframe } from '../utils/timeframe.js';
import { normalizeSymbol } from '../utils/symbol.js';
import { updateKnowledgeBaseFromTelemetry } from '../knowledgebase/knowledge.js';

/** How long a `dispatched` command may stay unresolved before it is reaped. */
const DISPATCH_REAP_MS = 5 * 60 * 1000;

/** Persisted risk-guard fields. Anything absent from the DB keeps its default. */
const PERSISTED_RISK_FIELDS = [
  'globalTakeProfitUSD',
  'globalStopLossUSD',
  'maxDrawdownPercent',
  'emergencyKillSwitch',
  'trailingStopEnabled',
  'trailingStopDistancePoints',
  'trailingStopStepPoints',
  'maxLotSizePerTrade',
  'maxOpenPositions',
  'autoCloseOnMarginLevelBelow',
  'allowedSymbols',
] as const;

class TradeStore {
  private account: AccountInfo = {
    login: 0,
    tradeMode: 'PENDING_MT5',
    balance: 0,
    equity: 0,
    margin: 0,
    freeMargin: 0,
    marginLevel: 0,
    leverage: 0,
    currency: 'USD',
    server: 'Awaiting MT5 EA Connection',
    company: 'MetaTrader 5',
    profit: 0,
    lastUpdate: 0,
  };

  // Open positions received purely from real MT5 EA (NO fake simulated positions)
  private positions: Map<number, Position> = new Map();

  private ticks: Map<string, TickData> = new Map();

  private commandQueue: TradeCommand[] = [];
  private logs: ExecutionLog[] = [
    {
      id: 'log-init-1',
      timestamp: Date.now(),
      level: 'info',
      title: 'MT5 Bridge Hub Initialized',
      details: 'Bridge endpoint listening at http://127.0.0.1:7777 and MCP endpoint at /api/mcp. Awaiting MetaTrader 5 EA connection.',
      source: 'SYSTEM',
    },
  ];

  private riskGuard: RiskGuardConfig = {
    globalTakeProfitUSD: 1500,
    globalStopLossUSD: 800,
    maxDrawdownPercent: 5.0,
    emergencyKillSwitch: false,
    trailingStopEnabled: true,
    trailingStopDistancePoints: 150,
    trailingStopStepPoints: 30,
    maxLotSizePerTrade: 2.0,
    maxOpenPositions: 5,
    allowedSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'AUDUSD'],
    autoCloseOnMarginLevelBelow: 100, // 100% margin call safety
  };

  /**
   * Risk-guard breaches latch here so the same breach does not enqueue one
   * `CLOSE_ALL` per EA sync. Without a latch a single stop-out produced a new
   * close-all command every 500 ms until the position was actually gone.
   */
  private riskBreachLatch: { tp: boolean; sl: boolean; drawdown: boolean; margin: boolean } = {
    tp: false,
    sl: false,
    drawdown: false,
    margin: false,
  };

  /** Baseline equity used for the max-drawdown rule. */
  private peakEquity: number = 0;

  /** Set when the app is serving synthetic bars rather than EA-provided ones. */
  private syntheticDataActive: boolean = false;

  private eaConnected: boolean = false;
  private lastEaSync: number = 0;
  private eaVersion: string = '2.10';
  private mt5ServerTime: number = 0;
  private terminalName: string = '';
  private terminalCompany: string = '';
  private terminalBuild: number = 0;
  private currentChart: ChartSymbolInfo | null = null;
  private terminalPermissions: MT5TerminalPermissions | null = null;
  private allSymbols: DetailedSymbolInfo[] = [];
  private chartHistory: CandleData[] = [];
  private pendingOrders: Map<number, PendingOrder> = new Map();
  private marketDepth: Record<string, { bids: MarketDepthItem[]; asks: MarketDepthItem[] }> = {};
  private indicators: TechnicalIndicatorsResult | null = null;

  // Track tick movement history for charts (populated by live MT5 tick updates)
  private tickHistory: Map<string, { time: number; bid: number; ask: number }[]> = new Map();

  constructor() {
    // Initialize SQLite Database asynchronously and restore the operator's
    // risk limits. `risk_settings` used to be write-only, so every restart
    // silently reset the limits to the hardcoded defaults.
    getDatabase()
      .then(async () => {
        await this.hydrateRiskGuardFromDb();
        await this.hydrateChartHistoryFromDb();
      })
      .catch((err) => console.error('Failed to init SQLite DB:', err));
  }

  /** Load the persisted risk limits into the in-memory guard. */
  private async hydrateRiskGuardFromDb(): Promise<void> {
    try {
      const stored = await dbGetRiskSettings();
      if (!stored) return;

      const patch: Partial<RiskGuardConfig> = {};
      for (const field of PERSISTED_RISK_FIELDS) {
        const value = (stored as any)[field];
        if (value === undefined || value === null) continue;
        if (field === 'emergencyKillSwitch') {
          patch[field] = value === true;
        } else if (field === 'allowedSymbols') {
          if (Array.isArray(value) && value.length > 0) {
            (patch as any)[field] = value;
          }
        } else if (typeof value === 'number' && Number.isFinite(value)) {
          (patch as any)[field] = value;
        }
      }

      if (Object.keys(patch).length > 0) {
        this.riskGuard = { ...this.riskGuard, ...patch };
        this.addLog(
          'info',
          'Risk Guard Restored From Database',
          `TP: $${this.riskGuard.globalTakeProfitUSD} | SL: $${this.riskGuard.globalStopLossUSD} | Max DD: ${this.riskGuard.maxDrawdownPercent}% | Kill switch: ${
            this.riskGuard.emergencyKillSwitch ? 'ON' : 'OFF'
          }`,
          'SYSTEM'
        );
      }
    } catch (err: any) {
      console.warn('Failed to restore risk settings from DB:', err?.message);
    }
  }

  /** Restore the most recent real MT5 chart history across server restarts */
  private async hydrateChartHistoryFromDb(): Promise<void> {
    try {
      const { dbGetCandles } = await import('../database/db.js');
      const currentSym = this.currentChart?.symbol || 'EURUSD';
      const currentTf = this.currentChart?.timeframe || 'M1';
      const candles = await dbGetCandles(currentSym, currentTf, 120);
      if (candles && candles.length > 0) {
        this.chartHistory = candles;
        this.syntheticDataActive = false;
        this.indicators = calculateIndicators(this.chartHistory, currentSym, currentTf);
        this.addLog(
          'info',
          'Historical Candles Restored Across Restart',
          `Restored ${candles.length} real MT5 candles for ${currentSym} [${currentTf}]. Latest candle: ${candles[candles.length - 1].timeIso}`,
          'SYSTEM'
        );
      }
    } catch (err: any) {
      console.warn('Failed to restore chart history from DB:', err?.message);
    }
  }

  // Handle EA sync from MT5 WebRequest
  public handleEASync(payload: EASyncPayload): TradeCommand[] {
    const wasConnected = this.eaConnected && Date.now() - this.lastEaSync < 10000;
    this.eaConnected = true;
    this.lastEaSync = Date.now();
    this.eaVersion = payload.eaVersion || this.eaVersion;
    this.mt5ServerTime = payload.mt5Time || Math.floor(Date.now() / 1000);

    if (payload.terminalName) this.terminalName = payload.terminalName;
    if (payload.terminalCompany) this.terminalCompany = payload.terminalCompany;
    if (payload.terminalBuild) this.terminalBuild = payload.terminalBuild;

    // Log connection pickup if first time or reconnected
    if (!wasConnected) {
      this.addLog(
        'info',
        'MetaTrader 5 EA Attached & Connected',
        `Terminal: ${payload.terminalName || 'MT5'} (${payload.terminalCompany || 'Broker'}) • Chart: ${payload.currentChart?.symbol || 'Active'} [${payload.currentChart?.timeframe || 'TF'}]`,
        'MT5_EA'
      );
    }

    // 0. Update Current Chart, Permissions & All Symbols
    if (payload.currentChart) {
      this.currentChart = payload.currentChart;
    }
    if (payload.terminalPermissions) {
      this.terminalPermissions = payload.terminalPermissions;
    }
    if (Array.isArray(payload.allSymbols) && payload.allSymbols.length > 0) {
      this.allSymbols = payload.allSymbols;
      // Proactively auto-detect and profile all symbols in Market Watch so the KnowledgeBase
      // understands every symbol transmitted by MetaTrader 5 immediately
      if (!wasConnected) {
        import('../knowledgebase/core/auto-detect.js').then(({ runComprehensiveAutoDetection }) => {
          import('../database/db.js').then(({ dbSaveSymbolAutoDetectProfile, dbSaveSymbolRegime }) => {
            for (const symInfo of payload.allSymbols!) {
              if (!symInfo || !symInfo.symbol) continue;
              try {
                const prof = runComprehensiveAutoDetection(
                  symInfo.symbol,
                  this.account,
                  symInfo,
                  symInfo.symbol === this.currentChart?.symbol ? this.chartHistory : [],
                  Array.from(this.ticks.values())
                );
                dbSaveSymbolAutoDetectProfile(prof).catch(() => {});
                if (prof.regime) dbSaveSymbolRegime(prof.regime).catch(() => {});
              } catch {}
            }
          }).catch(() => {});
        }).catch(() => {});
      }
    }
    if (Array.isArray(payload.chartHistory) && payload.chartHistory.length > 0) {
      this.chartHistory = payload.chartHistory;
      this.syntheticDataActive = false;
      const currentSym = this.currentChart?.symbol || 'EURUSD';
      // The EA reports the MT5 enum name (`PERIOD_H1`); normalise it so the
      // rows are readable by every other part of the app.
      const currentTf = normalizeTimeframe(this.currentChart?.timeframe || 'M1') || 'M1';
      dbInsertCandles(currentSym, currentTf, payload.chartHistory).catch((e) =>
        console.error('DB insert candles error:', e)
      );
      // Auto-compute indicators server-side
      this.indicators = calculateIndicators(this.chartHistory, currentSym, currentTf);

      // Persist live MT5 chart diagnostics snapshot
      const chartDiag = this.getChartDiagnostics();
      if (chartDiag) {
        import('../database/db.js').then(({ dbInsertChartDiagnostics }) => {
          dbInsertChartDiagnostics(chartDiag).catch(() => {});
        }).catch(() => {});
      }

      // KnowledgeBase Automatic Symbol Behavior Detector: Run, persist and generate real-time trade signal
      import('../knowledgebase/core/auto-detect.js')
        .then(({ runComprehensiveAutoDetection }) => {
          const profile = runComprehensiveAutoDetection(
            currentSym,
            this.account,
            this.allSymbols.find((s) => s.symbol.toUpperCase() === currentSym.toUpperCase()) || (this.currentChart as any),
            this.chartHistory,
            Array.from(this.ticks.values())
          );
          import('../database/db.js').then(({ dbSaveSymbolAutoDetectProfile, dbSaveSymbolRegime }) => {
            dbSaveSymbolAutoDetectProfile(profile).catch((e) => console.error('DB save profile error:', e));
            if (profile.regime) dbSaveSymbolRegime(profile.regime).catch((e) => console.error('DB save regime error:', e));
          });
          import('./websocketServer.js').then(({ broadcast }) => {
            broadcast({ type: 'knowledge:autodetect', payload: profile });
          });

          // Generate instantaneous trade signal on real MT5 bars
          import('../knowledgebase/core/tradeSignal.js').then(({ generateTradeSignal }) => {
            const currentBid = this.currentChart?.bid || (this.ticks.get(currentSym)?.bid ?? profile.specs.currentPrice);
            const symInfo = this.allSymbols.find((s) => s.symbol.toUpperCase() === currentSym.toUpperCase());
            generateTradeSignal(currentSym, this.chartHistory, currentBid, this.account.balance, 'LIVE', currentTf, symInfo)
              .then((signal) => {
                import('../database/db.js').then(({ dbInsertBotSignal }) => {
                  dbInsertBotSignal({
                    id: `sig-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    symbol: signal.symbol,
                    timeframe: signal.timeframe,
                    direction: signal.direction,
                    confidence: signal.confidence,
                    entryPrice: signal.entryPrice,
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.takeProfit,
                    riskRewardRatio: signal.riskRewardRatio,
                    reasons: signal.reasons,
                    warnings: signal.warnings,
                    dataQuality: 'LIVE',
                    generatedAt: signal.generatedAt,
                    actedOn: false,
                  }).catch(() => {});
                });
                import('./websocketServer.js').then(({ broadcast }) => {
                  broadcast({ type: 'knowledge:signal', payload: signal });
                });
              })
              .catch((e) => console.error('KnowledgeBase signal generation error:', e));
          }).catch(() => {});
        })
        .catch((e) => console.error('KnowledgeBase auto-detection error:', e));

      // KnowledgeBase Rapid Shock & Event Detection
      import('../knowledgebase/news/rapidShockDetector.js')
        .then(({ detectRapidMovementsAndAttribution }) => {
          detectRapidMovementsAndAttribution(currentSym, this.chartHistory, currentTf)
            .then((shocks) => {
              if (shocks && shocks.length > 0) {
                import('../database/db.js').then(({ dbInsertRapidShock }) => {
                  for (const s of shocks.slice(0, 5)) {
                    dbInsertRapidShock(s).catch(() => {});
                  }
                });
                const liveShock = shocks.find((s) => s.coolingOffMinutesRemaining > 0);
                if (liveShock) {
                  import('./websocketServer.js').then(({ broadcast }) => {
                    broadcast({ type: 'knowledge:shock_detected', payload: liveShock });
                  });
                }
              }
            })
            .catch((e) => console.error('Rapid shock detection on EA sync error:', e));
        })
        .catch((e) => console.error('Rapid shock detector import error:', e));
    }

    // Process on-demand historical payload if returned from EA
    if (payload.historyPayload && Array.isArray(payload.historyPayload.candles)) {
      const histSym = payload.historyPayload.symbol;
      const histTf = payload.historyPayload.timeframe;
      const histCandles = payload.historyPayload.candles;
      dbInsertCandles(histSym, histTf, histCandles).catch((e) => console.error('DB insert on-demand history error:', e));

      // If on-demand history is for current chart, seamlessly merge into chartHistory so UI updates with no gaps
      if (
        this.currentChart &&
        normalizeSymbol(histSym) === normalizeSymbol(this.currentChart.symbol) &&
        normalizeTimeframe(histTf) === normalizeTimeframe(this.currentChart.timeframe)
      ) {
        const candleMap = new Map<number, CandleData>();
        for (const c of this.chartHistory) {
          candleMap.set(c.time, c);
        }
        for (const c of histCandles) {
          candleMap.set(c.time, c);
        }
        this.chartHistory = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
        this.syntheticDataActive = false;
        this.indicators = calculateIndicators(this.chartHistory, histSym, histTf);
        import('./websocketServer.js')
          .then(({ broadcast }) => {
            broadcast({
              type: 'chart:history_updated',
              payload: { symbol: histSym, timeframe: histTf, candles: this.chartHistory },
            });
          })
          .catch(() => {});
      }

      // Trigger automatic behavior detection across the pulled historical dataset
      import('../knowledgebase/core/auto-detect.js')
        .then(({ runComprehensiveAutoDetection }) => {
          const profile = runComprehensiveAutoDetection(
            histSym,
            this.account,
            this.allSymbols.find((s) => s.symbol.toUpperCase() === histSym.toUpperCase()) || null,
            histCandles,
            Array.from(this.ticks.values())
          );
          import('../database/db.js').then(({ dbSaveSymbolAutoDetectProfile, dbSaveSymbolRegime }) => {
            dbSaveSymbolAutoDetectProfile(profile).catch((e) => console.error('DB save history profile error:', e));
            if (profile.regime) dbSaveSymbolRegime(profile.regime).catch((e) => console.error('DB save regime error:', e));
          });
          import('./websocketServer.js').then(({ broadcast }) => {
            broadcast({ type: 'knowledge:autodetect', payload: profile });
          });

          // Generate instantaneous trade signal on pulled historical dataset
          import('../knowledgebase/core/tradeSignal.js').then(({ generateTradeSignal }) => {
            const lastCandle = histCandles[histCandles.length - 1];
            const currentBid = lastCandle ? lastCandle.close : profile.specs.currentPrice;
            const symInfo = this.allSymbols.find((s) => s.symbol.toUpperCase() === histSym.toUpperCase());
            generateTradeSignal(histSym, histCandles, currentBid, this.account.balance, 'LIVE', histTf, symInfo)
              .then((signal) => {
                import('../database/db.js').then(({ dbInsertBotSignal }) => {
                  dbInsertBotSignal({
                    id: `sig-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    symbol: signal.symbol,
                    timeframe: signal.timeframe,
                    direction: signal.direction,
                    confidence: signal.confidence,
                    entryPrice: signal.entryPrice,
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.takeProfit,
                    riskRewardRatio: signal.riskRewardRatio,
                    reasons: signal.reasons,
                    warnings: signal.warnings,
                    dataQuality: 'LIVE',
                    generatedAt: signal.generatedAt,
                    actedOn: false,
                  }).catch(() => {});
                });
                import('./websocketServer.js').then(({ broadcast }) => {
                  broadcast({ type: 'knowledge:signal', payload: signal });
                });
              })
              .catch(() => {});
          }).catch(() => {});
        })
        .catch((e) => console.error('KnowledgeBase history auto-detection error:', e));
    }


    // 1. Update Account Info & Persist Snapshot
    if (payload.account) {
      this.account = {
        ...payload.account,
        lastUpdate: Date.now(),
      };
      dbInsertAccountSnapshot(this.account).catch((e) =>
        console.error('DB account snapshot error:', e)
      );
    }

    // 2. Update Open Positions
    if (Array.isArray(payload.positions)) {
      this.positions.clear();
      for (const pos of payload.positions) {
        this.positions.set(pos.ticket, pos);
      }
      import('../bot/autoTrader.js')
        .then(({ tradingBot }) => {
          tradingBot.reconcilePositions(payload.positions!);
        })
        .catch(() => {});
    }

    // 2b. Reconcile Closed Broker Deals with Bot & Persist to SQLite
    if (Array.isArray(payload.closedDeals) && payload.closedDeals.length > 0) {
      import('../database/db.js')
        .then(({ dbSaveClosedDeals }) => {
          dbSaveClosedDeals(payload.closedDeals!).catch(() => {});
        })
        .catch(() => {});

      import('../bot/autoTrader.js')
        .then(({ tradingBot }) => {
          tradingBot.reconcileDeals(payload.closedDeals!);
        })
        .catch(() => {});
    }

    // 3. Update Pending Orders
    if (Array.isArray(payload.pendingOrders)) {
      this.pendingOrders.clear();
      for (const po of payload.pendingOrders) {
        this.pendingOrders.set(po.ticket, {
          ...po,
          timeSetupIso: po.timeSetupIso || new Date(po.timeSetup * 1000).toISOString(),
        });
      }
    }

    // 4. Update Market Depth. The EA sends `{ symbol, items: [{type,price,volume}] }`
    //    while the rest of the app expects `Record<symbol, {bids, asks}>`. Normalise
    //    here so the two shapes agree.
    if (payload.marketDepth) {
      const md: any = payload.marketDepth;
      if (md && Array.isArray(md.items) && md.symbol) {
        const bids: any[] = [];
        const asks: any[] = [];
        for (const it of md.items) {
          const entry = { price: Number(it.price), volume: Number(it.volume) };
          if (String(it.type).toUpperCase() === 'BUY') bids.push(entry);
          else asks.push(entry);
        }
        this.marketDepth = { [String(md.symbol).toUpperCase()]: { bids, asks } };
      } else {
        this.marketDepth = md;
      }
    }

    // 5. Update Live Ticks & Persist to SQLite
    if (Array.isArray(payload.ticks)) {
      dbInsertTicks(payload.ticks).catch((e) => console.error('DB insert ticks error:', e));
      pruneDatabase().catch((e) => console.error('DB prune error:', e));
      const tickTelemetry: Array<{ velocity: number; timestamp: number }> = [];

      for (const tick of payload.ticks) {
        const existing = this.ticks.get(tick.symbol);
        const updated: TickData = {
          ...tick,
          high24h: existing ? Math.max(existing.high24h || tick.ask, tick.ask) : tick.ask,
          low24h: existing ? Math.min(existing.low24h || tick.bid, tick.bid) : tick.bid,
        };
        this.ticks.set(tick.symbol, updated);
        this.applyTickToChartBars(updated);

        // Update history with millisecond precision
        let hist = this.tickHistory.get(tick.symbol);
        if (!hist) {
          hist = [];
          this.tickHistory.set(tick.symbol, hist);
        }
        const nowTs = tick.timeMsc || (tick.time ? tick.time * 1000 : Date.now());
        hist.push({ time: nowTs, bid: tick.bid, ask: tick.ask });
        if (hist.length > 100) hist.shift();

        // Calculate tick speed / pip velocity if previous tick exists
        if (existing && existing.bid > 0) {
          const prevTs = existing.timeMsc || (existing.time ? existing.time * 1000 : nowTs - 1000);
          const dtSec = Math.max(0.1, (nowTs - prevTs) / 1000);
          // Estimate point size from digits or default
          const pt = this.currentChart?.symbol === tick.symbol && this.currentChart.point
            ? this.currentChart.point
            : (tick.bid > 100 ? 0.01 : 0.0001);
          const pipDiff = Math.abs(tick.bid - existing.bid) / (pt * 10);
          const velocity = pipDiff / dtSec; // pips per second
          if (velocity > 0 && Number.isFinite(velocity)) {
            tickTelemetry.push({ velocity: Number(velocity.toFixed(3)), timestamp: nowTs });
          }
        }
      }

      if (tickTelemetry.length > 0) {
        try {
          updateKnowledgeBaseFromTelemetry(payload.ticks[0]?.symbol || 'MARKET', tickTelemetry);
        } catch (e) {
          console.error('Failed to update knowledge base from tick telemetry:', e);
        }
      }
    }

    // 4. Resolve Execution Results reported by EA
    if (Array.isArray(payload.pendingExecutionResults)) {
      for (const res of payload.pendingExecutionResults) {
        this.resolveExecutionResult(res);
      }
    }

    // 5. Evaluate Risk Guard Rules
    this.evaluateRiskGuard();

    // 6. Return pending commands to EA
    return this.dispatchPendingCommands();
  }

  /**
   * Resolve the real contract size for a symbol.
   *
   * The previous implementation used three inline magic multipliers
   * (`* 100000` for FX, `* 100` for XAUUSD, `* 1` for BTCUSD). Those are
   * wrong for most brokers (gold contracts are commonly 50/100/500 oz,
   * crypto contracts are not always 1, and cross pairs are not 100,000 of
   * the quote currency), so the displayed floating profit - the number the
   * risk guard acts on - was wrong for anything outside the three hardcoded
   * symbols.
   *
   * MT5 reports the authoritative value (`SymbolInfoDouble(SYMBOL_TRADE_CONTRACT_SIZE)`)
   * on both `currentChart.contractSize` and every `DetailedSymbolInfo`. Prefer
   * that; only fall back to the documented default when MT5 has never told us.
   */
  private resolveContractSize(symbol: string): number {
    const sym = String(symbol || '').toUpperCase();
    if (!sym) return 0;

    const candidates = [
      this.currentChart?.symbol?.toUpperCase() === sym ? this.currentChart?.contractSize : undefined,
      this.allSymbols.find((s) => s.symbol?.toUpperCase() === sym)?.contractSize,
    ];

    for (const size of candidates) {
      const n = Number(size);
      if (Number.isFinite(n) && n > 0) return n;
    }

    // Documented defaults, used only when MT5 has not reported the contract size.
    if (sym === 'XAUUSD' || sym === 'XAGUSD') return 100;
    if (sym.includes('BTC') || sym.includes('ETH')) return 1;
    return 100000; // standard 1-lot forex contract (units of base currency)
  }

  /**
   * Mark the currently displayed data as synthetic.
   *
   * The seed/backtest helpers generate random-walk bars. Those bars must never
   * be presented as live market data, so anything derived from them carries an
   * explicit `synthetic` flag.
   */
  public markSyntheticDataActive(active: boolean): void {
    this.syntheticDataActive = active;
  }

  /**
   * Applies incoming tick data to the live chart bar, matching MetaTrader 5's
   * exact chart movement mechanics.
   *
   * In MT5, every tick:
   * 1. Updates bar[0]'s close to tick.bid.
   * 2. Expands bar[0]'s high and low as price moves.
   * 3. Increments bar[0]'s tick_volume and updates spread.
   * 4. When current time rolls over to a new timeframe period (e.g. at 60s for M1),
   *    bar[0] becomes closed (isClosed = true), and a new bar[0] opens.
   */
  public applyTickToChartBars(tick: TickData): void {
    if (!this.currentChart || !tick) return;
    const currentSym = String(this.currentChart.symbol || '').toUpperCase();
    const tickSym = String(tick.symbol || '').toUpperCase();
    if (currentSym !== tickSym) return;

    const pSecs = this.currentChart.periodSeconds || 60;
    const tickTs = tick.timeMsc ? Math.floor(tick.timeMsc / 1000) : (tick.time || Math.floor(Date.now() / 1000));
    const barOpenTime = Math.floor(tickTs / pSecs) * pSecs;

    if (!this.chartHistory || this.chartHistory.length === 0) {
      // First candle initialization
      const firstBar: CandleData = {
        time: barOpenTime,
        timeIso: new Date(barOpenTime * 1000).toISOString(),
        open: tick.bid,
        high: Math.max(tick.bid, tick.ask),
        low: Math.min(tick.bid, tick.ask),
        close: tick.bid,
        volume: 1,
        tickCount: 1,
        spread: tick.spread || 0,
        isClosed: false,
      };
      this.chartHistory = [firstBar];
      this.currentChart.currentBarTime = barOpenTime;
      this.currentChart.bid = tick.bid;
      this.currentChart.ask = tick.ask;
      return;
    }

    const lastIdx = this.chartHistory.length - 1;
    const lastBar = this.chartHistory[lastIdx];

    if (lastBar.time === barOpenTime) {
      // Live bar update
      lastBar.close = tick.bid;
      if (tick.bid > lastBar.high) lastBar.high = tick.bid;
      if (tick.bid < lastBar.low) lastBar.low = tick.bid;
      lastBar.volume = (lastBar.volume || 0) + 1;
      lastBar.tickCount = (lastBar.tickCount || 0) + 1;
      lastBar.spread = tick.spread || lastBar.spread;
      lastBar.isClosed = false;
    } else if (barOpenTime > lastBar.time) {
      // Bar rollover: close previous bar and open new live bar
      lastBar.isClosed = true;
      const newBar: CandleData = {
        time: barOpenTime,
        timeIso: new Date(barOpenTime * 1000).toISOString(),
        open: tick.bid,
        high: tick.bid,
        low: tick.bid,
        close: tick.bid,
        volume: 1,
        tickCount: 1,
        spread: tick.spread || 0,
        isClosed: false,
      };
      this.chartHistory.push(newBar);
      if (this.chartHistory.length > 500) {
        this.chartHistory.shift();
      }
      this.currentChart.currentBarTime = barOpenTime;
    }

    this.currentChart.bid = tick.bid;
    this.currentChart.ask = tick.ask;
    this.currentChart.spread = tick.spread;
  }

  // Update a single live tick (used by EA or simulation)
  public updateTick(tick: TickData) {
    const existing = this.ticks.get(tick.symbol);
    const updated: TickData = {
      ...tick,
      high24h: existing ? Math.max(existing.high24h || tick.ask, tick.ask) : tick.ask,
      low24h: existing ? Math.min(existing.low24h || tick.bid, tick.bid) : tick.bid,
    };
    this.ticks.set(tick.symbol, updated);
    this.applyTickToChartBars(updated);

    let hist = this.tickHistory.get(tick.symbol);
    if (!hist) {
      hist = [];
      this.tickHistory.set(tick.symbol, hist);
    }
    hist.push({ time: Date.now(), bid: tick.bid, ask: tick.ask });
    if (hist.length > 100) hist.shift();

    // Recalculate floating profit on open positions for this symbol
    const contractSize = this.resolveContractSize(tick.symbol);
    for (const [ticket, pos] of this.positions.entries()) {
      if (pos.symbol === tick.symbol) {
        const diff = pos.type === 'BUY' ? tick.bid - pos.openPrice : pos.openPrice - tick.ask;
        // PnL = price move x units, where units = lots x contract size.
        const profit = Number((diff * pos.volume * contractSize).toFixed(2));
        pos.currentPrice = pos.type === 'BUY' ? tick.bid : tick.ask;
        pos.profit = profit;
        this.positions.set(ticket, pos);
      }
    }

    // Recompute total account floating equity
    let totalProfit = 0;
    for (const pos of this.positions.values()) {
      totalProfit += pos.profit;
    }
    this.account.profit = Number(totalProfit.toFixed(2));
    this.account.equity = Number((this.account.balance + totalProfit).toFixed(2));
    if (this.account.margin > 0) {
      this.account.marginLevel = Number(((this.account.equity / this.account.margin) * 100).toFixed(2));
    }
  }

  // Enqueue a trade command
  public enqueueCommand(params: {
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
    slippage?: number;
    timeframe?: string;
    count?: number;
    source: TradeCommand['source'];
  }): { success: boolean; commandId?: string; error?: string } {
    // Reject a non-trade action without a symbol/volume check.
    const needsSymbol = params.action !== 'CLOSE_ALL';
    if (needsSymbol && !params.symbol) {
      return { success: false, error: 'Missing symbol for this action.' };
    }

    // Volume validation: the previous code only rejected volumes *above* the
    // risk cap, so 0, negative, NaN and Infinity volumes were happily queued
    // and then dispatched to MT5 as invalid orders.
    if (params.volume !== undefined) {
      const volume = Number(params.volume);
      if (!Number.isFinite(volume) || volume <= 0) {
        return {
          success: false,
          error: `Invalid volume "${params.volume}". Volume must be a positive number.`,
        };
      }
      if (params.action === 'EXECUTE_TRADE' && volume > this.riskGuard.maxLotSizePerTrade) {
        return {
          success: false,
          error: `Requested lot size (${volume}) exceeds risk limit of ${this.riskGuard.maxLotSizePerTrade} lots.`,
        };
      }
    }

    // Risk Guard pre-validation
    if (this.riskGuard.emergencyKillSwitch && params.action !== 'CLOSE_ALL' && params.action !== 'CLOSE_POSITION') {
      return { success: false, error: 'Emergency Kill Switch is ACTIVE. New orders are blocked.' };
    }

    if (params.action === 'EXECUTE_TRADE') {
      if (this.positions.size >= this.riskGuard.maxOpenPositions) {
        return {
          success: false,
          error: `Max open positions limit (${this.riskGuard.maxOpenPositions}) reached.`,
        };
      }
      if (
        params.symbol &&
        this.riskGuard.allowedSymbols.length > 0 &&
        !this.riskGuard.allowedSymbols.includes('*') &&
        !this.riskGuard.allowedSymbols.some((s) => s.toLowerCase() === 'all')
      ) {
        const symLower = params.symbol.toLowerCase();
        const isPermitted = this.riskGuard.allowedSymbols.some((allowed) => {
          const aLower = allowed.toLowerCase();
          return aLower === symLower || symLower.startsWith(aLower) || aLower.startsWith(symLower);
        });
        if (!isPermitted) {
          return {
            success: false,
            error: `Symbol ${params.symbol} is not permitted by Risk Guard policy.`,
          };
        }
      }
    }

    const id = `cmd-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const command: TradeCommand = {
      id,
      action: params.action,
      symbol: params.symbol ? String(params.symbol).trim() : undefined,
      orderType: params.orderType,
      volume: params.volume,
      price: params.price,
      sl: params.sl,
      tp: params.tp,
      ticket: params.ticket,
      magic: params.magic || 889900,
      comment: params.comment ? String(params.comment) : `${params.source}_CMD`,
      slippage: params.slippage || 10,
      timeframe: params.timeframe,
      count: params.count,
      from: (params as any).from,
      to: (params as any).to,
      status: 'pending',
      createdAt: Date.now(),
      source: params.source,
    };

    this.commandQueue.unshift(command);
    this.trimCommandQueue();

    // Persist to SQLite Database
    dbInsertOrder(command).catch((e) => console.error('DB insert order error:', e));

    this.addLog(
      'info',
      `Queued [${params.action}] via ${params.source}`,
      `${params.action} ${params.symbol || ''} ${params.orderType || ''} ${params.volume ? params.volume + ' lots' : ''} (ID: ${id})`,
      params.source,
      params.ticket
    );

    return { success: true, commandId: id };
  }

  /**
   * Keep the in-memory queue bounded without losing unresolved work.
   *
   * The old code unconditionally dropped the tail (`pop()`), so the oldest -
   * and therefore the most likely still `dispatched` - command was discarded.
   * Once dropped, the EA's execution result can no longer be matched by id, so
   * the row stayed stuck in the database as `pending` forever.
   */
  private trimCommandQueue(): void {
    while (this.commandQueue.length > 50) {
      let droppedIndex = -1;
      for (let i = this.commandQueue.length - 1; i >= 0; i--) {
        const status = this.commandQueue[i].status;
        if (status === 'executed' || status === 'failed' || status === 'cancelled') {
          droppedIndex = i;
          break;
        }
      }
      // Nothing resolvable left to drop - keep the unresolved commands instead
      // of silently orphaning an execution result.
      if (droppedIndex === -1) return;
      this.commandQueue.splice(droppedIndex, 1);
    }
  }

  // Prune any unexecuted orders older than 24 hours
  public pruneStaleOrders() {
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.commandQueue = this.commandQueue.filter((cmd) => {
      const isUnexecuted = cmd.status === 'pending' || cmd.status === 'dispatched';
      const isExpired = isUnexecuted && cmd.createdAt < twentyFourHoursAgo;
      return !isExpired;
    });
  }

  /**
   * Reap commands that were dispatched to MT5 but never resolved.
   *
   * A command sits in `dispatched` until the EA reports a result. If the EA
   * restarts, drops the request, or MT5 rejects it without reporting back,
   * the command stayed `dispatched` indefinitely and the database kept
   * showing an order that never happened as `pending`.
   */
  public reapStuckDispatchedCommands(): number {
    const now = Date.now();
    let reaped = 0;
    for (const cmd of this.commandQueue) {
      if (cmd.status !== 'dispatched') continue;
      if (!cmd.dispatchedAt || now - cmd.dispatchedAt < DISPATCH_REAP_MS) continue;

      cmd.status = 'failed';
      cmd.executedAt = now;
      cmd.result = {
        success: false,
        errorMessage: `No execution result received from MT5 within ${Math.round(DISPATCH_REAP_MS / 1000)}s.`,
      };
      reaped++;
      dbInsertOrder(cmd).catch((e) => console.error('DB reap order error:', e));
      this.addLog(
        'warn',
        `Command Timed Out (${cmd.action})`,
        `${cmd.action} ${cmd.symbol || ''} never reported a result and was marked failed.`,
        'RISK_GUARD',
        cmd.ticket
      );
    }
    if (reaped > 0) {
      console.warn(`[RiskGuard] Reaped ${reaped} dispatched command(s) with no MT5 execution result.`);
    }
    return reaped;
  }

  private dispatchPendingCommands(): TradeCommand[] {
    this.pruneStaleOrders();
    this.reapStuckDispatchedCommands();
    this.trimCommandQueue();

    const toDispatch: TradeCommand[] = [];
    for (const cmd of this.commandQueue) {
      if (cmd.status !== 'pending') continue;
      // Never hand a new order to MT5 while the kill switch is engaged or a
      // breach is latched - only the protective close-all may go through.
      const isProtective = cmd.action === 'CLOSE_ALL' || cmd.action === 'CLOSE_POSITION';
      if (!isProtective && (this.riskGuard.emergencyKillSwitch || this.hasLatchedBreach())) {
        continue;
      }
      cmd.status = 'dispatched';
      cmd.dispatchedAt = Date.now();
      toDispatch.push(cmd);
    }
    return toDispatch;
  }

  /** True when any risk-guard breach is currently latched. */
  private hasLatchedBreach(): boolean {
    return this.riskBreachLatch.tp || this.riskBreachLatch.sl || this.riskBreachLatch.drawdown || this.riskBreachLatch.margin;
  }

  public resolveExecutionResult(res: {
    commandId: string;
    success: boolean;
    dealTicket?: number;
    orderTicket?: number;
    executionPrice?: number;
    errorCode?: number;
    errorMessage?: string;
    executionTimeMs?: number;
    slippagePoints?: number;
    timestampIso?: string;
  }) {
    const cmd = this.commandQueue.find((c) => c.id === res.commandId);
    if (cmd) {
      cmd.status = res.success ? 'executed' : 'failed';
      cmd.executedAt = Date.now();
      cmd.result = res;

      // Update SQLite Database with execution results
      dbInsertOrder(cmd).catch((e) => console.error('DB update order error:', e));

      // Feed result into bot execution ledger (Gap 13 feedback loop)
      if (cmd.source === 'BOT') {
        import('../bot/autoTrader.js')
          .then(({ tradingBot }) => {
            tradingBot.handleExecutionResult(cmd, res);
          })
          .catch((err) => console.error('Failed to notify tradingBot:', err));
      }

      const slipNote = typeof res.slippagePoints === 'number' && res.slippagePoints > 0 ? ` [Slippage: ${res.slippagePoints} pts]` : '';
      this.addLog(
        res.success ? 'trade' : 'error',
        res.success ? `MT5 Execution Confirmed (${cmd.action})` : `MT5 Execution Failed (${cmd.action})`,
        res.success
          ? `Deal #${res.dealTicket || res.orderTicket} @ ${res.executionPrice || 'market'}${slipNote} (${res.executionTimeMs}ms)`
          : `Error: ${res.errorMessage || 'RetCode ' + res.errorCode}`,
        'MT5_EA',
        res.orderTicket || cmd.ticket
      );
    }
  }

  private evaluateRiskGuard() {
    const profit = this.account.profit;
    const balance = this.account.balance;

    // Track the peak equity so the drawdown rule has a baseline. Without a
    // tracked peak the rule can only work off a fixed balance, which is wrong
    // the moment the account grows.
    if (this.account.equity > this.peakEquity) {
      this.peakEquity = this.account.equity;
    }

    // 1. Global Take Profit in USD
    const tpBreached = this.riskGuard.globalTakeProfitUSD > 0 && profit >= this.riskGuard.globalTakeProfitUSD;
    if (tpBreached && !this.riskBreachLatch.tp) {
      this.riskBreachLatch.tp = true;
      this.addLog(
        'warn',
        'Global Take Profit Reached!',
        `Floating profit $${profit.toFixed(2)} reached target $${this.riskGuard.globalTakeProfitUSD}. Triggering emergency closure.`,
        'RISK_GUARD'
      );
      this.enqueueCommand({
        action: 'CLOSE_ALL',
        source: 'RISK_GUARD',
        comment: 'GLOBAL_TP_REACHED',
      });
    }
    if (!tpBreached && profit < this.riskGuard.globalTakeProfitUSD * 0.8) {
      this.riskBreachLatch.tp = false;
    }

    // 2. Global Stop Loss in USD
    const slBreached = this.riskGuard.globalStopLossUSD > 0 && profit <= -this.riskGuard.globalStopLossUSD;
    if (slBreached && !this.riskBreachLatch.sl) {
      this.riskBreachLatch.sl = true;
      this.addLog(
        'error',
        'Global Stop Loss Breach!',
        `Floating loss -$${Math.abs(profit).toFixed(2)} hit stop limit -$${this.riskGuard.globalStopLossUSD}. Liquidating positions.`,
        'RISK_GUARD'
      );
      this.enqueueCommand({
        action: 'CLOSE_ALL',
        source: 'RISK_GUARD',
        comment: 'GLOBAL_SL_BREACH',
      });
    }
    if (!slBreached && profit > -this.riskGuard.globalStopLossUSD * 0.8) {
      this.riskBreachLatch.sl = false;
    }

    // 3. Maximum drawdown. This was declared in the config but never enforced.
    const ddLimit = Number(this.riskGuard.maxDrawdownPercent) || 0;
    if (ddLimit > 0 && this.peakEquity > 0) {
      const drawdownPct = ((this.peakEquity - this.account.equity) / this.peakEquity) * 100;
      const ddBreached = drawdownPct >= ddLimit;
      if (ddBreached && !this.riskBreachLatch.drawdown) {
        this.riskBreachLatch.drawdown = true;
        this.addLog(
          'error',
          'Maximum Drawdown Breached!',
          `Equity drawdown ${drawdownPct.toFixed(2)}% exceeded the ${ddLimit}% limit. Liquidating positions.`,
          'RISK_GUARD'
        );
        this.enqueueCommand({
          action: 'CLOSE_ALL',
          source: 'RISK_GUARD',
          comment: 'MAX_DRAWDOWN_BREACH',
        });
      }
      if (!ddBreached && drawdownPct < ddLimit * 0.8) {
        this.riskBreachLatch.drawdown = false;
      }
    }

    // 4. Margin Level Protection
    const marginBreached =
      this.riskGuard.autoCloseOnMarginLevelBelow > 0 &&
      this.account.marginLevel > 0 &&
      this.account.marginLevel < this.riskGuard.autoCloseOnMarginLevelBelow;
    if (marginBreached && !this.riskBreachLatch.margin) {
      this.riskBreachLatch.margin = true;
      this.addLog(
        'error',
        'Critical Margin Level Protection Triggered',
        `Margin level ${this.account.marginLevel.toFixed(1)}% dropped below ${this.riskGuard.autoCloseOnMarginLevelBelow}%. Liquidation started.`,
        'RISK_GUARD'
      );
      this.enqueueCommand({
        action: 'CLOSE_ALL',
        source: 'RISK_GUARD',
        comment: 'MARGIN_LEVEL_SAFETY',
      });
    }
    if (!marginBreached && this.account.marginLevel >= this.riskGuard.autoCloseOnMarginLevelBelow * 1.2) {
      this.riskBreachLatch.margin = false;
    }

    // A latched breach blocks new orders until it clears. If every position is
    // gone and equity has recovered, reset the latch so trading can resume.
    if (this.hasLatchedBreach() && this.positions.size === 0) {
      const recovered =
        profit < this.riskGuard.globalTakeProfitUSD * 0.5 &&
        profit > -this.riskGuard.globalStopLossUSD * 0.5 &&
        (ddLimit <= 0 || this.peakEquity <= 0 || ((this.peakEquity - this.account.equity) / this.peakEquity) * 100 < ddLimit * 0.5);
      if (recovered) {
        this.riskBreachLatch = { tp: false, sl: false, drawdown: false, margin: false };
        this.addLog(
          'info',
          'Risk Guard Latched Breach Cleared',
          'All positions closed and equity recovered; new orders are permitted again.',
          'RISK_GUARD'
        );
      }
    }
  }

  public updateRiskGuard(updated: Partial<RiskGuardConfig>) {
    // Validate numeric inputs so a client cannot disable a limit by sending
    // 0, NaN or Infinity (which would silently bypass the risk guard).
    const sanitized: Partial<RiskGuardConfig> = { ...updated };
    if (sanitized.maxLotSizePerTrade !== undefined) {
      const n = Number(sanitized.maxLotSizePerTrade);
      if (!Number.isFinite(n) || n <= 0) {
        return; // reject invalid
      }
      sanitized.maxLotSizePerTrade = n;
    }
    if (sanitized.maxOpenPositions !== undefined) {
      const n = Number(sanitized.maxOpenPositions);
      if (!Number.isFinite(n) || n < 1) {
        return;
      }
      sanitized.maxOpenPositions = Math.floor(n);
    }
    if (sanitized.globalTakeProfitUSD !== undefined) {
      const n = Number(sanitized.globalTakeProfitUSD);
      if (!Number.isFinite(n) || n < 0) return;
      sanitized.globalTakeProfitUSD = n;
    }
    if (sanitized.globalStopLossUSD !== undefined) {
      const n = Number(sanitized.globalStopLossUSD);
      if (!Number.isFinite(n) || n < 0) return;
      sanitized.globalStopLossUSD = n;
    }
    if (sanitized.maxDrawdownPercent !== undefined) {
      const n = Number(sanitized.maxDrawdownPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) return;
      sanitized.maxDrawdownPercent = n;
    }
    if (sanitized.allowedSymbols !== undefined && !Array.isArray(sanitized.allowedSymbols)) {
      return;
    }

    this.riskGuard = {
      ...this.riskGuard,
      ...sanitized,
    };
    dbSaveRiskSettings(this.riskGuard).catch((e) => console.error('DB save risk error:', e));

    // Propagate risk guard & trailing parameters directly to MT5 EA
    this.enqueueCommand({
      action: 'SET_RISK_GUARD',
      source: 'RISK_GUARD',
      comment: JSON.stringify({
        trailingStopEnabled: this.riskGuard.trailingStopEnabled,
        trailingDistancePoints: this.riskGuard.trailingStopDistancePoints,
        trailingStepPoints: this.riskGuard.trailingStopStepPoints,
        enableBreakeven: true,
        breakevenTriggerPoints: Math.round(this.riskGuard.trailingStopDistancePoints * 0.8),
        breakevenLockPoints: Math.max(15, Math.round(this.riskGuard.trailingStopStepPoints * 0.5)),
      }),
    });

    this.addLog(
      'info',
      'Risk Guard Parameters Updated & Synced to EA',
      `TP: $${this.riskGuard.globalTakeProfitUSD} | SL: $${this.riskGuard.globalStopLossUSD} | Trailing: ${this.riskGuard.trailingStopEnabled ? 'ON' : 'OFF'} (${this.riskGuard.trailingStopDistancePoints} pts)`,
      'USER_CONTROL'
    );
  }


  public triggerKillSwitch(active: boolean) {
    this.riskGuard.emergencyKillSwitch = active;
    dbSaveRiskSettings(this.riskGuard).catch((e) => console.error('DB save risk error:', e));
    if (active) {
      this.addLog('warn', 'EMERGENCY KILL SWITCH ENGAGED', 'Halting all operations & closing all active positions', 'EMERGENCY');
      this.enqueueCommand({
        action: 'CLOSE_ALL',
        source: 'RISK_GUARD',
        comment: 'EMERGENCY_KILL_SWITCH',
      });
    } else {
      // Disengaging the switch must also release any breach latch, otherwise
      // the system stays deadlocked: the kill switch blocks new orders and
      // the latch blocks them too, with nothing able to clear it.
      this.riskBreachLatch = { tp: false, sl: false, drawdown: false, margin: false };
      this.addLog('info', 'Emergency Kill Switch Disengaged', 'Normal trading operations resumed', 'USER_CONTROL');
    }
  }

  public addLog(
    levelOrObj: ExecutionLog['level'] | { level: ExecutionLog['level']; title: string; details: string; source: string; ticket?: number },
    title?: string,
    details?: string,
    source?: string,
    ticket?: number
  ) {
    let log: ExecutionLog;
    if (typeof levelOrObj === 'object') {
      log = {
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: Date.now(),
        level: levelOrObj.level,
        title: levelOrObj.title,
        details: levelOrObj.details,
        source: levelOrObj.source,
        ticket: levelOrObj.ticket,
      };
    } else {
      log = {
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: Date.now(),
        level: levelOrObj,
        title: title || '',
        details: details || '',
        source: source || 'SYSTEM',
        ticket,
      };
    }
    this.logs.unshift(log);
    if (this.logs.length > 100) this.logs.pop();

    dbInsertLog(log).catch((e) => console.error('DB insert log error:', e));
  }

  public getState() {
    this.pruneStaleOrders();
    // Check if EA timed out (no sync in 10 seconds)
    const isEaActive = this.eaConnected && Date.now() - this.lastEaSync < 10000;

    return {
      connection: {
        isEaConnected: isEaActive,
        lastEaSync: this.lastEaSync,
        eaVersion: this.eaVersion,
        bridgeEndpoint: 'http://127.0.0.1:7777',
        fallbackEndpoint: 'http://127.0.0.1:3000/api/mt5',
        serverTime: Date.now(),
        mt5ServerTime: this.mt5ServerTime,
        terminalName: this.terminalName,
        terminalCompany: this.terminalCompany,
        terminalBuild: this.terminalBuild,
        chartSymbol: this.currentChart?.symbol,
        chartTimeframe: this.currentChart?.timeframe,
      },
      currentChart: this.currentChart,
      chartDiagnostics: this.getChartDiagnostics(),
      terminalPermissions: this.terminalPermissions,
      allSymbols: this.allSymbols,
      chartHistory: this.chartHistory,
      indicators: this.indicators,
      account: this.account,
      positions: Array.from(this.positions.values()),
      pendingOrders: Array.from(this.pendingOrders.values()),
      ticks: Array.from(this.ticks.values()),
      tickHistory: Object.fromEntries(this.tickHistory.entries()),
      marketDepth: this.marketDepth,
      commandQueue: this.commandQueue,
      riskGuard: this.riskGuard,
      riskGuardBreach: { ...this.riskBreachLatch },
      dataQuality: this.syntheticDataActive ? 'SYNTHETIC' : (this.allSymbols.length > 0 || this.chartHistory.length > 0 || this.account.login > 0 ? 'LIVE' : 'NONE'),
      logs: this.logs,
    };
  }

  public getTerminalPermissions(): MT5TerminalPermissions | null {
    return this.terminalPermissions;
  }

  public getChartDiagnostics(): MT5ChartDiagnostics | null {
    if (!this.currentChart) return null;
    const chart = this.currentChart;
    const serverTime = this.mt5ServerTime || Math.floor(Date.now() / 1000);
    const tzOffset = chart.timezoneOffsetHours ?? 0;
    const gmtTime = chart.gmtTime || (serverTime - tzOffset * 3600);
    const pSecs = chart.periodSeconds || 60;
    const barOpen = chart.currentBarTime || serverTime;
    const elapsed = Math.max(0, serverTime - barOpen);
    const remaining = Math.max(0, pSecs - elapsed);
    const progress = pSecs > 0 ? Math.min(100, Number(((elapsed / pSecs) * 100).toFixed(1))) : 0;
    const point = chart.point || 0.00001;
    const spreadPoints = chart.spread || 0;
    const spreadPips = point > 0 ? Number((spreadPoints * point * (chart.digits === 3 || chart.digits === 5 ? 10 : 1)).toFixed(2)) : 0;

    let modeStr: 'BARS' | 'CANDLESTICKS' | 'LINE' = 'CANDLESTICKS';
    if (chart.chartMode === 0) modeStr = 'BARS';
    else if (chart.chartMode === 2) modeStr = 'LINE';

    return {
      symbol: chart.symbol,
      timeframe: chart.timeframe,
      periodSeconds: pSecs,
      digits: chart.digits,
      point: chart.point,
      spreadPoints,
      spreadPips,
      serverTime,
      serverTimeIso: new Date(serverTime * 1000).toISOString(),
      gmtTime,
      gmtTimeIso: new Date(gmtTime * 1000).toISOString(),
      localTime: Math.floor(Date.now() / 1000),
      timezoneOffsetHours: tzOffset,
      currentBarOpenTime: barOpen,
      currentBarOpenTimeIso: chart.currentBarTimeIso || new Date(barOpen * 1000).toISOString(),
      currentBarSecondsElapsed: elapsed,
      currentBarSecondsRemaining: remaining,
      currentBarProgressPercent: progress,
      isBarClosed: false,
      firstVisibleBar: chart.chartFirstVisibleBar || 0,
      visibleBars: chart.chartVisibleBars || 60,
      priceMax: chart.chartPriceMax || 0,
      priceMin: chart.chartPriceMin || 0,
      scale: chart.chartScale || 3,
      mode: modeStr,
      autoscroll: chart.chartAutoscroll !== false,
      tickVolume: chart.tickVolume,
      realVolume: chart.realVolume,
    };
  }

  public getDataQuality(): 'LIVE' | 'SYNTHETIC' | 'NONE' {
    if (this.syntheticDataActive) return 'SYNTHETIC';
    const hasEaData = this.allSymbols.length > 0 || this.chartHistory.length > 0 || this.account.login > 0;
    return hasEaData ? 'LIVE' : 'NONE';
  }

  public getCurrentChart() {
    return this.currentChart;
  }

  public getAllSymbols() {
    return this.allSymbols;
  }

  public getChartHistory() {
    return this.chartHistory;
  }

  public getPendingOrders() {
    return Array.from(this.pendingOrders.values());
  }

  public getMarketDepth() {
    return this.marketDepth;
  }

  public getIndicators() {
    return this.indicators;
  }

  public getTicks() {
    return Array.from(this.ticks.values());
  }

  public getPositions() {
    return Array.from(this.positions.values());
  }

  public getAccount() {
    return this.account;
  }

  public getRiskGuard() {
    return this.riskGuard;
  }

  public requestHistoryFromEA(symbol: string, timeframe = 'M1', count = 100, from?: number, to?: number) {
    const payload: any = { timeframe, count };
    if (from && to) {
      payload.from = from;
      payload.to = to;
    }
    return this.enqueueCommand({
      action: 'FETCH_HISTORY',
      symbol: symbol.toUpperCase(),
      timeframe,
      count,
      from,
      to,
      comment: JSON.stringify(payload),
      source: 'AI_MCP',
    } as any);
  }

  // Instruct EA to track an additional symbol dynamically
  public trackSymbolInEA(symbol: string) {
    return this.enqueueCommand({
      action: 'TRACK_SYMBOL',
      symbol: symbol.toUpperCase(),
      source: 'MANUAL_UI',
      comment: JSON.stringify({ symbol: symbol.toUpperCase() }),
    });
  }

  // Instruct EA to activate authoritative breakeven protection on a specific position ticket
  public protectPositionViaEA(ticket: number) {
    return this.enqueueCommand({
      action: 'PROTECT_POSITION',
      ticket,
      source: 'MANUAL_UI',
      comment: JSON.stringify({ ticket }),
    });
  }

  /**
   * Seed synthetic candles for instant testing and AI model validation.
   *
   * The generated bars are a random walk: they contain no market information.
   * They are kept in memory only and are never written to `candles_history`,
   * because that table is the archive of real MT5 data and mixing the two
   * meant backtests, indicators and auto-detect profiles were silently
   * computed on random noise and presented as live analysis.
   */
  public async seedCandles(symbol: string, timeframe = 'M1', count = 60, basePrice = 1.085) {
    const sym = normalizeSymbol(symbol);
    const tf = normalizeTimeframe(timeframe) || 'M1';
    const barCount = Math.min(Math.max(Math.floor(Number(count)) || 60, 1), 5000);
    const intervalSec = tf === 'M5' ? 300 : tf === 'M15' ? 900 : tf === 'H1' ? 3600 : 60;
    const nowSec = Math.floor(Date.now() / 1000);
    const generated: CandleData[] = [];
    let cur = basePrice;

    for (let i = barCount - 1; i >= 0; i--) {
      const candleTime = nowSec - i * intervalSec;
      const change = (Math.random() - 0.49) * (cur * 0.001);
      const open = Number(cur.toFixed(5));
      const close = Number((cur + change).toFixed(5));
      const high = Number((Math.max(open, close) + Math.random() * (cur * 0.0005)).toFixed(5));
      const low = Number((Math.min(open, close) - Math.random() * (cur * 0.0005)).toFixed(5));
      const volume = Math.floor(50 + Math.random() * 200);

      generated.push({
        time: candleTime,
        timeIso: new Date(candleTime * 1000).toISOString(),
        open,
        high,
        low,
        close,
        volume,
      });
      cur = close;
    }

    this.chartHistory = generated;
    this.markSyntheticDataActive(true);
    this.indicators = calculateIndicators(this.chartHistory, sym, tf);
    this.addLog('info', `Seeded ${barCount} test candles`, `${sym} [${tf}] starting @ ${basePrice} (synthetic, not persisted)`, 'TEST_SIMULATOR');
    return {
      symbol: sym,
      timeframe: tf,
      count: generated.length,
      dataQuality: 'SYNTHETIC' as const,
      candles: generated,
      indicators: this.indicators,
    };
  }
}

export const tradeStore = new TradeStore();
