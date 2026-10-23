import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  Clock,
  Shield,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Compass,
  ArrowRight,
  Zap,
  Activity,
  Layers,
  Globe,
} from 'lucide-react';
import { api } from '../../services/api';

interface SymbolIntelligenceTabProps {
  onSelectStrategyTemplate?: (template: any) => void;
  onApplyRiskParams?: (params: any) => void;
}

export const SymbolIntelligenceTab: React.FC<SymbolIntelligenceTabProps> = ({
  onSelectStrategyTemplate,
  onApplyRiskParams,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState('EURUSD');
  const [customSymbolInput, setCustomSymbolInput] = useState('');
  const [activeSymbols, setActiveSymbols] = useState<string[]>(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US30']);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  useEffect(() => {
    api.getState().then((s) => {
      if (s?.currentChart?.symbol) {
        setSelectedSymbol(s.currentChart.symbol);
      }
      if (s?.allSymbols && s.allSymbols.length > 0) {
        const liveSyms = s.allSymbols.map((item) => item.symbol);
        const combined = Array.from(new Set([...(s.currentChart ? [s.currentChart.symbol] : []), ...liveSyms]));
        if (combined.length > 0) setActiveSymbols(combined.slice(0, 15));
      }
    }).catch(() => {});
  }, []);

  const [impactData, setImpactData] = useState<any | null>(null);

  const loadProfile = async (symbolToFetch: string) => {
    try {
      setLoading(true);
      setError(null);
      const [profRes, impactRes] = await Promise.all([
        api.getKnowledgeAutoDetect(symbolToFetch).catch(() => ({ success: false, profile: null })),
        api.getKnowledgeImpact(symbolToFetch).catch(() => ({ success: false, impact: null })),
      ]);
      if (profRes.success && profRes.profile) {
        setProfile(profRes.profile);
      }
      if (impactRes.success && impactRes.impact) {
        setImpactData(impactRes.impact);
      }
    } catch (err: any) {
      console.warn('Auto-detect notice:', err);
      // Graceful fallback: do not block UI with a harsh error when waiting for EA connection
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile(selectedSymbol);
  }, [selectedSymbol]);

  const handleCustomSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSymbolInput.trim()) return;
    const sym = customSymbolInput.trim();
    setSelectedSymbol(sym);
    if (!activeSymbols.includes(sym)) {
      setActiveSymbols((prev) => [sym, ...prev]);
    }
    setCustomSymbolInput('');
  };

  const handleApplyRisk = (riskParams: any) => {
    if (onApplyRiskParams) {
      onApplyRiskParams(riskParams);
      setAppliedNotice('Suggested SL/TP parameters dispatched to Risk Guard & Strategy Form!');
      setTimeout(() => setAppliedNotice(null), 3000);
    }
  };

  const getVolatilityBadgeColor = (rating: string) => {
    switch (rating) {
      case 'ULTRA_LOW':
        return 'text-slate-400 bg-slate-900 border-slate-700';
      case 'LOW':
        return 'text-sky-400 bg-sky-950/60 border-sky-800';
      case 'NORMAL':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
      case 'HIGH':
        return 'text-amber-400 bg-amber-950/60 border-amber-800';
      case 'EXTREME':
        return 'text-rose-400 bg-rose-950/60 border-rose-800';
      default:
        return 'text-slate-400 bg-slate-900 border-slate-700';
    }
  };

  const getSessionActivityBadge = (level: string) => {
    switch (level) {
      case 'PEAK':
        return 'text-rose-400 border-rose-800 bg-rose-950/50';
      case 'HIGH':
        return 'text-amber-400 border-amber-800 bg-amber-950/50';
      case 'MODERATE':
        return 'text-emerald-400 border-emerald-800 bg-emerald-950/50';
      default:
        return 'text-slate-400 border-slate-800 bg-slate-950/50';
    }
  };

  const currentGmtHour = new Date().getUTCHours();

  return (
    <div className="space-y-6">
      {/* Symbol Selection Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mr-1">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            Asset Selector:
          </span>
          {activeSymbols.map((sym) => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                selectedSymbol === sym
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/40'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <form onSubmit={handleCustomSymbolSubmit} className="flex items-center gap-1.5 w-full md:w-auto">
            <input
              type="text"
              placeholder="e.g. AUDUSD, GER40..."
              value={customSymbolInput}
              onChange={(e) => setCustomSymbolInput(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none w-36"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors"
            >
              Inspect
            </button>
          </form>

          <button
            onClick={() => loadProfile(selectedSymbol)}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh Symbol Intelligence"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {appliedNotice && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{appliedNotice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !profile && (
        <div className="p-12 text-center text-slate-400 font-mono text-sm border border-dashed border-slate-800 rounded-xl">
          <RefreshCw className="h-6 w-6 animate-spin text-cyan-400 mx-auto mb-2" />
          Auto-detecting symbol specifications, pip mechanics & session windows...
        </div>
      )}

      {profile && (
        <div className="space-y-6">
          {/* Header Card: Asset Class & Live Mechanics */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-mono font-bold text-base shadow-md shadow-cyan-950/40">
                  {profile.symbol.slice(0, 3)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white font-mono tracking-tight">
                      {profile.symbol}
                    </h2>
                    {profile.displayName && profile.displayName !== profile.symbol && (
                      <span className="text-xs text-slate-400 font-sans">
                        ({profile.displayName})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                    <span>{profile.assetClass}</span>
                    {profile.baseCurrency && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Base: {profile.baseCurrency}</span>
                      </>
                    )}
                    {profile.quoteCurrency && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Quote: {profile.quoteCurrency}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>Point: {typeof profile.point === 'number' ? profile.point.toFixed(profile.digits) : profile.point}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 font-mono uppercase">Current Price</div>
                  <div className="text-lg font-bold font-mono text-cyan-400">
                    {profile.currentPrice > 0 ? (
                      profile.currentPrice.toFixed(profile.digits)
                    ) : (
                      <span className="text-xs font-normal text-slate-500">Awaiting MT5 EA Quote</span>
                    )}
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${getVolatilityBadgeColor(profile.volatilityRating)}`}>
                  {profile.volatilityRating} VOLATILITY
                </div>
              </div>
            </div>

            {/* Mechanics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 text-xs font-mono">
              <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                <div className="text-[10px] text-slate-500">Digits / Decimals</div>
                <div className="text-sm font-bold text-white mt-0.5">{profile.digits} digits</div>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                <div className="text-[10px] text-slate-500">Pip Size</div>
                <div className="text-sm font-bold text-white mt-0.5">{profile.pipSize}</div>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                <div className="text-[10px] text-slate-500">Contract Size</div>
                <div className="text-sm font-bold text-white mt-0.5">{profile.contractSize.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                <div className="text-[10px] text-slate-500">Live Spread</div>
                <div className="text-sm font-bold text-cyan-300 mt-0.5">{profile.spreadPips} pips</div>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                <div className="text-[10px] text-slate-500">ATR (14 bars)</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">{profile.atr14Pips} pips</div>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                <div className="text-[10px] text-slate-500">Spread / ATR</div>
                <div className={`text-sm font-bold mt-0.5 ${profile.spreadToAtrRatio < 0.08 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {(profile.spreadToAtrRatio * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Macro News Impact & Catalyst Radar */}
          {impactData && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3 font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  <h3 className="font-bold text-sm text-white">
                    Macroeconomic Catalyst & Sentiment Radar
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${impactData.directionalBias?.direction === 'STRONG_BUY' || impactData.directionalBias?.direction === 'BUY' ? 'text-emerald-400 bg-emerald-950 border-emerald-800' : impactData.directionalBias?.direction === 'STRONG_SELL' || impactData.directionalBias?.direction === 'SELL' ? 'text-rose-400 bg-rose-950 border-rose-800' : 'text-slate-400 bg-slate-950 border-slate-800'}`}>
                    {impactData.directionalBias?.direction?.replace(/_/g, ' ') || impactData.overallSentiment} BIAS
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${impactData.eventRiskLevel === 'CRITICAL' ? 'text-rose-400 bg-rose-950 border-rose-800' : impactData.eventRiskLevel === 'HIGH' ? 'text-amber-400 bg-amber-950 border-amber-800' : 'text-emerald-400 bg-emerald-950 border-emerald-800'}`}>
                    {impactData.eventRiskLevel} RISK
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase block">Currency Pair Mechanics</span>
                  <div className="text-xs text-white font-bold mt-1">
                    {impactData.baseAsset}: {impactData.baseAssetSentiment?.sentimentScore > 0 ? `+${impactData.baseAssetSentiment?.sentimentScore}` : impactData.baseAssetSentiment?.sentimentScore} pts vs {impactData.quoteAsset}: {impactData.quoteAssetSentiment?.sentimentScore > 0 ? `+${impactData.quoteAssetSentiment?.sentimentScore}` : impactData.quoteAssetSentiment?.sentimentScore} pts
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Net Pair Flow: <strong className={impactData.netSentimentScore > 0 ? 'text-emerald-400' : 'text-rose-400'}>{impactData.netSentimentScore > 0 ? `+${impactData.netSentimentScore}` : impactData.netSentimentScore} pts</strong>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase block">Volatility & Spread Spike</span>
                  <div className="text-xs text-amber-300 font-bold mt-1">
                    {impactData.volatilityExpectation?.expectedAtrMultiplier || 1.0}x normal ATR
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Spread hazard: <strong className="text-slate-200">{impactData.volatilityExpectation?.spreadSpikeRisk || 'LOW'}</strong> (~{impactData.volatilityExpectation?.typicalSpreadMultiplier || 1.0}x)
                  </div>
                </div>

                <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase block">Next Catalyst Event</span>
                  <div className="text-xs text-white font-bold mt-1 truncate">
                    {impactData.nextHighImpactEvent?.title || 'None in next 2 hours'}
                  </div>
                  <div className="text-[10px] text-cyan-400 mt-0.5">
                    {impactData.nextHighImpactEvent ? `Release in ${impactData.nextHighImpactEvent.minutesRemaining}m` : 'Stable macro landscape'}
                  </div>
                </div>
              </div>

              {impactData.actionablePrecautions?.length > 0 && (
                <div className="text-[11px] text-slate-300 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 font-sans">
                  <strong className="text-cyan-400 font-mono text-[10px] uppercase block mb-0.5">Actionable Rule:</strong>
                  {impactData.actionablePrecautions[0]}
                </div>
              )}
            </div>
          )}

          {/* Two Columns: Trading Sessions & Suggested Risk Parameters */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono">
            {/* Global Trading Sessions */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-cyan-400" />
                  <h3 className="font-bold text-sm text-white">Global Trading Sessions & Clocks</h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  Current UTC: <span className="text-cyan-300 font-bold">{String(currentGmtHour).padStart(2, '0')}:00</span>
                </span>
              </div>

              <div className="space-y-2.5">
                {profile.sessionWindows?.map((sw: any) => {
                  const isCurrent =
                    (sw.session === 'ASIAN' && currentGmtHour >= 0 && currentGmtHour < 9) ||
                    (sw.session === 'LONDON' && currentGmtHour >= 7 && currentGmtHour < 16) ||
                    (sw.session === 'NEW_YORK' && currentGmtHour >= 12 && currentGmtHour < 21) ||
                    (sw.session === 'LONDON_NY_OVERLAP' && currentGmtHour >= 12 && currentGmtHour < 16) ||
                    (sw.session === 'ROLLOVER' && currentGmtHour >= 21 && currentGmtHour < 23);

                  return (
                    <div
                      key={sw.session}
                      className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-all ${
                        isCurrent
                          ? 'bg-cyan-950/40 border-cyan-500/50 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800/60'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isCurrent ? 'text-cyan-300' : 'text-slate-200'}`}>
                            {sw.session.replace(/_/g, ' ')}
                          </span>
                          {isCurrent && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-sans">
                          {sw.typicalCharacteristics}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-slate-400">{sw.gmtHours}</div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getSessionActivityBadge(sw.activityLevel)}`}>
                          {sw.activityLevel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-800/60 text-xs text-slate-400">
                <span>Optimal Trading Window: </span>
                <span className="text-emerald-300 font-bold">{profile.bestSessionToTrade}</span>
              </div>
            </div>

            {/* Suggested Risk & Execution Profile */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  <h3 className="font-bold text-sm text-white">Suggested Risk & Execution Rules</h3>
                </div>
                <button
                  onClick={() => handleApplyRisk(profile.suggestedRiskParams)}
                  className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono transition-colors flex items-center gap-1"
                >
                  <Zap className="h-3 w-3" />
                  <span>Apply Parameters</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                  <div className="text-[10px] text-slate-500">Stop Loss Distance</div>
                  <div className="text-base font-bold text-rose-400 mt-0.5">
                    {profile.suggestedRiskParams?.stopLossPoints} pts
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Calibrated to 1.5x ATR</div>
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                  <div className="text-[10px] text-slate-500">Take Profit Distance</div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5">
                    {profile.suggestedRiskParams?.takeProfitPoints} pts
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Targeting 2:1 Reward:Risk</div>
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                  <div className="text-[10px] text-slate-500">Trailing Stop Distance</div>
                  <div className="text-base font-bold text-cyan-300 mt-0.5">
                    {profile.suggestedRiskParams?.trailingStopPoints} pts
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Step: {profile.suggestedRiskParams?.trailingStepPoints} pts</div>
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                  <div className="text-[10px] text-slate-500">Conservative Lot Size</div>
                  <div className="text-base font-bold text-white mt-0.5">
                    {profile.suggestedRiskParams?.lotSizeConservative} lots
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Max Hold: {profile.suggestedRiskParams?.maxRecommendedHoldBars} bars</div>
                </div>
              </div>

              {/* Operational Cautions */}
              {profile.executionCautions?.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    <span>Operational Warnings & Spread Sensitivity</span>
                  </div>
                  {profile.executionCautions.map((c: string, idx: number) => (
                    <p key={idx} className="text-[11px] text-amber-200/80 font-sans leading-relaxed">
                      • {c}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recommended Strategies for this Symbol */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4 font-mono">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-cyan-400" />
                <h3 className="font-bold text-sm text-white">
                  Recommended Algorithmic Strategies for {profile.symbol}
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-sans">
                Ranked by asset class volatility & liquidity match
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profile.recommendedStrategies?.map((strat: any) => (
                <div
                  key={strat.name}
                  className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-3 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-white">{strat.name}</h4>
                      <span className="text-[10px] text-cyan-400 font-mono">{strat.strategyType}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-emerald-400">
                        {strat.suitabilityScore}% Match
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                      style={{ width: `${strat.suitabilityScore}%` }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                    {strat.rationale}
                  </p>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      Optimal TF: {profile.optimalTimeframes?.dayTrading?.join(', ') || 'M1, M5'}
                    </span>
                    {onSelectStrategyTemplate && (
                      <button
                        onClick={() =>
                          onSelectStrategyTemplate({
                            name: strat.name,
                            type: strat.strategyType,
                            symbol: profile.symbol,
                            timeframe: profile.optimalTimeframes?.dayTrading?.[0] || 'M1',
                            parameters: {
                              stopLossPoints: profile.suggestedRiskParams?.stopLossPoints || 300,
                              takeProfitPoints: profile.suggestedRiskParams?.takeProfitPoints || 600,
                              lotSize: profile.suggestedRiskParams?.lotSizeConservative || 0.1,
                            },
                          })
                        }
                        className="text-cyan-400 hover:text-cyan-300 text-xs font-bold flex items-center gap-1"
                      >
                        <span>Select Template</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
