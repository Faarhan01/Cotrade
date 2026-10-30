import { BotSignal, BotTrade, BotConfig } from './types.js';
import { tradeStore } from '../services/tradeStore.js';
import { commandDispatcher } from '../services/commandDispatcher.js';
import { dbInsertOrder } from '../database/db.js';
import { calculatePositionSizeByRisk, validateAndAdjustStops } from '../utils/symbolEconomics.js';

export class TradeExecutor {
  private config: BotConfig;
  private trades: Map<string, BotTrade> = new Map();
  private tradeCounter: number = 0;

  constructor(config: BotConfig) {
    this.config = config;
  }

  public updateConfig(config: BotConfig): void {
    this.config = config;
  }

  public async executeSignal(signal: BotSignal): Promise<BotTrade | null> {
    if (signal.direction === 'HOLD') return null;
    if (signal.confidence < this.config.minConfidence) return null;

    // Check if we already have a position on this symbol
    const positions = tradeStore.getPositions();
    const existingOnSymbol = positions.filter((p: any) => p.symbol === signal.symbol);
    if (existingOnSymbol.length >= this.config.maxTradesPerSymbol) return null;

    // Check max open positions
    if (positions.length >= this.config.maxOpenPositions) return null;

    // Get live symbol specifications from MT5
    const symbolInfo = tradeStore.getAllSymbols().find((s: any) => s.symbol === signal.symbol);

    // Enforce broker trade mode (Gap 3)
    if (symbolInfo) {
      if (symbolInfo.tradeMode === 'CLOSEONLY' || symbolInfo.tradeAllowed === false) {
        tradeStore.addLog(
          'warn',
          `Bot Trade Skipped: ${signal.symbol}`,
          `Broker trade mode is CLOSEONLY or trading disabled. New entries prohibited.`,
          'BOT'
        );
        return null;
      }
      if (symbolInfo.tradeMode === 'LONGONLY' && signal.direction === 'SELL') {
        tradeStore.addLog(
          'warn',
          `Bot Trade Skipped: ${signal.symbol}`,
          `Broker trade mode is LONGONLY. Sell signal suppressed.`,
          'BOT'
        );
        return null;
      }
      if (symbolInfo.tradeMode === 'SHORTONLY' && signal.direction === 'BUY') {
        tradeStore.addLog(
          'warn',
          `Bot Trade Skipped: ${signal.symbol}`,
          `Broker trade mode is SHORTONLY. Buy signal suppressed.`,
          'BOT'
        );
        return null;
      }
    }
    
    const mode = this.config.mode || 'DAY_TRADES';
    let effectiveSubMode: 'SCALPER' | 'DAY_TRADES' | 'SWING_TRADES' = 'DAY_TRADES';

    if (mode === 'SCALPER') {
      effectiveSubMode = 'SCALPER';
    } else if (mode === 'SWING_TRADES') {
      effectiveSubMode = 'SWING_TRADES';
    } else if (mode === 'MIXED_OPTIONS') {
      // Mixed Options: dynamically evaluate current market regime from KnowledgeBase
      try {
        const { autoDetectMarketRegime } = await import('../knowledgebase/core/auto-detect.js');
        const candles = tradeStore.getChartHistory();
        const regime = autoDetectMarketRegime(signal.symbol, candles);
        if (regime.regime === 'COMPRESSION_SQUEEZE' || regime.regime === 'MEAN_REVERTING_RANGE') {
          effectiveSubMode = 'SCALPER';
        } else if (regime.regime === 'VOLATILITY_EXPANSION_BREAKOUT') {
          effectiveSubMode = 'DAY_TRADES';
        } else if (regime.trendStrength >= 70) {
          effectiveSubMode = 'SWING_TRADES';
        } else {
          effectiveSubMode = 'DAY_TRADES';
        }
      } catch {
        effectiveSubMode = 'DAY_TRADES';
      }
    } else {
      effectiveSubMode = 'DAY_TRADES';
    }

    // Spread Guard: dynamically resolve spread from symbolInfo, live ticks, or nominal baseline
    const liveTick = tradeStore.getTicks().find((t: any) => t.symbol?.toUpperCase() === signal.symbol?.toUpperCase());
    const point = symbolInfo?.point || (signal.symbol.includes('JPY') ? 0.001 : 0.00001);
    const tickSpread = (liveTick?.spread && liveTick.spread > 0)
      ? liveTick.spread
      : (liveTick?.bid && liveTick?.ask && liveTick.ask > liveTick.bid && point > 0)
      ? Math.round((liveTick.ask - liveTick.bid) / point)
      : 0;

    const currentSpread = (symbolInfo?.spread && symbolInfo.spread > 0)
      ? symbolInfo.spread
      : tickSpread > 0
      ? tickSpread
      : 15; // Default major pair nominal spread if broker hasn't pushed symbol spec yet

    let maxAllowedSpread = (signal.symbol.includes('XAU') ? 100 : signal.symbol.includes('JPY') ? 45 : 35);
    if (effectiveSubMode === 'SCALPER') {
      // Scalping requires tight spreads
      const scalperCap = this.config.scalperSettings?.maxSpreadPoints || 25;
      maxAllowedSpread = Math.min(maxAllowedSpread, signal.symbol.includes('XAU') ? 70 : scalperCap);
    } else if (effectiveSubMode === 'SWING_TRADES') {
      // Swing trades can tolerate slightly wider spreads
      maxAllowedSpread = Math.round(maxAllowedSpread * 1.8);
    }

    if (currentSpread > maxAllowedSpread) {
      tradeStore.addLog(
        'warn',
        `Bot Spread Protection [${mode}] Triggered`,
        `Skipped trade for ${signal.symbol}: live spread (${currentSpread} pts) exceeds ${effectiveSubMode} threshold (${maxAllowedSpread} pts). Waiting for optimal liquidity.`,
        'BOT'
      );
      return null;
    }

    // Session filter for Day Trading if enabled
    if (effectiveSubMode === 'DAY_TRADES' && this.config.dayTradeSettings?.sessionFilter) {
      const utcHour = new Date().getUTCHours();
      // Peak sessions: 07:00 - 20:00 UTC (London + NY)
      const isPeakLiquidity = utcHour >= 7 && utcHour <= 20;
      if (!isPeakLiquidity) {
        tradeStore.addLog(
          'info',
          `Day Trade Session Filter: ${signal.symbol} held`,
          `Current time (${utcHour}:00 UTC) is outside peak London/New York liquidity window. Entry held.`,
          'BOT'
        );
        return null;
      }
    }

    const orderType = (signal.direction === 'BUY' ? 'BUY' : 'SELL') as 'BUY' | 'SELL';
    const entryPrice = signal.entryPrice;

    // Mode-tailored SL / TP adjustments
    let targetSl = signal.stopLoss;
    let targetTp = signal.takeProfit;

    if (effectiveSubMode === 'SCALPER' && signal.stopLoss > 0 && signal.takeProfit > 0) {
      // Tighten bracket for scalping
      const slDist = Math.abs(entryPrice - signal.stopLoss);
      const scalperSlDist = slDist * (this.config.scalperSettings?.slAtrMultiplier || 0.85);
      const scalperTpDist = scalperSlDist * (this.config.scalperSettings?.tpAtrMultiplier || 1.5);
      targetSl = orderType === 'BUY' ? entryPrice - scalperSlDist : entryPrice + scalperSlDist;
      targetTp = orderType === 'BUY' ? entryPrice + scalperTpDist : entryPrice - scalperTpDist;
    } else if (effectiveSubMode === 'SWING_TRADES' && signal.stopLoss > 0 && signal.takeProfit > 0) {
      // Expand bracket for swing trading
      const slDist = Math.abs(entryPrice - signal.stopLoss);
      const swingSlDist = slDist * (this.config.swingTradeSettings?.slAtrMultiplier || 1.8);
      const swingTpDist = slDist * (this.config.swingTradeSettings?.tpAtrMultiplier || 3.5);
      targetSl = orderType === 'BUY' ? entryPrice - swingSlDist : entryPrice + swingSlDist;
      targetTp = orderType === 'BUY' ? entryPrice + swingTpDist : entryPrice - swingTpDist;
    }

    // Symbol-aware position sizing
    const sizing = calculatePositionSizeByRisk({
      symbol: signal.symbol,
      balance: tradeStore.getAccount().balance || 10000,
      riskPercent: this.config.riskPercent,
      entryPrice,
      stopLossPrice: targetSl,
      takeProfitPrice: targetTp,
      symbolInfo,
    });

    if (sizing.recommendedLots <= 0) return null;

    // Validate and adjust SL/TP so MT5 never rejects with error 10016
    let finalSl = this.config.autoStopLoss ? targetSl : 0;
    let finalTp = this.config.autoTakeProfit ? targetTp : 0;

    if (finalSl > 0 || finalTp > 0) {
      const stopsCheck = validateAndAdjustStops({
        symbol: signal.symbol,
        orderType,
        entryPrice,
        sl: finalSl,
        tp: finalTp,
        symbolInfo,
      });
      finalSl = stopsCheck.sl;
      finalTp = stopsCheck.tp;
      if (stopsCheck.adjusted) {
        tradeStore.addLog('info', 'Stops Auto-Adjusted', `${signal.symbol} [${mode}]: ${stopsCheck.reason}`, 'BOT');
      }
    }

    // Execute physical trade via unified command dispatcher
    const orderComment = mode === 'MIXED_OPTIONS'
      ? `BOT_MIXED_${effectiveSubMode}_${signal.direction}`
      : `BOT_${mode}_${signal.direction}_${signal.confidence}`;

    const result = commandDispatcher.executeTrade({
      symbol: signal.symbol,
      orderType,
      volume: sizing.recommendedLots,
      sl: finalSl,
      tp: finalTp,
      source: 'BOT',
      comment: orderComment,
    });

    const trade: BotTrade = {
      id: `bot-trade-${++this.tradeCounter}-${Date.now()}`,
      signalId: signal.id,
      symbol: signal.symbol,
      direction: signal.direction as 'BUY' | 'SELL',
      volume: sizing.recommendedLots,
      entryPrice: signal.entryPrice,
      stopLoss: finalSl,
      takeProfit: finalTp,
      commandId: result.commandId,
      status: result.success ? 'PENDING' : 'FAILED',
      profit: 0,
      openedAt: Date.now(),
      mode,
    };

    this.trades.set(trade.id, trade);

    // Mark signal as acted on
    signal.actedOn = true;
    signal.tradeId = trade.id;
    signal.mode = mode;

    // Persist to DB
    try {
      await dbInsertOrder({
        id: trade.id,
        action: 'EXECUTE_TRADE',
        symbol: trade.symbol,
        orderType: trade.direction,
        volume: trade.volume,
        price: trade.entryPrice,
        sl: trade.stopLoss,
        tp: trade.takeProfit,
        status: trade.status.toLowerCase(),
        source: 'BOT',
        createdAt: trade.openedAt,
      });

      const { dbInsertBotTrade } = await import('../database/db.js');
      await dbInsertBotTrade({
        id: trade.id,
        signalId: trade.signalId,
        symbol: trade.symbol,
        direction: trade.direction,
        volume: trade.volume,
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        commandId: trade.commandId,
        status: trade.status,
        openedAt: trade.openedAt,
      });
    } catch (err) {
      console.error('[TradeExecutor] Failed to persist trade:', err);
    }

    tradeStore.addLog(
      'trade',
      `Bot Auto-Trade [${mode}]: ${signal.direction} ${signal.symbol}`,
      `Horizon: ${effectiveSubMode} | Confidence: ${signal.confidence}% | Lots: ${sizing.recommendedLots} | SL: ${finalSl} | TP: ${finalTp} | RR: ${signal.riskRewardRatio}`,
      'BOT'
    );

    return trade;
  }

