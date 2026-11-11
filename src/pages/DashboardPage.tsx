import React, { useState, useEffect } from 'react';
import { AppState } from '../types';
import { EaConnectionRadar } from '../components/dashboard/EaConnectionRadar';
import { AccountMetricsBar } from '../components/dashboard/AccountMetricsBar';
import { LivePriceChart } from '../components/dashboard/LivePriceChart';
import { OrderExecutionDock } from '../components/dashboard/OrderExecutionDock';
import { OpenPositionsTable } from '../components/dashboard/OpenPositionsTable';
import { AllTrackedSymbolsTable } from '../components/dashboard/AllTrackedSymbolsTable';
import { DashboardBotWidget } from '../components/dashboard/DashboardBotWidget';
import { ForexMarketSessions } from '../components/dashboard/ForexMarketSessions';

interface DashboardPageProps {
  state: AppState | null;
  onRefresh?: () => void;
  onNavigateToTab?: (tab: string, symbol?: string) => void;
  initialSymbol?: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ state, onRefresh, onNavigateToTab, initialSymbol }) => {
  // Dynamically resolve symbol: prioritize initialSymbol, then current EA chart symbol, then first tracked symbol, or empty
  const defaultSymbol = initialSymbol || state?.currentChart?.symbol || state?.allSymbols?.[0]?.symbol || state?.ticks?.[0]?.symbol || '';
  const [selectedSymbol, setSelectedSymbol] = useState<string>(defaultSymbol);

  useEffect(() => {
    if (initialSymbol) {
      setSelectedSymbol(initialSymbol);
    } else if (!selectedSymbol) {
      if (state?.currentChart?.symbol) {
        setSelectedSymbol(state.currentChart.symbol);
      } else if (state?.allSymbols && state.allSymbols.length > 0) {
        setSelectedSymbol(state.allSymbols[0].symbol);
      } else if (state?.ticks && state.ticks.length > 0) {
        setSelectedSymbol(state.ticks[0].symbol);
      }
    }
  }, [initialSymbol, state?.currentChart?.symbol, state?.allSymbols, state?.ticks, selectedSymbol]);

  const ticks = state?.ticks || [];
  const currentTick = ticks.find((t) => t.symbol.toUpperCase() === selectedSymbol.toUpperCase()) || ticks[0];
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

      {/* 3. Auto-Trader Physical Bot Status & Quick Controls */}
      <DashboardBotWidget onNavigateToBot={() => onNavigateToTab?.('bot')} />

      {/* 4. Global Forex Trading Sessions & Liquidity Overlaps */}
      <ForexMarketSessions />

      {/* 5. Main Centerpiece: Single Professional MT5 Chart + Async Order Pad */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <LivePriceChart
            symbol={selectedSymbol}
            history={history}
            candles={selectedSymbol.toUpperCase() === currentChart?.symbol.toUpperCase() ? state?.chartHistory : undefined}
            indicators={selectedSymbol.toUpperCase() === currentChart?.symbol.toUpperCase() ? state?.indicators : undefined}
            chartDiagnostics={state?.chartDiagnostics}
            terminalPermissions={state?.terminalPermissions}
            currentChart={currentChart}
            allSymbols={allSymbols}
            ticks={ticks}
            currentTick={currentTick}
            positions={positions}
            marketDepth={state?.marketDepth}
            currentTimeframe={state?.currentChart?.timeframe || 'M1'}
            onSelectSymbol={setSelectedSymbol}
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
            symbolInfo={allSymbols.find((s) => s.symbol.toUpperCase() === selectedSymbol.toUpperCase()) || currentChart}
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


