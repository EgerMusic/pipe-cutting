import {
  type CutBlock,
  type CuttingPlan,
  type JobInput,
  type StockBar,
  barCapacity,
  groupBarsIntoPatterns,
  nestingSavings,
  pairConsumed,
  usedOnBar,
} from './types'

type BlockChoice = {
  block: CutBlock
  lengths: number[]
}

function expandPieces(pieces: JobInput['pieces']): number[] {
  const lengths: number[] = []
  for (const piece of pieces) {
    for (let i = 0; i < piece.quantity; i += 1) {
      lengths.push(piece.length)
    }
  }
  return lengths
}

function formatMm(value: number): string {
  return `${value}`
}

function makeSingle(length: number): CutBlock {
  return {
    kind: 'single',
    lengths: [length],
    consumed: length,
    label: `${formatMm(length)}`,
  }
}

function makePair(
  lengthA: number,
  lengthB: number,
  coneLength: number,
  nestedConeLength: number,
): CutBlock {
  const consumed = pairConsumed(lengthA, lengthB, coneLength, nestedConeLength)
  const same = lengthA === lengthB
  return {
    kind: 'pair',
    lengths: [lengthA, lengthB],
    consumed,
    label: same
      ? `${formatMm(lengthA)}+${formatMm(lengthB)} (конус в конусе)`
      : `${formatMm(lengthA)}+${formatMm(lengthB)} (конус в конусе, разные)`,
  }
}

/** Block fits into usable capacity including its own kerf cut. */
function blockFits(consumed: number, input: JobInput): boolean {
  return consumed + input.kerf <= barCapacity(input)
}

function pairFitsOnStock(lengthA: number, lengthB: number, input: JobInput): boolean {
  const consumed = pairConsumed(
    lengthA,
    lengthB,
    input.coneLength,
    input.nestedConeLength,
  )
  return blockFits(consumed, input)
}

function assertPieceFitsStock(length: number, input: JobInput) {
  if (!blockFits(length, input)) {
    throw new Error(
      `Длина ${length} мм + пропил ${input.kerf} мм не влезает в полезную длину ${barCapacity(input)} мм (заготовка ${input.stockLength} − мин. остаток ${input.minRemnant})`,
    )
  }
}

/** How much length is still free for the next block body (kerf for that block already reserved). */
function availableForNextBlock(blocks: CutBlock[], input: JobInput): number {
  const capacity = barCapacity(input)
  const used = usedOnBar(blocks, input.kerf)
  // Next block needs: consumed + kerf
  return capacity - used - input.kerf
}

function removeOne(pool: number[], length: number): boolean {
  const index = pool.indexOf(length)
  if (index < 0) return false
  pool.splice(index, 1)
  return true
}

function countOf(pool: number[], length: number): number {
  return pool.reduce((n, value) => n + (value === length ? 1 : 0), 0)
}

function pickBestChoice(
  pool: number[],
  input: JobInput,
  maxConsumed: number,
): BlockChoice | null {
  if (maxConsumed <= 0 || pool.length === 0) return null

  const scored: Array<BlockChoice & { score: number }> = []

  const consider = (choice: BlockChoice) => {
    if (choice.block.consumed > maxConsumed) return
    if (!blockFits(choice.block.consumed, input)) return
    const score =
      choice.lengths.length * 100_000 -
      choice.block.consumed +
      (choice.block.kind === 'pair' ? 10 : 0)
    scored.push({ ...choice, score })
  }

  const unique = [...new Set(pool)].sort((a, b) => b - a)

  for (const length of unique) {
    consider({ block: makeSingle(length), lengths: [length] })
  }

  if (input.useConeNesting) {
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i; j < unique.length; j += 1) {
        const a = unique[i]
        const b = unique[j]
        const needA = a === b ? 2 : 1
        const needB = a === b ? 0 : 1
        if (countOf(pool, a) < needA) continue
        if (needB > 0 && countOf(pool, b) < needB) continue
        if (!pairFitsOnStock(a, b, input)) continue
        consider({
          block: makePair(a, b, input.coneLength, input.nestedConeLength),
          lengths: [a, b],
        })
      }
    }
  }

  if (scored.length === 0) return null
  scored.sort((a, b) => b.score - a.score)
  return { block: scored[0].block, lengths: scored[0].lengths }
}

function applyChoice(pool: number[], choice: BlockChoice) {
  for (const length of choice.lengths) {
    if (!removeOne(pool, length)) {
      throw new Error(`Внутренняя ошибка раскроя: нет длины ${length}`)
    }
  }
}

function fillBarFromPool(
  pool: number[],
  input: JobInput,
  firstChoice: BlockChoice,
): CutBlock[] {
  const localPool = [...pool]
  applyChoice(localPool, firstChoice)
  const blocks = [firstChoice.block]

  while (true) {
    const space = availableForNextBlock(blocks, input)
    const next = pickBestChoice(localPool, input, space)
    if (!next) break
    applyChoice(localPool, next)
    blocks.push(next.block)
  }

  return blocks
}

function finalizeBar(blocks: CutBlock[], input: JobInput, index: number): StockBar {
  const used = usedOnBar(blocks, input.kerf)
  return {
    index,
    blocks,
    used,
    remnant: input.stockLength - used,
  }
}

