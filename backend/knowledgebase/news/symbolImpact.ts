import { fetchMarketNews, MarketNewsItem } from './newsEngine.js';
import { getUpcomingEconomicEvents, EconomicEvent } from './economicCalendar.js';

export type MacroAssetClass = 'FOREX' | 'METALS' | 'CRYPTO' | 'INDICES' | 'COMMODITIES' | 'SYNTHETIC';

export interface CurrencySentimentDriver {
  currency: string;
  sentimentScore: number; // -100 to +100
  outlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  activeDrivers: string[];
}

export interface NewsCatalyst {
  sourceType: 'NEWS' | 'ECONOMIC_EVENT';
  headlineOrTitle: string;
  targetAsset: string;
  directImpactOnPair: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impactScoreOnPair: number; // -100 to +100
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  timingLabel: string;
  rationale: string;
}

export interface MacroCategoryImpact {
  score: number; // -100 to +100
  active: boolean;
  catalystsCount: number;
  summary: string;
}

export interface SymbolNewsImpact {
  symbol: string;
  assetClass: MacroAssetClass;
  baseAsset: string;
  quoteAsset: string;

  // Currency / Asset Decomposition
  baseAssetSentiment: CurrencySentimentDriver;
  quoteAssetSentiment: CurrencySentimentDriver;

  // Net Directional Bias & Score
  netSentimentScore: number; // -100 (Extremely Bearish) to +100 (Extremely Bullish)
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  directionalBias: {
    direction: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    confidence: number; // 0 - 100%
    driverExplanation: string;
  };

  // Event & Volatility Risk
  eventRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  imminentEventsCount: number;
  nextHighImpactEvent: {
    title: string;
    currency: string;
    minutesRemaining: number;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
  } | null;

  volatilityExpectation: {
    expectedAtrMultiplier: number; // 1.0x to 4.5x
    volatilityState: 'SUBDUED' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
    spreadSpikeRisk: 'LOW' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
    typicalSpreadMultiplier: number; // 1.0x to 5.0x
    slippageHazardRating: 'SAFE' | 'CAUTION' | 'HAZARDOUS';
    scalpingViability: 'OPTIMAL' | 'ACCEPTABLE' | 'RESTRICTED' | 'PROHIBITED';
  };

  // Category Drivers
  categories: {
    monetaryPolicy: MacroCategoryImpact;
    inflation: MacroCategoryImpact;
    employment: MacroCategoryImpact;
    geopolitics: MacroCategoryImpact;
    growthAndTrade: MacroCategoryImpact;
  };

  // Tactical Trade Execution Guidance
  historicalReactionTendency: string;
  actionablePrecautions: string[];
  suggestedStopBufferPoints: number;

  // Driving Catalysts
  drivingCatalysts: NewsCatalyst[];

  activeAlerts: string[];
  recentNews: MarketNewsItem[];
  upcomingEvents: EconomicEvent[];
  tradingRecommendation: string;
  analyzedAt: number;
  dataQuality: 'LIVE' | 'SIMULATED';
}

/**
 * Decomposes a financial symbol into base and quote assets
 */
