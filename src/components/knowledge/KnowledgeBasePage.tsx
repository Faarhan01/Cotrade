import React, { useState, useEffect } from 'react';
import {
  Compass,
  TrendingUp,
  Play,
  Plus,
  BookOpen,
  FlaskConical,
  Award,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit,
  Eye,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Tag,
  Shield,
  BarChart2,
  Search,
  Filter,
  Check,
  RefreshCw,
  Sliders,
  DollarSign,
  Calendar,
  Sparkles,
  Globe,
  Zap,
  Bot,
} from 'lucide-react';
import { api } from '../../services/api';
import { StrategyDefinition, Observation, BacktestResult, AppState } from '../../types';
import { SymbolIntelligenceTab } from './SymbolIntelligenceTab';
import { PatternRecognitionTab } from './PatternRecognitionTab';
import { MacroNewsTab } from './MacroNewsTab';
import { AiTelemetryTab } from './AiTelemetryTab';

interface KnowledgeBasePageProps {
  state?: AppState | null;
  onRefresh?: () => void;
  onNavigateToTab?: (tab: string, symbol?: string) => void;
}

export const KnowledgeBasePage: React.FC<KnowledgeBasePageProps> = ({ state, onRefresh, onNavigateToTab }) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'intelligence' | 'patterns' | 'strategies' | 'backtests' | 'news' | 'telemetry' | 'observations'
  >('intelligence');
  const [strategies, setStrategies] = useState<StrategyDefinition[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [backtests, setBacktests] = useState<BacktestResult[]>([]);
  const [builtinTemplates, setBuiltinTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyDefinition | null>(null);
  const [activeBacktestResult, setActiveBacktestResult] = useState<BacktestResult | null>(null);

  // Filter & Search
  const [strategySearch, setStrategySearch] = useState('');
  const [obsCategoryFilter, setObsCategoryFilter] = useState('all');

  // Modal / Form States
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [showObsModal, setShowObsModal] = useState(false);
  const [backtestingStrategyId, setBacktestingStrategyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const activeSym = state?.currentChart?.symbol || state?.allSymbols?.[0]?.symbol || 'EURUSD';
  const activeTf = state?.currentChart?.timeframe || 'M15';

  // Strategy Form
  const [stratForm, setStratForm] = useState<{
    id?: string;
    name: string;
    description: string;
    type: StrategyDefinition['type'];
    symbol: string;
    timeframe: string;
    rsiOversold: number;
    rsiOverbought: number;
    fastEmaPeriod: number;
    slowEmaPeriod: number;
    stopLossPoints: number;
    takeProfitPoints: number;
    lotSize: number;
    maxHoldBars: number;
    tags: string;
    notes: string;
    status: 'active' | 'draft' | 'archived';
  }>({
    name: '',
    description: '',
    type: 'ORDER_BLOCK_CONFLUENCE',
    symbol: activeSym,
    timeframe: activeTf,
    rsiOversold: 30,
    rsiOverbought: 70,
    fastEmaPeriod: 9,
    slowEmaPeriod: 21,
    stopLossPoints: 300,
    takeProfitPoints: 600,
    lotSize: 0.1,
    maxHoldBars: 50,
    tags: 'Institutional, FVG',
    notes: '',
    status: 'active',
  });

  // Observation Form
  const [obsForm, setObsForm] = useState<{
    title: string;
    content: string;
    symbol: string;
    timeframe: string;
    category: Observation['category'];
    tags: string;
  }>({
    title: '',
    content: '',
    symbol: activeSym,
    timeframe: activeTf,
    category: 'market_insight',
    tags: 'OrderFlow, Imbalance',
  });

  const [confirmingDeleteStrategyId, setConfirmingDeleteStrategyId] = useState<string | null>(null);
  const [confirmingDeleteObsId, setConfirmingDeleteObsId] = useState<string | null>(null);
  const [deployingStratId, setDeployingStratId] = useState<string | null>(null);

  const handleDeployStrategyToBot = async (strategy: StrategyDefinition) => {
    try {
      setDeployingStratId(strategy.id);
      let targetMode: 'SCALPER' | 'DAY_TRADES' | 'SWING_TRADES' | 'MIXED_OPTIONS' = 'DAY_TRADES';
      if (strategy.type === 'BOLLINGER_BREAKOUT' || strategy.timeframe === 'M1' || strategy.timeframe === 'M5') {
        targetMode = 'SCALPER';
      } else if (strategy.timeframe === 'H1' || strategy.timeframe === 'H4' || strategy.timeframe === 'D1') {
        targetMode = 'SWING_TRADES';
      } else if (strategy.type === 'ORDER_BLOCK_CONFLUENCE') {
        targetMode = 'MIXED_OPTIONS';
      }

      await api.updateBotConfig({
        mode: targetMode,
        symbols: [strategy.symbol],
        timeframe: strategy.timeframe,
        autoStopLoss: true,
        autoTakeProfit: true,
        trailingStop: true,
      });

      showNotification(`Strategy "${strategy.name}" deployed to Auto-Trader Bot for ${strategy.symbol} [${strategy.timeframe}].`);
      if (onNavigateToTab) {
        setTimeout(() => {
          onNavigateToTab('bot', strategy.symbol);
        }, 700);
      }
    } catch (err: any) {
      showNotification(`Failed to deploy strategy to bot: ${err?.message || err}`, 'error');
    } finally {
      setDeployingStratId(null);
    }
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [stratsRes, obsRes, btRes, tmplRes] = await Promise.all([
        api.getStrategies().catch(() => ({ strategies: [] })),
        api.getObservations().catch(() => ({ observations: [] })),
        api.getBacktestHistory().catch(() => ({ results: [] })),
        api.getKnowledgeTemplates().catch(() => ({ templates: [] })),
      ]);
      setStrategies(stratsRes.strategies || []);
      setObservations(obsRes.observations || []);
      setBacktests(btRes.results || []);
      if (tmplRes?.templates && tmplRes.templates.length > 0) {
        setBuiltinTemplates(tmplRes.templates);
      }

      if (stratsRes.strategies?.length > 0 && !selectedStrategy) {
        setSelectedStrategy(stratsRes.strategies[0]);
      }
    } catch (err: any) {
      console.error('Error loading knowledge base:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleSelectTemplate = (template: any) => {
    setStratForm({
      id: undefined,
      name: template.name || 'New Strategy',
      description: template.description || '',
      type: template.type || 'RSI_REVERSAL',
      symbol: template.symbol || 'EURUSD',
      timeframe: template.timeframe || 'M1',
      rsiOversold: template.parameters?.rsiOversold ?? 30,
      rsiOverbought: template.parameters?.rsiOverbought ?? 70,
      fastEmaPeriod: template.parameters?.fastEmaPeriod ?? 9,
      slowEmaPeriod: template.parameters?.slowEmaPeriod ?? 21,
      stopLossPoints: template.parameters?.stopLossPoints ?? 300,
      takeProfitPoints: template.parameters?.takeProfitPoints ?? 600,
      lotSize: template.parameters?.lotSize ?? 0.1,
      maxHoldBars: template.parameters?.maxHoldBars ?? 50,
      tags: Array.isArray(template.tags) ? template.tags.join(', ') : 'Template, AI',
      notes: template.notes || '',
      status: 'active',
    });
    setShowStrategyModal(true);
    setActiveSubTab('strategies');
    showNotification(`Loaded template "${template.name}" into strategy editor!`);
  };

  const handleApplyRiskParams = (params: any) => {
    if (params) {
      setStratForm((prev) => ({
        ...prev,
        stopLossPoints: params.stopLossPoints || prev.stopLossPoints,
        takeProfitPoints: params.takeProfitPoints || prev.takeProfitPoints,
        lotSize: params.lotSizeConservative || prev.lotSize,
        maxHoldBars: params.maxRecommendedHoldBars || prev.maxHoldBars,
      }));
      showNotification('Suggested risk & stop parameters applied!');
    }
  };

  const handleSaveStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: stratForm.name,
        description: stratForm.description,
        type: stratForm.type,
        symbol: stratForm.symbol.trim(),
        timeframe: stratForm.timeframe.trim(),
        status: stratForm.status,
        tags: stratForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: stratForm.notes,
        parameters: {
          rsiOversold: Number(stratForm.rsiOversold),
          rsiOverbought: Number(stratForm.rsiOverbought),
          fastEmaPeriod: Number(stratForm.fastEmaPeriod),
          slowEmaPeriod: Number(stratForm.slowEmaPeriod),
          stopLossPoints: Number(stratForm.stopLossPoints),
          takeProfitPoints: Number(stratForm.takeProfitPoints),
          lotSize: Number(stratForm.lotSize),
          maxHoldBars: Number(stratForm.maxHoldBars),
        },
      };
      if (stratForm.id) payload.id = stratForm.id;

      const res = await api.saveStrategy(payload);
      if (res.success) {
        showNotification(`Strategy "${res.strategy.name}" saved!`);
        setShowStrategyModal(false);
        await loadAllData();
        setSelectedStrategy(res.strategy);
      }
    } catch (err: any) {
      showNotification(`Failed to save: ${err.message}`, 'error');
    }
  };

  const handleDeleteStrategy = async (id: string, name: string) => {
    if (confirmingDeleteStrategyId !== id) {
      setConfirmingDeleteStrategyId(id);
      showNotification(`Click delete again to confirm removing strategy "${name}".`);
      setTimeout(() => setConfirmingDeleteStrategyId((curr) => (curr === id ? null : curr)), 5000);
      return;
    }
    setConfirmingDeleteStrategyId(null);
    try {
      await api.deleteStrategy(id);
      showNotification(`Strategy "${name}" deleted.`);
      if (selectedStrategy?.id === id) setSelectedStrategy(null);
      await loadAllData();
    } catch (err: any) {
      showNotification(`Delete failed: ${err.message}`, 'error');
    }
  };

  const handleRunBacktest = async (strategy: StrategyDefinition, knowledgeAssisted = true) => {
    try {
      setBacktestingStrategyId(strategy.id);
      let res;
      if (knowledgeAssisted) {
        res = await api.runKnowledgeBacktest(strategy.id, {
          candleLimit: 300,
          initialDeposit: 10000,
          enableNewsRiskFilter: true,
          enableRegimeFilter: true,
          enableNewsDirectionalFilter: true,
          newsHazardWindowBars: 4,
        });
      } else {
        res = await api.runBacktest(strategy.id, {
          candleLimit: 300,
          initialDeposit: 10000,
          useKnowledgeTools: false,
        });
      }
      if (res.success) {
        setActiveBacktestResult(res.result);
        setActiveSubTab('backtests');
        const modeLabel = knowledgeAssisted ? 'Knowledge-Assisted' : 'Baseline';
        showNotification(`${modeLabel} Backtest for "${strategy.name}" completed! Net Profit: $${res.result.netProfit}`);
        await loadAllData();
      }
    } catch (err: any) {
      showNotification(`Backtest error: ${err.message}`, 'error');
    } finally {
      setBacktestingStrategyId(null);
    }
  };

  const handleSaveObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        title: obsForm.title,
        content: obsForm.content,
        symbol: obsForm.symbol ? obsForm.symbol.trim() : null,
        timeframe: obsForm.timeframe ? obsForm.timeframe.trim() : null,
        category: obsForm.category,
        tags: obsForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      };
      const res = await api.saveObservation(payload);
      if (res.success) {
        showNotification(`Observation "${res.observation.title}" logged!`);
        setShowObsModal(false);
        setObsForm({
          title: '',
          content: '',
          symbol: 'EURUSD',
          timeframe: 'M1',
          category: 'market_insight',
          tags: '',
        });
        await loadAllData();
      }
    } catch (err: any) {
      showNotification(`Failed to log observation: ${err.message}`, 'error');
    }
  };

  const handleDeleteObservation = async (id: string, title: string) => {
    if (confirmingDeleteObsId !== id) {
      setConfirmingDeleteObsId(id);
      showNotification(`Click delete again to confirm removing observation "${title}".`);
      setTimeout(() => setConfirmingDeleteObsId((curr) => (curr === id ? null : curr)), 5000);
      return;
    }
    setConfirmingDeleteObsId(null);
    try {
      await api.deleteObservation(id);
      showNotification(`Observation deleted.`);
      await loadAllData();
    } catch (err: any) {
      showNotification(`Failed: ${err.message}`, 'error');
    }
  };

  const filteredStrategies = strategies.filter((s) => {
    if (strategySearch) {
      const q = strategySearch.toLowerCase();
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.symbol || '').toLowerCase().includes(q) ||
        (s.type || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredObservations = observations.filter((o) => {
    if (obsCategoryFilter !== 'all' && o.category !== obsCategoryFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/30 to-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Compass className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Knowledge Base, Strategy Lab & Backtesting Engine
              </h1>
            </div>
            <p className="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
              Design algorithmic rules, formulate market observations, and run simulated backtests against
              historical MT5 candles uploaded by the EA. The bridge acts purely as an execution engine — all
              strategy logic and intelligence lives on the site.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <button
              onClick={() => {
                setStratForm({
                  name: '',
                  description: '',
                  type: 'RSI_REVERSAL',
                  symbol: 'EURUSD',
                  timeframe: 'M1',
                  rsiOversold: 30,
                  rsiOverbought: 70,
                  fastEmaPeriod: 9,
                  slowEmaPeriod: 21,
                  stopLossPoints: 300,
                  takeProfitPoints: 600,
                  lotSize: 0.1,
                  maxHoldBars: 50,
                  tags: 'RSI, Reversal',
                  notes: '',
                  status: 'active',
                });
                setShowStrategyModal(true);
              }}
              className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-950/50"
            >
              <Plus className="h-4 w-4" />
              <span>Create Strategy</span>
            </button>

            <button
              onClick={() => setShowObsModal(true)}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              <span>Record Observation</span>
            </button>

            <button
              onClick={loadAllData}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Refresh Knowledge Base"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`mt-4 p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                : 'bg-rose-950/80 border border-rose-800 text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-xs sm:text-sm font-mono overflow-x-auto pb-1">
        <button
          onClick={() => setActiveSubTab('intelligence')}
          className={`pb-3 font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'intelligence'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Symbol Intelligence</span>
        </button>

        <button
          onClick={() => setActiveSubTab('patterns')}
          className={`pb-3 font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'patterns'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Pattern Scanner</span>
        </button>

        <button
          onClick={() => setActiveSubTab('strategies')}
          className={`pb-3 font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'strategies'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Strategy Lab ({strategies.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('backtests')}
          className={`pb-3 font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'backtests'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FlaskConical className="h-4 w-4" />
          <span>Backtest Results ({backtests.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('news')}
          className={`pb-3 font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'news'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe className="h-4 w-4" />
          <span>Macro News & Calendar</span>
        </button>

        <button
          onClick={() => setActiveSubTab('telemetry')}
          className={`pb-3 font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'telemetry'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="h-4 w-4" />
          <span>AI Speed Telemetry</span>
        </button>

        <button
          onClick={() => setActiveSubTab('observations')}
          className={`pb-3 font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'observations'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Research Notes ({observations.length})</span>
        </button>
      </div>

      {/* SUBTAB: INTELLIGENCE */}
      {activeSubTab === 'intelligence' && (
        <SymbolIntelligenceTab
          onSelectStrategyTemplate={handleSelectTemplate}
          onApplyRiskParams={handleApplyRiskParams}
        />
      )}

      {/* SUBTAB: PATTERNS */}
      {activeSubTab === 'patterns' && (
        <PatternRecognitionTab
          onApplyStrategyRule={(rule) => {
            setActiveSubTab('strategies');
          }}
        />
      )}

      {/* SUBTAB: MACRO NEWS */}
      {activeSubTab === 'news' && (
        <MacroNewsTab />
      )}

      {/* SUBTAB: AI TELEMETRY */}
      {activeSubTab === 'telemetry' && (
        <AiTelemetryTab />
      )}

      {/* SUBTAB: STRATEGIES */}
      {activeSubTab === 'strategies' && (
        <div className="space-y-4">
          {/* Quick-Load Built-in Strategy Templates */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 font-mono">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Compass className="h-3.5 w-3.5 text-cyan-400" />
                Battle-Tested KnowledgeBase Strategy Templates:
              </span>
              <span className="text-[11px] text-slate-500">1-Click Load into Editor</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {(builtinTemplates.length > 0
                ? builtinTemplates
                : [
                    {
                      name: 'Dual EMA 9/21 Trend Rider',
                      description: 'Fast trend riding system capturing multi-bar continuations when EMA 9 crosses EMA 21 with 2:1 reward.',
                      type: 'EMA_CROSSOVER',
                      symbol: 'EURUSD',
                      timeframe: 'M5',
                      parameters: { fastEmaPeriod: 9, slowEmaPeriod: 21, stopLossPoints: 300, takeProfitPoints: 600, lotSize: 0.1 },
                      tags: ['EMA', 'Trend', 'Forex'],
                    },
                    {
                      name: 'Bollinger Mean Reversion',
                      description: 'Enters counter-trend trades when price punctures outer 2-sigma band and begins reverting toward 20-SMA center.',
                      type: 'RSI_REVERSAL',
                      symbol: 'EURUSD',
                      timeframe: 'M1',
                      parameters: { rsiOversold: 28, rsiOverbought: 72, stopLossPoints: 250, takeProfitPoints: 500, lotSize: 0.1 },
                      tags: ['Bollinger', 'MeanReversion', 'Range'],
                    },
                    {
                      name: 'Donchian Channel Expansion',
                      description: 'Catches aggressive breakout momentum when Gold or high-beta symbols breach the 20-period price extreme with volume expansion.',
                      type: 'BOLLINGER_BREAKOUT',
                      symbol: 'XAUUSD',
                      timeframe: 'M15',
                      parameters: { stopLossPoints: 400, takeProfitPoints: 900, lotSize: 0.05 },
                      tags: ['Breakout', 'Gold', 'Expansion'],
                    },
                    {
                      name: 'Multi-Indicator Consensus Alpha',
                      description: 'Requires synchronous alignment between RSI momentum, MACD histogram positive slope, and EMA trend bias before emitting trade signal.',
                      type: 'MULTI_INDICATOR_CONSENSUS',
                      symbol: 'BTCUSD',
                      timeframe: 'M15',
                      parameters: { fastEmaPeriod: 9, slowEmaPeriod: 21, rsiPeriod: 14, stopLossPoints: 800, takeProfitPoints: 1800, lotSize: 0.05 },
                      tags: ['Consensus', 'MultiIndicator', 'Crypto'],
                    },
                  ]
              ).map((tmpl, tIdx) => {
                const borderColors = [
                  'hover:border-cyan-500/50 group-hover:text-cyan-300',
                  'hover:border-emerald-500/50 group-hover:text-emerald-300',
                  'hover:border-amber-500/50 group-hover:text-amber-300',
                  'hover:border-purple-500/50 group-hover:text-purple-300',
                ];
                const colorClass = borderColors[tIdx % borderColors.length];

                return (
                  <button
                    key={tmpl.id || tmpl.name || tIdx}
                    onClick={() => handleSelectTemplate(tmpl)}
                    className={`p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-left transition-all group ${colorClass.split(' ')[0]}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className={`text-xs font-bold text-white ${colorClass.split(' ')[1]}`}>
                        {tmpl.name}
                      </div>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                        {tmpl.symbol || 'EURUSD'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                      {tmpl.symbol || 'EURUSD'} · {tmpl.timeframe || 'M1'} · {tmpl.type}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                      {tmpl.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Strategy List */}
          <div className="lg:col-span-1 space-y-3 font-mono">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search strategies..."
                value={strategySearch}
                onChange={(e) => setStrategySearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
              {filteredStrategies.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                  No strategies found.
                </div>
              ) : (
                filteredStrategies.map((s) => {
                  const isSelected = selectedStrategy?.id === s.id;
                  const isBacktesting = backtestingStrategyId === s.id;

                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedStrategy(s)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-900/90 border-cyan-500/70 shadow-md shadow-cyan-950/40'
                          : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs text-white truncate">{s.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono shrink-0">
                          {s.symbol} {s.timeframe}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {s.description}
                      </p>

                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                          {s.type}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeployStrategyToBot(s);
                            }}
                            disabled={deployingStratId === s.id}
                            className="px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-bold flex items-center gap-1 transition-colors text-[10px]"
                            title="Deploy this strategy directly to Auto-Trader Bot"
                          >
                            <Bot className="h-2.5 w-2.5 text-emerald-400" />
                            <span>{deployingStratId === s.id ? 'Arming...' : 'Deploy'}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunBacktest(s);
                            }}
                            disabled={isBacktesting}
                            className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1 transition-colors"
                            title="Run Backtest on stored MT5 candles"
                          >
                            <Play className={`h-2.5 w-2.5 ${isBacktesting ? 'animate-spin' : ''}`} />
                            <span>{isBacktesting ? 'Testing...' : 'Test'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Detailed Strategy Inspector */}
          <div className="lg:col-span-2">
            {selectedStrategy ? (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5 font-mono">
                {/* Title & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">{selectedStrategy.name}</h2>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold uppercase">
                        {selectedStrategy.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Author: <span className="text-slate-200">{selectedStrategy.author || 'User'}</span> • Updated:{' '}
                      {new Date(selectedStrategy.updatedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleDeployStrategyToBot(selectedStrategy)}
                      disabled={deployingStratId === selectedStrategy.id}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/40"
                      title="Deploy this strategy directly to live Auto-Trader Bot"
                    >
                      <Bot className="h-3.5 w-3.5 text-emerald-100" />
                      <span>{deployingStratId === selectedStrategy.id ? 'Deploying...' : 'Deploy to Bot'}</span>
                    </button>

                    <button
                      onClick={() => handleRunBacktest(selectedStrategy, true)}
                      disabled={backtestingStrategyId === selectedStrategy.id}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-cyan-950/40"
                      title="Run backtest with KnowledgeBase news risk suppression and volatility guards"
                    >
                      <Zap className="h-3.5 w-3.5 text-cyan-200" />
                      <span>
                        {backtestingStrategyId === selectedStrategy.id ? 'Running Test...' : 'Knowledge Backtest'}
                      </span>
                    </button>

                    <button
                      onClick={() => handleRunBacktest(selectedStrategy, false)}
                      disabled={backtestingStrategyId === selectedStrategy.id}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
                      title="Run raw baseline strategy without knowledgebase filters"
                    >
                      <Play className="h-3.5 w-3.5 text-slate-400" />
                      <span>Baseline</span>
                    </button>

                    <button
                      onClick={() => {
                        setStratForm({
                          id: selectedStrategy.id,
                          name: selectedStrategy.name,
                          description: selectedStrategy.description,
                          type: selectedStrategy.type,
                          symbol: selectedStrategy.symbol,
                          timeframe: selectedStrategy.timeframe,
                          rsiOversold: selectedStrategy.parameters?.rsiOversold ?? 30,
                          rsiOverbought: selectedStrategy.parameters?.rsiOverbought ?? 70,
                          fastEmaPeriod: selectedStrategy.parameters?.fastEmaPeriod ?? 9,
                          slowEmaPeriod: selectedStrategy.parameters?.slowEmaPeriod ?? 21,
                          stopLossPoints: selectedStrategy.parameters?.stopLossPoints ?? 300,
                          takeProfitPoints: selectedStrategy.parameters?.takeProfitPoints ?? 600,
                          lotSize: selectedStrategy.parameters?.lotSize ?? 0.1,
                          maxHoldBars: selectedStrategy.parameters?.maxHoldBars ?? 50,
                          tags: (selectedStrategy.tags || []).join(', '),
                          notes: selectedStrategy.notes || '',
                          status: (selectedStrategy.status as any) || 'active',
                        });
                        setShowStrategyModal(true);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="Edit Strategy"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteStrategy(selectedStrategy.id, selectedStrategy.name)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition-colors"
                      title="Delete Strategy"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Description & Thesis */}
                <div>
                  <h3 className="text-xs uppercase text-slate-400 font-bold mb-1">Thesis & Mechanics</h3>
                  <p className="text-xs text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800/80 leading-relaxed font-sans">
                    {selectedStrategy.description}
                  </p>
                </div>

                {/* Parameters Matrix */}
                <div>
                  <h3 className="text-xs uppercase text-slate-400 font-bold mb-2">Algorithm Parameters</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Symbol / TF</span>
                      <span className="font-bold text-cyan-300 mt-0.5 block">
                        {selectedStrategy.symbol} • {selectedStrategy.timeframe}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">SL / TP Points</span>
                      <span className="font-bold text-amber-300 mt-0.5 block">
                        {selectedStrategy.parameters?.stopLossPoints || 300} /{' '}
                        {selectedStrategy.parameters?.takeProfitPoints || 600}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Lot Size</span>
                      <span className="font-bold text-white mt-0.5 block">
                        {selectedStrategy.parameters?.lotSize || 0.1} lots
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Max Bar Hold</span>
                      <span className="font-bold text-slate-300 mt-0.5 block">
                        {selectedStrategy.parameters?.maxHoldBars || 50} bars
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tags & Research Notes */}
                {selectedStrategy.tags && selectedStrategy.tags.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase text-slate-400 font-bold mb-1.5">Classification Tags</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStrategy.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedStrategy.notes && (
                  <div>
                    <h3 className="text-xs uppercase text-slate-400 font-bold mb-1">Execution Notes</h3>
                    <p className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 leading-relaxed font-sans">
                      {selectedStrategy.notes}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-xl p-12 text-center text-slate-500 font-mono text-xs">
                Select a strategy on the left or create a new one to inspect its parameters.
              </div>
            )}
          </div>
        </div>
      </div>
    )}

      {/* SUBTAB 2: BACKTEST RESULTS */}
      {activeSubTab === 'backtests' && (
        <div className="space-y-6 font-mono">
          {activeBacktestResult ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-6">
              {/* Backtest Header Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <Award className="h-4 w-4" />
                    </span>
                    <h2 className="text-base font-bold text-white">
                      Backtest Report: {activeBacktestResult.strategyName}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Evaluated across {activeBacktestResult.candleCount} candles ({activeBacktestResult.symbol}{' '}
                    {activeBacktestResult.timeframe}) • {new Date(activeBacktestResult.evaluatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-lg font-extrabold ${
                      activeBacktestResult.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {activeBacktestResult.netProfit >= 0 ? '+' : ''}${activeBacktestResult.netProfit.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400">Net Profit</span>
                </div>
              </div>

              {/* Core Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Win Rate</span>
                  <span
                    className={`text-base font-bold mt-1 block ${
                      activeBacktestResult.winRatePct >= 50 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {activeBacktestResult.winRatePct}%
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {activeBacktestResult.winningTrades}W / {activeBacktestResult.losingTrades}L
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Profit Factor</span>
                  <span className="text-base font-bold text-white mt-1 block">
                    {activeBacktestResult.profitFactor}
                  </span>
                  <span className="text-[10px] text-slate-500">Gross Gain / Loss</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Total Trades</span>
                  <span className="text-base font-bold text-cyan-300 mt-1 block">
                    {activeBacktestResult.totalTrades}
                  </span>
                  <span className="text-[10px] text-slate-500">Completed Orders</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Max Drawdown</span>
                  <span className="text-base font-bold text-rose-400 mt-1 block">
                    {activeBacktestResult.maxDrawdownPct}%
                  </span>
                  <span className="text-[10px] text-slate-500">
                    -${activeBacktestResult.maxDrawdownUsd.toFixed(1)}
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Avg Win / Loss</span>
                  <span className="text-base font-bold text-slate-200 mt-1 block">
                    ${activeBacktestResult.averageWin} / -${activeBacktestResult.averageLoss}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    R:R {activeBacktestResult.riskRewardRatio}
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Final Equity</span>
                  <span className="text-base font-bold text-emerald-400 mt-1 block">
                    ${activeBacktestResult.finalEquity.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    From ${activeBacktestResult.initialDeposit}
                  </span>
                </div>
              </div>

              {/* KNOWLEDGEBASE EDGE PROOF SUMMARY (When Knowledge-Assisted) */}
              {(activeBacktestResult.knowledgeAssisted || activeBacktestResult.comparison) && (
                <div className="bg-gradient-to-br from-cyan-950/40 via-slate-900 to-blue-950/30 border border-cyan-800/60 rounded-xl p-5 shadow-lg space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-cyan-800/40">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white tracking-tight">
                            KnowledgeBase Empirical Edge Proof
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 font-extrabold uppercase">
                            News Hazard Guard Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5 font-sans">
                          {activeBacktestResult.proofSummary ||
                            'Comparing baseline indicator signals against KnowledgeBase news hazard window and volatility suppression.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {activeBacktestResult.comparison && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {/* Win Rate Delta */}
                      <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                          Win Rate Shift
                        </span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-base font-extrabold text-white">
                            {activeBacktestResult.comparison.knowledgeWinRatePct ?? activeBacktestResult.winRatePct}%
                          </span>
                          <span className="text-xs text-slate-500 line-through">
                            {activeBacktestResult.comparison.baselineWinRatePct}%
                          </span>
                        </div>
                        <span
                          className={`text-xs font-bold block mt-0.5 ${
                            activeBacktestResult.comparison.deltaWinRatePct >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {activeBacktestResult.comparison.deltaWinRatePct >= 0 ? '+' : ''}
                          {activeBacktestResult.comparison.deltaWinRatePct}% Delta
                        </span>
                      </div>

                      {/* Profit Factor Shift */}
                      <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                          Profit Factor
                        </span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-base font-extrabold text-white">
                            {activeBacktestResult.comparison.knowledgeProfitFactor ?? activeBacktestResult.profitFactor}
                          </span>
                          <span className="text-xs text-slate-500 line-through">
                            {activeBacktestResult.comparison.baselineProfitFactor}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-bold block mt-0.5 ${
                            activeBacktestResult.comparison.deltaProfitFactor >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {activeBacktestResult.comparison.deltaProfitFactor >= 0 ? '+' : ''}
                          {activeBacktestResult.comparison.deltaProfitFactor} PF
                        </span>
                      </div>

                      {/* Drawdown Reduction */}
                      <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                          Max Drawdown
                        </span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-base font-extrabold text-cyan-300">
                            {activeBacktestResult.comparison.knowledgeDrawdownPct ?? activeBacktestResult.maxDrawdownPct}%
                          </span>
                          <span className="text-xs text-slate-500 line-through">
                            {activeBacktestResult.comparison.baselineDrawdownPct ?? activeBacktestResult.comparison.baselineMaxDrawdownPct}%
                          </span>
                        </div>
                        <span className="text-xs font-bold text-emerald-400 block mt-0.5">
                          -{activeBacktestResult.comparison.drawdownReductionPct}% Cut
                        </span>
                      </div>

                      {/* High-Risk Trades Avoided */}
                      <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                          Spike Setups Avoided
                        </span>
                        <span className="text-base font-extrabold text-amber-300 mt-1 block">
                          {activeBacktestResult.tradesAvoidedDueToNews ??
                            activeBacktestResult.comparison.tradesAvoidedDueToNews ??
                            0}{' '}
                          Trades
                        </span>
                        <span className="text-[10px] text-slate-500 font-sans">
                          Whipsaws / slippage shielded
                        </span>
                      </div>

                      {/* Capital Preserved */}
                      <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                          Capital Preserved
                        </span>
                        <span className="text-base font-extrabold text-emerald-400 mt-1 block">
                          +$
                          {(
                            activeBacktestResult.lossesPreventedUsd ??
                            activeBacktestResult.comparison.lossesPreventedUsd ??
                            0
                          ).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-sans">
                          Stopouts prevented
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CAUGHT NEWS EVENTS & VOLATILITY SPIKES TABLE */}
              {Boolean(
                (activeBacktestResult.caughtNewsEvents && activeBacktestResult.caughtNewsEvents.length > 0) ||
                (activeBacktestResult.caughtNews && activeBacktestResult.caughtNews.length > 0)
              ) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        High-Impact News Events Caught & Greatly Affecting {activeBacktestResult.symbol} (
                        {(activeBacktestResult.caughtNewsEvents || activeBacktestResult.caughtNews || []).length})
                      </h3>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Displacement & ATR multipliers calculated against real candle bars
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">Catalyst Event</th>
                          <th className="py-2.5 px-3">Currency</th>
                          <th className="py-2.5 px-3">Release Time</th>
                          <th className="py-2.5 px-3">Pip Move</th>
                          <th className="py-2.5 px-3">Vol Multiplier</th>
                          <th className="py-2.5 px-3">Whipsaw?</th>
                          <th className="py-2.5 px-3">KnowledgeBase Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                        {((activeBacktestResult.caughtNewsEvents || activeBacktestResult.caughtNews || []) as any[]).map((cn: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3">
                              <span className="font-bold text-slate-100 block">{cn.title || cn.event?.title}</span>
                              <span className="text-[10px] text-slate-400 block font-sans">
                                {cn.tacticalPrecaution || cn.explanation}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold text-[10px] border border-slate-700">
                                {cn.currencyOrAsset || cn.event?.currency}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-400 text-[11px]">
                              {cn.candleTimeIso || cn.candleTimeStr || new Date(cn.candleTime * 1000).toLocaleTimeString()}
                            </td>
                            <td className="py-2 px-3 font-bold text-amber-300">
                              {(cn.pipDisplacement || 0).toFixed(1)} pips
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  (cn.volatilityMultiplier || 1) >= 2.5
                                    ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}
                              >
                                {(cn.volatilityMultiplier || 1).toFixed(2)}x ATR
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              {cn.whipsawTrapDetected || cn.isWhipsaw ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-semibold">
                                  Whipsaw Liquidation
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  Impulse
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                                {cn.actionTaken || 'Suppressed Entry'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Simulated Trades Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Simulated Trade Execution Logs ({activeBacktestResult.trades?.length || 0})
                </h3>
                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Trade ID</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Entry Price</th>
                        <th className="py-2.5 px-3">Exit Price</th>
                        <th className="py-2.5 px-3">Profit (USD)</th>
                        <th className="py-2.5 px-3">Points</th>
                        <th className="py-2.5 px-3">Exit Reason</th>
                        <th className="py-2.5 px-3 text-right">Exit Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {activeBacktestResult.trades?.map((trd) => {
                        const isWin = trd.profitUsd >= 0;
                        return (
                          <tr key={trd.id} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 text-slate-400">{trd.id}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  trd.type === 'BUY'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                                }`}
                              >
                                {trd.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-200">{trd.entryPrice}</td>
                            <td className="py-2 px-3 font-semibold text-slate-200">{trd.exitPrice}</td>
                            <td
                              className={`py-2 px-3 font-bold ${
                                isWin ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isWin ? '+' : ''}${trd.profitUsd.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-slate-300">{trd.profitPoints} pts</td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                                {trd.exitReason}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-slate-500">
                              {new Date(trd.exitTime * 1000).toLocaleTimeString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-xl p-10 text-center text-slate-500 font-mono text-xs">
              <FlaskConical className="h-6 w-6 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 font-bold">No active backtest report selected.</p>
              <p className="mt-1">
                Go to the Strategies tab and click "Run Backtest" or pick an archived run below.
              </p>
            </div>
          )}

          {/* Archived Backtest Runs */}
          {backtests.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Archived Backtest Runs in SQLite ({backtests.length})
              </h3>
              <div className="divide-y divide-slate-800/60">
                {backtests.map((bt) => (
                  <div
                    key={bt.id}
                    onClick={() => setActiveBacktestResult(bt)}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-800/40 px-2 rounded-lg cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">{bt.strategyName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-300">
                          {bt.symbol} {bt.timeframe}
                        </span>
                        {bt.knowledgeAssisted && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-extrabold">
                            KB GUARD
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        {new Date(bt.evaluatedAt).toLocaleString()} • {bt.totalTrades} trades • {bt.winRatePct}% win rate
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-bold text-sm block ${
                          bt.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {bt.netProfit >= 0 ? '+' : ''}${bt.netProfit.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-500">PF: {bt.profitFactor}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: OBSERVATIONS */}
      {activeSubTab === 'observations' && (
        <div className="space-y-4 font-mono">
          {/* Category Filter */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Filter Category:</span>
              {(['all', 'market_insight', 'pattern', 'execution_note', 'anomaly', 'research'] as const).map(
                (cat) => (
                  <button
                    key={cat}
                    onClick={() => setObsCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors ${
                      obsCategoryFilter === cat
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                )
              )}
            </div>

            <button
              onClick={() => setShowObsModal(true)}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Observation</span>
            </button>
          </div>

          {/* Observations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredObservations.length === 0 ? (
              <div className="col-span-2 p-10 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                No observations found in this category.
              </div>
            ) : (
              filteredObservations.map((obs) => (
                <div
                  key={obs.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                          <BookOpen className="h-3.5 w-3.5" />
                        </span>
                        <h3 className="font-bold text-xs text-white leading-snug">{obs.title}</h3>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 capitalize shrink-0">
                        {(obs.category || '').replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mt-2.5 leading-relaxed font-sans bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
                      {obs.content}
                    </p>

                    {obs.metrics && Object.keys(obs.metrics).length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2 text-[10px]">
                        {Object.entries(obs.metrics).map(([k, v]) => (
                          <span
                            key={k}
                            className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/80"
                          >
                            {k}: <strong className="text-white">{String(v)}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-800 text-[10px] text-slate-500">
                    <span>
                      {obs.symbol ? `${obs.symbol} • ` : ''}
                      {new Date(obs.createdAt).toLocaleDateString()}
                    </span>

                    <button
                      onClick={() => handleDeleteObservation(obs.id, obs.title)}
                      className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                      title="Delete observation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT STRATEGY */}
      {showStrategyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 font-mono text-xs space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {stratForm.id ? 'Edit Trading Strategy' : 'Create New Trading Strategy'}
              </h2>
              <button
                onClick={() => setShowStrategyModal(false)}
                className="text-slate-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStrategy} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Strategy Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RSI Mean Reversion Scalp"
                  value={stratForm.name}
                  onChange={(e) => setStratForm({ ...stratForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Thesis & Rules</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe when the strategy enters and exits..."
                  value={stratForm.description}
                  onChange={(e) => setStratForm({ ...stratForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Strategy Type</label>
                  <select
                    value={stratForm.type}
                    onChange={(e) => setStratForm({ ...stratForm, type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="RSI_REVERSAL">RSI Reversal</option>
                    <option value="EMA_CROSSOVER">EMA Crossover</option>
                    <option value="MACD_MOMENTUM">MACD Momentum</option>
                    <option value="BOLLINGER_BREAKOUT">Bollinger Bands</option>
                    <option value="MULTI_INDICATOR_CONSENSUS">Multi-Indicator</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Target Symbol</label>
                  <input
                    type="text"
                    required
                    value={stratForm.symbol}
                    onChange={(e) => setStratForm({ ...stratForm, symbol: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white uppercase focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Timeframe</label>
                  <select
                    value={stratForm.timeframe}
                    onChange={(e) => setStratForm({ ...stratForm, timeframe: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="M1">M1</option>
                    <option value="M5">M5</option>
                    <option value="M15">M15</option>
                    <option value="H1">H1</option>
                    <option value="D1">D1</option>
                  </select>
                </div>
              </div>

              {/* Parameter Settings */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                <span className="text-[10px] uppercase text-cyan-400 font-bold block">
                  Algorithm & Risk Parameters
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">RSI Oversold</label>
                    <input
                      type="number"
                      value={stratForm.rsiOversold}
                      onChange={(e) => setStratForm({ ...stratForm, rsiOversold: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">RSI Overbought</label>
                    <input
                      type="number"
                      value={stratForm.rsiOverbought}
                      onChange={(e) => setStratForm({ ...stratForm, rsiOverbought: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">Fast EMA (9)</label>
                    <input
                      type="number"
                      value={stratForm.fastEmaPeriod}
                      onChange={(e) => setStratForm({ ...stratForm, fastEmaPeriod: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">Slow EMA (21)</label>
                    <input
                      type="number"
                      value={stratForm.slowEmaPeriod}
                      onChange={(e) => setStratForm({ ...stratForm, slowEmaPeriod: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">SL (Points)</label>
                    <input
                      type="number"
                      value={stratForm.stopLossPoints}
                      onChange={(e) => setStratForm({ ...stratForm, stopLossPoints: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">TP (Points)</label>
                    <input
                      type="number"
                      value={stratForm.takeProfitPoints}
                      onChange={(e) => setStratForm({ ...stratForm, takeProfitPoints: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">Lot Size</label>
                    <input
                      type="number"
                      step="0.01"
                      value={stratForm.lotSize}
                      onChange={(e) => setStratForm({ ...stratForm, lotSize: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">Max Hold Bars</label>
                    <input
                      type="number"
                      value={stratForm.maxHoldBars}
                      onChange={(e) => setStratForm({ ...stratForm, maxHoldBars: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  placeholder="RSI, Reversal, Forex"
                  value={stratForm.tags}
                  onChange={(e) => setStratForm({ ...stratForm, tags: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStrategyModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                >
                  Save Strategy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LOG OBSERVATION */}
      {showObsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 font-mono text-xs space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Record Market Observation / Insight
              </h2>
              <button onClick={() => setShowObsModal(false)} className="text-slate-500 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveObservation} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Headline / Pattern</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. London Open EURUSD False Breakout"
                  value={obsForm.title}
                  onChange={(e) => setObsForm({ ...obsForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Notes & Empirical Finding</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Document observations, slippage patterns, session dynamics..."
                  value={obsForm.content}
                  onChange={(e) => setObsForm({ ...obsForm, content: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Category</label>
                  <select
                    value={obsForm.category}
                    onChange={(e) => setObsForm({ ...obsForm, category: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="market_insight">Market Insight</option>
                    <option value="pattern">Pattern</option>
                    <option value="execution_note">Execution Note</option>
                    <option value="anomaly">Anomaly</option>
                    <option value="research">Research</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Symbol</label>
                  <input
                    type="text"
                    value={obsForm.symbol}
                    onChange={(e) => setObsForm({ ...obsForm, symbol: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white uppercase focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Timeframe</label>
                  <input
                    type="text"
                    value={obsForm.timeframe}
                    onChange={(e) => setObsForm({ ...obsForm, timeframe: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white uppercase focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Tags</label>
                <input
                  type="text"
                  placeholder="LondonOpen, Spread, Volatility"
                  value={obsForm.tags}
                  onChange={(e) => setObsForm({ ...obsForm, tags: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowObsModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                >
                  Log Observation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
