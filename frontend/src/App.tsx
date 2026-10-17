import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Home,
  Sliders,
  Download,
  Terminal,
  Settings,
  Cpu,
} from "lucide-react";
import {
  StrategyMode,
  TradeConfig,
  TradeRecord,
  SystemLog,
  Tick,
  EAConnectionDetails,
  AiKnowledgeBase,
} from "./types";
import {
  Header,
  MobileDrawer,
  StatusBar,
  StatsCards,
  TradePanel,
  PriceChart,
  TradeList,
  AiStudyFeed,
  StrategyPanel,
  KnowledgeBase,
  SettingsForm,
  LogsViewer,
  TabBar,
  ErrorBanner,
  Modal,
  ModalFooter,
  Badge,
  Button,
  AppShell,
} from "./components";
import { useCotradeStream } from "./hooks/useCotradeStream";
import { getStatus, getCandles, getStrategies, switchSymbol as cotradeSwitchSymbol, toTradeRecord, searchSymbols, getSymbol, selectSymbol, getResearchCatalogue, getResearchStored, scanPatterns, getBotStatus, getBotStrategies, getBotSessions, getDbStats, getDbIntegrity, vacuumDb, getHistorySummary, getHistoryDeals, getSymbols } from "./services/cotrade";
import { useChartData } from "./hooks/useChartData";
// useDownloadBridge removed (no EA downloads)
// useAiStudyFeed removed (Cotrade has no AI study feed)
import { useTradingControls } from "./hooks/useTradingControls";
import { useSettings, type SettingsState } from "./hooks/useSettings";
import { useErrorHandler } from "./hooks/useErrorHandler";
import { useElapsedTimer } from "./hooks/useElapsedTimer";

