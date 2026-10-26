import React, { useState, useEffect } from 'react';
import { OrderType, TickData, RiskGuardConfig, DetailedSymbolInfo } from '../../types';
import { api } from '../../services/api';
import { Send, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2, Lock, ShieldAlert } from 'lucide-react';

interface OrderExecutionDockProps {
  selectedSymbol: string;
  ticks: TickData[];
  symbols?: DetailedSymbolInfo[];
  riskGuard: RiskGuardConfig | null;
  onSelectSymbol: (symbol: string) => void;
}

export const OrderExecutionDock: React.FC<OrderExecutionDockProps> = ({
  selectedSymbol,
  ticks,
  symbols = [],
  riskGuard,
  onSelectSymbol,
}) => {
  const [orderType, setOrderType] = useState<OrderType>('BUY');
  const [volume, setVolume] = useState<string>('0.10');
  const [sl, setSl] = useState<string>('');
  const [tp, setTp] = useState<string>('');
  const [comment, setComment] = useState<string>('COPILOT_DESK');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(null);

  const activeTick = ticks.find((t) => t.symbol === selectedSymbol);
  const symbolInfo = symbols.find((s) => s.symbol.toUpperCase() === selectedSymbol.toUpperCase());
  const tradeMode = symbolInfo?.tradeMode || (symbolInfo?.tradeAllowed === false ? 'CLOSEONLY' : 'FULL');
  const isCloseOnly = tradeMode === 'CLOSEONLY';
  const isLongOnly = tradeMode === 'LONGONLY';
  const isShortOnly = tradeMode === 'SHORTONLY';
  const isTradeDisabled = symbolInfo ? symbolInfo.tradeAllowed === false || isCloseOnly : false;

  useEffect(() => {
    if (isLongOnly && orderType === 'SELL') setOrderType('BUY');
    if (isShortOnly && orderType === 'BUY') setOrderType('SELL');
  }, [isLongOnly, isShortOnly, selectedSymbol]);

  const maxLots = riskGuard?.maxLotSizePerTrade || 2.0;
  const isKillSwitch = riskGuard?.emergencyKillSwitch || false;

  const lotNumber = parseFloat(volume) || 0;
  const exceedsRisk = lotNumber > maxLots;

  const quickLotSizes = ['0.01', '0.05', '0.10', '0.25', '0.50', '1.00'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCloseOnly || isTradeDisabled) {
      setStatus({ message: `Broker rejects new orders for ${selectedSymbol}: Symbol is in CLOSE-ONLY mode`, error: true });
      return;
    }
    if (isLongOnly && orderType === 'SELL') {
      setStatus({ message: `Broker restricts ${selectedSymbol} to LONG ONLY positions`, error: true });
      return;
    }
    if (isShortOnly && orderType === 'BUY') {
      setStatus({ message: `Broker restricts ${selectedSymbol} to SHORT ONLY positions`, error: true });
      return;
    }
    if (exceedsRisk) {
      setStatus({ message: `Lot size exceeds risk limit (${maxLots} lots)`, error: true });
      return;
    }
    if (isKillSwitch) {
      setStatus({ message: 'Emergency Kill Switch is active!', error: true });
      return;
    }

    try {
      setSubmitting(true);
      setStatus(null);

      const res = await api.sendCommand({
        action: 'EXECUTE_TRADE',
        symbol: selectedSymbol,
        orderType,
        volume: lotNumber,
        sl: sl ? parseFloat(sl) : undefined,
        tp: tp ? parseFloat(tp) : undefined,
        comment,
        source: 'MANUAL_UI',
      });

      if (res.success) {
        setStatus({ message: `Queued #${res.commandId} for MT5 async dispatch!` });
        setSl('');
        setTp('');
      } else {
        setStatus({ message: res.error || 'Failed to dispatch order', error: true });
      }
    } catch (err: any) {
      setStatus({ message: err?.message || 'Execution error', error: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Asynchronous Order Execution
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
            Magic #889900
          </span>
        </div>

        {/* Trade Mode Broker Restriction Alert (Gap 3) */}
        {isCloseOnly && (
          <div className="mb-3 p-2.5 rounded-lg bg-amber-950/70 border border-amber-800/80 text-amber-300 text-[11px] font-mono flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-bold">CLOSE-ONLY MODE:</span> Broker prohibits opening new positions on {selectedSymbol}.
            </div>
          </div>
        )}
        {!isCloseOnly && isLongOnly && (
          <div className="mb-3 p-1.5 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-300 text-[10px] font-mono flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>Broker Restriction: {selectedSymbol} allows LONG-ONLY positions.</span>
          </div>
        )}
        {!isCloseOnly && isShortOnly && (
          <div className="mb-3 p-1.5 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-300 text-[10px] font-mono flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>Broker Restriction: {selectedSymbol} allows SHORT-ONLY positions.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 font-mono text-xs">
          {/* Symbol & Direction Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Asset Symbol</label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedSymbol}
                  onChange={(e) => onSelectSymbol(e.target.value)}
                  placeholder="e.g. EURUSD, EURUSDm, XAUUSD"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  list="symbol-options"
                />
                <datalist id="symbol-options">
                  {ticks.length > 0
                    ? ticks.map((t) => <option key={t.symbol} value={t.symbol} />)
                    : ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'AUDUSD', 'USDCAD'].map((s) => (
                        <option key={s} value={s} />
                      ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Order Direction</label>
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setOrderType('BUY')}
                  disabled={isCloseOnly || isShortOnly}
                  className={`flex items-center justify-center gap-1 py-1 rounded text-xs font-bold transition-all ${
                    isCloseOnly || isShortOnly
                      ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-500'
                      : orderType === 'BUY'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ArrowUp className="h-3 w-3" />
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('SELL')}
                  disabled={isCloseOnly || isLongOnly}
                  className={`flex items-center justify-center gap-1 py-1 rounded text-xs font-bold transition-all ${
                    isCloseOnly || isLongOnly
                      ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-500'
                      : orderType === 'SELL'
                      ? 'bg-rose-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ArrowDown className="h-3 w-3" />
                  SELL
                </button>
              </div>
            </div>
          </div>

          {/* Volume / Lot Size */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-400 text-[11px]">Trade Volume (Lots)</label>
              <span className="text-[10px] text-slate-500">
                Risk Cap: {maxLots} Lots
              </span>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={maxLots}
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-white font-mono focus:outline-none ${
                exceedsRisk ? 'border-rose-500 bg-rose-950/20' : 'border-slate-700 focus:border-cyan-500'
              }`}
            />
            {/* Quick lot pills */}
            <div className="flex items-center gap-1.5 mt-1.5">
              {quickLotSizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setVolume(sz)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    volume === sz
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* SL & TP */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Stop Loss (Price)</label>
              <input
                type="number"
                step="any"
                placeholder={activeTick ? (activeTick.bid * 0.995).toFixed(4) : 'Optional'}
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-[11px] mb-1">Take Profit (Price)</label>
              <input
                type="number"
                step="any"
                placeholder={activeTick ? (activeTick.ask * 1.008).toFixed(4) : 'Optional'}
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Comment / AI Tag */}
          <div>
            <label className="block text-slate-400 text-[11px] mb-1">AI Audit Tag / Comment</label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. AI_SCALPER_RSI_OVERSOLD"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Feedback message */}
          {status && (
            <div
              className={`p-2 rounded text-xs flex items-center gap-1.5 ${
                status.error
                  ? 'bg-rose-950/70 text-rose-300 border border-rose-800/80'
                  : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/80'
              }`}
            >
              {status.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              <span>{status.message}</span>
            </div>
          )}

          {/* Execution Button */}
          <button
            type="submit"
            disabled={submitting || exceedsRisk || isKillSwitch || isCloseOnly || (isLongOnly && orderType === 'SELL') || (isShortOnly && orderType === 'BUY')}
            className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 ${
              isKillSwitch || isCloseOnly
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : orderType === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
            }`}
          >
            {isCloseOnly ? <Lock className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {isCloseOnly
              ? `CLOSE-ONLY MODE (Orders Disabled)`
              : isLongOnly && orderType === 'SELL'
              ? `SELL DISABLED (LONG-ONLY SYMBOL)`
              : isShortOnly && orderType === 'BUY'
              ? `BUY DISABLED (SHORT-ONLY SYMBOL)`
              : submitting
              ? 'Dispatching to Queue...'
              : `Dispatch ${orderType} ${lotNumber} Lots`}
          </button>
        </form>
      </div>

      <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500 font-mono flex items-center justify-between">
        <span>Channel: Asynchronous WebRequest</span>
        <span>Target: 127.0.0.1:7777</span>
      </div>
    </div>
  );
};
