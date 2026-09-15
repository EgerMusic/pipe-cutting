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
  if (input.sourceMode === 'fromCutting') {
    return input.positions.filter((p) => p.paintLengthMm > 0 && p.quantity > 0)
  }
  return input.positions.filter((p) => p.paintLengthMm > 0 && p.quantity > 0)
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

function metalMassForInput(
  input: CostInput,
  plan: CuttingPlan | null | undefined,
): { massKg: number; tubeCount: number; stockLengthMm: number } {
  const stockLengthMm = input.metalStockLengthMm
  const tubeCount =
    input.sourceMode === 'simple'
      ? input.simple.quantity
      : plan
        ? plan.barsCount
        : input.metalTubeCount

  if (!input.metalEnabled || tubeCount <= 0 || stockLengthMm <= 0) {
    return { massKg: 0, tubeCount: 0, stockLengthMm }
  }

  const lengthM = stockLengthMm * MM_TO_M
  const oneKg = pipeMassKg(
    input.pipeDiameterMm,
    input.rates.wallThicknessMm,
    lengthM,
    input.rates.steelDensityKgM3,
  )
  return { massKg: oneKg * tubeCount, tubeCount, stockLengthMm }
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

  const { massKg: metalMassKg, tubeCount, stockLengthMm } = metalMassForInput(input, plan)
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
      detail: `${tubeCount} труб × ${stockLengthMm} мм · ${metalMassTon.toFixed(3)} т`,
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
  if (input.pipeDiameterMm <= 0) throw new Error('Укажите диаметр трубы')
  if (input.rates.wallThicknessMm <= 0) throw new Error('Укажите толщину стенки')
  if (input.rates.referenceDftUm <= 0) throw new Error('Эталонная толщина слоя должна быть > 0')

  if (input.sourceMode === 'simple') {
    if (input.simple.quantity <= 0) throw new Error('Укажите количество труб')
    if (input.simple.lengthMm <= 0) throw new Error('Укажите длину трубы')
  }

  if (input.sourceMode === 'positions') {
    const painted = input.positions.some((p) => p.paintLengthMm > 0 && p.quantity > 0)
    if (!painted) throw new Error('Укажите позиции с длиной окраски > 0')
    if (input.positions.some((p) => p.paintLengthMm > 0 && p.pipeDiameterMm <= 0)) {
      throw new Error('Укажите диаметр у каждой окрашиваемой позиции')
    }
  }

  if (input.sourceMode === 'fromCutting') {
    if (!plan) throw new Error('Сначала рассчитайте раскрой на вкладке «Раскрой»')
    const painted = input.positions.some((p) => p.paintLengthMm > 0 && p.quantity > 0)
    if (!painted) {
      throw new Error('Нажмите «Обновить из раскроя» и укажите длину окраски')
    }
    if (input.positions.some((p) => p.paintLengthMm > 0 && p.pipeDiameterMm <= 0)) {
      throw new Error('Укажите диаметр у каждой окрашиваемой позиции')
    }
  }

  if (input.metalEnabled && input.sourceMode !== 'fromCutting' && input.sourceMode !== 'simple') {
    if (input.metalTubeCount <= 0) throw new Error('Укажите число труб для металла')
    if (input.metalStockLengthMm <= 0) throw new Error('Укажите длину трубы для металла')
  }
}
