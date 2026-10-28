import { Database } from 'sql.js';

/**
 * Execute a query and return rows as key-value objects.
 * Prevents memory leaks by ensuring statements are cleanly freed.
 */
export function selectRows(db: Database, query: string, params: any[] = []): any[] {
  try {
    const stmt = db.prepare(query);
    stmt.bind(params);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (err: any) {
    console.error(`[DB Query Error] Query: "${query.slice(0, 80)}..." Params:`, params, err?.message || err);
    return [];
  }
}

/**
 * Bounds pagination limit to reasonable ranges, preventing memory exhaustion.
 */
export function safeLimit(val: any, fallback = 100, max = 1000): number {
  const n = parseInt(String(val), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/**
 * Safely parse offset for pagination.
 */
export function safeOffset(val: any, fallback = 0): number {
  const n = parseInt(String(val), 10);
  if (isNaN(n) || n < 0) return fallback;
  return n;
}
