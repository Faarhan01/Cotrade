import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database } from 'sql.js';
import {
  DB_DIR,
  DB_FILE_PATH,
  DB_BACKUP_PATH,
  DB_TEMP_PATH,
  LEGACY_ROOT_DIR,
  LEGACY_ROOT_FILE,
} from './config.js';
import { initSchema, migrateSchema } from './schema.js';

let dbInstance: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;
let isPersisting = false;
let persistTimeout: NodeJS.Timeout | null = null;

/**
 * Open or retrieve the persistent SQLite database.
 * Strictly maintains data inside /backend/database/data/market_data.sqlite.
 */
export function getDatabase(): Promise<Database> {
  if (!dbInitPromise) {
    dbInitPromise = openDatabase().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

/**
 * Safely migrate legacy root /data folder into /backend/database/data/
 */
function handleLegacyDataMigration(): void {
  try {
    // Ensure destination directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    // Create helpful README in data directory
    const readmePath = path.resolve(DB_DIR, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        `# MetaTrader 5 Bridge Database Storage\n\nThis directory holds the persistent SQLite database and backups for the AI Trading Terminal.\n\n- \`market_data.sqlite\`: Active persistent database\n- \`market_data.backup.sqlite\`: Integrity backup\n`
      );
    }

    // Clean up any stale temp files from previous abnormal exits
    if (fs.existsSync(DB_TEMP_PATH)) {
      try {
        fs.unlinkSync(DB_TEMP_PATH);
        console.log('[DB] Cleaned up stale temporary file');
      } catch {}
    }

    // If destination database doesn't exist but legacy root database exists
    if (!fs.existsSync(DB_FILE_PATH) && fs.existsSync(LEGACY_ROOT_FILE)) {
      const legacyBuf = fs.readFileSync(LEGACY_ROOT_FILE);
      if (legacyBuf.length > 0) {
        fs.writeFileSync(DB_FILE_PATH, legacyBuf);
        console.log(`[DB] Successfully migrated legacy database from ${LEGACY_ROOT_FILE} to ${DB_FILE_PATH} (${legacyBuf.length} bytes)`);
      }
    }

    // Clean up legacy root /data directory and files so root stays pristine
    if (fs.existsSync(LEGACY_ROOT_FILE)) {
      try {
        fs.unlinkSync(LEGACY_ROOT_FILE);
        console.log('[DB] Removed legacy root database file');
      } catch {}
    }
    if (fs.existsSync(LEGACY_ROOT_DIR)) {
      try {
        const remaining = fs.readdirSync(LEGACY_ROOT_DIR);
        if (remaining.length === 0) {
          fs.rmdirSync(LEGACY_ROOT_DIR);
          console.log('[DB] Cleaned up legacy root /data directory');
        }
      } catch {}
    }
  } catch (err: any) {
    console.warn('[DB] Legacy migration check notice:', err?.message || err);
  }
}

async function openDatabase(): Promise<Database> {
  handleLegacyDataMigration();

  const SQL = await initSqlJs();
  let db: Database;

  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const fileBuffer = fs.readFileSync(DB_FILE_PATH);
      if (fileBuffer.length > 0) {
        db = new SQL.Database(fileBuffer);

        // Verify file integrity
        try {
          const check = db.exec('PRAGMA integrity_check;');
          const status = check[0]?.values[0][0];
          if (status === 'ok') {
            console.log(`[DB] Loaded persistent SQLite database from ${DB_FILE_PATH} (${fileBuffer.length} bytes) - Integrity OK`);
          } else {
            console.warn(`[DB] Warning: SQLite integrity check reported: ${status}`);
          }
        } catch (checkErr: any) {
          console.warn('[DB] Integrity check warning:', checkErr?.message);
        }
      } else {
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }
  } catch (err: any) {
    console.warn(`[DB] Notice loading ${DB_FILE_PATH}, creating fresh database:`, err?.message || err);
    // If backup exists, try recovering from backup
    if (fs.existsSync(DB_BACKUP_PATH)) {
      try {
        const backupBuf = fs.readFileSync(DB_BACKUP_PATH);
        if (backupBuf.length > 0) {
          db = new SQL.Database(backupBuf);
          console.log('[DB] Recovered database from backup:', DB_BACKUP_PATH);
        } else {
          db = new SQL.Database();
        }
      } catch {
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }
  }

  dbInstance = db;
  initSchema(db);
  migrateSchema(db);

  // Initial persist to create clean files
  persistDatabase(false);
  return db;
}

/**
 * Safely writes database export to disk with atomic tmp file and backup
 */
export function saveDbToDisk(): void {
  if (!dbInstance || isPersisting) return;
  isPersisting = true;

  try {
    const data = dbInstance.export();
    if (!data || data.length === 0) {
      console.warn('[DB] Export data is empty, skipping disk save');
      return;
    }

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    // Write to temporary file first
    fs.writeFileSync(DB_TEMP_PATH, Buffer.from(data));

    // Verify temp file size
    const stat = fs.statSync(DB_TEMP_PATH);
    if (stat.size === 0) {
      throw new Error('Temporary database file was written with 0 bytes');
    }

    // If destination already exists, update backup
    if (fs.existsSync(DB_FILE_PATH)) {
      try {
        fs.copyFileSync(DB_FILE_PATH, DB_BACKUP_PATH);
      } catch {}
    }

    // Atomic replace
    try {
      fs.renameSync(DB_TEMP_PATH, DB_FILE_PATH);
    } catch (renameErr: any) {
      // Fallback copy if rename fails across partitions or due to lock
      fs.copyFileSync(DB_TEMP_PATH, DB_FILE_PATH);
      try { fs.unlinkSync(DB_TEMP_PATH); } catch {}
    }
  } catch (err: any) {
    console.error('[DB] Failed to save SQLite database to disk:', err?.message || err);
  } finally {
    isPersisting = false;
  }
}

/**
 * Persist SQLite database to disk.
 * Debounced to 1.5 seconds for high performance without disk thrashing.
 */
export function persistDatabase(immediate = false): void {
  if (!dbInstance) return;
  if (immediate) {
    if (persistTimeout) {
      clearTimeout(persistTimeout);
      persistTimeout = null;
    }
    saveDbToDisk();
    return;
  }
  if (persistTimeout) return;
  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    saveDbToDisk();
  }, 1500);
}

export function flushDatabase(): void {
  persistDatabase(true);
}

// Clean process exit handlers to flush database
if (typeof process !== 'undefined') {
  process.on('SIGINT', () => {
    try { flushDatabase(); } catch {}
  });
  process.on('SIGTERM', () => {
    try { flushDatabase(); } catch {}
  });
  process.on('beforeExit', () => {
    try { flushDatabase(); } catch {}
  });
}
