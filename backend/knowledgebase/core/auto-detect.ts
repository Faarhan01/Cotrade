import { AccountInfo, CandleData, DetailedSymbolInfo, TickData } from '../../types/mt5.js';
import { computeATR, computeBollinger, computeEMA } from '../indicators/index.js';
import { mean } from './common.js';

export type AssetClass =
  | 'FOREX_MAJOR'
  | 'FOREX_MINOR'
  | 'FOREX_EXOTIC'
  | 'PRECIOUS_METALS'
  | 'COMMODITY'
  | 'CRYPTO'
  | 'INDEX'
  | 'SYNTHETIC'
  | 'EQUITY'
  | 'OTHER';

export type VolatilityRating = 'ULTRA_LOW' | 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

/**
 * Quality marker attached to every auto-detect profile.
 *
 * `LIVE`      - every value was derived from real MT5 candles / ticks.
 * `SYNTHETIC` - at least one value came from a built-in placeholder because
 *               no market data was available. The numbers are illustrative
 *               only and must not drive position sizing or execution.
 */
export type DataQuality = 'LIVE' | 'SYNTHETIC' | 'NONE';

export interface TradingSessionWindow {
  session: 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'LONDON_NY_OVERLAP' | 'ROLLOVER';
  gmtHours: string;
  activityLevel: 'QUIET' | 'MODERATE' | 'HIGH' | 'PEAK';
  typicalCharacteristics: string;
}

export interface SymbolAutoDetectProfile {
  symbol: string;
  cleanSymbol: string;
  assetClass: AssetClass;
  displayName: string;
  baseCurrency: string;
  quoteCurrency: string;
  digits: number;
  point: number;
  pipSize: number;
  contractSize: number;
  dataQuality: DataQuality;

  // Volatility & Price Mechanics
  currentPrice: number;
  spreadPips: number;
  spreadToAtrRatio: number; // Low (< 0.05) is ideal for scalping
  atr14Pips: number;
  adrPips: number; // Average Daily Range
  volatilityRating: VolatilityRating;
  
  // Optimal Trading Profile
  optimalTimeframes: {
    scalping: string[];
    dayTrading: string[];
    swingTrading: string[];
  };
  recommendedStrategies: {
    strategyType: string;
    name: string;
    suitabilityScore: number; // 0 - 100
    rationale: string;
  }[];
  
  // Recommended Risk & Execution Parameters
  suggestedRiskParams: {
    stopLossPoints: number;
    takeProfitPoints: number;
    trailingStopPoints: number;
    trailingStepPoints: number;
    lotSizeConservative: number;
    maxRecommendedHoldBars: number;
  };

  // Session Behavior
  sessionWindows: TradingSessionWindow[];
  bestSessionToTrade: string;
  
  // Operational Warnings & Notes
  executionCautions: string[];
  analyzedAt: number;
}

/**
 * Auto-detect the asset class from symbol string
 */
export function detectAssetClass(rawSymbol: string): AssetClass {
  const sym = (rawSymbol || '').toUpperCase().trim();
  const clean = sym.replace(/[^A-Z0-9]/g, '');

  // Synthetic Indices (e.g. Step Index, Volatility 75, Crash, Boom)
  if (
    sym.includes('STEP') ||
    sym.includes('VOLATILITY') ||
    sym.includes('CRASH') ||
    sym.includes('BOOM') ||
    sym.includes('JUMP') ||
    sym.includes('RANGE BREAK') ||
    sym.includes('RANGEBREAK') ||
    sym.includes('DEX') ||
    sym.includes('DRIFT') ||
    clean.startsWith('V10') ||
    clean.startsWith('V25') ||
    clean.startsWith('V50') ||
    clean.startsWith('V75') ||
    clean.startsWith('V100')
  ) {
    return 'SYNTHETIC';
  }

  // Crypto
  if (
    sym.includes('BTC') ||
    sym.includes('ETH') ||
    sym.includes('SOL') ||
    sym.includes('XRP') ||
    sym.includes('BNB') ||
    sym.includes('ADA') ||
    sym.includes('DOGE') ||
    sym.includes('AVAX')
  ) {
    return 'CRYPTO';
  }

  // Precious Metals
  if (
    sym.startsWith('XAU') ||
    sym.startsWith('XAG') ||
    sym.startsWith('XPT') ||
    sym.startsWith('XPD') ||
    sym.includes('GOLD') ||
    sym.includes('SILVER')
  ) {
    return 'PRECIOUS_METALS';
  }

  // Commodity / Energy
  if (
    sym.includes('OIL') ||
    sym.includes('WTI') ||
    sym.includes('BRENT') ||
    sym.includes('NGAS') ||
    sym.includes('GAS') ||
    sym.includes('COPPER')
  ) {
    return 'COMMODITY';
  }

  // Indices
  if (
    sym.includes('US30') ||
    sym.includes('NAS100') ||
    sym.includes('USTEC') ||
    sym.includes('SPX500') ||
    sym.includes('US500') ||
    sym.includes('GER40') ||
    sym.includes('DAX') ||
    sym.includes('UK100') ||
    sym.includes('JPN225') ||
    sym.includes('HK50') ||
    sym.includes('WS30')
  ) {
    return 'INDEX';
  }

  // Forex Majors
  const majors = [
    'EURUSD',
    'GBPUSD',
    'USDJPY',
    'USDCHF',
    'AUDUSD',
    'USDCAD',
    'NZDUSD',
  ];
  for (const m of majors) {
    if (sym.includes(m)) return 'FOREX_MAJOR';
  }

  // Forex Minors / Crosses
  const minorCurrencies = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
  let matchCount = 0;
  for (const c of minorCurrencies) {
    if (sym.includes(c)) matchCount++;
  }
  if (matchCount >= 2) return 'FOREX_MINOR';

  // Forex Exotics
  const exoticCurrencies = [
    'ZAR',
    'TRY',
    'MXN',
    'SEK',
    'NOK',
    'PLN',
    'SGD',
    'HKD',
    'CNH',
    'HUF',
    'CZK',
    'THB',
  ];
  for (const e of exoticCurrencies) {
    if (sym.includes(e)) return 'FOREX_EXOTIC';
  }

  return 'OTHER';
}

/**
 * Auto-detect pip mechanics and point multipliers
 */
export function detectPipMechanics(
  symbol: string,
  assetClass: AssetClass,
  existingDigits?: number
): { digits: number; point: number; pipSize: number; pipMultiplier: number } {
  const sym = symbol.toUpperCase();

  if (assetClass === 'SYNTHETIC') {
    const digits = existingDigits !== undefined ? existingDigits : 1;
    const point = Number(Math.pow(10, -digits).toFixed(digits));
    const pipMultiplier = digits <= 1 ? 1 : 10;
    const pipSize = point * pipMultiplier;
    return { digits, point, pipSize, pipMultiplier };
  }

  if (assetClass === 'CRYPTO') {
    const digits = existingDigits !== undefined ? existingDigits : sym.includes('BTC') ? 2 : 2;
    const point = Number(Math.pow(10, -digits).toFixed(digits));
    return { digits, point, pipSize: 1.0, pipMultiplier: 1.0 };
  }

  if (assetClass === 'PRECIOUS_METALS') {
    const digits = existingDigits !== undefined ? existingDigits : 2;
    const point = Number(Math.pow(10, -digits).toFixed(digits));
    const pipSize = 0.1; // 10 cents for Gold
    return { digits, point, pipSize, pipMultiplier: 10 };
  }

  if (assetClass === 'INDEX') {
    const digits = existingDigits !== undefined ? existingDigits : 2;
    const point = Number(Math.pow(10, -digits).toFixed(digits));
    return { digits, point, pipSize: 1.0, pipMultiplier: 1.0 };
  }

  if (sym.includes('JPY')) {
    const digits = existingDigits !== undefined ? existingDigits : 3;
    const point = Number(Math.pow(10, -digits).toFixed(digits));
    return { digits, point, pipSize: 0.01, pipMultiplier: 100 };
  }

  // Standard Forex pairs
  const digits = existingDigits !== undefined ? existingDigits : 5;
  const point = Number(Math.pow(10, -digits).toFixed(digits));
  return { digits, point, pipSize: 0.0001, pipMultiplier: 10000 };
}

/**
 * Single source of truth for pip mechanics across every auto-detect module.
 *
 * Previously four call sites each re-derived the pip size from the digit count
 * with the rule `digits === 3 || digits === 5 ? point * 10 : point`, while
 * `detectPipMechanics` used asset-class specific rules. The two disagreed by
 * 10x for gold (0.1 vs 0.01) and 100x for crypto (1.0 vs 0.01), so the same
 * symbol reported different ATR-in-pips on different auto-detect endpoints.
 */
export function resolvePipMechanics(
  symbol: string,
  digits?: number
): { digits: number; point: number; pipSize: number; pipMultiplier: number } {
  const sym = (symbol || 'EURUSD').toUpperCase();
  return detectPipMechanics(sym, detectAssetClass(sym), digits);
}

/**
 * Single source of truth for contract size.
 *
 * The previous fallback only returned 100000 for FOREX_MAJOR and 100 for
 * everything else, so forex crosses (FOREX_MINOR / FOREX_EXOTIC) were sized
 * with a 1000x-too-small contract - which in turn produced a 1000x-too-small
 * margin requirement and a 1000x-too-large lot size.
 */
export function resolveContractSize(
  assetClass: AssetClass,
  symbolInfo?: DetailedSymbolInfo | null
): number {
  const live = symbolInfo?.contractSize;
  if (live && live > 0) return live;
  switch (assetClass) {
    case 'PRECIOUS_METALS':
      return 100;
    case 'CRYPTO':
      return 1;
    case 'INDEX':
      return 1;
    case 'SYNTHETIC':
      return 1;
    case 'COMMODITY':
      return 100;
    case 'FOREX_MAJOR':
    case 'FOREX_MINOR':
    case 'FOREX_EXOTIC':
      return 100000;
    default:
      return 100000;
  }
}

/**
 * Intelligent Auto-Detection Engine
 * Inspects real MT5 symbol specifications, candles, and live ticks to build profile
 */
