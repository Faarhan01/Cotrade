import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Position,
  TickData,
  CandleData,
  TechnicalIndicatorsResult,
  MT5ChartDiagnostics,
  ChartSymbolInfo,
  DetailedSymbolInfo,
  MT5TerminalPermissions,
  MarketDepthItem,
} from '../../types';
import { api } from '../../services/api';
import { getSymbolDigits, getSymbolPoint } from '../../utils/symbolEconomics';
import {
  BarChart3,
  TrendingUp,
  Download,
  Clock,
  Activity,
  ChevronDown,
  Maximize2,
  Minimize2,
  Info,
  RefreshCw,
  Search,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Zap,
  ArrowUp,
  ArrowDown,
  Layers,
} from 'lucide-react';

interface LivePriceChartProps {
  symbol: string;
  history?: { time: number; bid: number; ask: number }[];
  candles?: CandleData[];
  indicators?: TechnicalIndicatorsResult | null;
  chartDiagnostics?: MT5ChartDiagnostics | null;
  terminalPermissions?: MT5TerminalPermissions | null;
  currentChart?: ChartSymbolInfo | null;
  allSymbols?: DetailedSymbolInfo[];
  ticks?: TickData[];
  currentTick?: TickData;
  positions?: Position[];
  marketDepth?: Record<string, { bids: MarketDepthItem[]; asks: MarketDepthItem[] }>;
  currentTimeframe?: string;
  onSelectSymbol?: (symbol: string) => void;
  onSelectTimeframe?: (tf: string) => void;
  onRefresh?: () => void;
}

export type ChartVisualMode = 'candles' | 'bars' | 'line';

const QUICK_TIMEFRAMES = ['M1', 'M2', 'M3', 'M5', 'M10', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
const MORE_TIMEFRAMES = ['M4', 'M6', 'M12', 'M20', 'H2', 'H3', 'H6', 'H8', 'H12', 'MN1'];
const QUICK_VOLUMES = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00];

