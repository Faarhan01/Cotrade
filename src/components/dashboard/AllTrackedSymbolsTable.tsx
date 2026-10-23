import React, { useState } from 'react';
import { DetailedSymbolInfo, TickData } from '../../types';
import { Layers, Search, Zap, ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface AllTrackedSymbolsTableProps {
  symbols: DetailedSymbolInfo[];
  ticks: TickData[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export const AllTrackedSymbolsTable: React.FC<AllTrackedSymbolsTableProps> = ({
  symbols,
  ticks,
  selectedSymbol,
  onSelectSymbol,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Fallback to ticks if detailed symbols array is still populating
  const displaySymbols: DetailedSymbolInfo[] =
    symbols && symbols.length > 0
      ? symbols
      : ticks.map((t) => ({
          symbol: t.symbol,
          bid: t.bid,
          ask: t.ask,
          spread: t.spread,
          digits: t.symbol.includes('JPY') ? 3 : 5,
          point: t.symbol.includes('JPY') ? 0.001 : 0.00001,
          minLot: 0.01,
          maxLot: 100.0,
          lotStep: 0.01,
          contractSize: 100000,
          tradeAllowed: true,
          high24h: t.high24h,
          low24h: t.low24h,
        }));

  const filtered = displaySymbols.filter((s) =>
    s.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-cyan-400" />
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              All Tracked Symbols Sent By MT5 EA ({displaySymbols.length})
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Full broker market specifications & live quotes transmitted from MetaTrader 5
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search symbols..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white focus:border-cyan-500 focus:outline-none w-48"
          />
        </div>
      </div>

      {displaySymbols.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-lg p-8 text-center text-slate-400 font-mono text-xs space-y-2">
          <div className="text-sm font-bold text-slate-300">
            Awaiting Symbols Transmitted by MT5 EA
          </div>
          <p className="text-slate-500 max-w-lg mx-auto">
            Once <code className="text-cyan-400">AIMT5Bridge.mq5</code> connects to <code className="text-cyan-400">http://127.0.0.1:7777</code>,
            all symbols defined in the EA properties (or Market Watch) will populate here with live broker metrics.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Live Bid</th>
                <th className="py-2.5 px-3">Live Ask</th>
                <th className="py-2.5 px-3">Spread</th>
                <th className="py-2.5 px-3">24h / Session Range</th>
                <th className="py-2.5 px-3">Min - Max Lot</th>
                <th className="py-2.5 px-3">Contract Size</th>
                <th className="py-2.5 px-3">Trading</th>
                <th className="py-2.5 px-3 text-right">Direct Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((item) => {
                const isSelected = selectedSymbol === item.symbol;
                const digits = item.digits || (item.symbol.includes('JPY') ? 3 : 5);
                const high = item.sessionHigh || item.high24h;
                const low = item.sessionLow || item.low24h;

                return (
                  <tr
                    key={item.symbol}
                    className={`hover:bg-slate-800/50 transition-colors ${
                      isSelected ? 'bg-cyan-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{item.symbol}</span>
                        {item.isCurrentChart && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                            Active Chart
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-400">
                      {item.bid > 0 ? item.bid.toFixed(digits) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">
                      {item.ask > 0 ? item.ask.toFixed(digits) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 font-bold">
                      {item.spread} pts
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {high && low && high > 0 ? (
                        <div className="text-[11px]">
                          <span className="text-rose-400">{low.toFixed(digits)}</span>
                          <span className="text-slate-600 mx-1">→</span>
                          <span className="text-emerald-400">{high.toFixed(digits)}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {item.minLot} - {item.maxLot}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {item.contractSize.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3">
                      {item.tradeAllowed ? (
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                          Enabled
                        </span>
                      ) : (
                        <span className="text-[10px] text-rose-400 bg-rose-950/60 border border-rose-800/60 px-1.5 py-0.5 rounded">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onSelectSymbol(item.symbol)}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all inline-flex items-center gap-1 ${
                          isSelected
                            ? 'bg-cyan-600 text-white shadow'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                        }`}
                      >
                        <Zap className="h-3 w-3" />
                        <span>{isSelected ? 'Active Chart' : 'Select'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
