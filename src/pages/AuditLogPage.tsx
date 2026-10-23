import React from 'react';
import { AppState } from '../types';
import { AuditLogViewer } from '../components/history/AuditLogViewer';

interface AuditLogPageProps {
  state: AppState | null;
}

export const AuditLogPage: React.FC<AuditLogPageProps> = ({ state }) => {
  return (
    <div className="space-y-6">
      <AuditLogViewer logs={state?.logs || []} />
    </div>
  );
};
