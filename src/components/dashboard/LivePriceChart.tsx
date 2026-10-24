import React, { useState, useEffect, useMemo } from 'react';
import { Position, TickData, CandleData, TechnicalIndicatorsResult, MT5ChartDiagnostics } from '../../types';
import { api } from '../../services/api';
import {
  BarChart3,
  TrendingUp,
  Activity,
  Layers,
  Download,
  Clock,
  Sparkles,
  Eye,
  EyeOff,
  Maximize2,
} from 'lucide-react';

interface LivePriceChartProps {
  symbol: string;
  history: { time: number; bid: number; ask: number }[];
  candles?: CandleData[];
  indicators?: TechnicalIndicatorsResult | null;
  chartDiagnostics?: MT5ChartDiagnostics | null;
  currentTick?: TickData;
  positions: Position[];
  currentTimeframe?: string;
  onSelectTimeframe?: (tf: string) => void;
  onRefresh?: () => void;
}

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export const LivePriceChart: React.FC<LivePriceChartProps> = ({
  symbol,
  history,
  candles = [],
  indicators,
  chartDiagnostics,
  currentTick,
  positions,
  currentTimeframe = 'M1',
  onSelectTimeframe,
  onRefresh,
}) => {
  const [chartMode, setChartMode] = useState<'candles' | 'ticks'>(
    candles && candles.length > 5 ? 'candles' : 'ticks'
  );
  const [activeTf, setActiveTf] = useState<string>(currentTimeframe || 'M1');
  const [showOverlays, setShowOverlays] = useState<boolean>(true);
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);
  const [localCandles, setLocalCandles] = useState<CandleData[]>(candles);
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const digits = symbol.includes('JPY') ? 3 : symbol.includes('USD') && symbol.length <= 6 ? 5 : 2;

  // Sync active timeframe if parent updates
  useEffect(() => {
    if (currentTimeframe && currentTimeframe !== activeTf) {
      setActiveTf(currentTimeframe);
    }
  }, [currentTimeframe]);

  // Keep local candles in sync with parent candles
  useEffect(() => {
    if (candles && candles.length > 0) {
      setLocalCandles(candles);
      if (chartMode === 'ticks' && history.length < 2) {
        setChartMode('candles');
      }
    }
  }, [candles]);

  // Real-time MT5 bar builder from live tick stream
  useEffect(() => {
    if (!currentTick || !currentTick.bid || currentTick.symbol.toUpperCase() !== symbol.toUpperCase()) {
      return;
    }
    setLocalCandles((prev) => {
      if (!prev || prev.length === 0) return prev;
      const lastIdx = prev.length - 1;
      const lastBar = { ...prev[lastIdx] };

      // Calculate timeframe period seconds
      const tfSecsMap: Record<string, number> = {
        M1: 60,
        M5: 300,
        M15: 900,
        M30: 1800,
        H1: 3600,
        H4: 14400,
        D1: 86400,
      };
      const pSecs = tfSecsMap[activeTf] || 60;
      const tickTs = currentTick.timeMsc ? Math.floor(currentTick.timeMsc / 1000) : (currentTick.time || Math.floor(Date.now() / 1000));
      const expectedBarTime = Math.floor(tickTs / pSecs) * pSecs;

      if (lastBar.time === expectedBarTime) {
        lastBar.close = currentTick.bid;
        if (currentTick.bid > lastBar.high) lastBar.high = currentTick.bid;
        if (currentTick.bid < lastBar.low) lastBar.low = currentTick.bid;
        lastBar.volume = (lastBar.volume || 0) + 1;
        const updated = [...prev];
        updated[lastIdx] = lastBar;
        return updated;
      } else if (expectedBarTime > lastBar.time) {
        lastBar.isClosed = true;
        const newBar: CandleData = {
          time: expectedBarTime,
          timeIso: new Date(expectedBarTime * 1000).toISOString(),
          open: currentTick.bid,
          high: currentTick.bid,
          low: currentTick.bid,
          close: currentTick.bid,
          volume: 1,
          tickCount: 1,
          spread: currentTick.spread || 0,
          isClosed: false,
        };
        const updated = [...prev.slice(1), newBar];
        return updated;
      }
      return prev;
    });
  }, [currentTick, symbol, activeTf]);

  // Handle switching timeframe & requesting from MT5 EA
  const handleTimeframeChange = async (tf: string) => {
    setActiveTf(tf);
    onSelectTimeframe?.(tf);
    setLoading(true);
    try {
      // 1. Fetch any cached bars from backend
      const res = await api.getChartHistory(symbol, tf, 100);
      if (res.candles && res.candles.length > 0) {
        setLocalCandles(res.candles);
        setChartMode('candles');
      }
      // 2. Proactively trigger EA to fetch fresh candles from MT5
      await api.pullChartHistory(symbol, tf, 100);
      setFeedback(`Requested 100 ${tf} bars from MT5 EA for ${symbol}`);
      onRefresh?.();
    } catch {
      setFeedback('Awaiting MT5 history response');
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleManualPull = async () => {
    setLoading(true);
    try {
      await api.pullChartHistory(symbol, activeTf, 100);
      const res = await api.getChartHistory(symbol, activeTf, 100);
      if (res.candles && res.candles.length > 0) {
        setLocalCandles(res.candles);
        setChartMode('candles');
      }
      setFeedback(`Synced ${activeTf} candles from MT5`);
      onRefresh?.();
    } catch {
      setFeedback('Failed to pull from MT5');
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Active positions on this symbol
  const relatedPositions = positions.filter((p) => p.symbol.toUpperCase() === symbol.toUpperCase());

  // Compute Tick SVG data
  const tickChartData = useMemo(() => {
    if (!history || history.length < 2) {
      return { pathData: '', minPrice: 0, maxPrice: 0, priceRange: 1, lastY: 50 };
    }

    const bids = history.map((h) => h.bid);
    let min = Math.min(...bids);
    let max = Math.max(...bids);

    const pad = (max - min) * 0.15 || 0.0001;
    min -= pad;
    max += pad;
    const range = max - min || 1;

    const width = 650;
    const height = 200;

    const points = history.map((pt, idx) => {
      const x = (idx / (history.length - 1)) * width;
      const y = height - ((pt.bid - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const path = `M ${points.join(' L ')}`;
    const lastPoint = history[history.length - 1];
    const curY = height - ((lastPoint.bid - min) / range) * height;

    return {
      pathData: path,
      minPrice: min + pad,
      maxPrice: max - pad,
      priceRange: range,
      lastY: curY,
    };
  }, [history]);

  // Compute Candlestick SVG data
  const candleChartData = useMemo(() => {
    const rawList = localCandles.length > 0 ? localCandles : candles;
    if (!rawList || rawList.length < 2) {
      return null;
    }

    const count = rawList.length;
    const lows = rawList.map((c) => c.low);
    const highs = rawList.map((c) => c.high);
    const volumes = rawList.map((c) => c.volume);

    let minPrice = Math.min(...lows);
    let maxPrice = Math.max(...highs);
    const maxVolume = Math.max(...volumes, 1);

    const pad = (maxPrice - minPrice) * 0.10 || 0.0002;
    minPrice -= pad;
    maxPrice += pad;
    const priceRange = maxPrice - minPrice || 1;

    const svgWidth = 650;
    const svgHeight = 220;
    const candleAreaHeight = 170; // Top area for candles
    const volumeAreaTop = 175;
    const volumeAreaHeight = 40;

    const candleSpacing = svgWidth / count;
    const candleWidth = Math.max(2, Math.min(12, candleSpacing * 0.7));

    // Price to Y converter
    const priceToY = (p: number) => {
      return candleAreaHeight - ((p - minPrice) / priceRange) * (candleAreaHeight - 15) + 10;
    };

    // Calculate EMA lines across candles if available
    const ema9Points: string[] = [];
    const ema21Points: string[] = [];
    let k9 = 2 / (9 + 1);
    let k21 = 2 / (21 + 1);
    let curEma9 = rawList[0].close;
    let curEma21 = rawList[0].close;

    rawList.forEach((c, idx) => {
      curEma9 = c.close * k9 + curEma9 * (1 - k9);
      curEma21 = c.close * k21 + curEma21 * (1 - k21);
      const x = idx * candleSpacing + candleSpacing / 2;
      ema9Points.push(`${x.toFixed(1)},${priceToY(curEma9).toFixed(1)}`);
      ema21Points.push(`${x.toFixed(1)},${priceToY(curEma21).toFixed(1)}`);
    });

    const renderedBars = rawList.map((c, idx) => {
      const centerX = idx * candleSpacing + candleSpacing / 2;
      const leftX = centerX - candleWidth / 2;
      const isBull = c.close >= c.open;

      const highY = priceToY(c.high);
      const lowY = priceToY(c.low);
      const openY = priceToY(c.open);
      const closeY = priceToY(c.close);

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(openY - closeY));

      const volHeight = Math.max(2, (c.volume / maxVolume) * volumeAreaHeight);
      const volY = svgHeight - volHeight;

      return {
        candle: c,
        idx,
        centerX,
        leftX,
        candleWidth,
        isBull,
        highY,
        lowY,
        bodyTop,
        bodyHeight,
        volHeight,
        volY,
      };
    });

    return {
      count,
      minPrice,
      maxPrice,
      priceRange,
      renderedBars,
      priceToY,
      ema9Path: ema9Points.length > 1 ? `M ${ema9Points.join(' L ')}` : '',
      ema21Path: ema21Points.length > 1 ? `M ${ema21Points.join(' L ')}` : '',
    };
  }, [localCandles, candles]);

  const activeCandleToDisplay = hoveredCandle || (localCandles.length > 0 ? localCandles[localCandles.length - 1] : null);

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-3">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
            {chartMode === 'candles' ? <BarChart3 className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white font-mono">{symbol}</span>
              <span className="text-[11px] font-mono px-2 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {activeTf}
              </span>
              {currentTick && (
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {currentTick.bid.toFixed(digits)}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              {chartMode === 'candles' ? 'MetaTrader 5 Real OHLCV Candlesticks' : 'Sub-Second Live Tick Trajectory'}
            </p>
          </div>
        </div>

        {/* Action Controls & Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => handleTimeframeChange(tf)}
                disabled={loading}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all ${
                  activeTf === tf
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setChartMode('candles')}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                chartMode === 'candles'
                  ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-800/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Candles
            </button>
            <button
              onClick={() => setChartMode('ticks')}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                chartMode === 'ticks'
                  ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-800/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ticks
            </button>
          </div>

          {/* Overlay Toggle for Indicators */}
          {chartMode === 'candles' && (
            <button
              onClick={() => setShowOverlays(!showOverlays)}
              title={showOverlays ? 'Hide EMA Overlays' : 'Show EMA Overlays'}
              className={`p-1.5 rounded-lg border text-xs font-mono transition-all ${
                showOverlays
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              {showOverlays ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          )}

          {/* Sync Button */}
          <button
            onClick={handleManualPull}
            disabled={loading}
            title="Request fresh historical bars from MT5 EA"
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Download className="h-3 w-3 text-cyan-400" />
            <span>{loading ? 'Syncing...' : 'Pull MT5'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-1.5 px-3 rounded bg-cyan-950/60 border border-cyan-800/50 text-[11px] font-mono text-cyan-300 flex items-center gap-2">
          <Activity className="h-3 w-3 text-emerald-400 animate-pulse" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Candlestick HUD Bar when hovering or showing latest candle */}
      {chartMode === 'candles' && activeCandleToDisplay && (
        <div className="flex flex-wrap items-center justify-between text-[11px] font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800/70">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              {activeCandleToDisplay.timeIso
                ? activeCandleToDisplay.timeIso.replace('T', ' ').slice(0, 19)
                : new Date(activeCandleToDisplay.time * 1000).toISOString().replace('T', ' ').slice(0, 19)}
            </span>
            <span>
              O: <strong className="text-slate-200">{activeCandleToDisplay.open.toFixed(digits)}</strong>
            </span>
            <span>
              H: <strong className="text-emerald-400">{activeCandleToDisplay.high.toFixed(digits)}</strong>
            </span>
            <span>
              L: <strong className="text-rose-400">{activeCandleToDisplay.low.toFixed(digits)}</strong>
            </span>
            <span>
              C: <strong className={activeCandleToDisplay.close >= activeCandleToDisplay.open ? 'text-emerald-400' : 'text-rose-400'}>
                {activeCandleToDisplay.close.toFixed(digits)}
              </strong>
            </span>
            <span>
              Vol: <strong className="text-cyan-300">{activeCandleToDisplay.volume.toLocaleString()}</strong>
            </span>
          </div>

          {showOverlays && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-cyan-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> EMA 9
              </span>
              <span className="text-amber-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> EMA 21
              </span>
            </div>
          )}
        </div>
      )}

      {/* SVG Canvas Area */}
      <div className="relative w-full h-[220px] bg-slate-950 border border-slate-800/80 rounded-lg overflow-hidden flex items-center justify-center">
        {chartMode === 'candles' && candleChartData && candleChartData.renderedBars.length >= 2 ? (
          <>
            <svg
              viewBox="0 0 650 220"
              preserveAspectRatio="none"
              className="w-full h-full overflow-visible select-none"
              onMouseLeave={() => setHoveredCandle(null)}
            >
              <defs>
                <linearGradient id="bullVolGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="bearVolGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="40" x2="650" y2="40" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="650" y2="90" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="140" x2="650" y2="140" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="175" x2="650" y2="175" stroke="#334155" strokeDasharray="2 2" />

              {/* Volume Bars */}
              {candleChartData.renderedBars.map((b) => (
                <rect
                  key={`vol-${b.idx}`}
                  x={b.leftX}
                  y={b.volY}
                  width={b.candleWidth}
                  height={b.volHeight}
                  fill={b.isBull ? 'url(#bullVolGrad)' : 'url(#bearVolGrad)'}
                />
              ))}

              {/* Candlestick Wicks & Bodies */}
              {candleChartData.renderedBars.map((b) => {
                const color = b.isBull ? '#10b981' : '#f43f5e';
                return (
                  <g
                    key={`c-${b.idx}`}
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoveredCandle(b.candle)}
                  >
                    {/* Wick Line */}
                    <line
                      x1={b.centerX}
                      y1={b.highY}
                      x2={b.centerX}
                      y2={b.lowY}
                      stroke={color}
                      strokeWidth="1.2"
                    />
                    {/* Candle Body */}
                    <rect
                      x={b.leftX}
                      y={b.bodyTop}
                      width={b.candleWidth}
                      height={b.bodyHeight}
                      fill={color}
                      rx="1"
                    />
                    {/* Transparent touch area for hover detection */}
                    <rect
                      x={b.leftX - 2}
                      y={0}
                      width={b.candleWidth + 4}
                      height={220}
                      fill="transparent"
                    />
                  </g>
                );
              })}

              {/* Technical Overlays (EMA 9 and EMA 21) */}
              {showOverlays && candleChartData.ema9Path && (
                <path
                  d={candleChartData.ema9Path}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
              {showOverlays && candleChartData.ema21Path && (
                <path
                  d={candleChartData.ema21Path}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}

              {/* Position markers on chart */}
              {relatedPositions.map((pos) => {
                const posY = candleChartData.priceToY(pos.openPrice);
                if (posY >= 0 && posY <= 175) {
                  return (
                    <g key={pos.ticket}>
                      <line
                        x1="0"
                        y1={posY}
                        x2="650"
                        y2={posY}
                        stroke={pos.type === 'BUY' ? '#10b981' : '#f43f5e'}
                        strokeWidth="1.2"
                        strokeDasharray="5 3"
                      />
                    </g>
                  );
                }
                return null;
              })}

              {/* MT5 Real-time Live Bid Line */}
              {(() => {
                const livePrice = currentTick?.bid || (activeCandleToDisplay ? activeCandleToDisplay.close : null);
                if (livePrice && candleChartData) {
                  const liveY = candleChartData.priceToY(livePrice);
                  if (liveY >= 0 && liveY <= 175) {
                    return (
                      <g>
                        <line
                          x1="0"
                          y1={liveY}
                          x2="650"
                          y2={liveY}
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                          strokeDasharray="4 2"
                        />
                        <circle cx="645" cy={liveY} r="3" fill="#38bdf8" />
                      </g>
                    );
                  }
                }
                return null;
              })()}
            </svg>

            {/* Price labels on right edge */}
            <div className="absolute right-2 top-2 bg-slate-900/90 border border-slate-700/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-cyan-300">
              High: {candleChartData.maxPrice.toFixed(digits)}
            </div>
            {/* Live MT5 Bid & Bar Countdown Badge */}
            <div className="absolute right-2 top-8 bg-cyan-950/90 border border-cyan-500/80 px-2 py-0.5 rounded text-[11px] font-mono font-bold text-cyan-300 shadow-md flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>Bid: {(currentTick?.bid || activeCandleToDisplay?.close || 0).toFixed(digits)}</span>
              {(() => {
                const secs = chartDiagnostics?.barRemainingSeconds ?? chartDiagnostics?.currentBarSecondsRemaining;
                if (secs !== undefined && secs > 0) {
                  return (
                    <span className="text-[9px] text-cyan-400/80 border-l border-cyan-700 pl-1.5">
                      {secs}s
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            <div className="absolute right-2 bottom-7 bg-slate-900/90 border border-slate-700/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400">
              Low: {candleChartData.minPrice.toFixed(digits)}
            </div>

            {/* Position Badges on Chart */}
            {relatedPositions.map((pos) => (
              <div
                key={pos.ticket}
                className={`absolute left-2 top-2 text-[10px] font-mono px-2 py-0.5 rounded border ${
                  pos.type === 'BUY'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                    : 'bg-rose-950/80 text-rose-300 border-rose-700'
                }`}
              >
                {pos.type} #{pos.ticket} @ {pos.openPrice.toFixed(digits)} (PnL: ${pos.profit})
              </div>
            ))}
          </>
        ) : chartMode === 'ticks' && history && history.length >= 2 ? (
          <>
            <svg
              viewBox="0 0 650 200"
              preserveAspectRatio="none"
              className="w-full h-full stroke-cyan-400 stroke-2 fill-none overflow-visible"
            >
              <defs>
                <linearGradient id="tickGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="50" x2="650" y2="50" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="100" x2="650" y2="100" stroke="#1e293b" strokeDasharray="3 3" />
              <line x1="0" y1="150" x2="650" y2="150" stroke="#1e293b" strokeDasharray="3 3" />

              {/* Area under curve */}
              <path
                d={`${tickChartData.pathData} L 650 200 L 0 200 Z`}
                fill="url(#tickGradient)"
                stroke="none"
              />

              {/* Tick price line */}
              <path d={tickChartData.pathData} stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />

              {/* Current price marker dot */}
              <circle cx="650" cy={tickChartData.lastY} r="4" fill="#38bdf8" className="animate-ping" />
              <circle cx="650" cy={tickChartData.lastY} r="3" fill="#38bdf8" />
            </svg>

            {/* Price labels */}
            <div className="absolute right-2 top-2 bg-slate-900/90 border border-slate-700/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-cyan-300">
              High: {tickChartData.maxPrice.toFixed(digits)}
            </div>
            <div className="absolute right-2 bottom-2 bg-slate-900/90 border border-slate-700/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400">
              Low: {tickChartData.minPrice.toFixed(digits)}
            </div>
          </>
        ) : (
          <div className="text-slate-400 text-xs font-mono flex flex-col items-center gap-2 p-6 text-center">
            <TrendingUp className="h-6 w-6 text-cyan-400" />
            <span className="font-semibold text-slate-300">Awaiting Candlesticks / Ticks for {symbol}</span>
            <span className="text-[11px] text-slate-500 max-w-sm">
              Click &quot;Pull MT5&quot; or attach AIMT5Bridge.mq5 to stream real bars and live quotes.
            </span>
            <button
              onClick={handleManualPull}
              disabled={loading}
              className="mt-2 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow"
            >
              Request {activeTf} Candles Now
            </button>
          </div>
        )}
      </div>

      {/* Footer metrics bar */}
      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-500 pt-1">
        <div className="flex items-center gap-3">
          <span>
            Mode: <strong className="text-slate-300">{chartMode === 'candles' ? 'OHLCV Bars' : 'Tick Trajectory'}</strong>
          </span>
          {chartMode === 'candles' && (
            <span>
              Bars: <strong className="text-cyan-300">{localCandles.length || candles.length}</strong>
            </span>
          )}
          {chartDiagnostics && (
            <span className="flex items-center gap-1 text-amber-300/90">
              <Clock className="h-3 w-3" />
              <span>Bar 0: {chartDiagnostics.barRemainingSeconds}s left ({chartDiagnostics.barProgressPct}%)</span>
            </span>
          )}
        </div>

        {currentTick && (
          <div className="flex items-center gap-3">
            <span>Spread: <strong className="text-cyan-300">{currentTick.spread} pts</strong></span>
            <span>24h Range: <strong className="text-slate-300">{currentTick.low24h?.toFixed(digits) || '—'} - {currentTick.high24h?.toFixed(digits) || '—'}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
};
