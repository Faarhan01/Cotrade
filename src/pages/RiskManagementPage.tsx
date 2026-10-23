import React from 'react';
import { AppState } from '../types';
import { RiskSettingsPanel } from '../components/risk/RiskSettingsPanel';
import { AsyncQueueMonitor } from '../components/risk/AsyncQueueMonitor';

interface RiskManagementPageProps {
  state: AppState | null;
}

export const RiskManagementPage: React.FC<RiskManagementPageProps> = ({ state }) => {
  return (
    <div className="space-y-6">
      <RiskSettingsPanel riskGuard={state?.riskGuard || null} />
      <AsyncQueueMonitor queue={state?.commandQueue || []} />
    </div>
  );
};
