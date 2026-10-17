import React, { useState, useEffect, useCallback } from "react";
import {
  Cpu,
  Play,
  Pause,
  Square,
  RefreshCw,
  FastForward,
  Database,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Activity,
  FileText,
  Sliders,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Search,
} from "lucide-react";
import {
  getBotStatus,
  getBotRunning,
  getBotStrategies,
  getBotSessions,
  getBotSessionLogs,
  getBotSignal,
  startBot,
  stepBot,
  pauseBotSession,
  resumeBotSession,
  stopBotSession,
  getDbStats,
  getDbIntegrity,
  getDbReports,
  vacuumDb,
} from "../../services/cotrade";
import { Badge, Button, Modal, ModalFooter } from "../ui";

export interface BotDashboardProps {
  activeSymbol: string;
  allSymbols?: any[];
  onSwitchSymbol?: (symbol: string) => void;
  onNavigateHome?: () => void;
}

export const BotDashboard: React.FC<BotDashboardProps> = ({
  activeSymbol,
  allSymbols = [],
  onSwitchSymbol,
  onNavigateHome,
}) => {
  const [loading, setLoading] = useState(false);
  const [botStatus, setBotStatus] = useState<any>(null);
  const [runningSessions, setRunningSessions] = useState<any[]>([]);
  const [botStrategies, setBotStrategies] = useState<any>(null);
  const [botSessions, setBotSessions] = useState<any[]>([]);
  const [dbStats, setDbStats] = useState<any>(null);
  const [dbIntegrity, setDbIntegrity] = useState<any>(null);
  const [dbReports, setDbReports] = useState<any[]>([]);

  // Launch modal & form
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [launchStrategy, setLaunchStrategy] = useState("trend_following");
  const [launchSymbol, setLaunchSymbol] = useState(activeSymbol || "EURUSD");
  const [launchTf, setLaunchTf] = useState("M1");
  const [launchDryRun, setLaunchDryRun] = useState(true);
  const [launchRisk, setLaunchRisk] = useState("50");
  const [launchStopPips, setLaunchStopPips] = useState("20");
  const [launchLoading, setLaunchLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Live signal evaluation
  const [evalStrategy, setEvalStrategy] = useState("trend_following");
  const [evalSymbol, setEvalSymbol] = useState(activeSymbol || "EURUSD");
  const [evalTf, setEvalTf] = useState("M1");
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);

  // Logs modal
  const [viewingLogsSessionId, setViewingLogsSessionId] = useState<string | null>(null);
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Vacuuming state
  const [vacuumLoading, setVacuumLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, runRes, stratRes, sessRes, statsRes, integRes, reportsRes] =
        await Promise.allSettled([
          getBotStatus(),
          getBotRunning(),
          getBotStrategies(),
          getBotSessions(50),
          getDbStats(),
          getDbIntegrity(),
          getDbReports(20),
        ]);

      if (statusRes.status === "fulfilled") setBotStatus(statusRes.value);
      if (runRes.status === "fulfilled") setRunningSessions(runRes.value.sessions || []);
      if (stratRes.status === "fulfilled") {
        setBotStrategies(stratRes.value);
        const firstStrat =
          stratRes.value.builtin_strategies?.[0] ||
          stratRes.value.stored_strategies?.[0];
        if (firstStrat && !launchStrategy) setLaunchStrategy(firstStrat);
        if (firstStrat && !evalStrategy) setEvalStrategy(firstStrat);
      }
      if (sessRes.status === "fulfilled") setBotSessions(sessRes.value.sessions || []);
      if (statsRes.status === "fulfilled") setDbStats(statsRes.value);
      if (integRes.status === "fulfilled") setDbIntegrity(integRes.value);
      if (reportsRes.status === "fulfilled") setDbReports(reportsRes.value.reports || []);
    } catch (e) {
      console.error("Failed to load bot data", e);
    } finally {
      setLoading(false);
    }
  }, [launchStrategy, evalStrategy]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Keep launch and eval symbol in sync if activeSymbol changes
  useEffect(() => {
    if (activeSymbol) {
      setLaunchSymbol(activeSymbol);
      setEvalSymbol(activeSymbol);
    }
  }, [activeSymbol]);

  const handleLaunch = async () => {
    setLaunchLoading(true);
    setActionMessage(null);
    try {
      const res = await startBot({
        strategy_name: launchStrategy,
        symbol: launchSymbol,
        timeframe: launchTf,
        dry_run: launchDryRun,
        risk_amount: parseFloat(launchRisk) || 50,
        stop_pips: parseFloat(launchStopPips) || 20,
      });
      setActionMessage(`Session started: ${res.session_id}`);
      setShowLaunchModal(false);
      fetchData();
    } catch (err: any) {
      setActionMessage(`Launch failed: ${err.message || String(err)}`);
    } finally {
      setLaunchLoading(false);
    }
  };

  const handleStepSession = async (sessionId?: string) => {
    try {
      await stepBot(sessionId ? { session_id: sessionId } : {});
      setActionMessage(sessionId ? `Stepped bar for ${sessionId}` : "Stepped 1 bar on all sessions");
      fetchData();
    } catch (err: any) {
      setActionMessage(`Step failed: ${err.message || String(err)}`);
    }
  };

  const handleStopSession = async (sessionId: string) => {
    try {
      await stopBotSession(sessionId);
      setActionMessage(`Stopped session ${sessionId}`);
      fetchData();
    } catch (err: any) {
      setActionMessage(`Stop failed: ${err.message || String(err)}`);
    }
  };

  const handleEvaluateSignal = async () => {
    setEvalLoading(true);
    setEvalResult(null);
    try {
      const res = await getBotSignal(evalStrategy, evalSymbol, evalTf, 500);
      setEvalResult(res);
    } catch (err: any) {
      setEvalResult({ error: err.message || String(err) });
    } finally {
      setEvalLoading(false);
    }
  };

  const handleViewLogs = async (sessionId: string) => {
    setViewingLogsSessionId(sessionId);
    setLogsLoading(true);
    try {
      const res = await getBotSessionLogs(sessionId, 200);
      setSessionLogs(res.logs || []);
    } catch (err) {
      setSessionLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleVacuum = async () => {
    setVacuumLoading(true);
    try {
      await vacuumDb();
      setActionMessage("Database vacuumed and optimized successfully");
      fetchData();
    } catch (err: any) {
      setActionMessage(`Vacuum error: ${err.message || String(err)}`);
    } finally {
      setVacuumLoading(false);
    }
  };

  const allAvailableStrategies = [
    ...(botStrategies?.builtin_strategies || []),
    ...(botStrategies?.stored_strategies || []),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 card-panel bg-slate-900/90 p-4 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">Algorithmic Bot &amp; Engine Lab</h2>
              <Badge variant={botStatus?.status === "running" ? "success" : "neutral"} size="sm" dot>
                {botStatus?.status ? botStatus.status.toUpperCase() : "READY"}
              </Badge>
              {botStatus?.connected_to_mt5 && (
                <Badge variant="brand" size="sm">
                  MT5 LINKED
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Authoritative runtime advancing strategy signals, live execution, and SQLite performance logs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleStepSession()}
            title="Advance 1 bar on all running sessions"
          >
            <FastForward className="w-3.5 h-3.5" />
            Step 1 Bar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowLaunchModal(true)}
          >
            <Play className="w-3.5 h-3.5" />
            Start Bot Session
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-indigo-950/40 border border-indigo-500/40 rounded-xl text-xs text-indigo-200 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white text-xs font-mono"
          >
            ×
          </button>
        </div>
      )}

      {/* 2. Top Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Runtime Engine</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <span className="text-lg font-bold font-mono text-white">
              {botStatus?.engine || "live_mt5_bridge"}
            </span>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${botStatus?.connected_to_mt5 ? "bg-emerald-400" : "bg-amber-400"}`} />
              {botStatus?.connected_to_mt5 ? "Live terminal connected" : "Detached / Offline mode"}
            </div>
          </div>
        </div>

        <div className="card-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active Sessions</span>
            <Play className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {runningSessions.length}
            </span>
            <div className="text-[11px] text-slate-400 mt-1">
              {botStatus?.sessions_live_money ?? 0} live money, {botStatus?.sessions_dry_run ?? runningSessions.length} simulated
            </div>
          </div>
        </div>

        <div className="card-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Strategies Available</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-indigo-300">
              {allAvailableStrategies.length || 13}
            </span>
            <div className="text-[11px] text-slate-400 mt-1">
              {botStrategies?.builtin_strategies?.length ?? 13} builtin + {botStrategies?.stored_strategies?.length ?? 0} custom
            </div>
          </div>
        </div>

        <div className="card-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Database Reports</span>
            <Database className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-amber-300">
              {dbStats?.reports ?? 0}
            </span>
            <div className="text-[11px] text-slate-400 mt-1">
              {dbStats?.report_trades ?? 0} simulated trade fills
            </div>
          </div>
        </div>
      </div>

      {/* 3. Live Running Sessions Section */}
      <div className="card-panel">
        <div className="card-panel-header">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            <span className="card-panel-title">Active Running Bot Sessions ({runningSessions.length})</span>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            Autorun frequency: bar-by-bar
          </div>
        </div>

        {runningSessions.length === 0 ? (
          <div className="py-10 text-center flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
              <Cpu className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-300">No active bot sessions running right now</p>
            <p className="text-xs text-slate-500 max-w-sm text-center">
              Start an algorithmic strategy runner below to evaluate incoming bars and manage automated risk rules.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowLaunchModal(true)}
              className="mt-2"
            >
              <Play className="w-3.5 h-3.5" />
              Launch Session
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {runningSessions.map((s) => (
              <div
                key={s.session_id}
                className="p-3.5 rounded-xl bg-slate-850 border border-slate-700/80 hover:border-slate-600 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-white text-sm">
                      {s.strategy || "Unknown Strategy"}
                    </span>
                    <Badge variant="brand" size="sm">
                      {s.symbol} [{s.timeframe || "M1"}]
                    </Badge>
                    <Badge variant={s.dry_run ? "neutral" : "danger"} size="sm">
                      {s.dry_run ? "DRY RUN (SAFE)" : "LIVE ORDERS"}
                    </Badge>
                    <span className="text-[10px] text-slate-500 font-mono">
                      id: {s.session_id}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-3 font-mono">
                    <span>Uptime: {s.uptime_seconds ? `${s.uptime_seconds}s` : "active"}</span>
                    <span>Magic: {s.magic ?? 0}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleStepSession(s.session_id)}
                    title="Advance single bar"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    Step Bar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleViewLogs(s.session_id)}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Logs
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleStopSession(s.session_id)}
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Two-Column Row: Live Signal Evaluator + Fast Strategy Launcher */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (6 cols): Live Signal Evaluator */}
        <div className="lg:col-span-6 card-panel space-y-4">
          <div className="card-panel-header">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span className="card-panel-title">Strategy Signal Scanner (Live Market Bars)</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">Pure Math Check</span>
          </div>

          <p className="text-xs text-slate-400">
            Feed live MT5 candles into any strategy to inspect indicator triggers and signal decisions without placing any trades.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Strategy</label>
              <select
                value={evalStrategy}
                onChange={(e) => setEvalStrategy(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                {allAvailableStrategies.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
                {allAvailableStrategies.length === 0 && (
                  <option value="trend_following">trend_following</option>
                )}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Symbol</label>
              <input
                type="text"
                value={evalSymbol}
                onChange={(e) => setEvalSymbol(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                placeholder="EURUSD"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Timeframe</label>
              <select
                value={evalTf}
                onChange={(e) => setEvalTf(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="M1">M1 (1 Minute)</option>
                <option value="M5">M5 (5 Minutes)</option>
                <option value="M15">M15 (15 Minutes)</option>
                <option value="M30">M30 (30 Minutes)</option>
                <option value="H1">H1 (1 Hour)</option>
                <option value="D1">D1 (1 Day)</option>
              </select>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleEvaluateSignal}
            disabled={evalLoading}
            className="w-full"
          >
            <Activity className={`w-3.5 h-3.5 ${evalLoading ? "animate-spin" : ""}`} />
            {evalLoading ? "Evaluating Market Bars..." : "Evaluate Live Signal"}
          </Button>

          {evalResult && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Direction:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded text-xs ${
                    evalResult.direction === "buy"
                      ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                      : evalResult.direction === "sell"
                      ? "bg-rose-950/60 text-rose-400 border border-rose-500/30"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {evalResult.direction ? evalResult.direction.toUpperCase() : "FLAT"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Signal Value:</span>
                <span className="text-white">{evalResult.signal ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Bars Analyzed:</span>
                <span className="text-white">{evalResult.bars ?? 500} bars</span>
              </div>
              {evalResult.pip && (
                <div className="flex items-center justify-between text-slate-400">
                  <span>Pip Scale:</span>
                  <span className="text-indigo-300">{evalResult.pip}</span>
                </div>
              )}
              {evalResult.error && (
                <div className="text-rose-400 text-xs mt-1">
                  Error: {evalResult.error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column (6 cols): Quick Launcher */}
        <div className="lg:col-span-6 card-panel space-y-4">
          <div className="card-panel-header">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span className="card-panel-title">Quick Bot Session Launcher</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">Live / Dry-Run</span>
          </div>

          <p className="text-xs text-slate-400">
            Spawn a managed bot session that attaches to the MT5 price stream with auto-stops and risk management.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Strategy</label>
              <select
                value={launchStrategy}
                onChange={(e) => setLaunchStrategy(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                {allAvailableStrategies.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Symbol</label>
              <input
                type="text"
                value={launchSymbol}
                onChange={(e) => setLaunchSymbol(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                placeholder="EURUSD"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Timeframe</label>
              <select
                value={launchTf}
                onChange={(e) => setLaunchTf(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="M1">M1</option>
                <option value="M5">M5</option>
                <option value="M15">M15</option>
                <option value="H1">H1</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Max Risk ($)</label>
              <input
                type="number"
                value={launchRisk}
                onChange={(e) => setLaunchRisk(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-slate-850 rounded-xl border border-slate-700/60">
            <input
              type="checkbox"
              id="dry-run-check"
              checked={launchDryRun}
              onChange={(e) => setLaunchDryRun(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="dry-run-check" className="text-xs text-slate-300 cursor-pointer">
              <strong>Simulated Dry-Run (Recommended)</strong> — Evaluate all signals and record trades in SQLite without risking account margin.
            </label>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleLaunch}
            disabled={launchLoading}
            className="w-full"
          >
            <Play className="w-3.5 h-3.5" />
            {launchLoading ? "Launching..." : "Launch Bot Session"}
          </Button>
        </div>
      </div>

      {/* 5. Historical Sessions & Performance Logs */}
      <div className="card-panel">
        <div className="card-panel-header">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <span className="card-panel-title">Session Performance History ({botSessions.length})</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">SQLite Stored Sessions</span>
        </div>

        {botSessions.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            No historical bot sessions recorded in the database yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Session ID</th>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Trades</th>
                  <th className="py-2.5 px-3 text-right">PnL (Pips)</th>
                  <th className="py-2.5 px-3">Started</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {botSessions.map((session) => (
                  <tr key={session.session_id} className="hover:bg-slate-850/50">
                    <td className="py-2.5 px-3 text-slate-300 font-bold">
                      {session.session_id}
                    </td>
                    <td className="py-2.5 px-3 text-indigo-300">
                      {session.strategy_name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">
                      {session.symbol} [{session.timeframe || "M1"}]
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          session.status === "running"
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {session.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {session.trades_count ?? 0}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        (session.pnl_pips ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {(session.pnl_pips ?? 0).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {session.start_time || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleViewLogs(session.session_id)}
                        className="text-indigo-400 hover:text-indigo-300 text-xs cursor-pointer"
                      >
                        View Logs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Backtest Strategy Reports (Honest Statistical Verdicts) */}
      <div className="card-panel">
        <div className="card-panel-header">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <span className="card-panel-title">Backtest Reports &amp; Statistical Verdicts ({dbReports.length})</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">T-Statistic Verified</span>
        </div>

        {dbReports.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            No backtest reports stored yet. Run a sweep with <code>python run.py bot sweep EURUSD</code> to generate verified reports.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Run ID</th>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className="py-2.5 px-3">Symbol / TF</th>
                  <th className="py-2.5 px-3">Verdict</th>
                  <th className="py-2.5 px-3 text-right">Trades</th>
                  <th className="py-2.5 px-3 text-right">Win Rate</th>
                  <th className="py-2.5 px-3 text-right">Sharpe</th>
                  <th className="py-2.5 px-3 text-right">PnL (pts)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {dbReports.map((r) => {
                  const verdict = (r.verdict || "UNKNOWN").toUpperCase();
                  const isPass = verdict === "PASS";
                  const isCand = verdict === "CANDIDATE";
                  return (
                    <tr key={r.run_id} className="hover:bg-slate-850/50">
                      <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                        {r.run_id}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white">
                        {r.strategy_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {r.symbol} [{r.timeframe}]
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isPass
                              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                              : isCand
                              ? "bg-amber-950/60 text-amber-400 border border-amber-500/30"
                              : "bg-rose-950/60 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {verdict}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {r.trades_count ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200">
                        {typeof r.win_rate === "number" ? `${(r.win_rate * 100).toFixed(1)}%` : r.win_rate}
                      </td>
                      <td className="py-2.5 px-3 text-right text-indigo-300">
                        {typeof r.sharpe === "number" ? r.sharpe.toFixed(2) : r.sharpe ?? "—"}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          (r.pnl_points ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {(r.pnl_points ?? 0).toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. Database Maintenance Card */}
      <div className="card-panel">
        <div className="card-panel-header">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <span className="card-panel-title">Database Storage &amp; WAL Engine Health</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {dbIntegrity?.status || "OK"}
          </div>
        </div>

        {dbStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
            {Object.entries(dbStats)
              .filter(([k]) => k !== "path")
              .map(([key, val]) => (
                <div key={key} className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-400 block font-mono">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="text-base font-bold text-white font-mono">
                    {String(val)}
                  </span>
                </div>
              ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="text-xs text-slate-400 font-mono">
            Path: <span className="text-slate-300">{dbStats?.path || "backend/database/data/peron.db"}</span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleVacuum}
            disabled={vacuumLoading}
          >
            <Database className={`w-3.5 h-3.5 ${vacuumLoading ? "animate-spin" : ""}`} />
            {vacuumLoading ? "Vacuuming SQLite..." : "Vacuum & Re-index Database"}
          </Button>
        </div>
      </div>

      {/* Logs Modal */}
      <Modal
        open={!!viewingLogsSessionId}
        onClose={() => setViewingLogsSessionId(null)}
        title={
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>Execution Logs — {viewingLogsSessionId}</span>
          </div>
        }
        size="lg"
      >
        <div className="space-y-4">
          {logsLoading ? (
            <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
              Loading session logs from database...
            </div>
          ) : sessionLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No log entries for this session yet.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2 font-mono text-xs">
              {sessionLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-slate-900 border border-slate-800 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-indigo-300">{log.action}</span>
                    <span className="text-slate-500">{log.timestamp}</span>
                  </div>
                  <div className="text-slate-300">
                    {log.symbol} {log.side ? `(${log.side})` : ""} {log.volume ? `vol: ${log.volume}` : ""}{" "}
                    {log.price ? `@ ${log.price}` : ""}
                  </div>
                  {log.details && (
                    <div className="text-[10px] text-slate-400 truncate">
                      {log.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <ModalFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setViewingLogsSessionId(null)}
            >
              Close
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  );
};