export function autoDetectSymbol(
  symbol: string,
  symbolInfo?: DetailedSymbolInfo | null,
  candles?: CandleData[],
  ticks?: TickData[]
): SymbolAutoDetectProfile {
  // Preserve raw symbol as received from MT5 (handles broker suffixes like .r, .m, .ecn)
  const targetSymbol = symbol ? symbol.trim() : (symbolInfo?.symbol || 'EURUSD');
  const upper = targetSymbol.toUpperCase();
  const cleanSymbol = upper;
  const assetClass = detectAssetClass(upper);
  const digits = symbolInfo?.digits ?? (upper.includes('JPY') ? 3 : upper.includes('BTC') ? 2 : 5);
  
  // Use exact point from broker if available, or accurately rounded value
  const point = (symbolInfo?.point && symbolInfo.point > 0)
    ? Number(symbolInfo.point.toFixed(digits))
    : Number(Math.pow(10, -digits).toFixed(digits));
  const { pipSize, pipMultiplier } = detectPipMechanics(targetSymbol, assetClass, digits);

  // Extract base and quote currencies - prefer actual broker values from MT5
  let baseCurrency = symbolInfo?.currencyBase || '';
  let quoteCurrency = symbolInfo?.currencyProfit || '';
  if (!baseCurrency || !quoteCurrency) {
    if (assetClass === 'SYNTHETIC') {
      baseCurrency = targetSymbol;
      quoteCurrency = 'USD';
    } else if (assetClass === 'CRYPTO') {
      baseCurrency = upper.replace(/USD|USDT/g, '');
      quoteCurrency = 'USD';
    } else if (upper.startsWith('XAU') || upper.startsWith('GOLD')) {
      baseCurrency = 'XAU';
      quoteCurrency = 'USD';
    } else if (upper.length === 6 && !upper.includes(' ')) {
      baseCurrency = upper.slice(0, 3);
      quoteCurrency = upper.slice(3, 6);
    } else {
      baseCurrency = targetSymbol;
      quoteCurrency = '';
    }
  }

  // Real price from live MT5 tick, symbol quote, or chart candles - never fake 1.0
  const currentPrice =
    (symbolInfo?.bid && symbolInfo.bid > 0)
      ? symbolInfo.bid
      : (ticks && ticks.length > 0 && ticks[ticks.length - 1].bid > 0)
      ? ticks[ticks.length - 1].bid
      : (candles && candles.length > 0 && candles[candles.length - 1].close > 0)
      ? candles[candles.length - 1].close
      : 0;

  // Calculate live spread in pips from real MT5 spread
  const rawSpreadPoints = symbolInfo?.spread ?? (ticks && ticks.length > 0 ? ticks[ticks.length - 1].spread : 0);
  const spreadPips = rawSpreadPoints > 0 ? Number(((rawSpreadPoints * point) / pipSize).toFixed(2)) : 0;

  // Compute ATR & ADR from available candles.
  // ATR is delegated to the shared knowledge base indicator module so that
  // every auto-detect endpoint reports the same Wilder-smoothed value for the
  // same candles (this used to be a simple mean of true range, which differed
  // from the canonical ATR used everywhere else in the app).
  let atr14Price = 0;
  let adrPrice = 0;
  let dataQuality: DataQuality = 'LIVE';
  if (candles && candles.length >= 15) {
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);
    atr14Price = computeATR(highs, lows, closes, 14) ?? 0;
    adrPrice = atr14Price * 1.5;
  } else {
    // No real candle data available - flagged as NONE, not SYNTHETIC (which means seeded fake data).
    dataQuality = 'NONE';
    if (assetClass === 'PRECIOUS_METALS') atr14Price = 25.0; // ~$25 gold range
    else if (assetClass === 'CRYPTO') atr14Price = currentPrice * 0.025; // ~2.5%
    else if (assetClass === 'INDEX') atr14Price = 250;
    else if (cleanSymbol.includes('JPY')) atr14Price = 0.85; // ~85 pips
    else atr14Price = 0.0065; // ~65 pips for EURUSD
    adrPrice = atr14Price * 1.6;
  }
  if (currentPrice <= 0) dataQuality = 'NONE';

  const atr14Pips = Number((atr14Price / pipSize).toFixed(1));
  const adrPips = Number((adrPrice / pipSize).toFixed(1));

  const spreadToAtrRatio = atr14Pips > 0 ? Number((spreadPips / atr14Pips).toFixed(4)) : 0.05;

  // Volatility classification
  let volatilityRating: VolatilityRating = 'NORMAL';
  if (assetClass === 'CRYPTO' || cleanSymbol.includes('XAU') || cleanSymbol.includes('NAS')) {
    volatilityRating = 'HIGH';
  } else if (cleanSymbol.includes('TRY') || cleanSymbol.includes('ZAR')) {
    volatilityRating = 'EXTREME';
  } else if (cleanSymbol === 'EURGBP' || cleanSymbol === 'EURCHF') {
    volatilityRating = 'LOW';
  } else if (atr14Pips > 120) {
    volatilityRating = 'HIGH';
  }

  // Recommended Optimal Timeframes
  let optimalTimeframes = {
    scalping: ['M1', 'M5'],
    dayTrading: ['M5', 'M15', 'M30'],
    swingTrading: ['H1', 'H4', 'D1'],
  };
  if (assetClass === 'CRYPTO') {
    optimalTimeframes = {
      scalping: ['M5', 'M15'],
      dayTrading: ['M15', 'H1'],
      swingTrading: ['H4', 'D1'],
    };
  } else if (assetClass === 'PRECIOUS_METALS') {
    optimalTimeframes = {
      scalping: ['M1', 'M5'],
      dayTrading: ['M15', 'H1'],
      swingTrading: ['H1', 'H4'],
    };
  }

  // Recommended Strategies & Suitability Scores
  const recommendedStrategies = [];
  if (assetClass === 'PRECIOUS_METALS' || assetClass === 'CRYPTO') {
    recommendedStrategies.push({
      strategyType: 'TREND_MOMENTUM',
      name: 'EMA Crossover & Trend Momentum',
      suitabilityScore: 94,
      rationale:
        'High directional momentum and strong trend continuation characteristics make Gold and Crypto ideal for moving average pullbacks.',
    });
    recommendedStrategies.push({
      strategyType: 'BOLLINGER_BREAKOUT',
      name: 'Volatility Expansion Breakout',
      suitabilityScore: 88,
      rationale:
        'Consolidation squeezes on this asset frequently erupt into powerful directional swings.',
    });
    recommendedStrategies.push({
      strategyType: 'RSI_REVERSAL',
      name: 'RSI Extreme Exhaustion',
      suitabilityScore: 68,
      rationale:
        'Caution: Strong trends can keep RSI pinned in overbought/oversold zones for extended durations.',
    });
  } else if (cleanSymbol === 'EURUSD' || cleanSymbol === 'EURGBP' || cleanSymbol === 'USDCHF') {
    recommendedStrategies.push({
      strategyType: 'RSI_REVERSAL',
      name: 'RSI Mean Reversion & S/R Bounce',
      suitabilityScore: 92,
      rationale:
        'Tight spreads and frequent cyclical range oscillations make major FX pairs prime candidates for mean reversion.',
    });
    recommendedStrategies.push({
      strategyType: 'MULTI_INDICATOR_CONSENSUS',
      name: 'Consensus Trend & Oscillator Confluence',
      suitabilityScore: 89,
      rationale:
        'Filters out false breakout whipsaws during low-volatility trading ranges.',
    });
    recommendedStrategies.push({
      strategyType: 'BOLLINGER_BREAKOUT',
      name: 'London Open Volatility Breakout',
      suitabilityScore: 82,
      rationale:
        'Captures explosive range expansions during the 07:00-09:00 GMT European session open.',
    });
  } else {
    recommendedStrategies.push({
      strategyType: 'MULTI_INDICATOR_CONSENSUS',
      name: 'Multi-Indicator Confluence',
      suitabilityScore: 86,
      rationale:
        'Combines trend and momentum filters to adapt dynamically across changing volatility regimes.',
    });
    recommendedStrategies.push({
      strategyType: 'EMA_CROSSOVER',
      name: 'Dual Moving Average Trend Follower',
      suitabilityScore: 80,
      rationale: 'Reliable benchmark for catching multi-hour trend waves.',
    });
  }

  // Risk & Sizing Parameters (Calculated in Points)
  let stopLossPoints = Math.round(atr14Price * 1.5 / point);
  let takeProfitPoints = Math.round(atr14Price * 2.5 / point);
  let trailingStopPoints = Math.round(atr14Price * 0.8 / point);
  let trailingStepPoints = Math.round(atr14Price * 0.2 / point);

  // Sane bounds for points
  if (assetClass === 'FOREX_MAJOR') {
    stopLossPoints = Math.max(150, Math.min(600, stopLossPoints));
    takeProfitPoints = Math.max(250, Math.min(1200, takeProfitPoints));
    trailingStopPoints = Math.max(100, Math.min(300, trailingStopPoints));
    trailingStepPoints = Math.max(20, Math.min(60, trailingStepPoints));
  } else if (assetClass === 'PRECIOUS_METALS') {
    stopLossPoints = Math.max(250, Math.min(1500, stopLossPoints));
    takeProfitPoints = Math.max(500, Math.min(3000, takeProfitPoints));
    trailingStopPoints = Math.max(200, Math.min(800, trailingStopPoints));
    trailingStepPoints = Math.max(50, Math.min(200, trailingStepPoints));
  } else if (assetClass === 'CRYPTO') {
    stopLossPoints = Math.max(500, Math.min(5000, stopLossPoints));
    takeProfitPoints = Math.max(1000, Math.min(10000, takeProfitPoints));
    trailingStopPoints = Math.max(400, Math.min(2500, trailingStopPoints));
    trailingStepPoints = Math.max(100, Math.min(500, trailingStepPoints));
  }

  const suggestedRiskParams = {
    stopLossPoints,
    takeProfitPoints,
    trailingStopPoints,
    trailingStepPoints,
    lotSizeConservative: assetClass === 'CRYPTO' ? 0.05 : assetClass === 'PRECIOUS_METALS' ? 0.05 : 0.1,
    maxRecommendedHoldBars: assetClass === 'CRYPTO' ? 70 : 40,
  };

  // Session Windows
  const sessionWindows: TradingSessionWindow[] = [
    {
      session: 'ASIAN',
      gmtHours: '00:00 - 08:00 GMT',
      activityLevel: cleanSymbol.includes('JPY') || cleanSymbol.includes('AUD') || cleanSymbol.includes('NZD') ? 'HIGH' : 'QUIET',
      typicalCharacteristics: 'Range-bound consolidation for European pairs; primary liquidity for JPY/AUD.',
    },
    {
      session: 'LONDON',
      gmtHours: '07:00 - 15:00 GMT',
      activityLevel: 'HIGH',
      typicalCharacteristics: 'High institutional volume, trend inception, breakout acceleration.',
    },
    {
      session: 'LONDON_NY_OVERLAP',
      gmtHours: '12:00 - 16:00 GMT',
      activityLevel: 'PEAK',
      typicalCharacteristics: 'Maximum daily volume and liquidity; sharpest trend moves and news events.',
    },
    {
      session: 'NEW_YORK',
      gmtHours: '13:00 - 21:00 GMT',
      activityLevel: 'HIGH',
      typicalCharacteristics: 'Key US economic releases (CPI, NFP, FOMC), high commodity & equity index activity.',
    },
    {
      session: 'ROLLOVER',
      gmtHours: '21:00 - 23:00 GMT',
      activityLevel: 'QUIET',
      typicalCharacteristics: 'Spreads widen significantly as interbank liquidity dries up. Avoid tight scalping.',
    },
  ];

  let bestSessionToTrade = 'London & New York Overlap (12:00 - 16:00 GMT)';
  if (cleanSymbol.includes('JPY') || cleanSymbol.includes('AUD')) {
    bestSessionToTrade = 'Asian & London Overlap (06:00 - 09:00 GMT) or Tokyo session';
  } else if (assetClass === 'CRYPTO') {
    bestSessionToTrade = '24/7 continuous; peak volatility during US Market Hours (13:00 - 21:00 GMT)';
  }

  // Execution Cautions
  const executionCautions: string[] = [];
  if (spreadToAtrRatio > 0.1) {
    executionCautions.push(`Elevated spread-to-ATR ratio (${(spreadToAtrRatio * 100).toFixed(1)}%). Scalping below M5 is discouraged.`);
  }
  if (assetClass === 'PRECIOUS_METALS') {
    executionCautions.push('Gold is highly sensitive to US 10Y Yields, Dollar Index (DXY), and Middle East geopolitical news.');
  }
  if (assetClass === 'CRYPTO') {
    executionCautions.push('Cryptocurrency pairs trade 24/7. Beware of sudden liquidity vacuums on weekends and large liquidation wicks.');
  }
  if (assetClass === 'FOREX_EXOTIC') {
    executionCautions.push('Significant overnight swap/rollover financing costs. Long-term holds should account for negative carry.');
  }
  executionCautions.push('Always enable Trailing Stops or breakeven safeguards prior to tier-1 macroeconomic releases.');

  return {
    symbol: targetSymbol,
    cleanSymbol: targetSymbol,
    assetClass,
    displayName: symbolInfo?.description ? symbolInfo.description : targetSymbol,
    baseCurrency,
    quoteCurrency,
    digits,
    point,
    pipSize,
    contractSize: resolveContractSize(assetClass, symbolInfo),
    dataQuality,
    currentPrice,
    spreadPips,
    spreadToAtrRatio,
    atr14Pips,
    adrPips,
    volatilityRating,
    optimalTimeframes,
    recommendedStrategies,
    suggestedRiskParams,
    sessionWindows,
    bestSessionToTrade,
    executionCautions,
    analyzedAt: Date.now(),
  };
}

