import React, { useState } from 'react';
import { AppState } from '../types';
import { EaConnectionRadar } from '../components/dashboard/EaConnectionRadar';
import { CurrentChartSymbolCard } from '../components/dashboard/CurrentChartSymbolCard';
import { AccountMetricsBar } from '../components/dashboard/AccountMetricsBar';
import { LiveTickStream } from '../components/dashboard/LiveTickStream';
import { LivePriceChart } from '../components/dashboard/LivePriceChart';
import { OrderExecutionDock } from '../components/dashboard/OrderExecutionDock';
import { OpenPositionsTable } from '../components/dashboard/OpenPositionsTable';
import { AllTrackedSymbolsTable } from '../components/dashboard/AllTrackedSymbolsTable';
import { DashboardBotWidget } from '../components/dashboard/DashboardBotWidget';

interface DashboardPageProps {
  state: AppState | null;
  onRefresh?: () => void;
  onNavigateToTab?: (tab: string, symbol?: string) => void;
  initialSymbol?: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ state, onRefresh, onNavigateToTab, initialSymbol }) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || 'EURUSD');

  React.useEffect(() => {
    if (initialSymbol) {
      setSelectedSymbol(initialSymbol);
    }
  }, [initialSymbol]);

  const ticks = state?.ticks || [];
  const currentTick = ticks.find((t) => t.symbol === selectedSymbol) || ticks[0];
  const history = (state?.tickHistory && state.tickHistory[selectedSymbol]) || [];
  const positions = state?.positions || [];
  const pendingOrders = state?.pendingOrders || [];
  const account = state?.account || null;
  const riskGuard = state?.riskGuard || null;
  const currentChart = state?.currentChart || null;
  const allSymbols = state?.allSymbols || [];

  return (
    <div className="space-y-6">
      {/* 1. Real-Time EA Connection Detector */}
      <EaConnectionRadar state={state} onRefresh={onRefresh} />

      {/* 2. Account High-Level Metrics */}
      <AccountMetricsBar account={account} />

      {/* 2b. Auto-Trader Physical Bot Status & Quick Controls */}
      <DashboardBotWidget onNavigateToBot={() => onNavigateToTab?.('bot')} />

      {/* 3. Section for Current Symbol (EA Connected Chart) */}
      <CurrentChartSymbolCard
        currentChart={currentChart}
        chartDiagnostics={state?.chartDiagnostics}
        terminalPermissions={state?.terminalPermissions}
        onSelectSymbol={setSelectedSymbol}
        onRefresh={onRefresh}
      />

      {/* 4. Real-Time Tick Stream Bar */}
      <LiveTickStream
        ticks={ticks}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={setSelectedSymbol}
      />

      {/* 5. Main Operational Grid: Live Chart + Async Order Pad */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <LivePriceChart
            symbol={selectedSymbol}
            history={history}
            candles={state?.chartHistory}
            indicators={state?.indicators}
            chartDiagnostics={state?.chartDiagnostics}
            currentTick={currentTick}
            positions={positions}
            currentTimeframe={state?.currentChart?.timeframe || 'M1'}
            onRefresh={onRefresh}
          />
        </div>
        <div className="lg:col-span-4">
          <OrderExecutionDock
            selectedSymbol={selectedSymbol}
            ticks={ticks}
            symbols={allSymbols}
            riskGuard={riskGuard}
            account={account}
            symbolInfo={allSymbols.find((s) => s.symbol === selectedSymbol) || currentChart}
            onSelectSymbol={setSelectedSymbol}
          />
        </div>
      </div>

      {/* 6. Active MT5 Open Positions & Pending Orders */}
      <OpenPositionsTable
        positions={positions}
        pendingOrders={pendingOrders}
        onSelectSymbol={setSelectedSymbol}
      />

      {/* 7. Section for All Tracked Symbols Sent By MT5 EA */}
      <AllTrackedSymbolsTable
        symbols={allSymbols}
        ticks={ticks}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={setSelectedSymbol}
        onViewAllSymbolsPage={() => onNavigateToTab?.('symbols')}
      />
    </div>
  );
};

