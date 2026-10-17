import React, { useState, useMemo } from "react";
import { Activity, Search, TrendingUp, TrendingDown, Eye } from "lucide-react";

export interface MarketWatchProps {
  symbolStates: Array<{ symbol: string; connection?: any; currentPrice: number; tickCount?: number }>;
  allSymbols: Array<any>;
  activeSymbol: string;
  onSwitchSymbol: (symbol: string) => void;
}

export const MarketWatch: React.FC<MarketWatchProps> = ({
  symbolStates = [],
  allSymbols = [],
  activeSymbol,
  onSwitchSymbol,
}) => {
  const [filterQuery, setFilterQuery] = useState("");

  // Merge symbol states with allSymbols
  const displaySymbols = useMemo(() => {
    const liveMap = new Map<string, number>();
    for (const s of symbolStates) {
      if (s.currentPrice > 0) liveMap.set(s.symbol, s.currentPrice);
    }

    // If we have symbolStates, use them first
    if (symbolStates.length > 0) {
      return symbolStates.map((s) => {
        const spec = allSymbols.find((x) => x.name === s.symbol || x.symbol === s.symbol);
        return {
          symbol: s.symbol,
          price: s.currentPrice,
          bid: spec?.bid ?? s.currentPrice,
          ask: spec?.ask ?? s.currentPrice,
          spread: spec?.spread ?? 0,
          digits: spec?.digits ?? 4,
          description: spec?.description || "",
        };
      });
    }

    // Otherwise show first 12 symbols from allSymbols
    return allSymbols.slice(0, 18).map((s) => ({
      symbol: s.name || s.symbol,
      price: s.bid || s.ask || 0,
      bid: s.bid ?? 0,
      ask: s.ask ?? 0,
      spread: s.spread ?? 0,
      digits: s.digits ?? 4,
      description: s.description || "",
    }));
  }, [symbolStates, allSymbols]);

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return displaySymbols;
    return displaySymbols.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [displaySymbols, filterQuery]);

  return (
    <div className="card-panel">
      <div className="card-panel-header">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <span className="card-panel-title">Market Watch</span>
          <span className="text-xs text-slate-400 font-mono">
            ({displaySymbols.length} quotes)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter quote..."
              className="pl-7 pr-2.5 py-1 text-xs bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono w-32 sm:w-40"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {filtered.map((item) => {
          const isActive = item.symbol === activeSymbol;
          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => onSwitchSymbol(item.symbol)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between ${
                isActive
                  ? "bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-950/50 ring-1 ring-indigo-500/30"
                  : "bg-slate-800/80 border-slate-700/60 hover:border-slate-600 hover:bg-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-1 w-full">
                <span className={`text-xs font-bold font-mono ${isActive ? "text-indigo-300" : "text-slate-200"}`}>
                  {item.symbol}
                </span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                )}
              </div>

              <div className="mt-2 flex items-baseline justify-between gap-1">
                <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                  {item.price > 0 ? item.price.toFixed(item.digits) : "—"}
                </span>
                {item.spread > 0 && (
                  <span className="text-[10px] font-mono text-slate-500">
                    spr: {item.spread}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full py-6 text-center text-xs text-slate-500">
            {displaySymbols.length === 0 ? "Connecting to MT5 quotes..." : `No symbols matching "${filterQuery}"`}
          </div>
        )}
      </div>
    </div>
  );
};
