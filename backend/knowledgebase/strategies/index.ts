import { StrategyDefinition } from '../core/strategyEngine.js';
import { emaCrossoverStrategyTemplate } from './trend/emaCrossover.js';
import { meanReversionStrategyTemplate } from './reversion/meanReversion.js';
import { breakoutStrategyTemplate } from './breakout/donchianBreakout.js';
import { aiAdaptiveStrategyTemplate } from './adaptive/aiAdaptive.js';

export const BUILT_IN_STRATEGY_TEMPLATES: StrategyDefinition[] = [
  emaCrossoverStrategyTemplate,
  meanReversionStrategyTemplate,
  breakoutStrategyTemplate,
  aiAdaptiveStrategyTemplate,
];

export function getStrategyTemplateById(id: string): StrategyDefinition | undefined {
  return BUILT_IN_STRATEGY_TEMPLATES.find((s) => s.id === id);
}

export {
  emaCrossoverStrategyTemplate,
  meanReversionStrategyTemplate,
  breakoutStrategyTemplate,
  aiAdaptiveStrategyTemplate,
};
