/**
 * Canonical strategy backtester entry point.
 *
 * The implementation lives in `backend/knowledgebase/core/strategyEngine.ts`
 * next to the strategy templates that consume its types. This module is kept
 * as a stable import path for the live runtime (REST routes, MCP tools).
 *
 * Previously this file held a near-identical copy of the backtester that had
 * already drifted from the knowledge base version (different warm-up window,
 * inverted Bollinger breakout signal, broken EMA crossover test). Both copies
 * are now gone - there is exactly one implementation.
 */
export {
  runStrategyBacktest,
  runKnowledgeEnhancedBacktest,
} from '../knowledgebase/core/strategyEngine.js';

export type {
  StrategyType,
  StrategyParameters,
  StrategyDefinition,
  Observation,
  SimulatedTrade,
  BacktestResult,
  KnowledgeBacktestOptions,
} from '../knowledgebase/core/strategyEngine.js';

