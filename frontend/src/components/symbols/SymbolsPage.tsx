import React, { useState, useMemo } from "react";
import {
  Sliders,
  Search,
  Activity,
  ArrowRight,
  TrendingUp,
  Info,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Badge, Button, Modal, ModalFooter } from "../ui";
import { getSymbol, selectSymbol } from "../../services/cotrade";

export interface SymbolsPageProps {
  allSymbols: any[];
  symbolStates: any[];
  activeSymbol: string;
  onSwitchSymbol: (symbol: string) => void;
  onNavigateHome?: () => void;
}

export const SymbolsPage: React.FC<SymbolsPageProps> = ({
  allSymbols = [],
  symbolStates = [],
  activeSymbol,
  onSwitchSymbol,
  onNavigateHome,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "FOREX" | "CRYPTO" | "METALS" | "INDICES">("ALL");
  const [selectedSymbolDetail, setSelectedSymbolDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of symbolStates) {
      if (s.currentPrice > 0) map.set(s.symbol, s.currentPrice);
    }
    return map;
  }, [symbolStates]);

  const filteredSymbols = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSymbols.filter((s) => {
      const name = (s.name || s.symbol || "").toLowerCase();
      const desc = (s.description || "").toLowerCase();
      const path = (s.path || "").toLowerCase();

      // Category filter
      if (categoryFilter === "FOREX") {
        const isForex = path.includes("forex") || /^(eur|usd|gbp|jpy|aud|cad|chf|nzd){2}/i.test(name);
        if (!isForex) return false;
      } else if (categoryFilter === "CRYPTO") {
        const isCrypto = path.includes("crypto") || /^(btc|eth|sol|xrp|doge|ltc)/i.test(name);
        if (!isCrypto) return false;
      } else if (categoryFilter === "METALS") {
        const isMetal = path.includes("metal") || /^(xau|xag|gold|silver|oil)/i.test(name);
        if (!isMetal) return false;
      } else if (categoryFilter === "INDICES") {
        const isIndex = path.includes("index") || /^(us30|spx|nas|dax|ftse|step|volatility)/i.test(name);
        if (!isIndex) return false;
      }

      // Query filter
      if (!q) return true;
      return name.includes(q) || desc.includes(q) || path.includes(q);
    });
  }, [allSymbols, searchQuery, categoryFilter]);

  const handleInspectSymbol = async (name: string) => {
    setDetailLoading(true);
    try {
      const spec = await getSymbol(name);
      setSelectedSymbolDetail(spec);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectAndChart = async (name: string) => {
    try {
      await selectSymbol(name);
    } catch {}
    onSwitchSymbol(name);
    if (onNavigateHome) {
      onNavigateHome();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header & Filters Toolbar */}
      <div className="card-panel bg-slate-900/90 border border-slate-800 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Broker Instruments Catalogue ({allSymbols.length})
            </h2>
            <Badge variant="brand" size="sm">
              ACTIVE: {activeSymbol || "NONE"}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real broker quotes, tick sizes, swap rates, and contract specifications queried directly from MetaTrader 5.
          </p>
        </div>

        {/* Search & Category Pills */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter symbol (EURUSD, BTC...)"
              className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono w-full sm:w-48"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {(["ALL", "FOREX", "METALS", "CRYPTO", "INDICES"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
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
      </div>

      {/* 2. Symbols Grid */}
      {filteredSymbols.length === 0 ? (
        <div className="card-panel py-12 text-center text-xs text-slate-500">
          {allSymbols.length === 0
            ? "Loading broker symbols from MetaTrader 5..."
            : `No instruments matching "${searchQuery}"`}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredSymbols.map((s) => {
            const name = s.name || s.symbol;
            const isActive = name === activeSymbol;
            const livePrice = priceMap.get(name) ?? s.bid ?? s.ask ?? 0;
            const digits = s.digits ?? 4;

            return (
              <div
                key={name}
                className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                  isActive
                    ? "bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-950/40 ring-1 ring-indigo-500/30"
                    : "bg-slate-850/80 border-slate-700/60 hover:border-slate-600 hover:bg-slate-800/90"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold font-mono ${isActive ? "text-indigo-300" : "text-white"}`}>
                          {name}
                        </span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        )}
                      </div>
                      {s.description && (
                        <p className="text-[10px] text-slate-400 truncate max-w-[170px] mt-0.5" title={s.description}>
                          {s.description}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-mono font-bold text-emerald-400 tabular-nums">
                        {livePrice > 0 ? livePrice.toFixed(digits) : "—"}
                      </span>
                      {s.spread !== undefined && s.spread > 0 && (
                        <span className="block text-[9px] font-mono text-slate-500">
                          spr: {s.spread}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bid:</span>
                      <span className="text-slate-300">{s.bid ? s.bid.toFixed(digits) : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ask:</span>
                      <span className="text-slate-300">{s.ask ? s.ask.toFixed(digits) : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Contract:</span>
                      <span className="text-slate-300">{s.trade_contract_size ?? s.contract_size ?? 1}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Swap L/S:</span>
                      <span className="text-slate-300">
                        {s.swap_long ?? 0}/{s.swap_short ?? 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/70 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleInspectSymbol(name)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono cursor-pointer"
                  >
                    <Info className="w-3 h-3" />
                    Details
                  </button>

                  <Button
                    variant={isActive ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => handleSelectAndChart(name)}
                  >
                    {isActive ? "Viewing Chart" : "Chart This"}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Symbol Detail Modal */}
      <Modal
        open={!!selectedSymbolDetail}
        onClose={() => setSelectedSymbolDetail(null)}
        title={
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Specification — {selectedSymbolDetail?.name}</span>
          </div>
        }
        size="md"
      >
        {selectedSymbolDetail && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-mono text-base font-bold text-white">
                  {selectedSymbolDetail.name}
                </span>
                <p className="text-xs text-slate-400 mt-0.5">{selectedSymbolDetail.description}</p>
                <span className="text-[10px] text-slate-500 font-mono">{selectedSymbolDetail.path}</span>
              </div>
              <div className="text-right">
                <span className="text-base font-mono font-bold text-emerald-400">
                  {selectedSymbolDetail.bid ?? "—"}
                </span>
                <span className="block text-[10px] text-slate-400 font-mono">
                  spread: {selectedSymbolDetail.spread ?? 0}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Digits</span>
                <span className="text-white font-bold">{selectedSymbolDetail.digits}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Contract Size</span>
                <span className="text-white font-bold">{selectedSymbolDetail.trade_contract_size ?? 1}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Tick Size / Value</span>
                <span className="text-white font-bold">
                  {selectedSymbolDetail.trade_tick_size ?? 0} / {selectedSymbolDetail.trade_tick_value ?? 0}
                </span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Volume Min / Max</span>
                <span className="text-white font-bold">
                  {selectedSymbolDetail.volume_min ?? 0.01} — {selectedSymbolDetail.volume_max ?? 100}
                </span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Swap Long / Short</span>
                <span className="text-white font-bold">
                  {selectedSymbolDetail.swap_long ?? 0} / {selectedSymbolDetail.swap_short ?? 0}
                </span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px] block">Trade Allowed</span>
                <span className="text-emerald-400 font-bold">
                  {selectedSymbolDetail.trade_mode !== undefined ? "Enabled" : "Yes"}
                </span>
              </div>
            </div>

            <ModalFooter>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedSymbolDetail(null)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  handleSelectAndChart(selectedSymbolDetail.name);
                  setSelectedSymbolDetail(null);
                }}
              >
                Chart {selectedSymbolDetail.name}
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>
    </div>
  );
};