function decomposeSymbol(symbol: string): {
  assetClass: MacroAssetClass;
  baseAsset: string;
  quoteAsset: string;
  displayName: string;
} {
  const clean = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // Synthetic Indices (Step Index, Volatility, Crash, Boom) - Insulated from macro news
  if (
    clean.includes('STEP') ||
    clean.includes('VOLATILITY') ||
    clean.includes('CRASH') ||
    clean.includes('BOOM') ||
    clean.includes('JUMP') ||
    clean.includes('RANGEBREAK') ||
    clean.includes('DEX') ||
    clean.includes('DRIFT') ||
    clean.startsWith('V10') ||
    clean.startsWith('V25') ||
    clean.startsWith('V50') ||
    clean.startsWith('V75') ||
    clean.startsWith('V100')
  ) {
    return { assetClass: 'SYNTHETIC', baseAsset: clean, quoteAsset: 'USD', displayName: symbol };
  }

  if (clean.startsWith('XAU') || clean.includes('GOLD')) {
    return { assetClass: 'METALS', baseAsset: 'XAU', quoteAsset: 'USD', displayName: 'Gold / US Dollar' };
  }
  if (clean.startsWith('XAG') || clean.includes('SILVER')) {
    return { assetClass: 'METALS', baseAsset: 'XAG', quoteAsset: 'USD', displayName: 'Silver / US Dollar' };
  }
  if (clean.startsWith('BTC') || clean.includes('BITCOIN')) {
    return { assetClass: 'CRYPTO', baseAsset: 'BTC', quoteAsset: 'USD', displayName: 'Bitcoin / US Dollar' };
  }
  if (clean.startsWith('ETH') || clean.includes('ETHEREUM')) {
    return { assetClass: 'CRYPTO', baseAsset: 'ETH', quoteAsset: 'USD', displayName: 'Ethereum / US Dollar' };
  }
  if (clean.startsWith('SOL')) {
    return { assetClass: 'CRYPTO', baseAsset: 'SOL', quoteAsset: 'USD', displayName: 'Solana / US Dollar' };
  }
  if (clean.includes('US30') || clean.includes('DJIA') || clean.includes('DOW')) {
    return { assetClass: 'INDICES', baseAsset: 'US30', quoteAsset: 'USD', displayName: 'Dow Jones Industrial 30' };
  }
  if (clean.includes('US500') || clean.includes('SPX')) {
    return { assetClass: 'INDICES', baseAsset: 'US500', quoteAsset: 'USD', displayName: 'S&P 500 Index' };
  }
  if (clean.includes('NAS100') || clean.includes('USTEC') || clean.includes('NDX')) {
    return { assetClass: 'INDICES', baseAsset: 'NAS100', quoteAsset: 'USD', displayName: 'Nasdaq 100 Index' };
  }
  if (clean.includes('GER40') || clean.includes('DAX')) {
    return { assetClass: 'INDICES', baseAsset: 'GER40', quoteAsset: 'EUR', displayName: 'German DAX 40' };
  }
  if (clean.includes('JPN225') || clean.includes('N225')) {
    return { assetClass: 'INDICES', baseAsset: 'JPN225', quoteAsset: 'JPY', displayName: 'Nikkei 225' };
  }
  if (clean.includes('USOIL') || clean.includes('WTI')) {
    return { assetClass: 'COMMODITIES', baseAsset: 'USOIL', quoteAsset: 'USD', displayName: 'WTI Crude Oil' };
  }
  if (clean.includes('BRENT') || clean.includes('UKOIL')) {
    return { assetClass: 'COMMODITIES', baseAsset: 'BRENT', quoteAsset: 'USD', displayName: 'Brent Crude Oil' };
  }

  // Standard 6-character FX Pair (e.g. EURUSD, GBPJPY, AUDCAD)
  if (clean.length === 6) {
    const base = clean.slice(0, 3);
    const quote = clean.slice(3, 6);
    return { assetClass: 'FOREX', baseAsset: base, quoteAsset: quote, displayName: `${base}/${quote}` };
  }

  // Fallback
  return { assetClass: 'FOREX', baseAsset: clean.slice(0, 3) || 'EUR', quoteAsset: clean.slice(3, 6) || 'USD', displayName: clean };
}

/**
 * Evaluates how news affects a currency pair:
 * Net pair effect = BaseAssetEffect - QuoteAssetEffect
 */
