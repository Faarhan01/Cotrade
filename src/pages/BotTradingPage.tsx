import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Square,
  Bot,
  Brain,
  Zap,
  TrendingUp,
  TrendingDown,
  Shield,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Settings2,
  Activity,
  DollarSign,
  Percent,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { api } from '../services/api';
import { AppState } from '../types';

interface BotTradingPageProps {
  state: AppState | null;
  onRefresh?: () => void;
}

export const BotTradingPage: React.FC<BotTradingPageProps> = ({ state, onRefresh }) => {
  const [botStatus, setBotStatus] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [manualExecLoading, setManualExecLoading] = useState<string | null>(null);

  // Bot Config Form State
  const [config, setConfig] = useState({
    enabled: false,
    symbols: ['EURUSD', 'GBPUSD', 'XAUUSD'],
    timeframe: 'M1',
    higherTimeframes: ['M5', 'H1'],
    multiTimeframeConsensus: true,
    minConfidence: 70,
    riskPercent: 1.0,
    maxOpenPositions: 3,
    maxTradesPerSymbol: 1,
    cooldownMinutes: 5,
    autoStopLoss: true,
    autoTakeProfit: true,
    trailingStop: true,
    newsRiskFilter: true,
    shockProtectionFilter: true,
  });

  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [shocksData, setShocksData] = useState<any>(null);
  const [mtfData, setMtfData] = useState<any>(null);

  const fetchBotData = useCallback(async () => {
    try {
      setLoading(true);
      const activeSym = config.symbols[0] || 'EURUSD';
      const [statusRes, signalsRes, tradesRes, shocksRes, mtfRes] = await Promise.all([
        api.getBotStatus().catch(() => null),
        api.getBotSignals(30).catch(() => ({ signals: [] })),
        api.getBotTrades(30).catch(() => ({ trades: [] })),
        api.getRapidShocks(activeSym, config.timeframe).catch(() => null),
        api.getMultiTimeframeConsensus(activeSym, config.timeframe, config.higherTimeframes).catch(() => null),
      ]);

      if (statusRes) {
        setBotStatus(statusRes);
        if (statusRes.config) {
          setConfig((prev) => ({
            ...prev,
            enabled: statusRes.enabled ?? prev.enabled,
            symbols: statusRes.config.symbols || prev.symbols,
            timeframe: statusRes.config.timeframe || prev.timeframe,
            higherTimeframes: statusRes.config.higherTimeframes || prev.higherTimeframes,
            multiTimeframeConsensus: statusRes.config.multiTimeframeConsensus ?? prev.multiTimeframeConsensus,
            minConfidence: statusRes.config.minConfidence ?? prev.minConfidence,
            riskPercent: statusRes.config.riskPercent ?? prev.riskPercent,
            maxOpenPositions: statusRes.config.maxOpenPositions ?? prev.maxOpenPositions,
            maxTradesPerSymbol: statusRes.config.maxTradesPerSymbol ?? prev.maxTradesPerSymbol,
            cooldownMinutes: statusRes.config.cooldownMs ? Math.round(statusRes.config.cooldownMs / 60000) : prev.cooldownMinutes,
            autoStopLoss: statusRes.config.autoStopLoss ?? prev.autoStopLoss,
            autoTakeProfit: statusRes.config.autoTakeProfit ?? prev.autoTakeProfit,
            trailingStop: statusRes.config.trailingStop ?? prev.trailingStop,
            newsRiskFilter: statusRes.config.newsRiskFilter ?? prev.newsRiskFilter,
            shockProtectionFilter: statusRes.config.shockProtectionFilter ?? prev.shockProtectionFilter,
          }));
        }
      }

      if (signalsRes?.signals) {
        setSignals(signalsRes.signals);
      }
      if (tradesRes?.trades) {
        setTrades(tradesRes.trades);
      }
      if (shocksRes) {
        setShocksData(shocksRes);
      }
      if (mtfRes) {
        setMtfData(mtfRes);
      }
    } catch (err) {
      console.error('Failed to load bot data:', err);
    } finally {
      setLoading(false);
    }
  }, [config.symbols, config.timeframe, config.higherTimeframes]);

  useEffect(() => {
    fetchBotData();
    const timer = setInterval(fetchBotData, 5000);
    return () => clearInterval(timer);
  }, [fetchBotData]);

  const handleToggleBot = async () => {
    try {
      setActionLoading(true);
      if (botStatus?.running || config.enabled) {
        await api.stopBot();
      } else {
        await api.startBot();
      }
      await fetchBotData();
      onRefresh?.();
    } catch (err: any) {
      alert(`Bot action failed: ${err?.message || err}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      await api.updateBotConfig({
        symbols: config.symbols,
        timeframe: config.timeframe,
        higherTimeframes: config.higherTimeframes,
        multiTimeframeConsensus: config.multiTimeframeConsensus,
        minConfidence: Number(config.minConfidence),
        riskPercent: Number(config.riskPercent),
        maxOpenPositions: Number(config.maxOpenPositions),
        maxTradesPerSymbol: Number(config.maxTradesPerSymbol),
        cooldownMs: Number(config.cooldownMinutes) * 60 * 1000,
        autoStopLoss: config.autoStopLoss,
        autoTakeProfit: config.autoTakeProfit,
        trailingStop: config.trailingStop,
        newsRiskFilter: config.newsRiskFilter,
        shockProtectionFilter: config.shockProtectionFilter,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchBotData();
    } catch (err: any) {
      alert(`Failed to save config: ${err?.message || err}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddSymbol = () => {
    const sym = newSymbolInput.trim().toUpperCase();
    if (sym && !config.symbols.includes(sym)) {
      setConfig((c) => ({ ...c, symbols: [...c.symbols, sym] }));
      setNewSymbolInput('');
    }
  };

  const handleRemoveSymbol = (sym: string) => {
    setConfig((c) => ({ ...c, symbols: c.symbols.filter((s) => s !== sym) }));
  };

  const handleExecuteSignalNow = async (sig: any) => {
    try {
      setManualExecLoading(sig.id);
      await api.sendCommand({
        action: 'EXECUTE_TRADE',
        symbol: sig.symbol,
        orderType: sig.direction === 'BUY' ? 'BUY' : 'SELL',
        volume: 0.1, // standard test lot or auto-size
        sl: sig.stopLoss > 0 ? sig.stopLoss : undefined,
        tp: sig.takeProfit > 0 ? sig.takeProfit : undefined,
        comment: `BOT_MANUAL_${sig.direction}`,
        source: 'BOT',
      });
      await fetchBotData();
      onRefresh?.();
    } catch (err: any) {
      alert(`Order execution error: ${err?.message || err}`);
    } finally {
      setManualExecLoading(null);
    }
  };

  const isRunning = Boolean(botStatus?.running);

  return (
    <div className="space-y-6">
      {/* Top Banner: Mind & Physical Worker Concept */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-800/50 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border ${
              isRunning
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/20'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-400'
            }`}>
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Automated Trading Bot
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold tracking-wider uppercase border ${
                  isRunning
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {isRunning ? 'PHYSICAL WORKER ACTIVE' : 'PAUSED'}
                </span>
                {config.newsRiskFilter && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border bg-cyan-950/80 text-cyan-300 border-cyan-700/60 flex items-center gap-1">
                    <Shield className="h-3 w-3 text-cyan-400" />
                    <span>NEWS SHIELD ON</span>
                  </span>
                )}
                {config.shockProtectionFilter && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border bg-amber-950/80 text-amber-300 border-amber-700/60 flex items-center gap-1">
                    <Zap className="h-3 w-3 text-amber-400" />
                    <span>SHOCK SHIELD ON</span>
                  </span>
                )}
                {config.multiTimeframeConsensus && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border bg-indigo-950/80 text-indigo-300 border-indigo-700/60 flex items-center gap-1">
                    <Sliders className="h-3 w-3 text-indigo-400" />
                    <span>MTF CONFIRM ON</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400 max-w-2xl">
                The <span className="text-cyan-300 font-semibold">KnowledgeBase Mind</span> formulates quantitative signals from indicators, patterns, and news.
                The <span className="text-emerald-300 font-semibold">Bot Physical Worker</span> executes orders directly to MetaTrader 5 via the unified Command Dispatcher.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleToggleBot}
              disabled={actionLoading}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all shadow-lg ${
                isRunning
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
              }`}
            >
              {actionLoading ? (
                <RotateCw className="h-4 w-4 animate-spin" />
              ) : isRunning ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              <span>{isRunning ? 'HALT BOT EXECUTION' : 'START AUTO-TRADER'}</span>
            </button>
            <button
              onClick={fetchBotData}
              title="Refresh signals & trades"
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Metrics Strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-slate-800/80 pt-4">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Trades Executed</div>
            <div className="text-lg font-bold font-mono text-white mt-0.5">
              {botStatus?.tradesExecuted ?? 0}
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Active Trades</div>
            <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
              {botStatus?.activeTrades ?? trades.filter((t) => t.status === 'PENDING' || t.status === 'EXECUTED').length}
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Win Rate</div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {botStatus?.winRate ?? 0}%
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Net Bot Profit</div>
            <div className={`text-lg font-bold font-mono mt-0.5 ${
              (botStatus?.totalProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              ${(botStatus?.totalProfit ?? 0).toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Signals Formulated</div>
            <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">
              {botStatus?.signalsGenerated ?? signals.length}
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Dispatch Channel</div>
            <div className="text-xs font-mono text-slate-300 mt-1 truncate" title="Unified Command Dispatcher">
              Unified Dispatcher
            </div>
          </div>
        </div>
      </div>

      {/* Rapid Shock & Spread Protection Alert Banner */}
      {shocksData?.coolingStatus?.inShock && (
        <div className="rounded-xl border border-amber-600/60 bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/50 p-4 shadow-lg flex items-start gap-3 text-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1 text-xs">
            <div className="font-bold text-amber-300 text-sm flex items-center gap-2">
              <span>Rapid Price Movement / Shock Active</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-900/80 border border-amber-700 text-amber-200 uppercase">
                Bot Entry Shield Active
              </span>
            </div>
            <p className="mt-1 text-slate-300">
              {shocksData.coolingStatus.reason || 'Recent high-velocity pip excursion detected. Bot executions are temporarily held to safeguard against spread blowouts.'}
            </p>
            {shocksData.coolingStatus.shock?.attributedCatalyst && (
              <div className="mt-2 text-[11px] font-mono text-cyan-300 flex items-center gap-1.5">
                <span className="text-slate-400">Attributed Catalyst:</span>
                <span className="font-bold underline">{shocksData.coolingStatus.shock.attributedCatalyst.title}</span>
                <span className="text-slate-400">({shocksData.coolingStatus.shock.attributedCatalyst.attributionConfidence}% confidence)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main 2-Column Split: Controls on Left, Signals Feed on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Physical Bot Configuration */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-cyan-400" />
                <h2 className="text-base font-bold text-white">Execution Parameters</h2>
              </div>
              {saveSuccess && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </span>
              )}
            </div>

            <form onSubmit={handleSaveConfig} className="mt-4 space-y-4 text-xs font-mono">
              {/* Target Symbols */}
              <div>
                <label className="block text-slate-400 uppercase font-semibold mb-1.5">
                  Tracked Trading Symbols
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {config.symbols.map((sym) => {
                    const symObj = state?.allSymbols?.find((s) => s.symbol === sym);
                    return (
                      <span
                        key={sym}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs"
                      >
                        <span className="font-bold">{sym}</span>
                        {symObj && (
                          <span className="text-[10px] text-cyan-300 font-mono">
                            {symObj.spread} pts
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveSymbol(sym)}
                          className="text-slate-400 hover:text-rose-400 ml-1"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSymbolInput}
                    onChange={(e) => setNewSymbolInput(e.target.value)}
                    placeholder="Add symbol (e.g. USDJPY)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddSymbol}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Timeframe & Min Confidence */}
              <div>
                <label className="block text-slate-400 uppercase font-semibold mb-1.5 flex items-center justify-between">
                  <span>Trading Timeframe</span>
                  <span className="text-cyan-400 font-bold">{config.timeframe} Active</span>
                </label>
                <div className="grid grid-cols-6 gap-1 mb-2">
                  {['M1', 'M5', 'M15', 'M30', 'H1', 'H4'].map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setConfig({ ...config, timeframe: tf })}
                      className={`py-1.5 rounded text-xs font-mono font-bold transition-all border ${
                        config.timeframe === tf
                          ? 'bg-cyan-600 text-white border-cyan-400 shadow-md shadow-cyan-600/30'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Confidence Threshold & Risk % */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 uppercase font-semibold mb-1">
                    Min Confidence: {config.minConfidence}%
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    step="5"
                    value={config.minConfidence}
                    onChange={(e) => setConfig({ ...config, minConfidence: Number(e.target.value) })}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 uppercase font-semibold mb-1">
                    Risk Per Trade %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="5.0"
                    value={config.riskPercent}
                    onChange={(e) => setConfig({ ...config, riskPercent: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Max Open Trades & Cooldown */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 uppercase font-semibold mb-1">
                    Max Open Trades
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={config.maxOpenPositions}
                    onChange={(e) => setConfig({ ...config, maxOpenPositions: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 uppercase font-semibold mb-1">
                    Cooldown (Mins)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={config.cooldownMinutes}
                    onChange={(e) => setConfig({ ...config, cooldownMinutes: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Protection & Multi-Timeframe Toggles */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-300">Auto Stop Loss (ATR Dynamic)</span>
                  <input
                    type="checkbox"
                    checked={config.autoStopLoss}
                    onChange={(e) => setConfig({ ...config, autoStopLoss: e.target.checked })}
                    className="h-4 w-4 rounded accent-cyan-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-300">Auto Take Profit (2:1 RR Target)</span>
                  <input
                    type="checkbox"
                    checked={config.autoTakeProfit}
                    onChange={(e) => setConfig({ ...config, autoTakeProfit: e.target.checked })}
                    className="h-4 w-4 rounded accent-cyan-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-300">Trailing Stop Guard</span>
                  <input
                    type="checkbox"
                    checked={config.trailingStop}
                    onChange={(e) => setConfig({ ...config, trailingStop: e.target.checked })}
                    className="h-4 w-4 rounded accent-cyan-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer pt-1 border-t border-slate-800/60">
                  <div>
                    <span className="text-indigo-300 font-bold block">Multi-Timeframe Trend Confirmation</span>
                    <span className="text-[10px] text-slate-500 block">Blocks counter-trend trades; requires M15/H1 trend alignment</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.multiTimeframeConsensus}
                    onChange={(e) => setConfig({ ...config, multiTimeframeConsensus: e.target.checked })}
                    className="h-4 w-4 rounded accent-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer pt-1 border-t border-slate-800/60">
                  <div>
                    <span className="text-amber-300 font-bold block">Sudden Movement & Shock Shield</span>
                    <span className="text-[10px] text-slate-500 block">Pauses trades during violent spikes, whipsaws, or spread blowouts</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.shockProtectionFilter}
                    onChange={(e) => setConfig({ ...config, shockProtectionFilter: e.target.checked })}
                    className="h-4 w-4 rounded accent-amber-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer pt-1 border-t border-slate-800/60">
                  <div>
                    <span className="text-cyan-300 font-bold block">Macro News Risk Shield</span>
                    <span className="text-[10px] text-slate-500 block">Auto-blocks entries during high-impact news hazard window</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.newsRiskFilter}
                    onChange={(e) => setConfig({ ...config, newsRiskFilter: e.target.checked })}
                    className="h-4 w-4 rounded accent-cyan-500"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full mt-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-wider uppercase transition-colors"
              >
                {actionLoading ? 'Saving...' : 'Apply Bot Parameters'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: KnowledgeBase Mind Signals Feed */}
        <div className="lg:col-span-7 space-y-6">
          {/* Multi-Timeframe Consensus & Trend Alignment Card */}
          {mtfData && (
            <div className="rounded-xl border border-indigo-900/60 bg-gradient-to-br from-slate-900 via-indigo-950/20 to-slate-900 p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-indigo-900/40">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-indigo-400" />
                  <div>
                    <h2 className="text-base font-bold text-white">Multi-Timeframe Trend Consensus</h2>
                    <p className="text-[11px] font-mono text-slate-400">
                      Cross-Timeframe Confirmation for <span className="text-cyan-300 font-bold">{mtfData.symbol}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase border ${
                    mtfData.overallConsensus === 'STRONG_BUY' || mtfData.overallConsensus === 'BUY'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                      : mtfData.overallConsensus === 'STRONG_SELL' || mtfData.overallConsensus === 'SELL'
                      ? 'bg-rose-950 text-rose-300 border-rose-700/60'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}>
                    {mtfData.overallConsensus.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-300">
                    {mtfData.concordanceScore}% Concordance
                  </span>
                </div>
              </div>

              {/* Timeframe Chips Matrix */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {Object.entries(mtfData.timeframeBreakdown || {}).map(([tf, tfData]: [string, any]) => {
                  const isPrimary = tf === mtfData.primaryTimeframe;
                  const isBull = tfData.trend === 'BULLISH';
                  const isBear = tfData.trend === 'BEARISH';
                  return (
                    <div
                      key={tf}
                      className={`p-2.5 rounded-lg border font-mono ${
                        isPrimary
                          ? 'border-cyan-500/60 bg-cyan-950/30'
                          : 'border-slate-800 bg-slate-950/50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-white">{tf} {isPrimary ? '(EXEC)' : ''}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isBull
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : isBear
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {tfData.trend}
                        </span>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>RSI: {tfData.rsi ?? '--'}</span>
                        <span>EMA: {tfData.priceVsEma200}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Warnings or Alignment Reasons */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] font-mono gap-2">
                <div className="flex items-center gap-1.5 text-slate-300">
                  {mtfData.isAligned ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  )}
                  <span>
                    {mtfData.isAligned
                      ? `Execution Aligned: Higher timeframe trend is ${mtfData.higherTimeframeTrend.toLowerCase()}`
                      : mtfData.warnings?.[0] || 'Mixed timeframes: Bot will prioritize conservative setups'}
                  </span>
                </div>
                <span className="text-slate-500 text-[10px]">
                  Refreshed: {new Date(mtfData.evaluatedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-400" />
                <h2 className="text-base font-bold text-white">KnowledgeBase Mind Signals</h2>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {signals.length} signal(s) evaluated
              </span>
            </div>

            <div className="mt-4 space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {signals.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs font-mono">
                  <Brain className="h-8 w-8 mx-auto mb-2 text-slate-600 opacity-60" />
                  <p>Awaiting new signals from the KnowledgeBase Mind...</p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    The Mind continuously analyzes indicators, regimes and patterns on active symbols.
                  </p>
                </div>
              ) : (
                signals.map((sig) => {
                  const isBuy = sig.direction === 'BUY';
                  const isSell = sig.direction === 'SELL';
                  const isHold = sig.direction === 'HOLD';

                  return (
                    <div
                      key={sig.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isBuy
                          ? 'bg-emerald-950/20 border-emerald-800/50 hover:border-emerald-600'
                          : isSell
                          ? 'bg-rose-950/20 border-rose-800/50 hover:border-rose-600'
                          : 'bg-slate-800/40 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold tracking-wider ${
                            isBuy
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : isSell
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-slate-700 text-slate-300'
                          }`}>
                            {sig.direction}
                          </span>
                          <span className="font-extrabold text-sm text-white font-mono">
                            {sig.symbol}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            [{sig.timeframe || 'M1'}]
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                            {sig.confidence}% Conviction
                          </span>
                          {!isHold && (
                            <button
                              onClick={() => handleExecuteSignalNow(sig)}
                              disabled={manualExecLoading === sig.id}
                              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-mono font-bold tracking-wider uppercase transition-colors"
                            >
                              {manualExecLoading === sig.id ? 'Executing...' : 'Execute Now'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Pricing Parameters */}
                      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] font-mono bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
                        <div>
                          <span className="text-slate-500 block">Entry</span>
                          <span className="text-slate-200 font-semibold">{sig.entryPrice}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Stop Loss</span>
                          <span className="text-rose-400 font-semibold">{sig.stopLoss || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Take Profit</span>
                          <span className="text-emerald-400 font-semibold">{sig.takeProfit || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Risk:Reward</span>
                          <span className="text-cyan-400 font-semibold">{sig.riskRewardRatio ? `${sig.riskRewardRatio}R` : 'N/A'}</span>
                        </div>
                      </div>

                      {/* Protective Trailing & Breakeven Architecture */}
                      {sig.trailingProtection && (
                        <div className="mt-2.5 p-2 rounded-lg bg-indigo-950/30 border border-indigo-800/40 text-[10px] font-mono flex flex-wrap items-center justify-between gap-1.5 text-indigo-200">
                          <div className="flex items-center gap-1.5">
                            <Shield className="h-3 w-3 text-cyan-400 shrink-0" />
                            <span className="font-semibold text-white">Trailing Protection:</span>
                            <span>Breakeven triggers at +{sig.trailingProtection.breakevenTriggerPoints} pts (locks +{sig.trailingProtection.breakevenLockPoints} pts)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">•</span>
                            <span>Trail buffer: {sig.trailingProtection.trailingDistancePoints} pts (step {sig.trailingProtection.trailingStepPoints} pts)</span>
                            <span className="px-1.5 py-0.2 bg-indigo-900/60 rounded text-[9px] text-cyan-300 font-bold">
                              {sig.trailingProtection.recommendedTrailingType}
                            </span>
                          </div>
                        </div>
                      )}


                      {/* Rationale Bullet tags */}
                      {Array.isArray(sig.reasons) && sig.reasons.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {sig.reasons.map((r: string, idx: number) => (
                            <span
                              key={idx}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50"
                            >
                              ✓ {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Bot Trade History & Physical Executions */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">Physical Bot Orders & Executions</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {trades.length} trade record(s)
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          {trades.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs font-mono">
              No automated bot trades executed yet. Start the bot above or click "Execute Now" on any signal.
            </div>
          ) : (
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                  <th className="py-2.5 px-3">Trade ID</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Lots</th>
                  <th className="py-2.5 px-3">Entry</th>
                  <th className="py-2.5 px-3">SL / TP</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Profit</th>
                  <th className="py-2.5 px-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {trades.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-semibold text-slate-300">{t.id}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{t.symbol}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.direction === 'BUY'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                          : 'bg-rose-950 text-rose-300 border border-rose-800/50'
                      }`}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{t.volume}</td>
                    <td className="py-2.5 px-3 text-slate-200">{t.entryPrice}</td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {t.stopLoss || '-'} / {t.takeProfit || '-'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        t.status === 'EXECUTED'
                          ? 'text-emerald-400 bg-emerald-950/40'
                          : t.status === 'PENDING'
                          ? 'text-amber-400 bg-amber-950/40'
                          : 'text-slate-400 bg-slate-800'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 font-bold ${
                      t.profit > 0 ? 'text-emerald-400' : t.profit < 0 ? 'text-rose-400' : 'text-slate-400'
                    }`}>
                      ${(t.profit ?? 0).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {t.openedAt ? new Date(t.openedAt).toLocaleTimeString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
