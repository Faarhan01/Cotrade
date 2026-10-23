import React, { useState } from 'react';
import {
  Activity,
  Cpu,
  ShieldAlert,
  Terminal,
  FileCode2,
  Clock,
  Radio,
  Copy,
  Check,
  AlertTriangle,
  Database,
  Compass,
  BookOpen,
  Menu,
  X,
  Bot,
} from 'lucide-react';
import { AppState } from '../../types';
import { api } from '../../services/api';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  state: AppState | null;
  wsStatus: 'connected' | 'connecting' | 'disconnected';
  lastPingMs: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  state,
  wsStatus,
  lastPingMs,
}) => {
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [killSwitchLoading, setKillSwitchLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isEaOnline = state?.connection.isEaConnected ?? false;
  const isKillSwitchActive = state?.riskGuard.emergencyKillSwitch ?? false;

  const copyEndpoint = () => {
    navigator.clipboard.writeText('http://127.0.0.1:7777');
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const handleToggleKillSwitch = async () => {
    try {
      setKillSwitchLoading(true);
      await api.toggleKillSwitch(!isKillSwitchActive);
    } catch (e) {
      console.error(e);
    } finally {
      setKillSwitchLoading(false);
    }
  };

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  const navItems = [
    { id: 'dashboard', label: 'Live Terminal', icon: Terminal },
    { id: 'bot', label: 'Auto-Trader Bot', icon: Bot },
    { id: 'knowledgebase', label: 'Knowledge Base', icon: BookOpen },
    { id: 'mcp', label: 'AI MCP Hub', icon: Cpu },
    { id: 'risk', label: 'Risk & Trailing', icon: ShieldAlert },
    { id: 'database', label: 'In-Memory State', icon: Database },
    { id: 'ea', label: 'MT5 EA Setup', icon: FileCode2 },
    { id: 'logs', label: 'Audit Log', icon: Clock },
  ];

  const activeLabel = navItems.find((n) => n.id === activeTab)?.label || 'Live Terminal';

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          {/* Brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white truncate">
                  MT5 <span className="text-cyan-400">AI COPILOT</span>
                </span>
                <span className="hidden sm:inline text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                  MCP v2.10
                </span>
              </div>
              <p className="hidden sm:flex text-xs text-slate-400 font-mono items-center gap-1.5 truncate">
                Bridge: <span className="text-slate-300">http://127.0.0.1:7777</span>
                <button
                  onClick={copyEndpoint}
                  title="Copy local bridge URL for MT5 WebRequest"
                  className="hover:text-cyan-400 text-slate-500 transition-colors p-0.5 shrink-0"
                >
                  {copiedEndpoint ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id || (item.id === 'knowledgebase' && activeTab === 'strategies');
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/80'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  {item.label}
                  {item.id === 'mcp' && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                      AI Ready
                    </span>
                  )}
                  {item.id === 'risk' && state?.riskGuard.trailingStopEnabled && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Status Indicators & Kill Switch */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* MT5 EA Status */}
            <div
              className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded-full border text-xs font-mono transition-colors ${
                isEaOnline
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60 shadow-sm shadow-emerald-900/30'
                  : 'bg-amber-950/40 text-amber-300 border-amber-800/50'
              }`}
              title={isEaOnline ? 'MT5 Expert Advisor sending live ticks & executing orders' : 'Waiting for EA to attach in MT5 at http://127.0.0.1:7777'}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isEaOnline ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span className="hidden sm:inline font-semibold">MT5 EA:</span>
              <span className="text-[10px] sm:text-xs">{isEaOnline ? 'ONLINE' : 'WAITING'}</span>
            </div>

            {/* WebSocket Latency */}
            <div
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-mono text-slate-300"
              title="Low-latency WebSocket channel"
            >
              <Radio
                className={`h-3 w-3 ${
                  wsStatus === 'connected' ? 'text-cyan-400 animate-pulse' : 'text-rose-400'
                }`}
              />
              <span>{lastPingMs > 0 ? `${lastPingMs}ms` : 'WS Active'}</span>
            </div>

            {/* Emergency Kill Switch */}
            <button
              onClick={handleToggleKillSwitch}
              disabled={killSwitchLoading}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all border shadow-sm ${
                isKillSwitchActive
                  ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 animate-pulse'
                  : 'bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border-slate-700 hover:border-rose-800/60'
              }`}
              title={
                isKillSwitchActive
                  ? 'Kill Switch ACTIVE: Trading halted & positions liquidated'
                  : 'Emergency Kill Switch: Instantly halt orders & close all positions'
              }
            >
              {isKillSwitchActive ? (
                <AlertTriangle className="h-3.5 w-3.5 text-white" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
              )}
              <span className="hidden sm:inline">{isKillSwitchActive ? 'HALTED' : 'KILL SWITCH'}</span>
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-800 py-2 space-y-1">
            <div className="px-2 pb-2 text-[10px] font-mono uppercase text-slate-500">
              {activeLabel}
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id || (item.id === 'knowledgebase' && activeTab === 'strategies');
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-800 text-cyan-400 border border-slate-700/80'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  {item.label}
                  {item.id === 'mcp' && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                      AI Ready
                    </span>
                  )}
                  {item.id === 'risk' && state?.riskGuard.trailingStopEnabled && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>
              );
            })}
            <div className="px-3 pt-2 text-[10px] font-mono text-slate-500 flex items-center gap-2">
              <Radio className={`h-3 w-3 ${wsStatus === 'connected' ? 'text-cyan-400' : 'text-rose-400'}`} />
              <span>WS: {lastPingMs > 0 ? `${lastPingMs}ms` : wsStatus}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};