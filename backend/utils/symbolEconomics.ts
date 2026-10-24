/**
 * Symbol Economics & Market Specification Engine
 *
 * Implements institutionally accurate symbol-aware pricing, pip calculation,
 * risk-based position sizing, stops-level validation, and profit calculation
 * across Forex Majors, Crosses, JPY Pairs, Gold/Metals, Oil, Indices, and Crypto.
 */

export type AssetClass =
  | 'FOREX_MAJOR'
  | 'FOREX_MINOR'
  | 'METALS'
  | 'COMMODITIES'
  | 'INDICES'
  | 'CRYPTO'
  | 'EQUITIES';

export interface SymbolSpecs {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  point: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  contractSize: number;
  stopsLevel?: number;
  freezeLevel?: number;
  tickValue?: number;
  tickSize?: number;
  currencyBase?: string;
  currencyProfit?: string;
  tradeAllowed?: boolean;
}

const FOREX_MAJORS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'];
const METALS = ['XAUUSD', 'XAGUSD', 'GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM'];
const COMMODITIES = ['WTI', 'BRENT', 'OIL', 'NATGAS', 'COPPER'];
const INDICES = ['US30', 'NAS100', 'SPX500', 'GER40', 'UK100', 'JP225', 'AUS200', 'FRA40', 'HK50', 'DJ30', 'USTEC'];
const CRYPTO = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'LTCUSD', 'DOGEUSD', 'BNBUSD'];

/**
 * Detect the asset class for a given symbol.
 */
export function detectAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase().trim();
  if (FOREX_MAJORS.some((m) => s.includes(m))) return 'FOREX_MAJOR';
  if (METALS.some((m) => s.includes(m))) return 'METALS';
  if (COMMODITIES.some((m) => s.includes(m))) return 'COMMODITIES';
  if (INDICES.some((m) => s.includes(m))) return 'INDICES';
  if (CRYPTO.some((m) => s.includes(m))) return 'CRYPTO';
  if (
    s.length === 6 &&
    (s.endsWith('USD') ||
      s.endsWith('EUR') ||
      s.endsWith('JPY') ||
      s.endsWith('GBP') ||
      s.endsWith('CHF') ||
      s.endsWith('AUD') ||
      s.endsWith('CAD') ||
      s.endsWith('NZD'))
  ) {
    return 'FOREX_MINOR';
  }
  return 'EQUITIES';
}

/**
 * Get the standard digit precision for a symbol.
 */
export function getSymbolDigits(symbol: string, knownDigits?: number): number {
  if (typeof knownDigits === 'number' && knownDigits > 0) return knownDigits;
  const s = symbol.toUpperCase().trim();
  if (s.includes('JPY')) return 3;
  if (s.includes('XAU') || s.includes('GOLD')) return 2;
  if (s.includes('XAG') || s.includes('SILVER')) return 3;
  if (s.includes('BTC') || s.includes('ETH')) return 2;
  if (INDICES.some((idx) => s.includes(idx))) return 1;
  if (s.length === 6) return 5;
  return 4;
}

/**
 * Get standard point value (minimum price change) for a symbol.
 */
export function getSymbolPoint(symbol: string, knownPoint?: number): number {
  if (typeof knownPoint === 'number' && knownPoint > 0) return knownPoint;
  const digits = getSymbolDigits(symbol);
  return Math.pow(10, -digits);
}

/**
 * Get standard contract size for a symbol.
 */
export function getSymbolContractSize(symbol: string, knownContractSize?: number): number {
  if (typeof knownContractSize === 'number' && knownContractSize > 0) return knownContractSize;
  const assetClass = detectAssetClass(symbol);
  switch (assetClass) {
    case 'METALS':
      return symbol.toUpperCase().includes('XAU') ? 100 : 5000;
    case 'COMMODITIES':
      return 1000;
    case 'INDICES':
      return 1;
    case 'CRYPTO':
      return 1;
    case 'FOREX_MAJOR':
    case 'FOREX_MINOR':
    default:
      return 100000;
  }
}

/**
 * Calculate the value of 1 pip (or 10 points) in account currency (USD).
 */
