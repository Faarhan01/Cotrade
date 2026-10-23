/**
 * Canonical indicator engine entry point.
 *
 * The single source of truth for technical indicator computation lives in
 * `backend/knowledgebase/indicators/`. This module is kept as a stable import
 * path for the live runtime (trade store, REST routes, MCP tools) but it no
 * longer carries its own duplicated SMA/EMA/RSI/MACD/Bollinger/ATR maths.
 *
 * Previously this file had a private copy of every indicator, which drifted
 * from the knowledge base copy (different Bollinger standard deviation, no
 * stochastic / volume profile, different STRONG_BUY threshold). Every caller
 * now receives identical numbers.
 */
export {
  calculateIndicators,
  computeRSI,
  computeRSISeries,
  computeMACD,
  computeStochastic,
  computeEMA,
  computeEMASeries,
  computeSMA,
  computeSMASeries,
  computeATR,
  computeBollinger,
  computeVolumeProfile,
} from '../knowledgebase/indicators/index.js';

export type {
  MACDResult,
  StochasticResult,
  BollingerResult,
  VolumeProfileResult,
  ComprehensiveIndicatorsResult,
} from '../knowledgebase/indicators/index.js';
