import React, { useState, useEffect, useMemo } from 'react';
import { OrderType, TickData, RiskGuardConfig, AccountInfo, DetailedSymbolInfo } from '../../types';
import { api } from '../../services/api';
import {
  calculatePipValue,
  calculatePipDistance,
  calculatePositionSizeByRisk,
  getSymbolDigits,
  getSymbolPoint,
  validateAndAdjustStops,
} from '../../utils/symbolEconomics';
import {
  Send,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  CheckCircle2,
  Calculator,
  Shield,
  Percent,
  Sliders,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface OrderExecutionDockProps {
  selectedSymbol: string;
  ticks: TickData[];
  riskGuard: RiskGuardConfig | null;
  account?: AccountInfo | null;
  symbolInfo?: DetailedSymbolInfo | null;
  onSelectSymbol: (symbol: string) => void;
}

export const OrderExecutionDock: React.FC<OrderExecutionDockProps> = ({
  selectedSymbol,
  ticks,
  riskGuard,
  account,
  symbolInfo,
  onSelectSymbol,
}) => {
  const [orderCategory, setOrderCategory] = useState<'MARKET' | 'PENDING'>('MARKET');
  const [orderType, setOrderType] = useState<OrderType>('BUY');
  const [volume, setVolume] = useState<string>('0.10');
  const [priceInput, setPriceInput] = useState<string>('');
  const [slPrice, setSlPrice] = useState<string>('');
  const [tpPrice, setTpPrice] = useState<string>('');
  const [slPips, setSlPips] = useState<string>('25');
  const [tpPips, setTpPips] = useState<string>('50');
  const [inputMode, setInputMode] = useState<'PIPS' | 'PRICE'>('PIPS');
  const [riskPercent, setRiskPercent] = useState<string>('1.0');
  const [autoSizingEnabled, setAutoSizingEnabled] = useState<boolean>(false);
  const [comment, setComment] = useState<string>('COPILOT_DESK');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(null);

  const activeTick = ticks.find((t) => t.symbol.toUpperCase() === selectedSymbol.toUpperCase());
  const maxLots = riskGuard?.maxLotSizePerTrade || 2.0;
  const isKillSwitch = riskGuard?.emergencyKillSwitch || false;

  const digits = getSymbolDigits(selectedSymbol, symbolInfo?.digits);
  const point = getSymbolPoint(selectedSymbol, symbolInfo?.point);
  const pipUnit = digits === 3 || digits === 5 ? 10 * point : point;

  const currentBid = activeTick?.bid || symbolInfo?.bid || 0;
  const currentAsk = activeTick?.ask || symbolInfo?.ask || 0;
  const spreadPts = activeTick?.spread || (currentAsk > 0 && currentBid > 0 ? Math.round((currentAsk - currentBid) / point) : 15);
  const spreadPips = Number((spreadPts * point / pipUnit).toFixed(1));

  // Determine base execution price
  const basePrice = useMemo(() => {
    if (orderCategory === 'PENDING' && priceInput && parseFloat(priceInput) > 0) {
      return parseFloat(priceInput);
    }
    return orderType.startsWith('BUY') ? currentAsk : currentBid;
  }, [orderCategory, orderType, priceInput, currentAsk, currentBid]);

  // Update SL and TP prices when Pips or basePrice change
  useEffect(() => {
    if (inputMode === 'PIPS' && basePrice > 0) {
      const pSl = parseFloat(slPips);
      const pTp = parseFloat(tpPips);
      if (pSl > 0) {
        const slDist = pSl * pipUnit;
        const targetSl = orderType.startsWith('BUY') ? basePrice - slDist : basePrice + slDist;
        setSlPrice(targetSl.toFixed(digits));
      }
      if (pTp > 0) {
        const tpDist = pTp * pipUnit;
        const targetTp = orderType.startsWith('BUY') ? basePrice + tpDist : basePrice - tpDist;
        setTpPrice(targetTp.toFixed(digits));
      }
    }
  }, [inputMode, slPips, tpPips, basePrice, orderType, pipUnit, digits]);

  // Auto-calculate lot size if risk percent is used
  useEffect(() => {
    if (autoSizingEnabled && account && account.balance > 0 && basePrice > 0 && slPrice) {
      const parsedSl = parseFloat(slPrice);
      if (parsedSl > 0 && Math.abs(basePrice - parsedSl) > 0) {
        const sizing = calculatePositionSizeByRisk({
          symbol: selectedSymbol,
          balance: account.freeMargin > 0 ? account.freeMargin : account.balance,
          riskPercent: parseFloat(riskPercent) || 1.0,
          entryPrice: basePrice,
          stopLossPrice: parsedSl,
          symbolInfo: symbolInfo || undefined,
        });
        if (sizing.recommendedLots > 0) {
          setVolume(sizing.recommendedLots.toFixed(2));
        }
      }
    }
  }, [autoSizingEnabled, riskPercent, basePrice, slPrice, account, selectedSymbol, symbolInfo]);

  const lotNumber = parseFloat(volume) || 0;
  const exceedsRisk = lotNumber > maxLots;

  // Single pip value in USD for current volume
  const pipValue = useMemo(() => {
    const singleLotPipValue = calculatePipValue({
      symbol: selectedSymbol,
      digits,
      point,
      currentPrice: basePrice,
      contractSize: symbolInfo?.contractSize,
      tickValue: symbolInfo?.tickValue,
      tickSize: symbolInfo?.tickSize,
    });
    return singleLotPipValue * lotNumber;
  }, [selectedSymbol, digits, point, basePrice, symbolInfo, lotNumber]);

  // Pre-trade risk calculations
  const parsedSl = parseFloat(slPrice) || 0;
  const parsedTp = parseFloat(tpPrice) || 0;

  const slDistancePips = useMemo(() => {
    if (basePrice <= 0 || parsedSl <= 0) return 0;
    return Math.abs(basePrice - parsedSl) / pipUnit;
  }, [basePrice, parsedSl, pipUnit]);

  const tpDistancePips = useMemo(() => {
    if (basePrice <= 0 || parsedTp <= 0) return 0;
    return Math.abs(basePrice - parsedTp) / pipUnit;
  }, [basePrice, parsedTp, pipUnit]);

  const potentialLossUsd = slDistancePips > 0 ? slDistancePips * pipValue : 0;
  const potentialProfitUsd = tpDistancePips > 0 ? tpDistancePips * pipValue : 0;
  const riskRewardRatio = slDistancePips > 0 && tpDistancePips > 0 ? (tpDistancePips / slDistancePips).toFixed(2) : null;

  // Estimated required margin
  const estimatedMargin = useMemo(() => {
    if (lotNumber <= 0 || basePrice <= 0) return 0;
    if (symbolInfo?.marginInitial && symbolInfo.marginInitial > 0) {
      return symbolInfo.marginInitial * lotNumber;
    }
    const leverage = account?.leverage || 100;
    const contractSize = symbolInfo?.contractSize || 100000;
    return (lotNumber * contractSize * basePrice) / leverage;
  }, [lotNumber, basePrice, symbolInfo, account]);

  // Stops level warning
  const stopsLevelViolation = useMemo(() => {
    const minStopsLevel = symbolInfo?.stopsLevel || 10;
    const minStopDist = minStopsLevel * point;
    if (basePrice > 0 && parsedSl > 0 && Math.abs(basePrice - parsedSl) < minStopDist) {
      return `Stop Loss too close to market! Minimum broker distance: ${minStopsLevel} points (${(minStopsLevel * point / pipUnit).toFixed(1)} pips).`;
    }
    if (basePrice > 0 && parsedTp > 0 && Math.abs(basePrice - parsedTp) < minStopDist) {
      return `Take Profit too close to market! Minimum broker distance: ${minStopsLevel} points (${(minStopsLevel * point / pipUnit).toFixed(1)} pips).`;
    }
    return null;
  }, [basePrice, parsedSl, parsedTp, symbolInfo, point, pipUnit]);

  const quickLotSizes = ['0.01', '0.05', '0.10', '0.25', '0.50', '1.00'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (exceedsRisk) {
      setStatus({ message: `Lot size exceeds risk limit (${maxLots} lots)`, error: true });
      return;
    }
    if (isKillSwitch) {
      setStatus({ message: 'Emergency Kill Switch is active!', error: true });
      return;
    }
    if (stopsLevelViolation) {
      setStatus({ message: stopsLevelViolation, error: true });
      return;
    }

    try {
      setSubmitting(true);
      setStatus(null);

      const commandPayload: any = {
        action: 'EXECUTE_TRADE',
        symbol: selectedSymbol,
        orderType,
        volume: lotNumber,
        sl: parsedSl > 0 ? parsedSl : undefined,
        tp: parsedTp > 0 ? parsedTp : undefined,
        comment,
        source: 'MANUAL_UI',
      };

      if (orderCategory === 'PENDING' && basePrice > 0) {
        commandPayload.price = basePrice;
      }

      const res = await api.sendCommand(commandPayload);

      if (res.success) {
        setStatus({ message: `Queued #${res.commandId} for MT5 ${orderType} (${lotNumber} lots)!` });
        if (inputMode === 'PRICE') {
          setSlPrice('');
          setTpPrice('');
        }
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
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between font-mono text-xs">
      <div>
        {/* Top Header & Live Spread */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Forex Order Execution
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-cyan-300 border border-slate-800">
              Spread: <strong className="text-cyan-400">{spreadPips} pips</strong> ({spreadPts} pts)
            </span>
          </div>
        </div>

        {/* Live Bid/Ask Price Strip */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-2 rounded-lg bg-slate-950/80 border border-rose-950/60 flex items-center justify-between">
            <div>
              <span className="text-[9px] text-slate-500 uppercase block font-semibold">SELL (Bid)</span>
              <span className="text-base font-bold text-rose-400 font-mono">
                {currentBid > 0 ? currentBid.toFixed(digits) : '---'}
              </span>
            </div>
            <ArrowDown className="h-4 w-4 text-rose-500/60" />
          </div>

          <div className="p-2 rounded-lg bg-slate-950/80 border border-emerald-950/60 flex items-center justify-between">
            <div>
              <span className="text-[9px] text-slate-500 uppercase block font-semibold">BUY (Ask)</span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                {currentAsk > 0 ? currentAsk.toFixed(digits) : '---'}
              </span>
            </div>
            <ArrowUp className="h-4 w-4 text-emerald-500/60" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Order Category Toggle: Market vs Pending */}
          <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setOrderCategory('MARKET');
                if (!['BUY', 'SELL'].includes(orderType)) setOrderType('BUY');
              }}
              className={`flex-1 py-1 rounded text-center text-[11px] font-bold transition-all ${
                orderCategory === 'MARKET' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Instant Market Execution
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderCategory('PENDING');
                if (['BUY', 'SELL'].includes(orderType)) setOrderType('BUY_LIMIT');
              }}
              className={`flex-1 py-1 rounded text-center text-[11px] font-bold transition-all ${
                orderCategory === 'PENDING' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pending Limit / Stop
            </button>
          </div>

          {/* Symbol & Order Type Selectors */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 text-[10px] mb-1 uppercase font-semibold">Asset Symbol</label>
              <input
                type="text"
                value={selectedSymbol}
                onChange={(e) => onSelectSymbol(e.target.value.toUpperCase())}
                placeholder="EURUSD"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono uppercase focus:border-cyan-500 focus:outline-none"
                list="order-symbol-options"
              />
              <datalist id="order-symbol-options">
                {ticks.length > 0
                  ? ticks.map((t) => <option key={t.symbol} value={t.symbol} />)
                  : ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US30'].map((s) => (
                      <option key={s} value={s} />
                    ))}
              </datalist>
            </div>

            <div>
              <label className="block text-slate-400 text-[10px] mb-1 uppercase font-semibold">Order Type</label>
              {orderCategory === 'MARKET' ? (
                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setOrderType('BUY')}
                    className={`py-1 rounded text-[11px] font-bold transition-all ${
                      orderType === 'BUY' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('SELL')}
                    className={`py-1 rounded text-[11px] font-bold transition-all ${
                      orderType === 'SELL' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    SELL
                  </button>
                </div>
              ) : (
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as OrderType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white focus:border-cyan-500 focus:outline-none text-[11px]"
                >
                  <option value="BUY_LIMIT">BUY LIMIT</option>
                  <option value="SELL_LIMIT">SELL LIMIT</option>
                  <option value="BUY_STOP">BUY STOP</option>
                  <option value="SELL_STOP">SELL STOP</option>
                </select>
              )}
            </div>
          </div>

          {/* Pending Order Price Input */}
          {orderCategory === 'PENDING' && (
            <div>
              <label className="block text-slate-400 text-[10px] mb-1 uppercase font-semibold">
                Entry Target Price
              </label>
              <input
                type="number"
                step="any"
                required
                placeholder={basePrice > 0 ? basePrice.toFixed(digits) : 'Enter order price'}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}

          {/* Volume / Lot Size & Risk-Based Position Sizer */}
          <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-400 text-[10px] uppercase font-semibold">Volume (Lots)</label>
              <button
                type="button"
                onClick={() => setAutoSizingEnabled(!autoSizingEnabled)}
                className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                  autoSizingEnabled
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Calculator className="h-2.5 w-2.5" />
                <span>{autoSizingEnabled ? 'Auto-Risk On' : 'Auto-Risk Sizer'}</span>
              </button>
            </div>

            {autoSizingEnabled && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                <span className="text-[10px] text-slate-400">Risk % Balance:</span>
                {['0.5', '1.0', '1.5', '2.0'].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setRiskPercent(pct)}
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      riskPercent === pct
                        ? 'bg-cyan-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={maxLots}
                value={volume}
                onChange={(e) => {
                  setVolume(e.target.value);
                  setAutoSizingEnabled(false);
                }}
                className={`w-full bg-slate-900 border rounded-lg px-3 py-1.5 text-white font-mono focus:outline-none ${
                  exceedsRisk ? 'border-rose-500 bg-rose-950/30' : 'border-slate-800 focus:border-cyan-500'
                }`}
              />
              <span className="text-[10px] text-slate-400 shrink-0">Max {maxLots}</span>
            </div>

            {/* Quick lot preset buttons */}
            <div className="flex items-center gap-1">
              {quickLotSizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => {
                    setVolume(sz);
                    setAutoSizingEnabled(false);
                  }}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-all ${
                    volume === sz
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-700 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* SL & TP with Pips / Absolute Price Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Protection Parameters</span>
              <div className="flex rounded bg-slate-950 p-0.5 border border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setInputMode('PIPS')}
                  className={`px-2 py-0.5 rounded ${inputMode === 'PIPS' ? 'bg-slate-800 text-cyan-300 font-bold' : 'text-slate-400'}`}
                >
                  By Pips
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('PRICE')}
                  className={`px-2 py-0.5 rounded ${inputMode === 'PRICE' ? 'bg-slate-800 text-cyan-300 font-bold' : 'text-slate-400'}`}
                >
                  By Price
                </button>
              </div>
            </div>

            {inputMode === 'PIPS' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="text-rose-400 font-bold">Stop Loss</span>
                    <span>{slPrice || '---'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="1"
                      min="5"
                      value={slPips}
                      onChange={(e) => setSlPips(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                      placeholder="Pips"
                    />
                    <span className="text-[10px] text-slate-500">pips</span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {['15', '25', '40', '60'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSlPips(p)}
                        className="text-[9px] px-1 py-0.5 bg-slate-900 hover:bg-slate-800 rounded text-slate-400"
                      >
                        {p}p
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="text-emerald-400 font-bold">Take Profit</span>
                    <span>{tpPrice || '---'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="1"
                      min="5"
                      value={tpPips}
                      onChange={(e) => setTpPips(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                      placeholder="Pips"
                    />
                    <span className="text-[10px] text-slate-500">pips</span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {['1:1.5', '1:2', '1:3'].map((r) => {
                      const mult = r === '1:1.5' ? 1.5 : r === '1:2' ? 2 : 3;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            const curSl = parseFloat(slPips) || 20;
                            setTpPips(String(Math.round(curSl * mult)));
                          }}
                          className="text-[9px] px-1 py-0.5 bg-slate-900 hover:bg-slate-800 rounded text-slate-400"
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 text-[10px] mb-1">Stop Loss Price</label>
                  <input
                    type="number"
                    step="any"
                    value={slPrice}
                    onChange={(e) => setSlPrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-1">Take Profit Price</label>
                  <input
                    type="number"
                    step="any"
                    value={tpPrice}
                    onChange={(e) => setTpPrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Pre-Trade Analytics Bar */}
          <div className="p-2.5 bg-slate-950 border border-slate-800/80 rounded-lg space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between text-slate-400">
              <span>Pip Value: <strong className="text-cyan-300">${pipValue.toFixed(2)}/pip</strong></span>
              <span>Req. Margin: <strong className="text-white">${estimatedMargin.toFixed(2)}</strong></span>
            </div>

            {(potentialLossUsd > 0 || potentialProfitUsd > 0) && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <span className="text-rose-400">
                  Risk: <strong>-${potentialLossUsd.toFixed(2)}</strong> ({slDistancePips.toFixed(1)}p)
                </span>
                <span className="text-emerald-400">
                  Target: <strong>+${potentialProfitUsd.toFixed(2)}</strong> ({tpDistancePips.toFixed(1)}p)
                </span>
                {riskRewardRatio && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-bold">
                    R:R {riskRewardRatio}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Violations / Cautions */}
          {stopsLevelViolation && (
            <div className="p-2 rounded bg-amber-950/70 border border-amber-800 text-amber-300 text-[11px] flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>{stopsLevelViolation}</span>
            </div>
          )}

          {status && (
            <div
              className={`p-2 rounded text-[11px] flex items-center gap-1.5 ${
                status.error
                  ? 'bg-rose-950/70 text-rose-300 border border-rose-800'
                  : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
              }`}
            >
              {status.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              <span>{status.message}</span>
            </div>
          )}

          {/* Execution Button */}
          <button
            type="submit"
            disabled={submitting || exceedsRisk || isKillSwitch || Boolean(stopsLevelViolation)}
            className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 ${
              isKillSwitch || exceedsRisk || stopsLevelViolation
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : orderType.includes('BUY')
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            {submitting
              ? 'Dispatching to MT5...'
              : `Execute ${orderType.replace('_', ' ')} ${lotNumber} Lots`}
          </button>
        </form>
      </div>

      <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
        <span>Execution Engine: MT5 EA Bridge</span>
        <span className="text-cyan-400">Direct Broker STP/ECN</span>
      </div>
    </div>
  );
};
