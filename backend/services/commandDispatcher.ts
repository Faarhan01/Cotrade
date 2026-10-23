import { tradeStore } from './tradeStore.js';
import { broadcast } from './websocketServer.js';
import { OrderType, TradeCommand } from '../types/mt5.js';
import { normalizeSymbol } from '../utils/symbol.js';
import { normalizeTimeframe } from '../utils/timeframe.js';

export interface DispatchResult {
  success: boolean;
  commandId?: string;
  error?: string;
  message?: string;
  status: 'queued' | 'rejected';
  timestamp: number;
}

export interface ExecuteTradeParams {
  symbol: string;
  orderType: 'BUY' | 'SELL' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  comment?: string;
  magic?: number;
  slippage?: number;
  source: 'MANUAL_UI' | 'BOT' | 'AI_MCP' | 'RISK_GUARD';
}

export interface ModifyPositionParams {
  ticket: number;
  sl?: number;
  tp?: number;
  source: 'MANUAL_UI' | 'BOT' | 'AI_MCP' | 'RISK_GUARD';
  comment?: string;
}

export interface ClosePositionParams {
  ticket: number;
  volume?: number;
  source: 'MANUAL_UI' | 'BOT' | 'AI_MCP' | 'RISK_GUARD';
  comment?: string;
}

export interface CloseAllParams {
  symbol?: string; // symbol or 'ALL'
  source: 'MANUAL_UI' | 'BOT' | 'AI_MCP' | 'RISK_GUARD';
  comment?: string;
}

export interface CancelPendingParams {
  ticket: number;
  source: 'MANUAL_UI' | 'BOT' | 'AI_MCP' | 'RISK_GUARD';
  comment?: string;
}

export interface RequestHistoryParams {
  symbol: string;
  timeframe?: string;
  count?: number;
  source: 'MANUAL_UI' | 'BOT' | 'AI_MCP' | 'RISK_GUARD';
}

/**
 * CommandDispatcher
 * The single, unified authority for dispatching commands to MetaTrader 5 EA.
 * Both the Web UI, the AI MCP server, and the Automated Trading Bot route
 * through this exact same pipeline, preventing diverging logic, unvalidated orders,
 * or inconsistent risk checks.
 */