export const LivePriceChart: React.FC<LivePriceChartProps> = ({
  symbol,
  candles = [],
  chartDiagnostics,
  currentChart,
  allSymbols = [],
  ticks = [],
  currentTick,
  positions = [],
  marketDepth,
  currentTimeframe = 'M1',
  onSelectSymbol,
  onSelectTimeframe,
  onRefresh,
}) => {
  // Chart visual display mode: Candlesticks, OHLC Bars, or Line
  const [chartMode, setChartMode] = useState<ChartVisualMode>('candles');
  const [activeTf, setActiveTf] = useState<string>(currentTimeframe || 'M1');
  const [localCandles, setLocalCandles] = useState<CandleData[]>(candles);
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'info' | 'success' | 'warn' } | null>(null);

  // Overlay & indicator toggles
  const [showOverlays, setShowOverlays] = useState<boolean>(true);
  const [showBollinger, setShowBollinger] = useState<boolean>(false);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showRsi, setShowRsi] = useState<boolean>(false);
  const [showDom, setShowDom] = useState<boolean>(false);
  const [showSpecsDrawer, setShowSpecsDrawer] = useState<boolean>(false);
  const [showTfDropdown, setShowTfDropdown] = useState<boolean>(false);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState<boolean>(false);
  const [symbolSearch, setSymbolSearch] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Quick Order Pad state right on chart
  const [quickOrderVolume, setQuickOrderVolume] = useState<number>(0.10);
  const [quickOrderLoading, setQuickOrderLoading] = useState<'BUY' | 'SELL' | null>(null);

  // Visible bars window zoom: 30 (scalp zoom), 60 (standard), 100 (macro), 0 (all)
  const [visibleBarsCount, setVisibleBarsCount] = useState<number>(60);

  // Crosshair state
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Active symbol resolution
  const activeSymbol = symbol || currentChart?.symbol || (allSymbols.length > 0 ? allSymbols[0].symbol : '') || (ticks.length > 0 ? ticks[0].symbol : '');
  const digits = getSymbolDigits(activeSymbol, currentChart?.digits);
  const point = getSymbolPoint(activeSymbol, currentChart?.point);
  const pip = digits === 3 || digits === 5 ? point * 10 : point;

  // Synchronize active timeframe with parent
  useEffect(() => {
    if (currentTimeframe && currentTimeframe !== activeTf) {
      setActiveTf(currentTimeframe);
    }
  }, [currentTimeframe]);

  // Synchronize parent candles if symbol matches
  useEffect(() => {
    if (candles && candles.length > 0 && currentChart?.symbol && activeSymbol === currentChart.symbol) {
      setLocalCandles(candles);
    }
  }, [candles, activeSymbol, currentChart?.symbol]);

  // Fetch real candles from backend/MT5 for active symbol & timeframe
  useEffect(() => {
    if (!activeSymbol) return;

    let isCancelled = false;
    const fetchCandles = async () => {
      try {
        setLoading(true);
        const res = await api.getChartHistory(activeSymbol, activeTf, 150);
        if (isCancelled) return;

        if (res.candles && res.candles.length > 0) {
          setLocalCandles(res.candles);
        } else if (candles && candles.length > 0 && activeSymbol === currentChart?.symbol) {
          setLocalCandles(candles);
        } else {
          setLocalCandles([]);
        }

        if (res.gapDiagnosis?.message && res.gapDiagnosis.status !== 'UP_TO_DATE') {
          setFeedback({ message: res.gapDiagnosis.message, type: 'info' });
        }
      } catch {
        if (!isCancelled && candles && candles.length > 0 && activeSymbol === currentChart?.symbol) {
          setLocalCandles(candles);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchCandles();
    return () => {
      isCancelled = true;
    };
  }, [activeSymbol, activeTf]);

  // Live MT5 tick updater: updates bar[0] in real-time
  useEffect(() => {
    if (!currentTick || !currentTick.bid || !activeSymbol) return;
    if (currentTick.symbol.toUpperCase() !== activeSymbol.toUpperCase()) return;

    setLocalCandles((prev) => {
      if (!prev || prev.length === 0) return prev;

      const tfSecsMap: Record<string, number> = {
        M1: 60,
        M2: 120,
        M3: 180,
        M4: 240,
        M5: 300,
        M6: 360,
        M10: 600,
        M12: 720,
        M15: 900,
        M20: 1200,
        M30: 1800,
        H1: 3600,
        H2: 7200,
        H3: 10800,
        H4: 14400,
        H6: 21600,
        H8: 28800,
        H12: 43200,
        D1: 86400,
        W1: 604800,
        MN1: 2592000,
      };

      const pSecs = tfSecsMap[activeTf] || 60;
      const tickTs = currentTick.timeMsc
        ? Math.floor(currentTick.timeMsc / 1000)
        : currentTick.time || Math.floor(Date.now() / 1000);
      const expectedBarTime = Math.floor(tickTs / pSecs) * pSecs;

      const lastIdx = prev.length - 1;
      const lastBar = { ...prev[lastIdx] };

      if (lastBar.time === expectedBarTime) {
        lastBar.close = currentTick.bid;
        if (currentTick.bid > lastBar.high) lastBar.high = currentTick.bid;
        if (currentTick.bid < lastBar.low) lastBar.low = currentTick.bid;
        lastBar.volume = (lastBar.volume || 0) + 1;
        lastBar.tickCount = (lastBar.tickCount || 0) + 1;
        lastBar.spread = currentTick.spread || lastBar.spread;
        lastBar.isClosed = false;

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
  }, [currentTick, activeSymbol, activeTf]);

  // Handle switching timeframe
  const handleTimeframeChange = async (tf: string) => {
    setActiveTf(tf);
    setShowTfDropdown(false);
    onSelectTimeframe?.(tf);
    setLoading(true);

    try {
      const res = await api.getChartHistory(activeSymbol, tf, 150);
      if (res.candles && res.candles.length > 0) {
        setLocalCandles(res.candles);
      } else {
        await api.pullChartHistory(activeSymbol, tf, 100);
        setFeedback({ message: `Requested ${tf} historical candles from MT5 for ${activeSymbol}`, type: 'success' });
      }
      onRefresh?.();
    } catch {
      setFeedback({ message: `Awaiting MT5 response for ${activeSymbol} [${tf}]`, type: 'info' });
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // Pull history directly from MT5 EA
  const handleManualPull = async () => {
    if (!activeSymbol) return;
    setLoading(true);
    try {
      const pullRes = await api.pullChartHistory(activeSymbol, activeTf, 150);
      if (pullRes.success) {
        setFeedback({
          message: pullRes.message || `Dispatched fetch request to MT5 EA for ${activeSymbol} [${activeTf}]`,
          type: 'success',
        });
        const histRes = await api.getChartHistory(activeSymbol, activeTf, 150);
        if (histRes.candles && histRes.candles.length > 0) {
          setLocalCandles(histRes.candles);
        }
      } else {
        setFeedback({
          message: pullRes.message || 'Requested history from MT5 EA',
          type: 'info',
        });
      }
      onRefresh?.();
    } catch (err: any) {
      setFeedback({ message: err?.message || 'Failed to pull history from MT5', type: 'warn' });
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 4500);
    }
  };

  // Export current historical candles to CSV for quant research
  const handleExportCsv = () => {
    const activeCandles: CandleData[] = (localCandles && localCandles.length > 0 ? localCandles : (candles || []));
    if (!activeCandles || activeCandles.length === 0) return;
    const headers = ['Timestamp', 'TimeISO', 'Open', 'High', 'Low', 'Close', 'TickVolume', 'Spread'];
    const rows = activeCandles.map((c: CandleData) => [
      c.time,
      c.timeIso || new Date(c.time * 1000).toISOString(),
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
      c.spread || 0,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r: (string | number)[]) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeSymbol}_${activeTf}_candles_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setFeedback({
      message: `Exported ${activeCandles.length} candles to ${activeSymbol}_${activeTf}.csv`,
      type: 'success',
    });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Quick Order Execution directly from the Chart
  const handleQuickTrade = async (direction: 'BUY' | 'SELL') => {
    if (!activeSymbol) return;
    setQuickOrderLoading(direction);
    try {
      const res = await api.executeOrder({
        action: 'EXECUTE_TRADE',
        symbol: activeSymbol,
        orderType: direction,
        volume: quickOrderVolume,
        slippage: 10,
        source: 'MANUAL_UI',
      });
      if (res.success) {
        setFeedback({
          message: `Market ${direction} ${quickOrderVolume} lots submitted (CMD: ${res.commandId})`,
          type: 'success',
        });
        onRefresh?.();
      } else {
        setFeedback({
          message: res.error || `Failed to submit market ${direction}`,
          type: 'warn',
        });
      }
    } catch (err: any) {
      setFeedback({ message: err?.message || `Execution error on ${direction}`, type: 'warn' });
    } finally {
      setQuickOrderLoading(null);
      setTimeout(() => setFeedback(null), 4500);
    }
  };

  // Active positions on this symbol
  const relatedPositions = positions.filter(
    (p) => p.symbol.toUpperCase() === activeSymbol.toUpperCase()
  );

  // Active tick for this symbol
  const activeTick = ticks.find((t) => t.symbol.toUpperCase() === activeSymbol.toUpperCase()) || currentTick;

  // Filtered symbols for switcher dropdown
  const filteredSymbols = useMemo(() => {
    const list = allSymbols.length > 0 ? allSymbols.map((s) => s.symbol) : ticks.map((t) => t.symbol);
    const unique = Array.from(new Set(list));
    if (!symbolSearch.trim()) return unique;
    return unique.filter((s) => s.toLowerCase().includes(symbolSearch.toLowerCase().trim()));
  }, [allSymbols, ticks, symbolSearch]);

  // Detailed specifications for symbol specs drawer
  const activeSymbolSpecs = useMemo(() => {
    return allSymbols.find((s) => s.symbol.toUpperCase() === activeSymbol.toUpperCase()) || (currentChart?.symbol === activeSymbol ? currentChart : null);
  }, [allSymbols, currentChart, activeSymbol]);

  // Level 2 / Market Depth (DOM) order book data
  const depthMetrics = useMemo(() => {
    if (!marketDepth || !activeSymbol) return null;
    const direct = marketDepth[activeSymbol.toUpperCase()] || marketDepth[activeSymbol];
    if (!direct) return null;
    const bids = direct.bids || [];
    const asks = direct.asks || [];
    if (bids.length === 0 && asks.length === 0) return null;

    const totalBidVol = bids.reduce((acc, b) => acc + (b.volume || 0), 0);
    const totalAskVol = asks.reduce((acc, a) => acc + (a.volume || 0), 0);
    const maxVol = Math.max(1, ...bids.map((b) => b.volume || 0), ...asks.map((a) => a.volume || 0));
    const totalVol = totalBidVol + totalAskVol;
    const bidRatio = totalVol > 0 ? (totalBidVol / totalVol) * 100 : 50;

    return { bids, asks, totalBidVol, totalAskVol, maxVol, bidRatio };
  }, [marketDepth, activeSymbol]);

  // Slice bars based on zoom level (visibleBarsCount)
  const displayBars = useMemo(() => {
    const raw = localCandles && localCandles.length > 0 ? localCandles : candles;
    if (!raw || raw.length === 0) return [];
    if (visibleBarsCount <= 0 || raw.length <= visibleBarsCount) return raw;
    return raw.slice(-visibleBarsCount);
  }, [localCandles, candles, visibleBarsCount]);

  // SVG Chart Geometry, Technical Calculations, and Axis Scales
  const chartData = useMemo(() => {
    if (!displayBars || displayBars.length < 2) {
      return null;
    }

    const count = displayBars.length;
    const lows = displayBars.map((c) => c.low);
    const highs = displayBars.map((c) => c.high);
    const volumes = displayBars.map((c) => c.volume || 1);

    let minPrice = Math.min(...lows);
    let maxPrice = Math.max(...highs);
    const maxVolume = Math.max(...volumes, 1);

    // Identify swing high and swing low indices for markers
    let swingHighIdx = 0;
    let swingLowIdx = 0;
    for (let i = 0; i < count; i++) {
      if (highs[i] > highs[swingHighIdx]) swingHighIdx = i;
      if (lows[i] < lows[swingLowIdx]) swingLowIdx = i;
    }

    // Dynamic padding
    const pad = (maxPrice - minPrice) * 0.08 || 0.0001;
    minPrice -= pad;
    maxPrice += pad;
    const priceRange = maxPrice - minPrice || 1;

    // Viewport dimensions
    const svgWidth = 850;
    const totalHeight = showRsi ? 330 : 260;
    const priceAreaTop = 15;
    const priceAreaHeight = showRsi ? 200 : 180;
    const timeAxisHeight = 20;
    const volumeAreaHeight = showVolume ? 30 : 0;
    const volumeAreaTop = priceAreaTop + priceAreaHeight;
    const rsiAreaTop = volumeAreaTop + volumeAreaHeight + 5;
    const rsiAreaHeight = showRsi ? 55 : 0;

    const candleSpacing = svgWidth / count;
    const candleWidth = Math.max(2, Math.min(14, candleSpacing * 0.72));

    // Converter from price to Y pixel coordinate
    const priceToY = (p: number) => {
      const clamped = Math.max(minPrice, Math.min(maxPrice, p));
      return (
        priceAreaTop +
        (1 - (clamped - minPrice) / priceRange) * priceAreaHeight
      );
    };

    // Converter from Y pixel coordinate to price
    const yToPrice = (y: number) => {
      const normalized = 1 - (y - priceAreaTop) / priceAreaHeight;
      return minPrice + normalized * priceRange;
    };

    // Horizontal Price Levels (4 grid lines with exact prices)
    const priceLevels = [0.2, 0.4, 0.6, 0.8].map((ratio) => {
      const y = priceAreaTop + ratio * priceAreaHeight;
      const priceVal = yToPrice(y);
      return { y, priceVal };
    });

    // Time Ticks along the bottom axis (5 evenly spaced date/time markers)
    const timeTicks: { x: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(count / 5));
    for (let i = 0; i < count; i += step) {
      const bar = displayBars[i];
      const x = i * candleSpacing + candleSpacing / 2;
      const timeStr = bar.timeIso
        ? bar.timeIso.slice(11, 16)
        : new Date(bar.time * 1000).toISOString().slice(11, 16);
      timeTicks.push({ x, label: timeStr });
    }

    // Technical Indicators calculations
    const ema9Points: string[] = [];
    const ema21Points: string[] = [];
    const sma50Points: string[] = [];
    const bbUpperPoints: string[] = [];
    const bbLowerPoints: string[] = [];
    const bbMiddlePoints: string[] = [];
    const lineChartPoints: string[] = [];
    const rsiPoints: string[] = [];

    const k9 = 2 / (9 + 1);
    const k21 = 2 / (21 + 1);
    let curEma9 = displayBars[0].close;
    let curEma21 = displayBars[0].close;

    // RSI calculation
    const rsiPeriod = 14;
    const gains: number[] = [];
    const losses: number[] = [];
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 0; i < count; i++) {
      const c = displayBars[i];
      const x = i * candleSpacing + candleSpacing / 2;

      lineChartPoints.push(`${x.toFixed(1)},${priceToY(c.close).toFixed(1)}`);

      curEma9 = c.close * k9 + curEma9 * (1 - k9);
      curEma21 = c.close * k21 + curEma21 * (1 - k21);
      ema9Points.push(`${x.toFixed(1)},${priceToY(curEma9).toFixed(1)}`);
      ema21Points.push(`${x.toFixed(1)},${priceToY(curEma21).toFixed(1)}`);

      if (i >= 49) {
        let sum50 = 0;
        for (let j = i - 49; j <= i; j++) sum50 += displayBars[j].close;
        const smaVal = sum50 / 50;
        sma50Points.push(`${x.toFixed(1)},${priceToY(smaVal).toFixed(1)}`);
      }

      if (i >= 19) {
        let sum20 = 0;
        for (let j = i - 19; j <= i; j++) sum20 += displayBars[j].close;
        const mean = sum20 / 20;
        let sumSqDiff = 0;
        for (let j = i - 19; j <= i; j++) sumSqDiff += Math.pow(displayBars[j].close - mean, 2);
        const stdDev = Math.sqrt(sumSqDiff / 20);
        const upper = mean + 2 * stdDev;
        const lower = mean - 2 * stdDev;

        bbMiddlePoints.push(`${x.toFixed(1)},${priceToY(mean).toFixed(1)}`);
        bbUpperPoints.push(`${x.toFixed(1)},${priceToY(upper).toFixed(1)}`);
        bbLowerPoints.push(`${x.toFixed(1)},${priceToY(lower).toFixed(1)}`);
      }

      if (showRsi && i > 0) {
        const diff = c.close - displayBars[i - 1].close;
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        if (i <= rsiPeriod) {
          gains.push(gain);
          losses.push(loss);
          if (i === rsiPeriod) {
            avgGain = gains.reduce((a, b) => a + b, 0) / rsiPeriod;
            avgLoss = losses.reduce((a, b) => a + b, 0) / rsiPeriod;
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsi = 100 - 100 / (1 + rs);
            const rsiY = rsiAreaTop + (1 - rsi / 100) * rsiAreaHeight;
            rsiPoints.push(`${x.toFixed(1)},${rsiY.toFixed(1)}`);
          }
        } else {
          avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
          avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
          const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
          const rsi = 100 - 100 / (1 + rs);
          const rsiY = rsiAreaTop + (1 - rsi / 100) * rsiAreaHeight;
          rsiPoints.push(`${x.toFixed(1)},${rsiY.toFixed(1)}`);
        }
      }
    }

    const renderedBars = displayBars.map((c, idx) => {
      const centerX = idx * candleSpacing + candleSpacing / 2;
      const leftX = centerX - candleWidth / 2;
      const isBull = c.close >= c.open;

      const highY = priceToY(c.high);
      const lowY = priceToY(c.low);
      const openY = priceToY(c.open);
      const closeY = priceToY(c.close);

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));

      const volHeight = Math.max(2, (c.volume / maxVolume) * volumeAreaHeight);
      const volY = volumeAreaTop + volumeAreaHeight - volHeight;

      return {
        candle: c,
        idx,
        centerX,
        leftX,
        candleWidth,
        isBull,
        highY,
        lowY,
        openY,
        closeY,
        bodyTop,
        bodyHeight,
        volHeight,
        volY,
      };
    });

    const linePath = lineChartPoints.length > 1 ? `M ${lineChartPoints.join(' L ')}` : '';
    const lineAreaPath =
      lineChartPoints.length > 1
        ? `M ${lineChartPoints.join(' L ')} L ${svgWidth} ${volumeAreaTop} L 0 ${volumeAreaTop} Z`
        : '';

    let bbCloudPath = '';
    if (bbUpperPoints.length > 1 && bbLowerPoints.length > 1) {
      const upperStr = bbUpperPoints.join(' L ');
      const lowerStr = [...bbLowerPoints].reverse().join(' L ');
      bbCloudPath = `M ${upperStr} L ${lowerStr} Z`;
    }

    return {
      count,
      minPrice,
      maxPrice,
      priceRange,
      renderedBars,
      priceToY,
      yToPrice,
      priceLevels,
      timeTicks,
      swingHigh: renderedBars[swingHighIdx],
      swingLow: renderedBars[swingLowIdx],
      svgWidth,
      totalHeight,
      priceAreaTop,
      priceAreaHeight,
      volumeAreaTop,
      volumeAreaHeight,
      rsiAreaTop,
      rsiAreaHeight,
      timeAxisHeight,
      linePath,
      lineAreaPath,
      ema9Path: ema9Points.length > 1 ? `M ${ema9Points.join(' L ')}` : '',
      ema21Path: ema21Points.length > 1 ? `M ${ema21Points.join(' L ')}` : '',
      sma50Path: sma50Points.length > 1 ? `M ${sma50Points.join(' L ')}` : '',
      bbUpperPath: bbUpperPoints.length > 1 ? `M ${bbUpperPoints.join(' L ')}` : '',
      bbLowerPath: bbLowerPoints.length > 1 ? `M ${bbLowerPoints.join(' L ')}` : '',
      bbMiddlePath: bbMiddlePoints.length > 1 ? `M ${bbMiddlePoints.join(' L ')}` : '',
      bbCloudPath,
      rsiPath: rsiPoints.length > 1 ? `M ${rsiPoints.join(' L ')}` : '',
    };
  }, [displayBars, showRsi, showVolume]);

  const activeCandleToDisplay =
    hoveredCandle || (displayBars.length > 0 ? displayBars[displayBars.length - 1] : null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !chartData) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * chartData.svgWidth;
    const y = ((e.clientY - rect.top) / rect.height) * chartData.totalHeight;

    setMousePos({ x, y });

    const candleSpacing = chartData.svgWidth / chartData.count;
    const index = Math.min(
      chartData.count - 1,
      Math.max(0, Math.floor(x / candleSpacing))
    );
    if (chartData.renderedBars[index]) {
      setHoveredCandle(chartData.renderedBars[index].candle);
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoveredCandle(null);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowTfDropdown(false);
        setShowSymbolDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`bg-slate-900/95 border border-slate-800 rounded-xl shadow-lg flex flex-col transition-all ${
        isFullscreen ? 'fixed inset-4 z-50 overflow-auto bg-slate-950 p-6' : 'p-4.5'
      }`}
    >
      {/* 1. Top Header Toolbar: Symbol Switcher, Live Quotes, Timeframe, Visual Mode & Zoom */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        {/* Left Zone: Symbol identity & live quotes */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowSymbolDropdown(!showSymbolDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left transition-colors"
              title="Switch Active Trading Symbol"
            >
              <div className="flex flex-col">
                <span className="text-base font-extrabold text-white font-mono tracking-tight flex items-center gap-1.5">
                  {activeSymbol || 'Select Symbol'}
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {activeSymbolSpecs?.description || 'Broker Instrument'}
                </span>
              </div>
            </button>

            {showSymbolDropdown && (
              <div className="absolute left-0 top-full mt-1.5 w-72 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-30 p-2 font-mono">
                <div className="relative mb-2">
                  <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    placeholder="Search MT5 symbols..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    autoFocus
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredSymbols.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No matching symbols found
                    </div>
                  ) : (
                    filteredSymbols.map((sym) => {
                      const symTick = ticks.find((t) => t.symbol === sym);
                      const isConnectedChart = currentChart?.symbol === sym;
                      const isSelected = activeSymbol === sym;

                      return (
                        <button
                          key={sym}
                          onClick={() => {
                            onSelectSymbol?.(sym);
                            setShowSymbolDropdown(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                            isSelected
                              ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 font-bold'
                              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {isConnectedChart && (
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Active EA Chart" />
                            )}
                            <span>{sym}</span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px]">
                            {symTick && (
                              <span className="text-slate-400">
                                {symTick.bid.toFixed(getSymbolDigits(sym))}
                              </span>
                            )}
                            {isSelected && <Check className="h-3 w-3 text-cyan-400" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {symbolSearch.trim() && !filteredSymbols.includes(symbolSearch.toUpperCase().trim()) && (
                  <button
                    onClick={() => {
                      onSelectSymbol?.(symbolSearch.toUpperCase().trim());
                      setShowSymbolDropdown(false);
                    }}
                    className="w-full mt-2 pt-2 border-t border-slate-800 text-left px-2 py-1 text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    Select &quot;{symbolSearch.toUpperCase().trim()}&quot;
                  </button>
                )}
              </div>
            )}
          </div>

          {activeTick ? (
            <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
              <div className="bg-slate-950/90 border border-slate-800/80 px-2.5 py-1 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase block leading-none">Bid</span>
                <span className="text-sm font-bold text-emerald-400 tabular-nums">
                  {activeTick.bid.toFixed(digits)}
                </span>
              </div>
              <div className="bg-slate-950/90 border border-slate-800/80 px-2.5 py-1 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase block leading-none">Ask</span>
                <span className="text-sm font-bold text-slate-200 tabular-nums">
                  {activeTick.ask.toFixed(digits)}
                </span>
              </div>
              <div className="bg-slate-950/90 border border-slate-800/80 px-2 py-1 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase block leading-none">Spread</span>
                <span className="text-xs font-semibold text-cyan-300 tabular-nums">
                  {activeTick.spread} pts
                </span>
              </div>
            </div>
          ) : null}

          {currentChart?.symbol === activeSymbol ? (
            <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 text-[11px] font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Attached EA Chart
            </span>
          ) : (
            <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-[11px] font-mono">
              Tracked Symbol
            </span>
          )}
        </div>

        {/* Right Zone: Chart Type Selector, Timeframes, Overlays, Zoom & Sync */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Chart Visual Mode */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setChartMode('candles')}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                chartMode === 'candles'
                  ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-800/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Candles
            </button>
            <button
              onClick={() => setChartMode('bars')}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                chartMode === 'bars'
                  ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-800/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Bars
            </button>
            <button
              onClick={() => setChartMode('line')}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                chartMode === 'line'
                  ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-800/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Line
            </button>
          </div>

          {/* Timeframes Segmented Control */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            {QUICK_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => handleTimeframeChange(tf)}
                disabled={loading}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all ${
                  activeTf === tf
                    ? 'bg-cyan-600 text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}

            <div className="relative">
              <button
                onClick={() => setShowTfDropdown(!showTfDropdown)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center text-slate-400 hover:text-slate-200 ${
                  MORE_TIMEFRAMES.includes(activeTf) ? 'text-cyan-400 font-bold' : ''
                }`}
              >
                <span>{MORE_TIMEFRAMES.includes(activeTf) ? activeTf : 'More'}</span>
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </button>

              {showTfDropdown && (
                <div className="absolute right-0 top-full mt-1.5 w-32 bg-slate-950 border border-slate-800 rounded-lg shadow-xl z-30 p-1 font-mono grid grid-cols-2 gap-1">
                  {MORE_TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => handleTimeframeChange(tf)}
                      className={`px-2 py-1 text-xs rounded text-center transition-colors ${
                        activeTf === tf
                          ? 'bg-cyan-950 text-cyan-300 font-bold'
                          : 'text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setVisibleBarsCount((prev) => Math.max(25, prev - 15))}
              title="Zoom In (Fewer Bars)"
              className="p-1 rounded text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setVisibleBarsCount((prev) => Math.min(250, prev + 25))}
              title="Zoom Out (More Bars)"
              className="p-1 rounded text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setVisibleBarsCount(60)}
              title="Reset Zoom to 60 Bars"
              className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          {/* Indicator & Overlay Toggle Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowOverlays(!showOverlays)}
              title={showOverlays ? 'Hide EMA Overlays' : 'Show EMA Overlays (EMA 9, EMA 21, SMA 50)'}
              className={`px-2 py-1 rounded-lg border text-xs font-mono transition-all ${
                showOverlays
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-800/80 shadow-sm'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              EMA
            </button>

            <button
              onClick={() => setShowBollinger(!showBollinger)}
              title={showBollinger ? 'Hide Bollinger Bands' : 'Show Bollinger Bands (20, 2)'}
              className={`px-2 py-1 rounded-lg border text-xs font-mono transition-all ${
                showBollinger
                  ? 'bg-purple-950 text-purple-300 border-purple-800/80 shadow-sm'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              BB
            </button>

            <button
              onClick={() => setShowVolume(!showVolume)}
              title={showVolume ? 'Hide Volume' : 'Show Volume'}
              className={`px-2 py-1 rounded-lg border text-xs font-mono transition-all ${
                showVolume
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-800/80 shadow-sm'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              VOL
            </button>

            <button
              onClick={() => setShowRsi(!showRsi)}
              title={showRsi ? 'Hide RSI (14)' : 'Show RSI (14)'}
              className={`px-2 py-1 rounded-lg border text-xs font-mono transition-all ${
                showRsi
                  ? 'bg-amber-950 text-amber-300 border-amber-800/80 shadow-sm'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              RSI
            </button>

            <button
              onClick={() => setShowDom(!showDom)}
              title={showDom ? 'Hide Level 2 / DOM Order Book' : 'Show Level 2 / DOM Order Book'}
              className={`px-2 py-1 rounded-lg border text-xs font-mono transition-all flex items-center gap-1 ${
                showDom
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-800/80 shadow-sm'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              <Layers className="h-3 w-3" />
              <span>DOM</span>
            </button>

            <button
              onClick={() => setShowSpecsDrawer(!showSpecsDrawer)}
              title="Toggle Broker Specifications"
              className={`p-1.5 rounded-lg border text-xs font-mono transition-all ${
                showSpecsDrawer
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                  : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Sync Button */}
          <button
            onClick={handleManualPull}
            disabled={loading}
            title="Request fresh historical bars from MT5 EA"
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3 w-3 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Syncing...' : 'Pull MT5'}</span>
          </button>

          {/* Export Candles CSV */}
          <button
            onClick={handleExportCsv}
            disabled={(localCandles?.length || 0) === 0 && (candles?.length || 0) === 0}
            title={`Export ${(localCandles?.length || candles?.length || 0)} ${activeSymbol} ${activeTf} candles to CSV`}
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border border-slate-800 transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. Interactive Quick Order Placement Dock directly in Chart */}
      <div className="my-2 p-2 bg-slate-950/80 border border-slate-800/80 rounded-lg flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-cyan-400" /> Quick Trade
          </span>

          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            {QUICK_VOLUMES.map((vol) => (
              <button
                key={vol}
                onClick={() => setQuickOrderVolume(vol)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                  quickOrderVolume === vol
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {vol.toFixed(2)}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-500">
            Lot: <strong className="text-white">{quickOrderVolume.toFixed(2)}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick SELL button */}
          <button
            onClick={() => handleQuickTrade('SELL')}
            disabled={quickOrderLoading !== null}
            className="px-3.5 py-1.5 rounded bg-rose-600/90 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span>SELL {activeTick ? activeTick.bid.toFixed(digits) : 'Market'}</span>
          </button>

          {/* Quick BUY button */}
          <button
            onClick={() => handleQuickTrade('BUY')}
            disabled={quickOrderLoading !== null}
            className="px-3.5 py-1.5 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            <span>BUY {activeTick ? activeTick.ask.toFixed(digits) : 'Market'}</span>
          </button>
        </div>
      </div>

      {/* 3. Feedback Notification Banner */}
      {feedback && (
        <div
          className={`my-1.5 p-2 rounded-lg border text-xs font-mono flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
              : feedback.type === 'warn'
              ? 'bg-amber-950/60 border-amber-800/60 text-amber-300'
              : 'bg-cyan-950/60 border-cyan-800/60 text-cyan-300'
          }`}
        >
          <Activity className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 4. Optional Symbol & Broker Specifications Drawer */}
      {showSpecsDrawer && activeSymbolSpecs && (
        <div className="my-2 p-3 rounded-lg bg-slate-950/90 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-2.5 font-mono text-xs animate-in fade-in duration-200">
          <div>
            <span className="text-[10px] text-slate-500 uppercase block">Contract Size</span>
            <span className="text-slate-200 font-bold">{activeSymbolSpecs.contractSize?.toLocaleString() || '100,000'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block">Min / Max Lot</span>
            <span className="text-slate-200 font-bold">{activeSymbolSpecs.minLot} - {activeSymbolSpecs.maxLot}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block">Lot Step</span>
            <span className="text-slate-200 font-bold">{activeSymbolSpecs.lotStep}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block">Stops Level</span>
            <span className="text-amber-300 font-bold">{activeSymbolSpecs.stopsLevel !== undefined ? `${activeSymbolSpecs.stopsLevel} pts` : '0 pts'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block">Freeze Level</span>
            <span className="text-slate-200 font-bold">{activeSymbolSpecs.freezeLevel !== undefined ? `${activeSymbolSpecs.freezeLevel} pts` : '0 pts'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block">Digits / Point</span>
            <span className="text-slate-200 font-bold">{activeSymbolSpecs.digits} / {activeSymbolSpecs.point}</span>
          </div>
        </div>
      )}

      {/* Level 2 / Market Depth (DOM) Order Book Drawer */}
      {showDom && (
        <div className="my-2 p-3 rounded-lg bg-slate-950/95 border border-slate-800 font-mono text-xs animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-800/80 mb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              <span className="font-bold text-white text-xs">Level 2 / Market Depth (DOM)</span>
              <span className="text-[10px] text-cyan-300 font-semibold bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/60">
                {activeSymbol}
              </span>
            </div>
            {depthMetrics ? (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-emerald-400 font-bold">
                  Bids: {depthMetrics.totalBidVol.toFixed(2)} Lots ({depthMetrics.bidRatio.toFixed(0)}%)
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-rose-400 font-bold">
                  Asks: {depthMetrics.totalAskVol.toFixed(2)} Lots ({(100 - depthMetrics.bidRatio).toFixed(0)}%)
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">Streaming live broker order book</span>
            )}
          </div>

          {depthMetrics && (depthMetrics.bids.length > 0 || depthMetrics.asks.length > 0) ? (
            <div className="grid grid-cols-2 gap-3">
              {/* Bids column */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] uppercase text-emerald-400 font-bold px-1.5 pb-1 border-b border-emerald-900/40">
                  <span>Bid Volume</span>
                  <span>Price</span>
                </div>
                <div className="max-h-44 overflow-y-auto space-y-0.5 pr-0.5">
                  {depthMetrics.bids.map((b, idx) => {
                    const pct = Math.min(100, Math.max(8, (b.volume / depthMetrics.maxVol) * 100));
                    return (
                      <div key={idx} className="relative flex items-center justify-between px-2 py-1 rounded bg-slate-900/70 overflow-hidden text-[11px]">
                        <div
                          className="absolute right-0 top-0 bottom-0 bg-emerald-500/20 rounded-r"
                          style={{ width: `${pct}%` }}
                        />
                        <span className="relative z-10 text-emerald-300 font-bold tabular-nums">
                          {b.volume.toFixed(2)}
                        </span>
                        <span className="relative z-10 text-slate-200 tabular-nums font-semibold">
                          {b.price.toFixed(digits)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Asks column */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] uppercase text-rose-400 font-bold px-1.5 pb-1 border-b border-rose-900/40">
                  <span>Price</span>
                  <span>Ask Volume</span>
                </div>
                <div className="max-h-44 overflow-y-auto space-y-0.5 pr-0.5">
                  {depthMetrics.asks.map((a, idx) => {
                    const pct = Math.min(100, Math.max(8, (a.volume / depthMetrics.maxVol) * 100));
                    return (
                      <div key={idx} className="relative flex items-center justify-between px-2 py-1 rounded bg-slate-900/70 overflow-hidden text-[11px]">
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-rose-500/20 rounded-l"
                          style={{ width: `${pct}%` }}
                        />
                        <span className="relative z-10 text-slate-200 tabular-nums font-semibold">
                          {a.price.toFixed(digits)}
                        </span>
                        <span className="relative z-10 text-rose-300 font-bold tabular-nums">
                          {a.volume.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-slate-400 text-xs space-y-1.5 border border-dashed border-slate-800 rounded-lg">
              <div className="text-slate-300 font-medium">Awaiting Level 2 Market Depth Stream for {activeSymbol}</div>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Depth of Market (DOM) streams live when supported by your broker for this symbol. The EA automatically subscribes via <code className="text-cyan-400 bg-slate-900 px-1 py-0.5 rounded">MarketBookAdd(_Symbol)</code> and transmits the top bids and asks on every tick.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 5. Crosshair HUD Bar (OHLCV & Indicator Values) */}
      {activeCandleToDisplay && (
        <div className="my-1.5 flex flex-wrap items-center justify-between gap-y-1.5 text-xs font-mono bg-slate-950/90 px-3 py-1.5 rounded-lg border border-slate-800/80">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-slate-400">
              {activeCandleToDisplay.timeIso
                ? activeCandleToDisplay.timeIso.replace('T', ' ').slice(0, 19)
                : new Date(activeCandleToDisplay.time * 1000).toISOString().replace('T', ' ').slice(0, 19)}
            </span>
            <span>
              O: <strong className="text-slate-200 tabular-nums">{activeCandleToDisplay.open.toFixed(digits)}</strong>
            </span>
            <span>
              H: <strong className="text-emerald-400 tabular-nums">{activeCandleToDisplay.high.toFixed(digits)}</strong>
            </span>
            <span>
              L: <strong className="text-rose-400 tabular-nums">{activeCandleToDisplay.low.toFixed(digits)}</strong>
            </span>
            <span>
              C:{' '}
              <strong
                className={`tabular-nums ${
                  activeCandleToDisplay.close >= activeCandleToDisplay.open
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {activeCandleToDisplay.close.toFixed(digits)}
              </strong>
            </span>
            <span>
              Vol: <strong className="text-cyan-300 tabular-nums">{activeCandleToDisplay.volume.toLocaleString()}</strong>
            </span>
            {(() => {
              const diff = activeCandleToDisplay.close - activeCandleToDisplay.open;
              const pct = activeCandleToDisplay.open > 0 ? (diff / activeCandleToDisplay.open) * 100 : 0;
              const pips = pip > 0 ? diff / pip : 0;
              const isUp = diff >= 0;
              return (
                <span>
                  Chg:{' '}
                  <strong className={`tabular-nums ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isUp ? '+' : ''}{pct.toFixed(2)}% ({isUp ? '+' : ''}{pips.toFixed(1)} pips)
                  </strong>
                </span>
              );
            })()}
          </div>

          <div className="flex items-center gap-3 text-[10px]">
            {showOverlays && (
              <>
                <span className="text-cyan-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> EMA 9
                </span>
                <span className="text-amber-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> EMA 21
                </span>
                <span className="text-purple-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-400" /> SMA 50
                </span>
              </>
            )}
            {showBollinger && (
              <span className="text-violet-300 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> BB (20,2)
              </span>
            )}
            {showRsi && (
              <span className="text-amber-300 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> RSI (14)
              </span>
            )}
          </div>
        </div>
      )}

      {/* 6. Main SVG Canvas Area with Scales & Markers */}
      <div className={`relative w-full ${isFullscreen ? 'h-[72vh]' : 'h-[330px]'} bg-slate-950 border border-slate-800/90 rounded-lg overflow-hidden flex items-center justify-center select-none`}>
        {chartData && chartData.renderedBars.length >= 2 ? (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chartData.svgWidth} ${chartData.totalHeight}`}
              preserveAspectRatio="none"
              className="w-full h-full cursor-crosshair overflow-visible"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="bullVolGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="bearVolGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Horizontal Price Grid Lines & Labels */}
              {chartData.priceLevels.map((lvl, idx) => (
                <g key={`grid-lvl-${idx}`}>
                  <line
                    x1="0"
                    y1={lvl.y}
                    x2={chartData.svgWidth}
                    y2={lvl.y}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    strokeWidth="0.8"
                  />
                  <text
                    x={chartData.svgWidth - 6}
                    y={lvl.y - 3}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {lvl.priceVal.toFixed(digits)}
                  </text>
                </g>
              ))}

              {/* Vertical Time Grid Lines & Bottom Time Scale Labels */}
              {chartData.timeTicks.map((t, idx) => (
                <g key={`time-tick-${idx}`}>
                  <line
                    x1={t.x}
                    y1={chartData.priceAreaTop}
                    x2={t.x}
                    y2={chartData.volumeAreaTop}
                    stroke="#1e293b"
                    strokeDasharray="2 3"
                    strokeWidth="0.7"
                  />
                  <text
                    x={t.x}
                    y={chartData.totalHeight - 4}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {t.label}
                  </text>
                </g>
              ))}

              {/* Volume Area Divider */}
              {showVolume && (
                <line
                  x1="0"
                  y1={chartData.volumeAreaTop}
                  x2={chartData.svgWidth}
                  y2={chartData.volumeAreaTop}
                  stroke="#334155"
                  strokeDasharray="2 2"
                  strokeWidth="0.8"
                />
              )}

              {/* RSI Area Divider */}
              {showRsi && (
                <>
                  <line
                    x1="0"
                    y1={chartData.rsiAreaTop}
                    x2={chartData.svgWidth}
                    y2={chartData.rsiAreaTop}
                    stroke="#334155"
                    strokeDasharray="2 2"
                    strokeWidth="0.8"
                  />
                  <line
                    x1="0"
                    y1={chartData.rsiAreaTop + chartData.rsiAreaHeight * 0.3}
                    x2={chartData.svgWidth}
                    y2={chartData.rsiAreaTop + chartData.rsiAreaHeight * 0.3}
                    stroke="#f43f5e"
                    strokeDasharray="3 2"
                    strokeWidth="0.7"
                    opacity="0.6"
                  />
                  <line
                    x1="0"
                    y1={chartData.rsiAreaTop + chartData.rsiAreaHeight * 0.7}
                    x2={chartData.svgWidth}
                    y2={chartData.rsiAreaTop + chartData.rsiAreaHeight * 0.7}
                    stroke="#10b981"
                    strokeDasharray="3 2"
                    strokeWidth="0.7"
                    opacity="0.6"
                  />
                </>
              )}

              {/* Bollinger Bands Fill & Lines */}
              {showBollinger && chartData.bbCloudPath && (
                <path d={chartData.bbCloudPath} fill="#a855f7" fillOpacity="0.08" stroke="none" />
              )}
              {showBollinger && chartData.bbUpperPath && (
                <path d={chartData.bbUpperPath} fill="none" stroke="#c084fc" strokeWidth="1" strokeDasharray="3 2" />
              )}
              {showBollinger && chartData.bbLowerPath && (
                <path d={chartData.bbLowerPath} fill="none" stroke="#c084fc" strokeWidth="1" strokeDasharray="3 2" />
              )}
              {showBollinger && chartData.bbMiddlePath && (
                <path d={chartData.bbMiddlePath} fill="none" stroke="#a855f7" strokeWidth="1.2" />
              )}

              {/* Volume Bars */}
              {showVolume &&
                chartData.renderedBars.map((b) => (
                  <rect
                    key={`vol-${b.idx}`}
                    x={b.leftX}
                    y={b.volY}
                    width={b.candleWidth}
                    height={b.volHeight}
                    fill={b.isBull ? 'url(#bullVolGrad)' : 'url(#bearVolGrad)'}
                  />
                ))}

              {/* Mode 1: Candlesticks */}
              {chartMode === 'candles' &&
                chartData.renderedBars.map((b) => {
                  const color = b.isBull ? '#10b981' : '#f43f5e';
                  return (
                    <g key={`candle-${b.idx}`}>
                      <line
                        x1={b.centerX}
                        y1={b.highY}
                        x2={b.centerX}
                        y2={b.lowY}
                        stroke={color}
                        strokeWidth="1.2"
                      />
                      <rect
                        x={b.leftX}
                        y={b.bodyTop}
                        width={b.candleWidth}
                        height={b.bodyHeight}
                        fill={color}
                        rx="1"
                      />
                    </g>
                  );
                })}

              {/* Mode 2: OHLC Bars */}
              {chartMode === 'bars' &&
                chartData.renderedBars.map((b) => {
                  const color = b.isBull ? '#10b981' : '#f43f5e';
                  const tickLength = Math.max(2, b.candleWidth / 2);
                  return (
                    <g key={`bar-${b.idx}`}>
                      <line
                        x1={b.centerX}
                        y1={b.highY}
                        x2={b.centerX}
                        y2={b.lowY}
                        stroke={color}
                        strokeWidth="1.4"
                      />
                      <line
                        x1={b.centerX - tickLength}
                        y1={b.openY}
                        x2={b.centerX}
                        y2={b.openY}
                        stroke={color}
                        strokeWidth="1.4"
                      />
                      <line
                        x1={b.centerX}
                        y1={b.closeY}
                        x2={b.centerX + tickLength}
                        y2={b.closeY}
                        stroke={color}
                        strokeWidth="1.4"
                      />
                    </g>
                  );
                })}

              {/* Mode 3: Line Chart */}
              {chartMode === 'line' && (
                <>
                  {chartData.lineAreaPath && (
                    <path d={chartData.lineAreaPath} fill="url(#lineAreaGrad)" stroke="none" />
                  )}
                  {chartData.linePath && (
                    <path
                      d={chartData.linePath}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  )}
                </>
              )}

              {/* Swing High Visual Marker */}
              {chartData.swingHigh && (
                <g>
                  <polygon
                    points={`${chartData.swingHigh.centerX},${chartData.swingHigh.highY - 3} ${chartData.swingHigh.centerX - 4},${chartData.swingHigh.highY - 9} ${chartData.swingHigh.centerX + 4},${chartData.swingHigh.highY - 9}`}
                    fill="#10b981"
                  />
                  <text
                    x={chartData.swingHigh.centerX}
                    y={chartData.swingHigh.highY - 11}
                    textAnchor="middle"
                    fill="#34d399"
                    fontSize="8"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    H {chartData.swingHigh.candle.high.toFixed(digits)}
                  </text>
                </g>
              )}

              {/* Swing Low Visual Marker */}
              {chartData.swingLow && (
                <g>
                  <polygon
                    points={`${chartData.swingLow.centerX},${chartData.swingLow.lowY + 3} ${chartData.swingLow.centerX - 4},${chartData.swingLow.lowY + 9} ${chartData.swingLow.centerX + 4},${chartData.swingLow.lowY + 9}`}
                    fill="#f43f5e"
                  />
                  <text
                    x={chartData.swingLow.centerX}
                    y={chartData.swingLow.lowY + 18}
                    textAnchor="middle"
                    fill="#fb7185"
                    fontSize="8"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    L {chartData.swingLow.candle.low.toFixed(digits)}
                  </text>
                </g>
              )}

              {/* EMA & SMA Overlays */}
              {showOverlays && chartData.ema9Path && (
                <path d={chartData.ema9Path} fill="none" stroke="#22d3ee" strokeWidth="1.4" strokeLinecap="round" />
              )}
              {showOverlays && chartData.ema21Path && (
                <path d={chartData.ema21Path} fill="none" stroke="#fbbf24" strokeWidth="1.4" strokeLinecap="round" />
              )}
              {showOverlays && chartData.sma50Path && (
                <path d={chartData.sma50Path} fill="none" stroke="#a855f7" strokeWidth="1.4" strokeLinecap="round" />
              )}

              {/* RSI (14) Oscillator */}
              {showRsi && chartData.rsiPath && (
                <path d={chartData.rsiPath} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
              )}

              {/* Open Trade Positions (Entry price, SL, TP) */}
              {relatedPositions.map((pos) => {
                const posY = chartData.priceToY(pos.openPrice);
                const slY = pos.sl && pos.sl > 0 ? chartData.priceToY(pos.sl) : null;
                const tpY = pos.tp && pos.tp > 0 ? chartData.priceToY(pos.tp) : null;

                return (
                  <g key={`pos-${pos.ticket}`}>
                    {posY >= chartData.priceAreaTop && posY <= chartData.volumeAreaTop && (
                      <>
                        <line
                          x1="0"
                          y1={posY}
                          x2={chartData.svgWidth}
                          y2={posY}
                          stroke={pos.type === 'BUY' ? '#10b981' : '#f43f5e'}
                          strokeWidth="1.2"
                          strokeDasharray="5 3"
                        />
                        <rect
                          x={chartData.svgWidth - 78}
                          y={posY - 7}
                          width="76"
                          height="14"
                          rx="3"
                          fill={pos.type === 'BUY' ? '#064e3b' : '#881337'}
                          stroke={pos.type === 'BUY' ? '#059669' : '#e11d48'}
                          strokeWidth="0.8"
                        />
                        <text
                          x={chartData.svgWidth - 40}
                          y={posY + 3.5}
                          fill="#ffffff"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {pos.type} {pos.volume}L
                        </text>
                      </>
                    )}
                    {slY !== null && slY >= chartData.priceAreaTop && slY <= chartData.volumeAreaTop && (
                      <>
                        <line
                          x1="0"
                          y1={slY}
                          x2={chartData.svgWidth}
                          y2={slY}
                          stroke="#f43f5e"
                          strokeWidth="1"
                          strokeDasharray="2 3"
                        />
                        <rect
                          x={chartData.svgWidth - 44}
                          y={slY - 6.5}
                          width="42"
                          height="13"
                          rx="2"
                          fill="#881337"
                          stroke="#f43f5e"
                          strokeWidth="0.7"
                        />
                        <text
                          x={chartData.svgWidth - 23}
                          y={slY + 3}
                          fill="#fecdd3"
                          fontSize="8"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          SL
                        </text>
                      </>
                    )}
                    {tpY !== null && tpY >= chartData.priceAreaTop && tpY <= chartData.volumeAreaTop && (
                      <>
                        <line
                          x1="0"
                          y1={tpY}
                          x2={chartData.svgWidth}
                          y2={tpY}
                          stroke="#10b981"
                          strokeWidth="1"
                          strokeDasharray="2 3"
                        />
                        <rect
                          x={chartData.svgWidth - 44}
                          y={tpY - 6.5}
                          width="42"
                          height="13"
                          rx="2"
                          fill="#064e3b"
                          stroke="#10b981"
                          strokeWidth="0.7"
                        />
                        <text
                          x={chartData.svgWidth - 23}
                          y={tpY + 3}
                          fill="#a7f3d0"
                          fontSize="8"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          TP
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* Live MT5 Bid Price Line with Pulse Dot */}
              {(() => {
                const livePrice = activeTick?.bid || (activeCandleToDisplay ? activeCandleToDisplay.close : null);
                if (livePrice && chartData) {
                  const liveY = chartData.priceToY(livePrice);
                  if (liveY >= chartData.priceAreaTop && liveY <= chartData.volumeAreaTop) {
                    return (
                      <g>
                        <line
                          x1="0"
                          y1={liveY}
                          x2={chartData.svgWidth}
                          y2={liveY}
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                          strokeDasharray="4 2"
                        />
                        <circle cx={chartData.svgWidth - 5} cy={liveY} r="3" fill="#38bdf8" />
                      </g>
                    );
                  }
                }
                return null;
              })()}

              {/* Interactive Crosshair Lines & Axis Badges */}
              {mousePos && (
                <g>
                  <line
                    x1={mousePos.x}
                    y1="0"
                    x2={mousePos.x}
                    y2={chartData.totalHeight - chartData.timeAxisHeight}
                    stroke="#94a3b8"
                    strokeWidth="0.8"
                    strokeDasharray="3 3"
                  />
                  {mousePos.y <= chartData.volumeAreaTop && (
                    <>
                      <line
                        x1="0"
                        y1={mousePos.y}
                        x2={chartData.svgWidth}
                        y2={mousePos.y}
                        stroke="#94a3b8"
                        strokeWidth="0.8"
                        strokeDasharray="3 3"
                      />
                      {/* Pinned Price Badge on Right Axis */}
                      <rect
                        x={chartData.svgWidth - 62}
                        y={mousePos.y - 8}
                        width="60"
                        height="16"
                        fill="#0284c7"
                        rx="3"
                      />
                      <text
                        x={chartData.svgWidth - 32}
                        y={mousePos.y + 3.5}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {chartData.yToPrice(mousePos.y).toFixed(digits)}
                      </text>
                    </>
                  )}
                  {hoveredCandle && (
                    <>
                      {/* Pinned Time Badge on Bottom Axis */}
                      <rect
                        x={Math.min(chartData.svgWidth - 75, Math.max(5, mousePos.x - 35))}
                        y={chartData.totalHeight - 16}
                        width="70"
                        height="14"
                        fill="#334155"
                        rx="2"
                      />
                      <text
                        x={Math.min(chartData.svgWidth - 40, Math.max(40, mousePos.x))}
                        y={chartData.totalHeight - 6}
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="8.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {hoveredCandle.timeIso
                          ? hoveredCandle.timeIso.slice(11, 19)
                          : new Date(hoveredCandle.time * 1000).toISOString().slice(11, 19)}
                      </text>
                    </>
                  )}
                </g>
              )}
            </svg>

            {/* Live MT5 Bid & Bar Countdown Badge */}
            <div className="absolute right-2 top-2 bg-cyan-950/90 border border-cyan-500/80 px-2.5 py-1 rounded text-xs font-mono font-bold text-cyan-300 shadow-md flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>Bid: {(activeTick?.bid || activeCandleToDisplay?.close || 0).toFixed(digits)}</span>
              {(() => {
                const secs = chartDiagnostics?.barRemainingSeconds ?? chartDiagnostics?.currentBarSecondsRemaining;
                if (secs !== undefined && secs > 0) {
                  return (
                    <span className="text-[10px] text-cyan-400/90 border-l border-cyan-700 pl-1.5">
                      {secs}s left
                    </span>
                  );
                }
                return null;
              })()}
            </div>

            {/* Crosshair Price Tag on Right Axis when hovering */}
            {mousePos && mousePos.y <= chartData.volumeAreaTop && (
              <div
                className="absolute right-2 bg-slate-800 text-white border border-cyan-500 text-[10px] font-mono px-1.5 py-0.5 rounded shadow pointer-events-none"
                style={{ top: `${(mousePos.y / chartData.totalHeight) * 100}%`, transform: 'translateY(-50%)' }}
              >
                {chartData.yToPrice(mousePos.y).toFixed(digits)}
              </div>
            )}

            {/* Position Badges on Chart */}
            <div className="absolute left-2 top-2 flex flex-col gap-1 max-w-[300px]">
              {relatedPositions.map((pos) => (
                <div
                  key={`badge-${pos.ticket}`}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border shadow-sm backdrop-blur-sm ${
                    pos.type === 'BUY'
                      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                      : 'bg-rose-950/90 text-rose-300 border-rose-700'
                  }`}
                >
                  <span className="font-bold">{pos.type} #{pos.ticket}</span> @ {pos.openPrice.toFixed(digits)}
                  <span className={pos.profit >= 0 ? ' text-emerald-400 font-bold ml-1.5' : ' text-rose-400 font-bold ml-1.5'}>
                    ${pos.profit.toFixed(2)}
                  </span>
                  {pos.sl && pos.sl > 0 ? <span className="text-[9px] text-rose-400 ml-1">SL:{pos.sl.toFixed(digits)}</span> : null}
                  {pos.tp && pos.tp > 0 ? <span className="text-[9px] text-emerald-400 ml-1">TP:{pos.tp.toFixed(digits)}</span> : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-slate-400 text-xs font-mono flex flex-col items-center gap-2.5 p-8 text-center max-w-md">
            <div className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400">
              <TrendingUp className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <p className="font-bold text-sm text-slate-200">
                Awaiting Live Market Data for {activeSymbol || 'Selected Symbol'}
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                No historical candles have been streamed yet from MetaTrader 5 on timeframe <strong className="text-cyan-400">{activeTf}</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleManualPull}
                disabled={loading || !activeSymbol}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{loading ? 'Requesting...' : `Pull ${activeTf} Candles from MT5`}</span>
              </button>
            </div>

            <p className="text-[10px] text-slate-600 mt-2">
              Tip: Attach <code className="text-cyan-400">AIMT5Bridge.mq5</code> to any chart in MT5 with Algo Trading enabled.
            </p>
          </div>
        )}
      </div>

      {/* 7. Footer Telemetry Bar: Bar Countdown, Volume Stats, and Broker Time */}
      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800/80 mt-2">
        <div className="flex items-center gap-4">
          <span>
            Mode: <strong className="text-slate-200 uppercase">{chartMode}</strong>
          </span>
          <span>
            Window: <strong className="text-cyan-300">{displayBars.length}</strong> / {localCandles.length || candles.length} bars
          </span>

          {chartDiagnostics && (
            <span className="flex items-center gap-1.5 text-amber-300/90">
              <Clock className="h-3 w-3" />
              <span>
                Bar 0: {chartDiagnostics.barRemainingSeconds}s remaining ({chartDiagnostics.barProgressPct}%)
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {chartDiagnostics?.serverTimeIso && (
            <span className="text-slate-500 hidden sm:inline">
              Broker: {chartDiagnostics.serverTimeIso.replace('T', ' ').slice(0, 19)} (GMT{chartDiagnostics.brokerTimezoneOffsetHours >= 0 ? `+${chartDiagnostics.brokerTimezoneOffsetHours}` : chartDiagnostics.brokerTimezoneOffsetHours})
            </span>
          )}
          {activeTick && (
            <span>
              24h Range: <strong className="text-slate-300">{activeTick.low24h?.toFixed(digits) || '—'} - {activeTick.high24h?.toFixed(digits) || '—'}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