  public async loadFromDb(): Promise<void> {
    try {
      const { dbGetBotTrades } = await import('../database/db.js');
      const rows = await dbGetBotTrades(300);
      for (const r of rows) {
        if (!this.trades.has(r.id)) {
          this.trades.set(r.id, {
            id: r.id,
            signalId: r.signalId,
            symbol: r.symbol,
            direction: r.direction as 'BUY' | 'SELL',
            volume: r.volume,
            entryPrice: r.entryPrice,
            stopLoss: r.stopLoss || 0,
            takeProfit: r.takeProfit || 0,
            commandId: r.commandId,
            status: r.status as any,
            profit: r.profit || 0,
            openedAt: r.openedAt,
            closedAt: r.closedAt,
            mode: 'DAY_TRADES',
          });
        }
      }
    } catch (err) {
      console.warn('[TradeExecutor] Failed to load trades from DB:', err);
    }
  }

  public getTrades(): BotTrade[] {
    return Array.from(this.trades.values());
  }

  public getActiveTrades(): BotTrade[] {
    return Array.from(this.trades.values()).filter((t) => t.status === 'PENDING' || t.status === 'EXECUTED');
  }

  public getTrade(id: string): BotTrade | undefined {
    return this.trades.get(id);
  }

  public updateTradeStatus(id: string, status: BotTrade['status'], profit?: number): void {
    const trade = this.trades.get(id);
    if (trade) {
      trade.status = status;
      if (profit !== undefined) trade.profit = profit;
      if (status === 'CLOSED' || status === 'FAILED' || status === 'CANCELLED') {
        trade.closedAt = Date.now();
      }
    }
  }

  public getStats(): { totalTrades: number; executedTrades: number; activeTrades: number; totalProfit: number; winRate: number } {
    const trades = Array.from(this.trades.values());
    const executed = trades.filter((t) => t.status === 'EXECUTED' || t.status === 'CLOSED');
    const closed = trades.filter((t) => t.status === 'CLOSED');
    const wins = closed.filter((t) => t.profit > 0).length;
    const totalProfit = closed.reduce((sum, t) => sum + t.profit, 0);

    return {
      totalTrades: trades.length,
      executedTrades: executed.length,
      activeTrades: trades.filter((t) => t.status === 'PENDING' || t.status === 'EXECUTED').length,
      totalProfit: Number(totalProfit.toFixed(2)),
      winRate: closed.length > 0 ? Number(((wins / closed.length) * 100).toFixed(1)) : 0,
    };
  }
}
