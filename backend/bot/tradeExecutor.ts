import { BotSignal, BotTrade, BotConfig } from './types.js';
import { tradeStore } from '../services/tradeStore.js';
import { commandDispatcher } from '../services/commandDispatcher.js';
import { dbInsertBotTrade, dbUpdateBotTrade, dbGetBotTrades } from '../database/db.js';
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

    // Spread Guard: adjust allowed threshold based on mode
    const spreadKnown = symbolInfo !== undefined && typeof symbolInfo.spread === 'number' && symbolInfo.spread > 0;
    const currentSpread = symbolInfo?.spread || 0;
    if (!spreadKnown) {
      tradeStore.addLog(
        'warn',
        `Bot Spread Protection [${mode}] Skipped`,
        `Skipped trade for ${signal.symbol}: symbol not in tracked EA symbol list or spread unknown — cannot evaluate spread guard. Add ${signal.symbol} to MT5 Market Watch or ensure EA is streaming symbol specs.`,
        'BOT'
      );
      return null;
    }
    let maxAllowedSpread = (symbolInfo?.symbol?.includes('XAU') ? 100 : symbolInfo?.symbol?.includes('JPY') ? 40 : 35);
    if (effectiveSubMode === 'SCALPER') {
      // Scalping requires tight spreads
      const scalperCap = this.config.scalperSettings?.maxSpreadPoints || 20;
      maxAllowedSpread = Math.min(maxAllowedSpread, symbolInfo?.symbol?.includes('XAU') ? 60 : scalperCap);
    } else if (effectiveSubMode === 'SWING_TRADES') {
      // Swing trades can tolerate slightly wider spreads
      maxAllowedSpread = Math.round(maxAllowedSpread * 1.5);
    }

    if (currentSpread > maxAllowedSpread) {
      tradeStore.addLog(
        'warn',
        `Bot Spread Protection [${mode}] Triggered`,
        `Skipped trade for ${signal.symbol}: live spread (${currentSpread} pts) exceeds ${effectiveSubMode} threshold (${maxAllowedSpread} pts)`,
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

    // Persist to DB using dedicated bot_trades table
    try {
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
      console.error('[TradeExecutor] Failed to persist bot trade:', err);
    }

    tradeStore.addLog(
      'trade',
      `Bot Auto-Trade [${mode}]: ${signal.direction} ${signal.symbol}`,
      `Horizon: ${effectiveSubMode} | Confidence: ${signal.confidence}% | Lots: ${sizing.recommendedLots} | SL: ${finalSl} | TP: ${finalTp} | RR: ${signal.riskRewardRatio}`,
      'BOT'
    );

    return trade;
  }

  public async hydrateTradesFromDb(): Promise<void> {
    try {
      const rows = await dbGetBotTrades(100);
      for (const r of rows) {
        if (!this.trades.has(r.id)) {
          this.trades.set(r.id, {
            id: r.id,
            signalId: r.signalId,
            symbol: r.symbol,
            direction: r.direction as 'BUY' | 'SELL',
            volume: Number(r.volume),
            entryPrice: Number(r.entryPrice),
            stopLoss: Number(r.stopLoss || 0),
            takeProfit: Number(r.takeProfit || 0),
            commandId: r.commandId,
            status: r.status as any,
            profit: Number(r.profit || 0),
            openedAt: Number(r.openedAt),
            closedAt: r.closedAt ? Number(r.closedAt) : undefined,
            mode: 'DAY_TRADES',
          });
        }
      }
    } catch (err) {
      console.warn('[TradeExecutor] Failed to hydrate bot trades from DB:', err);
    }
  }

  public getTrades(): BotTrade[] {
    return Array.from(this.trades.values());
  }

  public getActiveTrades(): BotTrade[] {
    return Array.from(this.trades.values()).filter((t) => t.status === 'PENDING' || (t.status === 'EXECUTED' && !t.closedAt));
  }

  public getTrade(id: string): BotTrade | undefined {
    return this.trades.get(id);
  }

  public handleExecutionResult(commandId: string, res: any): void {
    const trade = Array.from(this.trades.values()).find((t) => t.commandId === commandId);
    if (trade) {
      if (res.success) {
        trade.status = 'EXECUTED';
        if (res.executionPrice && res.executionPrice > 0) trade.entryPrice = res.executionPrice;
        if (res.dealTicket) trade.ticket = res.dealTicket;
        else if (res.orderTicket) trade.ticket = res.orderTicket;
      } else {
        trade.status = 'FAILED';
        trade.closedAt = Date.now();
        trade.errorMessage = res.errorMessage || `Error ${res.errorCode}`;
      }
      dbUpdateBotTrade(trade.id, {
        status: trade.status,
        profit: trade.profit,
        closedAt: trade.closedAt,
      }).catch((e) => console.error('[TradeExecutor] DB update bot trade error:', e));
    }
  }

  public updateTradeStatus(id: string, status: BotTrade['status'], profit?: number): void {
    const trade = this.trades.get(id);
    if (trade) {
      trade.status = status;
      if (profit !== undefined) trade.profit = profit;
      if (status === 'FAILED' || status === 'CANCELLED') {
        trade.closedAt = Date.now();
      }
      dbUpdateBotTrade(trade.id, {
        status: trade.status,
        profit: trade.profit,
        closedAt: trade.closedAt,
      }).catch((e) => console.error('[TradeExecutor] DB update bot trade status error:', e));
    }
  }

  public closeTrade(id: string, profit?: number): void {
    const trade = this.trades.get(id);
    if (trade && !trade.closedAt) {
      trade.closedAt = Date.now();
      if (profit !== undefined) trade.profit = profit;
      dbUpdateBotTrade(trade.id, {
        status: trade.status,
        profit: trade.profit,
        closedAt: trade.closedAt,
      }).catch((e) => console.error('[TradeExecutor] DB close bot trade error:', e));
    }
  }

  public reconcileDeals(closedDeals: any[]): void {
    if (!Array.isArray(closedDeals) || closedDeals.length === 0) return;
    const trades = Array.from(this.trades.values());

    for (const deal of closedDeals) {
      const posId = deal.positionId || deal.order;
      if (!posId) continue;

      const matchingTrade = trades.find(
        (t) =>
          t.ticket === posId ||
          t.ticket === deal.ticket ||
          (t.symbol === deal.symbol && !t.closedAt && Math.abs(t.volume - deal.volume) < 0.001)
      );

      if (matchingTrade && !matchingTrade.closedAt) {
        matchingTrade.status = 'EXECUTED';
        const netProfit = (deal.profit || 0) + (deal.swap || 0) + (deal.commission || 0) + (deal.fee || 0);
        matchingTrade.profit = Number(netProfit.toFixed(2));
        matchingTrade.closedAt = deal.time ? deal.time * 1000 : Date.now();
        if (deal.price && deal.price > 0) matchingTrade.exitPrice = deal.price;

        dbUpdateBotTrade(matchingTrade.id, {
          status: matchingTrade.status,
          profit: matchingTrade.profit,
          closedAt: matchingTrade.closedAt,
        }).catch((e) => console.error('[TradeExecutor] DB update reconciled deal error:', e));
      }
    }
  }

  public getStats(): { totalTrades: number; activeTrades: number; totalProfit: number; winRate: number } {
    const trades = Array.from(this.trades.values());
    const closed = trades.filter((t) => t.status === 'EXECUTED' && t.closedAt);
    const wins = closed.filter((t) => t.profit > 0).length;
    const totalProfit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);

    return {
      totalTrades: trades.length,
      activeTrades: trades.filter((t) => t.status === 'PENDING' || (t.status === 'EXECUTED' && !t.closedAt)).length,
      totalProfit: Number(totalProfit.toFixed(2)),
      winRate: closed.length > 0 ? Number(((wins / closed.length) * 100).toFixed(1)) : 0,
    };
  }
}
