/**
 * Canonical timeframe vocabulary.
 *
 * The MT5 Expert Advisor reports the *enum name* of the chart period
 * (`EnumToString((ENUM_TIMEFRAMES)Period())` -> `"PERIOD_H1"`), while the
 * rest of the application (REST API, MCP tools, web UI, knowledge base)
 * speaks the short TradingView-style code (`"H1"`).
 *
 * Because the two vocabularies never matched, every candle the EA uploaded
 * was invisible to every read path: `dbGetCandles('EURUSD', 'H1')` looked for
 * `timeframe = 'H1'` and never found the `PERIOD_H1` rows the EA had written.
 * The database therefore filled up with real market data that the indicator
 * engine, pattern scanner, backtester and auto-detect profile all pretended
 * did not exist.
 *
 * Everything now funnels through `normalizeTimeframe()` so a timeframe is
 * stored and queried in exactly one canonical form.
 */

/** Every timeframe the application supports, in MT5 enum order. */
export const APP_TIMEFRAMES = [
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'M6',
  'M10',
  'M12',
  'M15',
  'M20',
  'M30',
  'H1',
  'H2',
  'H3',
  'H4',
  'H6',
  'H8',
  'H12',
  'D1',
  'W1',
  'MN1',
] as const;

export type AppTimeframe = (typeof APP_TIMEFRAMES)[number];

const MT5_PREFIX = 'PERIOD_';

/**
 * Extra spellings that appear in the wild and map onto a canonical code.
 * Keys are already upper-cased and stripped of the `PERIOD_` prefix.
 */
const ALIASES: Record<string, AppTimeframe> = {
  M1: 'M1',
  MIN1: 'M1',
  '1M': 'M1',
  '1MIN': 'M1',
  '1MINUTE': 'M1',
  M5: 'M5',
  MIN5: 'M5',
  '5M': 'M5',
  '5MIN': 'M5',
  '5MINUTE': 'M5',
  M15: 'M15',
  MIN15: 'M15',
  '15M': 'M15',
  '15MIN': 'M15',
  H1: 'H1',
  HOUR1: 'H1',
  '1H': 'H1',
  '60M': 'H1',
  '60MIN': 'H1',
  H4: 'H4',
  HOUR4: 'H4',
  '4H': 'H4',
  '240M': 'H4',
  D1: 'D1',
  DAY1: 'D1',
  '1D': 'D1',
  '1440M': 'D1',
  W1: 'W1',
  WEEK1: 'W1',
  '1W': 'W1',
  MN1: 'MN1',
  MONTH1: 'MN1',
  '1MN': 'MN1',
};

/**
 * Convert any known timeframe spelling into the canonical application code.
 * Unknown values are returned upper-cased and stripped of the `PERIOD_`
 * prefix so that a future MT5 period still round-trips consistently.
 */
export function normalizeTimeframe(timeframe: string | null | undefined): string {
  if (timeframe === null || timeframe === undefined) return '';

  let tf = String(timeframe).trim().toUpperCase();
  if (!tf) return '';

  if (tf.startsWith(MT5_PREFIX)) {
    tf = tf.slice(MT5_PREFIX.length);
  }

  const alias = ALIASES[tf];
  if (alias) return alias;

  // `M5` -> `5M` style reversals are already handled by the alias table; the
  // generic fallback keeps the value usable even if MT5 adds a new period.
  return tf;
}

/**
 * All stored spellings that may represent the given timeframe.
 *
 * Used on the read path so that rows written by an older build (which used
 * the raw `PERIOD_` enum name) are still found.
 */
export function timeframeCandidates(timeframe: string | null | undefined): string[] {
  const canonical = normalizeTimeframe(timeframe);
  if (!canonical) return [];

  const candidates = new Set<string>([canonical]);
  candidates.add(`${MT5_PREFIX}${canonical}`);
  // Legacy rows may also have been stored lower-cased.
  candidates.add(canonical.toLowerCase());
  candidates.add(`${MT5_PREFIX}${canonical}`.toLowerCase());
  return [...candidates];
}

/** True when the value is a timeframe the application knows how to handle. */
export function isKnownTimeframe(timeframe: string | null | undefined): boolean {
  const tf = normalizeTimeframe(timeframe);
  return (APP_TIMEFRAMES as readonly string[]).includes(tf);
}

/**
 * Convert an MT5 period string into the matching app code, or `null` when the
 * value cannot be interpreted.
 */
export function mt5PeriodToAppTimeframe(period: string | null | undefined): AppTimeframe | null {
  const tf = normalizeTimeframe(period);
  return (APP_TIMEFRAMES as readonly string[]).includes(tf) ? (tf as AppTimeframe) : null;
}
