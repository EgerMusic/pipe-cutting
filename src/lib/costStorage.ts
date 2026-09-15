import { COST_RATES_STORAGE_KEY, PLACEHOLDER_COST_RATES } from './costDefaults'
import type { CostRates } from './costTypes'

export function loadCostRates(): CostRates {
  try {
    const raw = localStorage.getItem(COST_RATES_STORAGE_KEY)
    if (!raw) return { ...PLACEHOLDER_COST_RATES }
    return { ...PLACEHOLDER_COST_RATES, ...JSON.parse(raw) }
  } catch {
    return { ...PLACEHOLDER_COST_RATES }
  }
}

export function saveCostRates(rates: CostRates): void {
  localStorage.setItem(COST_RATES_STORAGE_KEY, JSON.stringify(rates))
}
