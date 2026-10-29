import React, { useState } from 'react';
import { Calculator, X, DollarSign, Percent, ShieldAlert, ArrowRight, Zap, Target } from 'lucide-react';
import { DetailedSymbolInfo, ChartSymbolInfo, TickData } from '../../types';

interface ForexCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSymbol: string;
  symbolInfo?: DetailedSymbolInfo | ChartSymbolInfo | null;
  currentTick?: TickData | null;
  accountLeverage?: number;
  accountBalance?: number;
}

export const ForexCalculatorModal: React.FC<ForexCalculatorModalProps> = ({
  isOpen,
  onClose,
  selectedSymbol,
  symbolInfo,
  currentTick,
  accountLeverage = 100,
  accountBalance = 10000,
}) => {
  const [lots, setLots] = useState<string>('0.10');
  const [leverage, setLeverage] = useState<number>(accountLeverage || 100);
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [slPips, setSlPips] = useState<string>('30');
  const [tpPips, setTpPips] = useState<string>('60');

  if (!isOpen) return null;

  const lotNum = parseFloat(lots) || 0.01;
  const slPipsNum = parseFloat(slPips) || 0;
  const tpPipsNum = parseFloat(tpPips) || 0;

  const digits = symbolInfo?.digits ?? (selectedSymbol.includes('JPY') ? 3 : 5);
  const point = symbolInfo?.point ?? (selectedSymbol.includes('JPY') ? 0.001 : 0.00001);
  const pip = point * 10;
  const contractSize = (symbolInfo as any)?.contractSize || (symbolInfo as any)?.tradeContractSize || (selectedSymbol.includes('XAU') ? 100 : 100000);

  const bid = currentTick?.bid || (selectedSymbol.includes('JPY') ? 154.5 : 1.085);
  const ask = currentTick?.ask || (selectedSymbol.includes('JPY') ? 154.52 : 1.0852);
  const spreadPoints = currentTick?.spread || Math.round((ask - bid) / point) || 15;
  const spreadPips = spreadPoints / 10;

  // Approximate pip value in USD per 1.0 lot
  let pipValuePerLot = 10;
  if (selectedSymbol.includes('JPY')) {
    pipValuePerLot = (100000 * 0.01) / bid; // approx USD
  } else if (selectedSymbol.includes('XAU')) {
    pipValuePerLot = 10; // $10 per $0.10 move on 100oz
  }

  const pipValue = pipValuePerLot * lotNum;
  const spreadCostUsd = spreadPips * pipValue;
  const requiredMargin = (lotNum * contractSize * bid) / (leverage || 100);

  const potentialLossUsd = slPipsNum * pipValue;
  const potentialProfitUsd = tpPipsNum * pipValue;
  const riskRewardRatio = slPipsNum > 0 ? (tpPipsNum / slPipsNum).toFixed(2) : '0';
  const riskPercentOfBalance = accountBalance > 0 ? ((potentialLossUsd / accountBalance) * 100).toFixed(2) : '0';

  const entryPrice = direction === 'BUY' ? ask : bid;
  const projectedSlPrice = direction === 'BUY' ? entryPrice - slPipsNum * pip : entryPrice + slPipsNum * pip;
  const projectedTpPrice = direction === 'BUY' ? entryPrice + tpPipsNum * pip : entryPrice - tpPipsNum * pip;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm font-mono animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Forex Pip, Spread & Margin Calculator</span>
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px]">
                  {selectedSymbol}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-sans">
                Real-time position sizing, broker spread fee, and risk/reward breakdown
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Quick Input Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Direction</label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setDirection('BUY')}
                  className={`py-1.5 rounded text-center font-bold text-xs ${
                    direction === 'BUY'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('SELL')}
                  className={`py-1.5 rounded text-center font-bold text-xs ${
                    direction === 'SELL'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Volume (Lots)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="50"
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Leverage</label>
              <select
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value={30}>1:30 (Retail EU)</option>
                <option value={50}>1:50 (US Reg)</option>
                <option value={100}>1:100 (Standard)</option>
                <option value={200}>1:200 (Pro)</option>
                <option value={500}>1:500 (High)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Live Spread</label>
              <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-cyan-300 font-bold">
                {spreadPips.toFixed(1)} pips ({spreadPoints} pts)
              </div>
            </div>
          </div>

          {/* SL & TP Pips */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-rose-400 uppercase font-bold">Stop Loss (Pips)</label>
                <span className="text-[10px] text-slate-500">Price: {projectedSlPrice.toFixed(digits)}</span>
              </div>
              <input
                type="number"
                step="1"
                min="1"
                value={slPips}
                onChange={(e) => setSlPips(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-rose-300 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-emerald-400 uppercase font-bold">Take Profit (Pips)</label>
                <span className="text-[10px] text-slate-500">Price: {projectedTpPrice.toFixed(digits)}</span>
              </div>
              <input
                type="number"
                step="1"
                min="1"
                value={tpPips}
                onChange={(e) => setTpPips(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Institutional Calculation Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase">Required Margin</span>
              <div className="text-base font-bold text-white">
                ${requiredMargin.toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500">at 1:{leverage} leverage</span>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase">Pip Value</span>
              <div className="text-base font-bold text-cyan-300">
                ${pipValue.toFixed(2)} <span className="text-[10px] text-slate-500">/ pip</span>
              </div>
              <span className="text-[10px] text-slate-500">for {lotNum} lots</span>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase">Spread Entry Cost</span>
              <div className="text-base font-bold text-amber-300">
                ${spreadCostUsd.toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500">broker transaction fee</span>
            </div>

            <div className="p-3 bg-rose-950/30 border border-rose-800/60 rounded-xl space-y-1">
              <span className="text-[10px] text-rose-400 uppercase font-bold">Max Risk ($ at SL)</span>
              <div className="text-base font-bold text-rose-300">
                -${potentialLossUsd.toFixed(2)}
              </div>
              <span className="text-[10px] text-rose-400/80">{riskPercentOfBalance}% of account</span>
            </div>

            <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-xl space-y-1">
              <span className="text-[10px] text-emerald-400 uppercase font-bold">Reward ($ at TP)</span>
              <div className="text-base font-bold text-emerald-300">
                +${potentialProfitUsd.toFixed(2)}
              </div>
              <span className="text-[10px] text-emerald-400/80">+{((potentialProfitUsd / accountBalance) * 100).toFixed(2)}% gain</span>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Risk / Reward</span>
              <div className="text-base font-bold text-cyan-400">
                1 : {riskRewardRatio}
              </div>
              <span className="text-[10px] text-slate-500">
                {parseFloat(riskRewardRatio) >= 2.0 ? 'Favorable R:R' : 'Sub-optimal R:R'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-sans">
            Rates calculated using live contract size ({contractSize.toLocaleString()} units)
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
