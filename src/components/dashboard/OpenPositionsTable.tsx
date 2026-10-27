import React, { useState } from 'react';
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
  const [viewTab, setViewTab] = useState<'POSITIONS' | 'PENDING'>('POSITIONS');
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [modifySL, setModifySL] = useState<string>('');
  const [modifyTP, setModifyTP] = useState<string>('');
  const [isModifying, setIsModifying] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [closingTickets, setClosingTickets] = useState<Record<number, boolean>>({});
  const [lockingTickets, setLockingTickets] = useState<Record<number, boolean>>({});
  const [cancellingTickets, setCancellingTickets] = useState<Record<number, boolean>>({});

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

  const handleCloseAll = async () => {
    if (confirm('Are you sure you want to close ALL open positions?')) {
      await api.sendCommand({
        action: 'CLOSE_ALL',
        source: 'MANUAL_UI',
      });
    }
  };

  const totalLots = positions.reduce((acc, p) => acc + p.volume, 0);
  const totalProfit = positions.reduce((acc, p) => acc + p.profit, 0);
  const totalPendingLots = pendingOrders.reduce((acc, o) => acc + o.volume, 0);

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
            ) : (
              <>
                Pending Volume: <span className="text-white font-bold">{totalPendingLots.toFixed(2)} Lots</span>
              </>
            )}
          </div>
        </div>

        {viewTab === 'POSITIONS' && positions.length > 0 && (
          <button
            onClick={handleCloseAll}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 transition-colors flex items-center gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" />
            Close All Positions
          </button>
        )}
      </div>

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
                  <th className="py-2.5 px-3">PnL ($)</th>
                  <th className="py-2.5 px-3">Trailing</th>
                  <th className="py-2.5 px-3">Comment / AI</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {positions.map((pos) => {
                  const digits = getSymbolDigits(pos.symbol);
                  const isProfit = pos.profit >= 0;
                  const isClosing = closingTickets[pos.ticket];

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
                        <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                          {isProfit ? '+' : ''}${pos.profit.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          {pos.breakevenLocked ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/80 border border-emerald-700/60 px-1.5 py-0.5 rounded font-bold">
                              <ShieldCheck className="h-2.5 w-2.5" /> B/E Locked
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
                          ) : !pos.breakevenLocked ? (
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
                              disabled={lockingTickets[pos.ticket] || pos.breakevenLocked}
                              title={pos.breakevenLocked ? "Breakeven already secured by EA" : "EA Native Breakeven Lock (+stopsLevel safety)"}
                              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 text-[11px] font-bold ${
                                pos.breakevenLocked
                                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 cursor-default'
                                  : 'bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80'
                              }`}
                            >
                              <ShieldCheck className="h-3 w-3" />
                              <span>
                                {lockingTickets[pos.ticket] ? 'Locking...' : pos.breakevenLocked ? 'Protected' : 'B/E'}
                              </span>
                            </button>
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
      ) : (
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
                        <button
                          onClick={() => handleCancelPending(ord.ticket)}
                          disabled={isCancelling}
                          title="Delete/Cancel Pending Order in MT5"
                          className="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 transition-colors flex items-center gap-1 text-[11px] ml-auto font-medium"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>{isCancelling ? 'Deleting...' : 'Cancel'}</span>
                        </button>
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
    </div>
  );
};
