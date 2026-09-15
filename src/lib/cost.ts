import type { CostEstimate, CostInput, CostLine, CostPosition, CostRates } from './costTypes'
import type { CuttingPlan, JobInput } from './types'
import { pieceDiameter } from './types'

const MM_TO_M = 1 / 1000

/** Масса цилиндрической трубы, кг. D и t — мм, L — м. */
export function pipeMassKg(
  diameterMm: number,
  wallMm: number,
  lengthM: number,
  densityKgM3: number,
): number {
  if (diameterMm <= 0 || wallMm <= 0 || lengthM <= 0) return 0
  const d = diameterMm * MM_TO_M
  const t = wallMm * MM_TO_M
  if (t >= d / 2) return 0
  return Math.PI * (d - t) * t * lengthM * densityKgM3
}

/** Наружная площадь, м². */
export function exteriorAreaM2(diameterMm: number, paintLengthMm: number, quantity: number): number {
  if (diameterMm <= 0 || paintLengthMm <= 0 || quantity <= 0) return 0
  const d = diameterMm * MM_TO_M
  const l = paintLengthMm * MM_TO_M
  return Math.PI * d * l * quantity
}

export function paintPositionsFromJob(job: JobInput, defaultPaintLengthMm?: number): CostPosition[] {
  return job.pieces.map((piece) => ({
    id: piece.id,
    name: piece.name,
    pipeDiameterMm: pieceDiameter(piece, job),
    lengthMm: piece.length,
    quantity: piece.quantity,
    paintLengthMm: defaultPaintLengthMm ?? piece.length,
  }))
}

function activePositions(input: CostInput): CostPosition[] {
  if (input.sourceMode === 'positions') return input.manualPositions
  if (input.sourceMode === 'fromCutting') return input.cuttingPositions
  return []
}

function paintPositionsForInput(input: CostInput): CostPosition[] {
  if (input.sourceMode === 'simple') {
    const paintLen = input.simple.paintLengthMm || input.simple.lengthMm
    if (input.simple.quantity <= 0 || paintLen <= 0) return []
    return [
      {
        id: 'simple',
        name: 'Трубы',
        pipeDiameterMm: input.pipeDiameterMm,
        lengthMm: input.simple.lengthMm,
        quantity: input.simple.quantity,
        paintLengthMm: paintLen,
      },
    ]
  }
  return activePositions(input).filter((p) => p.paintLengthMm > 0 && p.quantity > 0)
}

function totalPaintAreaM2(positions: CostPosition[]): number {
  return positions.reduce(
    (sum, p) => sum + exteriorAreaM2(p.pipeDiameterMm, p.paintLengthMm, p.quantity),
    0,
  )
}

function paintConsumptionKgPerM2(rates: CostRates): number {
  if (rates.referenceDftUm <= 0) return 0
  const scale = rates.targetDftUm / rates.referenceDftUm
  return rates.consumptionKgPerM2AtRef * scale * (1 + rates.paintWastePercent / 100)
}

type MetalSummary = {
  massKg: number
  tubeCount: number
  stockLengthMm: number
  detail: string
}

/** Доли заготовок по Ø для режимов с общим числом труб (простой / из раскроя). */
function metalDiameterWeights(input: CostInput): Map<number, number> {
  const weights = new Map<number, number>()
  const add = (diameterMm: number, weight: number) => {
    if (diameterMm <= 0 || weight <= 0) return
    weights.set(diameterMm, (weights.get(diameterMm) ?? 0) + weight)
  }

  if (input.sourceMode === 'simple') {
    add(input.pipeDiameterMm, 1)
    return weights
  }

  for (const position of activePositions(input)) {
    if (position.quantity <= 0) continue
    const weight = position.quantity * (position.lengthMm > 0 ? position.lengthMm : 1)
    add(position.pipeDiameterMm, weight)
  }
  return weights
}

function metalMassForInput(
  input: CostInput,
  plan: CuttingPlan | null | undefined,
): MetalSummary {
  if (!input.metalEnabled) {
    return { massKg: 0, tubeCount: 0, stockLengthMm: 0, detail: '' }
  }

  if (input.sourceMode === 'positions') {
    let massKg = 0
    let pieceCount = 0
    for (const position of input.manualPositions) {
      if (position.quantity <= 0 || position.lengthMm <= 0 || position.pipeDiameterMm <= 0) {
        continue
      }
      const lengthM = position.lengthMm * position.quantity * MM_TO_M
      massKg += pipeMassKg(
        position.pipeDiameterMm,
        input.rates.wallThicknessMm,
        lengthM,
        input.rates.steelDensityKgM3,
      )
      pieceCount += position.quantity
    }
    const massTon = massKg / 1000
    return {
      massKg,
      tubeCount: pieceCount,
      stockLengthMm: 0,
      detail: pieceCount > 0 ? `${pieceCount} шт · ${massTon.toFixed(3)} т` : '',
    }
  }

  const stockLengthMm =
    input.sourceMode === 'simple' ? input.simple.lengthMm : input.metalStockLengthMm
  const tubeCount =
    input.sourceMode === 'simple' ? input.simple.quantity : (plan?.barsCount ?? 0)

  if (tubeCount <= 0 || stockLengthMm <= 0) {
    return { massKg: 0, tubeCount: 0, stockLengthMm: 0, detail: '' }
  }

  const weights = metalDiameterWeights(input)
  let totalWeight = 0
  for (const weight of weights.values()) totalWeight += weight
  if (totalWeight <= 0) {
    return { massKg: 0, tubeCount: 0, stockLengthMm: 0, detail: '' }
  }

  const lengthM = stockLengthMm * MM_TO_M
  let massKg = 0
  for (const [diameterMm, weight] of weights) {
    const oneKg = pipeMassKg(
      diameterMm,
      input.rates.wallThicknessMm,
      lengthM,
      input.rates.steelDensityKgM3,
    )
    massKg += oneKg * tubeCount * (weight / totalWeight)
  }
  const massTon = massKg / 1000
  return {
    massKg,
    tubeCount,
    stockLengthMm,
    detail: `${tubeCount} труб × ${stockLengthMm} мм · ${massTon.toFixed(3)} т`,
  }
}

