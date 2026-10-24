import React, { useState, useEffect, useMemo } from 'react';
import {
  FlaskConical,
  Play,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Sliders,
  DollarSign,
  Clock,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  BarChart2,
  Download,
  Bot,
  Zap,
  ChevronDown,
  FileText,
  Percent,
  Check,
} from 'lucide-react';
import { AppState, DetailedSymbolInfo } from '../types';
import { api } from '../services/api';

interface BacktestPageProps {
  state: AppState | null;
  onNavigateToTab?: (tab: string, symbol?: string) => void;
}

type StrategyType =
  | 'RSI_REVERSAL'
  | 'EMA_CROSSOVER'
  | 'MACD_MOMENTUM'
  | 'BOLLINGER_BREAKOUT'
  | 'ORDER_BLOCK_CONFLUENCE'
  | 'BREAKOUT_MOMENTUM';

const STRATEGY_DEFINITIONS: { id: StrategyType; name: string; description: string; defaultParams: Record<string, any> }[] = [
  {
    id: 'RSI_REVERSAL',
    name: 'RSI Mean-Reversion',
    description: 'Catches oversold bounces and overbought exhaustions with ATR-calibrated stop loss.',
    defaultParams: { rsiPeriod: 14, oversold: 30, overbought: 70, slAtrMultiplier: 1.5, tpAtrMultiplier: 2.5 },
  },
  {
    id: 'EMA_CROSSOVER',
    name: 'Dual EMA Trend Following',
    description: 'Enters in the direction of the fast/slow EMA cross confirmed by baseline trend filter.',
    defaultParams: { fastEma: 9, slowEma: 21, baselineEma: 200, slAtrMultiplier: 1.8, tpAtrMultiplier: 3.0 },
  },
  {
    id: 'MACD_MOMENTUM',
    name: 'MACD Zero-Line Momentum',
    description: 'Identifies aggressive momentum shifts as the MACD histogram crosses the zero line.',
    defaultParams: { macdFast: 12, macdSlow: 26, macdSignal: 9, slAtrMultiplier: 1.5, tpAtrMultiplier: 2.8 },
  },
  {
    id: 'BOLLINGER_BREAKOUT',
    name: 'Bollinger Band Squeeze Breakout',
    description: 'Enters volatility expansions when price breaches the outer Bollinger bands from a tight squeeze.',
    defaultParams: { bbPeriod: 20, bbStdDev: 2, slAtrMultiplier: 1.5, tpAtrMultiplier: 2.5 },
  },
  {
    id: 'ORDER_BLOCK_CONFLUENCE',
    name: 'Order Block & FVG Confluence',
    description: 'Smart Money Concept tracking Fair Value Gap imbalances and institutional order block reactions.',
    defaultParams: { baselineEma: 200, slAtrMultiplier: 1.2, tpAtrMultiplier: 3.2 },
  },
  {
    id: 'BREAKOUT_MOMENTUM',
    name: 'Donchian Channel Breakout',
    description: 'Enters aggressive multi-bar highs/lows with trend-continuation trailing logic.',
    defaultParams: { lookback: 20, slAtrMultiplier: 2.0, tpAtrMultiplier: 4.0 },
  },
];