export default function App() {
  // Config & State
  const [config, setConfig] = useState<TradeConfig>({
    isActive: true,
    selectedStrategy: StrategyMode.TREND_FOLLOWING,
    lotSize: 0.1,
    takeProfitPoints: 300,
    stopLossPoints: 150,
    trailingStopPoints: 100,
    useTrailingStop: true,
    maxTrades: 3,
    isAiModeEnabled: false,
    tradingMode: "Scalping",
    selectedAssets: ["Step Index"],
  });

  const [connection, setConnection] = useState<EAConnectionDetails>({
    isEaConnected: false,
    clientIp: null,
    lastPing: null,
    broker: null,
    accountNumber: null,
    balance: null,
    symbol: null,
    symbolDigits: null,
    symbolTickSize: null,
    symbolDescription: null,
  });

  const [stats, setStats] = useState({
    totalProfit: 0,
    tradesCount: 0,
    winRate: 0,
    activePositionsCount: 0,
    lastHeartbeatTime: null as string | null,
  });

  const [history, setHistory] = useState<Tick[]>([]);
  const [candles, setCandles] = useState<
    Array<{ time: number; open: number; high: number; low: number; close: number }>
  >([]);
  const [currentPrice, setCurrentPrice] = useState<number>(1250.0);
  const [activeSymbol, setActiveSymbol] = useState<string>("");
  const [symbolResults, setSymbolResults] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<any>(null);
  const [allSymbols, setAllSymbols] = useState<any[]>([]);
  const [researchCatalog, setResearchCatalog] = useState<any>(null);
  const [botStatus, setBotStatus] = useState<any>(null);
  const [botSessions, setBotSessions] = useState<any[]>([]);
  const [botStrategies, setBotStrategies] = useState<any>(null);
  const [dbStats, setDbStats] = useState<any>(null);
  const [dbIntegrity, setDbIntegrity] = useState<any>(null);
  const [historySummary, setHistorySummary] = useState<any>(null);
  const [patternScanResult, setPatternScanResult] = useState<any>(null);
  const [patternScanLoading, setPatternScanLoading] = useState(false);
  const [lastTick, setLastTick] = useState<any>(null);
  const [terminal, setTerminal] = useState<any>(null);
  const openSymbol = async (name: string) => {
    try {
      const spec = await getSymbol(name);
      setSelectedSymbol(spec);
      await selectSymbol(name);
      setActiveSymbol(name);
    } catch (e) { console.error(e); }
  };
  const [symbolStates, setSymbolStates] = useState<
    Array<{ symbol: string; connection: any; currentPrice: number; tickCount: number }>
  >([]);
  const [tradesList, setTradesList] = useState<TradeRecord[]>([]);
  const [selectedTradeForModal, setSelectedTradeForModal] = useState<TradeRecord | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isBridgeConnected, setIsBridgeConnected] = useState<boolean>(false);

  // Network & UI
  const [isInternetOnline, setIsInternetOnline] = useState<boolean>(navigator.onLine);
  const [latency, setLatency] = useState<number>(12);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [filterLogLevel, setFilterLogLevel] = useState<string>("ALL");
  const [currentNavTab, setCurrentNavTab] = useState<"home" | "symbols" | "risk" | "history" | "bot" | "about" | "logs" | "settings">("home");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showEma, setShowEma] = useState<boolean>(true);
  const [showBollingerBands, setShowBollingerBands] = useState<boolean>(false);

  // AI & Strategies
  const [aiStudyStatus, setAiStudyStatus] = useState<"waiting" | "calibrating" | "optimized" | "active">("calibrating");
  const [aiStudyMessage, setAiStudyMessage] = useState<string>(
    "AI is calibrating long-term behavioral profile... Execution locked."
  );
  const [averageVelocity, setAverageVelocity] = useState<number | null>(null);
  const [aiKnowledgeBase, setAiKnowledgeBase] = useState<AiKnowledgeBase | null>(null);
  const [aiSynthesizedStrategy, setAiSynthesizedStrategy] = useState<any>(null);
  const [lastStrategySignal, setLastStrategySignal] = useState<{ type: string; reason: string; confidence?: number } | null>(null);
  const [strategiesList, setStrategiesList] = useState<any[]>([]);
  const [telemetryStream, setTelemetryStream] = useState<any[]>([]);

  // Trade Detail Modal State
  const [modalSl, setModalSl] = useState<string>("");
  const [modalTp, setModalTp] = useState<string>("");
  const [tradeActionLoading, setTradeActionLoading] = useState<boolean>(false);
  const [tradeActionSuccess, setTradeActionSuccess] = useState<string>("");

  useEffect(() => {
    if (selectedTradeForModal) {
      setModalSl(selectedTradeForModal.sl ? String(selectedTradeForModal.sl) : "");
      setModalTp(selectedTradeForModal.tp ? String(selectedTradeForModal.tp) : "");
      setTradeActionSuccess("");
    }
  }, [selectedTradeForModal]);

  // Session elapsed counter
  const { elapsedTime } = useElapsedTimer();

  // RAF chart throttling
  const pendingChartUpdate = useRef<{ history?: Tick[]; candles?: any[]; currentPrice?: number } | null>(null);
  const rafId = useRef<number | null>(null);
  const historyRef = useRef<Tick[]>([]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const scheduleChartUpdate = useCallback(
    (update: { history?: Tick[]; candles?: any[]; currentPrice?: number }) => {
      pendingChartUpdate.current = { ...pendingChartUpdate.current, ...update };
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(() => {
          const pending = pendingChartUpdate.current;
          if (pending) {
            if (pending.history !== undefined) setHistory(pending.history);
            if (pending.candles !== undefined) setCandles(pending.candles);
            if (pending.currentPrice !== undefined) setCurrentPrice(pending.currentPrice);
          }
          pendingChartUpdate.current = null;
          rafId.current = null;
        });
      }
    },
    []
  );

  const mergeCandles = (existing: any[], incoming: any[]): any[] => {
    const map = new Map<number, any>();
    for (const c of existing) map.set(c.time, c);
    for (const c of incoming) map.set(c.time, c);
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  };

  const { errors, showError, clearError } = useErrorHandler();

  const settings = useSettings(config);
  const tradingControls = useTradingControls();

  // Fetch Strategy List
  const fetchStrategies = useCallback(async () => {
    try {
      const list = await getStrategies();
      setStrategiesList(list.map((s: any) => ({
        id: String(s.id),
        name: s.name,
        description: s.description || s.entry_name,
        mode: s.timeframe || "M1",
        category: s.entry_name || "strategy",
        tags: (() => { try { return JSON.parse(s.tags || "[]"); } catch { return []; } })(),
      })));
    } catch (err) {
      showError("Failed to fetch strategies");
    }
  }, [showError]);

  const fetchResearchCatalog = useCallback(async () => {
    try {
      const c = await getResearchCatalogue();
      setResearchCatalog(c);
    } catch (e) { showError("Failed to fetch research catalogue"); }
  }, [showError]);

  const fetchBotData = useCallback(async () => {
    try {
      const [bs, bstrat, bsessions, ds, di] = await Promise.all([
        getBotStatus(), getBotStrategies(), getBotSessions(50), getDbStats(), getDbIntegrity(),
      ]);
      setBotStatus(bs);
      setBotStrategies(bstrat);
      setBotSessions(bsessions.sessions || []);
      setDbStats(ds);
      setDbIntegrity(di);
    } catch (e) { showError("Failed to fetch bot/db data"); }
  }, [showError]);

  const fetchAllSymbols = useCallback(async () => {
    try {
      const data = await getSymbols();
      setAllSymbols(data.symbols || []);
    } catch (e) { showError("Failed to fetch symbols"); }
  }, [showError]);

  useEffect(() => {
    if (currentNavTab === "symbols" && allSymbols.length === 0) fetchAllSymbols();
    if (currentNavTab === "bot") fetchBotData();
  }, [currentNavTab, allSymbols.length, fetchAllSymbols, fetchBotData]);



  const runPatternScan = useCallback(async (symbol: string, timeframe: string, count: number) => {
    setPatternScanLoading(true);
    try {
      const r = await scanPatterns({ symbol, timeframe, count });
      setPatternScanResult(r);
    } catch (e) { showError("Pattern scan failed"); }
    finally { setPatternScanLoading(false); }
  }, [showError]);

  // Fetch Initial Status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await getStatus();
      if (data.config) setConfig(data.config);
      if (data.connection) setConnection(data.connection);
      if (data.terminal) setTerminal(data.terminal);
      if (data.isBridgeConnected !== undefined) setIsBridgeConnected(!!data.isBridgeConnected);
      if (data.logs) setLogs(data.logs);
      if (data.trades) setTradesList(data.trades);
      if (data.history) setHistory(data.history);
      if (data.candles) setCandles(data.candles);
      if (data.currentPrice !== undefined) setCurrentPrice(data.currentPrice);
      if (data.symbolStates) setSymbolStates(data.symbolStates);
      if (data.activeSymbol) {
        setActiveSymbol(data.activeSymbol);
      } else if (data.symbolStates && data.symbolStates.length > 0) {
        setActiveSymbol(data.symbolStates[0].symbol);
      }
      if (data.stats) setStats(data.stats);
      if (data.aiSynthesizedStrategy) setAiSynthesizedStrategy(data.aiSynthesizedStrategy);
      // history summary
      try {
        const hs = await getHistorySummary(7);
        setHistorySummary(hs);
        setStats((prev) => ({ ...prev, totalProfit: hs.realized_profit ?? prev.totalProfit, tradesCount: hs.deal_count ?? prev.tradesCount }));
      } catch {}
    } catch (err) {
      showError("Failed to fetch server status");
    }
  }, [showError]);

  // Sync WebSocket
  const sendWsMessage = (_msg: any) => false;

  useCotradeStream({
    symbols: symbolStates.map((s) => s.symbol),
    onPortfolio: (msg) => {
      if (msg.positions) setTradesList((msg.positions || []).map(toTradeRecord));
      if (msg.balance !== undefined || msg.equity !== undefined) {
        setConnection((prev) => ({
          ...prev,
          balance: msg.balance ?? prev.balance,
        }));
      }
      if (msg.position_count !== undefined) {
        setStats((prev) => ({ ...prev, activePositionsCount: msg.position_count }));
      }
      if (msg.floating_profit !== undefined) {
        setStats((prev) => ({ ...prev, totalProfit: msg.floating_profit }));
      }
      setWsConnected(true);
    },
    onTick: (msg) => {
      const symbols = msg.symbols || {};
      const activeTick = (activeSymbol && symbols[activeSymbol]) ? symbols[activeSymbol] : Object.values(symbols)[0];
      if (activeTick?.bid !== undefined) {
        setCurrentPrice(activeTick.bid);
        setLastTick({ time: activeTick.time, bid: activeTick.bid, ask: activeTick.ask });
        scheduleChartUpdate({ currentPrice: activeTick.bid });
      }
      setSymbolStates((prev) => {
        const next = [...prev];
        for (const [name, t] of Object.entries(symbols)) {
          const idx = next.findIndex((s) => s.symbol === name);
          if (idx >= 0) next[idx] = { ...next[idx], currentPrice: (t as any).bid } as any;
        }
        return next;
      });
    },
    onStatusChange: setWsConnected,
  });

  // Internet online status
  useEffect(() => {
    const handleOnline = () => setIsInternetOnline(true);
    const handleOffline = () => setIsInternetOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
    fetchStrategies();
    fetchResearchCatalog();
    fetchBotData();
  }, [fetchStatus, fetchStrategies, fetchResearchCatalog, fetchBotData]);

  // Load historical candles via REST when activeSymbol changes
  useEffect(() => {
    if (!activeSymbol) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    getCandles(activeSymbol, 1000)
      .then((data) => {
        if (data.candles && Array.isArray(data.candles)) {
          setCandles((prev) => mergeCandles(prev, data.candles).slice(-2000));
        }
      })
      .catch(() => {
        // Graceful degradation: keep existing candles
      })
      .finally(() => {
        clearTimeout(timeout);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [activeSymbol]);

  // Poll AI study feed periodically
  // Cotrade has no AI study feed; keep calibrating state.
  // (no-op)

  const toggleTradingExecution = async () => {
    if (aiStudyStatus !== "optimized" && aiStudyStatus !== "active") {
      console.warn("Automated trade execution blocked: AI Speed dynamic baseline study is currently pending.");
      return;
    }
    await tradingControls.toggleTradingExecution(sendWsMessage, config, fetchStatus);
  };

  const closeAllPositions = async () => {
    await tradingControls.closeAllPositions(sendWsMessage, fetchStatus);
  };

  const resetStats = async () => {
    await tradingControls.resetStats(sendWsMessage, fetchStatus);
  };

  const switchSymbol = async (symbol: string) => {
    try {
      try {
        const data = await cotradeSwitchSymbol(symbol);
        if (data.activeSymbol) setActiveSymbol(data.activeSymbol);
        else setActiveSymbol(symbol);
      } catch {
        setActiveSymbol(symbol);
      }
      const c = await getCandles(symbol, 1000);
      if (c.candles) setCandles((prev) => mergeCandles(prev, c.candles).slice(-2000));
    } catch (e) {
      console.error("Failed to switch symbol:", e);
    }
  };

  // Compute Chart Data via Hook
  const chartData = useChartData(candles, history, 80);

  return (
    <AppShell>
      <div
        id="app-container"
        className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col selection:bg-indigo-500 selection:text-white antialiased"
      >
      {/* 1. Header with dynamic symbol and status indicators */}
      <Header
        config={config}
        connection={connection}
        isBridgeConnected={isBridgeConnected}
        wsConnected={wsConnected}
        pingLatency={pingLatency}
        latency={latency}
        isInternetOnline={isInternetOnline}
        activeSymbol={activeSymbol}
        currentPrice={currentPrice}
        symbolStates={symbolStates}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleTradingExecution={toggleTradingExecution}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onSwitchSymbol={switchSymbol}
      />

      {/* 2. Mobile Drawer */}
      <MobileDrawer
        isOpen={isMobileMenuOpen}
        config={config}
        currentPrice={currentPrice}
        activeSymbol={activeSymbol}
        currentNavTab={currentNavTab}
        logs={logs}
        connection={connection}
        isBridgeConnected={isBridgeConnected}
        wsConnected={wsConnected}
        pingLatency={pingLatency}
        latency={latency}
        isInternetOnline={isInternetOnline}
        onClose={() => setIsMobileMenuOpen(false)}
        onSetNavTab={(tab) => setCurrentNavTab(tab as any)}
        onToggleTradingExecution={toggleTradingExecution}
      />

      {/* 3. Main Dashboard Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <ErrorBanner errors={errors} onDismiss={clearError} />
        {/* Navigation Tabs Bar */}
        <TabBar
          tabs={[
            { id: "home", label: "Live Trading", icon: Home, badge: `$${currentPrice.toFixed(1)}` },
            { id: "symbols", label: "Symbols", icon: Sliders },
            { id: "risk", label: "Knowledgebase", icon: Sliders },
            { id: "history", label: "History", icon: Terminal },
            { id: "bot", label: "Bot & Database", icon: Cpu },
            { id: "about", label: "About", icon: Download },
            { id: "settings", label: "Settings", icon: Settings },
          ]}
          activeTab={currentNavTab}
          onSelect={(tabId) => setCurrentNavTab(tabId as any)}
        />

        {/* Tab 1: Live Trading Dashboard */}
        {currentNavTab === "home" && (
          <div className="space-y-6 animate-fade-in">
            {/* Market Watch (live symbols from MT5) */}
            <div className="card-panel p-3">
              <div className="text-sm font-bold mb-2">Market Watch ({symbolStates.length})</div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {symbolStates.map((s: any) => (
                  <div key={s.symbol} className="bg-slate-800 rounded px-2 py-1 text-xs">
                    <div className="font-semibold text-slate-200">{s.symbol}</div>
                    <div className="text-emerald-400 font-mono">{typeof s.currentPrice === "number" ? s.currentPrice.toFixed(5) : s.currentPrice}</div>
                  </div>
                ))}
                {symbolStates.length === 0 && <div className="text-xs text-slate-400">Loading symbols...</div>}
              </div>
            </div>
            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (5 cols): Control Panel, Metrics, Active Strategy */}
              <div className="lg:col-span-5 space-y-6 flex flex-col">
                <TradePanel
                  config={config}
                  aiStudyStatus={aiStudyStatus}
                  aiKnowledgeBase={aiKnowledgeBase}
                  aiSynthesizedStrategy={aiSynthesizedStrategy}
                  strategiesList={strategiesList}
                  onToggleTradingExecution={toggleTradingExecution}
                   onApplySettings={() => settings.applySettings(fetchStatus)}
                  selectedStrategy={config.selectedStrategy}
                />

                <StatsCards
                  stats={stats}
                  config={config}
                  onResetStats={resetStats}
                />

                <StrategyPanel
                  aiSynthesizedStrategy={aiSynthesizedStrategy}
                  aiKnowledgeBase={aiKnowledgeBase}
                />
              </div>

              {/* Right Column (7 cols): Interactive Live Candlestick & Telemetry Chart */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                <PriceChart
                  activeSymbol={activeSymbol}
                  currentPrice={currentPrice}
                  candleDataLength={chartData.candleData.length}
                  latency={latency}
                  showEma={showEma}
                  showBollingerBands={showBollingerBands}
                  chartData={chartData}
                  lastStrategySignal={lastStrategySignal}
                  selectedStrategy={config.selectedStrategy}
                  lastTick={lastTick}
                  onToggleEma={() => setShowEma(!showEma)}
                  onToggleBollingerBands={() => setShowBollingerBands(!showBollingerBands)}
                />
              </div>
            </div>

            {/* Bottom Row: Trades Table */}
            <TradeList
              tradesList={tradesList}
              currentPrice={currentPrice}
              selectedStrategy={config.selectedStrategy}
              onCloseAllPositions={closeAllPositions}
              onTradeClick={(trade) => setSelectedTradeForModal(trade)}
            />

            {/* Trade Detail Modal */}
            <Modal
              open={!!selectedTradeForModal}
              onClose={() => setSelectedTradeForModal(null)}
              title={
                <div className="flex items-center gap-2">
                  <span>Trade Ticket #{selectedTradeForModal?.ticket}</span>
                  {selectedTradeForModal && (
                    <Badge
                      variant={selectedTradeForModal.type === "BUY" ? "success" : "danger"}
                      size="sm"
                      dot
                    >
                      {selectedTradeForModal.type}
                    </Badge>
                  )}
                </div>
              }
              size="md"
            >
              {selectedTradeForModal && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Status</span>
                      <span className="font-bold text-white">{selectedTradeForModal.status}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Lot Size</span>
                      <span className="font-bold text-white tabular-nums">{selectedTradeForModal.lotSize}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Entry Price</span>
                      <span className="font-bold text-indigo-300 tabular-nums">{selectedTradeForModal.entryPrice.toFixed(2)}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">
                        {selectedTradeForModal.status === "OPEN" ? "Current Price" : "Close Price"}
                      </span>
                      <span className="font-bold text-slate-200 tabular-nums">
                        {(selectedTradeForModal.closePrice ?? currentPrice).toFixed(2)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Profit / Floating</span>
                      <span
                        className={`font-bold tabular-nums ${
                          (selectedTradeForModal.status === "OPEN"
                            ? (selectedTradeForModal.type === "BUY" ? currentPrice - selectedTradeForModal.entryPrice : selectedTradeForModal.entryPrice - currentPrice) * 10 * selectedTradeForModal.lotSize
                            : selectedTradeForModal.profit) >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        $
                        {(selectedTradeForModal.status === "OPEN"
                          ? (selectedTradeForModal.type === "BUY" ? currentPrice - selectedTradeForModal.entryPrice : selectedTradeForModal.entryPrice - currentPrice) * 10 * selectedTradeForModal.lotSize
                          : selectedTradeForModal.profit
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Open Time</span>
                      <span className="font-bold text-slate-300">{selectedTradeForModal.openTime}</span>
                    </div>
                  </div>

                  {selectedTradeForModal.strategy && (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                      <span className="text-slate-400 block text-[10px] uppercase font-mono mb-1">Strategy & Reason</span>
                      <p className="text-slate-200 font-sans text-xs">
                        <strong className="text-indigo-300 font-mono">{selectedTradeForModal.strategy}:</strong> {selectedTradeForModal.reason}
                      </p>
                    </div>
                  )}

                  <ModalFooter>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedTradeForModal(null)}
                    >
                      Close
                    </Button>
                  </ModalFooter>
                </div>
              )}
            </Modal>
          </div>
        )}

        {/* Knowledgebase */}
        {currentNavTab === "risk" && (
          <div className="space-y-6 animate-fade-in">
            <div className="card-panel">
              <h2 className="text-lg font-bold">Knowledgebase</h2>
              <p className="text-xs text-slate-400 mt-1">Strategies, indicators, patterns, and entry rules available in Cotrade.</p>
            </div>

            <div className="max-w-2xl mx-auto w-full">
              <KnowledgeBase strategiesList={strategiesList} />
            </div>

            {researchCatalog && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card-panel p-3">
                  <div className="text-sm font-bold mb-2">Indicators ({researchCatalog.indicators?.length ?? 0})</div>
                  <div className="text-xs text-slate-400 max-h-40 overflow-auto">
                    {(researchCatalog.indicators || []).map((i: any) => i.name).join(", ")}
                  </div>
                </div>
                <div className="card-panel p-3">
                  <div className="text-sm font-bold mb-2">Patterns ({researchCatalog.patterns?.length ?? 0})</div>
                  <div className="text-xs text-slate-400 max-h-40 overflow-auto">
                    {(researchCatalog.patterns || []).map((p: any) => p.name).join(", ")}
                  </div>
                </div>
                <div className="card-panel p-3">
                  <div className="text-sm font-bold mb-2">Entry Rules ({researchCatalog.entry_rules?.length ?? 0})</div>
                  <div className="text-xs text-slate-400 max-h-40 overflow-auto">
                    {(researchCatalog.entry_rules || []).map((e: any) => e.name).join(", ")}
                  </div>
                </div>
              </div>
            )}

            <div className="card-panel p-4">
              <h3 className="text-sm font-bold mb-2">Pattern Scan</h3>
              <div className="flex gap-2 flex-wrap">
                <input id="scan-symbol" defaultValue={activeSymbol} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs" placeholder="Symbol" />
                <select id="scan-tf" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs">
                  <option>M1</option><option>M5</option><option>M15</option><option>M30</option><option>H1</option>
                </select>
                <input id="scan-count" defaultValue="2000" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs w-20" placeholder="Count" />
                <button
                  className="px-3 py-1 bg-indigo-600 rounded text-xs text-white"
                  disabled={patternScanLoading}
                  onClick={() => {
                    const sym = (document.getElementById("scan-symbol") as HTMLInputElement)?.value || activeSymbol;
                    const tf = (document.getElementById("scan-tf") as HTMLSelectElement)?.value || "M15";
                    const cnt = parseInt((document.getElementById("scan-count") as HTMLInputElement)?.value || "2000");
                    runPatternScan(sym, tf, cnt);
                  }}
                >{patternScanLoading ? "Scanning..." : "Scan"}</button>
              </div>
              {patternScanResult && (
                <pre className="mt-3 text-xs bg-slate-900 p-2 rounded overflow-auto max-h-64">
                  {JSON.stringify(patternScanResult, null, 2).slice(0, 4000)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Symbols */}
        {currentNavTab === "symbols" && (
          <div className="space-y-6 animate-fade-in">
            <div className="card-panel p-3">
              <h2 className="text-lg font-bold">Symbols ({allSymbols.length})</h2>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[70vh] overflow-auto">
                {allSymbols.map((s: any) => {
                  const live = symbolStates.find((x: any) => x.symbol === s.name);
                  const price = live?.currentPrice ?? s.bid;
                  return (
                    <button
                      key={s.name}
                      className={`text-left rounded p-3 border ${selectedSymbol?.name === s.name ? "border-indigo-500 bg-indigo-950/30" : "border-slate-700 bg-slate-800 hover:bg-slate-750"}`}
                      onClick={() => { openSymbol(s.name); }}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-sm">{s.name}</span>
                        <span className="text-emerald-400 font-mono text-sm">{typeof price === "number" ? price.toFixed(5) : price}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <div><span className="text-slate-400">Bid:</span> <span className="font-mono">{s.bid ?? "-"}</span></div>
                        <div><span className="text-slate-400">Ask:</span> <span className="font-mono">{s.ask ?? "-"}</span></div>
                        <div><span className="text-slate-400">Spread:</span> <span className="font-mono">{s.spread ?? "-"}</span></div>
                        <div><span className="text-slate-400">Digits:</span> <span className="font-mono">{s.digits ?? "-"}</span></div>
                        <div><span className="text-slate-400">Contract:</span> <span className="font-mono">{s.trade_contract_size ?? "-"}</span></div>
                        <div><span className="text-slate-400">Swap L/S:</span> <span className="font-mono">{s.swap_long ?? "-"}/{s.swap_short ?? "-"}</span></div>
                      </div>
                    </button>
                  );
                })}
                {allSymbols.length === 0 && <div className="text-xs text-slate-400">Loading...</div>}
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {currentNavTab === "history" && (
          <div className="space-y-6 animate-fade-in">
            {historySummary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Deals", value: historySummary.deal_count },
                  { label: "Realized P/L", value: historySummary.realized_profit },
                  { label: "Commission", value: historySummary.commission },
                  { label: "Swap", value: historySummary.swap },
                  { label: "Net", value: historySummary.net },
                ].map((c) => (
                  <div key={c.label} className="card-panel p-3">
                    <div className="text-[10px] uppercase text-slate-400">{c.label}</div>
                    <div className="text-lg font-bold">{typeof c.value === "number" ? c.value.toFixed(2) : c.value}</div>
                  </div>
                ))}
              </div>
            )}
            <TradeList
              tradesList={tradesList}
              currentPrice={currentPrice}
              selectedStrategy={config.selectedStrategy}
              onCloseAllPositions={() => closeAllPositions()}
              onTradeClick={(trade) => setSelectedTradeForModal(trade)}
            />
          </div>
        )}

        {/* Bot & Database */}
        {currentNavTab === "bot" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-indigo-600 rounded text-xs text-white" onClick={fetchBotData}>Refresh</button>
            </div>
            {botStatus && (
              <div className="card-panel p-3">
                <div className="text-sm font-bold">Bot Status</div>
                <div className="text-xs text-slate-300 mt-1">status: {botStatus.status} | connected: {String(botStatus.connected_to_mt5)} | engine: {botStatus.engine}</div>
              </div>
            )}
            {botStrategies && (
              <div className="card-panel p-3">
                <div className="text-sm font-bold">Strategies (builtin {botStrategies.builtin_strategies?.length}, stored {botStrategies.stored_strategies?.length})</div>
                <div className="text-xs text-slate-400 mt-1 max-h-32 overflow-auto">{(botStrategies.stored_strategies || []).join(", ")}</div>
              </div>
            )}
            {botSessions.length > 0 && (
              <div className="card-panel p-3">
                <div className="text-sm font-bold mb-2">Sessions ({botSessions.length})</div>
                <div className="text-xs space-y-1 max-h-48 overflow-auto">
                  {botSessions.map((s: any) => (
                    <div key={s.session_id} className="flex justify-between border-b border-slate-800 py-1">
                      <span>{s.session_id} â€” {s.strategy_name} on {s.symbol}</span>
                      <span className="text-slate-400">{s.status} | trades {s.trades_count ?? 0} | pnl {s.pnl_pips ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dbStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(dbStats).filter(([k]) => k !== "path").map(([k, v]) => (
                  <div key={k} className="card-panel p-3">
                    <div className="text-[10px] uppercase text-slate-400">{k}</div>
                    <div className="text-lg font-bold">{String(v)}</div>
                  </div>
                ))}
              </div>
            )}
            {dbIntegrity && (
              <div className="card-panel p-3">
                <div className="text-sm font-bold">Integrity: {dbIntegrity.status}</div>
                <div className="text-xs text-slate-400">{dbIntegrity.path}</div>
                <button className="mt-2 px-3 py-1 bg-amber-600 rounded text-xs text-white" onClick={async () => { await vacuumDb(); fetchBotData(); }}>Vacuum DB</button>
              </div>
            )}
          </div>
        )}

        {/* About */}
        {currentNavTab === "about" && (
          <div className="space-y-6 animate-fade-in">
            <div className="card-panel">
              <h2 className="text-lg font-bold">About Cotrade</h2>
              <p className="text-sm text-slate-300 mt-2">
                Cotrade is a MetaTrader 5 gateway exposing a REST API, research lab, SSE streams, bot sessions, and an embedded SQLite database. It connects to MT5 through the official Python package (no EA required).
              </p>
              <p className="text-xs text-slate-400 mt-2">Health: <a href={`${import.meta.env.VITE_COTRADE_URL || "http://localhost:3000"}/health`} target="_blank" rel="noreferrer" className="text-indigo-400">/health</a></p>
            </div>
          </div>
        )}

        {/* Tab 4: System Logs */}
        {currentNavTab === "logs" && (
          <LogsViewer
            logs={logs}
            filterLogLevel={filterLogLevel}
            onFilterChange={setFilterLogLevel}
          />
        )}

        {/* Tab 5: Settings */}
        {currentNavTab === "settings" && (
          <div className="space-y-4">
            <div className="card-panel p-3">
              <div className="text-sm font-bold">Backend: Cotrade</div>
              <div className="text-xs text-slate-400 mt-1">Settings are stored locally (Cotrade has no settings store). Lot size / TP / SL inputs are applied to orders. Backend: {import.meta.env.VITE_COTRADE_URL}</div>
              {connection && (
                <div className="text-xs text-slate-300 mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Account: </span><span className="font-mono">{connection.accountNumber}</span></div>
                  <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Server: </span><span className="font-mono">{connection.broker}</span></div>
                  <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Balance: </span><span className="font-mono">{connection.balance}</span></div>
                  <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Currency: </span><span className="font-mono">{connection.currency ?? "USD"}</span></div>
                </div>
              )}
              {terminal && (
                <div className="text-xs text-slate-300 mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Terminal: </span><span className="font-mono">{terminal.name}</span></div>
                  <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Build: </span><span className="font-mono">{terminal.build}</span></div>
                  <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Path: </span><span className="font-mono">{terminal.path}</span></div>
                  <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Trade Allowed: </span><span className="font-mono">{String(terminal.trade_allowed)}</span></div>
                </div>
              )}
              {dbStats && <div className="text-xs text-slate-400 mt-2">DB: {dbStats.strategies} strategies, {dbStats.reports} reports, {dbStats.bot_sessions} bot sessions</div>}
            </div>
          <div className="card-panel p-4">
            <h3 className="text-sm font-bold mb-2">Order Calculator</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Symbol:</span> <span className="font-mono">{activeSymbol || "—"}</span></div>
              <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">Lot:</span> <span className="font-mono">{settings.paramInput.lotSize || "0.1"}</span></div>
              <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">TP (pts):</span> <span className="font-mono">{settings.paramInput.takeProfitPoints || "300"}</span></div>
              <div className="bg-slate-800 rounded px-2 py-1"><span className="text-slate-400">SL (pts):</span> <span className="font-mono">{settings.paramInput.stopLossPoints || "150"}</span></div>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">Use /calc/margin, /calc/profit, /calc/size on the backend for precise calculations.</div>
          </div>
          <SettingsForm
            config={config}
            paramInput={settings.paramInput}
            saveSuccess={settings.saveSuccess}
            webRequestStatus={settings.webRequestStatus}
            isVerifyingWebRequest={settings.isVerifyingWebRequest}
            copiedUrl={settings.copiedUrl}
            getAppBaseUrl={settings.getAppBaseUrl}
            onApplySettings={() => settings.applySettings(fetchStatus)}
            onSetParamInput={(patch) => settings.onParamInputChange(patch)}
            onTriggerWebRequestTest={settings.triggerWebRequestTest}
            onSetCopiedUrl={settings.setCopiedUrl}
          />
          </div>
        )}
      </main>

      {/* 4. Real-time Status Bar Footer */}
      <StatusBar
        isInternetOnline={isInternetOnline}
        latency={latency}
        elapsedTime={elapsedTime}
        activeSymbol={activeSymbol}
      />
      </div>
    </AppShell>
  );
}
