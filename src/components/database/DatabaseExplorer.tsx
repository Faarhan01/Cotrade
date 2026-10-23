import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Database,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  FileSpreadsheet,
  Clock,
  Layers,
  Trash2,
  ShieldCheck,
  Check,
  Compass,
  FlaskConical,
  BookOpen,
  Zap,
  Globe,
  FileCode2,
  Eye,
  X,
  Code,
  Filter,
} from 'lucide-react';

interface TableMeta {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
}

const DATABASE_TABLES: TableMeta[] = [
  {
    id: 'orders',
    label: 'Orders & Executions',
    description: 'MT5 trade commands dispatched via AI MCP or manual UI, with broker tickets and fill prices.',
    icon: Layers,
    badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-800',
  },
  {
    id: 'strategies',
    label: 'Strategies Catalog',
    description: 'Knowledge Base strategy formulas, parameters, risk thresholds, and active status.',
    icon: Compass,
    badgeColor: 'bg-indigo-950 text-indigo-300 border-indigo-800',
  },
  {
    id: 'backtest_results',
    label: 'Backtest Runs',
    description: 'Quantitative evaluation records with equity curves, win rates, drawdown, and trade logs.',
    icon: FlaskConical,
    badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  },
  {
    id: 'observations',
    label: 'Observations & Notes',
    description: 'Alpha insights, session liquidity observations, and market anomalies.',
    icon: BookOpen,
    badgeColor: 'bg-amber-950 text-amber-300 border-amber-800',
  },
  {
    id: 'knowledge_telemetry',
    label: 'Market Velocity Telemetry',
    description: 'Tick velocity momentum, speed bursts, and price anomaly timestamps.',
    icon: Zap,
    badgeColor: 'bg-purple-950 text-purple-300 border-purple-800',
  },
  {
    id: 'knowledge_news_cache',
    label: 'Macro News Cache',
    description: 'Cached financial headlines, central bank announcements, and sentiment impact scores.',
    icon: Globe,
    badgeColor: 'bg-blue-950 text-blue-300 border-blue-800',
  },
  {
    id: 'candles_history',
    label: 'Candles OHLCV',
    description: 'Historical bar data streamed directly from MetaTrader 5 Expert Advisor.',
    icon: FileSpreadsheet,
    badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
  },
  {
    id: 'ticks_history',
    label: 'Tick Stream',
    description: 'Millisecond Bid/Ask/Spread quotes logged from the MT5 market stream.',
    icon: Clock,
    badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
  },
  {
    id: 'audit_logs',
    label: 'Audit & Bridge Logs',
    description: 'System-level operational events, risk trigger interventions, and connectivity logs.',
    icon: FileCode2,
    badgeColor: 'bg-rose-950 text-rose-300 border-rose-800',
  },
];

