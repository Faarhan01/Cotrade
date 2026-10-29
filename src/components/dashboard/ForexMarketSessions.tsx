import React, { useState, useEffect } from 'react';
import { Clock, Globe, Zap, Sun, Moon, AlertCircle, Compass } from 'lucide-react';

interface MarketSession {
  id: string;
  name: string;
  city: string;
  flag: string;
  openUtcHour: number;
  openUtcMinute: number;
  closeUtcHour: number;
  closeUtcMinute: number;
  timezone: string;
}

const SESSIONS: MarketSession[] = [
  {
    id: 'sydney',
    name: 'Sydney',
    city: 'Sydney, AU',
    flag: '🇦🇺',
    openUtcHour: 22,
    openUtcMinute: 0,
    closeUtcHour: 7,
    closeUtcMinute: 0,
    timezone: 'UTC+10',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    city: 'Tokyo, JP',
    flag: '🇯🇵',
    openUtcHour: 0,
    openUtcMinute: 0,
    closeUtcHour: 9,
    closeUtcMinute: 0,
    timezone: 'UTC+9',
  },
  {
    id: 'london',
    name: 'London',
    city: 'London, UK',
    flag: '🇬🇧',
    openUtcHour: 8,
    openUtcMinute: 0,
    closeUtcHour: 16,
    closeUtcMinute: 30,
    timezone: 'UTC+0',
  },
  {
    id: 'new_york',
    name: 'New York',
    city: 'New York, US',
    flag: '🇺🇸',
    openUtcHour: 13,
    openUtcMinute: 0,
    closeUtcHour: 21,
    closeUtcMinute: 0,
    timezone: 'UTC-5',
  },
];

function isSessionActive(s: MarketSession, utcMinutes: number, dayOfWeek: number): boolean {
  // Forex is closed over the weekend: Friday 21:00 UTC to Sunday 21:00 UTC
  if (dayOfWeek === 6) return false; // Saturday
  if (dayOfWeek === 0 && utcMinutes < 21 * 60) return false; // Sunday before 21:00 UTC
  if (dayOfWeek === 5 && utcMinutes >= 21 * 60) return false; // Friday after 21:00 UTC

  const openMin = s.openUtcHour * 60 + s.openUtcMinute;
  const closeMin = s.closeUtcHour * 60 + s.closeUtcMinute;

  if (openMin < closeMin) {
    return utcMinutes >= openMin && utcMinutes < closeMin;
  } else {
    // Overnight wraps around midnight (e.g. Sydney 22:00 to 07:00)
    return utcMinutes >= openMin || utcMinutes < closeMin;
  }
}

function getTimeUntilNext(s: MarketSession, utcMinutes: number): { action: 'closes in' | 'opens in'; minutes: number } {
  const openMin = s.openUtcHour * 60 + s.openUtcMinute;
  const closeMin = s.closeUtcHour * 60 + s.closeUtcMinute;
  const totalDay = 1440;

  const isActive = openMin < closeMin
    ? utcMinutes >= openMin && utcMinutes < closeMin
    : utcMinutes >= openMin || utcMinutes < closeMin;

  if (isActive) {
    let diff = closeMin - utcMinutes;
    if (diff < 0) diff += totalDay;
    return { action: 'closes in', minutes: diff };
  } else {
    let diff = openMin - utcMinutes;
    if (diff < 0) diff += totalDay;
    return { action: 'opens in', minutes: diff };
  }
}

function formatRemaining(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export const ForexMarketSessions: React.FC = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const utcHours = now.getUTCHours();
  const utcMins = now.getUTCMinutes();
  const utcSecs = now.getUTCSeconds();
  const dayOfWeek = now.getUTCDay();
  const currentMinutes = utcHours * 60 + utcMins;

  const isLondonOpen = isSessionActive(SESSIONS[2], currentMinutes, dayOfWeek);
  const isNyOpen = isSessionActive(SESSIONS[3], currentMinutes, dayOfWeek);
  const isTokyoOpen = isSessionActive(SESSIONS[1], currentMinutes, dayOfWeek);
  const isLondonNyOverlap = isLondonOpen && isNyOpen;
  const isWeekendHalt =
    dayOfWeek === 6 ||
    (dayOfWeek === 0 && currentMinutes < 21 * 60) ||
    (dayOfWeek === 5 && currentMinutes >= 21 * 60);

  // Compute estimated global market liquidity score (0-100)
  let liquidityScore = 20;
  if (isWeekendHalt) {
    liquidityScore = 5;
  } else if (isLondonNyOverlap) {
    liquidityScore = 98;
  } else if (isLondonOpen) {
    liquidityScore = 80;
  } else if (isNyOpen) {
    liquidityScore = 75;
  } else if (isTokyoOpen) {
    liquidityScore = 55;
  } else {
    liquidityScore = 30;
  }

  const utcTimeFormatted = `${String(utcHours).padStart(2, '0')}:${String(utcMins).padStart(2, '0')}:${String(utcSecs).padStart(2, '0')} UTC`;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm font-mono text-xs">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Globe className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-xs uppercase tracking-wider">
                Global Forex Trading Sessions
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-cyan-300 font-bold">
                {utcTimeFormatted}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Live interbank liquidity zones & major trading desk operational clocks
            </p>
          </div>
        </div>

        {/* Overlap & Regime Pill */}
        <div className="flex items-center gap-2 flex-wrap">
          {isWeekendHalt ? (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center gap-1.5">
              <Moon className="h-3 w-3" />
              <span>Weekend Market Halt (Reopens Sun 21:00 UTC)</span>
            </span>
          ) : isLondonNyOverlap ? (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 flex items-center gap-1.5 animate-pulse">
              <Zap className="h-3 w-3 text-emerald-400" />
              <span>London / New York Peak Overlap (Max Liquidity)</span>
            </span>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>Estimated Desk Liquidity:</span>
              <span
                className={`font-bold ${
                  liquidityScore >= 70
                    ? 'text-emerald-400'
                    : liquidityScore >= 40
                    ? 'text-sky-400'
                    : 'text-amber-400'
                }`}
              >
                {liquidityScore}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 4 Sessions Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
        {SESSIONS.map((session) => {
          const active = isSessionActive(session, currentMinutes, dayOfWeek);
          const countdown = getTimeUntilNext(session, currentMinutes);

          return (
            <div
              key={session.id}
              className={`p-2.5 rounded-xl border transition-all ${
                active
                  ? 'bg-emerald-950/20 border-emerald-800/80 shadow-sm'
                  : 'bg-slate-950/50 border-slate-800/70 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold text-xs text-white">
                  <span>{session.flag}</span>
                  <span>{session.name}</span>
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                    active
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  {active ? 'OPEN' : 'CLOSED'}
                </span>
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                <span className="text-slate-500">{session.timezone}</span>
                <span className={active ? 'text-emerald-400' : 'text-slate-400'}>
                  {countdown.action} {formatRemaining(countdown.minutes)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