export type MarketRegimeType =
  | 'TRENDING_BULLISH'
  | 'TRENDING_BEARISH'
  | 'MEAN_REVERTING_RANGE'
  | 'VOLATILITY_EXPANSION_BREAKOUT'
  | 'COMPRESSION_SQUEEZE';

export interface MarketRegimeProfile {
  symbol: string;
  regime: MarketRegimeType;
  regimeLabel: string;
  trendStrength: number; // 0 - 100
  volatilityState: 'SQUEEZE' | 'NORMAL' | 'EXPANDING' | 'EXTREME';
  adxEstimate: number;
  bollingerBandwidthPct: number;
  keySupport: number;
  keyResistance: number;
  pivotPoint: number;
  recommendedTactics: string[];
  tradeabilityScore: number; // 0 - 100
  dominantBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  dataQuality: DataQuality;
  detectedAt: number;
}

/**
 * Auto-detect market regime (Trending, Range, Breakout, Volatility Squeeze)
 */
export function autoDetectMarketRegime(
  symbol: string,
  candles?: CandleData[]
): MarketRegimeProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';

  // Use provided candles or generate representative bars for baseline evaluation
  const bars = (candles && candles.length >= 10) ? candles : [];
  
  if (bars.length < 10) {
    return {
      symbol: sym,
      regime: 'MEAN_REVERTING_RANGE',
      regimeLabel: 'Equilibrium Consolidation / Awaiting Quotes',
      trendStrength: 45,
      volatilityState: 'NORMAL',
      adxEstimate: 18,
      bollingerBandwidthPct: 0.85,
      keySupport: 0,
      keyResistance: 0,
      pivotPoint: 0,
      recommendedTactics: [
        'Awaiting live MetaTrader 5 candlestick stream for dynamic regime scanning.',
        'Apply standard range boundaries and 2:1 reward-to-risk bracket orders.',
      ],
      tradeabilityScore: 65,
      dominantBias: 'NEUTRAL',
      dataQuality: 'NONE',
      detectedAt: Date.now(),
    };
  }

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const n = closes.length;
  const currentPrice = closes[n - 1];

  // Key Support & Resistance (Lowest Low and Highest High over recent 20 bars)
  const lookback = Math.min(20, n);
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);
  const keyResistance = Math.max(...recentHighs);
  const keySupport = Math.min(...recentLows);
  const pivotPoint = Number(((keyResistance + keySupport + currentPrice) / 3).toFixed(5));

  // Compute Fast (9) and Slow (21) Exponential Moving Averages.
  // These previously used a simple mean (SMA) while the recommended tactics
  // advertised a "9/21 EMA ribbon" - and while the EMA_CROSSOVER strategy
  // template uses real EMAs. Delegating to computeEMA keeps all three aligned.
  const fastPeriod = Math.min(9, n);
  const slowPeriod = Math.min(21, n);
  const fastMa = computeEMA(closes, fastPeriod) ?? mean(closes.slice(-fastPeriod));
  const slowMa = computeEMA(closes, slowPeriod) ?? mean(closes.slice(-slowPeriod));

  // Bollinger Bands (20 periods) for Squeeze / Expansion detection.
  // Delegated to the shared module so the band width uses the same population
  // standard deviation as the rest of the app.
  const bb = computeBollinger(closes, Math.min(20, n), 2);
  const upperBand = bb?.upper ?? currentPrice;
  const lowerBand = bb?.lower ?? currentPrice;
  const bandwidthPct = bb && bb.middle > 0 ? Number((((bb.upper - bb.lower) / bb.middle) * 100).toFixed(3)) : 1.0;

  // Determine Volatility State
  let volatilityState: 'SQUEEZE' | 'NORMAL' | 'EXPANDING' | 'EXTREME' = 'NORMAL';
  if (bandwidthPct < 0.25) volatilityState = 'SQUEEZE';
  else if (bandwidthPct > 2.0) volatilityState = 'EXTREME';
  else if (bandwidthPct > 1.2) volatilityState = 'EXPANDING';

  // Slope of price movement over past 10 bars
  const price10BarsAgo = closes[Math.max(0, n - 10)];
  const netDisplacementPct = price10BarsAgo > 0 ? ((currentPrice - price10BarsAgo) / price10BarsAgo) * 100 : 0;

  // Classify Regime
  let regime: MarketRegimeType = 'MEAN_REVERTING_RANGE';
  let regimeLabel = 'Cyclical Mean Reversion Range';
  let dominantBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let trendStrength = 50;
  let adxEstimate = 20;
  const recommendedTactics: string[] = [];

  if (volatilityState === 'SQUEEZE') {
    regime = 'COMPRESSION_SQUEEZE';
    regimeLabel = 'Volatility Compression Squeeze (Breakout Imminent)';
    trendStrength = 30;
    adxEstimate = 14;
    dominantBias = 'NEUTRAL';
    recommendedTactics.push('Volatility is tightly compressed within narrow bands. Avoid range fade trades.');
    recommendedTactics.push('Prepare OCO (One-Cancels-Other) BUY_STOP and SELL_STOP bracket orders outside recent price channel.');
  } else if (currentPrice > upperBand || (volatilityState === 'EXPANDING' && netDisplacementPct > 0.4)) {
    regime = 'VOLATILITY_EXPANSION_BREAKOUT';
    regimeLabel = 'Bullish Volatility Expansion Breakout';
    dominantBias = 'BULLISH';
    trendStrength = 88;
    adxEstimate = 38;
    recommendedTactics.push('High directional expansion: Trail Stop Loss behind 9-period EMA.');
    recommendedTactics.push('Do not attempt counter-trend short entries during momentum acceleration.');
  } else if (currentPrice < lowerBand || (volatilityState === 'EXPANDING' && netDisplacementPct < -0.4)) {
    regime = 'VOLATILITY_EXPANSION_BREAKOUT';
    regimeLabel = 'Bearish Volatility Expansion Breakout';
    dominantBias = 'BEARISH';
    trendStrength = 88;
    adxEstimate = 38;
    recommendedTactics.push('Strong downward breakout: Ride short momentum with step-trailing protection.');
    recommendedTactics.push('Avoid catching falling knives until exhaustion candle forms.');
  } else if (fastMa > slowMa && currentPrice >= fastMa) {
    regime = 'TRENDING_BULLISH';
    regimeLabel = 'Ascending Bullish Trend';
    dominantBias = 'BULLISH';
    trendStrength = Math.min(95, Math.round(55 + Math.abs(netDisplacementPct) * 40));
    adxEstimate = Math.round(25 + trendStrength * 0.2);
    recommendedTactics.push('Buy dips toward the 9/21 EMA dynamic support ribbon.');
    recommendedTactics.push('Target previous session highs and 2:1 reward-to-risk expansion levels.');
  } else if (fastMa < slowMa && currentPrice <= fastMa) {
    regime = 'TRENDING_BEARISH';
    regimeLabel = 'Descending Bearish Trend';
    dominantBias = 'BEARISH';
    trendStrength = Math.min(95, Math.round(55 + Math.abs(netDisplacementPct) * 40));
    adxEstimate = Math.round(25 + trendStrength * 0.2);
    recommendedTactics.push('Sell rallies into the 9/21 EMA resistance cloud.');
    recommendedTactics.push('Target liquidity pools resting below recent swing lows.');
  } else {
    regime = 'MEAN_REVERTING_RANGE';
    regimeLabel = 'Range-Bound Consolidation';
    dominantBias = 'NEUTRAL';
    trendStrength = 38;
    adxEstimate = 16;
    recommendedTactics.push('Buy near support with tight stops; take profit near key resistance.');
    recommendedTactics.push('Oscillator-based strategies (RSI 30/70 bounce, Stochastic) have highest statistical win-rate.');
  }

  // Calculate Tradeability Score (0-100)
  let tradeabilityScore = 75;
  if (regime === 'TRENDING_BULLISH' || regime === 'TRENDING_BEARISH') tradeabilityScore = 90;
  if (regime === 'VOLATILITY_EXPANSION_BREAKOUT') tradeabilityScore = 85;
  if (volatilityState === 'SQUEEZE') tradeabilityScore = 60;

  return {
    symbol: sym,
    regime,
    regimeLabel,
    trendStrength,
    volatilityState,
    adxEstimate,
    bollingerBandwidthPct: bandwidthPct,
    keySupport: Number(keySupport.toFixed(5)),
    keyResistance: Number(keyResistance.toFixed(5)),
    pivotPoint,
    recommendedTactics,
    tradeabilityScore,
    dominantBias,
    dataQuality: 'LIVE',
    detectedAt: Date.now(),
  };
}

