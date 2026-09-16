import { COST_RATES_STORAGE_KEY, PLACEHOLDER_COST_RATES } from './costDefaults'
import type { CostRates } from './costTypes'

export function loadCostRates(): CostRates {
  try {
    const raw = localStorage.getItem(COST_RATES_STORAGE_KEY)
    if (!raw) return { ...PLACEHOLDER_COST_RATES }
    const stored = JSON.parse(raw) as Partial<CostRates> & {
      workers?: number
      consumptionKgPerM2AtRef?: number
    }
    if (stored.workers != null && stored.paintersCount == null) {
      stored.paintersCount = stored.workers
    }
    if (stored.consumptionKgPerM2AtRef != null && stored.consumptionKgPerM2 == null) {
      stored.consumptionKgPerM2 = stored.consumptionKgPerM2AtRef
    }
    return { ...PLACEHOLDER_COST_RATES, ...stored }
  } catch {
    return { ...PLACEHOLDER_COST_RATES }
  }
}

export function saveCostRates(rates: CostRates): void {
  localStorage.setItem(COST_RATES_STORAGE_KEY, JSON.stringify(rates))
}
