import React, { useState, lazy, Suspense } from 'react';
import { useBridgeData } from './services/websocket';
import { Navbar } from './components/layout/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Activity, ShieldCheck, Terminal, Cpu } from 'lucide-react';

// Heavy panels are lazy-loaded so the initial bundle stays small and the
// dashboard paints quickly. Each is wrapped in a Suspense boundary below.
const McpConsole = lazy(() => import('./components/mcp/McpConsole').then((m) => ({ default: m.McpConsole })));
const RiskManagementPage = lazy(() => import('./pages/RiskManagementPage').then((m) => ({ default: m.RiskManagementPage })));
const EaSetupGuide = lazy(() => import('./components/ea/EaSetupGuide').then((m) => ({ default: m.EaSetupGuide })));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const DatabaseExplorer = lazy(() => import('./components/database/DatabaseExplorer').then((m) => ({ default: m.DatabaseExplorer })));
const KnowledgeBasePage = lazy(() => import('./components/knowledge/KnowledgeBasePage').then((m) => ({ default: m.KnowledgeBasePage })));
const BotTradingPage = lazy(() => import('./pages/BotTradingPage').then((m) => ({ default: m.BotTradingPage })));
const AllSymbolsPage = lazy(() => import('./pages/AllSymbolsPage').then((m) => ({ default: m.AllSymbolsPage })));
const BacktestPage = lazy(() => import('./pages/BacktestPage').then((m) => ({ default: m.BacktestPage })));

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EURUSD');
  const { state, wsStatus, lastPingMs, reloadState } = useBridgeData();

  const handleNavigateToTab = (tab: string, symbol?: string) => {
    if (symbol) {
      setSelectedSymbol(symbol);
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        state={state}
        wsStatus={wsStatus}
        lastPingMs={lastPingMs}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20 text-slate-400">
                <div className="h-6 w-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-sm font-mono">Loading…</span>
              </div>
            }
          >
            {activeTab === 'dashboard' && (
              <DashboardPage
                state={state}
                initialSymbol={selectedSymbol}
                onRefresh={reloadState}
                onNavigateToTab={handleNavigateToTab}
              />
            )}
            {activeTab === 'symbols' && (
              <AllSymbolsPage
                state={state}
                onRefresh={reloadState}
                onNavigateToTab={handleNavigateToTab}
              />
            )}
            {activeTab === 'bot' && (
              <BotTradingPage
                state={state}
                onRefresh={reloadState}
                onNavigateToTab={handleNavigateToTab}
              />
            )}
            {activeTab === 'backtest' && <BacktestPage state={state} onNavigateToTab={handleNavigateToTab} />}
            {(activeTab === 'knowledgebase' || activeTab === 'strategies') && (
              <KnowledgeBasePage
                state={state}
                onRefresh={reloadState}
                onNavigateToTab={handleNavigateToTab}
              />
            )}
            {activeTab === 'mcp' && <McpConsole />}
            {activeTab === 'risk' && <RiskManagementPage state={state} />}
            {activeTab === 'database' && (
              <DatabaseExplorer
                state={state}
                onNavigateToTab={handleNavigateToTab}
              />
            )}
            {activeTab === 'ea' && <EaSetupGuide />}
            {activeTab === 'logs' && <AuditLogPage state={state} />}
            {!['dashboard', 'symbols', 'bot', 'backtest', 'knowledgebase', 'strategies', 'mcp', 'risk', 'database', 'ea', 'logs'].includes(activeTab) && (
              <div className="text-center py-20 text-slate-400">
                <p className="text-lg font-bold text-white mb-2">Page not found</p>
                <p className="text-sm">The requested view does not exist.</p>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className="mt-4 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold uppercase tracking-wider"
                >
                  Go to Dashboard
                </button>
              </div>
            )}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400"></span>
            <span>MT5 Bridge Tunnel: <code className="text-slate-400">http://127.0.0.1:7777</code></span>
            <span>•</span>
            <span>EA File: <code className="text-slate-400">backend/ea/AIMT5Bridge.mq5</code></span>
          </div>

          <div className="flex items-center gap-4">
            <span>Protocol: MCP 2024-11-05</span>
            <span>•</span>
            <button
              onClick={() => setActiveTab('ea')}
              className="text-cyan-400 hover:underline"
            >
              EA Configuration Guide
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
