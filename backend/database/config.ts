import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Clean Database Configuration & Path Isolation
 *
 * All SQLite database storage is encapsulated within /backend/database/data/
 * instead of the root directory. Prevents polluting the project root,
 * avoids accidental deletions or permissions conflicts, and ensures atomic
 * transactions with backup integrity.
 */
export const DB_DIR = path.resolve(__dirname, 'data');
export const DB_FILE_PATH = path.resolve(DB_DIR, 'market_data.sqlite');
export const DB_BACKUP_PATH = path.resolve(DB_DIR, 'market_data.backup.sqlite');
export const DB_TEMP_PATH = path.resolve(DB_DIR, 'market_data.sqlite.tmp');

// Legacy root directory path (for automatic safe migration)
export const LEGACY_ROOT_DIR = path.resolve(process.cwd(), 'data');
export const LEGACY_ROOT_FILE = path.resolve(LEGACY_ROOT_DIR, 'market_data.sqlite');

export const ALLOWED_TABLES = [
  'orders',
  'positions_history',
  'account_history',
  'candles_history',
  'ticks_history',
  'audit_logs',
  'risk_settings',
  'strategies',
  'observations',
  'backtest_results',
  'knowledge_telemetry',
  'knowledge_news_cache',
  'economic_calendar_events',
  'symbol_regimes',
  'symbol_auto_detect_profiles',
  'bot_trades',
  'bot_signals',
  'rapid_shocks_history',
  'chart_diagnostics_history',
  'knowledge_symbol_intelligence',
  'knowledge_telemetry_aggregate',
  'bot_settings',
] as const;

export type AllowedTableName = (typeof ALLOWED_TABLES)[number];
