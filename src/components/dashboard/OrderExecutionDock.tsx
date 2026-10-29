import React, { useState, useEffect } from 'react';
import { OrderType, TickData, RiskGuardConfig, DetailedSymbolInfo, AccountInfo, ChartSymbolInfo } from '../../types';
import { api } from '../../services/api';
import { Send, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2, Lock, ShieldAlert, Clock, Zap, Calculator } from 'lucide-react';
import { ForexCalculatorModal } from './ForexCalculatorModal';

interface OrderExecutionDockProps {
  selectedSymbol: string;
  ticks: TickData[];
  symbols?: DetailedSymbolInfo[];
  riskGuard: RiskGuardConfig | null;
  account?: AccountInfo | null;
  symbolInfo?: DetailedSymbolInfo | ChartSymbolInfo | null;
  onSelectSymbol: (symbol: string) => void;
}

export const OrderExecutionDock: React.FC<OrderExecutionDockProps> = ({
  selectedSymbol,
  ticks,
  symbols = [],
  riskGuard,
  account,
  symbolInfo: propSymbolInfo,
  onSelectSymbol,
}) => {
  const [orderCategory, setOrderCategory] = useState<'MARKET' | 'PENDING'>('MARKET');
  const [orderType, setOrderType] = useState<OrderType>('BUY');
  const [pendingPrice, setPendingPrice] = useState<string>('');
  const [volume, setVolume] = useState<string>('0.10');
  const [sl, setSl] = useState<string>('');
  const [tp, setTp] = useState<string>('');
  const [comment, setComment] = useState<string>('COPILOT_DESK');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);

  const activeTick = ticks.find((t) => t.symbol === selectedSymbol);
  const symbolInfo = symbols.find((s) => s.symbol.toUpperCase() === selectedSymbol.toUpperCase());
  const digits = symbolInfo?.digits ?? (selectedSymbol.includes('JPY') ? 3 : 5);
  const point = symbolInfo?.point ?? (selectedSymbol.includes('JPY') ? 0.001 : 0.00001);
  const pip = point * 10;

  const tradeMode = symbolInfo?.tradeMode || (symbolInfo?.tradeAllowed === false ? 'CLOSEONLY' : 'FULL');
  const isCloseOnly = tradeMode === 'CLOSEONLY';
  const isLongOnly = tradeMode === 'LONGONLY';
  const isShortOnly = tradeMode === 'SHORTONLY';
  const isTradeDisabled = symbolInfo ? symbolInfo.tradeAllowed === false || isCloseOnly : false;

  useEffect(() => {
    if (orderCategory === 'MARKET') {
      if (orderType !== 'BUY' && orderType !== 'SELL') {
        setOrderType(isShortOnly ? 'SELL' : 'BUY');
      }
    } else {
      if (orderType === 'BUY' || orderType === 'SELL') {
        setOrderType(isShortOnly ? 'SELL_LIMIT' : 'BUY_LIMIT');
      }
    }
  }, [orderCategory]);

  useEffect(() => {
    if (isLongOnly) {
      if (orderType === 'SELL') setOrderType('BUY');
      if (orderType === 'SELL_LIMIT' || orderType === 'SELL_STOP') setOrderType('BUY_LIMIT');
    }
    if (isShortOnly) {
      if (orderType === 'BUY') setOrderType('SELL');
      if (orderType === 'BUY_LIMIT' || orderType === 'BUY_STOP') setOrderType('SELL_LIMIT');
    }
  }, [isLongOnly, isShortOnly, selectedSymbol]);

  // Set default pending price when switching symbol or pending type
  useEffect(() => {
    if (orderCategory === 'PENDING' && activeTick && (!pendingPrice || pendingPrice === '')) {
      const ask = activeTick.ask;
      const bid = activeTick.bid;
      if (orderType === 'BUY_LIMIT') setPendingPrice((ask - 15 * pip).toFixed(digits));
      else if (orderType === 'SELL_LIMIT') setPendingPrice((bid + 15 * pip).toFixed(digits));
      else if (orderType === 'BUY_STOP') setPendingPrice((ask + 20 * pip).toFixed(digits));
      else if (orderType === 'SELL_STOP') setPendingPrice((bid - 20 * pip).toFixed(digits));
    }
  }, [orderCategory, orderType, selectedSymbol]);

  const maxLots = riskGuard?.maxLotSizePerTrade || 2.0;
  const isKillSwitch = riskGuard?.emergencyKillSwitch || false;

  const lotNumber = parseFloat(volume) || 0;
  const exceedsRisk = lotNumber > maxLots;

  const quickLotSizes = ['0.01', '0.05', '0.10', '0.25', '0.50', '1.00'];

  const isBuySide = orderType === 'BUY' || orderType === 'BUY_LIMIT' || orderType === 'BUY_STOP';
  const isSellSide = orderType === 'SELL' || orderType === 'SELL_LIMIT' || orderType === 'SELL_STOP';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCloseOnly || isTradeDisabled) {
      setStatus({ message: `Broker rejects new orders for ${selectedSymbol}: Symbol is in CLOSE-ONLY mode`, error: true });
      return;
    }
    if (isLongOnly && isSellSide) {
      setStatus({ message: `Broker restricts ${selectedSymbol} to LONG ONLY positions`, error: true });
      return;
    }
    if (isShortOnly && isBuySide) {
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

    let parsedPrice: number | undefined = undefined;
    if (orderCategory === 'PENDING') {
      parsedPrice = parseFloat(pendingPrice);
      if (!parsedPrice || parsedPrice <= 0) {
        setStatus({ message: 'A valid trigger execution price is required for pending orders', error: true });
        return;
      }
      if (activeTick) {
        if (orderType === 'BUY_LIMIT' && parsedPrice >= activeTick.ask) {
          setStatus({ message: `BUY LIMIT price (${parsedPrice}) must be below current Ask (${activeTick.ask})`, error: true });
          return;
        }
        if (orderType === 'SELL_LIMIT' && parsedPrice <= activeTick.bid) {
          setStatus({ message: `SELL LIMIT price (${parsedPrice}) must be above current Bid (${activeTick.bid})`, error: true });
          return;
        }
        if (orderType === 'BUY_STOP' && parsedPrice <= activeTick.ask) {
          setStatus({ message: `BUY STOP price (${parsedPrice}) must be above current Ask (${activeTick.ask})`, error: true });
          return;
        }
        if (orderType === 'SELL_STOP' && parsedPrice >= activeTick.bid) {
          setStatus({ message: `SELL STOP price (${parsedPrice}) must be below current Bid (${activeTick.bid})`, error: true });
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      setStatus(null);

      const res = await api.sendCommand({
        action: 'EXECUTE_TRADE',
        symbol: selectedSymbol,
        orderType,
        volume: lotNumber,
        price: parsedPrice,
        sl: sl ? parseFloat(sl) : undefined,
        tp: tp ? parseFloat(tp) : undefined,
        comment,
        source: 'MANUAL_UI',
      });

      if (res.success) {
        setStatus({ message: `Queued #${res.commandId} for MT5 async dispatch: ${orderType} ${lotNumber} @ ${parsedPrice ? parsedPrice : 'MARKET'}` });
        setSl('');
        setTp('');
        if (orderCategory === 'PENDING') setPendingPrice('');
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowCalculator(true)}
              title="Open Forex Margin, Pip & Spread Calculator"
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition-colors flex items-center gap-1 text-[10px] font-mono border border-slate-700/60"
            >
              <Calculator className="h-3 w-3" />
              <span>Calculator</span>
            </button>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
              Magic #889900
            </span>
          </div>
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

        {/* Order Category Selector (Market vs Pending) */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 mb-3 font-mono text-xs">
          <button
            type="button"
            onClick={() => setOrderCategory('MARKET')}
            className={`py-1.5 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              orderCategory === 'MARKET'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-cyan-400" />
            Market Execution
          </button>
          <button
            type="button"
            onClick={() => setOrderCategory('PENDING')}
            className={`py-1.5 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              orderCategory === 'PENDING'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            Pending Order
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 font-mono text-xs">
          {/* Symbol & Direction/Type Selector */}
          <div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Asset Symbol</label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedSymbol}
                    onChange={(e) => onSelectSymbol(e.target.value)}
                    placeholder="e.g. EURUSD, EURUSDm, XAUUSD"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
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
                <label className="block text-slate-400 text-[11px] mb-1">Live Reference</label>
                <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] flex items-center justify-between">
                  <span className="text-slate-500">Bid: <strong className="text-slate-300">{activeTick ? activeTick.bid.toFixed(digits) : '—'}</strong></span>
                  <span className="text-slate-500">Ask: <strong className="text-slate-300">{activeTick ? activeTick.ask.toFixed(digits) : '—'}</strong></span>
                </div>
              </div>
            </div>

            {/* Direction Selection (Market vs Pending Options) */}
            {orderCategory === 'MARKET' ? (
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Instant Execution Type</label>
                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setOrderType('BUY')}
                    disabled={isCloseOnly || isShortOnly}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-bold transition-all ${
                      isCloseOnly || isShortOnly
                        ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-500'
                        : orderType === 'BUY'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    BUY (Ask @ {activeTick ? activeTick.ask.toFixed(digits) : 'Market'})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('SELL')}
                    disabled={isCloseOnly || isLongOnly}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-bold transition-all ${
                      isCloseOnly || isLongOnly
                        ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-500'
                        : orderType === 'SELL'
                        ? 'bg-rose-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    SELL (Bid @ {activeTick ? activeTick.bid.toFixed(digits) : 'Market'})
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-slate-400 text-[11px] mb-1">Pending Order Setup</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOrderType('BUY_LIMIT');
                      if (activeTick) setPendingPrice((activeTick.ask - 15 * pip).toFixed(digits));
                    }}
                    disabled={isCloseOnly || isShortOnly}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      orderType === 'BUY_LIMIT'
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1">
                      <ArrowUp className="h-3 w-3 text-emerald-400" /> BUY LIMIT
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Buy on pullback below Ask</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOrderType('SELL_LIMIT');
                      if (activeTick) setPendingPrice((activeTick.bid + 15 * pip).toFixed(digits));
                    }}
                    disabled={isCloseOnly || isLongOnly}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      orderType === 'SELL_LIMIT'
                        ? 'bg-rose-950/70 text-rose-300 border-rose-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1">
                      <ArrowDown className="h-3 w-3 text-rose-400" /> SELL LIMIT
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Sell on rally above Bid</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOrderType('BUY_STOP');
                      if (activeTick) setPendingPrice((activeTick.ask + 20 * pip).toFixed(digits));
                    }}
                    disabled={isCloseOnly || isShortOnly}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      orderType === 'BUY_STOP'
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1">
                      <ArrowUp className="h-3 w-3 text-emerald-400" /> BUY STOP
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Buy on breakout above Ask</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOrderType('SELL_STOP');
                      if (activeTick) setPendingPrice((activeTick.bid - 20 * pip).toFixed(digits));
                    }}
                    disabled={isCloseOnly || isLongOnly}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      orderType === 'SELL_STOP'
                        ? 'bg-rose-950/70 text-rose-300 border-rose-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1">
                      <ArrowDown className="h-3 w-3 text-rose-400" /> SELL STOP
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Sell on breakdown below Bid</div>
                  </button>
                </div>

                {/* Target Execution Price Input for Pending */}
                <div className="mt-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400 text-[11px] font-bold text-amber-300">
                      Pending Trigger Price (Required)
                    </label>
                    <span className="text-[10px] text-slate-500">
                      {orderType.startsWith('BUY') ? 'Target Entry Price' : 'Target Entry Price'}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={pendingPrice}
                    onChange={(e) => setPendingPrice(e.target.value)}
                    placeholder={activeTick ? activeTick.bid.toFixed(digits) : '0.00000'}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-sm focus:border-amber-500 focus:outline-none"
                  />
                  {activeTick && (
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-500 mr-1">Quick offset:</span>
                      {[-20, -10, 10, 20].map((offset) => (
                        <button
                          key={offset}
                          type="button"
                          onClick={() => {
                            const base = orderType.startsWith('BUY') ? activeTick.ask : activeTick.bid;
                            setPendingPrice((base + offset * pip).toFixed(digits));
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700"
                        >
                          {offset > 0 ? `+${offset}p` : `${offset}p`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
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
            disabled={submitting || exceedsRisk || isKillSwitch || isCloseOnly || (isLongOnly && isSellSide) || (isShortOnly && isBuySide)}
            className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 ${
              isKillSwitch || isCloseOnly
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : isBuySide
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
            }`}
          >
            {isCloseOnly ? <Lock className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {isCloseOnly
              ? `CLOSE-ONLY MODE (Orders Disabled)`
              : isLongOnly && isSellSide
              ? `SELL RESTRICTED (LONG-ONLY SYMBOL)`
              : isShortOnly && isBuySide
              ? `BUY RESTRICTED (SHORT-ONLY SYMBOL)`
              : submitting
              ? 'Dispatching to Queue...'
              : orderCategory === 'PENDING'
              ? `Queue ${orderType.replace('_', ' ')}: ${lotNumber} Lots @ ${pendingPrice || 'Price'}`
              : `Dispatch ${orderType} ${lotNumber} Lots`}
          </button>
        </form>
      </div>

      <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500 font-mono flex items-center justify-between">
        <span>Channel: Asynchronous WebRequest</span>
        <span>Target: 127.0.0.1:7777</span>
      </div>

      <ForexCalculatorModal
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        selectedSymbol={selectedSymbol}
        symbolInfo={symbolInfo}
        currentTick={activeTick}
        accountLeverage={account?.leverage || 100}
        accountBalance={account?.balance || 10000}
      />
    </div>
  );
};
