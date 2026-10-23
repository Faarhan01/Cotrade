import React, { useState, useEffect } from 'react';
import {
  Globe,
  Calendar,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  Clock,
  Filter,
  Zap,
  ArrowRight,
  Shield,
  Layers,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../services/api';

interface MacroNewsTabProps {
  initialSymbol?: string;
}

export const MacroNewsTab: React.FC<MacroNewsTabProps> = ({ initialSymbol = 'EURUSD' }) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [impactData, setImpactData] = useState<any | null>(null);
  const [newsItems, setNewsItems] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [newsCorrelation, setNewsCorrelation] = useState<any | null>(null);
  const [shocksData, setShocksData] = useState<any | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const categories = ['ALL', 'FOREX', 'CRYPTO', 'COMMODITY', 'MACRO', 'CENTRAL_BANK'];
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US30'];

  const loadData = async (sym: string, cat: string) => {
    try {
      setLoading(true);
      setError(null);

      const targetSym = sym === 'ALL' ? 'EURUSD' : sym;
      const [impactRes, newsRes, calRes, corrRes, shocksRes] = await Promise.all([
        api.getKnowledgeImpact(sym).catch(() => ({ success: false, impact: null })),
        api.getKnowledgeNews(sym === 'ALL' ? undefined : sym, cat === 'ALL' ? undefined : cat).catch(() => ({ success: false, news: [] })),
        api.getKnowledgeCalendar(sym === 'ALL' ? undefined : sym).catch(() => ({ success: false, events: [], activeAlerts: [] })),
        api.getNewsImpactCorrelation(targetSym).catch(() => null),
        api.getRapidShocks(targetSym).catch(() => null),
      ]);

      if (impactRes.success && impactRes.impact) {
        setImpactData(impactRes.impact);
      }
      if (newsRes.success && newsRes.news) {
        setNewsItems(newsRes.news);
      }
      if (calRes.success) {
        setCalendarEvents(calRes.events || []);
        setActiveAlerts(calRes.activeAlerts || []);
      }
      if (corrRes?.success) {
        setNewsCorrelation(corrRes);
      }
      if (shocksRes?.success) {
        setShocksData(shocksRes);
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading market intelligence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(symbol, selectedCategory);
  }, [symbol, selectedCategory]);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'CRITICAL':
        return 'text-rose-400 bg-rose-950/70 border-rose-800 animate-pulse';
      case 'HIGH':
        return 'text-amber-400 bg-amber-950/70 border-amber-800';
      case 'MODERATE':
        return 'text-sky-400 bg-sky-950/70 border-sky-800';
      default:
        return 'text-emerald-400 bg-emerald-950/70 border-emerald-800';
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'HIGH':
        return 'text-rose-400 border-rose-800 bg-rose-950/50';
      case 'MEDIUM':
        return 'text-amber-400 border-amber-800 bg-amber-950/50';
      default:
        return 'text-slate-400 border-slate-800 bg-slate-950/50';
    }
  };

  const getBiasBadgeColor = (dir: string) => {
    switch (dir) {
      case 'STRONG_BUY':
        return 'text-emerald-300 bg-emerald-950 border-emerald-700';
      case 'BUY':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
      case 'STRONG_SELL':
        return 'text-rose-300 bg-rose-950 border-rose-700';
      case 'SELL':
        return 'text-rose-400 bg-rose-950/60 border-rose-800';
      default:
        return 'text-slate-300 bg-slate-900 border-slate-700';
    }
  };

  const getScalpingBadge = (viability: string) => {
    switch (viability) {
      case 'PROHIBITED':
        return 'text-rose-400 bg-rose-950/80 border-rose-800';
      case 'RESTRICTED':
        return 'text-amber-400 bg-amber-950/80 border-amber-800';
      case 'ACCEPTABLE':
        return 'text-sky-400 bg-sky-950/80 border-sky-800';
      default:
        return 'text-emerald-400 bg-emerald-950/80 border-emerald-800';
    }
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Top Filter Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Symbol Focus:</span>
            {symbols.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  symbol === s
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 border-l border-slate-800 pl-3 flex-wrap">
            <span>Category:</span>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCategory(c)}
                className={`px-2 py-0.5 rounded text-xs ${
                  selectedCategory === c
                    ? 'bg-slate-700 text-white font-bold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {c.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => loadData(symbol, selectedCategory)}
          disabled={loading}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Refresh News & Macro Events"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary Impact & Event Risk Summary Card */}
      {impactData && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
          {/* Header Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-wider">
                <Globe className="h-3.5 w-3.5 text-cyan-400" />
                <span>Macro News Impact & Asset Decomposition for {impactData.symbol} ({impactData.assetClass})</span>
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getBiasBadgeColor(impactData.directionalBias?.direction || 'NEUTRAL')}`}>
                  {impactData.directionalBias?.direction?.replace(/_/g, ' ') || impactData.overallSentiment} ({impactData.directionalBias?.confidence || 50}% CONV)
                </span>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getRiskColor(impactData.eventRiskLevel)}`}>
                  {impactData.eventRiskLevel} EVENT RISK
                </span>
                <span className="text-xs text-slate-400">
                  Net Pair Pressure:{' '}
                  <span className={`font-bold ${impactData.netSentimentScore > 0 ? 'text-emerald-400' : impactData.netSentimentScore < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                    {impactData.netSentimentScore > 0 ? `+${impactData.netSentimentScore}` : impactData.netSentimentScore} pts
                  </span>
                </span>
              </div>
            </div>

            <div className="text-left md:text-right">
              <span className="text-[10px] text-slate-500 uppercase">Upcoming Catalyst</span>
              <div className="text-sm font-bold text-white mt-0.5">
                {impactData.nextHighImpactEvent ? (
                  <span className="text-amber-400">
                    {impactData.nextHighImpactEvent.title} in {impactData.nextHighImpactEvent.minutesRemaining}m
                  </span>
                ) : (
                  <span>{calendarEvents.length} Events Scheduled</span>
                )}
              </div>
            </div>
          </div>

          {/* Currency Balance of Power (Base vs Quote Decomposition) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Base Currency Box */}
            <div className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px]">
                    BASE
                  </span>
                  {impactData.baseAsset} Sentiment ({impactData.baseAssetSentiment?.outlook})
                </span>
                <span className={`text-xs font-bold ${impactData.baseAssetSentiment?.sentimentScore >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {impactData.baseAssetSentiment?.sentimentScore >= 0 ? `+${impactData.baseAssetSentiment?.sentimentScore}` : impactData.baseAssetSentiment?.sentimentScore} pts
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${impactData.baseAssetSentiment?.sentimentScore >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(100, Math.max(10, Math.abs(impactData.baseAssetSentiment?.sentimentScore || 0)))}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                Positive catalysts for {impactData.baseAsset} provide direct upward lift to {impactData.symbol}.
              </p>
            </div>

            {/* Quote Currency Box */}
            <div className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px]">
                    QUOTE
                  </span>
                  {impactData.quoteAsset} Sentiment ({impactData.quoteAssetSentiment?.outlook})
                </span>
                <span className={`text-xs font-bold ${impactData.quoteAssetSentiment?.sentimentScore >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {impactData.quoteAssetSentiment?.sentimentScore >= 0 ? `+${impactData.quoteAssetSentiment?.sentimentScore}` : impactData.quoteAssetSentiment?.sentimentScore} pts
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${impactData.quoteAssetSentiment?.sentimentScore >= 0 ? 'bg-purple-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(100, Math.max(10, Math.abs(impactData.quoteAssetSentiment?.sentimentScore || 0)))}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                Positive news for {impactData.quoteAsset} strengthens the quote currency and exerts <span className="text-rose-400 font-bold">downward</span> pressure on {impactData.symbol}.
              </p>
            </div>
          </div>

          {/* Volatility & Spread Surge Indicators */}
          {impactData.volatilityExpectation && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase block">Expected ATR Multiplier</span>
                <span className="text-base font-bold text-amber-300 mt-0.5 block">
                  {impactData.volatilityExpectation.expectedAtrMultiplier}x normal
                </span>
                <span className="text-[10px] text-slate-500">
                  State: {impactData.volatilityExpectation.volatilityState}
                </span>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase block">Spread Spike Risk</span>
                <span className={`text-base font-bold mt-0.5 block ${impactData.volatilityExpectation.spreadSpikeRisk === 'CRITICAL' ? 'text-rose-400' : impactData.volatilityExpectation.spreadSpikeRisk === 'SEVERE' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {impactData.volatilityExpectation.spreadSpikeRisk}
                </span>
                <span className="text-[10px] text-slate-500">
                  ~{impactData.volatilityExpectation.typicalSpreadMultiplier}x wider
                </span>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase block">Execution Slippage</span>
                <span className={`text-base font-bold mt-0.5 block ${impactData.volatilityExpectation.slippageHazardRating === 'HAZARDOUS' ? 'text-rose-400' : impactData.volatilityExpectation.slippageHazardRating === 'CAUTION' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {impactData.volatilityExpectation.slippageHazardRating}
                </span>
                <span className="text-[10px] text-slate-500">Broker liquidity depth</span>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase block">Scalping Viability</span>
                <span className={`text-base font-bold mt-0.5 block ${impactData.volatilityExpectation.scalpingViability === 'PROHIBITED' ? 'text-rose-400' : impactData.volatilityExpectation.scalpingViability === 'RESTRICTED' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {impactData.volatilityExpectation.scalpingViability}
                </span>
                <span className="text-[10px] text-slate-500">M1/M5 algorithmic rules</span>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase block">Suggested Stop Buffer</span>
                <span className="text-base font-bold text-cyan-300 mt-0.5 block">
                  +{impactData.suggestedStopBufferPoints} pts
                </span>
                <span className="text-[10px] text-slate-500">Prevents whip-saw stopout</span>
              </div>
            </div>
          )}

          {/* Actionable AI Market Flow Analysis */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-cyan-300 uppercase font-bold tracking-wider">
                Macroeconomic Thesis & Execution Recommendation
              </span>
            </div>
            <p className="text-xs text-slate-200 font-sans leading-relaxed">
              {impactData.tradingRecommendation}
            </p>
            {impactData.directionalBias?.driverExplanation && (
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed pt-1 border-t border-slate-800/60">
                {impactData.directionalBias.driverExplanation}
              </p>
            )}
          </div>

          {/* Tactical Precautions & Historical Reaction */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Precautions */}
            <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
              <span className="text-[11px] text-amber-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                Actionable Trading Precautions
              </span>
              <ul className="space-y-1.5">
                {impactData.actionablePrecautions?.map((prec: string, idx: number) => (
                  <li key={idx} className="text-xs text-slate-300 font-sans flex items-start gap-2">
                    <span className="text-amber-400 font-bold">•</span>
                    <span>{prec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Historical Reaction Tendency */}
            <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
              <span className="text-[11px] text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-cyan-400" />
                Historical Reaction Tendency
              </span>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                {impactData.historicalReactionTendency}
              </p>
            </div>
          </div>

          {/* Driving Catalysts Table */}
          {impactData.drivingCatalysts?.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-cyan-400" />
                  Key Catalysts Influencing {impactData.symbol}
                </span>
                <span className="text-[10px] text-slate-500">Decomposed by pair direct impact</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {impactData.drivingCatalysts.map((cat: any, i: number) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg text-xs space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-white leading-snug line-clamp-1">
                        {cat.headlineOrTitle}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${
                          cat.directImpactOnPair === 'BULLISH'
                            ? 'text-emerald-400 bg-emerald-950 border-emerald-800'
                            : cat.directImpactOnPair === 'BEARISH'
                            ? 'text-rose-400 bg-rose-950 border-rose-800'
                            : 'text-slate-400 bg-slate-900 border-slate-800'
                        }`}
                      >
                        {cat.directImpactOnPair} ON {impactData.symbol}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                      {cat.rationale}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                      <span>Target: <strong className="text-slate-300">{cat.targetAsset}</strong></span>
                      <span>{cat.timingLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Urgent Macro Alerts if any */}
          {activeAlerts.length > 0 && (
            <div className="p-3.5 bg-rose-950/30 border border-rose-800/60 rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                <ShieldAlert className="h-4 w-4 text-rose-400 animate-pulse" />
                <span>Urgent Macro Event Alerts Active</span>
              </div>
              {activeAlerts.map((alt, i) => (
                <p key={i} className="text-xs text-rose-200/90 font-sans">
                  • {alt}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Symbol Volatility & Caught News Impact Detector */}
      {newsCorrelation && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Activity className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Symbol Volatility & News Impact Detector ({newsCorrelation.symbol})
                </h3>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  KnowledgeBase auto-detector analyzes high-impact macroeconomic releases against real candle bars and measures displacement & whipsaw spikes.
                </p>
              </div>
            </div>

            {newsCorrelation.hazardWarning && (
              <span className="px-2.5 py-1 rounded-lg bg-rose-950/80 text-rose-300 border border-rose-800 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                Active News Hazard Guard
              </span>
            )}
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Events Greatly Affecting</span>
              <span className="text-base font-bold text-cyan-300 mt-1 block">
                {newsCorrelation.affectedEventsCount || 0} Events
              </span>
              <span className="text-[10px] text-slate-500 font-sans">Bar range &gt; 2x ATR or &gt; 20 pips</span>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Avg Pip Displacement</span>
              <span className="text-base font-bold text-amber-300 mt-1 block">
                {newsCorrelation.averageDisplacementPips?.toFixed(1) || 0} pips
              </span>
              <span className="text-[10px] text-slate-500 font-sans">Initial release impulse</span>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Whipsaw Liquidation Risk</span>
              <span className="text-base font-bold text-rose-400 mt-1 block">
                {newsCorrelation.whipsawProbabilityPct?.toFixed(1) || 0}%
              </span>
              <span className="text-[10px] text-slate-500 font-sans">Multi-directional spike</span>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Baseline Candle ATR</span>
              <span className="text-base font-bold text-slate-200 mt-1 block">
                {newsCorrelation.baselineAtrPoints?.toFixed(1) || 0} pts
              </span>
              <span className="text-[10px] text-slate-500 font-sans">Normal quiet volatility</span>
            </div>
          </div>

          {/* Caught Events Table */}
          {newsCorrelation.affectedEvents && newsCorrelation.affectedEvents.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Caught News Releases Greatly Affecting {newsCorrelation.symbol}
              </span>
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Catalyst Title</th>
                      <th className="py-2.5 px-3">Currency</th>
                      <th className="py-2.5 px-3">Release Time</th>
                      <th className="py-2.5 px-3">Displacement</th>
                      <th className="py-2.5 px-3">Vol Multiplier</th>
                      <th className="py-2.5 px-3">Whipsaw?</th>
                      <th className="py-2.5 px-3">System Protection</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {newsCorrelation.affectedEvents.map((ev: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3">
                          <span className="font-bold text-white block">{ev.event?.title}</span>
                          <span className="text-[10px] text-slate-400 font-sans block">{ev.explanation}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] font-bold border border-slate-700">
                            {ev.event?.currency}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[11px]">
                          {ev.candleTimeStr || new Date(ev.candleTime * 1000).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-3 font-bold text-amber-300">
                          {ev.pipDisplacement?.toFixed(1)} pips
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              ev.volatilityMultiplier >= 2.5
                                ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {ev.volatilityMultiplier?.toFixed(2)}x ATR
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {ev.isWhipsaw ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-semibold">
                              Whipsaw Spike
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              Impulse
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                            {ev.actionTaken || 'Suppressed Entry'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {newsCorrelation.recommendedAction && (
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg text-xs font-sans text-slate-300 flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>
                <strong className="text-white">KnowledgeBase Recommendation:</strong> {newsCorrelation.recommendedAction}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Rapid Sudden Movement & Attributed News Catalysts Section */}
      {shocksData && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Zap className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Rapid Sudden Movements & News Event Attribution</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] border border-slate-700">
                    {shocksData.symbol} [{shocksData.timeframe}]
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  Autonomous shock detector pinpoints volatility impulses (&gt;2.3x ATR) and connects each sudden spike to its driving news release.
                </p>
              </div>
            </div>

            {shocksData.coolingStatus?.inShock && (
              <span className="px-3 py-1 rounded-lg bg-amber-950 text-amber-300 border border-amber-800 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                Active Shock Cooling Period ({shocksData.coolingStatus.shock?.coolingOffMinutesRemaining}m)
              </span>
            )}
          </div>

          {shocksData.shocks?.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg font-sans">
              No recent volatility anomalies or rapid sudden spikes exceeding 2.3x ATR on {shocksData.symbol}. Order book stability is normal.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {shocksData.shocks.slice(0, 6).map((shock: any) => {
                  const hasNews = Boolean(shock.attributedCatalyst);
                  const isWhipsaw = shock.shockType === 'WHIPSAW_LIQUIDATION';
                  const isBull = shock.pipDisplacement > 0;

                  return (
                    <div
                      key={shock.id}
                      className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                          shock.severity === 'CRITICAL'
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : shock.severity === 'HIGH'
                            ? 'bg-amber-950 text-amber-300 border-amber-800'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {shock.shockType.replace(/_/g, ' ')}
                        </span>
                        <span className={`font-bold font-mono ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isBull ? '+' : ''}{shock.pipDisplacement} pips ({shock.volatilityAtrMultiplier}x ATR)
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 font-sans">
                        <span className="font-bold text-slate-300">Reaction:</span> {shock.reactionType.replace(/_/g, ' ')}
                      </div>

                      {hasNews ? (
                        <div className="p-2 rounded bg-slate-900 border border-cyan-900/50 space-y-1">
                          <div className="text-[10px] uppercase font-bold text-cyan-400 flex items-center justify-between">
                            <span>Driving Catalyst</span>
                            <span className="text-emerald-400 font-mono">{shock.attributedCatalyst.attributionConfidence}% Match</span>
                          </div>
                          <div className="font-bold text-white text-[11px] leading-snug line-clamp-2">
                            {shock.attributedCatalyst.title}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-0.5">
                            <span>{shock.attributedCatalyst.currencyOrAsset}</span>
                            <span>{Math.round(shock.attributedCatalyst.timeDeltaSeconds / 60)}m delta</span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 italic">
                          Technical liquidity run or order book gap (no matching contemporaneous headline).
                        </div>
                      )}

                      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>Speed: {shock.pipVelocityPipsPerMinute} pips/min</span>
                        <span>{new Date(shock.timestamp * 1000).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Two Column Grid: Live News Stream & Economic Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* News Stream */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-400" />
              <h3 className="font-bold text-sm text-white">Financial News Feed</h3>
            </div>
            <span className="text-xs text-slate-500">{newsItems.length} articles</span>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {newsItems.length === 0 ? (
              <p className="text-xs text-slate-500 p-6 text-center border border-dashed border-slate-800 rounded-lg">
                No news articles found for current filter.
              </p>
            ) : (
              newsItems.map((n) => (
                <div
                  key={n.id}
                  className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-xs text-white leading-snug">{n.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${getImpactBadge(n.impact)}`}>
                      {n.impact}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                    {n.summary}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400">{n.source}</span>
                      <span aria-hidden="true">·</span>
                      <span className={n.sentiment === 'BULLISH' ? 'text-emerald-400' : n.sentiment === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}>
                        {n.sentiment} ({n.sentimentScore > 0 ? `+${n.sentimentScore}` : n.sentimentScore})
                      </span>
                    </div>

                    {n.url && (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-cyan-400 flex items-center gap-1"
                      >
                        <span>Source</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Macroeconomic Calendar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Macroeconomic Calendar</h3>
            </div>
            <span className="text-xs text-slate-500">{calendarEvents.length} events</span>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {calendarEvents.length === 0 ? (
              <p className="text-xs text-slate-500 p-6 text-center border border-dashed border-slate-800 rounded-lg">
                No high-impact calendar events scheduled.
              </p>
            ) : (
              calendarEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                          {evt.currency}
                        </span>
                        <span className="font-bold text-xs text-white">{evt.title}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${getImpactBadge(evt.impact)}`}>
                      {evt.impact}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                    {evt.description}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                    <div>
                      <span className="text-slate-500">Forecast: </span>
                      <span className="text-white font-bold">{evt.forecast || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Previous: </span>
                      <span className="text-white font-bold">{evt.previous || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Actual: </span>
                      <span className={`font-bold ${evt.actual ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {evt.actual || 'Pending'}
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 pt-1 flex items-center justify-between">
                    <span>Pairs: {evt.affectedSymbols?.slice(0, 4).join(', ')}</span>
                    <span className="text-slate-400">
                      {evt.scheduledTimeIso ? new Date(evt.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'}
                    </span>
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
