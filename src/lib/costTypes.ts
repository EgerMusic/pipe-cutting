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

  consumptionKgPerM2AtRef: number
  referenceDftUm: number
  targetDftUm: number
  enamelPricePerKg: number
  paintWastePercent: number

  workers: number
  productivityM2PerPersonHour: number
  laborRatePerHour: number

  /** % от металл + материал краски (рез, сварка, расходники). */
  overheadPercent: number
  cutLaborHours: number
  cutLaborRatePerHour: number
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
  positions: CostPosition[]
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
  paintLaborHours: number
  paintLaborRub: number
  metalMassKg: number
  metalMassTon: number
  metalRub: number
  overheadRub: number
  cutLaborRub: number
  totalRub: number
  lines: CostLine[]
}
