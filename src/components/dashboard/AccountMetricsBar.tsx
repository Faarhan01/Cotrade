import React from 'react';
import { AccountInfo } from '../../types';
import { Wallet, TrendingUp, ShieldCheck, DollarSign, Layers } from 'lucide-react';

interface AccountMetricsBarProps {
  account: AccountInfo | null;
}

export const AccountMetricsBar: React.FC<AccountMetricsBarProps> = ({ account }) => {
  if (!account) return null;

  const isConnected = account.login > 0;
  const isProfitPositive = account.profit >= 0;
  const marginLevelColor =
    account.marginLevel > 500
      ? 'text-emerald-400'
      : account.marginLevel > 200
      ? 'text-cyan-400'
      : account.marginLevel > 100
      ? 'text-amber-400'
      : 'text-rose-400';

  return (
    <div className="space-y-3">
      {!isConnected && (
        <div className="bg-cyan-950/40 border border-cyan-800/60 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-cyan-300 font-bold">
              MetaTrader 5 Bridge Tunnel Ready:
            </span>
            <span className="text-slate-300">
              Awaiting EA heartbeat at <code className="text-cyan-400 bg-slate-900 px-1.5 py-0.5 rounded">http://127.0.0.1:7777</code>
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Real broker account data will sync automatically upon EA attachment
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* Balance */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Balance</span>
          <Wallet className="h-3.5 w-3.5 text-slate-500" />
        </div>
        <div className="text-xl font-bold font-mono text-white tracking-tight">
          ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
          {account.currency} • {account.server}
        </div>
      </div>

      {/* Equity */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Equity</span>
          <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
        </div>
        <div className="text-xl font-bold font-mono text-cyan-300 tracking-tight">
          ${account.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
          Net Assets
        </div>
      </div>

      {/* Floating Profit */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Floating PnL</span>
          <DollarSign className={`h-3.5 w-3.5 ${isProfitPositive ? 'text-emerald-400' : 'text-rose-400'}`} />
        </div>
        <div
          className={`text-xl font-bold font-mono tracking-tight ${
            isProfitPositive ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {isProfitPositive ? '+' : ''}${account.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
          Live MT5 Unrealized
        </div>
      </div>

      {/* Free Margin */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Free Margin</span>
          <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
        </div>
        <div className="text-xl font-bold font-mono text-slate-200 tracking-tight">
          ${account.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
          Available to Trade
        </div>
      </div>

      {/* Used Margin */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Used Margin</span>
          <Layers className="h-3.5 w-3.5 text-slate-500" />
        </div>
        <div className="text-xl font-bold font-mono text-slate-300 tracking-tight">
          ${account.margin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
          Leverage 1:{account.leverage}
        </div>
      </div>

      {/* Margin Level */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
          <span>Margin Level</span>
          <span className="text-[10px] uppercase font-mono px-1 rounded bg-slate-800 text-slate-400">
            {account.tradeMode}
          </span>
        </div>
        <div className={`text-xl font-bold font-mono tracking-tight ${marginLevelColor}`}>
          {account.marginLevel > 0 ? `${account.marginLevel.toFixed(1)}%` : '∞'}
        </div>
        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
          {account.marginLevel > 200 ? 'Health: Optimal' : 'Health: Caution'}
        </div>
      </div>
    </div>
  </div>
);
};