export function calculatePipValue(specs: {
  symbol: string;
  contractSize?: number;
  digits?: number;
  point?: number;
  currentPrice?: number;
  tickValue?: number;
}): number {
  const { symbol, tickValue, currentPrice = 1 } = specs;
  const s = symbol.toUpperCase().trim();

  // If MT5 provided real tickValue from broker, use it
  if (typeof tickValue === 'number' && tickValue > 0) {
    const isJpyOrMetal = s.includes('JPY') || s.includes('XAU');
    return isJpyOrMetal ? tickValue * 10 : tickValue * 10;
  }

  const assetClass = detectAssetClass(s);
  const contractSize = getSymbolContractSize(s, specs.contractSize);

  switch (assetClass) {
    case 'METALS':
      // XAUUSD: 1 pip = 0.10 price move. 0.10 * 100 oz = $10.00
      return s.includes('XAU') ? 10 : 25;

    case 'INDICES':
      // 1 index point = contractSize * $1
      return contractSize;

    case 'CRYPTO':
      // 1.0 point on BTC = $1.00 per coin
      return contractSize;

    case 'FOREX_MAJOR':
    case 'FOREX_MINOR':
    default: {
      if (s.endsWith('USD')) {
        // EURUSD, GBPUSD: 1 pip = 0.0001 * 100000 = $10.00
        return 10;
      } else if (s.startsWith('USD')) {
        // USDJPY, USDCHF, USDCAD: pipValue = (0.0001 or 0.01) * 100000 / price
        const pipUnit = s.includes('JPY') ? 0.01 : 0.0001;
        return currentPrice > 0 ? (pipUnit * contractSize) / currentPrice : 10;
      } else {
        // Cross pairs (e.g. EURGBP): standard approx $10-$13
        return 10;
      }
    }
  }
}

export interface PositionSizeResult {
  symbol: string;
  accountBalance: number;
  riskPercent: number;
  riskAmountUSD: number;
  entryPrice: number;
  stopLossPrice: number;
  stopLossPoints: number;
  contractSize: number;
  pipValueUSD: number;
  recommendedLots: number;
  maxLotsAllowed: number;
  marginRequiredUSD: number;
  lossAtStopUSD: number;
  profitAtTp1USD: number;
  warnings: string[];
}

/**
 * Institutionally accurate risk-based position sizing.
 * Computes exact lot size so that hitting stop loss risks precisely `riskPercent` of account equity.
 */
export function calculatePositionSizeByRisk(params: {
  symbol: string;
  balance: number;
  riskPercent: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  symbolInfo?: Partial<SymbolSpecs>;
  maxAllowedLots?: number;
  leverage?: number;
}): PositionSizeResult {
  const {
    symbol,
    balance,
    riskPercent,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    symbolInfo,
    maxAllowedLots = 50.0,
    leverage = 100,
  } = params;

  const warnings: string[] = [];
  const digits = getSymbolDigits(symbol, symbolInfo?.digits);
  const point = getSymbolPoint(symbol, symbolInfo?.point);
  const contractSize = getSymbolContractSize(symbol, symbolInfo?.contractSize);
  const minLot = symbolInfo?.minLot ?? 0.01;
  const maxLot = Math.min(symbolInfo?.maxLot ?? 100.0, maxAllowedLots);
  const lotStep = symbolInfo?.lotStep ?? 0.01;

  const riskAmountUSD = balance * (Math.max(0.1, riskPercent) / 100);
  const priceDistance = Math.abs(entryPrice - stopLossPrice);
  const stopLossPoints = Math.round(priceDistance / (point > 0 ? point : 0.00001));

  if (priceDistance <= 0 || stopLossPoints <= 0) {
    warnings.push('Stop loss distance is zero or invalid.');
    return {
      symbol,
      accountBalance: balance,
      riskPercent,
      riskAmountUSD: Number(riskAmountUSD.toFixed(2)),
      entryPrice,
      stopLossPrice,
      stopLossPoints: 0,
      contractSize,
      pipValueUSD: 0,
      recommendedLots: minLot,
      maxLotsAllowed: maxLot,
      marginRequiredUSD: 0,
      lossAtStopUSD: 0,
      profitAtTp1USD: 0,
      warnings,
    };
  }

  // Cost per 1.0 lot if price moves the SL distance
  let lossPerLot = 0;
  const assetClass = detectAssetClass(symbol);

  if (symbolInfo?.tickValue && symbolInfo.tickValue > 0 && symbolInfo.tickSize && symbolInfo.tickSize > 0) {
    const ticks = priceDistance / symbolInfo.tickSize;
    lossPerLot = ticks * symbolInfo.tickValue;
  } else if (assetClass === 'METALS') {
    // Gold: priceDistance in $ * 100 oz
    lossPerLot = priceDistance * contractSize;
  } else if (assetClass === 'INDICES' || assetClass === 'CRYPTO') {
    lossPerLot = priceDistance * contractSize;
  } else {
    // Forex
    const pipValue = calculatePipValue({
      symbol,
      contractSize,
      digits,
      point,
      currentPrice: entryPrice,
      tickValue: symbolInfo?.tickValue,
    });
    const pips = priceDistance / (digits === 3 || digits === 5 ? point * 10 : point);
    lossPerLot = pips * pipValue;
  }

  if (lossPerLot <= 0) {
    lossPerLot = priceDistance * contractSize;
  }

  // Raw lots to risk the target USD amount
  const rawLots = riskAmountUSD / lossPerLot;

  // Round according to broker lotStep
  let steppedLots = rawLots;
  if (lotStep > 0) {
    steppedLots = Math.floor(rawLots / lotStep) * lotStep;
  }

  // Clamp within broker limits
  let finalLots = Math.max(minLot, Math.min(maxLot, steppedLots));

  // Determine decimal precision for lot size based on lotStep
  const lotDecimals = lotStep < 0.01 ? 3 : lotStep < 0.1 ? 2 : lotStep < 1 ? 1 : 0;
  finalLots = Number(finalLots.toFixed(lotDecimals));

  // Margin calculation
  const marginRequiredUSD = (finalLots * contractSize * entryPrice) / leverage;
  if (marginRequiredUSD > balance * 0.8) {
    warnings.push(`High margin requirement: $${marginRequiredUSD.toFixed(2)} exceeds 80% of account balance`);
  }

  const lossAtStopUSD = Number((finalLots * lossPerLot).toFixed(2));
  let profitAtTp1USD = 0;
  if (takeProfitPrice && takeProfitPrice > 0) {
    const tpDistance = Math.abs(takeProfitPrice - entryPrice);
    profitAtTp1USD = Number((finalLots * (lossPerLot * (tpDistance / priceDistance))).toFixed(2));
  }

  return {
    symbol,
    accountBalance: balance,
    riskPercent,
    riskAmountUSD: Number(riskAmountUSD.toFixed(2)),
    entryPrice,
    stopLossPrice,
    stopLossPoints,
    contractSize,
    pipValueUSD: Number(calculatePipValue({ symbol, contractSize, digits, point, currentPrice: entryPrice }).toFixed(2)),
    recommendedLots: finalLots,
    maxLotsAllowed: maxLot,
    marginRequiredUSD: Number(marginRequiredUSD.toFixed(2)),
    lossAtStopUSD,
    profitAtTp1USD,
    warnings,
  };
}

