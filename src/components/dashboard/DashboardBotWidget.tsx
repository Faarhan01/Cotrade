import React, { useState, useEffect } from 'react';
import { Bot, Play, Square, ArrowRight, Brain, Zap } from 'lucide-react';
import { api } from '../../services/api';

interface DashboardBotWidgetProps {
  onNavigateToBot?: () => void;
}

export const DashboardBotWidget: React.FC<DashboardBotWidgetProps> = ({ onNavigateToBot }) => {
  const [botState, setBotState] = useState<any>(null);
  const [toggling, setToggling] = useState(false);

  const fetchBot = async () => {
    try {
      const res = await api.getBotStatus();
      setBotState(res);
    } catch {
      // ignore transient fetch
    }
  };

  useEffect(() => {
    fetchBot();
    const interval = setInterval(fetchBot, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setToggling(true);
      if (botState?.running) {
        await api.stopBot();
      } else {
        await api.startBot();
      }
      await fetchBot();
    } catch (err: any) {
      alert(`Bot action failed: ${err?.message || err}`);
    } finally {
      setToggling(false);
    }
  };

  const isRunning = Boolean(botState?.running);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono">
      <div className="flex items-center gap-3">
        <div
          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border ${
            isRunning
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Auto-Trader Bot
            </span>
            <span
              className={`px-2 py-0.2 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                isRunning
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isRunning ? 'PHYSICAL WORKER RUNNING' : 'PAUSED'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            KnowledgeBase Mind formulates trade signals • Bot executes via unified dispatcher
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 border-r border-slate-800 pr-3 mr-1">
          <span>Trades: <strong className="text-white">{botState?.tradesExecuted ?? 0}</strong></span>
          <span>Win Rate: <strong className="text-emerald-400">{botState?.winRate ?? 0}%</strong></span>
          <span>PnL: <strong className={(botState?.totalProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>${(botState?.totalProfit ?? 0).toFixed(2)}</strong></span>
        </div>

        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide flex items-center gap-1.5 transition-all shadow-sm ${
            isRunning
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {isRunning ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
          <span>{isRunning ? 'Pause' : 'Start'}</span>
        </button>

        {onNavigateToBot && (
          <button
            onClick={onNavigateToBot}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 text-xs font-bold flex items-center gap-1 transition-colors"
          >
            <span>Open Bot</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};
