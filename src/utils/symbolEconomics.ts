/**
 * Symbol Economics & Market Specification Engine (Client)
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
  | 'SYNTHETIC'
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
  tradeMode?: string;
  spreadFloat?: boolean;
  fillingMode?: number;
  marginMaintenance?: number;
  marginInitial?: number;
  marginHedged?: number;
  tradeCalcMode?: number;
  bookDepth?: boolean;
  currencyBase?: string;
  currencyProfit?: string;
  currencyMargin?: string;
  tradeAllowed?: boolean;
}

const FOREX_MAJORS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'];
const METALS = ['XAUUSD', 'XAGUSD', 'GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM'];
const COMMODITIES = ['WTI', 'BRENT', 'OIL', 'NATGAS', 'COPPER'];
const INDICES = ['US30', 'NAS100', 'SPX500', 'GER40', 'UK100', 'JP225', 'AUS200', 'FRA40', 'HK50', 'DJ30', 'USTEC'];
const CRYPTO = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'LTCUSD', 'DOGEUSD', 'BNBUSD'];
const SYNTHETICS = ['STEP', 'VOLATILITY', 'CRASH', 'BOOM', 'JUMP', 'RANGE BREAK', 'RANGEBREAK', 'DEX', 'DRIFT'];

export function isMacroNewsDriven(symbol: string): boolean {
  const s = (symbol || '').toUpperCase().trim();
  const clean = s.replace(/[^A-Z0-9]/g, '');
  if (
    SYNTHETICS.some((syn) => s.includes(syn) || clean.includes(syn.replace(/\s+/g, ''))) ||
    clean.startsWith('V10') ||
    clean.startsWith('V25') ||
    clean.startsWith('V50') ||
    clean.startsWith('V75') ||
    clean.startsWith('V100')
  ) {
    return false;
  }
  return true;
}

export function detectAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase().trim();
  const clean = s.replace(/[^A-Z0-9]/g, '');
  if (
    SYNTHETICS.some((syn) => s.includes(syn) || clean.includes(syn.replace(/\s+/g, ''))) ||
    clean.startsWith('V10') ||
    clean.startsWith('V25') ||
    clean.startsWith('V50') ||
    clean.startsWith('V75') ||
    clean.startsWith('V100')
  ) {
    return 'SYNTHETIC';
  }
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

export function getSymbolPoint(symbol: string, knownPoint?: number): number {
  if (typeof knownPoint === 'number' && knownPoint > 0) return knownPoint;
  const digits = getSymbolDigits(symbol);
  return Math.pow(10, -digits);
}

export function getSymbolContractSize(symbol: string, knownContractSize?: number): number {
  if (typeof knownContractSize === 'number' && knownContractSize > 0) return knownContractSize;
  const assetClass = detectAssetClass(symbol);
  switch (assetClass) {
    case 'SYNTHETIC':
      return 1;
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

export function calculatePipValue(specs: {
  symbol: string;
  contractSize?: number;
  digits?: number;
  point?: number;
  currentPrice?: number;
  tickValue?: number;
  tickSize?: number;
}): number {
  const { symbol, tickValue, tickSize, currentPrice = 1 } = specs;
  const s = symbol.toUpperCase().trim();

  // If MT5 provided real tickValue from broker, compute exact pip value
  if (typeof tickValue === 'number' && tickValue > 0) {
    const digits = getSymbolDigits(s, specs.digits);
    const point = getSymbolPoint(s, specs.point);
    const effTickSize = typeof tickSize === 'number' && tickSize > 0 ? tickSize : point;
    const pipDistance = digits === 3 || digits === 5 ? 10 * point : point;
    return Number(((pipDistance / effTickSize) * tickValue).toFixed(4));
  }

  const assetClass = detectAssetClass(s);
  const contractSize = getSymbolContractSize(s, specs.contractSize);

  switch (assetClass) {
    case 'METALS':
      return s.includes('XAU') ? 10 : 25;
    case 'INDICES':
    case 'CRYPTO':
      return contractSize;
    case 'FOREX_MAJOR':
    case 'FOREX_MINOR':
    default: {
      if (s.endsWith('USD')) {
        return 10;
      } else if (s.startsWith('USD')) {
        const pipUnit = s.includes('JPY') ? 0.01 : 0.0001;
        return currentPrice > 0 ? (pipUnit * contractSize) / currentPrice : 10;
      } else {
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

  let lossPerLot = 0;
  const assetClass = detectAssetClass(symbol);

  if (symbolInfo?.tickValue && symbolInfo.tickValue > 0 && symbolInfo.tickSize && symbolInfo.tickSize > 0) {
    const ticks = priceDistance / symbolInfo.tickSize;
    lossPerLot = ticks * symbolInfo.tickValue;
  } else if (assetClass === 'METALS' || assetClass === 'INDICES' || assetClass === 'CRYPTO') {
    lossPerLot = priceDistance * contractSize;
  } else {
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

  const rawLots = riskAmountUSD / lossPerLot;
  let steppedLots = rawLots;
  if (lotStep > 0) {
    steppedLots = Math.floor(rawLots / lotStep) * lotStep;
  }

  let finalLots = Math.max(minLot, Math.min(maxLot, steppedLots));
  const lotDecimals = lotStep < 0.01 ? 3 : lotStep < 0.1 ? 2 : lotStep < 1 ? 1 : 0;
  finalLots = Number(finalLots.toFixed(lotDecimals));

  // Margin calculation: use broker marginInitial if provided, otherwise compute standard leveraged margin
  const marginRequiredUSD =
    symbolInfo?.marginInitial && symbolInfo.marginInitial > 0
      ? Number((finalLots * symbolInfo.marginInitial).toFixed(2))
      : Number(((finalLots * contractSize * entryPrice) / leverage).toFixed(2));

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
    pipValueUSD: Number(calculatePipValue({ symbol, contractSize, digits, point, currentPrice: entryPrice, tickValue: symbolInfo?.tickValue, tickSize: symbolInfo?.tickSize }).toFixed(2)),
    recommendedLots: finalLots,
    maxLotsAllowed: maxLot,
    marginRequiredUSD,
    lossAtStopUSD,
    profitAtTp1USD,
    warnings,
  };
}

export function calculatePipDistance(symbol: string, price1: number, price2: number, digitsParam?: number): number {
  const digits = getSymbolDigits(symbol, digitsParam);
  const point = getSymbolPoint(symbol, digitsParam ? Math.pow(10, -digitsParam) : undefined);
  const pipUnit = digits === 3 || digits === 5 ? 10 * point : point;
  if (pipUnit <= 0) return 0;
  return Number((Math.abs(price1 - price2) / pipUnit).toFixed(1));
}

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

