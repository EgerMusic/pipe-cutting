export type PaintSourceMode = 'simple' | 'positions' | 'fromCutting'

export type CostPosition = {
  id: string
  name: string
  pipeDiameterMm: number
  /** Длина изделия, мм (для справки / металла по позициям). */
  lengthMm: number
  quantity: number
  /** Наружная окраска, мм. 0 — не красить. */
  paintLengthMm: number
}

export type CostRates = {
  pipePricePerTon: number
  wallThicknessMm: number
  steelDensityKgM3: number

  /** Расход краски, кг/м² (без привязки к толщине — позже из справочника). */
  consumptionKgPerM2: number
  enamelPricePerKg: number

  paintersCount: number
  /** Оклад маляра, ₽/мес. */
  painterSalaryMonthly: number

  operatorsCount: number
  setupWorkersCount: number
  /** Оклад оператора, ₽/мес. */
  operatorSalaryMonthly: number
  /** Оклад наладчика, ₽/мес. */
  setupWorkerSalaryMonthly: number
  /** Выработка, шт/смену (труб). */
  productivityPiecesPerShift: number
  /** Рабочих смен в месяце (для перевода оклада в ₽/смену). */
  shiftsPerMonth: number

  /** % от металл + материал краски (сварка, расходники). */
  overheadPercent: number
}

export type CostSimpleInput = {
  quantity: number
  lengthMm: number
  paintLengthMm: number
}

export type CostInput = {
  pipeDiameterMm: number
  sourceMode: PaintSourceMode
  rates: CostRates
  simple: CostSimpleInput
  /** Ручной ввод на вкладке «По позициям». */
  manualPositions: CostPosition[]
  /** Позиции из раскроя на вкладке «Из раскроя». */
  cuttingPositions: CostPosition[]
  metalEnabled: boolean
  /** Число труб 12 м для металла (простой режим или вручную). */
  metalTubeCount: number
  /** Длина одной трубы для металла, мм. */
  metalStockLengthMm: number
}

export type CostLine = {
  label: string
  detail: string
  rub: number
}

export type CostEstimate = {
  paintAreaM2: number
  paintKg: number
  paintMaterialRub: number
  paintLaborRub: number
  metalMassKg: number
  metalMassTon: number
  metalRub: number
  operatorLaborRub: number
  setupLaborRub: number
  productionLaborRub: number
  pieceCount: number
  shiftsRequired: number
  overheadRub: number
  /** Сумма без НДС. */
  totalRub: number
  vatRub: number
  totalRubWithVat: number
  vatPercent: number
  lines: CostLine[]
}
