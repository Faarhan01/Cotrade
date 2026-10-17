import React, { useState, useMemo } from "react";
import { ChevronDown, Search, Activity, Check } from "lucide-react";

export interface SymbolSwitcherProps {
  symbolStates?: Array<{ symbol: string; connection?: any; currentPrice: number; tickCount?: number }>;
  allSymbols?: Array<any>;
  activeSymbol: string;
  onSwitchSymbol: (symbol: string) => void;
}

export const SymbolSwitcher: React.FC<SymbolSwitcherProps> = ({
  symbolStates = [],
  allSymbols = [],
  activeSymbol,
  onSwitchSymbol,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "FOREX" | "CRYPTO" | "METALS">("ALL");

  // Merge all broker symbols with live tick prices from symbolStates
  const mergedSymbols = useMemo(() => {
    const priceMap = new Map<string, number>();
    for (const s of symbolStates) {
      if (s.currentPrice > 0) {
        priceMap.set(s.symbol, s.currentPrice);
      }
    }

    if (allSymbols.length > 0) {
      return allSymbols.map((s) => {
        const name = s.name || s.symbol;
        const livePrice = priceMap.get(name) ?? s.bid ?? s.ask ?? 0;
        return {
          symbol: name,
          bid: s.bid,
          ask: s.ask,
          spread: s.spread,
          digits: s.digits,
          description: s.description || "",
          path: s.path || "",
          price: livePrice,
          visible: s.visible ?? true,
        };
      });
    }

    // Fallback if allSymbols not loaded yet: use symbolStates
    return symbolStates.map((s) => ({
      symbol: s.symbol,
      bid: s.currentPrice,
      ask: s.currentPrice,
      spread: 0,
      digits: 2,
      description: "",
      path: "",
      price: s.currentPrice,
      visible: true,
    }));
  }, [allSymbols, symbolStates]);

  const filteredSymbols = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mergedSymbols.filter((s) => {
      // Category filter
      if (categoryFilter === "FOREX") {
        const isForex = s.path.toLowerCase().includes("forex") ||
          /^(EUR|USD|GBP|JPY|AUD|CAD|CHF|NZD){2}/i.test(s.symbol);
        if (!isForex) return false;
      } else if (categoryFilter === "CRYPTO") {
        const isCrypto = s.path.toLowerCase().includes("crypto") ||
          /^(BTC|ETH|SOL|XRP|DOGE|LTC)/i.test(s.symbol);
        if (!isCrypto) return false;
      } else if (categoryFilter === "METALS") {
        const isMetal = s.path.toLowerCase().includes("metal") ||
          /^(XAU|XAG|GOLD|SILVER|OIL|US30|SPX|NAS)/i.test(s.symbol);
        if (!isMetal) return false;
      }

      // Text search
      if (!q) return true;
      return (
        s.symbol.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.path.toLowerCase().includes(q)
      );
    });
  }, [mergedSymbols, searchQuery, categoryFilter]);

  const currentDisplay = activeSymbol || (mergedSymbols[0]?.symbol ?? "Select Symbol");
  const currentItem = mergedSymbols.find((s) => s.symbol === currentDisplay);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-800/90 border border-slate-700 hover:border-slate-600 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-700/80 transition-all cursor-pointer shadow-sm"
        title={`Active Symbol: ${currentDisplay}`}
      >
        <span className="flex items-center gap-1.5 font-mono font-bold text-slate-100">
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          {currentDisplay}
        </span>
        {currentItem && currentItem.price > 0 && (
          <span className="font-mono text-emerald-400 text-[11px] tabular-nums font-semibold">
            {currentItem.price.toFixed(currentItem.digits ?? 4)}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-2 w-84 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
            {/* Header & Search */}
            <div className="p-3 border-b border-slate-800 bg-slate-900/95 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Select Market Symbol</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {filteredSymbols.length} / {mergedSymbols.length}
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter symbols (EURUSD, XAU, BTC...)"
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  autoFocus
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 pt-1">
                {(["ALL", "FOREX", "METALS", "CRYPTO"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      categoryFilter === cat
                        ? "bg-indigo-600 text-white font-bold"
                        : "bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Symbols List */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
              {filteredSymbols.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No symbols matching "{searchQuery}"
                </div>
              ) : (
                filteredSymbols.map((item) => {
                  const isActive = item.symbol === currentDisplay;
                  return (
                    <button
                      key={item.symbol}
                      type="button"
                      onClick={() => {
                        onSwitchSymbol(item.symbol);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-left hover:bg-slate-800/70 transition-colors cursor-pointer ${
                        isActive ? "bg-indigo-950/40 border-l-2 border-indigo-500" : ""
                      }`}
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold font-mono ${isActive ? "text-indigo-300" : "text-slate-200"}`}>
                            {item.symbol}
                          </span>
                          {isActive && <Check className="w-3 h-3 text-indigo-400" />}
                        </div>
                        {item.description && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                            {item.description}
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-semibold text-emerald-400 tabular-nums">
                          {item.price > 0 ? item.price.toFixed(item.digits ?? 4) : item.bid ? item.bid.toFixed(item.digits ?? 4) : "—"}
                        </span>
                        {item.spread !== undefined && item.spread > 0 && (
                          <span className="block text-[9px] font-mono text-slate-500">
                            spread: {item.spread}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
