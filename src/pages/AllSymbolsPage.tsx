import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  Zap,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Bot,
  Sliders,
  DollarSign,
  Activity,
  Check,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Info,
  Maximize2,
  X,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Coins,
} from 'lucide-react';
import { AppState, DetailedSymbolInfo, TickData } from '../types';
import { api } from '../services/api';

interface AllSymbolsPageProps {
  state: AppState | null;
  onRefresh?: () => void;
  onNavigateToTab?: (tab: string, symbol?: string) => void;
}

type AssetCategory = 'ALL' | 'FOREX_MAJOR' | 'FOREX_MINOR' | 'METALS' | 'INDICES' | 'CRYPTO';

const MAJOR_FOREX = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'];
const METALS_COMMODITIES = ['XAUUSD', 'XAGUSD', 'WTI', 'BRENT', 'OIL', 'COPPER', 'GOLD', 'SILVER'];
const INDICES = ['US30', 'NAS100', 'SPX500', 'GER40', 'UK100', 'JP225', 'AUS200', 'FRA40', 'HK50', 'DJ30', 'USTEC'];
const CRYPTO = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'LTCUSD', 'DOGEUSD', 'BNBUSD'];

function categorizeSymbol(sym: string): AssetCategory {
  const upper = sym.toUpperCase();
  if (MAJOR_FOREX.some((m) => upper.includes(m))) return 'FOREX_MAJOR';
  if (METALS_COMMODITIES.some((m) => upper.includes(m))) return 'METALS';
  if (INDICES.some((m) => upper.includes(m))) return 'INDICES';
  if (CRYPTO.some((m) => upper.includes(m))) return 'CRYPTO';
  if (upper.length === 6 && (upper.endsWith('USD') || upper.endsWith('EUR') || upper.endsWith('JPY') || upper.endsWith('GBP') || upper.endsWith('CHF') || upper.endsWith('AUD') || upper.endsWith('CAD') || upper.endsWith('NZD'))) {
    return 'FOREX_MINOR';
  }
  return 'ALL';
}

