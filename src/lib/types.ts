export type PieceDemand = {
  id: string
  name: string
  length: number
  quantity: number
  /** Whether this pile position needs connecting plates. */
  needsPlates: boolean
}

export type PlatesConfig = {
  enabled: boolean
  /** Length of pipe ring along the axis, mm (e.g. 400). */
  segmentLength: number
  /** Plate width along the circumference, mm (e.g. 80). */
  plateWidth: number
  /** Gap between plates on the circumference, mm (e.g. 20). */
  gap: number
  /** How many plates one pile needs (e.g. 4–6). */
  platesPerPile: number
}

export type JobInput = {
  /** Pipe outer diameter for the whole job, mm (e.g. 325). */
  pipeDiameter: number
  stockLength: number
  kerf: number
  /** Always leave at least this much unused on every stock bar (mm). */
  minRemnant: number
  coneLength: number
  nestedConeLength: number
  useConeNesting: boolean
  plates: PlatesConfig
  pieces: PieceDemand[]
}

export type PieceRole = 'pile' | 'plate'

export type CutBlock = {
  kind: 'single' | 'pair'
  role: PieceRole
  lengths: number[]
  consumed: number
  label: string
}

export type StockBar = {
  index: number
  blocks: CutBlock[]
  used: number
  remnant: number
}

/** Identical cutting layouts grouped for display/PDF. */
export type PatternGroup = {
  signature: string
  count: number
  blocks: CutBlock[]
  used: number
  remnant: number
}

export type PlatesSummary = {
  platesPerSegment: number
  totalPiles: number
  totalPlates: number
  segmentsNeeded: number
  segmentLength: number
}

export type CuttingPlan = {
  mode: 'economical'
  title: string
  description: string
  bars: StockBar[]
  patterns: PatternGroup[]
  barsCount: number
  totalDemandMm: number
  totalStockMm: number
  totalUsedMm: number
  wasteMm: number
  wastePercent: number
  remnants: number[]
  pairCount: number
  singleCount: number
  plates: PlatesSummary | null
  warnings: string[]
}

export function pairConsumed(
  lengthA: number,
  lengthB: number,
  coneLength: number,
  nestedConeLength: number,
): number {
  return lengthA + lengthB - 2 * coneLength + nestedConeLength
}

export function nestingSavings(coneLength: number, nestedConeLength: number): number {
  return 2 * coneLength - nestedConeLength
}

/** Usable length on a bar: stock minus mandatory remnant. */
export function barCapacity(input: Pick<JobInput, 'stockLength' | 'minRemnant'>): number {
  return input.stockLength - input.minRemnant
}

/**
 * Kerf only between blocks on the same bar:
 * used = sum(block lengths) + kerf × (blockCount − 1)
 */
export function usedOnBar(blocks: CutBlock[], kerf: number): number {
  if (blocks.length === 0) return 0
  const body = blocks.reduce((sum, block) => sum + block.consumed, 0)
  return body + kerf * Math.max(0, blocks.length - 1)
}

export function blockSignature(block: CutBlock): string {
  const lengths = [...block.lengths].sort((a, b) => b - a).join('+')
  return `${block.kind}:${block.role}:${lengths}:${block.consumed}`
}

function canonicalizeBlocks(blocks: CutBlock[]): CutBlock[] {
  return [...blocks].sort((a, b) => {
    if (b.consumed !== a.consumed) return b.consumed - a.consumed
    return blockSignature(a).localeCompare(blockSignature(b))
  })
}

/** Same pieces on a bar count as one scheme, regardless of cut order. */
export function barSignature(bar: Pick<StockBar, 'blocks'>): string {
  return canonicalizeBlocks(bar.blocks).map(blockSignature).join('|')
}

export function groupBarsIntoPatterns(bars: StockBar[]): PatternGroup[] {
  const map = new Map<string, PatternGroup>()
  for (const bar of bars) {
    const signature = barSignature(bar)
    const existing = map.get(signature)
    if (existing) {
      existing.count += 1
    } else {
      map.set(signature, {
        signature,
        count: 1,
        blocks: canonicalizeBlocks(bar.blocks),
        used: bar.used,
        remnant: bar.remnant,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.used - a.used)
}

/** Plates from one ring: floor(π × D / (width + gap)), rounded down. */
export function platesPerSegment(
  plates: Pick<PlatesConfig, 'plateWidth' | 'gap'>,
  pipeDiameter: number,
): number {
  if (plates.plateWidth <= 0 || pipeDiameter <= 0) return 0
  const step = plates.plateWidth + Math.max(0, plates.gap)
  if (step <= 0) return 0
  return Math.floor((Math.PI * pipeDiameter) / step)
}

export function summarizePlates(input: JobInput): PlatesSummary | null {
  if (!input.plates.enabled) return null
  const perSegment = platesPerSegment(input.plates, input.pipeDiameter)
  const totalPiles = input.pieces
    .filter((piece) => piece.needsPlates)
    .reduce((sum, piece) => sum + piece.quantity, 0)
  const totalPlates = totalPiles * input.plates.platesPerPile
  const segmentsNeeded =
    perSegment > 0 && totalPlates > 0 ? Math.ceil(totalPlates / perSegment) : 0

  return {
    platesPerSegment: perSegment,
    totalPiles,
    totalPlates,
    segmentsNeeded,
    segmentLength: input.plates.segmentLength,
  }
}