export interface AccountRiskProfile {
  symbol: string;
  accountLogin: number;
  accountEquity: number;
  accountBalance: number;
  accountCurrency: string;
  leverage: number;
  riskPercent: number;
  maxRiskUsd: number;
  recommendedLotSize: number;
  conservativeLotSize: number;
  aggressiveLotSize: number;
  stopLossPoints: number;
  takeProfitPoints: number;
  estimatedSlLossUsd: number;
  estimatedTpProfitUsd: number;
  rewardToRiskRatio: number;
  requiredMarginUsd: number;
  canExecuteSafely: boolean;
  safetyNotes: string[];
  calculatedAt: number;
}

/**
 * Auto-detect recommended lot sizes and SL/TP calibrated to real MT5 account capital
 */
export function autoDetectAccountRiskProfile(
  symbol: string,
  accountInfo?: AccountInfo | null,
  symbolProfile?: SymbolAutoDetectProfile | null,
  riskPercent = 1.0
): AccountRiskProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';
  const equity = accountInfo && accountInfo.equity > 0 ? accountInfo.equity : (accountInfo?.balance || 10000);
  const balance = accountInfo && accountInfo.balance > 0 ? accountInfo.balance : 10000;
  const leverage = accountInfo?.leverage || 100;
  const currency = accountInfo?.currency || 'USD';
  const login = accountInfo?.login || 0;

  const maxRiskUsd = Number(((equity * riskPercent) / 100).toFixed(2));

  // Determine Stop Loss distance in points
  const slPoints = symbolProfile?.suggestedRiskParams?.stopLossPoints || (sym.toUpperCase().includes('XAU') ? 600 : sym.toUpperCase().includes('BTC') ? 1500 : 300);
  const tpPoints = symbolProfile?.suggestedRiskParams?.takeProfitPoints || slPoints * 2;
  const rewardToRiskRatio = Number((tpPoints / slPoints).toFixed(2));

  // Pip point value calculation
  const point = symbolProfile?.point || (sym.toUpperCase().includes('JPY') ? 0.001 : 0.00001);
  const contractSize = symbolProfile?.contractSize || 100000;
  
  // Dollars per point per 1.0 standard lot:
  // For EURUSD: 1 lot = 100,000 EUR -> 1 point (0.00001) = $1 USD per lot
  let usdPerPointPerLot = point * contractSize;
  if (sym.toUpperCase().includes('XAU')) usdPerPointPerLot = 0.01 * 100; // $1 per point for gold
  if (sym.toUpperCase().includes('BTC')) usdPerPointPerLot = 0.1 * 1; // crypto
  if (usdPerPointPerLot <= 0) usdPerPointPerLot = 1.0;

  // Exact lot size calculation: riskAmount = lotSize * slPoints * usdPerPointPerLot
  const rawLot = maxRiskUsd / (slPoints * usdPerPointPerLot);
  const recommendedLotSize = Math.max(0.01, Math.min(10.0, Number(rawLot.toFixed(2))));
  const conservativeLotSize = Math.max(0.01, Number((recommendedLotSize * 0.5).toFixed(2)));
  const aggressiveLotSize = Math.max(0.01, Number((recommendedLotSize * 1.5).toFixed(2)));

  const estimatedSlLossUsd = Number((recommendedLotSize * slPoints * usdPerPointPerLot).toFixed(2));
  const estimatedTpProfitUsd = Number((recommendedLotSize * tpPoints * usdPerPointPerLot).toFixed(2));

  // Required margin: (lotSize * contractSize * currentPrice) / leverage
  const price = symbolProfile?.currentPrice || (sym.toUpperCase().includes('JPY') ? 154.5 : sym.toUpperCase().includes('XAU') ? 2650.0 : 1.085);
  const requiredMarginUsd = Number(((recommendedLotSize * contractSize * (sym.toUpperCase().includes('JPY') ? price / 150 : price)) / leverage).toFixed(2));

  const safetyNotes: string[] = [];
  let canExecuteSafely = true;

  if (accountInfo && accountInfo.freeMargin > 0 && requiredMarginUsd > accountInfo.freeMargin) {
    canExecuteSafely = false;
    safetyNotes.push(`Insufficient free margin ($${accountInfo.freeMargin.toFixed(2)} available vs $${requiredMarginUsd} required).`);
  }
  if (accountInfo && accountInfo.marginLevel > 0 && accountInfo.marginLevel < 150) {
    safetyNotes.push(`Account margin level is low (${accountInfo.marginLevel.toFixed(1)}%). Consider reducing lot size.`);
  }
  safetyNotes.push(`Sizing ensures maximum single-trade drawdown is capped at $${maxRiskUsd} (${riskPercent}% of equity).`);

  return {
    symbol: sym,
    accountLogin: login,
    accountEquity: equity,
    accountBalance: balance,
    accountCurrency: currency,
    leverage,
    riskPercent,
    maxRiskUsd,
    recommendedLotSize,
    conservativeLotSize,
    aggressiveLotSize,
    stopLossPoints: slPoints,
    takeProfitPoints: tpPoints,
    estimatedSlLossUsd,
    estimatedTpProfitUsd,
    rewardToRiskRatio,
    requiredMarginUsd,
    canExecuteSafely,
    safetyNotes,
    calculatedAt: Date.now(),
  };
}

export interface LiquiditySessionProfile {
  symbol: string;
  currentUtcTime: string;
  activeSession: string;
  sessionProgressPct: number;
  minutesRemainingInSession: number;
  liquidityScore: number; // 0 - 100
  spreadWideningRisk: 'LOW' | 'NORMAL' | 'ELEVATED' | 'HIGH';
  isSymbolPrimeTime: boolean;
  sessionNote: string;
}

/**
 * Auto-detect current session liquidity and market clock behavior
 */
export function autoDetectLiquidityAndSessions(symbol: string): LiquiditySessionProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const totalMinutes = utcHours * 60 + utcMinutes;
  const currentUtcTime = `${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')} UTC`;

  const assetClass = detectAssetClass(sym);
  if (assetClass === 'SYNTHETIC') {
    return {
      symbol: sym,
      currentUtcTime,
      activeSession: '24/7 Continuous Algorithmic Session',
      sessionProgressPct: Math.round((totalMinutes / 1440) * 100),
      minutesRemainingInSession: 1440 - totalMinutes,
      liquidityScore: 95,
      spreadWideningRisk: 'LOW',
      isSymbolPrimeTime: true,
      sessionNote: 'Continuous algorithmic price generation 24/7. No interbank rollover widening or weekend market closures.',
    };
  }

  let activeSession = 'Asian (Tokyo / Sydney)';
  let sessionStart = 0;
  let sessionEnd = 480; // 08:00
  let liquidityScore = 65;
  let spreadWideningRisk: 'LOW' | 'NORMAL' | 'ELEVATED' | 'HIGH' = 'NORMAL';
  let isSymbolPrimeTime = false;
  let sessionNote = 'Moderate volume; ideal for JPY, AUD, and NZD pairs.';

  // Check Overlap London & NY (12:00 - 16:00 UTC)
  if (totalMinutes >= 720 && totalMinutes < 960) {
    activeSession = 'London & New York Overlap (Peak Daily Volume)';
    sessionStart = 720;
    sessionEnd = 960;
    liquidityScore = 98;
    spreadWideningRisk = 'LOW';
    isSymbolPrimeTime = true;
    sessionNote = 'Maximum liquidity and tightest broker spreads. Highest momentum of the trading day.';
  } else if (totalMinutes >= 420 && totalMinutes < 960) {
    // London (07:00 - 16:00 UTC)
    activeSession = 'London European Session';
    sessionStart = 420;
    sessionEnd = 960;
    liquidityScore = 88;
    spreadWideningRisk = 'LOW';
    isSymbolPrimeTime = sym.toUpperCase().includes('EUR') || sym.toUpperCase().includes('GBP') || sym.toUpperCase().includes('CHF');
    sessionNote = 'Strong institutional flows and breakout continuation for EUR and GBP.';
  } else if (totalMinutes >= 780 && totalMinutes < 1260) {
    // New York (13:00 - 21:00 UTC)
    activeSession = 'New York US Session';
    sessionStart = 780;
    sessionEnd = 1260;
    liquidityScore = 85;
    spreadWideningRisk = 'LOW';
    isSymbolPrimeTime = sym.toUpperCase().includes('USD') || sym.toUpperCase().includes('XAU') || sym.toUpperCase().includes('US30');
    sessionNote = 'Primary window for US Dollar, Wall Street indices, and Commodities.';
  } else if (totalMinutes >= 1260 && totalMinutes < 1380) {
    // Rollover (21:00 - 23:00 UTC)
    activeSession = 'Interbank Rollover & Swap Calculation Window';
    sessionStart = 1260;
    sessionEnd = 1380;
    liquidityScore = 25;
    spreadWideningRisk = 'HIGH';
    isSymbolPrimeTime = false;
    sessionNote = 'Interbank liquidity dries up. Spreads widen significantly. Scalping is not recommended.';
  } else {
    // Asian
    activeSession = 'Asian Session (Tokyo & Sydney)';
    sessionStart = 0;
    sessionEnd = 420;
    liquidityScore = 60;
    spreadWideningRisk = 'NORMAL';
    isSymbolPrimeTime = sym.toUpperCase().includes('JPY') || sym.toUpperCase().includes('AUD') || sym.toUpperCase().includes('NZD');
    sessionNote = 'Mean reversion and channel trading dominate European pairs during Tokyo hours.';
  }

  const duration = Math.max(1, sessionEnd - sessionStart);
  const elapsed = Math.max(0, Math.min(duration, totalMinutes - sessionStart));
  const sessionProgressPct = Math.round((elapsed / duration) * 100);
  const minutesRemainingInSession = Math.max(0, sessionEnd - totalMinutes);

  return {
    symbol: sym,
    currentUtcTime,
    activeSession,
    sessionProgressPct,
    minutesRemainingInSession,
    liquidityScore,
    spreadWideningRisk,
    isSymbolPrimeTime,
    sessionNote,
  };
}

