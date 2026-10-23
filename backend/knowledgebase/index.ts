/**
 * KnowledgeBase Master Module
 * Clean, decoupled architecture:
 * - core/: auto-detect symbol intelligence, common statistics, strategy engine & backtesting
 * - indicators/: momentum, trend, volatility, volume calculations
 * - patterns/: candlestick, indicator, and chart shape detectors
 * - strategies/: built-in templates and adaptive rule models
 * - news/: live online market news, macroeconomic calendar events, and symbol impact analyzer
 * - knowledge.ts & observations.ts: market telemetry, speed metrics, pattern tagger
 */

export * from './core/index.js';
export * from './indicators/index.js';
export * from './patterns/index.js';
export * from './strategies/index.js';
export * from './news/index.js';
export * from './signals/signalWatcher.js';
export * from './knowledge.js';
export * from './observations.js';