export const AllSymbolsPage: React.FC<AllSymbolsPageProps> = ({ state, onRefresh, onNavigateToTab }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory>('ALL');
  const [filterTradeAllowedOnly, setFilterTradeAllowedOnly] = useState(false);
  const [filterLowSpreadOnly, setFilterLowSpreadOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'symbol' | 'spread' | 'volatility' | 'minLot'>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Spec modal & quick trade modal states
  const [inspectedSymbol, setInspectedSymbol] = useState<DetailedSymbolInfo | null>(null);
  const [quickTradeSymbol, setQuickTradeSymbol] = useState<DetailedSymbolInfo | null>(null);
  const [tradeVolume, setTradeVolume] = useState<number>(0.1);
  const [tradeSlPoints, setTradeSlPoints] = useState<number>(300);
  const [tradeTpPoints, setTradeTpPoints] = useState<number>(600);
  const [executingTrade, setExecutingTrade] = useState(false);
  const [tradeResult, setTradeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [botUpdatingSymbol, setBotUpdatingSymbol] = useState<string | null>(null);
  const [botActionNotice, setBotActionNotice] = useState<string | null>(null);

  const rawSymbols = state?.allSymbols || [];
  const ticks = state?.ticks || [];
  const currentChartSymbol = state?.currentChart?.symbol || 'EURUSD';
  const isEaOnline = state?.connection.isEaConnected ?? false;

  // Compile final symbols list: fallback to ticks if allSymbols is not yet populated
  const allSymbolsList: DetailedSymbolInfo[] = useMemo(() => {
    if (rawSymbols.length > 0) return rawSymbols;
    return ticks.map((t) => ({
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
      isCurrentChart: t.symbol === currentChartSymbol,
    }));
  }, [rawSymbols, ticks, currentChartSymbol]);

  // Filter & sort
  const filteredSymbols = useMemo(() => {
    return allSymbolsList
      .filter((s) => {
        // Search
        const matchesSearch =
          s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()));
        if (!matchesSearch) return false;

        // Category
        if (selectedCategory !== 'ALL') {
          const cat = categorizeSymbol(s.symbol);
          if (cat !== selectedCategory) return false;
        }

        // Trade allowed
        if (filterTradeAllowedOnly && !s.tradeAllowed) return false;

        // Low spread
        if (filterLowSpreadOnly && s.spread > 25) return false;

        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'symbol') {
          diff = a.symbol.localeCompare(b.symbol);
        } else if (sortBy === 'spread') {
          diff = a.spread - b.spread;
        } else if (sortBy === 'minLot') {
          diff = a.minLot - b.minLot;
        } else if (sortBy === 'volatility') {
          const rangeA = (a.sessionHigh || a.high24h || 0) - (a.sessionLow || a.low24h || 0);
          const rangeB = (b.sessionHigh || b.high24h || 0) - (b.sessionLow || b.low24h || 0);
          diff = rangeA - rangeB;
        }
        return sortOrder === 'asc' ? diff : -diff;
      });
  }, [allSymbolsList, searchTerm, selectedCategory, filterTradeAllowedOnly, filterLowSpreadOnly, sortBy, sortOrder]);

  // Statistics
  const totalCount = allSymbolsList.length;
  const allowedCount = allSymbolsList.filter((s) => s.tradeAllowed).length;
  const avgSpread =
    totalCount > 0
      ? Math.round(allSymbolsList.reduce((acc, s) => acc + (s.spread || 0), 0) / totalCount)
      : 0;
  const lowestSpreadSym = useMemo(() => {
    if (allSymbolsList.length === 0) return null;
    return [...allSymbolsList].sort((a, b) => a.spread - b.spread)[0];
  }, [allSymbolsList]);

  // Quick order execution handler
  const handleExecuteQuickTrade = async (direction: 'BUY' | 'SELL') => {
    if (!quickTradeSymbol) return;
    try {
      setExecutingTrade(true);
      setTradeResult(null);

      const price = direction === 'BUY' ? quickTradeSymbol.ask : quickTradeSymbol.bid;
      const point = quickTradeSymbol.point || 0.0001;
      const slPrice =
        tradeSlPoints > 0
          ? direction === 'BUY'
            ? price - tradeSlPoints * point
            : price + tradeSlPoints * point
          : undefined;
      const tpPrice =
        tradeTpPoints > 0
          ? direction === 'BUY'
            ? price + tradeTpPoints * point
            : price - tradeTpPoints * point
          : undefined;

      const res = await api.sendCommand({
        action: 'EXECUTE_TRADE',
        symbol: quickTradeSymbol.symbol,
        orderType: direction,
        volume: Number(tradeVolume),
        price,
        sl: slPrice ? Number(slPrice.toFixed(quickTradeSymbol.digits || 5)) : undefined,
        tp: tpPrice ? Number(tpPrice.toFixed(quickTradeSymbol.digits || 5)) : undefined,
        comment: `ALL_SYMBOLS_UI_${direction}`,
        source: 'MANUAL_UI',
      });

      if (res.success) {
        setTradeResult({
          success: true,
          message: `Dispatched ${direction} ${tradeVolume} lot for ${quickTradeSymbol.symbol}!`,
        });
        setTimeout(() => {
          setQuickTradeSymbol(null);
          setTradeResult(null);
        }, 2500);
      } else {
        setTradeResult({
          success: false,
          message: res.error || 'Failed to dispatch order',
        });
      }
    } catch (err: any) {
      setTradeResult({
        success: false,
        message: err?.message || 'Error communicating with Bridge',
      });
    } finally {
      setExecutingTrade(false);
    }
  };

  // Add symbol to Bot configuration
  const handleToggleBotSymbol = async (symbol: string) => {
    try {
      setBotUpdatingSymbol(symbol);
      const botStatus = await api.getBotStatus().catch(() => null);
      const currentSyms: string[] = botStatus?.config?.symbols || ['EURUSD', 'GBPUSD', 'XAUUSD'];
      let updated: string[];
      if (currentSyms.includes(symbol)) {
        updated = currentSyms.filter((s) => s !== symbol);
        if (updated.length === 0) updated = ['EURUSD']; // enforce at least 1
        setBotActionNotice(`Removed ${symbol} from Auto-Trader Bot target list.`);
      } else {
        updated = [...currentSyms, symbol];
        setBotActionNotice(`Added ${symbol} to Auto-Trader Bot target list!`);
      }
      await api.updateBotConfig({ symbols: updated });
      setTimeout(() => setBotActionNotice(null), 3000);
    } catch (err: any) {
      console.error(err);
      setBotActionNotice(`Could not update bot symbols: ${err?.message || err}`);
      setTimeout(() => setBotActionNotice(null), 4000);
    } finally {
      setBotUpdatingSymbol(null);
    }
  };

  const handleOpenInTerminal = (symbol: string) => {
    if (onNavigateToTab) {
      onNavigateToTab('dashboard', symbol);
    }
  };

  const handleOpenInIntel = (symbol: string) => {
    if (onNavigateToTab) {
      onNavigateToTab('knowledgebase', symbol);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl text-white shadow-md shadow-cyan-500/20">
              <Layers className="h-5 w-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              All MT5 Symbols & Market Watch Directory
            </h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80">
              {totalCount} Symbols Transmitted
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 font-mono">
            Browse complete broker specifications, real-time bid/ask feeds, session volatility ranges, and execute orders directly on any instrument.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => onRefresh && onRefresh()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium transition-all border border-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
            <span>Refresh Symbols</span>
          </button>
          <button
            onClick={() => onNavigateToTab && onNavigateToTab('dashboard')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold transition-all shadow-sm shadow-cyan-600/30"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Live Terminal Chart</span>
          </button>
        </div>
      </div>

      {/* Global Status Notices */}
      {botActionNotice && (
        <div className="p-3 bg-cyan-950/80 border border-cyan-800 text-cyan-300 text-xs font-mono rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-400" />
          <span>{botActionNotice}</span>
        </div>
      )}

      {/* High-level Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>Tracked Instruments</span>
            <Layers className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-white">{totalCount}</div>
          <div className="text-[10px] text-slate-500 font-mono">
            {allowedCount} Trade-Enabled / {totalCount - allowedCount} Read-Only
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>Active Chart Instrument</span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-emerald-400 truncate">
            {currentChartSymbol}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            EA Attached ({state?.currentChart?.timeframe || 'M1'})
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>Average Spread</span>
            <Sliders className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-cyan-300">
            {avgSpread} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Across {totalCount} live market feeds
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>Tightest Spread</span>
            <TrendingUp className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-indigo-300 truncate">
            {lowestSpreadSym ? `${lowestSpreadSym.symbol} (${lowestSpreadSym.spread} pts)` : '—'}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Ideal for HFT & Scalping
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Filter by symbol (e.g. EURUSD, XAUUSD, US30)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs sm:text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Filter Toggles */}
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            <button
              onClick={() => setFilterTradeAllowedOnly((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border transition-all ${
                filterTradeAllowedOnly
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700 font-bold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              Trade Allowed Only
            </button>
            <button
              onClick={() => setFilterLowSpreadOnly((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border transition-all ${
                filterLowSpreadOnly
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-700 font-bold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              Tight Spread (&lt; 25 pts)
            </button>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300">
              <span className="text-slate-500">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-white text-xs font-mono focus:outline-none cursor-pointer"
              >
                <option value="symbol" className="bg-slate-900">Symbol (A-Z)</option>
                <option value="spread" className="bg-slate-900">Spread</option>
                <option value="volatility" className="bg-slate-900">Range Volatility</option>
                <option value="minLot" className="bg-slate-900">Min Lot Size</option>
              </select>
              <button
                onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                className="text-slate-400 hover:text-cyan-400 ml-1"
                title="Toggle sort direction"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        {/* Asset Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-2 border-t border-slate-800/80">
          {[
            { id: 'ALL', label: 'All Instruments' },
            { id: 'FOREX_MAJOR', label: 'Forex Majors' },
            { id: 'FOREX_MINOR', label: 'Crosses & Minors' },
            { id: 'METALS', label: 'Metals & Energies' },
            { id: 'INDICES', label: 'Stock Indices' },
            { id: 'CRYPTO', label: 'Crypto' },
          ].map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as AssetCategory)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-cyan-600 text-white font-bold shadow-sm shadow-cyan-600/30'
                    : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-slate-800'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Symbols Table View */}
      {filteredSymbols.length === 0 ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="inline-flex p-3 bg-slate-800/80 rounded-2xl text-slate-400">
            <Layers className="h-8 w-8 text-cyan-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-mono">
              {allSymbolsList.length === 0 ? 'Awaiting Symbols Transmitted by MT5 EA' : 'No Matching Symbols Found'}
            </h3>
            <p className="text-xs text-slate-400 max-w-lg mx-auto font-mono">
              {allSymbolsList.length === 0
                ? 'Once AIMT5Bridge.mq5 is running in MetaTrader 5, symbols configured in InpSymbolsToTrack or present in your Market Watch window will stream directly to this terminal.'
                : 'Try adjusting your search query, clearing filters, or switching asset categories.'}
            </p>
          </div>
          {allSymbolsList.length === 0 && (
            <div className="pt-2">
              <button
                onClick={() => onNavigateToTab && onNavigateToTab('ea')}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold uppercase tracking-wider"
              >
                View EA Setup Guide
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3.5">Instrument / Asset</th>
                  <th className="py-3 px-3">Live Bid</th>
                  <th className="py-3 px-3">Live Ask</th>
                  <th className="py-3 px-3">Spread (pts)</th>
                  <th className="py-3 px-3">Session 24h Range</th>
                  <th className="py-3 px-3">Min - Max Lot</th>
                  <th className="py-3 px-3">Contract Size</th>
                  <th className="py-3 px-3">Trading</th>
                  <th className="py-3 px-3 text-right">Quick Execution & Specs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredSymbols.map((item) => {
                  const isCurrent = item.symbol === currentChartSymbol;
                  const digits = item.digits ?? (item.symbol.includes('JPY') ? 3 : 5);
                  const high = item.sessionHigh || item.high24h || 0;
                  const low = item.sessionLow || item.low24h || 0;
                  const hasRange = high > 0 && low > 0 && high > low;
                  const rangePct = hasRange
                    ? Math.min(100, Math.max(0, ((item.bid - low) / (high - low)) * 100))
                    : 50;

                  return (
                    <tr
                      key={item.symbol}
                      className={`hover:bg-slate-800/50 transition-colors ${
                        isCurrent ? 'bg-cyan-950/25' : ''
                      }`}
                    >
                      {/* Symbol & Description */}
                      <td className="py-3 px-3.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white text-xs tracking-wide">
                              {item.symbol}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                                Active Chart
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Live Bid */}
                      <td className="py-3 px-3 font-semibold text-emerald-400">
                        {item.bid > 0 ? item.bid.toFixed(digits) : '—'}
                      </td>

                      {/* Live Ask */}
                      <td className="py-3 px-3 font-semibold text-slate-200">
                        {item.ask > 0 ? item.ask.toFixed(digits) : '—'}
                      </td>

                      {/* Spread */}
                      <td className="py-3 px-3">
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                            item.spread <= 15
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                              : item.spread <= 30
                              ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-800/60'
                              : 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                          }`}
                        >
                          {item.spread} pts
                        </span>
                      </td>

                      {/* Session Range Bar */}
                      <td className="py-3 px-3 text-slate-300">
                        {hasRange ? (
                          <div className="w-32 space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                              <span className="text-rose-400">{low.toFixed(digits)}</span>
                              <span className="text-emerald-400">{high.toFixed(digits)}</span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                              <div
                                className="bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 h-full"
                                style={{ width: `${rangePct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Min - Max Lot */}
                      <td className="py-3 px-3 text-slate-300">
                        {item.minLot} - {item.maxLot}
                        <span className="text-[10px] text-slate-500 ml-1">
                          (step {item.lotStep})
                        </span>
                      </td>

                      {/* Contract Size */}
                      <td className="py-3 px-3 text-slate-300">
                        {item.contractSize ? item.contractSize.toLocaleString() : '100,000'}
                      </td>

                      {/* Trading Status */}
                      <td className="py-3 px-3">
                        {item.tradeAllowed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/70 border border-emerald-800/70 px-2 py-0.5 rounded-full font-bold">
                            <Check className="h-2.5 w-2.5" />
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-950/70 border border-rose-800/70 px-2 py-0.5 rounded-full font-bold">
                            Disabled
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Quick Order Modal Button */}
                          <button
                            onClick={() => {
                              setQuickTradeSymbol(item);
                              setTradeVolume(item.minLot || 0.1);
                            }}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition-all shadow-sm"
                            title="Place direct Buy / Sell order"
                          >
                            Trade
                          </button>

                          {/* Open in Live Terminal */}
                          <button
                            onClick={() => handleOpenInTerminal(item.symbol)}
                            className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-bold transition-all inline-flex items-center gap-1 shadow-sm"
                            title="Load on Live Terminal Chart"
                          >
                            <Zap className="h-3 w-3" />
                            <span>Chart</span>
                          </button>

                          {/* Add to Bot Toggle */}
                          <button
                            onClick={() => handleToggleBotSymbol(item.symbol)}
                            disabled={botUpdatingSymbol === item.symbol}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                            title="Toggle in Auto-Trader Bot target list"
                          >
                            <Bot className={`h-3.5 w-3.5 ${botUpdatingSymbol === item.symbol ? 'animate-spin text-cyan-400' : ''}`} />
                          </button>

                          {/* Inspect Specification */}
                          <button
                            onClick={() => setInspectedSymbol(item)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                            title="View full broker specification details"
                          >
                            <Info className="h-3.5 w-3.5 text-slate-400" />
                          </button>

                          {/* AI Intelligence */}
                          <button
                            onClick={() => handleOpenInIntel(item.symbol)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 rounded transition-colors"
                            title="Open in AI Symbol Intelligence & Microstructure"
                          >
                            <Compass className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Trade Modal */}
      {quickTradeSymbol && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-emerald-400" />
                <div>
                  <h3 className="text-base font-bold text-white font-mono">
                    Instant Order: {quickTradeSymbol.symbol}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Direct execution via MetaTrader 5 Bridge Tunnel
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQuickTradeSymbol(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Price Cards */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 uppercase">Live Bid (Sell)</span>
                <div className="text-lg font-bold text-rose-400">
                  {quickTradeSymbol.bid > 0
                    ? quickTradeSymbol.bid.toFixed(quickTradeSymbol.digits || 5)
                    : '—'}
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 uppercase">Live Ask (Buy)</span>
                <div className="text-lg font-bold text-emerald-400">
                  {quickTradeSymbol.ask > 0
                    ? quickTradeSymbol.ask.toFixed(quickTradeSymbol.digits || 5)
                    : '—'}
                </div>
              </div>
            </div>

            {/* Volume & Risk Config */}
            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">
                  Lot Size (Min: {quickTradeSymbol.minLot}, Max: {quickTradeSymbol.maxLot}, Step: {quickTradeSymbol.lotStep})
                </label>
                <input
                  type="number"
                  step={quickTradeSymbol.lotStep || 0.01}
                  min={quickTradeSymbol.minLot || 0.01}
                  max={quickTradeSymbol.maxLot || 100}
                  value={tradeVolume}
                  onChange={(e) => setTradeVolume(parseFloat(e.target.value) || 0.01)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Stop Loss (Points)</label>
                  <input
                    type="number"
                    step="50"
                    value={tradeSlPoints}
                    onChange={(e) => setTradeSlPoints(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Take Profit (Points)</label>
                  <input
                    type="number"
                    step="50"
                    value={tradeTpPoints}
                    onChange={(e) => setTradeTpPoints(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* Result notice */}
            {tradeResult && (
              <div
                className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 ${
                  tradeResult.success
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {tradeResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                )}
                <span>{tradeResult.message}</span>
              </div>
            )}

            {/* Execution Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleExecuteQuickTrade('SELL')}
                disabled={executingTrade || !quickTradeSymbol.tradeAllowed}
                className="py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-mono font-bold text-sm tracking-wider shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center gap-1.5"
              >
                <ArrowDownRight className="h-4 w-4" />
                <span>SELL MARKET</span>
              </button>
              <button
                onClick={() => handleExecuteQuickTrade('BUY')}
                disabled={executingTrade || !quickTradeSymbol.tradeAllowed}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono font-bold text-sm tracking-wider shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5"
              >
                <ArrowUpRight className="h-4 w-4" />
                <span>BUY MARKET</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Symbol Specification Modal */}
      {inspectedSymbol && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-600/20 text-cyan-400 rounded-xl">
                  <Info className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-mono">
                    Broker Specification: {inspectedSymbol.symbol}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {inspectedSymbol.description || 'Live MetaTrader 5 Symbol Properties'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectedSymbol(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Contract Size</span>
                <span className="text-white font-bold">{inspectedSymbol.contractSize?.toLocaleString() || '100,000'}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Digits / Point</span>
                <span className="text-white font-bold">{inspectedSymbol.digits} digits ({inspectedSymbol.point})</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Spread</span>
                <span className="text-cyan-300 font-bold">{inspectedSymbol.spread} pts</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Min Lot Size</span>
                <span className="text-white font-bold">{inspectedSymbol.minLot}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Max Lot Size</span>
                <span className="text-white font-bold">{inspectedSymbol.maxLot}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Lot Step</span>
                <span className="text-white font-bold">{inspectedSymbol.lotStep}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Stops Level</span>
                <span className="text-amber-300 font-bold">{inspectedSymbol.stopsLevel ?? 0} pts</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Freeze Level</span>
                <span className="text-amber-300 font-bold">{inspectedSymbol.freezeLevel ?? 0} pts</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Trading Permission</span>
                <span className={inspectedSymbol.tradeAllowed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {inspectedSymbol.tradeAllowed ? 'Full Trading Enabled' : 'Trading Disabled'}
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Base Currency</span>
                <span className="text-white font-bold">{inspectedSymbol.currencyBase || '—'}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Profit Currency</span>
                <span className="text-white font-bold">{inspectedSymbol.currencyProfit || '—'}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Session High / Low</span>
                <span className="text-slate-300 font-bold">
                  {inspectedSymbol.sessionHigh && inspectedSymbol.sessionLow
                    ? `${inspectedSymbol.sessionLow.toFixed(inspectedSymbol.digits || 4)} - ${inspectedSymbol.sessionHigh.toFixed(inspectedSymbol.digits || 4)}`
                    : '—'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setInspectedSymbol(null);
                  handleOpenInIntel(inspectedSymbol.symbol);
                }}
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline font-mono"
              >
                <Compass className="h-4 w-4" />
                <span>Open Microstructure & Regime Analysis →</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const sym = inspectedSymbol;
                    setInspectedSymbol(null);
                    setQuickTradeSymbol(sym);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-mono font-bold"
                >
                  Place Trade
                </button>
                <button
                  onClick={() => {
                    const sym = inspectedSymbol.symbol;
                    setInspectedSymbol(null);
                    handleOpenInTerminal(sym);
                  }}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-mono font-bold"
                >
                  Load in Terminal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
