import React, { useState } from 'react';
import { ChartSymbolInfo, MT5ChartDiagnostics, MT5TerminalPermissions } from '../../types';
import {
  Monitor,
  Zap,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  DollarSign,
  Download,
  CheckCircle2,
  RefreshCw,
  Clock,
  Globe,
  Gauge,
  Activity,
  CheckCircle,
  XCircle,
  Timer,
} from 'lucide-react';

interface CurrentChartSymbolCardProps {
  currentChart: ChartSymbolInfo | null;
  chartDiagnostics?: MT5ChartDiagnostics | null;
  terminalPermissions?: MT5TerminalPermissions | null;
  onSelectSymbol?: (symbol: string) => void;
  onRefresh?: () => void;
}

export const CurrentChartSymbolCard: React.FC<CurrentChartSymbolCardProps> = ({
  currentChart,
  chartDiagnostics,
  terminalPermissions,
  onSelectSymbol,
  onRefresh,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleRequestCandles = async (symbol: string, timeframe: string) => {
    try {
      setLoadingAction('request');
      const res = await fetch('/api/candles/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe, count: 100 }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`Requested 100 ${timeframe} candles from EA for ${symbol}`);
        onRefresh?.();
      }
    } catch {
      setFeedback('Failed to request candles from EA');
    } finally {
      setLoadingAction(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  if (!currentChart) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Current Connected Chart Symbol
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
            Awaiting Chart
          </span>
        </div>

        <div className="border border-dashed border-slate-800 rounded-lg p-6 text-center text-slate-400 font-mono text-xs space-y-3">
          <p className="text-sm font-semibold text-slate-300">
            No Active MT5 Chart Connected Yet
          </p>
          <p className="text-slate-500 max-w-md mx-auto text-[11px] leading-relaxed">
            Attach <code className="text-cyan-400 font-bold">AIMT5Bridge.mq5</code> to any chart in MetaTrader 5 (e.g. EURUSD M1).
            This section will immediately display the active symbol specifications, live quotes, and session boundaries.
          </p>
        </div>
      </div>
    );
  }

  const digits = currentChart.digits || (currentChart.symbol.includes('JPY') ? 3 : 5);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 border border-cyan-800/40 rounded-xl p-5 shadow-lg shadow-cyan-950/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white font-mono tracking-tight">
                {currentChart.symbol}
              </h2>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {currentChart.timeframe}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Active EA Chart
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {currentChart.description || 'MetaTrader 5 Connected Chart'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRequestCandles(currentChart.symbol, currentChart.timeframe)}
            disabled={loadingAction === 'request'}
            title="Request historical candles directly from MT5"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" />
            <span>{loadingAction === 'request' ? 'Requesting...' : 'Pull Past Candles'}</span>
          </button>

          <button
            onClick={() => onSelectSymbol?.(currentChart.symbol)}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <Zap className="h-3.5 w-3.5" />
            Trade {currentChart.symbol}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="mb-3 p-2 rounded-lg bg-cyan-950/50 border border-cyan-800/50 text-xs font-mono text-cyan-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 font-mono text-xs">
        {/* Bid */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Live Bid</span>
          <div className="text-sm font-bold text-emerald-400 mt-0.5">
            {currentChart.bid.toFixed(digits)}
          </div>
        </div>

        {/* Ask */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Live Ask</span>
          <div className="text-sm font-bold text-slate-200 mt-0.5">
            {currentChart.ask.toFixed(digits)}
          </div>
        </div>

        {/* Spread */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Live Spread</span>
          <div className="text-sm font-bold text-cyan-300 mt-0.5">
            {currentChart.spread} pts
          </div>
        </div>

        {/* Lot Range */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Min / Max Lot</span>
          <div className="text-slate-300 mt-0.5 font-bold">
            {currentChart.minLot} - {currentChart.maxLot}
          </div>
        </div>

        {/* Lot Step */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Lot Step</span>
          <div className="text-slate-300 mt-0.5 font-bold">
            {currentChart.lotStep}
          </div>
        </div>

        {/* Contract Size */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Contract Size</span>
          <div className="text-slate-300 mt-0.5 font-bold">
            {currentChart.contractSize.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Session Aggregates if available */}
      {currentChart.sessionHigh && currentChart.sessionHigh > 0 ? (
        <div className="mt-3 pt-3 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="bg-slate-950/40 p-2 rounded border border-slate-900">
            <span className="text-[10px] text-slate-500 block uppercase">Session Open</span>
            <div className="text-slate-300 font-semibold">{currentChart.sessionOpen?.toFixed(digits) || '—'}</div>
          </div>
          <div className="bg-slate-950/40 p-2 rounded border border-slate-900">
            <span className="text-[10px] text-slate-500 block uppercase">Session High</span>
            <div className="text-emerald-400 font-semibold">{currentChart.sessionHigh.toFixed(digits)}</div>
          </div>
          <div className="bg-slate-950/40 p-2 rounded border border-slate-900">
            <span className="text-[10px] text-slate-500 block uppercase">Session Low</span>
            <div className="text-rose-400 font-semibold">{currentChart.sessionLow?.toFixed(digits) || '—'}</div>
          </div>
          <div className="bg-slate-950/40 p-2 rounded border border-slate-900">
            <span className="text-[10px] text-slate-500 block uppercase">Session Vol (ticks)</span>
            <div className="text-cyan-300 font-semibold">{currentChart.sessionVolume?.toLocaleString() || '—'}</div>
          </div>
        </div>
      ) : null}

      {/* MT5 Chart Behavioral Diagnostics & Server Timestamps */}
      {chartDiagnostics && (
        <div className="mt-4 pt-3.5 border-t border-cyan-900/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
                MT5 Broker Chart & Clock Telemetry
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                <Globe className="h-3 w-3 text-cyan-400" />
                <span>Broker: {chartDiagnostics.serverTimeIso?.replace('T', ' ').slice(0, 19)} (GMT{chartDiagnostics.brokerTimezoneOffsetHours >= 0 ? `+${chartDiagnostics.brokerTimezoneOffsetHours}` : chartDiagnostics.brokerTimezoneOffsetHours})</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                GMT: {chartDiagnostics.gmtTimeIso?.slice(11, 19)} UTC
              </span>
            </div>
          </div>

          {/* Candle Countdown & State Progress Bar */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3 space-y-2 font-mono">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Timer className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                <span className="text-slate-300 font-semibold">
                  Active Bar 0 Status:
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${chartDiagnostics.isBarClosed ? 'bg-slate-800 text-slate-300' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'}`}>
                  {chartDiagnostics.isBarClosed ? 'CLOSED' : 'FORMING (LIVE)'}
                </span>
              </div>

              <div className="text-right text-[11px] text-slate-400">
                <span className="text-cyan-300 font-bold">{chartDiagnostics.barRemainingSeconds}s remaining</span>
                <span className="text-slate-600 mx-1.5">•</span>
                <span>{chartDiagnostics.barProgressPct}% elapsed ({chartDiagnostics.barElapsedSeconds}s / {chartDiagnostics.periodSeconds}s)</span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(2, chartDiagnostics.barProgressPct))}%` }}
              />
            </div>

            {/* Bar Open Time & Tick Volume Info */}
            <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-500 pt-1">
              <span>Bar Open: {chartDiagnostics.currentBarTimeIso?.replace('T', ' ').slice(11, 19) || '—'}</span>
              <div className="flex items-center gap-3">
                {chartDiagnostics.tickVolume ? (
                  <span>Tick Vol: <strong className="text-slate-300">{chartDiagnostics.tickVolume.toLocaleString()}</strong></span>
                ) : null}
                {chartDiagnostics.realVolume ? (
                  <span>Real Exchange Vol: <strong className="text-slate-300">{chartDiagnostics.realVolume.toLocaleString()}</strong></span>
                ) : null}
                {chartDiagnostics.executionSlippageHistory ? (
                  <span>Avg Fill: <strong className="text-cyan-300">{chartDiagnostics.executionSlippageHistory.lastLatencyMs}ms</strong> (Slip: {chartDiagnostics.executionSlippageHistory.averageSlippagePoints} pts)</span>
                ) : null}
              </div>
            </div>
          </div>

          {/* MT5 Terminal Permissions Matrix */}
          {(terminalPermissions || chartDiagnostics.terminalPermissions) && (
            <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex flex-wrap items-center gap-3 text-[11px] font-mono">
              <span className="text-slate-400 flex items-center gap-1 font-semibold">
                <Gauge className="h-3 w-3 text-cyan-400" />
                MT5 Permissions:
              </span>

              {/* Algorithmic Trading */}
              <span className={`px-2 py-0.5 rounded flex items-center gap-1 text-[10px] ${(terminalPermissions || chartDiagnostics.terminalPermissions)?.terminalTradeAllowed ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50' : 'bg-rose-950/70 text-rose-300 border border-rose-800/50'}`}>
                {(terminalPermissions || chartDiagnostics.terminalPermissions)?.terminalTradeAllowed ? (
                  <CheckCircle className="h-3 w-3 text-emerald-400" />
                ) : (
                  <XCircle className="h-3 w-3 text-rose-400" />
                )}
                Algo Trading: {(terminalPermissions || chartDiagnostics.terminalPermissions)?.terminalTradeAllowed ? 'ENABLED' : 'DISABLED'}
              </span>

              {/* Terminal Connected */}
              <span className={`px-2 py-0.5 rounded flex items-center gap-1 text-[10px] ${(terminalPermissions || chartDiagnostics.terminalPermissions)?.terminalConnected ? 'bg-slate-900 text-slate-300 border border-slate-800' : 'bg-rose-950/70 text-rose-300'}`}>
                Terminal: {(terminalPermissions || chartDiagnostics.terminalPermissions)?.terminalConnected ? 'Connected' : 'Offline'}
              </span>

              {/* MQL Trade Allowed */}
              <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[10px]">
                EA MQL Trade: {(terminalPermissions || chartDiagnostics.terminalPermissions)?.mqlTradeAllowed ? 'Yes' : 'No'}
              </span>

              {/* Account Allowed */}
              <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[10px]">
                Account Trade: {(terminalPermissions || chartDiagnostics.terminalPermissions)?.accountTradeAllowed ? 'Allowed' : 'Prohibited'}
              </span>

              {/* Limit Orders Allowed */}
              {(terminalPermissions || chartDiagnostics.terminalPermissions)?.accountLimitOrders ? (
                <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                  Max Orders: {(terminalPermissions || chartDiagnostics.terminalPermissions)?.accountLimitOrders}
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