export function calculateCost(
  input: CostInput,
  plan?: CuttingPlan | null,
): CostEstimate {
  const positions = paintPositionsForInput(input)
  const paintAreaM2 = totalPaintAreaM2(positions)
  const kgPerM2 = paintConsumptionKgPerM2(input.rates)
  const paintKg = paintAreaM2 * kgPerM2
  const paintMaterialRub = paintKg * input.rates.enamelPricePerKg

  const { workers, productivityM2PerPersonHour, laborRatePerHour } = input.rates
  const paintLaborHours =
    workers > 0 && productivityM2PerPersonHour > 0
      ? paintAreaM2 / (workers * productivityM2PerPersonHour)
      : 0
  const paintLaborRub = paintLaborHours * workers * laborRatePerHour

  const metal = metalMassForInput(input, plan)
  const metalMassKg = metal.massKg
  const metalMassTon = metalMassKg / 1000
  const metalRub = metalMassTon * input.rates.pipePricePerTon

  const cutLaborRub = input.rates.cutLaborHours * input.rates.cutLaborRatePerHour

  const overheadBase = metalRub + paintMaterialRub
  const overheadRub = overheadBase * (input.rates.overheadPercent / 100)

  const totalRub = metalRub + paintMaterialRub + paintLaborRub + cutLaborRub + overheadRub

  const lines: CostLine[] = []

  if (input.metalEnabled && metalRub > 0) {
    lines.push({
      label: 'Металл',
      detail: metal.detail,
      rub: metalRub,
    })
  }

  if (paintMaterialRub > 0 || paintAreaM2 > 0) {
    lines.push({
      label: 'Эмаль',
      detail: `${paintAreaM2.toFixed(1)} м² · ${paintKg.toFixed(1)} кг`,
      rub: paintMaterialRub,
    })
    lines.push({
      label: 'Покраска, работа',
      detail: `${workers} чел. · ${paintLaborHours.toFixed(1)} ч`,
      rub: paintLaborRub,
    })
  }

  if (cutLaborRub > 0) {
    lines.push({
      label: 'Резка, работа',
      detail: `${input.rates.cutLaborHours} ч × ${input.rates.cutLaborRatePerHour} ₽/ч`,
      rub: cutLaborRub,
    })
  }

  if (overheadRub > 0) {
    lines.push({
      label: 'Накладные (рез, сварка, расходники)',
      detail: `${input.rates.overheadPercent}% от металл + эмаль`,
      rub: overheadRub,
    })
  }

  return {
    paintAreaM2,
    paintKg,
    paintMaterialRub,
    paintLaborHours,
    paintLaborRub,
    metalMassKg,
    metalMassTon,
    metalRub,
    overheadRub,
    cutLaborRub,
    totalRub,
    lines,
  }
}

export function validateCostInput(input: CostInput, plan?: CuttingPlan | null): void {
  if (input.rates.wallThicknessMm <= 0) throw new Error('Укажите толщину стенки')
  if (input.rates.referenceDftUm <= 0) throw new Error('Эталонная толщина слоя должна быть > 0')

  if (input.sourceMode === 'simple') {
    if (input.pipeDiameterMm <= 0) throw new Error('Укажите диаметр трубы')
    if (input.simple.quantity <= 0) throw new Error('Укажите количество труб')
    if (input.simple.lengthMm <= 0) throw new Error('Укажите длину трубы')
  }

  if (input.sourceMode === 'positions') {
    const painted = input.manualPositions.some((p) => p.paintLengthMm > 0 && p.quantity > 0)
    if (!painted) throw new Error('Укажите позиции с длиной окраски > 0')
    if (input.manualPositions.some((p) => p.paintLengthMm > 0 && p.pipeDiameterMm <= 0)) {
      throw new Error('Укажите диаметр у каждой окрашиваемой позиции')
    }
  }

  if (input.sourceMode === 'fromCutting') {
    if (!plan) throw new Error('Сначала рассчитайте раскрой на вкладке «Раскрой»')
    const painted = input.cuttingPositions.some((p) => p.paintLengthMm > 0 && p.quantity > 0)
    if (!painted) {
      throw new Error('Нажмите «Обновить из раскроя» и укажите длину окраски')
    }
    if (input.cuttingPositions.some((p) => p.paintLengthMm > 0 && p.pipeDiameterMm <= 0)) {
      throw new Error('Укажите диаметр у каждой окрашиваемой позиции')
    }
  }

  if (input.metalEnabled && input.sourceMode === 'positions') {
    const withMetal = input.manualPositions.some(
      (p) => p.quantity > 0 && p.lengthMm > 0 && p.pipeDiameterMm > 0,
    )
    if (!withMetal) {
      throw new Error('Укажите позиции с Ø, длиной и количеством для расчёта металла')
    }
  }

  if (input.metalEnabled && input.sourceMode === 'fromCutting') {
    if (input.cuttingPositions.some((p) => p.quantity > 0 && p.pipeDiameterMm <= 0)) {
      throw new Error('Укажите диаметр у каждой позиции для расчёта металла')
    }
  }
}