export const BacktestPage: React.FC<BacktestPageProps> = ({ state, onNavigateToTab }) => {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>('RSI_REVERSAL');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EURUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('M1');
  const [candleCount, setCandleCount] = useState<number>(300);
  const [initialBalance, setInitialBalance] = useState<number>(10000);
  const [riskMode, setRiskMode] = useState<'FIXED_LOT' | 'RISK_PERCENT'>('FIXED_LOT');
  const [fixedLotSize, setFixedLotSize] = useState<number>(0.1);
  const [riskPercent, setRiskPercent] = useState<number>(1.5);
  const [spreadPoints, setSpreadPoints] = useState<number>(15);
  const [slippagePoints, setSlippagePoints] = useState<number>(2);

  // Strategy parameters
  const [strategyParams, setStrategyParams] = useState<Record<string, any>>({
    rsiPeriod: 14,
    oversold: 30,
    overbought: 70,
    fastEma: 9,
    slowEma: 21,
    baselineEma: 200,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    bbPeriod: 20,
    bbStdDev: 2,
    slAtrMultiplier: 1.5,
    tpAtrMultiplier: 2.5,
  });

  // Backtest status & result
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'WINS' | 'LOSSES'>('ALL');
  const [botApplyNotice, setBotApplyNotice] = useState<string | null>(null);

  // Available symbols from MT5 EA
  const availableSymbols = useMemo(() => {
    const list = state?.allSymbols?.map((s) => s.symbol) || [];
    const ticks = state?.ticks?.map((t) => t.symbol) || [];
    const combined = Array.from(new Set([...list, ...ticks, 'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'US30', 'BTCUSD']));
    return combined;
  }, [state]);

  // Sync default spread when symbol changes
  useEffect(() => {
    const symObj = state?.allSymbols?.find((s) => s.symbol === selectedSymbol);
    if (symObj && symObj.spread > 0) {
      setSpreadPoints(symObj.spread);
    }
  }, [selectedSymbol, state]);

  // Change strategy default parameters
  const handleStrategyChange = (st: StrategyType) => {
    setSelectedStrategy(st);
    const def = STRATEGY_DEFINITIONS.find((d) => d.id === st);
    if (def) {
      setStrategyParams((prev) => ({ ...prev, ...def.defaultParams }));
    }
  };

  // Run isolated backtest
  const handleRunBacktest = async () => {
    try {
      setRunning(true);
      setErrorMessage(null);

      const res = await api.runIsolatedBacktest({
        strategyId: `strat-${selectedStrategy.toLowerCase()}`,
        strategyName: STRATEGY_DEFINITIONS.find((s) => s.id === selectedStrategy)?.name,
        strategyType: selectedStrategy,
        symbol: selectedSymbol,
        timeframe: selectedTimeframe,
        candleCount,
        parameters: strategyParams,
        initialBalance,
        riskMode,
        fixedLotSize,
        riskPercent,
        spreadPoints,
        slippagePoints,
      });

      if (res.success && res.result) {
        setResult(res.result);
      } else {
        setErrorMessage(res.error || 'Backtest failed to execute. Ensure historical candles exist for this symbol.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error executing backtest simulation');
    } finally {
      setRunning(false);
    }
  };

  // Apply winning parameters to live Bot
  const handleApplyToBot = async () => {
    try {
      await api.updateBotConfig({
        symbols: [selectedSymbol],
        timeframe: selectedTimeframe,
        riskPercent: riskMode === 'RISK_PERCENT' ? riskPercent : 1.0,
      });
      setBotApplyNotice(`Successfully synced ${selectedSymbol} [${selectedTimeframe}] to Auto-Trader Bot!`);
      setTimeout(() => setBotApplyNotice(null), 3500);
    } catch (err: any) {
      setBotApplyNotice(`Failed to apply to bot: ${err?.message || err}`);
      setTimeout(() => setBotApplyNotice(null), 4000);
    }
  };

  // Filtered trades
  const displayedTrades = useMemo(() => {
    if (!result?.trades) return [];
    if (tradeFilter === 'WINS') return result.trades.filter((t: any) => t.profitUSD > 0);
    if (tradeFilter === 'LOSSES') return result.trades.filter((t: any) => t.profitUSD < 0);
    return result.trades;
  }, [result, tradeFilter]);

  // Render SVG Equity Curve
  const equityPoints: any[] = result?.equityCurve || [];
  const svgPath = useMemo(() => {
    if (!equityPoints || equityPoints.length < 2) return '';
    const minEq = Math.min(...equityPoints.map((p) => p.equity));
    const maxEq = Math.max(...equityPoints.map((p) => p.equity));
    const range = maxEq - minEq > 0 ? maxEq - minEq : 100;
    const width = 800;
    const height = 240;
    const padding = 20;

    return equityPoints
      .map((p, idx) => {
        const x = padding + (idx / (equityPoints.length - 1)) * (width - padding * 2);
        const y = height - padding - ((p.equity - minEq) / range) * (height - padding * 2);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [equityPoints]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-indigo-600 rounded-xl text-white shadow-md shadow-cyan-500/20">
              <FlaskConical className="h-5 w-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Algorithmic Backtest Laboratory
            </h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80">
              Isolated Sandbox
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 font-mono">
            Execute strategy backtests on authentic MetaTrader 5 historical bars. Isolated execution environment will not interfere with active trading, open positions, or risk guards.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleRunBacktest}
            disabled={running}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-600/30 transition-all cursor-pointer"
          >
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
            <span>{running ? 'Running Simulation...' : 'Run Backtest'}</span>
          </button>
        </div>
      </div>

      {botApplyNotice && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-mono rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{botApplyNotice}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-mono rounded-xl flex items-center gap-2 animate-fadeIn">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Left Controls + Right Simulation Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration Pad (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Strategy Selection */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-white font-bold">
              <span className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-cyan-400" />
                Strategy Architecture
              </span>
            </div>

            <div className="space-y-2">
              {STRATEGY_DEFINITIONS.map((strat) => {
                const isSelected = selectedStrategy === strat.id;
                return (
                  <button
                    key={strat.id}
                    onClick={() => handleStrategyChange(strat.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>{strat.name}</span>
                      {isSelected && <span className="h-2 w-2 rounded-full bg-cyan-400" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {strat.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Asset & Execution Parameters */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-white font-bold">
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-cyan-400" />
                Market Environment
              </span>
            </div>

            {/* Symbol & Timeframe */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Symbol</label>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-cyan-500 focus:outline-none"
                >
                  {availableSymbols.map((sym) => (
                    <option key={sym} value={sym}>
                      {sym}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Timeframe</label>
                <select
                  value={selectedTimeframe}
                  onChange={(e) => setSelectedTimeframe(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-cyan-500 focus:outline-none"
                >
                  {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* History Candles & Initial Balance */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Candles Tested</label>
                <input
                  type="number"
                  step="50"
                  min="50"
                  max="2000"
                  value={candleCount}
                  onChange={(e) => setCandleCount(parseInt(e.target.value) || 300)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Deposit ($)</label>
                <input
                  type="number"
                  step="1000"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(parseFloat(e.target.value) || 10000)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Risk Sizing Mode */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-slate-400 text-[11px]">
                <span>Risk Sizing Mode</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setRiskMode('FIXED_LOT')}
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      riskMode === 'FIXED_LOT' ? 'bg-cyan-600 text-white font-bold' : 'bg-slate-950 text-slate-500'
                    }`}
                  >
                    Fixed Lot
                  </button>
                  <button
                    onClick={() => setRiskMode('RISK_PERCENT')}
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      riskMode === 'RISK_PERCENT' ? 'bg-cyan-600 text-white font-bold' : 'bg-slate-950 text-slate-500'
                    }`}
                  >
                    Risk % Equity
                  </button>
                </div>
              </div>

              {riskMode === 'FIXED_LOT' ? (
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Volume (Lots)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="50"
                    value={fixedLotSize}
                    onChange={(e) => setFixedLotSize(parseFloat(e.target.value) || 0.1)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Risk Per Trade (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 1.0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Spread & Slippage */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Spread (Points)</label>
                <input
                  type="number"
                  step="1"
                  value={spreadPoints}
                  onChange={(e) => setSpreadPoints(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Slippage (Points)</label>
                <input
                  type="number"
                  step="1"
                  value={slippagePoints}
                  onChange={(e) => setSlippagePoints(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Dynamic Tuning Sliders */}
            <div className="pt-2 border-t border-slate-800 space-y-3">
              <div className="text-slate-400 font-bold text-[11px]">Risk-Reward Tuning</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 block text-[10px]">SL ATR Mult: {strategyParams.slAtrMultiplier || 1.5}x</label>
                  <input
                    type="range"
                    min="0.5"
                    max="4.0"
                    step="0.1"
                    value={strategyParams.slAtrMultiplier || 1.5}
                    onChange={(e) => setStrategyParams((p) => ({ ...p, slAtrMultiplier: parseFloat(e.target.value) }))}
                    className="w-full accent-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block text-[10px]">TP ATR Mult: {strategyParams.tpAtrMultiplier || 2.5}x</label>
                  <input
                    type="range"
                    min="1.0"
                    max="6.0"
                    step="0.1"
                    value={strategyParams.tpAtrMultiplier || 2.5}
                    onChange={(e) => setStrategyParams((p) => ({ ...p, tpAtrMultiplier: parseFloat(e.target.value) }))}
                    className="w-full accent-cyan-500"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleRunBacktest}
              disabled={running}
              className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/30"
            >
              {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span>{running ? 'Simulating...' : 'Execute Backtest'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Visual Equity Curve + Analytics Dashboard (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {!result ? (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <div className="inline-flex p-3 bg-slate-800/80 rounded-2xl text-slate-400">
                <BarChart2 className="h-8 w-8 text-cyan-400" />
              </div>
              <h3 className="text-base font-bold text-white font-mono">No Backtest Executed Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto font-mono">
                Select your strategy, symbol, timeframe, and risk parameters on the left, then click <strong>"Execute Backtest"</strong> to inspect simulated historical performance and trade analytics.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleRunBacktest}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold rounded-lg"
                >
                  Run Baseline Backtest
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* High-level KPI Scorecard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono uppercase">Net Profit / ROI</span>
                  <div className={`text-xl font-bold font-mono ${result.netProfitUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {result.netProfitUSD >= 0 ? `+$${result.netProfitUSD.toLocaleString()}` : `-$${Math.abs(result.netProfitUSD).toLocaleString()}`}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {result.returnPercent >= 0 ? `+${result.returnPercent}%` : `${result.returnPercent}%`} return
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono uppercase">Profit Factor</span>
                  <div className="text-xl font-bold font-mono text-cyan-300">
                    {result.profitFactor > 0 ? result.profitFactor.toFixed(2) : '0.00'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {result.profitFactor >= 1.5 ? 'Profitable Edge' : result.profitFactor >= 1.0 ? 'Marginal' : 'Negative Edge'}
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono uppercase">Win Rate</span>
                  <div className="text-xl font-bold font-mono text-white">
                    {result.winRate.toFixed(1)}%
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {result.winningTrades}W / {result.losingTrades}L ({result.totalTrades} total)
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono uppercase">Max Drawdown</span>
                  <div className="text-xl font-bold font-mono text-rose-400">
                    {result.maxDrawdownPercent.toFixed(1)}%
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    -${result.maxDrawdownUSD.toLocaleString()} USD
                  </div>
                </div>
              </div>

              {/* Secondary Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">Sharpe Ratio</span>
                  <span className="text-slate-200 font-bold">{result.sharpeRatio || '0.00'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Avg Win / Avg Loss</span>
                  <span className="text-slate-200 font-bold">
                    ${result.avgWinUSD} / ${result.avgLossUSD}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Win / Loss Streak</span>
                  <span className="text-slate-200 font-bold">
                    {result.maxConsecutiveWins} wins / {result.maxConsecutiveLosses} losses
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Expectancy / Trade</span>
                  <span className="text-slate-200 font-bold">
                    ${result.expectancyUSD}
                  </span>
                </div>
              </div>

              {/* Equity Curve Visualizer */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-400" />
                    <span className="font-bold text-white">Simulated Equity Curve Progression</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span>Start: ${result.initialBalance.toLocaleString()}</span>
                    <span>→</span>
                    <span className="text-emerald-400 font-bold">Final: ${result.finalEquity.toLocaleString()}</span>
                  </div>
                </div>

                <div className="relative h-60 w-full overflow-hidden flex items-center justify-center bg-slate-950/60 rounded-lg p-2 border border-slate-900">
                  {svgPath ? (
                    <svg className="w-full h-full" viewBox="0 0 800 240" preserveAspectRatio="none">
                      {/* Grid lines */}
                      <line x1="0" y1="60" x2="800" y2="60" stroke="#1e293b" strokeDasharray="4 4" />
                      <line x1="0" y1="120" x2="800" y2="120" stroke="#1e293b" strokeDasharray="4 4" />
                      <line x1="0" y1="180" x2="800" y2="180" stroke="#1e293b" strokeDasharray="4 4" />

                      {/* Main equity path */}
                      <path
                        d={svgPath}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span className="text-slate-500 text-xs font-mono">Insufficient data points</span>
                  )}
                </div>
              </div>

              {/* Bot Sync & Action Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-gradient-to-r from-slate-900 to-cyan-950/40 border border-cyan-900/50 rounded-xl">
                <div className="space-y-0.5">
                  <div className="font-bold text-white text-xs font-mono flex items-center gap-1.5">
                    <Bot className="h-4 w-4 text-cyan-400" />
                    Deploy to Auto-Trader Physical Bot
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Apply {selectedSymbol} [{selectedTimeframe}] parameters to the live automated execution engine.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleApplyToBot}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-sm"
                  >
                    Sync With Bot
                  </button>
                  <button
                    onClick={() => onNavigateToTab && onNavigateToTab('dashboard', selectedSymbol)}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs transition-all border border-slate-700"
                  >
                    View in Chart
                  </button>
                </div>
              </div>

              {/* Detailed Trade History Log */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden space-y-3 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-cyan-400" />
                    <span className="font-bold text-white">Simulated Trades Log ({displayedTrades.length})</span>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                    <button
                      onClick={() => setTradeFilter('ALL')}
                      className={`px-2 py-1 rounded ${tradeFilter === 'ALL' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}
                    >
                      All ({result.trades.length})
                    </button>
                    <button
                      onClick={() => setTradeFilter('WINS')}
                      className={`px-2 py-1 rounded ${tradeFilter === 'WINS' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
                    >
                      Wins ({result.winningTrades})
                    </button>
                    <button
                      onClick={() => setTradeFilter('LOSSES')}
                      className={`px-2 py-1 rounded ${tradeFilter === 'LOSSES' ? 'bg-rose-600 text-white' : 'text-slate-400'}`}
                    >
                      Losses ({result.losingTrades})
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Entry Price</th>
                        <th className="py-2 px-3">Exit Price</th>
                        <th className="py-2 px-3">Volume</th>
                        <th className="py-2 px-3">Return</th>
                        <th className="py-2 px-3">Profit USD</th>
                        <th className="py-2 px-3">Exit Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {displayedTrades.map((trade: any, idx: number) => {
                        const isWin = trade.profitUSD >= 0;
                        return (
                          <tr key={trade.id || idx} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 text-slate-500">{trade.ticket}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  trade.type === 'BUY'
                                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/70'
                                    : 'bg-rose-950/70 text-rose-300 border border-rose-800/70'
                                }`}
                              >
                                {trade.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-200">{trade.openPrice}</td>
                            <td className="py-2 px-3 text-slate-200">{trade.closePrice}</td>
                            <td className="py-2 px-3 text-slate-400">{trade.volume}</td>
                            <td className={`py-2 px-3 font-semibold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {trade.returnPercent >= 0 ? `+${trade.returnPercent}%` : `${trade.returnPercent}%`}
                            </td>
                            <td className={`py-2 px-3 font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {trade.profitUSD >= 0 ? `+$${trade.profitUSD.toFixed(2)}` : `-$${Math.abs(trade.profitUSD).toFixed(2)}`}
                            </td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                {trade.exitReason}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
