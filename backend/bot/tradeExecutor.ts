import { BotSignal, BotTrade, BotConfig } from './types.js';
import { tradeStore } from '../services/tradeStore.js';
import { commandDispatcher } from '../services/commandDispatcher.js';
import { calculatePositionSize } from '../knowledgebase/core/tradeSignal.js';
import { dbInsertOrder } from '../database/db.js';

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

    // Get contract size
    const symbolInfo = tradeStore.getAllSymbols().find((s: any) => s.symbol === signal.symbol);
    const contractSize = symbolInfo?.contractSize || 100000;

    // Calculate position size
    const sizing = calculatePositionSize(
      signal.symbol,
      tradeStore.getAccount().balance,
      this.config.riskPercent,
      signal.entryPrice,
      signal.stopLoss,
      contractSize
    );

    if (sizing.recommendedLots <= 0) return null;

    // Execute physical trade via unified command dispatcher
    const orderType = signal.direction === 'BUY' ? 'BUY' : 'SELL';
    const result = commandDispatcher.executeTrade({
      symbol: signal.symbol,
      orderType: orderType as any,
      volume: sizing.recommendedLots,
      sl: this.config.autoStopLoss ? signal.stopLoss : 0,
      tp: this.config.autoTakeProfit ? signal.takeProfit : 0,
      source: 'BOT',
      comment: `BOT_${signal.direction}_${signal.confidence}`,
    });

    const trade: BotTrade = {
      id: `bot-trade-${++this.tradeCounter}-${Date.now()}`,
      signalId: signal.id,
      symbol: signal.symbol,
      direction: signal.direction as 'BUY' | 'SELL',
      volume: sizing.recommendedLots,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      commandId: result.commandId,
      status: result.success ? 'PENDING' : 'FAILED',
      profit: 0,
      openedAt: Date.now(),
    };

    this.trades.set(trade.id, trade);

    // Mark signal as acted on
    signal.actedOn = true;
    signal.tradeId = trade.id;

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
    } catch (err) {
      console.error('[TradeExecutor] Failed to persist trade:', err);
    }

    tradeStore.addLog(
      'trade',
      `Bot Auto-Trade: ${signal.direction} ${signal.symbol}`,
      `Confidence: ${signal.confidence}% | Lots: ${sizing.recommendedLots} | SL: ${signal.stopLoss} | TP: ${signal.takeProfit} | RR: ${signal.riskRewardRatio}`,
      'BOT'
    );

    return trade;
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
      if (status === 'EXECUTED' || status === 'FAILED' || status === 'CANCELLED') {
        trade.closedAt = Date.now();
      }
    }
  }

  public getStats(): { totalTrades: number; activeTrades: number; totalProfit: number; winRate: number } {
    const trades = Array.from(this.trades.values());
    const closed = trades.filter((t) => t.status === 'EXECUTED' && t.closedAt);
    const wins = closed.filter((t) => t.profit > 0).length;
    const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);

    return {
      totalTrades: trades.length,
      activeTrades: trades.filter((t) => t.status === 'PENDING' || t.status === 'EXECUTED').length,
      totalProfit: Number(totalProfit.toFixed(2)),
      winRate: closed.length > 0 ? Number(((wins / closed.length) * 100).toFixed(1)) : 0,
    };
  }
}
