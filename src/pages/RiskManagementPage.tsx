import React from 'react';
import { AppState } from '../types';
import { RiskSettingsPanel } from '../components/risk/RiskSettingsPanel';
import { AsyncQueueMonitor } from '../components/risk/AsyncQueueMonitor';
import { LiveTrailingRadar } from '../components/risk/LiveTrailingRadar';

interface RiskManagementPageProps {
  state: AppState | null;
}

export const RiskManagementPage: React.FC<RiskManagementPageProps> = ({ state }) => {
  return (
    <div className="space-y-6">
      <LiveTrailingRadar
        positions={state?.positions || []}
        allSymbols={state?.allSymbols}
        trailingEnabled={state?.riskGuard?.trailingStopEnabled ?? true}
        trailingDistancePoints={state?.riskGuard?.trailingStopDistancePoints ?? 150}
        trailingStepPoints={state?.riskGuard?.trailingStopStepPoints ?? 30}
      />
      <RiskSettingsPanel riskGuard={state?.riskGuard || null} />
      <AsyncQueueMonitor queue={state?.commandQueue || []} />
    </div>
  );
};

