/**
 * Database Entry Point (Legacy Re-export Wrapper)
 *
 * All database operations are cleanly modularized across:
 * - /backend/database/config.ts (Path isolation to /backend/database/data/)
 * - /backend/database/schema.ts (Tables, DDL, Indices, Vocab Migrations)
 * - /backend/database/connection.ts (SQL.js Lifecycle, Atomic Exports, Disk Sync)
 * - /backend/database/helpers.ts (Row deserialization, Pagination Bounds)
 * - /backend/database/maintenance.ts (Pruning, VACUUM, Analytics, Explorer)
 * - /backend/database/repositories/marketDataRepository.ts (Candles, Ticks, Diagnostics)
 * - /backend/database/repositories/tradesRepository.ts (Orders, Deals, Risk, Account)
 * - /backend/database/repositories/botRepository.ts (Bot Signals & Trades)
 * - /backend/database/repositories/knowledgeRepository.ts (Strategies, Backtests, Shocks, Intelligence)
 */

export * from './index.js';