/**
 * Validate and automatically adjust SL & TP prices to respect broker stopsLevel & freezeLevel.
 * Prevents MT5 error 10016 (TRADE_RETCODE_INVALID_STOPS).
 */
export function validateAndAdjustStops(params: {
  symbol: string;
  orderType: 'BUY' | 'SELL';
  entryPrice: number;
  sl?: number;
  tp?: number;
  symbolInfo?: Partial<SymbolSpecs>;
}): { sl: number; tp: number; adjusted: boolean; reason?: string } {
  const { symbol, orderType, entryPrice, sl, tp, symbolInfo } = params;
  const digits = getSymbolDigits(symbol, symbolInfo?.digits);
  const point = getSymbolPoint(symbol, symbolInfo?.point);
  const stopsLevelPoints = Math.max(symbolInfo?.stopsLevel ?? 20, 15);
  const minDistance = stopsLevelPoints * point;

  let adjustedSl = sl ?? 0;
  let adjustedTp = tp ?? 0;
  let adjusted = false;
  let reason = '';

  if (orderType === 'BUY') {
    if (adjustedSl > 0 && entryPrice - adjustedSl < minDistance) {
      adjustedSl = entryPrice - minDistance * 1.5;
      adjusted = true;
      reason = `SL widened to respect MT5 stopsLevel (${stopsLevelPoints} pts)`;
    }
    if (adjustedTp > 0 && adjustedTp - entryPrice < minDistance) {
      adjustedTp = entryPrice + minDistance * 1.5;
      adjusted = true;
      reason = `TP widened to respect MT5 stopsLevel (${stopsLevelPoints} pts)`;
    }
  } else if (orderType === 'SELL') {
    if (adjustedSl > 0 && adjustedSl - entryPrice < minDistance) {
      adjustedSl = entryPrice + minDistance * 1.5;
      adjusted = true;
      reason = `SL widened to respect MT5 stopsLevel (${stopsLevelPoints} pts)`;
    }
    if (adjustedTp > 0 && entryPrice - adjustedTp < minDistance) {
      adjustedTp = entryPrice - minDistance * 1.5;
      adjusted = true;
      reason = `TP widened to respect MT5 stopsLevel (${stopsLevelPoints} pts)`;
    }
  }

  return {
    sl: adjustedSl > 0 ? Number(adjustedSl.toFixed(digits)) : 0,
    tp: adjustedTp > 0 ? Number(adjustedTp.toFixed(digits)) : 0,
    adjusted,
    reason,
  };
}
