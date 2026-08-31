export type PieceDemand = {
  id: string
  name: string
  length: number
  quantity: number
}

export type JobInput = {
  stockLength: number
  kerf: number
  /** Always leave at least this much unused on every stock bar (mm). */
  minRemnant: number
  coneLength: number
  nestedConeLength: number
  useConeNesting: boolean
  pieces: PieceDemand[]
}

export type CutBlock = {
  kind: 'single' | 'pair'
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
 * Each block needs its own cut → kerf is added once per block.
 * used = sum(block lengths) + kerf * blockCount
 */
export function usedOnBar(blocks: CutBlock[], kerf: number): number {
  if (blocks.length === 0) return 0
  const body = blocks.reduce((sum, block) => sum + block.consumed, 0)
  return body + kerf * blocks.length
}

export function blockSignature(block: CutBlock): string {
  const lengths = [...block.lengths].sort((a, b) => b - a).join('+')
  return `${block.kind}:${lengths}:${block.consumed}`
}

export function barSignature(bar: Pick<StockBar, 'blocks'>): string {
  return bar.blocks.map(blockSignature).join('|')
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
        blocks: bar.blocks,
        used: bar.used,
        remnant: bar.remnant,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.used - a.used)
}