export const DatabaseExplorer: React.FC = () => {
  const [activeTable, setActiveTable] = useState<string>('orders');
  const [analytics, setAnalytics] = useState<any>(null);
  const [tableData, setTableData] = useState<{ columns: string[]; rows: any[]; totalCount: number }>({
    columns: [],
    rows: [],
    totalCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inspectRow, setInspectRow] = useState<any | null>(null);

  const loadAnalytics = async () => {
    try {
      const anData = await api.getDatabaseAnalytics().catch(() => null);
      if (anData) setAnalytics(anData);
    } catch (err) {
      console.error('Error fetching database analytics:', err);
    }
  };

  const loadTableData = async (tableName: string) => {
    try {
      setLoading(true);
      const res = await api.getTableRows(tableName, 100);
      if (res.success) {
        setTableData({
          columns: res.columns || [],
          rows: res.rows || [],
          totalCount: res.totalCount || res.rows.length,
        });
      }
    } catch (err: any) {
      console.error(`Error loading table ${tableName}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  useEffect(() => {
    loadTableData(activeTable);
    setSearchTerm('');
  }, [activeTable]);

  const handlePrune = async () => {
    const confirmed = window.confirm(
      'Prune the database now?\n\n' +
        'This will run the full maintenance pass, which truncates:\n' +
        '  • Unexecuted orders older than 24h\n' +
        '  • Ticks older than 48h (cap 5,000)\n' +
        '  • Account snapshots older than 7 days (cap 1,000)\n' +
        '  • Candles beyond the newest 1,000 per symbol/timeframe\n' +
        '  • Audit logs beyond the newest 2,000\n' +
        '  • Backtest results beyond the newest 200\n' +
        '  • Telemetry / news / regime caches beyond their caps\n\n' +
        'Continue?'
    );
    if (!confirmed) return;
    try {
      setPruning(true);
      const res = await api.pruneDatabase();
      setActionFeedback(`Pruned ${res.purgedUnexecutedOrders} stale unexecuted orders (>24h). Full maintenance pass completed.`);
      await loadAnalytics();
      await loadTableData(activeTable);
    } catch (err: any) {
      setActionFeedback(`Pruning error: ${err?.message || err}`);
    } finally {
      setPruning(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const handleClearActiveTable = async () => {
    const meta = DATABASE_TABLES.find((t) => t.id === activeTable);
    if (!confirm(`Are you sure you want to clear all records from table "${meta?.label || activeTable}"? This action cannot be undone.`)) {
      return;
    }
    try {
      setLoading(true);
      const res = await api.clearTable(activeTable);
      setActionFeedback(`Successfully cleared ${res.purgedCount} rows from ${activeTable}.`);
      await loadAnalytics();
      await loadTableData(activeTable);
    } catch (err: any) {
      setActionFeedback(`Clear table error: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const exportCsv = () => {
    if (tableData.rows.length === 0) return;
    const cols = tableData.columns;
    const header = cols.join(',');
    const rows = tableData.rows.map((row) =>
      cols
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return '';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          // Neutralise CSV formula injection: a cell that starts with one of
          // these characters is interpreted as a formula by Excel/LibreOffice
          // and can exfiltrate data or run commands when the exported file is
          // opened. Prefixing a single quote keeps the value as text.
          const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeTable}_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRows = tableData.rows.filter((row) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(row).some((val) => {
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(term);
    });
  });

  const activeMeta = DATABASE_TABLES.find((t) => t.id === activeTable) || DATABASE_TABLES[0];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Database className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                In-Memory State & Knowledge Base Explorer
              </h1>
            </div>
            <p className="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
              Real-time relational inspection for MetaTrader 5 executions, Knowledge Base strategies, backtest
              runs, and market indicators. The live MT5 EA is the primary authoritative source of truth, operating in-memory with zero disk overhead.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <button
              onClick={handlePrune}
              disabled={pruning}
              title="Purge unexecuted orders older than 24h & trim old data"
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-800/60 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className={`h-3.5 w-3.5 ${pruning ? 'animate-spin' : ''}`} />
              <span>{pruning ? 'Pruning...' : 'Prune Stale (24h+)'}</span>
            </button>

            <button
              onClick={() => {
                loadAnalytics();
                loadTableData(activeTable);
              }}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <a
              href="/api/database/download"
              download="mt5_in_memory_state.sqlite"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-indigo-950/50"
            >
              <Download className="h-4 w-4" />
              Export .sqlite State
            </a>
          </div>
        </div>

        {actionFeedback && (
          <div className="mt-4 p-2.5 rounded-lg bg-indigo-950/80 border border-indigo-800 text-xs font-mono text-indigo-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>{actionFeedback}</span>
          </div>
        )}
      </div>

      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">In-Memory Engine</span>
          <div className="text-sm font-bold text-white mt-1 flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-indigo-400" />
            <span>
              {analytics ? `${(analytics.dbSizeBytes / 1024).toFixed(1)} KB` : 'Active'}
            </span>
          </div>
          <span className="text-[9px] text-slate-500 mt-0.5 block truncate">
            Direct Live EA Mode
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Orders Stored</span>
          <div className="text-sm font-bold text-cyan-300 mt-1 flex items-center justify-between">
            <span>{analytics?.totalOrders ?? 0}</span>
            <span className="text-[10px] text-emerald-400">{analytics?.executedOrders ?? 0} filled</span>
          </div>
          <span className="text-[9px] text-slate-500 mt-0.5 block">
            Success: {analytics?.executionSuccessRate ?? 100}%
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Strategies Catalog</span>
          <div className="text-sm font-bold text-indigo-300 mt-1">
            {analytics?.totalStrategies ?? 0} active
          </div>
          <span className="text-[9px] text-slate-500 mt-0.5 block">
            Knowledge formulas
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Backtest Runs</span>
          <div className="text-sm font-bold text-emerald-300 mt-1">
            {analytics?.totalBacktests ?? 0}
          </div>
          <span className="text-[9px] text-slate-500 mt-0.5 block">
            Simulated evaluations
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Observations</span>
          <div className="text-sm font-bold text-amber-300 mt-1">
            {analytics?.totalObservations ?? 0}
          </div>
          <span className="text-[9px] text-slate-500 mt-0.5 block">
            Research alpha notes
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Speed Telemetry</span>
          <div className="text-sm font-bold text-purple-300 mt-1">
            {analytics?.totalTelemetry ?? 0} pts
          </div>
          <span className="text-[9px] text-slate-500 mt-0.5 block">
            Velocity anomalies
          </span>
        </div>
      </div>

      {/* Multi-Table Navigation Selector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2 font-mono">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {DATABASE_TABLES.map((t) => {
            const Icon = t.icon;
            const isActive = activeTable === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTable(t.id)}
                className={`px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/60'
                    : 'bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Content Panel */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        {/* Table Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-indigo-400">
              <activeMeta.icon className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Table: <span className="text-cyan-400">{activeTable}</span>
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  {tableData.totalCount} records
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{activeMeta.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder={`Search ${activeTable}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none w-48"
              />
            </div>

            <button
              onClick={exportCsv}
              disabled={tableData.rows.length === 0}
              title="Export current table rows to CSV"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>

            <a
              href={`/api/database/export/${activeTable}`}
              download={`${activeTable}_export.json`}
              title="Export table as JSON format"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1 border border-slate-700 transition-colors"
            >
              <Code className="h-3.5 w-3.5 text-cyan-400" />
              <span>JSON</span>
            </a>

            <button
              onClick={handleClearActiveTable}
              disabled={tableData.rows.length === 0}
              title={`Wipe all data from ${activeTable}`}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Rows Render */}
        {loading ? (
          <div className="py-16 text-center text-slate-500 font-mono text-xs flex flex-col items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />
            <span>Loading table rows from SQLite...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-lg p-12 text-center text-slate-500 font-mono text-xs space-y-1">
            <p className="text-sm font-bold text-slate-400">No records found in table `{activeTable}`</p>
            <p className="text-slate-500">
              {searchTerm ? 'Try adjusting your search criteria.' : 'Data will automatically be recorded as the bridge and EA operate.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] border border-slate-800/80 rounded-lg">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  {tableData.columns.slice(0, 7).map((col) => (
                    <th key={col} className="py-2.5 px-3">
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {filteredRows.map((row, idx) => (
                  <tr key={row.id || row.ticket || idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3 text-slate-500 font-mono text-[10px]">{idx + 1}</td>
                    {tableData.columns.slice(0, 7).map((col) => {
                      const val = row[col];
                      let displayVal = val;
                      const isJson = typeof val === 'string' && (val.startsWith('{') || val.startsWith('['));

                      if (val === null || val === undefined) {
                        displayVal = <span className="text-slate-600">—</span>;
                      } else if (col === 'status') {
                        const isGood = val === 'executed' || val === 'active' || val === 'success';
                        const isBad = val === 'failed' || val === 'error';
                        displayVal = (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isGood
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : isBad
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {String(val)}
                          </span>
                        );
                      } else if (col.includes('time') || col.includes('_at')) {
                        const num = Number(val);
                        if (!isNaN(num) && num > 1000000000) {
                          const dateMs = num < 2000000000 ? num * 1000 : num;
                          displayVal = (
                            <span className="text-slate-400 text-[11px]" title={new Date(dateMs).toISOString()}>
                              {new Date(dateMs).toLocaleString()}
                            </span>
                          );
                        }
                      } else if (col === 'profit' || col === 'net_profit') {
                        const num = Number(val);
                        displayVal = (
                          <span className={`font-bold ${num >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {num >= 0 ? `+$${num.toFixed(2)}` : `-$${Math.abs(num).toFixed(2)}`}
                          </span>
                        );
                      } else if (isJson) {
                        displayVal = (
                          <span className="text-indigo-400 text-[10px] bg-slate-950 px-1 py-0.5 rounded border border-indigo-900/60 truncate max-w-[150px] inline-block">
                            JSON ({val.length} chars)
                          </span>
                        );
                      } else if (typeof val === 'string' && val.length > 30) {
                        displayVal = (
                          <span className="truncate max-w-[180px] inline-block text-slate-300" title={val}>
                            {val}
                          </span>
                        );
                      }

                      return (
                        <td key={col} className="py-2 px-3 text-slate-300">
                          {displayVal}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => setInspectRow(row)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-400 text-[10px] font-bold transition-colors inline-flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row Inspection Modal */}
      {inspectRow && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl font-mono">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Database className="h-4 w-4" />
                </span>
                <span className="font-bold text-sm text-white">
                  Record Inspector: <span className="text-indigo-400">{activeTable}</span>
                </span>
              </div>
              <button
                onClick={() => setInspectRow(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(inspectRow).map(([key, value]) => {
                  const isJson = typeof value === 'string' && (value.startsWith('{') || value.startsWith('['));
                  let parsedJson: any = null;
                  if (isJson) {
                    try {
                      parsedJson = JSON.parse(value);
                    } catch {}
                  }

                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-lg bg-slate-950 border border-slate-800/80 ${
                        isJson ? 'sm:col-span-2' : ''
                      }`}
                    >
                      <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">
                        {key.replace(/_/g, ' ')}
                      </span>
                      {parsedJson ? (
                        <pre className="text-[11px] text-cyan-300 font-mono overflow-x-auto bg-slate-900 p-2.5 rounded border border-slate-800 max-h-48">
                          {JSON.stringify(parsedJson, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-slate-200 text-xs break-all font-mono">
                          {value === null || value === undefined ? (
                            <span className="text-slate-600">null</span>
                          ) : (
                            String(value)
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(inspectRow, null, 2));
                  setActionFeedback('Copied record JSON to clipboard!');
                  setTimeout(() => setActionFeedback(null), 3000);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors"
              >
                Copy JSON
              </button>
              <button
                onClick={() => setInspectRow(null)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