export async function analyzeSymbolNewsImpact(symbol: string): Promise<SymbolNewsImpact> {
  const cleanSymbol = (symbol || 'EURUSD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const { assetClass, baseAsset, quoteAsset, displayName } = decomposeSymbol(cleanSymbol);

  // If symbol is synthetic, bypass macro news completely
  if (assetClass === 'SYNTHETIC') {
    return {
      symbol: cleanSymbol,
      assetClass: 'SYNTHETIC',
      baseAsset: cleanSymbol,
      quoteAsset: 'USD',
      baseAssetSentiment: { currency: cleanSymbol, sentimentScore: 0, outlook: 'NEUTRAL', activeDrivers: ['Continuous mathematical tick volatility (Algorithmic / Synthetic)'] },
      quoteAssetSentiment: { currency: 'USD', sentimentScore: 0, outlook: 'NEUTRAL', activeDrivers: [] },
      netSentimentScore: 0,
      overallSentiment: 'NEUTRAL',
      directionalBias: {
        direction: 'NEUTRAL',
        confidence: 50,
        driverExplanation: 'Synthetic index: Operates on autonomous simulated tick models. Completely insulated from central bank monetary policy, inflation, and GDP news.',
      },
      eventRiskLevel: 'LOW',
      imminentEventsCount: 0,
      nextHighImpactEvent: null,
      volatilityExpectation: {
        expectedAtrMultiplier: 1.0,
        volatilityState: 'NORMAL',
        spreadSpikeRisk: 'LOW',
        typicalSpreadMultiplier: 1.0,
        slippageHazardRating: 'SAFE',
        scalpingViability: 'OPTIMAL',
      },
      categories: {
        monetaryPolicy: { score: 0, active: false, catalystsCount: 0, summary: 'Not applicable for synthetic indices.' },
        inflation: { score: 0, active: false, catalystsCount: 0, summary: 'Not applicable for synthetic indices.' },
        employment: { score: 0, active: false, catalystsCount: 0, summary: 'Not applicable for synthetic indices.' },
        geopolitics: { score: 0, active: false, catalystsCount: 0, summary: 'Not applicable for synthetic indices.' },
        growthAndTrade: { score: 0, active: false, catalystsCount: 0, summary: 'Not applicable for synthetic indices.' },
      },
      historicalReactionTendency: 'Pure technical and statistical distribution. No news-driven gaps or slippage.',
      actionablePrecautions: ['Macroeconomic news filter is bypassed for this asset. Trade strictly based on pattern confluence and volatility bands.'],
      suggestedStopBufferPoints: 0,
      drivingCatalysts: [],
      activeAlerts: [],
      recentNews: [],
      upcomingEvents: [],
      tradingRecommendation: 'Optimal for algorithmic scalping and technical mean-reversion. Insulated from macro calendar releases.',
      analyzedAt: Date.now(),
      dataQuality: 'LIVE',
    };
  }

  // Fetch news & economic events
  const [news, calendar] = await Promise.all([
    fetchMarketNews(cleanSymbol),
    Promise.resolve(getUpcomingEconomicEvents(cleanSymbol)),
  ]);

  const now = Date.now();
  const events = calendar.events || [];
  const activeAlerts = [...(calendar.activeAlerts || [])];

  // 1. Analyze Base vs Quote Currency Drivers
  const baseDrivers: string[] = [];
  const quoteDrivers: string[] = [];
  let baseScoreSum = 0;
  let baseCount = 0;
  let quoteScoreSum = 0;
  let quoteCount = 0;

  // Track category impacts
  const categoryScores = {
    monetaryPolicy: { scoreSum: 0, count: 0, catalysts: [] as string[] },
    inflation: { scoreSum: 0, count: 0, catalysts: [] as string[] },
    employment: { scoreSum: 0, count: 0, catalysts: [] as string[] },
    geopolitics: { scoreSum: 0, count: 0, catalysts: [] as string[] },
    growthAndTrade: { scoreSum: 0, count: 0, catalysts: [] as string[] },
  };

  const drivingCatalysts: NewsCatalyst[] = [];

  // Inspect News Articles
  for (const item of news) {
    const textUpper = `${item.title} ${item.summary}`.toUpperCase();
    const itemScore = item.sentimentScore || (item.sentiment === 'BULLISH' ? 50 : item.sentiment === 'BEARISH' ? -50 : 0);

    // Determine target currency/asset
    let targetsBase = false;
    let targetsQuote = false;

    if (
      textUpper.includes(baseAsset) ||
      (baseAsset === 'EUR' && (textUpper.includes('EURO') || textUpper.includes('ECB') || textUpper.includes('EUROZONE'))) ||
      (baseAsset === 'GBP' && (textUpper.includes('POUND') || textUpper.includes('BOE') || textUpper.includes('UK'))) ||
      (baseAsset === 'JPY' && (textUpper.includes('YEN') || textUpper.includes('BOJ') || textUpper.includes('JAPAN'))) ||
      (baseAsset === 'XAU' && (textUpper.includes('GOLD') || textUpper.includes('BULLION'))) ||
      (baseAsset === 'BTC' && (textUpper.includes('BITCOIN') || textUpper.includes('CRYPTO') || textUpper.includes('ETF'))) ||
      (baseAsset === 'US30' && (textUpper.includes('DOW') || textUpper.includes('WALL STREET'))) ||
      (baseAsset === 'USOIL' && (textUpper.includes('CRUDE') || textUpper.includes('OPEC') || textUpper.includes('OIL')))
    ) {
      targetsBase = true;
    }

    if (
      textUpper.includes(quoteAsset) ||
      (quoteAsset === 'USD' && (textUpper.includes('DOLLAR') || textUpper.includes('FED') || textUpper.includes('TREASURY') || textUpper.includes('POWELL') || textUpper.includes('FOMC'))) ||
      (quoteAsset === 'JPY' && (textUpper.includes('YEN') || textUpper.includes('BOJ') || textUpper.includes('JAPAN'))) ||
      (quoteAsset === 'EUR' && (textUpper.includes('EURO') || textUpper.includes('ECB'))) ||
      (quoteAsset === 'GBP' && (textUpper.includes('POUND') || textUpper.includes('BOE')))
    ) {
      targetsQuote = true;
    }

    // Categorization
    if (textUpper.includes('FED') || textUpper.includes('ECB') || textUpper.includes('BOJ') || textUpper.includes('RATE') || textUpper.includes('CUT') || textUpper.includes('HIKE')) {
      categoryScores.monetaryPolicy.scoreSum += itemScore;
      categoryScores.monetaryPolicy.count++;
      categoryScores.monetaryPolicy.catalysts.push(item.title);
    }
    if (textUpper.includes('CPI') || textUpper.includes('INFLATION') || textUpper.includes('PCE') || textUpper.includes('PRICES')) {
      categoryScores.inflation.scoreSum += itemScore;
      categoryScores.inflation.count++;
      categoryScores.inflation.catalysts.push(item.title);
    }
    if (textUpper.includes('PAYROLL') || textUpper.includes('JOB') || textUpper.includes('UNEMPLOYMENT') || textUpper.includes('NFP') || textUpper.includes('WAGE')) {
      categoryScores.employment.scoreSum += itemScore;
      categoryScores.employment.count++;
      categoryScores.employment.catalysts.push(item.title);
    }
    if (textUpper.includes('WAR') || textUpper.includes('GEOPOLITIC') || textUpper.includes('SANCTION') || textUpper.includes('MIDDLE EAST') || textUpper.includes('SAFE-HAVEN')) {
      categoryScores.geopolitics.scoreSum += itemScore;
      categoryScores.geopolitics.count++;
      categoryScores.geopolitics.catalysts.push(item.title);
    }
    if (textUpper.includes('GDP') || textUpper.includes('TRADE') || textUpper.includes('MANUFACTURING') || textUpper.includes('PMI')) {
      categoryScores.growthAndTrade.scoreSum += itemScore;
      categoryScores.growthAndTrade.count++;
      categoryScores.growthAndTrade.catalysts.push(item.title);
    }

    // Direct Pair Impact calculation:
    // Bullish Base => Bullish Pair (+itemScore)
    // Bullish Quote => Bearish Pair (-itemScore)
    let directPairImpact: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let impactScoreOnPair = 0;
    let rationale = '';

    if (targetsBase && !targetsQuote) {
      baseScoreSum += itemScore;
      baseCount++;
      baseDrivers.push(item.title);
      directPairImpact = itemScore > 15 ? 'BULLISH' : itemScore < -15 ? 'BEARISH' : 'NEUTRAL';
      impactScoreOnPair = itemScore;
      rationale = `${itemScore > 0 ? 'Bullish' : 'Bearish'} sentiment for base currency ${baseAsset} directly transmits ${directPairImpact.toLowerCase()} momentum to ${cleanSymbol}.`;
    } else if (targetsQuote && !targetsBase) {
      quoteScoreSum += itemScore;
      quoteCount++;
      quoteDrivers.push(item.title);
      // Invert for pair! Strong quote currency lowers the pair price!
      directPairImpact = itemScore > 15 ? 'BEARISH' : itemScore < -15 ? 'BULLISH' : 'NEUTRAL';
      impactScoreOnPair = -itemScore;
      rationale = `${itemScore > 0 ? 'Bullish' : 'Bearish'} catalyst for quote currency ${quoteAsset} creates ${directPairImpact.toLowerCase()} pressure on ${cleanSymbol}.`;
    } else if (targetsBase && targetsQuote) {
      baseScoreSum += Math.round(itemScore * 0.6);
      baseCount++;
      quoteScoreSum += Math.round(itemScore * 0.4);
      quoteCount++;
      directPairImpact = itemScore > 20 ? 'BULLISH' : itemScore < -20 ? 'BEARISH' : 'NEUTRAL';
      impactScoreOnPair = Math.round(itemScore * 0.5);
      rationale = `Macro driver affects both ${baseAsset} and ${quoteAsset}; net bias tilted ${directPairImpact.toLowerCase()}.`;
    }

    const elapsedMins = Math.max(1, Math.round((now - item.publishedAt) / (60 * 1000)));
    const timingLabel = elapsedMins < 60 ? `${elapsedMins}m ago` : `${Math.round(elapsedMins / 60)}h ago`;

    drivingCatalysts.push({
      sourceType: 'NEWS',
      headlineOrTitle: item.title,
      targetAsset: targetsBase ? baseAsset : targetsQuote ? quoteAsset : 'MACRO',
      directImpactOnPair: directPairImpact,
      impactScoreOnPair,
      severity: item.impact || 'MEDIUM',
      timingLabel,
      rationale: rationale || `General market intelligence influencing ${cleanSymbol}.`,
    });
  }

  // Inspect Upcoming Economic Events
  let nextHighImpactEvent: SymbolNewsImpact['nextHighImpactEvent'] = null;
  let imminentEventsCount = 0;
  let minMinutesToEvent = Infinity;

  for (const evt of events) {
    const diffMs = evt.scheduledTime - now;
    const diffMins = Math.round(diffMs / (60 * 1000));
    const isPast = diffMins < -15;

    if (diffMins >= -15 && diffMins <= 45) {
      imminentEventsCount++;
    }

    if (!isPast && evt.impact === 'HIGH' && diffMins < minMinutesToEvent) {
      minMinutesToEvent = diffMins;
      nextHighImpactEvent = {
        title: evt.title,
        currency: evt.currency,
        minutesRemaining: Math.max(0, diffMins),
        impact: evt.impact,
      };
    }

    // Add catalyst
    let pairImpact: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let rationale = '';
    const isQuoteCurrency = evt.currency === quoteAsset;
    const isBaseCurrency = evt.currency === baseAsset;

    if (isQuoteCurrency) {
      rationale = `Tier-1 event on quote currency (${quoteAsset}). A positive outcome strengthens ${quoteAsset} and pulls ${cleanSymbol} downward.`;
      pairImpact = 'NEUTRAL'; // Pending release
    } else if (isBaseCurrency) {
      rationale = `Tier-1 event on base currency (${baseAsset}). A positive surprise lifts ${cleanSymbol} upward.`;
      pairImpact = 'NEUTRAL';
    } else {
      rationale = `Macro event with spillover liquidity impact across global markets.`;
    }

    const timingStr = diffMins < 0 ? `${Math.abs(diffMins)}m ago` : diffMins === 0 ? 'NOW' : `in ${diffMins}m`;

    drivingCatalysts.push({
      sourceType: 'ECONOMIC_EVENT',
      headlineOrTitle: evt.title,
      targetAsset: evt.currency,
      directImpactOnPair: pairImpact,
      impactScoreOnPair: 0,
      severity: evt.impact,
      timingLabel: timingStr,
      rationale,
    });
  }

  // 2. Compute Base vs Quote Sentiment Scores
  const baseScore = baseCount > 0 ? Math.round(baseScoreSum / baseCount) : 5;
  const quoteScore = quoteCount > 0 ? Math.round(quoteScoreSum / quoteCount) : 10;

  const baseOutlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    baseScore >= 20 ? 'BULLISH' : baseScore <= -20 ? 'BEARISH' : 'NEUTRAL';
  const quoteOutlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    quoteScore >= 20 ? 'BULLISH' : quoteScore <= -20 ? 'BEARISH' : 'NEUTRAL';

  // Net Pair Sentiment: Base strength MINUS Quote strength!
  // If base is +60 and quote is -20 => Net is +60 - (-20) = +80 (Massively Bullish EURUSD)
  // If base is -30 and quote is +50 => Net is -30 - (+50) = -80 (Massively Bearish EURUSD)
  let netSentimentScore = baseScore - quoteScore;
  netSentimentScore = Math.max(-100, Math.min(100, netSentimentScore));

  let overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (netSentimentScore >= 25) overallSentiment = 'BULLISH';
  else if (netSentimentScore <= -25) overallSentiment = 'BEARISH';

  // 3. Directional Bias & Confidence
  let biasDirection: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' = 'NEUTRAL';
  if (netSentimentScore >= 55) biasDirection = 'STRONG_BUY';
  else if (netSentimentScore >= 20) biasDirection = 'BUY';
  else if (netSentimentScore <= -55) biasDirection = 'STRONG_SELL';
  else if (netSentimentScore <= -20) biasDirection = 'SELL';

  const confidence = Math.min(95, Math.max(35, Math.abs(netSentimentScore) + 25));

  let driverExplanation = '';
  if (biasDirection === 'STRONG_BUY' || biasDirection === 'BUY') {
    driverExplanation = `Net macroeconomic flow strongly favors ${displayName}. Bullish fundamentals on ${baseAsset} (${baseScore > 0 ? `+${baseScore}` : baseScore} pts) outpace ${quoteAsset} (${quoteScore > 0 ? `+${quoteScore}` : quoteScore} pts), driving sustained upside demand.`;
  } else if (biasDirection === 'STRONG_SELL' || biasDirection === 'SELL') {
    driverExplanation = `Macro fundamentals exert heavy downward pressure on ${displayName}. Dominant strength in quote currency ${quoteAsset} (${quoteScore > 0 ? `+${quoteScore}` : quoteScore} pts) relative to ${baseAsset} (${baseScore > 0 ? `+${baseScore}` : baseScore} pts) weighs heavily on exchange pricing.`;
  } else {
    driverExplanation = `Macro fundamentals are balanced between ${baseAsset} and ${quoteAsset}. No clear directional skew exists; technical range boundaries should guide execution.`;
  }

  // 4. Determine Event Risk Level, Volatility Multiplier & Spread Widening Hazard
  let eventRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let expectedAtrMultiplier = 1.0;
  let volatilityState: 'SUBDUED' | 'NORMAL' | 'ELEVATED' | 'EXTREME' = 'NORMAL';
  let spreadSpikeRisk: 'LOW' | 'MODERATE' | 'SEVERE' | 'CRITICAL' = 'LOW';
  let typicalSpreadMultiplier = 1.0;
  let slippageHazardRating: 'SAFE' | 'CAUTION' | 'HAZARDOUS' = 'SAFE';
  let scalpingViability: 'OPTIMAL' | 'ACCEPTABLE' | 'RESTRICTED' | 'PROHIBITED' = 'OPTIMAL';
  let suggestedStopBufferPoints = 150;

  if (activeAlerts.length > 0 || (nextHighImpactEvent && nextHighImpactEvent.minutesRemaining <= 30)) {
    eventRiskLevel = 'CRITICAL';
    expectedAtrMultiplier = 3.5;
    volatilityState = 'EXTREME';
    spreadSpikeRisk = 'CRITICAL';
    typicalSpreadMultiplier = 4.2;
    slippageHazardRating = 'HAZARDOUS';
    scalpingViability = 'PROHIBITED';
    suggestedStopBufferPoints = 650;
  } else if (nextHighImpactEvent && nextHighImpactEvent.minutesRemaining <= 120) {
    eventRiskLevel = 'HIGH';
    expectedAtrMultiplier = 2.2;
    volatilityState = 'ELEVATED';
    spreadSpikeRisk = 'SEVERE';
    typicalSpreadMultiplier = 2.4;
    slippageHazardRating = 'CAUTION';
    scalpingViability = 'RESTRICTED';
    suggestedStopBufferPoints = 400;
  } else if (events.some((e) => e.impact === 'HIGH')) {
    eventRiskLevel = 'MODERATE';
    expectedAtrMultiplier = 1.5;
    volatilityState = 'ELEVATED';
    spreadSpikeRisk = 'MODERATE';
    typicalSpreadMultiplier = 1.4;
    slippageHazardRating = 'CAUTION';
    scalpingViability = 'ACCEPTABLE';
    suggestedStopBufferPoints = 250;
  }

  // 5. Build Actionable Precautions & Rules
  const actionablePrecautions: string[] = [];
  if (eventRiskLevel === 'CRITICAL') {
    actionablePrecautions.push('HALT MARKET ORDERS: Major catalyst release in under 30 minutes.');
    actionablePrecautions.push(`Anticipate spread expansion up to ${typicalSpreadMultiplier}x normal baseline.`);
    actionablePrecautions.push(`Expand stop loss by at least +${suggestedStopBufferPoints} points to avoid whip-saw liquidations.`);
    actionablePrecautions.push('High-frequency scalping bots should be temporarily paused.');
  } else if (eventRiskLevel === 'HIGH') {
    actionablePrecautions.push(`High-impact release scheduled in ${nextHighImpactEvent?.minutesRemaining}m (${nextHighImpactEvent?.title}).`);
    actionablePrecautions.push('Trailing stops should be tightened on existing profitable positions.');
    actionablePrecautions.push(`Maintain stop buffer of +${suggestedStopBufferPoints} points minimum.`);
  } else if (overallSentiment === 'BULLISH') {
    actionablePrecautions.push(`Favor long setups on technical pullbacks to support zones.`);
    actionablePrecautions.push(`Avoid entering counter-trend short trades without heavy overbought exhaustion signals.`);
  } else if (overallSentiment === 'BEARISH') {
    actionablePrecautions.push(`Favor short setups on rallies to key overhead resistance.`);
    actionablePrecautions.push(`Beware of fakeout breakout bars to the upside.`);
  } else {
    actionablePrecautions.push('Balanced macro landscape: Trade technical support and resistance levels.');
    actionablePrecautions.push('Standard stop loss buffers and lot sizing apply.');
  }

  // 6. Historical Reaction Tendency tailored to symbol & driver
  let historicalReactionTendency = '';
  if (assetClass === 'METALS') {
    historicalReactionTendency =
      'Spot Gold (XAUUSD) exhibits high inverse correlation (-0.78) to US 10-Year Real Yields and the Dollar Index. On hot US inflation data, Gold typically suffers an initial 15-30 minute liquidation dip before institutional safe-haven demand establishes structural bids at major daily support.';
  } else if (cleanSymbol.includes('JPY')) {
    historicalReactionTendency =
      'Yen crosses (USDJPY, EURJPY) are exceptionally reactive to US Treasury rate differentials and BOJ yield curve control commentary. Any MOF intervention warnings trigger violent 60-120 pip downside wicks that typically retrace 50% once Tokyo cash markets close.';
  } else if (cleanSymbol.includes('EUR') || cleanSymbol.includes('GBP')) {
    historicalReactionTendency =
      'Major European pairs typically price in 70% of macro divergence during early London morning liquidity. High-impact US data (NFP, CPI) triggers 45-80 pip directional expansions during the first two 5-minute bars before settling into a secondary trend.';
  } else if (assetClass === 'CRYPTO') {
    historicalReactionTendency =
      'Bitcoin and major crypto assets trade as high-beta liquidity instruments. Tightening US dollar liquidity or hawkish Fed forward guidance drives initial risk-off pressure, while spot ETF daily net inflow data acts as the predominant medium-term price floor.';
  } else {
    historicalReactionTendency =
      'During Tier-1 macroeconomic releases, price tends to test liquidity pockets beyond recent high/low fractals within the first 60 seconds before establishing the true directional trend.';
  }

  // 7. Trading Recommendation
  let tradingRecommendation = 'Normal trading conditions. Maintain technical execution standards.';
  if (eventRiskLevel === 'CRITICAL') {
    tradingRecommendation = `IMMINENT CATALYST HAZARD: ${nextHighImpactEvent?.title || 'Tier-1 Release'} is scheduled in ${nextHighImpactEvent?.minutesRemaining ?? 0}m. Spreads are projected to widen by ${typicalSpreadMultiplier}x with severe slippage risk. Suspend automated execution and do not initiate new positions.`;
  } else if (eventRiskLevel === 'HIGH') {
    tradingRecommendation = `ELEVATED EVENT RISK: High-impact macro release approaching today. Tighten stops on open positions, expand SL distance by +${suggestedStopBufferPoints} points, and avoid placing tight scalping orders.`;
  } else if (overallSentiment === 'BULLISH') {
    tradingRecommendation = `BULLISH MACRO BIAS: ${baseAsset} strength outpaces ${quoteAsset}. Favor buying dips at Fibonacci and volume profile support zones with minimum 2:1 reward-to-risk.`;
  } else if (overallSentiment === 'BEARISH') {
    tradingRecommendation = `BEARISH MACRO BIAS: Strong ${quoteAsset} fundamentals weigh on ${baseAsset}. Favor shorting resistance tests and avoid chasing downside breakouts.`;
  }

  const buildCategorySummary = (cat: { scoreSum: number; count: number; catalysts: string[] }, defaultDesc: string) => {
    const score = cat.count > 0 ? Math.round(cat.scoreSum / cat.count) : 0;
    return {
      score,
      active: cat.count > 0,
      catalystsCount: cat.count,
      summary: cat.count > 0 ? `${cat.catalysts.slice(0, 2).join('; ')}` : defaultDesc,
    };
  };

  return {
    symbol: cleanSymbol,
    assetClass,
    baseAsset,
    quoteAsset,
    baseAssetSentiment: {
      currency: baseAsset,
      sentimentScore: baseScore,
      outlook: baseOutlook,
      activeDrivers: baseDrivers.slice(0, 3),
    },
    quoteAssetSentiment: {
      currency: quoteAsset,
      sentimentScore: quoteScore,
      outlook: quoteOutlook,
      activeDrivers: quoteDrivers.slice(0, 3),
    },
    netSentimentScore,
    overallSentiment,
    directionalBias: {
      direction: biasDirection,
      confidence,
      driverExplanation,
    },
    eventRiskLevel,
    imminentEventsCount,
    nextHighImpactEvent,
    volatilityExpectation: {
      expectedAtrMultiplier,
      volatilityState,
      spreadSpikeRisk,
      typicalSpreadMultiplier,
      slippageHazardRating,
      scalpingViability,
    },
    categories: {
      monetaryPolicy: buildCategorySummary(categoryScores.monetaryPolicy, 'Neutral central bank forward guidance.'),
      inflation: buildCategorySummary(categoryScores.inflation, 'Inflation tracking in line with consensus.'),
      employment: buildCategorySummary(categoryScores.employment, 'Labor market indicators stable.'),
      geopolitics: buildCategorySummary(categoryScores.geopolitics, 'Baseline geopolitical risk premium.'),
      growthAndTrade: buildCategorySummary(categoryScores.growthAndTrade, 'Steady economic expansion trajectory.'),
    },
    historicalReactionTendency,
    actionablePrecautions,
    suggestedStopBufferPoints,
    drivingCatalysts: drivingCatalysts.slice(0, 8),
    activeAlerts,
    recentNews: news.slice(0, 6),
    upcomingEvents: events.slice(0, 8),
    tradingRecommendation,
    analyzedAt: now,
    dataQuality: news.some((n) => n.dataQuality === 'LIVE') ? 'LIVE' : 'SIMULATED',
  };
}
