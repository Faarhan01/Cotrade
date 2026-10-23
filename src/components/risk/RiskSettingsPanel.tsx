import React, { useState } from 'react';
import { RiskGuardConfig } from '../../types';
import { api } from '../../services/api';
import {
  ShieldAlert,
  Sliders,
  DollarSign,
  TrendingDown,
  Layers,
  CheckCircle,
  AlertOctagon,
  Save,
} from 'lucide-react';

interface RiskSettingsPanelProps {
  riskGuard: RiskGuardConfig | null;
}

export const RiskSettingsPanel: React.FC<RiskSettingsPanelProps> = ({ riskGuard }) => {
  const [formData, setFormData] = useState<RiskGuardConfig>(
    riskGuard || {
      globalTakeProfitUSD: 1500,
      globalStopLossUSD: 800,
      maxDrawdownPercent: 5.0,
      emergencyKillSwitch: false,
      trailingStopEnabled: true,
      trailingStopDistancePoints: 150,
      trailingStopStepPoints: 30,
      maxLotSizePerTrade: 2.0,
      maxOpenPositions: 5,
      allowedSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'],
      autoCloseOnMarginLevelBelow: 100,
    }
  );

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.updateRisk(formData);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-cyan-400" />
          <div>
            <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono">
              Risk Guard & Trailing Engine
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Account-level capital protection & granular trade sequence parameters
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-cyan-950/40"
        >
          {savedSuccess ? (
            <>
              <CheckCircle className="h-4 w-4 text-emerald-300" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : 'Save Parameters'}</span>
            </>
          )}
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Portfolio Limits */}
        <div>
          <h3 className="text-xs font-mono uppercase text-slate-400 mb-3 flex items-center gap-1.5 font-bold">
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            Global Take Profit & Stop Loss
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Global Take Profit ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500 font-mono">$</span>
                <input
                  type="number"
                  value={formData.globalTakeProfitUSD}
                  onChange={(e) =>
                    setFormData({ ...formData, globalTakeProfitUSD: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 pl-7 text-sm font-mono text-emerald-400 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Auto-closes all positions when floating profit reaches this amount. 0 = disabled.
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Global Stop Loss ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500 font-mono">$</span>
                <input
                  type="number"
                  value={formData.globalStopLossUSD}
                  onChange={(e) =>
                    setFormData({ ...formData, globalStopLossUSD: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 pl-7 text-sm font-mono text-rose-400 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Auto-liquidates portfolio if total floating loss breaches this cap. 0 = disabled.
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Max Daily Drawdown (% of Balance)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={formData.maxDrawdownPercent}
                  onChange={(e) =>
                    setFormData({ ...formData, maxDrawdownPercent: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-amber-400 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Prevents external AI models from risking more than X% of total capital.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Trailing Stop Engine */}
        <div>
          <h3 className="text-xs font-mono uppercase text-slate-400 mb-3 flex items-center gap-1.5 font-bold">
            <Sliders className="h-3.5 w-3.5 text-cyan-400" />
            Trailing Stop (runs inside MT5 EA, mirrored here)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">
                  Trailing Stop Engine State
                </label>
                <p className="text-[10px] text-slate-500 font-mono">
                  Trailing is executed by the MT5 EA (InpEnableTrailing / InpTrailingPoints / InpTrailingStep). These server-side values are mirrored to the EA on the next sync and are NOT applied by the bridge itself.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, trailingStopEnabled: !formData.trailingStopEnabled })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                    formData.trailingStopEnabled
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {formData.trailingStopEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Trailing Distance (Points)
              </label>
              <input
                type="number"
                value={formData.trailingStopDistancePoints}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    trailingStopDistancePoints: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Distance behind market price (e.g. 150 points = 15 pips).
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Trailing Step (Points)
              </label>
              <input
                type="number"
                value={formData.trailingStopStepPoints}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    trailingStopStepPoints: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Minimum profit advance before moving Stop Loss higher.
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Position & Margin Governors */}
        <div>
          <h3 className="text-xs font-mono uppercase text-slate-400 mb-3 flex items-center gap-1.5 font-bold">
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            Position & Margin Caps
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Max Lot Size per Order
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.maxLotSizePerTrade}
                onChange={(e) =>
                  setFormData({ ...formData, maxLotSizePerTrade: parseFloat(e.target.value) || 0.1 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Rejects AI commands specifying lots higher than this ceiling.
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Max Open Positions Limit
              </label>
              <input
                type="number"
                value={formData.maxOpenPositions}
                onChange={(e) =>
                  setFormData({ ...formData, maxOpenPositions: parseInt(e.target.value) || 1 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Limits total simultaneous open trades in MT5.
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg">
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Margin Call Cutoff (%)
              </label>
              <input
                type="number"
                value={formData.autoCloseOnMarginLevelBelow}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    autoCloseOnMarginLevelBelow: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 font-mono mt-1">
                Emergency close all if MT5 margin level drops under this percentage.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
