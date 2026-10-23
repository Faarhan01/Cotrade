import { CandleData, TickData } from '../../types/mt5.js';
import { fetchMarketNews, MarketNewsItem } from './newsEngine.js';
import { getUpcomingEconomicEvents, EconomicEvent } from './economicCalendar.js';
import { resolvePipMechanics } from '../core/auto-detect.js';
import { computeATR } from '../indicators/index.js';
import { tradeStore } from '../../services/tradeStore.js';
import { broadcast } from '../../services/websocketServer.js';

export interface AttributedNewsCatalyst {
  id: string;
  title: string;
  sourceType: 'ECONOMIC_EVENT' | 'BREAKING_NEWS' | 'MACRO_CATALYST';
  scheduledOrPublishedTime: number;
  scheduledOrPublishedTimeIso: string;
  timeDeltaSeconds: number; // positive = news preceded shock, negative = shock preceded news
  currencyOrAsset: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  attributionConfidence: number; // 0 to 100%
  attributionReasoning: string;
}

export interface RapidPriceShock {
  id: string;
  symbol: string;
  timeframe: string;
  shockType: 'VOLATILITY_EXPANSION' | 'FLASH_IMPULSE' | 'SPREAD_BLOWOUT' | 'WHIPSAW_LIQUIDATION' | 'BREAKOUT_SURGE';
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE';
  timestamp: number;
  timestampIso: string;
  priceStart: number;
  pricePeak: number;
  priceEnd: number;
  pipDisplacement: number; // Net pip movement (+/-)
  pipRange: number; // High to Low range in pips
  volatilityAtrMultiplier: number; // Shock bar range / baseline ATR
  spreadAtShockPoints: number;
  spreadAtShockPips: number;
  durationSeconds: number;
  pipVelocityPipsPerMinute: number;
  reactionType: 'INSTANT_DIRECT_BURST' | 'PRE_RELEASE_POSITIONING' | 'POST_RELEASE_CONTINUATION' | 'WHIPSAW_REVERSAL_TRAP' | 'TECHNICAL_LIQUIDITY_RUN';
  attributedCatalyst: AttributedNewsCatalyst | null;
  tacticalDirective: string;
  safeToTrade: boolean;
  coolingOffMinutesRemaining: number;
}

// In-memory buffer of detected shocks across symbols
const globalShockCache = new Map<string, RapidPriceShock[]>();

/**
 * Currency matching helper: checks if a news currency/keyword relates to the symbol.
 */
function isNewsRelevantToSymbol(symbol: string, currencyOrAsset: string, title: string): boolean {
  const sym = symbol.toUpperCase();
  const curr = (currencyOrAsset || '').toUpperCase();
  const text = (title || '').toUpperCase();

  // Direct currency match
  if (curr && sym.includes(curr)) return true;

  // Keyword matches for commodities / crypto / indices
  if (sym.includes('XAU') || sym.includes('GOLD')) {
    if (text.includes('GOLD') || text.includes('XAU') || text.includes('BULLION') || curr === 'USD' || text.includes('FED') || text.includes('YIELD')) return true;
  }
  if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('CRYPTO')) {
    if (text.includes('BITCOIN') || text.includes('CRYPTO') || text.includes('SEC') || text.includes('ETF') || text.includes('FED')) return true;
  }
  if (sym.includes('USD')) {
    if (curr === 'USD' || text.includes('FED') || text.includes('FOMC') || text.includes('POWELL') || text.includes('PAYROLL') || text.includes('CPI') || text.includes('INFLATION') || text.includes('DOLLAR')) return true;
  }
  if (sym.includes('EUR')) {
    if (curr === 'EUR' || text.includes('ECB') || text.includes('LAGARDE') || text.includes('EURO') || text.includes('GERMANY')) return true;
  }
  if (sym.includes('GBP')) {
    if (curr === 'GBP' || text.includes('BOE') || text.includes('POUND') || text.includes('BAILEY') || text.includes('UK')) return true;
  }
  if (sym.includes('JPY')) {
    if (curr === 'JPY' || text.includes('BOJ') || text.includes('YEN') || text.includes('UEDA') || text.includes('JAPAN')) return true;
  }

  return false;
}

