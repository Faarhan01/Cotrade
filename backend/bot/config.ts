import { BotConfig, DEFAULT_BOT_CONFIG } from './types.js';
import { dbGetRiskSettings } from '../database/db.js';

// In-memory config store with DB persistence
let currentConfig: BotConfig = { ...DEFAULT_BOT_CONFIG };

export function getBotConfig(): BotConfig {
  return { ...currentConfig };
}

export function setBotConfig(updates: Partial<BotConfig>): BotConfig {
  currentConfig = { ...currentConfig, ...updates };
  return { ...currentConfig };
}

export function resetBotConfig(): BotConfig {
  currentConfig = { ...DEFAULT_BOT_CONFIG };
  return { ...currentConfig };
}

export async function loadBotConfigFromDb(): Promise<BotConfig> {
  try {
    // Load from risk settings as a base, then override with bot-specific settings
    const risk = await dbGetRiskSettings();
    if (risk) {
      currentConfig.maxOpenPositions = risk.maxOpenPositions || currentConfig.maxOpenPositions;
      currentConfig.riskPercent = risk.maxDrawdownPercent > 0 ? Math.min(risk.maxDrawdownPercent, 5) : currentConfig.riskPercent;
    }
  } catch (err) {
    console.warn('[Bot] Failed to load config from DB:', err);
  }
  return { ...currentConfig };
}

export function validateBotConfig(config: Partial<BotConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.mode !== undefined) {
    const validModes = ['SCALPER', 'DAY_TRADES', 'SWING_TRADES', 'MIXED_OPTIONS'];
    if (!validModes.includes(config.mode)) {
      errors.push(`mode must be one of: ${validModes.join(', ')}`);
    }
  }
  if (config.minConfidence !== undefined && (config.minConfidence < 0 || config.minConfidence > 100)) {
    errors.push('minConfidence must be between 0 and 100');
  }
  if (config.riskPercent !== undefined && (config.riskPercent <= 0 || config.riskPercent > 10)) {
    errors.push('riskPercent must be between 0 and 10');
  }
  if (config.maxOpenPositions !== undefined && (config.maxOpenPositions < 1 || config.maxOpenPositions > 20)) {
    errors.push('maxOpenPositions must be between 1 and 20');
  }
  if (config.cooldownMs !== undefined && config.cooldownMs < 0) {
    errors.push('cooldownMs must be non-negative');
  }
  if (config.maxSpreadPoints !== undefined && config.maxSpreadPoints < 0) {
    errors.push('maxSpreadPoints must be non-negative');
  }
  if (config.symbols !== undefined && (!Array.isArray(config.symbols) || config.symbols.length === 0)) {
    errors.push('symbols must be a non-empty array');
  }

  return { valid: errors.length === 0, errors };
}
