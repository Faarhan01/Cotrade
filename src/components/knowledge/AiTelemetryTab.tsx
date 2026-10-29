import React, { useState, useEffect } from 'react';
import {
  Activity,
  Zap,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Sliders,
  CheckCircle2,
  Database,
  BarChart2,
  Compass,
} from 'lucide-react';
import { api } from '../../services/api';

export const AiTelemetryTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<any | null>(null);
  const [recentMetrics, setRecentMetrics] = useState<any[]>([]);
  const [pulsing, setPulsing] = useState(false);
  const [pulseSymbol, setPulseSymbol] = useState('EURUSD');
  const [pulseVelocity, setPulseVelocity] = useState('38.5');
  const [pulseNotice, setPulseNotice] = useState<string | null>(null);

  const loadTelemetry = async () => {
    try {
      setLoading(true);
      const res = await api.getKnowledgeTelemetry();
      if (res.success) {
        setTelemetry(res.knowledge);
        setRecentMetrics(res.recentMetrics || []);
      }
    } catch (err: any) {
      console.error('Failed to load telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTelemetry();
  }, []);

  const handleSendTelemetryPulse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setPulsing(true);
      const vel = parseFloat(pulseVelocity) || 35.0;
      const res = await api.updateKnowledgeTelemetry(pulseSymbol, [
        {
          velocity: vel,
          price: String(pulseSymbol || '').includes('JPY') ? 154.5 : 1.086,
          timestamp: Date.now(),
        },
      ]);
      if (res.success) {
        setPulseNotice(`Dispatched velocity pulse (${vel} pts/s) on ${pulseSymbol}! Knowledge base moving average updated.`);
        await loadTelemetry();
        setTimeout(() => setPulseNotice(null), 4000);
      }
    } catch (err: any) {
      console.error('Pulse failed:', err);
    } finally {
      setPulsing(false);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const currentUtcHour = String(new Date().getUTCHours()).padStart(2, '0');

  return (
    <div className="space-y-6 font-mono">
      {/* Top Telemetry Metric Strips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Market Telemetry</span>
            <Database className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {telemetry?.totalObservations !== undefined ? telemetry.totalObservations.toLocaleString() : '0'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Aggregated across MT5 tick events</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Global Mean Velocity</span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {telemetry?.globalAverageSpeed !== undefined ? Number(telemetry.globalAverageSpeed).toFixed(1) : '0.0'}{' '}
            <span className="text-xs text-slate-400">pts/s</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Average market displacement rate</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Peak Velocity Registered</span>
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {telemetry?.peakVelocityRegistered !== undefined ? Number(telemetry.peakVelocityRegistered).toFixed(1) : '0.0'}{' '}
            <span className="text-xs text-slate-400">pts/s</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Maximum news expansion spike</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Current UTC Hour</span>
            <Clock className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">
            {currentUtcHour}:00 <span className="text-xs text-slate-400">UTC</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Global Forex synchronized clock</div>
        </div>
      </div>

      {pulseNotice && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{pulseNotice}</span>
        </div>
      )}

      {/* 24-Hour Velocity Heatmap */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-sm text-white">Time-of-Day Velocity Distribution (UTC 00 - 23)</h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Empirical hourly market speed telemetry mapping London, New York and Asian liquidity bursts.
            </p>
          </div>
          <button
            onClick={loadTelemetry}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 24 columns */}
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2 text-xs">
          {hours.map((h) => {
            const entry = telemetry?.timeOfDayPatterns?.[h];
            const sampleCount = entry?.sampleCount || 0;
            const avgSpeed = entry?.avgSpeed ? Number(entry.avgSpeed).toFixed(1) : (sampleCount > 0 ? '0.0' : '-');
            const isCurrent = h === currentUtcHour;
            const speedVal = avgSpeed !== '-' ? parseFloat(avgSpeed) : 0;

            // Heatmap color intensity
            let heatBg = 'bg-slate-950/60 border-slate-800/60 text-slate-500';
            if (sampleCount > 0) {
              if (speedVal >= 35) heatBg = 'bg-rose-950/40 border-rose-800 text-rose-300';
              else if (speedVal >= 25) heatBg = 'bg-amber-950/40 border-amber-800 text-amber-300';
              else if (speedVal >= 18) heatBg = 'bg-cyan-950/40 border-cyan-800 text-cyan-300';
              else heatBg = 'bg-slate-900/60 border-slate-700/60 text-slate-300';
            }

            return (
              <div
                key={h}
                className={`p-2.5 rounded-lg border text-center transition-all ${heatBg} ${
                  isCurrent ? 'ring-2 ring-cyan-400 shadow-md' : ''
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-bold">
                  <span>{h}:00</span>
                  {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />}
                </div>
                <div className="text-sm font-bold mt-1">{avgSpeed}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">{sampleCount} samples</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Column Section: Telemetry Pulse Dispatcher & Recent SQLite Records */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Telemetry Pulse Injector */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Zap className="h-4 w-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white">Interactive Market Velocity Pulse Generator</h3>
          </div>

          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            Test the live telemetry moving average engine. Submitting a test pulse will recalculate
            time-of-day weights and update SQLite database tables in real time without waiting for MT5 market open.
          </p>

          <form onSubmit={handleSendTelemetryPulse} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Target Symbol</label>
                <select
                  value={pulseSymbol}
                  onChange={(e) => setPulseSymbol(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="EURUSD">EURUSD</option>
                  <option value="GBPUSD">GBPUSD</option>
                  <option value="USDJPY">USDJPY</option>
                  <option value="XAUUSD">XAUUSD (Gold)</option>
                  <option value="BTCUSD">BTCUSD (Crypto)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Displacement Velocity (pts/s)</label>
                <input
                  type="number"
                  step="0.1"
                  value={pulseVelocity}
                  onChange={(e) => setPulseVelocity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={pulsing}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md shadow-cyan-950/40"
            >
              <Zap className={`h-4 w-4 ${pulsing ? 'animate-spin' : ''}`} />
              <span>{pulsing ? 'Dispatched to Engine...' : 'Emit Telemetry Pulse'}</span>
            </button>
          </form>
        </div>

        {/* Recent Telemetry SQLite Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">SQLite Telemetry Storage Ledger</h3>
            </div>
            <span className="text-xs text-slate-500">{recentMetrics.length} recent</span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {recentMetrics.length === 0 ? (
              <p className="text-xs text-slate-500 p-6 text-center border border-dashed border-slate-800 rounded-lg">
                No recent telemetry records in SQLite.
              </p>
            ) : (
              recentMetrics.map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-lg flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{m.symbol}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${m.direction === 'up' ? 'text-emerald-400 bg-emerald-950/60' : 'text-rose-400 bg-rose-950/60'}`}>
                      {m.direction?.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-cyan-400 font-bold">{m.velocity} pts/s</span>
                    <span className="text-[10px] text-slate-500">Hour {m.hourKey}:00</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
