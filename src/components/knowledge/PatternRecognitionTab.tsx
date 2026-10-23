import React, { useState, useEffect } from 'react';
import {
  Compass,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Sparkles,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Maximize2,
  Eye,
  BarChart2,
} from 'lucide-react';
import { api } from '../../services/api';

interface PatternRecognitionTabProps {
  initialSymbol?: string;
  onApplyStrategyRule?: (ruleData: any) => void;
}

export const PatternRecognitionTab: React.FC<PatternRecognitionTabProps> = ({
  initialSymbol = 'EURUSD',
  onApplyStrategyRule,
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState('M1');
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [patternData, setPatternData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [timeframes] = useState(['M1', 'M5', 'M15', 'M30', 'H1', 'D1']);
  const [symbols, setSymbols] = useState<string[]>(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US30']);
  const [customInput, setCustomInput] = useState('');

  useEffect(() => {
    api.getState().then((s) => {
      if (s?.currentChart?.symbol) {
        setSymbol(s.currentChart.symbol);
      }
      if (s?.allSymbols && s.allSymbols.length > 0) {
        const live = s.allSymbols.map((item) => item.symbol);
        const unique = Array.from(new Set([...(s.currentChart ? [s.currentChart.symbol] : []), ...live]));
        if (unique.length > 0) setSymbols(unique.slice(0, 10));
      }
    }).catch(() => {});
  }, []);

  const fetchPatterns = async (sym: string, tf: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getKnowledgePatterns(sym, tf);
      if (res.success && res.patterns) {
        setPatternData(res.patterns);
      } else {
        setPatternData({
          symbol: sym,
          timeframe: tf,
          totalPatternsFound: 0,
          overallPatternBias: 'NEUTRAL',
          candlestick: [],
          indicator: [],
          shape: [],
          detectedAt: Date.now(),
        });
      }
    } catch (err: any) {
      console.warn('Pattern scan notice:', err);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatterns(symbol, timeframe);
  }, [symbol, timeframe]);

  const handleSimulateCandles = async () => {
    try {
      setSimulating(true);
      const basePrice = symbol.includes('JPY') ? 154.5 : symbol.includes('XAU') ? 2650.0 : symbol.includes('BTC') ? 68000 : 1.085;
      const res = await fetch('/api/candles/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe, count: 80, basePrice }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Simulated 80 market bars for ${symbol} [${timeframe}]! Scanning fresh patterns...`);
        await fetchPatterns(symbol, timeframe);
        setTimeout(() => setNotice(null), 3500);
      }
    } catch (err: any) {
      setError(`Simulation failed: ${err.message}`);
    } finally {
      setSimulating(false);
    }
  };

  const getBiasColor = (bias: string) => {
    switch (bias) {
      case 'BULLISH':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
      case 'BEARISH':
        return 'text-rose-400 bg-rose-950/60 border-rose-800';
      default:
        return 'text-amber-400 bg-amber-950/60 border-amber-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Selector & Controls */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
            <span>Symbol:</span>
            {symbols.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${
                  symbol === s
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 border-l border-slate-800 pl-3">
            <span>TF:</span>
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 rounded text-xs font-mono ${
                  timeframe === tf
                    ? 'bg-slate-700 text-white font-bold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (customInput.trim()) {
                const s = customInput.trim();
                setSymbol(s);
                if (!symbols.includes(s)) setSymbols([s, ...symbols]);
                setCustomInput('');
              }
            }}
            className="flex items-center gap-1 pl-2 border-l border-slate-800"
          >
            <input
              type="text"
              placeholder="Custom sym..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none w-28"
            />
            <button
              type="submit"
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-mono"
            >
              Go
            </button>
          </form>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulateCandles}
            disabled={simulating}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors flex items-center gap-1.5"
            title="Seed synthetic candles and recalculate patterns"
          >
            <Sparkles className={`h-3.5 w-3.5 text-cyan-400 ${simulating ? 'animate-spin' : ''}`} />
            <span>{simulating ? 'Seeding Bars...' : 'Seed Test Bars'}</span>
          </button>

          <button
            onClick={() => fetchPatterns(symbol, timeframe)}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Rescan patterns"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !patternData && (
        <div className="p-12 text-center text-slate-400 font-mono text-sm border border-dashed border-slate-800 rounded-xl">
          <RefreshCw className="h-6 w-6 animate-spin text-cyan-400 mx-auto mb-2" />
          Analyzing candlestick geometry, indicator divergence & chart shapes...
        </div>
      )}

      {patternData && (
        <div className="space-y-6">
          {/* Bias Summary Banner */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                  Overall Composite Directional Bias
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`px-3 py-1 rounded-lg text-sm font-bold font-mono border ${getBiasColor(patternData.overallPatternBias)}`}>
                    {patternData.overallPatternBias} PATTERN BIAS
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {patternData.totalPatternsFound} Patterns Identified for {patternData.symbol} [{patternData.timeframe}]
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="text-center p-2 rounded-lg bg-slate-950/60 border border-slate-800 min-w-20">
                  <div className="text-[10px] text-slate-500">Candlestick</div>
                  <div className="text-sm font-bold text-white mt-0.5">{patternData.candlestick?.length || 0}</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-slate-950/60 border border-slate-800 min-w-20">
                  <div className="text-[10px] text-slate-500">Indicator</div>
                  <div className="text-sm font-bold text-cyan-300 mt-0.5">{patternData.indicator?.length || 0}</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-slate-950/60 border border-slate-800 min-w-20">
                  <div className="text-[10px] text-slate-500">Chart Shapes</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">{patternData.shape?.length || 0}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Three Grid Columns: Candlestick, Indicator, and Shape Patterns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono">
            {/* 1. Candlestick Formations */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-cyan-400" />
                  <h3 className="font-bold text-sm text-white">Candlestick Geometry</h3>
                </div>
                <span className="text-xs text-slate-500">
                  {patternData.candlestick?.length || 0} found
                </span>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {patternData.candlestick?.length === 0 ? (
                  <p className="text-xs text-slate-500 p-4 text-center border border-dashed border-slate-800 rounded-lg">
                    No discrete candlestick patterns detected on current bars.
                  </p>
                ) : (
                  patternData.candlestick.map((p: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs text-white">{p.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getBiasColor(p.bias)}`}>
                          {p.bias} ({p.confidence}%)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                        {p.description}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                        <span>Reliability: {p.reliability || 'High'}</span>
                        <span>Bar offset: #{p.barIndex || 0}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. Indicator Patterns */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <h3 className="font-bold text-sm text-white">Indicator Oscillations</h3>
                </div>
                <span className="text-xs text-slate-500">
                  {patternData.indicator?.length || 0} found
                </span>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {patternData.indicator?.length === 0 ? (
                  <p className="text-xs text-slate-500 p-4 text-center border border-dashed border-slate-800 rounded-lg">
                    No indicator divergences or signal crosses found.
                  </p>
                ) : (
                  patternData.indicator.map((p: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs text-white">{p.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getBiasColor(p.bias)}`}>
                          {p.bias} ({p.confidence}%)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                        {p.description}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                        <span>Oscillator: {p.type || 'RSI/MACD'}</span>
                        <span>Weight: {p.confidence} pts</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 3. Chart Shapes & Formations */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Maximize2 className="h-4 w-4 text-amber-400" />
                  <h3 className="font-bold text-sm text-white">Chart Shapes & Channels</h3>
                </div>
                <span className="text-xs text-slate-500">
                  {patternData.shape?.length || 0} found
                </span>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {patternData.shape?.length === 0 ? (
                  <p className="text-xs text-slate-500 p-4 text-center border border-dashed border-slate-800 rounded-lg">
                    No multi-candle geometric shapes or neckline breaks.
                  </p>
                ) : (
                  patternData.shape.map((p: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs text-white">{p.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getBiasColor(p.bias)}`}>
                          {p.bias} ({p.confidence}%)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                        {p.description}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                        <span>Target: {p.breakoutTarget ? p.breakoutTarget.toFixed(5) : 'Projection'}</span>
                        <span>Neckline: {p.neckline ? p.neckline.toFixed(5) : 'Dynamic'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
