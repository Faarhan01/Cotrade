import React, { useState } from 'react';
import { Position, DetailedSymbolInfo } from '../../types';
import { api } from '../../services/api';
import {
  Shield,
  ShieldCheck,
  TrendingUp,
  Zap,
  SlidersHorizontal,
  Lock,
  Percent,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Flame,
  Activity,
} from 'lucide-react';
import { getSymbolDigits, getSymbolPoint } from '../../utils/symbolEconomics';

interface LiveTrailingRadarProps {
  positions: Position[];
  allSymbols?: DetailedSymbolInfo[];
  trailingEnabled: boolean;
  trailingDistancePoints: number;
  trailingStepPoints: number;
  onRefresh?: () => void;
}

export const LiveTrailingRadar: React.FC<LiveTrailingRadarProps> = ({
  positions,
  allSymbols = [],
  trailingEnabled,
  trailingDistancePoints,
  trailingStepPoints,
  onRefresh,
}) => {
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const handleSetBreakeven = async (pos: Position) => {
    const key = `be-${pos.ticket}`;
    try {
      setActionLoading((p) => ({ ...p, [key]: true }));
      const digits = getSymbolDigits(pos.symbol);
      const point = getSymbolPoint(pos.symbol);
      // Lock in 2 pips (20 points for 5-digit forex, 20 pts for gold)
      const lockOffset = point * 20;
      const bePrice =
        pos.type === 'BUY'
          ? Number((pos.openPrice + lockOffset).toFixed(digits))
          : Number((pos.openPrice - lockOffset).toFixed(digits));

      const res = await api.sendCommand({
        action: 'MODIFY_POSITION',
        ticket: pos.ticket,
        sl: bePrice,
        tp: pos.tp > 0 ? pos.tp : undefined,
        source: 'MANUAL_UI',
      });

      if (res.success) {
        setNotice(`Dispatched Breakeven Lock for #${pos.ticket} (${pos.symbol}) at ${bePrice}!`);
        setTimeout(() => setNotice(null), 3000);
        if (onRefresh) onRefresh();
      } else {
        setNotice(`Failed: ${res.error || 'Check MT5 connection'}`);
        setTimeout(() => setNotice(null), 3500);
      }
    } catch (e: any) {
      setNotice(`Error: ${e?.message || e}`);
      setTimeout(() => setNotice(null), 3500);
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleLockHalfProfit = async (pos: Position) => {
    const key = `half-${pos.ticket}`;
    try {
      setActionLoading((p) => ({ ...p, [key]: true }));
      const digits = getSymbolDigits(pos.symbol);
      const halfPrice =
        pos.type === 'BUY'
          ? Number((pos.openPrice + (pos.currentPrice - pos.openPrice) * 0.5).toFixed(digits))
          : Number((pos.openPrice - (pos.openPrice - pos.currentPrice) * 0.5).toFixed(digits));

      const res = await api.sendCommand({
        action: 'MODIFY_POSITION',
        ticket: pos.ticket,
        sl: halfPrice,
        tp: pos.tp > 0 ? pos.tp : undefined,
        source: 'MANUAL_UI',
      });

      if (res.success) {
        setNotice(`Locked 50% Profit for #${pos.ticket} (${pos.symbol}) at ${halfPrice}!`);
        setTimeout(() => setNotice(null), 3000);
        if (onRefresh) onRefresh();
      } else {
        setNotice(`Failed: ${res.error || 'Check MT5 connection'}`);
        setTimeout(() => setNotice(null), 3500);
      }
    } catch (e: any) {
      setNotice(`Error: ${e?.message || e}`);
      setTimeout(() => setNotice(null), 3500);
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleTightenTrail = async (pos: Position) => {
    const key = `trail-${pos.ticket}`;
    try {
      setActionLoading((p) => ({ ...p, [key]: true }));
      const digits = getSymbolDigits(pos.symbol);
      const point = getSymbolPoint(pos.symbol);
      // Tight trail of 40 points
      const tightDistance = point * 40;
      const tightPrice =
        pos.type === 'BUY'
          ? Number((pos.currentPrice - tightDistance).toFixed(digits))
          : Number((pos.currentPrice + tightDistance).toFixed(digits));

      const res = await api.sendCommand({
        action: 'MODIFY_POSITION',
        ticket: pos.ticket,
        sl: tightPrice,
        tp: pos.tp > 0 ? pos.tp : undefined,
        source: 'MANUAL_UI',
      });

      if (res.success) {
        setNotice(`Tightened Trailing Stop for #${pos.ticket} (${pos.symbol}) to ${tightPrice}!`);
        setTimeout(() => setNotice(null), 3000);
        if (onRefresh) onRefresh();
      } else {
        setNotice(`Failed: ${res.error || 'Check MT5 connection'}`);
        setTimeout(() => setNotice(null), 3500);
      }
    } catch (e: any) {
      setNotice(`Error: ${e?.message || e}`);
      setTimeout(() => setNotice(null), 3500);
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <div>
            <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono">
              Real-Time Profit-Lock & Trailing Stop Radar
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Sub-millisecond position protection executing on live MT5 price ticks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span
            className={`px-2.5 py-1 rounded-full border ${
              trailingEnabled
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            EA Trailing: {trailingEnabled ? `ACTIVE (${trailingDistancePoints} pts)` : 'STANDBY'}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-slate-950 text-slate-400 border border-slate-800">
            Step: {trailingStepPoints} pts
          </span>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-cyan-950/80 border border-cyan-800 text-cyan-300 text-xs font-mono rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-400" />
          <span>{notice}</span>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="border border-dashed border-slate-800/80 rounded-xl p-8 text-center text-slate-500 font-mono text-xs space-y-1">
          <Activity className="h-6 w-6 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-300 font-bold">No Active Open Positions</p>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            When you or the Auto-Trader bot open positions on MetaTrader 5, the live trailing radar will track profit milestones and execute breakeven and trailing protections here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {positions.map((pos) => {
            const point = getSymbolPoint(pos.symbol);
            const digits = getSymbolDigits(pos.symbol);
            const isBuy = pos.type === 'BUY';
            const priceDiff = isBuy ? pos.currentPrice - pos.openPrice : pos.openPrice - pos.currentPrice;
            const profitPoints = Math.round(priceDiff / (point > 0 ? point : 0.0001));
            const isProfit = pos.profit > 0;

            // Breakeven state
            const hasBreakevenSL = isBuy
              ? pos.sl >= pos.openPrice && pos.sl > 0
              : pos.sl <= pos.openPrice && pos.sl > 0;

            // Trailing threshold: 120 points for BE, InpTrailingPoints for progressive trail
            const beTrigger = 100;
            const trailTrigger = trailingDistancePoints || 150;
            const beProgressPct = Math.min(100, Math.max(0, (profitPoints / beTrigger) * 100));
            const trailProgressPct = Math.min(100, Math.max(0, (profitPoints / trailTrigger) * 100));

            return (
              <div
                key={pos.ticket}
                className="bg-slate-950/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 space-y-3 font-mono transition-all"
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-white">{pos.symbol}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isBuy
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {pos.type} {pos.volume}L
                    </span>
                    <span className="text-[10px] text-slate-500">#{pos.ticket}</span>
                  </div>

                  <div className="text-right">
                    <span className={`text-sm font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfit ? '+' : ''}${pos.profit.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-1.5">
                      ({profitPoints >= 0 ? `+${profitPoints}` : profitPoints} pts)
                    </span>
                  </div>
                </div>

                {/* Price & Stops details */}
                <div className="grid grid-cols-3 gap-2 p-2 bg-slate-900/60 rounded-lg text-[11px] border border-slate-800/60">
                  <div>
                    <span className="text-slate-500 block text-[9px]">Entry</span>
                    <span className="text-slate-300">{pos.openPrice.toFixed(digits)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Current</span>
                    <span className="text-cyan-300 font-bold">{pos.currentPrice.toFixed(digits)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Stop Loss</span>
                    <span className={hasBreakevenSL ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                      {pos.sl > 0 ? pos.sl.toFixed(digits) : 'None'}
                    </span>
                  </div>
                </div>

                {/* Protection Status Badges */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      {hasBreakevenSL ? (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-300 font-bold">100% Risk-Free (Breakeven Locked)</span>
                        </>
                      ) : profitPoints >= beTrigger ? (
                        <>
                          <Flame className="h-3.5 w-3.5 text-amber-400" />
                          <span className="text-amber-300">Ready to Lock Breakeven</span>
                        </>
                      ) : (
                        <>
                          <Shield className="h-3.5 w-3.5 text-slate-500" />
                          <span>Breakeven Threshold: {profitPoints}/{beTrigger} pts</span>
                        </>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-500">{beProgressPct.toFixed(0)}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        hasBreakevenSL
                          ? 'bg-emerald-500'
                          : profitPoints >= beTrigger
                          ? 'bg-amber-400'
                          : 'bg-cyan-500'
                      }`}
                      style={{ width: `${beProgressPct}%` }}
                    />
                  </div>
                </div>

                {/* 1-Click Action Buttons */}
                <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-1.5 text-[10px]">
                  <button
                    onClick={() => handleSetBreakeven(pos)}
                    disabled={actionLoading[`be-${pos.ticket}`]}
                    className="py-1.5 px-2 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-bold transition-all flex items-center justify-center gap-1"
                    title="Move SL to Entry + 2 pips immediately"
                  >
                    <Lock className="h-3 w-3" />
                    <span>Lock B/E</span>
                  </button>

                  <button
                    onClick={() => handleLockHalfProfit(pos)}
                    disabled={!isProfit || actionLoading[`half-${pos.ticket}`]}
                    className="py-1.5 px-2 rounded-lg bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 font-bold disabled:opacity-40 transition-all flex items-center justify-center gap-1"
                    title="Lock 50% of current floating profit into SL"
                  >
                    <Percent className="h-3 w-3" />
                    <span>Lock 50%</span>
                  </button>

                  <button
                    onClick={() => handleTightenTrail(pos)}
                    disabled={!isProfit || actionLoading[`trail-${pos.ticket}`]}
                    className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold disabled:opacity-40 transition-all flex items-center justify-center gap-1"
                    title="Trail SL to 40 pts behind current market price"
                  >
                    <Zap className="h-3 w-3 text-cyan-400" />
                    <span>Trail 40 pts</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