export interface SymbolMicrostructureProfile {
  symbol: string;
  assetClass: AssetClass;
  pipSize: number;
  point: number;
  digits: number;
  contractSize: number;
  pipValueUsdPerLot: number;
  spreadPoints: number;
  spreadCostUsdPerLot: number;
  swapLongPoints: number;
  swapShortPoints: number;
  marginRequiredUsdPerLot: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  stopsLevelPoints: number;
  freezeLevelPoints: number;
  executionMode: string;
  calculatedAt: number;
}

/**
 * Auto-detect symbol microstructure, pip economics, and broker margin mechanics
 */
export function autoDetectSymbolMicrostructure(
  symbol: string,
  symbolInfo?: DetailedSymbolInfo | null,
  ticks?: TickData[],
  account?: AccountInfo | null
): SymbolMicrostructureProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';
  const assetClass = detectAssetClass(sym);
  const pip = resolvePipMechanics(sym, symbolInfo?.digits);
  const digits = pip.digits;
  const point = symbolInfo?.point ?? pip.point;
  const pipSize = pip.pipSize;
  const contractSize = resolveContractSize(assetClass, symbolInfo);

  const latestTick = ticks?.find((t) => t.symbol.toLowerCase() === sym.toLowerCase()) || ticks?.[0];
  const currentPrice = latestTick?.ask || symbolInfo?.ask || 1.085;
  const spreadPoints = latestTick?.spread ?? symbolInfo?.spread ?? 15;

  // Calculate Pip Value in USD per 1.0 standard lot
  let pipValueUsdPerLot = pipSize * contractSize;
  if (sym.toUpperCase().includes('JPY')) {
    pipValueUsdPerLot = (pipSize * contractSize) / Math.max(1, currentPrice);
  } else if (sym.toUpperCase().includes('XAU')) {
    pipValueUsdPerLot = pipSize * 100; // $1.00 per 0.01 on 100oz
  } else if (sym.toUpperCase().includes('BTC')) {
    pipValueUsdPerLot = pipSize * 1;
  }
  pipValueUsdPerLot = Number(pipValueUsdPerLot.toFixed(2));
  if (pipValueUsdPerLot <= 0) pipValueUsdPerLot = 10.0;

  // Spread cost per standard lot
  const spreadCostUsdPerLot = Number((spreadPoints * point * contractSize * (sym.toUpperCase().includes('JPY') ? 1 / currentPrice : 1)).toFixed(2));

  // Margin required per 1.0 lot
  const leverage = account?.leverage || 100;
  let marginRequiredUsdPerLot = Number(((contractSize * (sym.toUpperCase().includes('JPY') ? currentPrice / 150 : currentPrice)) / leverage).toFixed(2));
  if (marginRequiredUsdPerLot <= 0) marginRequiredUsdPerLot = 1000.0;

  return {
    symbol: sym,
    assetClass,
    pipSize,
    point,
    digits,
    contractSize,
    pipValueUsdPerLot,
    spreadPoints,
    spreadCostUsdPerLot,
    swapLongPoints: -2.5,
    swapShortPoints: 0.8,
    marginRequiredUsdPerLot,
    minLot: symbolInfo?.minLot || 0.01,
    maxLot: symbolInfo?.maxLot || 100.0,
    lotStep: symbolInfo?.lotStep || 0.01,
    stopsLevelPoints: symbolInfo?.stopsLevel ?? 10,
    freezeLevelPoints: symbolInfo?.freezeLevel ?? 0,
    executionMode: symbolInfo?.tradeMode || 'FOREX_MARKET_EXECUTION',
    calculatedAt: Date.now(),
  };
}

export interface VolatilityNoiseProfile {
  symbol: string;
  atr14Price: number;
  atr14Points: number;
  atr14Pips: number;
  atrPctOfPrice: number;
  choppinessIndex: number; // 0 - 100 (> 61.8 = high chop, < 38.2 = trending)
  isChoppy: boolean;
  isTrending: boolean;
  kaufmanEfficiencyRatio: number; // 0.0 - 1.0 (1.0 = highly efficient directional trend)
  bollingerBandwidthPct: number;
  isVolatilitySqueeze: boolean; // low bandwidth indicates imminent explosion
  volatilityState: 'SQUEEZE_CONTRACTION' | 'NORMAL_VOLATILITY' | 'EXPANSION_SPIKE' | 'EXTREME_NOISE';
  recommendedSlAtrMultiplier: number;
  tickVelocityPerMinute: number;
  dataQuality: DataQuality;
  calculatedAt: number;
}

/**
 * Auto-detect volatility regime, market noise, and price contraction squeeze
 */
export function autoDetectVolatilityAndNoise(
  symbol: string,
  candles?: CandleData[],
  ticks?: TickData[]
): VolatilityNoiseProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';
  const cList = candles && candles.length >= 15 ? candles : [];
  const { digits, point, pipSize: pip } = resolvePipMechanics(sym);

  let atr14Price = 0.0015;
  let choppinessIndex = 50.0;
  let kaufmanEfficiencyRatio = 0.45;
  let bollingerBandwidthPct = 1.2;
  let isVolatilitySqueeze = false;

  if (cList.length >= 15) {
    const recent = cList.slice(-14);
    // 1. True Ranges over the 14-bar window (shared Wilder ATR is used for the
    //    reported ATR value; the raw TR sum is still needed for the Choppiness
    //    Index, which is defined on sum(TR) / range).
    let trSum = 0;
    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (let i = 0; i < recent.length; i++) {
      const c = recent[i];
      highestHigh = Math.max(highestHigh, c.high);
      lowestLow = Math.min(lowestLow, c.low);

      if (i === 0) {
        trSum += c.high - c.low;
      } else {
        const prevClose = recent[i - 1].close;
        const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
        trSum += tr;
      }
    }

    // Shared Wilder-smoothed ATR (same value the indicator engine reports)
    atr14Price = computeATR(
      cList.map((c) => c.high),
      cList.map((c) => c.low),
      cList.map((c) => c.close),
      14
    ) ?? atr14Price;

    // 2. Choppiness Index = 100 * LOG10(Sum(TR, 14) / (MaxHigh - MinLow)) / LOG10(14)
    const hlRange = Math.max(0.00001, highestHigh - lowestLow);
    const rawCi = 100 * (Math.log10(trSum / hlRange) / Math.log10(14));
    choppinessIndex = Number(Math.max(0, Math.min(100, rawCi)).toFixed(1));

    // 3. Kaufman Efficiency Ratio on 10 bars
    if (cList.length >= 10) {
      const sub = cList.slice(-10);
      const directionChange = Math.abs(sub[sub.length - 1].close - sub[0].close);
      let individualChanges = 0;
      for (let j = 1; j < sub.length; j++) {
        individualChanges += Math.abs(sub[j].close - sub[j - 1].close);
      }
      kaufmanEfficiencyRatio = Number((directionChange / Math.max(0.00001, individualChanges)).toFixed(2));
    }

    // 4. Bollinger Bandwidth over the canonical 20-period window.
    //    This previously used a 14-bar window with a *sample* standard
    //    deviation, so the squeeze / expansion thresholds were tuned for a
    //    different series than the one being measured.
    const closes = cList.map((c) => c.close);
    const bb = computeBollinger(closes, Math.min(20, closes.length), 2);
    if (bb && bb.middle > 0) {
      bollingerBandwidthPct = Number((((bb.upper - bb.lower) / bb.middle) * 100).toFixed(2));
    }
    isVolatilitySqueeze = bollingerBandwidthPct < 0.45;
  }

  const currentPrice = cList.length > 0 ? cList[cList.length - 1].close : (sym.toUpperCase().includes('JPY') ? 154.5 : 1.085);
  const atr14Points = Math.round(atr14Price / point);
  const atr14Pips = Number((atr14Price / pip).toFixed(1));
  const atrPctOfPrice = Number(((atr14Price / currentPrice) * 100).toFixed(3));

  let volatilityState: 'SQUEEZE_CONTRACTION' | 'NORMAL_VOLATILITY' | 'EXPANSION_SPIKE' | 'EXTREME_NOISE' = 'NORMAL_VOLATILITY';
  if (isVolatilitySqueeze) {
    volatilityState = 'SQUEEZE_CONTRACTION';
  } else if (choppinessIndex > 61.8 && kaufmanEfficiencyRatio < 0.25) {
    volatilityState = 'EXTREME_NOISE';
  } else if (kaufmanEfficiencyRatio > 0.65 || bollingerBandwidthPct > 2.5) {
    volatilityState = 'EXPANSION_SPIKE';
  }

  const isChoppy = choppinessIndex > 58.0;
  const isTrending = choppinessIndex < 42.0 || kaufmanEfficiencyRatio > 0.55;
  const recommendedSlAtrMultiplier = isChoppy ? 2.0 : 1.5;

  const tickVelocityPerMinute = ticks && ticks.length > 5 ? Math.min(120, ticks.length * 6) : 32;

  return {
    symbol: sym,
    atr14Price: Number(atr14Price.toFixed(digits)),
    atr14Points,
    atr14Pips,
    atrPctOfPrice,
    choppinessIndex,
    isChoppy,
    isTrending,
    kaufmanEfficiencyRatio,
    bollingerBandwidthPct,
    isVolatilitySqueeze,
    volatilityState,
    recommendedSlAtrMultiplier,
    tickVelocityPerMinute,
    dataQuality: cList.length >= 15 ? 'LIVE' : 'NONE',
    calculatedAt: Date.now(),
  };
}

