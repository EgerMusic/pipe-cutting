import type { CostRates } from './costTypes'

/** Заглушки — замените на ваши номиналы. Сохраняются в браузере после правки. */
export const PLACEHOLDER_COST_RATES: CostRates = {
  pipePricePerTon: 78_000,
  wallThicknessMm: 8,
  steelDensityKgM3: 7850,

  consumptionKgPerM2AtRef: 0.28,
  referenceDftUm: 120,
  targetDftUm: 120,
  enamelPricePerKg: 520,
  paintWastePercent: 25,

  workers: 3,
  productivityM2PerPersonHour: 8,
  laborRatePerHour: 450,

  overheadPercent: 8,
  cutLaborHours: 0,
  cutLaborRatePerHour: 500,
}

export const COST_RATES_STORAGE_KEY = 'pipe-cutting-cost-rates'
