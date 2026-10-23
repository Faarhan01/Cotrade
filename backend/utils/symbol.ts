/**
 * Canonical symbol handling.
 *
 * The database stores symbols in upper case so that a single value matches
 * regardless of whether the caller used `EURUSD`, `eurusd` or `EurUsd`. Mixed
 * case rows are a classic source of "the chart is empty" bugs, because the
 * writer and the reader disagree about the key.
 */

/** Normalise a symbol to its canonical upper-case form. */
export function normalizeSymbol(symbol: string | null | undefined): string {
  if (!symbol) return '';
  return String(symbol).trim().toUpperCase();
}
