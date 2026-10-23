import React, { useEffect, useRef, useState } from 'react';
import { TickData } from '../../types';
import { ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';

interface LiveTickStreamProps {
  ticks: TickData[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export const LiveTickStream: React.FC<LiveTickStreamProps> = ({
  ticks,
  selectedSymbol,
  onSelectSymbol,
}) => {
  const prevTicksRef = useRef<Record<string, number>>({});
  const [flashStates, setFlashStates] = useState<Record<string, 'up' | 'down' | null>>({});

  useEffect(() => {
    const newFlashes: Record<string, 'up' | 'down' | null> = {};
    let hasChange = false;

    for (const tick of ticks) {
      const prevBid = prevTicksRef.current[tick.symbol];
      if (prevBid !== undefined && prevBid !== tick.bid) {
        newFlashes[tick.symbol] = tick.bid > prevBid ? 'up' : 'down';
        hasChange = true;
      }
      prevTicksRef.current[tick.symbol] = tick.bid;
    }

    if (hasChange) {
      setFlashStates((prev) => ({ ...prev, ...newFlashes }));
      const timer = setTimeout(() => {
        setFlashStates({});
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [ticks]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Live Tick Stream</h2>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Sub-second updates via MT5 Bridge
        </span>
      </div>

      {ticks.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-lg p-6 text-center text-slate-400 font-mono text-xs space-y-1">
          <div className="text-sm font-bold text-slate-300">
            Awaiting Real Market Ticks from MetaTrader 5
          </div>
          <p className="text-slate-500">
            No fake simulated ticks. Attach <code className="text-cyan-400">AIMT5Bridge.mq5</code> to any chart in MT5 with whitelisted URL <code className="text-cyan-400">http://127.0.0.1:7777</code> to begin live tick streaming.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {ticks.map((tick) => {
          const isSelected = selectedSymbol === tick.symbol;
          const flash = flashStates[tick.symbol];
          const digits = tick.symbol.includes('JPY') ? 3 : tick.symbol.includes('USD') && tick.symbol.length <= 6 ? 5 : 2;

          return (
            <div
              key={tick.symbol}
              onClick={() => onSelectSymbol(tick.symbol)}
              className={`cursor-pointer rounded-lg p-2.5 border transition-all ${
                isSelected
                  ? 'bg-slate-800/90 border-cyan-500 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-500/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs font-mono text-white tracking-wide">
                  {tick.symbol}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                  Sprd: {tick.spread} pts
                </span>
              </div>

              {/* Price display with tick movement flash */}
              <div className="flex items-baseline justify-between mt-1.5">
                <div className="text-left">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Bid</span>
                  <div
                    className={`text-sm font-bold font-mono transition-colors duration-300 ${
                      flash === 'up'
                        ? 'text-emerald-400 bg-emerald-950/60 px-1 rounded'
                        : flash === 'down'
                        ? 'text-rose-400 bg-rose-950/60 px-1 rounded'
                        : 'text-slate-100'
                    }`}
                  >
                    {tick.bid.toFixed(digits)}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Ask</span>
                  <div className="text-sm font-mono font-medium text-slate-300">
                    {tick.ask.toFixed(digits)}
                  </div>
                </div>
              </div>

              {/* 24h range */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-2 pt-1 border-t border-slate-800/80">
                <span className="flex items-center gap-0.5 text-slate-400">
                  L: {tick.low24h?.toFixed(digits) || tick.bid.toFixed(digits)}
                </span>
                <span className="flex items-center gap-0.5 text-slate-400">
                  H: {tick.high24h?.toFixed(digits) || tick.ask.toFixed(digits)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
};