/**
 * Detect rapid sudden movements and correlate them with news releases.
 */
export async function detectRapidMovementsAndAttribution(
  symbol: string,
  candles?: CandleData[],
  timeframe = 'M1'
): Promise<RapidPriceShock[]> {
  const sym = (symbol || 'EURUSD').trim().toUpperCase();
  const { pipSize, digits, point } = resolvePipMechanics(sym);

  let candleSeries = candles;
  if (!candleSeries || candleSeries.length < 10) {
    candleSeries = tradeStore.getChartHistory();
  }
  if (!candleSeries || candleSeries.length < 10) {
    const { dbGetCandles } = await import('../../database/db.js');
    candleSeries = await dbGetCandles(sym, timeframe, 150);
  }

  if (!candleSeries || candleSeries.length < 10) {
    return globalShockCache.get(sym) || [];
  }

  // Fetch news headlines and economic calendar releases
  const [newsList, calendar] = await Promise.all([
    fetchMarketNews(sym).catch(() => [] as MarketNewsItem[]),
    Promise.resolve(getUpcomingEconomicEvents(sym)),
  ]);

  const allNewsItems: Array<{
    id: string;
    title: string;
    sourceType: 'ECONOMIC_EVENT' | 'BREAKING_NEWS' | 'MACRO_CATALYST';
    timestampSec: number;
    currency: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  }> = [];

  for (const evt of calendar.events || []) {
    allNewsItems.push({
      id: evt.id,
      title: evt.title,
      sourceType: 'ECONOMIC_EVENT',
      timestampSec: Math.floor(evt.scheduledTime / 1000),
      currency: evt.currency,
      impact: evt.impact,
      sentiment: 'NEUTRAL',
    });
  }

  for (const news of newsList) {
    allNewsItems.push({
      id: news.id,
      title: news.title,
      sourceType: 'BREAKING_NEWS',
      timestampSec: Math.floor(news.publishedAt / 1000),
      currency: news.relevantSymbols?.[0] || 'MACRO',
      impact: news.impact,
      sentiment: news.sentiment,
    });
  }

  const detectedShocks: RapidPriceShock[] = [];
  const currentSpreadPts = tradeStore.getCurrentChart()?.spread || 15;
  const currentSpreadPips = Number((currentSpreadPts * point / pipSize).toFixed(1));

  // Compute rolling ATR baseline
  const highs = candleSeries.map((c) => c.high);
  const lows = candleSeries.map((c) => c.low);
  const closes = candleSeries.map((c) => c.close);

  // Scan across historical and recent candles (from index 5 onwards)
  for (let i = 5; i < candleSeries.length; i++) {
    const bar = candleSeries[i];
    const prevSliceHighs = highs.slice(Math.max(0, i - 14), i);
    const prevSliceLows = lows.slice(Math.max(0, i - 14), i);
    const prevSliceCloses = closes.slice(Math.max(0, i - 14), i);

    let baselineAtr = computeATR(prevSliceHighs, prevSliceLows, prevSliceCloses, Math.min(14, prevSliceHighs.length));
    if (!baselineAtr || baselineAtr <= 0) {
      baselineAtr = (Math.max(...prevSliceHighs) - Math.min(...prevSliceLows)) / Math.max(1, prevSliceHighs.length) || 0.0005;
    }

    const baselineAtrPips = baselineAtr / pipSize;
    const barRange = bar.high - bar.low;
    const barRangePips = barRange / pipSize;
    const barDisplacement = (bar.close - bar.open) / pipSize;
    const multiplier = baselineAtr > 0 ? barRange / baselineAtr : 1.0;

    // Check 3-bar impulse window as well
    const threeBarSlice = candleSeries.slice(Math.max(0, i - 2), i + 1);
    const threeBarHigh = Math.max(...threeBarSlice.map((c) => c.high));
    const threeBarLow = Math.min(...threeBarSlice.map((c) => c.low));
    const threeBarRangePips = (threeBarHigh - threeBarLow) / pipSize;
    const threeBarDisplacement = (bar.close - threeBarSlice[0].open) / pipSize;
    const threeBarMultiplier = baselineAtr > 0 ? (threeBarHigh - threeBarLow) / baselineAtr : 1.0;

    // Detection Criteria:
    // 1. Single bar ATR explosion (>= 2.4x ATR or >= 18 pips)
    // 2. Rolling 3-bar shock (>= 3.0x ATR or >= 25 pips)
    // 3. Whipsaw liquidation (wick top and bottom each > 0.8x ATR)
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    const isWhipsaw = upperWick > baselineAtr * 0.75 && lowerWick > baselineAtr * 0.75;
    const isSingleShock = multiplier >= 2.3 || barRangePips >= 18;
    const isMultiShock = threeBarMultiplier >= 2.8 || Math.abs(threeBarDisplacement) >= 25;

    if (!isSingleShock && !isMultiShock && !isWhipsaw) {
      continue;
    }

    // Determine shock details
    const activeMultiplier = Math.max(multiplier, threeBarMultiplier);
    const activePipsRange = Math.max(barRangePips, threeBarRangePips);
    const activeDispPips = Math.abs(barDisplacement) >= Math.abs(threeBarDisplacement) ? barDisplacement : threeBarDisplacement;

    let shockType: RapidPriceShock['shockType'] = 'VOLATILITY_EXPANSION';
    if (isWhipsaw) shockType = 'WHIPSAW_LIQUIDATION';
    else if (Math.abs(activeDispPips) >= 30) shockType = 'FLASH_IMPULSE';
    else if (activeMultiplier >= 3.0) shockType = 'BREAKOUT_SURGE';

    let severity: RapidPriceShock['severity'] = 'MODERATE';
    if (activeMultiplier >= 3.5 || activePipsRange >= 45) severity = 'CRITICAL';
    else if (activeMultiplier >= 2.4 || activePipsRange >= 22) severity = 'HIGH';

    const barDuration = i > 0 ? Math.max(60, bar.time - candleSeries[i - 1].time) : 60;
    const pipVelocity = (activePipsRange / (barDuration / 60));

    // Attribution: correlate with news releases
    let bestMatch: AttributedNewsCatalyst | null = null;
    let highestConfidence = 0;

    for (const news of allNewsItems) {
      if (!isNewsRelevantToSymbol(sym, news.currency, news.title)) continue;

      // Delta between news release and the shock candle timestamp
      const timeDeltaSec = bar.time - news.timestampSec;

      // Window: within -15 mins to +20 mins (allowing for pre-release rumors or slight clock drift)
      if (Math.abs(timeDeltaSec) <= 1200) {
        let confidence = 50;

        // Proximity score
        if (Math.abs(timeDeltaSec) <= 180) confidence += 35; // within 3 minutes
        else if (Math.abs(timeDeltaSec) <= 600) confidence += 20; // within 10 minutes

        // Impact score
        if (news.impact === 'HIGH') confidence += 15;
        else if (news.impact === 'MEDIUM') confidence += 5;

        // Title match score
        const t = news.title.toUpperCase();
        if (t.includes('CPI') || t.includes('RATE') || t.includes('FOMC') || t.includes('PAYROLL') || t.includes('NFP') || t.includes('ECB')) {
          confidence += 10;
        }

        confidence = Math.min(98, confidence);

        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          const deltaMins = Math.round(timeDeltaSec / 60);
          const timeText = timeDeltaSec >= 0 ? `${deltaMins}m post-release` : `${Math.abs(deltaMins)}m pre-release`;

          const reasoning = `Shock occurred ${timeText} of "${news.title}" (${news.currency}). Symbol experienced a ${activePipsRange.toFixed(1)} pip impulse (${activeMultiplier.toFixed(1)}x ATR).`;

          bestMatch = {
            id: news.id,
            title: news.title,
            sourceType: news.sourceType,
            scheduledOrPublishedTime: news.timestampSec,
            scheduledOrPublishedTimeIso: new Date(news.timestampSec * 1000).toISOString(),
            timeDeltaSeconds: timeDeltaSec,
            currencyOrAsset: news.currency,
            impact: news.impact,
            sentiment: news.sentiment,
            attributionConfidence: confidence,
            attributionReasoning: reasoning,
          };
        }
      }
    }

    // Reaction classification
    let reactionType: RapidPriceShock['reactionType'] = 'TECHNICAL_LIQUIDITY_RUN';
    if (bestMatch) {
      if (isWhipsaw) reactionType = 'WHIPSAW_REVERSAL_TRAP';
      else if (bestMatch.timeDeltaSeconds >= -120 && bestMatch.timeDeltaSeconds <= 180) reactionType = 'INSTANT_DIRECT_BURST';
      else if (bestMatch.timeDeltaSeconds < -120) reactionType = 'PRE_RELEASE_POSITIONING';
      else reactionType = 'POST_RELEASE_CONTINUATION';
    }

    // Tactical directive for safe algorithmic execution
    let directive = `Normal caution. Spread is ${currentSpreadPips} pips. Standard stops adequate.`;
    let safeToTrade = true;
    let coolingOffMinutes = 0;

    const secondsAgo = Math.floor(Date.now() / 1000) - bar.time;
    if (secondsAgo < 1800) {
      coolingOffMinutes = Math.max(0, Math.ceil((1800 - secondsAgo) / 60));
      if (severity === 'CRITICAL' || severity === 'HIGH' || isWhipsaw) {
        safeToTrade = coolingOffMinutes === 0;
        directive = isWhipsaw
          ? `WHIPSAW HAZARD: Liquidity trapped on both extremes. Pausing bot entries for ${coolingOffMinutes}m to avoid slippage.`
          : `MACRO VOLATILITY EXPANSION (${activeMultiplier.toFixed(1)}x ATR): Driven by ${bestMatch ? bestMatch.title : 'Market Shock'}. Wait ${coolingOffMinutes}m for spread & order book stabilization.`;
      }
    }

    const shock: RapidPriceShock = {
      id: `shock-${sym}-${bar.time}-${i}`,
      symbol: sym,
      timeframe,
      shockType,
      severity,
      timestamp: bar.time,
      timestampIso: bar.timeIso || new Date(bar.time * 1000).toISOString(),
      priceStart: bar.open,
      pricePeak: bar.high,
      priceEnd: bar.close,
      pipDisplacement: Number(activeDispPips.toFixed(1)),
      pipRange: Number(activePipsRange.toFixed(1)),
      volatilityAtrMultiplier: Number(activeMultiplier.toFixed(2)),
      spreadAtShockPoints: currentSpreadPts,
      spreadAtShockPips: currentSpreadPips,
      durationSeconds: barDuration,
      pipVelocityPipsPerMinute: Number(pipVelocity.toFixed(1)),
      reactionType,
      attributedCatalyst: bestMatch,
      tacticalDirective: directive,
      safeToTrade,
      coolingOffMinutesRemaining: coolingOffMinutes,
    };

    detectedShocks.push(shock);
  }

  // Sort newest first
  detectedShocks.sort((a, b) => b.timestamp - a.timestamp);
  globalShockCache.set(sym, detectedShocks);

  return detectedShocks;
}

/**
 * Check if a symbol is currently under a rapid shock cooling off period.
 */
export function isSymbolInShockCoolingOff(symbol: string): { inShock: boolean; reason?: string; shock?: RapidPriceShock } {
  const sym = symbol.toUpperCase().trim();
  const shocks = globalShockCache.get(sym) || [];
  const recentCritical = shocks.find((s) => s.coolingOffMinutesRemaining > 0 && (s.severity === 'CRITICAL' || s.severity === 'HIGH'));

  if (recentCritical) {
    return {
      inShock: true,
      reason: recentCritical.tacticalDirective,
      shock: recentCritical,
    };
  }

  return { inShock: false };
}

/**
 * Retrieve all registered market shocks across symbols.
 */
export function getAllRegisteredShocks(): RapidPriceShock[] {
  const all: RapidPriceShock[] = [];
  for (const list of globalShockCache.values()) {
    all.push(...list);
  }
  all.sort((a, b) => b.timestamp - a.timestamp);
  return all;
}
