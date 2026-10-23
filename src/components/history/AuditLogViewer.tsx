import React, { useState } from 'react';
import { ExecutionLog } from '../../types';
import { Clock, Filter, Search, Terminal, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface AuditLogViewerProps {
  logs: ExecutionLog[];
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs }) => {
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        log.title.toLowerCase().includes(term) ||
        log.details.toLowerCase().includes(term) ||
        log.source.toLowerCase().includes(term) ||
        (log.ticket && log.ticket.toString().includes(term))
      );
    }
    return true;
  });

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-cyan-400" />
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Trade Execution & AI Audit Trail
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Live chronological log of all MT5 executions, MCP calls, and risk alerts
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search ticket / symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white focus:border-cyan-500 focus:outline-none w-44"
            />
          </div>

          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-300 focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">All Levels</option>
            <option value="trade">Trades Only</option>
            <option value="info">Info</option>
            <option value="warn">Warnings</option>
            <option value="error">Errors</option>
          </select>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-lg p-10 text-center text-slate-500 font-mono text-xs">
          No audit log entries matching criteria.
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {filteredLogs.map((log) => {
            const isTrade = log.level === 'trade';
            const isError = log.level === 'error';
            const isWarn = log.level === 'warn';

            return (
              <div
                key={log.id}
                className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-start gap-3 text-xs font-mono"
              >
                <div className="mt-0.5">
                  {isTrade ? (
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                  ) : isError ? (
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                  ) : isWarn ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  ) : (
                    <Info className="h-4 w-4 text-cyan-400" />
                  )}
                </div>

                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white tracking-wide">
                      {log.title}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {log.details}
                  </p>

                  <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-500">
                    <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                      Source: {log.source}
                    </span>
                    {log.ticket && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                        Ticket #{log.ticket}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
