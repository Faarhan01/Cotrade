import React, { useState, useEffect, useCallback } from 'react';
import { Position, PendingOrder } from '../../types';
import { api } from '../../services/api';
import {
  SlidersHorizontal,
  XCircle,
  TrendingUp,
  Shield,
  ShieldCheck,
  Zap,
  Layers,
  Check,
  AlertCircle,
  Clock,
  Trash2,
  History,
  RotateCw,
} from 'lucide-react';
import { getSymbolDigits, getSymbolPoint } from '../../utils/symbolEconomics';

interface OpenPositionsTableProps {
  positions: Position[];
  pendingOrders?: PendingOrder[];
  onSelectSymbol?: (symbol: string) => void;
}

export const OpenPositionsTable: React.FC<OpenPositionsTableProps> = ({
  positions,
  pendingOrders = [],
  onSelectSymbol,
}) => {
  const [viewTab, setViewTab] = useState<'POSITIONS' | 'PENDING' | 'HISTORY'>('POSITIONS');
  const [closedPositions, setClosedPositions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [modifySL, setModifySL] = useState<string>('');
  const [modifyTP, setModifyTP] = useState<string>('');
  const [isModifying, setIsModifying] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [closingTickets, setClosingTickets] = useState<Record<number, boolean>>({});
  const [lockingTickets, setLockingTickets] = useState<Record<number, boolean>>({});
  const [cancellingTickets, setCancellingTickets] = useState<Record<number, boolean>>({});
  const [confirmingCloseAll, setConfirmingCloseAll] = useState(false);
  const [closingPartialTickets, setClosingPartialTickets] = useState<Record<number, boolean>>({});

  const loadClosedHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await api.getPositionsHistory(100);
      if (res?.history) {
        setClosedPositions(res.history);
      }
    } catch (e) {
      console.warn('Failed to load closed positions history:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadClosedHistory();
  }, [loadClosedHistory]);

  // Pending Order Modify State
  const [selectedPendingOrder, setSelectedPendingOrder] = useState<PendingOrder | null>(null);
  const [modifyPendingPrice, setModifyPendingPrice] = useState<string>('');
  const [modifyPendingSL, setModifyPendingSL] = useState<string>('');
  const [modifyPendingTP, setModifyPendingTP] = useState<string>('');
  const [isModifyingPending, setIsModifyingPending] = useState(false);

  // Custom Partial Close State
  const [customClosePosition, setCustomClosePosition] = useState<Position | null>(null);
  const [customCloseVolume, setCustomCloseVolume] = useState<string>('');
  const [isExecutingCustomClose, setIsExecutingCustomClose] = useState(false);

  const handleQuickBreakeven = async (pos: Position) => {
    try {
      setLockingTickets((prev) => ({ ...prev, [pos.ticket]: true }));
      // Use EA's authoritative native PROTECT_POSITION handler
      const res = await api.protectPosition(pos.ticket);
      if (!res.success) {
        // Fallback to command queue
        await api.sendCommand({
          action: 'PROTECT_POSITION',
          ticket: pos.ticket,
          source: 'MANUAL_UI',
        });
      }
    } catch (e) {
      console.error('Failed to set breakeven:', e);
    } finally {
      setTimeout(() => {
        setLockingTickets((prev) => ({ ...prev, [pos.ticket]: false }));
      }, 1200);
    }
  };

  const handleOpenModifyModal = (pos: Position) => {
    setSelectedPosition(pos);
    setModifySL(pos.sl > 0 ? pos.sl.toString() : '');
    setModifyTP(pos.tp > 0 ? pos.tp.toString() : '');
    setActionMessage(null);
  };


  const handleSaveModification = async () => {
    if (!selectedPosition) return;
    try {
      setIsModifying(true);
      const res = await api.sendCommand({
        action: 'MODIFY_POSITION',
        ticket: selectedPosition.ticket,
        sl: modifySL ? parseFloat(modifySL) : undefined,
        tp: modifyTP ? parseFloat(modifyTP) : undefined,
        source: 'MANUAL_UI',
      });

      if (res.success) {
        setActionMessage({ text: `Modify order queued for #${selectedPosition.ticket}!` });
        setTimeout(() => setSelectedPosition(null), 1200);
      } else {
        setActionMessage({ text: res.error || 'Failed to modify', error: true });
      }
    } catch (e: any) {
      setActionMessage({ text: e.message || 'Error sending modification', error: true });
    } finally {
      setIsModifying(false);
    }
  };

  const handleClosePosition = async (ticket: number) => {
    try {
      setClosingTickets((prev) => ({ ...prev, [ticket]: true }));
      await api.sendCommand({
        action: 'CLOSE_POSITION',
        ticket,
        source: 'MANUAL_UI',
      });
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        setClosingTickets((prev) => ({ ...prev, [ticket]: false }));
      }, 1500);
    }
  };

  const handleCancelPending = async (ticket: number) => {
    try {
      setCancellingTickets((prev) => ({ ...prev, [ticket]: true }));
      await api.sendCommand({
        action: 'CANCEL_PENDING',
        ticket,
        source: 'MANUAL_UI',
      });
    } catch (e) {
      console.error('Failed to cancel pending order:', e);
    } finally {
      setTimeout(() => {
        setCancellingTickets((prev) => ({ ...prev, [ticket]: false }));
      }, 1500);
    }
  };

  const handlePartialClosePercent = async (pos: Position, percent: number) => {
    const rawLots = (pos.volume * percent) / 100;
    const partLots = Math.max(0.01, Number(rawLots.toFixed(2)));
    if (partLots <= 0 || partLots >= pos.volume) return;
    try {
      setClosingPartialTickets((prev) => ({ ...prev, [pos.ticket]: true }));
      const res = await api.partialClosePosition(pos.ticket, partLots);
      if (res.success) {
        setActionMessage({ text: `Partial close queued for #${pos.ticket}: ${partLots} Lots (${percent}%)` });
      } else {
        await api.sendCommand({
          action: 'CLOSE_POSITION',
          ticket: pos.ticket,
          volume: partLots,
          source: 'MANUAL_UI',
        });
        setActionMessage({ text: `Partial close queued for #${pos.ticket}: ${partLots} Lots (${percent}%)` });
      }
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err: any) {
      setActionMessage({ text: err?.message || 'Partial close failed', error: true });
    } finally {
      setTimeout(() => {
        setClosingPartialTickets((prev) => ({ ...prev, [pos.ticket]: false }));
      }, 1500);
    }
  };

  const handlePartialClose = async (pos: Position) => {
    return handlePartialClosePercent(pos, 50);
  };

  const handleOpenModifyPendingModal = (ord: PendingOrder) => {
    setSelectedPendingOrder(ord);
    setModifyPendingPrice(ord.priceOpen > 0 ? ord.priceOpen.toString() : '');
    setModifyPendingSL(ord.sl > 0 ? ord.sl.toString() : '');
    setModifyPendingTP(ord.tp > 0 ? ord.tp.toString() : '');
    setActionMessage(null);
  };

  const handleSavePendingModification = async () => {
    if (!selectedPendingOrder) return;
    try {
      setIsModifyingPending(true);
      const res = await api.sendCommand({
        action: 'MODIFY_PENDING',
        ticket: selectedPendingOrder.ticket,
        price: modifyPendingPrice ? parseFloat(modifyPendingPrice) : undefined,
        sl: modifyPendingSL ? parseFloat(modifyPendingSL) : undefined,
        tp: modifyPendingTP ? parseFloat(modifyPendingTP) : undefined,
        symbol: selectedPendingOrder.symbol,
        source: 'MANUAL_UI',
      });

      if (res.success) {
        setActionMessage({ text: `Pending order #${selectedPendingOrder.ticket} modified & queued for MT5!` });
        setTimeout(() => setSelectedPendingOrder(null), 1200);
      } else {
        setActionMessage({ text: res.error || 'Failed to modify pending order', error: true });
      }
    } catch (e: any) {
      setActionMessage({ text: e.message || 'Error modifying pending order', error: true });
    } finally {
      setIsModifyingPending(false);
    }
  };

  const handleOpenCustomCloseModal = (pos: Position) => {
    setCustomClosePosition(pos);
    const halfLots = Number((pos.volume / 2).toFixed(2));
    setCustomCloseVolume(halfLots > 0 ? halfLots.toString() : '0.01');
    setActionMessage(null);
  };

  const handleExecuteCustomClose = async () => {
    if (!customClosePosition) return;
    const vol = parseFloat(customCloseVolume);
    if (!vol || vol <= 0) {
      setActionMessage({ text: 'Please enter a valid volume greater than 0', error: true });
      return;
    }
    if (vol >= customClosePosition.volume) {
      return handleClosePosition(customClosePosition.ticket);
    }
    try {
      setIsExecutingCustomClose(true);
      const res = await api.partialClosePosition(customClosePosition.ticket, vol);
      if (res.success) {
        setActionMessage({ text: `Partial close queued for #${customClosePosition.ticket}: ${vol} Lots` });
        setTimeout(() => setCustomClosePosition(null), 1200);
      } else {
        await api.sendCommand({
          action: 'CLOSE_POSITION',
          ticket: customClosePosition.ticket,
          volume: vol,
          source: 'MANUAL_UI',
        });
        setActionMessage({ text: `Partial close queued for #${customClosePosition.ticket}: ${vol} Lots` });
        setTimeout(() => setCustomClosePosition(null), 1200);
      }
    } catch (e: any) {
      setActionMessage({ text: e.message || 'Error executing partial close', error: true });
    } finally {
      setIsExecutingCustomClose(false);
    }
  };

  const handleCloseAll = async () => {
    if (!confirmingCloseAll) {
      setConfirmingCloseAll(true);
      setTimeout(() => setConfirmingCloseAll(false), 4000);
      return;
    }
    try {
      setConfirmingCloseAll(false);
      await api.sendCommand({
        action: 'CLOSE_ALL',
        source: 'MANUAL_UI',
      });
      setActionMessage({ text: 'CLOSE_ALL command dispatched for all open positions.' });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage({ text: err?.message || 'Failed to dispatch Close All', error: true });
    }
  };

  const profitablePositions = positions.filter((p) => p.profit > 0);

  const handleCloseProfitable = async () => {
    if (profitablePositions.length === 0) return;
    try {
      for (const p of profitablePositions) {
        await api.sendCommand({
          action: 'CLOSE_POSITION',
          ticket: p.ticket,
          source: 'MANUAL_UI',
        });
      }
      setActionMessage({ text: `Dispatched close orders for ${profitablePositions.length} profitable positions!` });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage({ text: err?.message || 'Failed to close profitable positions', error: true });
    }
  };

  const handleProtectAll = async () => {
    if (profitablePositions.length === 0) return;
    try {
      for (const p of profitablePositions) {
        await api.protectPosition(p.ticket);
      }
      setActionMessage({ text: `B/E Protection dispatched for ${profitablePositions.length} positions in profit!` });
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage({ text: err?.message || 'Failed to protect positions', error: true });
    }
  };

  const totalLots = positions.reduce((acc, p) => acc + p.volume, 0);
  const totalProfit = positions.reduce((acc, p) => acc + p.profit, 0);
  const totalPendingLots = pendingOrders.reduce((acc, o) => acc + o.volume, 0);
  const totalClosedProfit = closedPositions.reduce((acc, p) => acc + (Number(p.profit) || 0), 0);
  const totalClosedVolume = closedPositions.reduce((acc, p) => acc + (Number(p.volume) || 0), 0);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center p-1 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs">
            <button
              onClick={() => setViewTab('POSITIONS')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                viewTab === 'POSITIONS'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Open Positions ({positions.length})
            </button>
            <button
              onClick={() => setViewTab('PENDING')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                viewTab === 'PENDING'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              Pending Orders ({pendingOrders.length})
            </button>
            <button
              onClick={() => {
                setViewTab('HISTORY');
                loadClosedHistory();
              }}
              className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                viewTab === 'HISTORY'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="h-3.5 w-3.5 text-indigo-400" />
              Closed History ({closedPositions.length})
            </button>
          </div>

          <div className="text-xs text-slate-400 font-mono hidden md:block">
            {viewTab === 'POSITIONS' ? (
              <>
                Exposure: <span className="text-white font-bold">{totalLots.toFixed(2)} Lots</span> • Net PnL:{' '}
                <span
                  className={`font-bold ${
                    totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
                </span>
              </>
            ) : viewTab === 'PENDING' ? (
              <>
                Pending Volume: <span className="text-white font-bold">{totalPendingLots.toFixed(2)} Lots</span>
              </>
            ) : (
              <>
                Closed Vol: <span className="text-white font-bold">{totalClosedVolume.toFixed(2)} Lots</span> • Realized PnL:{' '}
                <span
                  className={`font-bold ${
                    totalClosedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {totalClosedProfit >= 0 ? '+' : ''}${totalClosedProfit.toFixed(2)}
                </span>
              </>
            )}
          </div>
        </div>

        {viewTab === 'HISTORY' && (
          <button
            onClick={loadClosedHistory}
            disabled={loadingHistory}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1 shadow-sm self-start sm:self-auto"
            title="Refresh closed trade deals from MT5 history"
          >
            <RotateCw className={`h-3.5 w-3.5 text-indigo-400 ${loadingHistory ? 'animate-spin' : ''}`} />
            <span>Refresh Journal</span>
          </button>
        )}

        {viewTab === 'POSITIONS' && positions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
            {profitablePositions.length > 0 && (
              <>
                <button
                  onClick={handleProtectAll}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/80 transition-all flex items-center gap-1 shadow-sm"
                  title="Move Stop Loss to Entry + Breakeven Lock for all winning positions"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Protect All B/E ({profitablePositions.length})</span>
                </button>
                <button
                  onClick={handleCloseProfitable}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 transition-all flex items-center gap-1 shadow-sm"
                  title="Liquidate only positions in profit to lock in gains"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Close Profitable ({profitablePositions.length})</span>
                </button>
              </>
            )}
            <button
              onClick={handleCloseAll}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                confirmingCloseAll
                  ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse shadow-md shadow-rose-950/50'
                  : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80'
              }`}
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>{confirmingCloseAll ? 'Click again to CONFIRM Close All' : `Close All (${positions.length})`}</span>
            </button>
          </div>
        )}
      </div>

      {actionMessage && (
        <div
          className={`mb-3 p-2.5 rounded-lg text-xs font-mono flex items-center justify-between ${
            actionMessage.error
              ? 'bg-rose-950/80 border border-rose-800 text-rose-300'
              : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white ml-2 text-sm">×</button>
        </div>
      )}

      {viewTab === 'POSITIONS' ? (
        positions.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-lg p-8 text-center text-slate-400 font-mono text-xs space-y-2">
            <div className="text-sm font-bold text-slate-300">
              0 Active Positions in MetaTrader 5
            </div>
            <p className="text-slate-500 max-w-lg mx-auto">
              No simulated or fake trades are generated. Live positions appear here in real-time as soon as trades
              are executed by your external AI agent via MCP or manually dispatched via the Order Execution Dock.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Ticket</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Lots</th>
                  <th className="py-2.5 px-3">Open Price</th>
                  <th className="py-2.5 px-3">Current</th>
                  <th className="py-2.5 px-3">SL</th>
                  <th className="py-2.5 px-3">TP</th>
                  <th className="py-2.5 px-3">PnL ($ / Pips)</th>
                  <th className="py-2.5 px-3">Trailing</th>
                  <th className="py-2.5 px-3">Comment / AI</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {positions.map((pos) => {
                  const digits = getSymbolDigits(pos.symbol);
                  const point = getSymbolPoint(pos.symbol);
                  const pip = digits === 3 || digits === 5 ? point * 10 : point;
                  const pipsMoved = pip > 0
                    ? (pos.type === 'BUY' ? (pos.currentPrice - pos.openPrice) / pip : (pos.openPrice - pos.currentPrice) / pip)
                    : 0;
                  const isProfit = pos.profit >= 0;
                  const isClosing = closingTickets[pos.ticket];
                  const isBeSecured = pos.breakevenLocked || (pos.sl > 0 && (pos.type === 'BUY' ? pos.sl >= pos.openPrice : pos.sl <= pos.openPrice));

                  return (
                    <tr
                      key={pos.ticket}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-300">
                        #{pos.ticket}
                      </td>
                      <td
                        className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-cyan-400"
                        onClick={() => onSelectSymbol?.(pos.symbol)}
                      >
                        {pos.symbol}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            pos.type === 'BUY'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                              : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                          }`}
                        >
                          {pos.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-200">
                        {pos.volume.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {pos.openPrice.toFixed(digits)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-200 font-bold">
                        {pos.currentPrice.toFixed(digits)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {pos.sl > 0 ? pos.sl.toFixed(digits) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {pos.tp > 0 ? pos.tp.toFixed(digits) : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        <div className="flex flex-col">
                          <span className={`tabular-nums ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? '+' : ''}${pos.profit.toFixed(2)}
                          </span>
                          <span className={`text-[10px] tabular-nums font-mono font-normal ${pipsMoved >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'}`}>
                            {pipsMoved >= 0 ? '+' : ''}{pipsMoved.toFixed(1)} pips
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          {isBeSecured ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/80 border border-emerald-700/60 px-1.5 py-0.5 rounded font-bold" title="Stop Loss secures entry price">
                              <ShieldCheck className="h-2.5 w-2.5" /> B/E Secured
                            </span>
                          ) : null}
                          {pos.trailingActive ? (
                            <span className="flex items-center gap-1 text-[10px] text-cyan-300 bg-cyan-950/80 border border-cyan-700/60 px-1.5 py-0.5 rounded animate-pulse font-medium">
                              <Shield className="h-2.5 w-2.5" /> Trailing
                            </span>
                          ) : pos.trailingEnabled ? (
                            <span className="flex items-center gap-1 text-[10px] text-cyan-300/80 bg-cyan-950/50 border border-cyan-800/40 px-1.5 py-0.5 rounded">
                              <Shield className="h-2.5 w-2.5" /> Armed
                            </span>
                          ) : !isBeSecured ? (
                            <span className="text-[10px] text-slate-500">Off</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[130px]">
                        {pos.comment || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isProfit && (
                            <button
                              onClick={() => handleQuickBreakeven(pos)}
                              disabled={lockingTickets[pos.ticket] || isBeSecured}
                              title={isBeSecured ? "Breakeven already secured by SL" : "EA Native Breakeven Lock (+stopsLevel safety)"}
                              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 text-[11px] font-bold ${
                                isBeSecured
                                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 cursor-default opacity-80'
                                  : 'bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 shadow-sm'
                              }`}
                            >
                              <ShieldCheck className="h-3 w-3" />
                              <span>
                                {lockingTickets[pos.ticket] ? 'Securing...' : isBeSecured ? 'Protected' : 'Lock B/E'}
                              </span>
                            </button>
                          )}
                          {pos.volume >= 0.02 && (
                            <div className="flex items-center bg-slate-950 rounded border border-cyan-800/80 overflow-hidden text-[11px] font-mono">
                              <button
                                onClick={() => handlePartialClosePercent(pos, 25)}
                                disabled={closingPartialTickets[pos.ticket] || isClosing}
                                title={`Close 25% (${((pos.volume * 0.25)).toFixed(2)} lots)`}
                                className="px-1.5 py-1 hover:bg-cyan-900 text-cyan-300 border-r border-cyan-800/60 transition-colors font-bold"
                              >
                                25%
                              </button>
                              <button
                                onClick={() => handlePartialClosePercent(pos, 50)}
                                disabled={closingPartialTickets[pos.ticket] || isClosing}
                                title={`Close 50% (${((pos.volume * 0.50)).toFixed(2)} lots)`}
                                className="px-1.5 py-1 hover:bg-cyan-900 text-cyan-300 border-r border-cyan-800/60 transition-colors font-bold"
                              >
                                50%
                              </button>
                              <button
                                onClick={() => handlePartialClosePercent(pos, 75)}
                                disabled={closingPartialTickets[pos.ticket] || isClosing}
                                title={`Close 75% (${((pos.volume * 0.75)).toFixed(2)} lots)`}
                                className="px-1.5 py-1 hover:bg-cyan-900 text-cyan-300 border-r border-cyan-800/60 transition-colors font-bold"
                              >
                                75%
                              </button>
                              <button
                                onClick={() => handleOpenCustomCloseModal(pos)}
                                title="Custom partial close volume"
                                className="px-1.5 py-1 bg-cyan-950/50 hover:bg-cyan-800 text-cyan-200 transition-colors text-[10px]"
                              >
                                Custom
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => handleOpenModifyModal(pos)}
                            title="Modify Stop Loss & Take Profit"
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleClosePosition(pos.ticket)}
                            disabled={isClosing}
                            title="Close Position in MT5"
                            className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 transition-colors flex items-center gap-1 text-[11px]"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>{isClosing ? 'Closing...' : 'Close'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : viewTab === 'PENDING' ? (
        pendingOrders.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-lg p-8 text-center text-slate-400 font-mono text-xs space-y-2">
            <div className="text-sm font-bold text-slate-300">
              0 Active Pending Orders in MetaTrader 5
            </div>
            <p className="text-slate-500 max-w-lg mx-auto">
              No pending orders are waiting for execution in MT5. Limit and stop orders (BUY LIMIT, SELL LIMIT, BUY STOP, SELL STOP) placed via the Order Execution Dock or Autonomous Bot will appear here with live trigger tracking and one-click cancellation.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Order #</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Lots</th>
                  <th className="py-2.5 px-3">Trigger Price</th>
                  <th className="py-2.5 px-3">Current Price</th>
                  <th className="py-2.5 px-3">Distance</th>
                  <th className="py-2.5 px-3">SL</th>
                  <th className="py-2.5 px-3">TP</th>
                  <th className="py-2.5 px-3">Placed At</th>
                  <th className="py-2.5 px-3">Comment / Setup</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pendingOrders.map((ord) => {
                  const digits = getSymbolDigits(ord.symbol);
                  const point = getSymbolPoint(ord.symbol);
                  const isCancelling = cancellingTickets[ord.ticket];
                  const distPoints = ord.currentPrice && point > 0
                    ? Math.abs(Math.round((ord.priceOpen - ord.currentPrice) / point))
                    : null;

                  return (
                    <tr
                      key={ord.ticket}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-300">
                        #{ord.ticket}
                      </td>
                      <td
                        className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-cyan-400"
                        onClick={() => onSelectSymbol?.(ord.symbol)}
                      >
                        {ord.symbol}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ord.type.startsWith('BUY')
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                          }`}
                        >
                          {ord.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-200">
                        {ord.volume.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-cyan-300 font-bold">
                        {ord.priceOpen.toFixed(digits)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {ord.currentPrice ? ord.currentPrice.toFixed(digits) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {distPoints !== null ? (
                          <span className="font-mono text-slate-300">
                            {distPoints} pts
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {ord.sl > 0 ? ord.sl.toFixed(digits) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {ord.tp > 0 ? ord.tp.toFixed(digits) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {ord.timeSetupIso ? (ord.timeSetupIso.split('T')[1]?.substring(0, 8) || ord.timeSetupIso) : (ord.timeSetup > 0 ? new Date(ord.timeSetup * 1000).toLocaleTimeString() : '—')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[140px]" title={ord.comment}>
                        {ord.comment || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenModifyPendingModal(ord)}
                            title="Modify Pending Price, SL & TP"
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white border border-slate-700 transition-colors flex items-center gap-1 text-[11px] font-medium"
                          >
                            <SlidersHorizontal className="h-3 w-3 text-cyan-400" />
                            <span>Modify</span>
                          </button>
                          <button
                            onClick={() => handleCancelPending(ord.ticket)}
                            disabled={isCancelling}
                            title="Delete/Cancel Pending Order in MT5"
                            className="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 transition-colors flex items-center gap-1 text-[11px] font-medium"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>{isCancelling ? 'Deleting...' : 'Cancel'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Closed Positions History Journal */
        closedPositions.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-lg p-8 text-center text-slate-400 font-mono text-xs space-y-2">
            <div className="text-sm font-bold text-slate-300">
              0 Closed Trade Records Found
            </div>
            <p className="text-slate-500 max-w-lg mx-auto">
              Closed trades and deals executed on your MetaTrader 5 account are recorded here automatically with audited entry/exit pricing, realized PnL, swap, execution times, and trading setup notes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Ticket #</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Lots</th>
                  <th className="py-2.5 px-3">Entry Price</th>
                  <th className="py-2.5 px-3">Exit Price</th>
                  <th className="py-2.5 px-3">Net Realized PnL</th>
                  <th className="py-2.5 px-3">Swap</th>
                  <th className="py-2.5 px-3">Closed Time</th>
                  <th className="py-2.5 px-3">Strategy / Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {closedPositions.map((deal) => {
                  const digits = getSymbolDigits(deal.symbol);
                  const isProfit = (Number(deal.profit) || 0) >= 0;
                  const closeTimeFormatted = deal.close_time
                    ? new Date(typeof deal.close_time === 'number' && deal.close_time < 2000000000 ? deal.close_time * 1000 : deal.close_time).toLocaleString()
                    : '—';

                  return (
                    <tr
                      key={deal.ticket || deal.id || Math.random()}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-300">
                        #{deal.ticket}
                      </td>
                      <td
                        className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-cyan-400"
                        onClick={() => onSelectSymbol?.(deal.symbol)}
                      >
                        {deal.symbol}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            String(deal.type).toUpperCase().includes('BUY')
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                          }`}
                        >
                          {deal.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-200">
                        {Number(deal.volume).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {Number(deal.open_price).toFixed(digits)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-200 font-medium">
                        {Number(deal.close_price).toFixed(digits)}
                      </td>
                      <td className={`py-2.5 px-3 font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? '+' : ''}${Number(deal.profit).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        ${Number(deal.swap || 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {closeTimeFormatted}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[160px]" title={deal.comment}>
                        {deal.comment || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Modify SL/TP Modal */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
                <h3 className="text-base font-bold text-white font-mono">
                  Modify Position #{selectedPosition.ticket}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPosition(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-950 rounded-lg text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[10px]">Symbol</span>
                  <span className="font-bold">{selectedPosition.symbol}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Type / Lots</span>
                  <span className="font-bold">{selectedPosition.type} {selectedPosition.volume} Lots</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Open Price</span>
                  <span>{selectedPosition.openPrice}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Current Price</span>
                  <span className="font-bold text-cyan-400">{selectedPosition.currentPrice}</span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Quick Protective Presets</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const digits = getSymbolDigits(selectedPosition.symbol);
                      const point = getSymbolPoint(selectedPosition.symbol);
                      const lockOffset = point * 20;
                      const be = selectedPosition.type === 'BUY'
                        ? Number((selectedPosition.openPrice + lockOffset).toFixed(digits))
                        : Number((selectedPosition.openPrice - lockOffset).toFixed(digits));
                      setModifySL(be.toString());
                    }}
                    className="px-2 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[10px] font-bold text-center"
                  >
                    Lock B/E (+2p)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const digits = getSymbolDigits(selectedPosition.symbol);
                      const halfway = (selectedPosition.openPrice + selectedPosition.currentPrice) / 2;
                      setModifySL(Number(halfway.toFixed(digits)).toString());
                    }}
                    className="px-2 py-1.5 rounded bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 text-[10px] font-bold text-center"
                  >
                    Lock 50% Profit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const digits = getSymbolDigits(selectedPosition.symbol);
                      const point = getSymbolPoint(selectedPosition.symbol);
                      const trailOffset = point * 150;
                      const trailSL = selectedPosition.type === 'BUY'
                        ? Number((selectedPosition.currentPrice - trailOffset).toFixed(digits))
                        : Number((selectedPosition.currentPrice + trailOffset).toFixed(digits));
                      setModifySL(trailSL.toString());
                    }}
                    className="px-2 py-1.5 rounded bg-purple-950/60 hover:bg-purple-900 border border-purple-800 text-purple-300 text-[10px] font-bold text-center"
                  >
                    Trail -150 pts
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">New Stop Loss (SL)</label>
                <input
                  type="number"
                  step="any"
                  value={modifySL}
                  onChange={(e) => setModifySL(e.target.value)}
                  placeholder="0 (disabled)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">New Take Profit (TP)</label>
                <input
                  type="number"
                  step="any"
                  value={modifyTP}
                  onChange={(e) => setModifyTP(e.target.value)}
                  placeholder="0 (disabled)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {actionMessage && (
                <div
                  className={`p-2 rounded flex items-center gap-1.5 text-xs ${
                    actionMessage.error
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {actionMessage.error ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  <span>{actionMessage.text}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedPosition(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveModification}
                  disabled={isModifying}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors flex items-center gap-1.5"
                >
                  {isModifying ? 'Sending to EA...' : 'Save & Dispatch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modify Pending Order Modal */}
      {selectedPendingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-amber-400" />
                <h3 className="text-base font-bold text-white font-mono">
                  Modify Pending Order #{selectedPendingOrder.ticket}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPendingOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-950 rounded-lg text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[10px]">Symbol</span>
                  <span className="font-bold">{selectedPendingOrder.symbol}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Order Type / Lots</span>
                  <span className="font-bold text-amber-300">{selectedPendingOrder.type} ({selectedPendingOrder.volume} Lots)</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Current Trigger Price</span>
                  <span className="text-cyan-400 font-bold">{selectedPendingOrder.priceOpen}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Market Price</span>
                  <span>{selectedPendingOrder.currentPrice || '—'}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Trigger Price</label>
                <input
                  type="number"
                  step="any"
                  value={modifyPendingPrice}
                  onChange={(e) => setModifyPendingPrice(e.target.value)}
                  placeholder="Order entry price"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400">Stop Loss (SL)</label>
                  <button
                    type="button"
                    onClick={() => setModifyPendingSL('')}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    Clear SL
                  </button>
                </div>
                <input
                  type="number"
                  step="any"
                  value={modifyPendingSL}
                  onChange={(e) => setModifyPendingSL(e.target.value)}
                  placeholder="0 (disabled)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400">Take Profit (TP)</label>
                  <button
                    type="button"
                    onClick={() => setModifyPendingTP('')}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    Clear TP
                  </button>
                </div>
                <input
                  type="number"
                  step="any"
                  value={modifyPendingTP}
                  onChange={(e) => setModifyPendingTP(e.target.value)}
                  placeholder="0 (disabled)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              {actionMessage && (
                <div
                  className={`p-2 rounded flex items-center gap-1.5 text-xs ${
                    actionMessage.error
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {actionMessage.error ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  <span>{actionMessage.text}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedPendingOrder(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePendingModification}
                  disabled={isModifyingPending}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors flex items-center gap-1.5"
                >
                  {isModifyingPending ? 'Dispatching to MT5...' : 'Save & Dispatch Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Partial Close Modal */}
      {customClosePosition && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cyan-400" />
                <h3 className="text-base font-bold text-white font-mono">
                  Partial Close #{customClosePosition.ticket} ({customClosePosition.symbol})
                </h3>
              </div>
              <button
                onClick={() => setCustomClosePosition(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-950 rounded-lg text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[10px]">Position Size</span>
                  <span className="font-bold text-white">{customClosePosition.volume} Lots ({customClosePosition.type})</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Unrealized PnL</span>
                  <span className={`font-bold ${customClosePosition.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {customClosePosition.profit >= 0 ? '+' : ''}${customClosePosition.profit.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Open Price</span>
                  <span>{customClosePosition.openPrice}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Current Price</span>
                  <span className="font-bold text-cyan-400">{customClosePosition.currentPrice}</span>
                </div>
              </div>

              {/* Volume Selection */}
              <div>
                <label className="block text-slate-400 mb-1">Volume to Liquidate (Lots)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={customClosePosition.volume}
                  value={customCloseVolume}
                  onChange={(e) => setCustomCloseVolume(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {/* Quick Percentage Presets */}
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setCustomCloseVolume('0.01')}
                  className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-bold text-center"
                >
                  Min 0.01
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const q = Math.max(0.01, Number((customClosePosition.volume * 0.25).toFixed(2)));
                    setCustomCloseVolume(q.toString());
                  }}
                  className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-[10px] font-bold text-center"
                >
                  25%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const h = Math.max(0.01, Number((customClosePosition.volume * 0.5).toFixed(2)));
                    setCustomCloseVolume(h.toString());
                  }}
                  className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-[10px] font-bold text-center"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = Math.max(0.01, Number((customClosePosition.volume * 0.75).toFixed(2)));
                    setCustomCloseVolume(t.toString());
                  }}
                  className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-[10px] font-bold text-center"
                >
                  75%
                </button>
              </div>

              {actionMessage && (
                <div
                  className={`p-2 rounded flex items-center gap-1.5 text-xs ${
                    actionMessage.error
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {actionMessage.error ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  <span>{actionMessage.text}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCustomClosePosition(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCustomClose}
                  disabled={isExecutingCustomClose}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors flex items-center gap-1.5"
                >
                  {isExecutingCustomClose ? 'Closing in MT5...' : `Close ${customCloseVolume || 0} Lots`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
