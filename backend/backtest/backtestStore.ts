/**
 * In-Memory & Persistent Storage for Isolated Backtests (/backtest)
 *
 * Keeps historical backtests separated from live orders, positions, and live account state.
 */

import { BacktestExecutionResult } from './types.js';

class BacktestStore {
  private results: Map<string, BacktestExecutionResult> = new Map();

  public save(result: BacktestExecutionResult): void {
    this.results.set(result.id, result);
    // Keep max 50 recent backtests in memory
    if (this.results.size > 50) {
      const oldestKey = this.results.keys().next().value;
      if (oldestKey) this.results.delete(oldestKey);
    }
  }

  public get(id: string): BacktestExecutionResult | undefined {
    return this.results.get(id);
  }

  public getAll(limit = 20): BacktestExecutionResult[] {
    return Array.from(this.results.values())
      .sort((a, b) => b.evaluatedAt - a.evaluatedAt)
      .slice(0, limit);
  }

  public delete(id: string): boolean {
    return this.results.delete(id);
  }

  public clear(): void {
    this.results.clear();
  }
}

export const backtestStore = new BacktestStore();