function packEconomicalDense(poolInput: number[], input: JobInput) {
  const pool = [...poolInput]
  const bars: StockBar[] = []
  const allBlocks: CutBlock[] = []

  while (pool.length > 0) {
    pool.sort((a, b) => b - a)
    const largest = pool[0]

    const firstCandidates: BlockChoice[] = [
      { block: makeSingle(largest), lengths: [largest] },
    ]

    if (input.useConeNesting) {
      for (const other of [...new Set(pool)]) {
        const needLargest = other === largest ? 2 : 1
        const needOther = other === largest ? 0 : 1
        if (countOf(pool, largest) < needLargest) continue
        if (needOther > 0 && countOf(pool, other) < needOther) continue
        if (!pairFitsOnStock(largest, other, input)) continue
        firstCandidates.push({
          block: makePair(largest, other, input.coneLength, input.nestedConeLength),
          lengths: [largest, other],
        })
      }
    }

    let bestBlocks: CutBlock[] | null = null
    let bestScore = -1

    for (const first of firstCandidates) {
      if (!blockFits(first.block.consumed, input)) continue
      const blocks = fillBarFromPool(pool, input, first)
      const used = usedOnBar(blocks, input.kerf)
      if (used > barCapacity(input)) continue
      const pairs = blocks.filter((block) => block.kind === 'pair').length
      const pieces = blocks.reduce((n, block) => n + block.lengths.length, 0)
      const score = pieces * 1_000_000 + pairs * 1_000 - used
      if (score > bestScore) {
        bestScore = score
        bestBlocks = blocks
      }
    }

    if (!bestBlocks || bestBlocks.length === 0) {
      throw new Error('Не удалось разложить изделия на заготовки')
    }

    for (const block of bestBlocks) {
      for (const length of block.lengths) {
        removeOne(pool, length)
      }
      allBlocks.push(block)
    }

    bars.push(finalizeBar(bestBlocks, input, bars.length + 1))
  }

  return { bars, blocks: allBlocks }
}

function buildPlan(
  bars: StockBar[],
  input: JobInput,
  blocks: CutBlock[],
  warnings: string[] = [],
): CuttingPlan {
  const totalDemandMm = expandPieces(input.pieces).reduce((s, n) => s + n, 0)
  const totalUsedMm = bars.reduce((s, bar) => s + bar.used, 0)
  const totalStockMm = bars.length * input.stockLength
  const wasteMm = totalStockMm - totalUsedMm
  const wastePercent = totalStockMm === 0 ? 0 : (wasteMm / totalStockMm) * 100
  const pairCount = blocks.filter((b) => b.kind === 'pair').length
  const singleCount = blocks.filter((b) => b.kind === 'single').length
  const patterns = groupBarsIntoPatterns(bars)

  return {
    mode: 'economical',
    title: 'Раскрой труб',
    description:
      'Экономичная раскладка: «конус в конусе», докладка в остаток, учёт пропила и минимального хвоста.',
    bars,
    patterns,
    barsCount: bars.length,
    totalDemandMm,
    totalStockMm,
    totalUsedMm,
    wasteMm,
    wastePercent,
    remnants: bars.map((bar) => bar.remnant).filter((r) => r > 0),
    pairCount,
    singleCount,
    warnings,
  }
}

function validateInput(input: JobInput): string[] {
  const warnings: string[] = []
  if (input.stockLength <= 0) throw new Error('Длина заготовки должна быть > 0')
  if (input.kerf < 0) throw new Error('Пропил не может быть отрицательным')
  if (input.minRemnant < 0) throw new Error('Мин. остаток не может быть отрицательным')
  if (input.minRemnant >= input.stockLength) {
    throw new Error('Мин. остаток должен быть меньше длины заготовки')
  }
  if (input.pieces.length === 0) throw new Error('Добавьте хотя бы одну позицию')
  if (input.pieces.some((p) => p.length <= 0 || p.quantity <= 0)) {
    throw new Error('Длина и количество должны быть > 0')
  }

  warnings.push(
    `Пропил ${input.kerf} мм на каждый блок реза. Мин. остаток на трубе: ${input.minRemnant} мм (полезная длина ${barCapacity(input)} мм).`,
  )

  if (input.useConeNesting) {
    if (input.coneLength <= 0 || input.nestedConeLength <= 0) {
      throw new Error('Укажите длину конуса и длину «конус в конусе»')
    }
    if (input.nestedConeLength >= 2 * input.coneLength) {
      warnings.push(
        '«Конус в конусе» не короче двух конусов — экономии от вложения не будет.',
      )
    }
    for (const piece of input.pieces) {
      if (piece.length < input.coneLength) {
        throw new Error(
          `Длина ${piece.length} мм меньше длины конуса ${input.coneLength} мм`,
        )
      }
    }
    const savings = nestingSavings(input.coneLength, input.nestedConeLength)
    if (savings > 0) {
      warnings.push(`Экономия на одной паре «конус в конусе»: ${savings} мм`)
    }
  }

  return warnings
}

export function planEconomical(input: JobInput): CuttingPlan {
  const warnings = validateInput(input)
  const allLengths = expandPieces(input.pieces)
  for (const length of allLengths) {
    assertPieceFitsStock(length, input)
  }

  const { bars, blocks } = packEconomicalDense(allLengths, input)

  return buildPlan(bars, input, blocks, warnings)
}

export function calculatePlan(input: JobInput): CuttingPlan {
  return planEconomical(input)
}