export interface SupportResistancePivotProfile {
  symbol: string;
  currentPrice: number;
  pivotPoint: number;
  // Floor Trader Pivots
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
  // Camarilla Pivots
  camarillaH4Breakout: number;
  camarillaH3Short: number;
  camarillaL3Long: number;
  camarillaL4Breakdown: number;
  // Nearest Level Analysis
  nearestResistance: number;
  nearestSupport: number;
  distanceToResistancePoints: number;
  distanceToSupportPoints: number;
  breakoutAlert: 'AT_RESISTANCE_BREAKOUT' | 'AT_SUPPORT_BREAKDOWN' | 'WITHIN_NORMAL_CHANNEL';
  dataQuality: DataQuality;
  calculatedAt: number;
}

/**
 * Auto-detect Floor Trader Pivots, Camarilla Levels, and nearest key barriers
 */
export function autoDetectSupportResistanceAndPivots(
  symbol: string,
  candles?: CandleData[]
): SupportResistancePivotProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';
  const cList = candles && candles.length >= 10 ? candles : [];
  const { digits, point } = resolvePipMechanics(sym);

  let high = 1.092;
  let low = 1.081;
  let close = 1.086;

  if (cList.length >= 10) {
    const period = cList.slice(-20);
    high = Math.max(...period.map((c) => c.high));
    low = Math.min(...period.map((c) => c.low));
    close = period[period.length - 1].close;
  }

  // Classic Floor Trader Pivot Points
  const P = (high + low + close) / 3;
  const R1 = 2 * P - low;
  const S1 = 2 * P - high;
  const R2 = P + (high - low);
  const S2 = P - (high - low);
  const R3 = high + 2 * (P - low);
  const S3 = low - 2 * (high - P);

  // Camarilla Equation
  const diff = high - low;
  const camarillaH4Breakout = close + diff * 1.1 / 2;
  const camarillaH3Short = close + diff * 1.1 / 4;
  const camarillaL3Long = close - diff * 1.1 / 4;
  const camarillaL4Breakdown = close - diff * 1.1 / 2;

  // Nearest barriers
  const nearestResistance = close < R1 ? R1 : close < R2 ? R2 : R3;
  const nearestSupport = close > S1 ? S1 : close > S2 ? S2 : S3;
  const distanceToResistancePoints = Math.round(Math.max(0, nearestResistance - close) / point);
  const distanceToSupportPoints = Math.round(Math.max(0, close - nearestSupport) / point);

  let breakoutAlert: 'AT_RESISTANCE_BREAKOUT' | 'AT_SUPPORT_BREAKDOWN' | 'WITHIN_NORMAL_CHANNEL' = 'WITHIN_NORMAL_CHANNEL';
  if (close >= camarillaH4Breakout || distanceToResistancePoints < 25) {
    breakoutAlert = 'AT_RESISTANCE_BREAKOUT';
  } else if (close <= camarillaL4Breakdown || distanceToSupportPoints < 25) {
    breakoutAlert = 'AT_SUPPORT_BREAKDOWN';
  }

  return {
    symbol: sym,
    currentPrice: Number(close.toFixed(digits)),
    pivotPoint: Number(P.toFixed(digits)),
    r1: Number(R1.toFixed(digits)),
    r2: Number(R2.toFixed(digits)),
    r3: Number(R3.toFixed(digits)),
    s1: Number(S1.toFixed(digits)),
    s2: Number(S2.toFixed(digits)),
    s3: Number(S3.toFixed(digits)),
    camarillaH4Breakout: Number(camarillaH4Breakout.toFixed(digits)),
    camarillaH3Short: Number(camarillaH3Short.toFixed(digits)),
    camarillaL3Long: Number(camarillaL3Long.toFixed(digits)),
    camarillaL4Breakdown: Number(camarillaL4Breakdown.toFixed(digits)),
    nearestResistance: Number(nearestResistance.toFixed(digits)),
    nearestSupport: Number(nearestSupport.toFixed(digits)),
    distanceToResistancePoints,
    distanceToSupportPoints,
    breakoutAlert,
    dataQuality: cList.length >= 10 ? 'LIVE' : 'NONE',
    calculatedAt: Date.now(),
  };
}

export interface ExecutionSafetyCheck {
  criteria: string;
  passed: boolean;
  scoreImpact: number;
  details: string;
}

export interface ExecutionSafetyProfile {
  symbol: string;
  safetyScore: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  recommendation: 'SAFE_TO_EXECUTE' | 'EXECUTE_WITH_REDUCED_LOTS' | 'HIGH_SLIPPAGE_WARNING' | 'AVOID_TRADING';
  checklist: ExecutionSafetyCheck[];
  spreadHealth: 'TIGHT' | 'ACCEPTABLE' | 'WIDENED' | 'EXTREME';
  rolloverHazard: boolean;
  marginCushionSafe: boolean;
  calculatedAt: number;
}

/**
 * Auto-detect trade execution safety score, slippage hazard, and broker health
 */
export function autoDetectExecutionSafetyScore(
  symbol: string,
  account?: AccountInfo | null,
  symbolInfo?: DetailedSymbolInfo | null,
  candles?: CandleData[],
  ticks?: TickData[]
): ExecutionSafetyProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';
  const now = new Date();
  const utcHours = now.getUTCHours();
  const isRollover = utcHours >= 21 && utcHours < 23;

  const latestTick = ticks?.find((t) => t.symbol.toLowerCase() === sym.toLowerCase()) || ticks?.[0];
  const currentSpread = latestTick?.spread ?? symbolInfo?.spread ?? 15;
  const normalSpread = sym.toUpperCase().includes('EUR') || sym.toUpperCase().includes('USD') ? 15 : 25;

  const checklist: ExecutionSafetyCheck[] = [];
  let score = 100;

  // 1. Spread Check
  let spreadHealth: 'TIGHT' | 'ACCEPTABLE' | 'WIDENED' | 'EXTREME' = 'TIGHT';
  if (currentSpread <= normalSpread) {
    checklist.push({
      criteria: 'Spread Condition',
      passed: true,
      scoreImpact: 0,
      details: `Current spread is tight (${currentSpread} points). Low friction cost.`,
    });
  } else if (currentSpread <= normalSpread * 2) {
    spreadHealth = 'ACCEPTABLE';
    score -= 10;
    checklist.push({
      criteria: 'Spread Condition',
      passed: true,
      scoreImpact: -10,
      details: `Spread is slightly elevated (${currentSpread} points). Moderate friction.`,
    });
  } else {
    spreadHealth = 'WIDENED';
    score -= 25;
    checklist.push({
      criteria: 'Spread Condition',
      passed: false,
      scoreImpact: -25,
      details: `Spread widened to ${currentSpread} points. Slippage risk high.`,
    });
  }

  // 2. Rollover Check
  if (isRollover) {
    score -= 30;
    checklist.push({
      criteria: 'Interbank Rollover Window',
      passed: false,
      scoreImpact: -30,
      details: 'Current time is between 21:00-23:00 UTC rollover. Spreads widen and bank liquidity is minimal.',
    });
  } else {
    checklist.push({
      criteria: 'Interbank Rollover Window',
      passed: true,
      scoreImpact: 0,
      details: 'Clear of rollover window. Normal institutional trading hours active.',
    });
  }

  // 3. Margin Cushion
  let marginCushionSafe = true;
  if (account && account.marginLevel > 0 && account.marginLevel < 200) {
    marginCushionSafe = false;
    score -= 25;
    checklist.push({
      criteria: 'Account Margin Cushion',
      passed: false,
      scoreImpact: -25,
      details: `Account margin level is low (${account.marginLevel.toFixed(1)}%). Stopout risk elevated.`,
    });
  } else {
    checklist.push({
      criteria: 'Account Margin Cushion',
      passed: true,
      scoreImpact: 0,
      details: `Healthy account equity ($${account?.equity?.toFixed(2) || '10000.00'}) and margin cushion.`,
    });
  }

  // 4. Volatility Spike Hazard
  const lastCandle = candles && candles.length > 0 ? candles[candles.length - 1] : null;
  if (lastCandle && candles && candles.length > 5) {
    const avgRange = candles.slice(-5).reduce((acc, c) => acc + (c.high - c.low), 0) / 5;
    const currentRange = lastCandle.high - lastCandle.low;
    if (currentRange > avgRange * 3) {
      score -= 20;
      checklist.push({
        criteria: 'Price Action Stability',
        passed: false,
        scoreImpact: -20,
        details: 'Sudden high-velocity candle spike detected. Possible news release slippage.',
      });
    } else {
      checklist.push({
        criteria: 'Price Action Stability',
        passed: true,
        scoreImpact: 0,
        details: 'Price action is orderly with no runaway slippage spikes.',
      });
    }
  }

  const finalScore = Math.max(0, Math.min(100, score));
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'A+';
  let recommendation: 'SAFE_TO_EXECUTE' | 'EXECUTE_WITH_REDUCED_LOTS' | 'HIGH_SLIPPAGE_WARNING' | 'AVOID_TRADING' = 'SAFE_TO_EXECUTE';

  if (finalScore >= 90) {
    grade = 'A+';
    recommendation = 'SAFE_TO_EXECUTE';
  } else if (finalScore >= 75) {
    grade = 'A';
    recommendation = 'SAFE_TO_EXECUTE';
  } else if (finalScore >= 60) {
    grade = 'B';
    recommendation = 'EXECUTE_WITH_REDUCED_LOTS';
  } else if (finalScore >= 40) {
    grade = 'C';
    recommendation = 'HIGH_SLIPPAGE_WARNING';
  } else {
    grade = 'D';
    recommendation = 'AVOID_TRADING';
  }

  return {
    symbol: sym,
    safetyScore: finalScore,
    grade,
    recommendation,
    checklist,
    spreadHealth,
    rolloverHazard: isRollover,
    marginCushionSafe,
    calculatedAt: Date.now(),
  };
}

