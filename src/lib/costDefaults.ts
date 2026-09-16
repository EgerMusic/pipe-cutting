import type { CostRates } from './costTypes'

/** Ставка НДС для итогов сметы. */
export const VAT_PERCENT = 22

/** Заглушки — замените на ваши номиналы. Сохраняются в браузере после правки. */
export const PLACEHOLDER_COST_RATES: CostRates = {
  pipePricePerTon: 78_000,
  wallThicknessMm: 8,
  steelDensityKgM3: 7850,

  consumptionKgPerM2: 0.28,
  enamelPricePerKg: 520,

  paintersCount: 3,
  painterSalaryMonthly: 85_000,

  operatorsCount: 2,
  setupWorkersCount: 1,
  operatorSalaryMonthly: 85_000,
  setupWorkerSalaryMonthly: 140_000,
  productivityPiecesPerShift: 20,
  shiftsPerMonth: 22,

  overheadPercent: 8,
}

export const COST_RATES_STORAGE_KEY = 'pipe-cutting-cost-rates'