export class CommandDispatcher {
  /**
   * Execute a market or pending trade order
   */
  public executeTrade(params: ExecuteTradeParams): DispatchResult {
    const rawSymbol = String(params.symbol || '').trim();
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) {
      return {
        success: false,
        error: 'A valid trading symbol ticker is required.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    const orderType = String(params.orderType || '').toUpperCase() as OrderType;
    const validTypes: OrderType[] = ['BUY', 'SELL', 'BUY_LIMIT', 'SELL_LIMIT', 'BUY_STOP', 'SELL_STOP'];
    if (!validTypes.includes(orderType)) {
      return {
        success: false,
        error: `Invalid order type "${params.orderType}". Must be one of: ${validTypes.join(', ')}`,
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    const volume = Number(params.volume);
    if (!Number.isFinite(volume) || volume <= 0) {
      return {
        success: false,
        error: `Invalid trade volume: "${params.volume}". Must be a positive decimal number (e.g. 0.01, 0.1, 1.0).`,
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    // Delegate to central store queue
    const res = tradeStore.enqueueCommand({
      action: 'EXECUTE_TRADE',
      symbol,
      orderType,
      volume,
      price: params.price ? Number(params.price) : undefined,
      sl: params.sl !== undefined ? Number(params.sl) : undefined,
      tp: params.tp !== undefined ? Number(params.tp) : undefined,
      comment: params.comment ? String(params.comment).trim() : `${params.source}_ORDER`,
      magic: params.magic || (params.source === 'BOT' ? 889911 : 889900),
      slippage: params.slippage || 10,
      source: params.source,
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error || 'Execution blocked by Risk Guard policy.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    this.notifyCommandQueued(res.commandId!);

    return {
      success: true,
      commandId: res.commandId,
      message: `Asynchronous order queued for MT5 dispatch: ${orderType} ${volume} ${symbol}`,
      status: 'queued',
      timestamp: Date.now(),
    };
  }

  /**
   * Modify stop loss or take profit of an active position ticket
   */
  public modifyPosition(params: ModifyPositionParams): DispatchResult {
    const ticket = Number(params.ticket);
    if (!ticket || ticket <= 0) {
      return {
        success: false,
        error: 'A valid numeric position ticket is required.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    const res = tradeStore.enqueueCommand({
      action: 'MODIFY_POSITION',
      ticket,
      sl: params.sl !== undefined ? Number(params.sl) : undefined,
      tp: params.tp !== undefined ? Number(params.tp) : undefined,
      source: params.source,
      comment: params.comment || `${params.source}_MODIFY`,
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error || 'Modify position failed.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    this.notifyCommandQueued(res.commandId!);

    return {
      success: true,
      commandId: res.commandId,
      message: `Modification queued for position #${ticket} (SL: ${params.sl ?? 'unchanged'}, TP: ${params.tp ?? 'unchanged'})`,
      status: 'queued',
      timestamp: Date.now(),
    };
  }

  /**
   * Close an open position by ticket
   */
  public closePosition(params: ClosePositionParams): DispatchResult {
    const ticket = Number(params.ticket);
    if (!ticket || ticket <= 0) {
      return {
        success: false,
        error: 'A valid numeric position ticket is required.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    const res = tradeStore.enqueueCommand({
      action: 'CLOSE_POSITION',
      ticket,
      volume: params.volume ? Number(params.volume) : undefined,
      source: params.source,
      comment: params.comment || `${params.source}_CLOSE`,
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error || 'Close position failed.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    this.notifyCommandQueued(res.commandId!);

    return {
      success: true,
      commandId: res.commandId,
      message: `Close command queued for position ticket #${ticket}`,
      status: 'queued',
      timestamp: Date.now(),
    };
  }

  /**
   * Liquidate all open positions or all positions for a specific symbol
   */
  public closeAll(params: CloseAllParams): DispatchResult {
    const rawSym = params.symbol ? String(params.symbol).trim().toUpperCase() : 'ALL';
    const symbol = rawSym === 'ALL' || rawSym === '*' ? 'ALL' : normalizeSymbol(rawSym);

    const res = tradeStore.enqueueCommand({
      action: 'CLOSE_ALL',
      symbol,
      source: params.source,
      comment: params.comment || `${params.source}_CLOSE_ALL`,
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error || 'Bulk liquidation failed.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    this.notifyCommandQueued(res.commandId!);

    return {
      success: true,
      commandId: res.commandId,
      message: `Emergency liquidation queued for symbol filter: ${symbol}`,
      status: 'queued',
      timestamp: Date.now(),
    };
  }

  /**
   * Cancel an active pending limit or stop order
   */
  public cancelPendingOrder(params: CancelPendingParams): DispatchResult {
    const ticket = Number(params.ticket);
    if (!ticket || ticket <= 0) {
      return {
        success: false,
        error: 'A valid numeric pending order ticket is required.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    const res = tradeStore.enqueueCommand({
      action: 'CANCEL_PENDING',
      ticket,
      source: params.source,
      comment: params.comment || `${params.source}_CANCEL_PENDING`,
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error || 'Cancel pending order failed.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    this.notifyCommandQueued(res.commandId!);

    return {
      success: true,
      commandId: res.commandId,
      message: `Cancellation queued for pending order #${ticket}`,
      status: 'queued',
      timestamp: Date.now(),
    };
  }

  /**
   * Request historical candle data from MetaTrader 5 on-demand
   */
  public requestHistory(params: RequestHistoryParams): DispatchResult {
    const symbol = normalizeSymbol(params.symbol);
    if (!symbol) {
      return {
        success: false,
        error: 'A valid symbol ticker is required for history request.',
        status: 'rejected',
        timestamp: Date.now(),
      };
    }

    const timeframe = normalizeTimeframe(params.timeframe || 'M1') || 'M1';
    const count = Math.min(Math.max(Number(params.count) || 100, 10), 1000);

    const res = tradeStore.requestHistoryFromEA(symbol, timeframe, count);

    this.notifyCommandQueued(res.commandId!);

    return {
      success: true,
      commandId: res.commandId,
      message: `Requested ${count} candles for ${symbol} [${timeframe}] from MT5 EA. Data will stream on next sync.`,
      status: 'queued',
      timestamp: Date.now(),
    };
  }

  /**
   * Helper to dispatch generic command from HTTP or other sources
   */
  public dispatchGeneric(body: any, defaultSource: 'MANUAL_UI' | 'BOT' | 'AI_MCP' = 'MANUAL_UI'): DispatchResult {
    const action = String(body.action || 'EXECUTE_TRADE').toUpperCase();
    const source = (body.source || defaultSource) as any;

    switch (action) {
      case 'EXECUTE_TRADE':
        return this.executeTrade({
          symbol: body.symbol,
          orderType: body.orderType,
          volume: body.volume,
          price: body.price,
          sl: body.sl,
          tp: body.tp,
          comment: body.comment,
          magic: body.magic,
          slippage: body.slippage,
          source,
        });

      case 'MODIFY_POSITION':
        return this.modifyPosition({
          ticket: body.ticket,
          sl: body.sl,
          tp: body.tp,
          comment: body.comment,
          source,
        });

      case 'CLOSE_POSITION':
        return this.closePosition({
          ticket: body.ticket,
          volume: body.volume,
          comment: body.comment,
          source,
        });

      case 'CLOSE_ALL':
        return this.closeAll({
          symbol: body.symbol,
          comment: body.comment,
          source,
        });

      case 'CANCEL_PENDING':
        return this.cancelPendingOrder({
          ticket: body.ticket,
          comment: body.comment,
          source,
        });

      case 'FETCH_HISTORY':
        return this.requestHistory({
          symbol: body.symbol,
          timeframe: body.timeframe,
          count: body.count,
          source,
        });

      default:
        return {
          success: false,
          error: `Unsupported trade action "${action}".`,
          status: 'rejected',
          timestamp: Date.now(),
        };
    }
  }

  /**
   * Broadcast WebSocket notification for newly queued command
   */
  private notifyCommandQueued(commandId: string): void {
    const queuedCmd = tradeStore.getState().commandQueue.find((c) => c.id === commandId);
    if (queuedCmd) {
      broadcast({
        type: 'command:queued',
        payload: queuedCmd,
      });
    }
  }

  /**
   * Get recent commands status
   */
  public getQueue(limit = 20): TradeCommand[] {
    return tradeStore.getState().commandQueue.slice(0, limit);
  }

  /**
   * Find specific command status
   */
  public getCommandStatus(id: string): TradeCommand | undefined {
    return tradeStore.getState().commandQueue.find((c) => c.id === id);
  }
}

export const commandDispatcher = new CommandDispatcher();