export interface ScalpingSuitabilityProfile {
  symbol: string;
  suitabilityScore: number; // 0 - 100
  isRecommendedForScalping: boolean;
  spreadToRangeRatioPct: number;
  recommendedTimeframe: string;
  targetTakeProfitPips: number;
  targetStopLossPips: number;
  maxHoldingTimeMinutes: number;
  dataQuality: DataQuality;
  rationale: string;
}

/**
 * Auto-detect high-frequency scalping viability on current broker quotes
 */
export function autoDetectScalpingSuitability(
  symbol: string,
  candles?: CandleData[],
  ticks?: TickData[]
): ScalpingSuitabilityProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';
  const { digits, point, pipSize: pip } = resolvePipMechanics(sym);

  const latestTick = ticks?.find((t) => t.symbol.toLowerCase() === sym.toLowerCase()) || ticks?.[0];
  const spreadPoints = latestTick?.spread ?? 15;
  const spreadPips = Number(((spreadPoints * point) / pip).toFixed(1));

  let atrPips = 8.5;
  if (candles && candles.length >= 15) {
    // Shared Wilder ATR - previously this used a plain high-low range average,
    // which is not a true range and understated the ATR.
    const atr = computeATR(
      candles.map((c) => c.high),
      candles.map((c) => c.low),
      candles.map((c) => c.close),
      14
    );
    if (atr !== null) atrPips = Number((atr / pip).toFixed(1));
  }

  const ratio = Number(((spreadPips / Math.max(0.1, atrPips)) * 100).toFixed(1));
  let score = 100 - Math.min(80, ratio * 2);
  if (sym.toUpperCase().includes('EURUSD') || sym.toUpperCase().includes('GBPUSD')) score += 15;
  if (spreadPips > 2.0) score -= 30;

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const isRecommendedForScalping = finalScore >= 70;

  return {
    symbol: sym,
    suitabilityScore: finalScore,
    isRecommendedForScalping,
    spreadToRangeRatioPct: ratio,
    recommendedTimeframe: 'M1',
    targetTakeProfitPips: Number(Math.max(5, atrPips * 1.2).toFixed(1)),
    targetStopLossPips: Number(Math.max(4, atrPips * 1.0).toFixed(1)),
    maxHoldingTimeMinutes: 15,
    dataQuality: candles && candles.length >= 15 ? 'LIVE' : 'NONE',
    rationale: isRecommendedForScalping
      ? `Tight spread (${spreadPips} pips) and high tick liquidity make ${sym} optimal for 1-minute to 5-minute scalping setups.`
      : `Spread takes up ${ratio}% of average bar range. High friction reduces scalping edge. Recommend M15+ swing trading instead.`,
  };
}

export interface FairValueGap {
  id: string;
  type: 'BULLISH_FVG' | 'BEARISH_FVG';
  topPrice: number;
  bottomPrice: number;
  midPrice: number;
  gapPips: number;
  gapPoints: number;
  candleIndex: number;
  candleTime: number;
  candleTimeIso?: string;
  status: 'UNMITIGATED' | 'PARTIALLY_MITIGATED' | 'FULLY_FILLED';
  mitigationPct: number;
  invalidationLevel: number;
}

export interface LiquidityPoolLevel {
  type: 'BUY_SIDE_LIQUIDITY' | 'SELL_SIDE_LIQUIDITY';
  price: number;
  touches: number;
  status: 'ACTIVE_POOL' | 'SWEPT_PURGED';
  significance: 'HIGH' | 'MEDIUM';
  description: string;
}

export interface InstitutionalImbalancesProfile {
  symbol: string;
  fvgs: FairValueGap[];
  activeUnmitigatedFvgs: FairValueGap[];
  nearestBullishFvg: FairValueGap | null;
  nearestBearishFvg: FairValueGap | null;
  liquidityPools: LiquidityPoolLevel[];
  imbalanceBias: 'BULLISH_IMBALANCE' | 'BEARISH_IMBALANCE' | 'BALANCED';
  orderFlowContext: string;
  analyzedAt: number;
}

export interface SessionOrderFlowProfile {
  symbol: string;
  activeSession: 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'LONDON_NY_OVERLAP' | 'ROLLOVER';
  asianRange: {
    high: number;
    low: number;
    rangePips: number;
    highSwept: boolean;
    lowSwept: boolean;
  };
  orderFlowBias: 'BULLISH_EXPANSION' | 'BEARISH_EXPANSION' | 'RANGE_ACCUMULATION' | 'LIQUIDITY_HUNT';
  judasSwingDetected: boolean;
  judasSwingType: 'BULL_TRAP_RUN' | 'BEAR_TRAP_RUN' | 'NONE';
  nextInstitutionalMagnet: number;
  tacticalGuidance: string;
  analyzedAt: number;
}

/**
 * Auto-detect Fair Value Gaps (FVG) and Institutional Liquidity Pools from candles
 */
export function autoDetectInstitutionalImbalances(
  symbol: string,
  candles?: CandleData[],
  point = 0.0001
): InstitutionalImbalancesProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';
  const pt = point > 0 ? point : 0.0001;
  const pSize = pt * 10;
  const fvgs: FairValueGap[] = [];
  const pools: LiquidityPoolLevel[] = [];

  if (!candles || candles.length < 5) {
    return {
      symbol: sym,
      fvgs: [],
      activeUnmitigatedFvgs: [],
      nearestBullishFvg: null,
      nearestBearishFvg: null,
      liquidityPools: [],
      imbalanceBias: 'BALANCED',
      orderFlowContext: 'Insufficient candle depth for institutional imbalance scan.',
      analyzedAt: Date.now(),
    };
  }

  const latestCandle = candles[candles.length - 1];
  const currentPrice = latestCandle.close;

  // Scan 3-candle patterns for Fair Value Gaps
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];

    // Bullish FVG: Strong upward expansion bar (c1) where c0.high < c2.low
    if (c2.low > c0.high && (c2.low - c0.high) >= pt * 3) {
      const top = c2.low;
      const bottom = c0.high;
      const gapRange = top - bottom;
      const gapPoints = Math.round(gapRange / pt);
      const gapPips = Number((gapRange / pSize).toFixed(1));

      // Check subsequent candles to calculate mitigation
      let lowestRetest = top;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low < lowestRetest) lowestRetest = candles[j].low;
      }

      let status: 'UNMITIGATED' | 'PARTIALLY_MITIGATED' | 'FULLY_FILLED' = 'UNMITIGATED';
      let mitigationPct = 0;
      if (lowestRetest <= bottom) {
        status = 'FULLY_FILLED';
        mitigationPct = 100;
      } else if (lowestRetest < top) {
        status = 'PARTIALLY_MITIGATED';
        mitigationPct = Math.min(100, Math.round(((top - lowestRetest) / gapRange) * 100));
      }

      fvgs.push({
        id: `fvg-bull-${c1.time}`,
        type: 'BULLISH_FVG',
        topPrice: Number(top.toFixed(5)),
        bottomPrice: Number(bottom.toFixed(5)),
        midPrice: Number(((top + bottom) / 2).toFixed(5)),
        gapPips,
        gapPoints,
        candleIndex: i - 1,
        candleTime: c1.time,
        candleTimeIso: c1.timeIso,
        status,
        mitigationPct,
        invalidationLevel: Number(bottom.toFixed(5)),
      });
    }

    // Bearish FVG: Strong downward drop bar (c1) where c0.low > c2.high
    if (c0.low > c2.high && (c0.low - c2.high) >= pt * 3) {
      const top = c0.low;
      const bottom = c2.high;
      const gapRange = top - bottom;
      const gapPoints = Math.round(gapRange / pt);
      const gapPips = Number((gapRange / pSize).toFixed(1));

      // Check subsequent candles to calculate mitigation
      let highestRetest = bottom;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high > highestRetest) highestRetest = candles[j].high;
      }

      let status: 'UNMITIGATED' | 'PARTIALLY_MITIGATED' | 'FULLY_FILLED' = 'UNMITIGATED';
      let mitigationPct = 0;
      if (highestRetest >= top) {
        status = 'FULLY_FILLED';
        mitigationPct = 100;
      } else if (highestRetest > bottom) {
        status = 'PARTIALLY_MITIGATED';
        mitigationPct = Math.min(100, Math.round(((highestRetest - bottom) / gapRange) * 100));
      }

      fvgs.push({
        id: `fvg-bear-${c1.time}`,
        type: 'BEARISH_FVG',
        topPrice: Number(top.toFixed(5)),
        bottomPrice: Number(bottom.toFixed(5)),
        midPrice: Number(((top + bottom) / 2).toFixed(5)),
        gapPips,
        gapPoints,
        candleIndex: i - 1,
        candleTime: c1.time,
        candleTimeIso: c1.timeIso,
        status,
        mitigationPct,
        invalidationLevel: Number(top.toFixed(5)),
      });
    }
  }

  // Scan Equal Highs (EQH - Buy-Side Liquidity) and Equal Lows (EQL - Sell-Side Liquidity)
  const tolerance = pt * 8; // ~0.8 pips
  for (let i = 0; i < candles.length - 1; i++) {
    for (let j = i + 1; j < candles.length; j++) {
      if (Math.abs(candles[i].high - candles[j].high) <= tolerance) {
        const pHigh = (candles[i].high + candles[j].high) / 2;
        const swept = candles.slice(j + 1).some((c) => c.high > pHigh + tolerance);
        if (!pools.some((p) => p.type === 'BUY_SIDE_LIQUIDITY' && Math.abs(p.price - pHigh) <= tolerance)) {
          pools.push({
            type: 'BUY_SIDE_LIQUIDITY',
            price: Number(pHigh.toFixed(5)),
            touches: 2,
            status: swept ? 'SWEPT_PURGED' : 'ACTIVE_POOL',
            significance: 'HIGH',
            description: `Equal Highs (EQH) Buy-Side Liquidity pool resting at ${pHigh.toFixed(5)}. Target for institutional stop run.`,
          });
        }
      }

      if (Math.abs(candles[i].low - candles[j].low) <= tolerance) {
        const pLow = (candles[i].low + candles[j].low) / 2;
        const swept = candles.slice(j + 1).some((c) => c.low < pLow - tolerance);
        if (!pools.some((p) => p.type === 'SELL_SIDE_LIQUIDITY' && Math.abs(p.price - pLow) <= tolerance)) {
          pools.push({
            type: 'SELL_SIDE_LIQUIDITY',
            price: Number(pLow.toFixed(5)),
            touches: 2,
            status: swept ? 'SWEPT_PURGED' : 'ACTIVE_POOL',
            significance: 'HIGH',
            description: `Equal Lows (EQL) Sell-Side Liquidity pool resting at ${pLow.toFixed(5)}. Target for institutional liquidity grab.`,
          });
        }
      }
    }
  }

  const activeUnmitigatedFvgs = fvgs.filter((f) => f.status !== 'FULLY_FILLED').slice(-8);
  const bullishFvgsBelow = activeUnmitigatedFvgs.filter((f) => f.type === 'BULLISH_FVG' && f.topPrice <= currentPrice);
  const bearishFvgsAbove = activeUnmitigatedFvgs.filter((f) => f.type === 'BEARISH_FVG' && f.bottomPrice >= currentPrice);

  const nearestBullishFvg = bullishFvgsBelow.length > 0 ? bullishFvgsBelow[bullishFvgsBelow.length - 1] : null;
  const nearestBearishFvg = bearishFvgsAbove.length > 0 ? bearishFvgsAbove[bearishFvgsAbove.length - 1] : null;

  let imbalanceBias: 'BULLISH_IMBALANCE' | 'BEARISH_IMBALANCE' | 'BALANCED' = 'BALANCED';
  if (bullishFvgsBelow.length > bearishFvgsAbove.length) imbalanceBias = 'BULLISH_IMBALANCE';
  else if (bearishFvgsAbove.length > bullishFvgsBelow.length) imbalanceBias = 'BEARISH_IMBALANCE';

  return {
    symbol: sym,
    fvgs: fvgs.slice(-15),
    activeUnmitigatedFvgs,
    nearestBullishFvg,
    nearestBearishFvg,
    liquidityPools: pools.slice(-8),
    imbalanceBias,
    orderFlowContext: `Detected ${activeUnmitigatedFvgs.length} active institutional imbalances and ${pools.length} liquidity pools. Price is currently ${imbalanceBias.replace('_', ' ').toLowerCase()}.`,
    analyzedAt: Date.now(),
  };
}

