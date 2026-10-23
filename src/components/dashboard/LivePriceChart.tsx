import React, { useMemo } from 'react';
import { Position, TickData } from '../../types';
import { BarChart3, TrendingUp } from 'lucide-react';

interface LivePriceChartProps {
  symbol: string;
  history: { time: number; bid: number; ask: number }[];
  currentTick?: TickData;
  positions: Position[];
}

export const LivePriceChart: React.FC<LivePriceChartProps> = ({
  symbol,
  history,
  currentTick,
  positions,
}) => {
  const digits = symbol.includes('JPY') ? 3 : symbol.includes('USD') && symbol.length <= 6 ? 5 : 2;

  // Compute SVG dimensions and scale
  const { pathData, minPrice, maxPrice, priceRange, lastY } = useMemo(() => {
    if (!history || history.length < 2) {
      return { pathData: '', minPrice: 0, maxPrice: 0, priceRange: 1, lastY: 50 };
    }

    const bids = history.map((h) => h.bid);
    let min = Math.min(...bids);
    let max = Math.max(...bids);

    // Give 10% breathing room top and bottom
    const pad = (max - min) * 0.15 || 0.0001;
    min -= pad;
    max += pad;
    const range = max - min || 1;

    const width = 600;
    const height = 180;

    const points = history.map((pt, idx) => {
      const x = (idx / (history.length - 1)) * width;
      const y = height - ((pt.bid - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const path = `M ${points.join(' L ')}`;
    const lastPoint = history[history.length - 1];
    const curY = height - ((lastPoint.bid - min) / range) * height;

    return {
      pathData: path,
      minPrice: min + pad,
      maxPrice: max - pad,
      priceRange: range,
      lastY: curY,
    };
  }, [history]);

  const relatedPositions = positions.filter((p) => p.symbol === symbol);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          <span className="font-bold text-sm text-white font-mono">{symbol}</span>
          <span className="text-xs text-slate-400 font-mono">Real-Time Tick Movement</span>
        </div>

        {currentTick && (
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-400">
              Sprd: <span className="text-cyan-300 font-bold">{currentTick.spread} pts</span>
            </span>
            <span className="text-slate-400">
              Bid: <span className="text-emerald-400 font-bold">{currentTick.bid.toFixed(digits)}</span>
            </span>
            <span className="text-slate-400">
              Ask: <span className="text-slate-200">{currentTick.ask.toFixed(digits)}</span>
            </span>
          </div>
        )}
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full h-[180px] bg-slate-950/70 border border-slate-800/80 rounded-lg overflow-hidden flex items-center justify-center">
        {history && history.length >= 2 ? (
          <>
            <svg
              viewBox="0 0 600 180"
              preserveAspectRatio="none"
              className="w-full h-full stroke-cyan-400 stroke-2 fill-none overflow-visible"
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="45" x2="600" y2="45" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="600" y2="90" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="135" x2="600" y2="135" stroke="#1e293b" strokeDasharray="3 3" />

              {/* Area under curve */}
              <path
                d={`${pathData} L 600 180 L 0 180 Z`}
                fill="url(#chartGradient)"
                stroke="none"
              />

              {/* Tick price line */}
              <path d={pathData} stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />

              {/* Position markers */}
              {relatedPositions.map((pos) => {
                const posY = 180 - ((pos.openPrice - (minPrice - 0.0001)) / priceRange) * 180;
                if (posY >= 0 && posY <= 180) {
                  return (
                    <g key={pos.ticket}>
                      <line
                        x1="0"
                        y1={posY}
                        x2="600"
                        y2={posY}
                        stroke={pos.type === 'BUY' ? '#10b981' : '#f43f5e'}
                        strokeWidth="1"
                        strokeDasharray="4 2"
                      />
                    </g>
                  );
                }
                return null;
              })}

              {/* Current price marker dot */}
              <circle cx="600" cy={lastY} r="4" fill="#38bdf8" className="animate-ping" />
              <circle cx="600" cy={lastY} r="3" fill="#38bdf8" />
            </svg>

            {/* Price labels */}
            <div className="absolute right-2 top-2 bg-slate-900/90 border border-slate-700/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-cyan-300">
              High: {maxPrice.toFixed(digits)}
            </div>
            <div className="absolute right-2 bottom-2 bg-slate-900/90 border border-slate-700/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400">
              Low: {minPrice.toFixed(digits)}
            </div>

            {/* Position Badges on Chart */}
            {relatedPositions.map((pos) => (
              <div
                key={pos.ticket}
                className={`absolute left-2 top-2 text-[10px] font-mono px-2 py-0.5 rounded border ${
                  pos.type === 'BUY'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                    : 'bg-rose-950/80 text-rose-300 border-rose-700'
                }`}
              >
                {pos.type} #{pos.ticket} @ {pos.openPrice.toFixed(digits)} (PnL: ${pos.profit})
              </div>
            ))}
          </>
        ) : (
          <div className="text-slate-400 text-xs font-mono flex flex-col items-center gap-2 p-6 text-center">
            <TrendingUp className="h-5 w-5 text-cyan-400" />
            <span>Awaiting real price ticks from MT5 EA for {symbol}</span>
            <span className="text-[11px] text-slate-500">
              Attach AIMT5Bridge.mq5 in MetaTrader 5 to stream tick trajectory
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mt-2">
        <span>Window: Last 60 ticks</span>
        <span>Resolution: Raw Tick Stream</span>
      </div>
    </div>
  );
};