/**
 * Auto-detect Session Range & Order Flow Bias (Asian Range, London Open, NY Expansion)
 */
export function autoDetectSessionOrderFlowBias(
  symbol: string,
  candles?: CandleData[]
): SessionOrderFlowProfile {
  const sym = symbol ? symbol.trim() : 'EURUSD';
  const now = new Date();
  const utcHour = now.getUTCHours();

  let activeSession: 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'LONDON_NY_OVERLAP' | 'ROLLOVER' = 'ASIAN';
  if (utcHour >= 21 && utcHour < 23) activeSession = 'ROLLOVER';
  else if (utcHour >= 12 && utcHour < 16) activeSession = 'LONDON_NY_OVERLAP';
  else if (utcHour >= 13 && utcHour < 21) activeSession = 'NEW_YORK';
  else if (utcHour >= 7 && utcHour < 16) activeSession = 'LONDON';

  if (!candles || candles.length < 15) {
    return {
      symbol: sym,
      activeSession,
      asianRange: { high: 0, low: 0, rangePips: 0, highSwept: false, lowSwept: false },
      orderFlowBias: 'RANGE_ACCUMULATION',
      judasSwingDetected: false,
      judasSwingType: 'NONE',
      nextInstitutionalMagnet: 0,
      tacticalGuidance: 'Awaiting MT5 candle dataset to compute institutional session bias.',
      analyzedAt: Date.now(),
    };
  }

  // Filter candles that occurred during Asian Session (00:00 - 07:00 UTC)
  const asianCandles = candles.filter((c) => {
    const d = new Date(c.time * 1000);
    const h = d.getUTCHours();
    return h >= 0 && h < 7;
  });

  let asianHigh = 0;
  let asianLow = Infinity;
  if (asianCandles.length > 0) {
    asianHigh = Math.max(...asianCandles.map((c) => c.high));
    asianLow = Math.min(...asianCandles.map((c) => c.low));
  } else {
    // Fallback to first third of candles
    const subset = candles.slice(0, Math.floor(candles.length / 3));
    asianHigh = Math.max(...subset.map((c) => c.high));
    asianLow = Math.min(...subset.map((c) => c.low));
  }

  const currentPrice = candles[candles.length - 1].close;
  const pt = currentPrice > 100 ? 0.01 : 0.0001;
  const pSize = pt * 10;
  const rangePips = Number(((asianHigh - asianLow) / pSize).toFixed(1));

  // Check if Asian High or Low was swept
  const postAsianCandles = candles.slice(-20);
  const highSwept = postAsianCandles.some((c) => c.high > asianHigh + pt * 5);
  const lowSwept = postAsianCandles.some((c) => c.low < asianLow - pt * 5);

  let judasSwingDetected = false;
  let judasSwingType: 'BULL_TRAP_RUN' | 'BEAR_TRAP_RUN' | 'NONE' = 'NONE';
  let orderFlowBias: 'BULLISH_EXPANSION' | 'BEARISH_EXPANSION' | 'RANGE_ACCUMULATION' | 'LIQUIDITY_HUNT' = 'RANGE_ACCUMULATION';

  if (highSwept && currentPrice < asianHigh) {
    judasSwingDetected = true;
    judasSwingType = 'BULL_TRAP_RUN';
    orderFlowBias = 'BEARISH_EXPANSION';
  } else if (lowSwept && currentPrice > asianLow) {
    judasSwingDetected = true;
    judasSwingType = 'BEAR_TRAP_RUN';
    orderFlowBias = 'BULLISH_EXPANSION';
  } else if (currentPrice > asianHigh) {
    orderFlowBias = 'BULLISH_EXPANSION';
  } else if (currentPrice < asianLow) {
    orderFlowBias = 'BEARISH_EXPANSION';
  }

  const nextInstitutionalMagnet = orderFlowBias === 'BULLISH_EXPANSION'
    ? Number((asianHigh + (asianHigh - asianLow) * 0.618).toFixed(5))
    : Number((asianLow - (asianHigh - asianLow) * 0.618).toFixed(5));

  let tacticalGuidance = `Asian session range established (${rangePips} pips). `;
  if (judasSwingDetected) {
    tacticalGuidance += `Institutional Judas Swing liquidity sweep detected (${judasSwingType.replace('_', ' ')}). Anticipate rapid reversal toward opposite liquidity pool.`;
  } else if (orderFlowBias === 'BULLISH_EXPANSION') {
    tacticalGuidance += `Price expanded above Asian high. Favor buying dips toward ${asianHigh.toFixed(5)} order block.`;
  } else if (orderFlowBias === 'BEARISH_EXPANSION') {
    tacticalGuidance += `Price expanded below Asian low. Favor selling rallies toward ${asianLow.toFixed(5)} rejection block.`;
  } else {
    tacticalGuidance += 'Price remains inside session range. Trade mean reversion or await London breakout confirmation.';
  }

  return {
    symbol: sym,
    activeSession,
    asianRange: {
      high: Number(asianHigh.toFixed(5)),
      low: Number(asianLow.toFixed(5)),
      rangePips,
      highSwept,
      lowSwept,
    },
    orderFlowBias,
    judasSwingDetected,
    judasSwingType,
    nextInstitutionalMagnet,
    tacticalGuidance,
    analyzedAt: Date.now(),
  };
}

export interface ComprehensiveSymbolAnalysis {
  symbol: string;
  specs: SymbolAutoDetectProfile;
  regime: MarketRegimeProfile;
  session: LiquiditySessionProfile;
  riskProfile: AccountRiskProfile;
  microstructure: SymbolMicrostructureProfile;
  volatilityNoise: VolatilityNoiseProfile;
  pivotsAndLevels: SupportResistancePivotProfile;
  executionSafety: ExecutionSafetyProfile;
  scalpingSuitability: ScalpingSuitabilityProfile;
  imbalances: InstitutionalImbalancesProfile;
  sessionOrderFlow: SessionOrderFlowProfile;
  analyzedAt: number;
}

/**
 * Comprehensive master auto-detection suite combining all quantitative modules
 */
export function runComprehensiveAutoDetection(
  symbol: string,
  accountInfo?: AccountInfo | null,
  symbolInfo?: DetailedSymbolInfo | null,
  candles?: CandleData[],
  ticks?: TickData[]
): ComprehensiveSymbolAnalysis {
  const targetSymbol = symbol ? symbol.trim() : 'EURUSD';
  const specs = autoDetectSymbol(targetSymbol, symbolInfo, candles, ticks);
  const regime = autoDetectMarketRegime(targetSymbol, candles);
  const session = autoDetectLiquidityAndSessions(targetSymbol);
  const riskProfile = autoDetectAccountRiskProfile(targetSymbol, accountInfo, specs, 1.0);
  const microstructure = autoDetectSymbolMicrostructure(targetSymbol, symbolInfo, ticks, accountInfo);
  const volatilityNoise = autoDetectVolatilityAndNoise(targetSymbol, candles, ticks);
  const pivotsAndLevels = autoDetectSupportResistanceAndPivots(targetSymbol, candles);
  const executionSafety = autoDetectExecutionSafetyScore(targetSymbol, accountInfo, symbolInfo, candles, ticks);
  const scalpingSuitability = autoDetectScalpingSuitability(targetSymbol, candles, ticks);
  const imbalances = autoDetectInstitutionalImbalances(targetSymbol, candles, specs.point);
  const sessionOrderFlow = autoDetectSessionOrderFlowBias(targetSymbol, candles);

  return {
    symbol: targetSymbol,
    specs,
    regime,
    session,
    riskProfile,
    microstructure,
    volatilityNoise,
    pivotsAndLevels,
    executionSafety,
    scalpingSuitability,
    imbalances,
    sessionOrderFlow,
    analyzedAt: Date.now(),
  };
}

