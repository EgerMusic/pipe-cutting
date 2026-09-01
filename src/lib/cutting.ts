import {
  type CutBlock,
  type CuttingPlan,
  type JobInput,
  type PieceRole,
  type StockBar,
  barCapacity,
  groupBarsIntoPatterns,
  nestingSavings,
  pairConsumed,
  summarizePlates,
  usedOnBar,
} from './types'

type WorkPiece = {
  id: string
  length: number
  role: PieceRole
}

type BlockChoice = {
  block: CutBlock
  pieces: WorkPiece[]
}

let pieceSeq = 0

function nextId(prefix: string): string {
  pieceSeq += 1
  return `${prefix}-${pieceSeq}`
}

function expandWorkPieces(input: JobInput): WorkPiece[] {
  pieceSeq = 0
  const pieces: WorkPiece[] = []

  for (const piece of input.pieces) {
    for (let i = 0; i < piece.quantity; i += 1) {
      pieces.push({
        id: nextId('pile'),
        length: piece.length,
        role: 'pile',
      })
    }
  }

  const plates = summarizePlates(input)
  if (plates && plates.segmentsNeeded > 0) {
    for (let i = 0; i < plates.segmentsNeeded; i += 1) {
      pieces.push({
        id: nextId('plate'),
        length: plates.segmentLength,
        role: 'plate',
      })
    }
  }

  return pieces
}

function formatMm(value: number): string {
  return `${value}`
}

function makeSingle(piece: WorkPiece): CutBlock {
  return {
    kind: 'single',
    role: piece.role,
    lengths: [piece.length],
    consumed: piece.length,
    label: `${formatMm(piece.length)}`,
  }
}

function makePair(
  pieceA: WorkPiece,
  pieceB: WorkPiece,
  coneLength: number,
  nestedConeLength: number,
): CutBlock {
  const consumed = pairConsumed(
    pieceA.length,
    pieceB.length,
    coneLength,
    nestedConeLength,
  )
  const lengths = [pieceA.length, pieceB.length].sort((a, b) => b - a)
  return {
    kind: 'pair',
    role: 'pile',
    lengths,
    consumed,
    label: `${formatMm(lengths[0])}+${formatMm(lengths[1])}`,
  }
}

function makePairFromLengths(
  lengthA: number,
  lengthB: number,
  input: JobInput,
): CutBlock {
  const consumed = pairConsumed(
    lengthA,
    lengthB,
    input.coneLength,
    input.nestedConeLength,
  )
  const lengths = [lengthA, lengthB].sort((a, b) => b - a)
  return {
    kind: 'pair',
    role: 'pile',
    lengths,
    consumed,
    label: `${formatMm(lengths[0])}+${formatMm(lengths[1])}`,
  }
}

function pairSavingsOnBar(lengthA: number, lengthB: number, input: JobInput): number {
  return (
    lengthA +
    lengthB -
    pairConsumed(lengthA, lengthB, input.coneLength, input.nestedConeLength)
  )
}

/** After layout: merge single piles on one bar into «конус в конусе» pairs. */
function mergePairsOnBar(blocks: CutBlock[], input: JobInput): CutBlock[] {
  if (!input.useConeNesting) return blocks

  let result = [...blocks]
  let changed = true

  while (changed) {
    changed = false
    const singles: Array<{ block: CutBlock; index: number }> = []
    for (let i = 0; i < result.length; i += 1) {
      const block = result[i]
      if (block.kind === 'single' && block.role === 'pile') {
        singles.push({ block, index: i })
      }
    }

    let best: { i: number; j: number; savings: number } | null = null
    for (let a = 0; a < singles.length; a += 1) {
      for (let b = a + 1; b < singles.length; b += 1) {
        const lenA = singles[a].block.lengths[0]
        const lenB = singles[b].block.lengths[0]
        if (!pairFitsOnStock(lenA, lenB, input)) continue
        const savings = pairSavingsOnBar(lenA, lenB, input)
        if (!best || savings > best.savings) {
          best = { i: singles[a].index, j: singles[b].index, savings }
        }
      }
    }

    if (!best) continue

    const lenA = result[best.i].lengths[0]
    const lenB = result[best.j].lengths[0]
    const pair = makePairFromLengths(lenA, lenB, input)
    const drop = [best.i, best.j].sort((x, y) => y - x)
    result.splice(drop[0], 1)
    result.splice(drop[1], 1)
    result.splice(Math.min(best.i, best.j), 0, pair)
    changed = true
  }

  return result
}

/** One block alone on a bar — no kerf yet (kerf only between blocks). */
function blockFitsAlone(consumed: number, input: JobInput): boolean {
  return consumed <= barCapacity(input)
}

function pairFitsOnStock(lengthA: number, lengthB: number, input: JobInput): boolean {
  const consumed = pairConsumed(
    lengthA,
    lengthB,
    input.coneLength,
    input.nestedConeLength,
  )
  return blockFitsAlone(consumed, input)
}

function assertPieceFitsStock(length: number, input: JobInput) {
  if (!blockFitsAlone(length, input)) {
    throw new Error(
      `Длина ${length} мм не влезает в полезную длину ${barCapacity(input)} мм (заготовка ${input.stockLength} − мин. остаток ${input.minRemnant})`,
    )
  }
}

/**
 * Free length for the next block body.
 * If the bar already has blocks, reserve one kerf before the next piece.
 */
function availableForNextBlock(blocks: CutBlock[], input: JobInput): number {
  const capacity = barCapacity(input)
  if (blocks.length === 0) return capacity
  const used = usedOnBar(blocks, input.kerf)
  return capacity - used - input.kerf
}

function removeByIds(pool: WorkPiece[], ids: string[]) {
  for (const id of ids) {
    const index = pool.findIndex((piece) => piece.id === id)
    if (index < 0) {
      throw new Error(`Внутренняя ошибка раскроя: нет изделия ${id}`)
    }
    pool.splice(index, 1)
  }
}

function choiceFits(choice: BlockChoice, input: JobInput, maxConsumed: number): boolean {
  return choice.block.consumed <= maxConsumed && blockFitsAlone(choice.block.consumed, input)
}

function representativesByLength(pool: WorkPiece[], role?: PieceRole): WorkPiece[] {
  const map = new Map<number, WorkPiece>()
  for (const piece of pool) {
    if (role && piece.role !== role) continue
    if (!map.has(piece.length)) map.set(piece.length, piece)
  }
  return [...map.values()].sort((a, b) => b.length - a.length)
}

/** Distinct block types that still fit — one variant per length/role, not per piece copy. */
function listFitChoices(
  pool: WorkPiece[],
  input: JobInput,
  maxConsumed: number,
): BlockChoice[] {
  if (maxConsumed <= 0 || pool.length === 0) return []

  const result: BlockChoice[] = []
  const seen = new Set<string>()

  const add = (choice: BlockChoice, key: string) => {
    if (!choiceFits(choice, input, maxConsumed) || seen.has(key)) return
    seen.add(key)
    result.push(choice)
  }

  for (const piece of representativesByLength(pool)) {
    add({ block: makeSingle(piece), pieces: [piece] }, `s:${piece.role}:${piece.length}`)
  }

  if (input.useConeNesting) {
    const piles = representativesByLength(pool, 'pile')
    for (let i = 0; i < piles.length; i += 1) {
      for (let j = i + 1; j < piles.length; j += 1) {
        const a = piles[i]
        const b = piles[j]
        if (!pairFitsOnStock(a.length, b.length, input)) continue
        const hi = Math.max(a.length, b.length)
        const lo = Math.min(a.length, b.length)
        add(
          {
            block: makePair(a, b, input.coneLength, input.nestedConeLength),
            pieces: [a, b],
          },
          `p:${hi}+${lo}`,
        )
      }
    }
  }

  result.sort((a, b) => {
    const pairBoostA =
      input.useConeNesting && a.block.kind === 'pair' ? 300 : 0
    const pairBoostB =
      input.useConeNesting && b.block.kind === 'pair' ? 300 : 0
    return (
      b.block.consumed +
      pairBoostB -
      (a.block.consumed + pairBoostA) ||
      b.pieces.length - a.pieces.length
    )
  })
  return result
}

/** Higher = tighter bar (more mm used on stock). */
function scoreFill(blocks: CutBlock[], input: JobInput): number {
  const used = usedOnBar(blocks, input.kerf)
  const pairs = blocks.filter((block) => block.kind === 'pair').length
  const piecesCount = blocks.reduce((n, block) => n + block.lengths.length, 0)
  const pairWeight = input.useConeNesting ? 50_000 : 10
  return used * 1_000_000 + piecesCount * 1_000 + pairs * pairWeight
}

function comparePacks(
  a: { bars: StockBar[]; blocks: CutBlock[] },
  b: { bars: StockBar[]; blocks: CutBlock[] },
): number {
  if (a.bars.length !== b.bars.length) return a.bars.length - b.bars.length
  const usedA = a.bars.reduce((sum, bar) => sum + bar.used, 0)
  const usedB = b.bars.reduce((sum, bar) => sum + bar.used, 0)
  return usedB - usedA
}

/** Every distinct first block that can start a bar. */
function listFirstCandidates(pool: WorkPiece[], input: JobInput): BlockChoice[] {
  const result: BlockChoice[] = []
  const seen = new Set<string>()

  for (const piece of representativesByLength(pool)) {
    const key = `s:${piece.role}:${piece.length}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!blockFitsAlone(piece.length, input)) continue
    result.push({ block: makeSingle(piece), pieces: [piece] })
  }

  if (input.useConeNesting) {
    const piles = representativesByLength(pool, 'pile')
    for (let i = 0; i < piles.length; i += 1) {
      for (let j = i + 1; j < piles.length; j += 1) {
        const a = piles[i]
        const b = piles[j]
        if (!pairFitsOnStock(a.length, b.length, input)) continue
        const hi = Math.max(a.length, b.length)
        const lo = Math.min(a.length, b.length)
        const key = `p:${hi}+${lo}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push({
          block: makePair(a, b, input.coneLength, input.nestedConeLength),
          pieces: [a, b],
        })
      }
    }
  }

  result.sort((a, b) => b.block.consumed - a.block.consumed)
  return result
}

type BarFill = {
  blocks: CutBlock[]
  usedIds: string[]
}

function fillBarMax(pool: WorkPiece[], input: JobInput, start: BarFill): BarFill {
  const branchDepth = 5
  const branchWidth = 4

  function extend(blocks: CutBlock[], used: Set<string>, depth: number): BarFill {
    const localPool = pool.filter((piece) => !used.has(piece.id))
    const space = availableForNextBlock(blocks, input)
    const choices = listFitChoices(localPool, input, space)
    if (choices.length === 0) {
      return { blocks, usedIds: [...used] }
    }

    const candidates =
      depth < branchDepth ? choices.slice(0, branchWidth) : [choices[0]]

    let best: BarFill & { score: number } = {
      blocks,
      usedIds: [...used],
      score: scoreFill(blocks, input),
    }

    for (const pick of candidates) {
      const nextUsed = new Set(used)
      for (const piece of pick.pieces) nextUsed.add(piece.id)
      const result = extend([...blocks, pick.block], nextUsed, depth + 1)
      const score = scoreFill(result.blocks, input)
      if (score > best.score) {
        best = { ...result, score }
      }
    }

    return { blocks: best.blocks, usedIds: best.usedIds }
  }

  return extend(start.blocks, new Set(start.usedIds), 0)
}

function buildOneBar(pool: WorkPiece[], input: JobInput): BarFill {
  let bestFill: BarFill | null = null
  let bestScore = -1

  for (const first of listFirstCandidates(pool, input)) {
    const fill = fillBarMax(pool, input, {
      blocks: [first.block],
      usedIds: first.pieces.map((piece) => piece.id),
    })
    if (usedOnBar(fill.blocks, input.kerf) > barCapacity(input)) continue
    const score = scoreFill(fill.blocks, input)
    if (score > bestScore) {
      bestScore = score
      bestFill = fill
    }
  }

  if (!bestFill) {
    throw new Error('Не удалось разложить изделия на заготовки')
  }
  return bestFill
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

function packOnce(
  poolInput: WorkPiece[],
  input: JobInput,
  sortPool: (a: WorkPiece, b: WorkPiece) => number,
) {
  const pool = [...poolInput].sort(sortPool)
  const bars: StockBar[] = []
  const allBlocks: CutBlock[] = []

  while (pool.length > 0) {
    const bestFill = buildOneBar(pool, input)
    const merged = mergePairsOnBar(bestFill.blocks, input)
    removeByIds(pool, bestFill.usedIds)
    allBlocks.push(...merged)
    bars.push(finalizeBar(merged, input, bars.length + 1))
  }

  return { bars, blocks: allBlocks }
}

const POOL_SORTS: Array<(a: WorkPiece, b: WorkPiece) => number> = [
  (a, b) => b.length - a.length,
  (a, b) => (a.role === b.role ? 0 : a.role === 'plate' ? -1 : 1) || b.length - a.length,
]

function packEconomicalDense(poolInput: WorkPiece[], input: JobInput) {
  let best = packOnce(poolInput, input, POOL_SORTS[0])

  for (let i = 1; i < POOL_SORTS.length; i += 1) {
    const candidate = packOnce(poolInput, input, POOL_SORTS[i])
    if (comparePacks(candidate, best) < 0) {
      best = candidate
    }
  }

  return best
}

function buildPlan(
  bars: StockBar[],
  input: JobInput,
  blocks: CutBlock[],
  workPieces: WorkPiece[],
  warnings: string[] = [],
): CuttingPlan {
  const totalDemandMm = workPieces.reduce((sum, piece) => sum + piece.length, 0)
  const totalUsedMm = bars.reduce((s, bar) => s + bar.used, 0)
  const totalStockMm = bars.length * input.stockLength
  const wasteMm = totalStockMm - totalUsedMm
  const wastePercent = totalStockMm === 0 ? 0 : (wasteMm / totalStockMm) * 100
  const pairCount = blocks.filter((b) => b.kind === 'pair').length
  const singleCount = blocks.filter((b) => b.kind === 'single').length
  const patterns = groupBarsIntoPatterns(bars)
  const plates = summarizePlates(input)

  const cutBarsCount = bars.length
  const twelveMeterCount = input.twelveMeterCount
  const barsCount = cutBarsCount + twelveMeterCount

  return {
    mode: 'economical',
    title: `Раскрой Ø${input.pipeDiameter} трубы`,
    description: '',
    bars,
    patterns,
    cutBarsCount,
    twelveMeterCount,
    barsCount,
    totalDemandMm,
    totalStockMm,
    totalUsedMm,
    wasteMm,
    wastePercent,
    remnants: bars.map((bar) => bar.remnant).filter((r) => r > 0),
    pairCount,
    singleCount,
    plates,
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
  if (input.twelveMeterCount < 0) {
    throw new Error('Количество 12-метровых труб не может быть отрицательным')
  }
  if (input.pieces.length === 0) throw new Error('Добавьте хотя бы одну позицию')
  if (input.pieces.some((p) => p.length <= 0 || p.quantity <= 0)) {
    throw new Error('Длина и количество должны быть > 0')
  }

  warnings.push(
    `Пропил ${input.kerf} мм между отрезками на трубе. Мин. остаток: ${input.minRemnant} мм (полезная длина ${barCapacity(input)} мм).`,
  )
  if (input.twelveMeterCount > 0) {
    warnings.push(
      `12-метровые целиком: ${input.twelveMeterCount} шт (добавляются к общему количеству труб).`,
    )
  }

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

  if (input.pipeDiameter <= 0) {
    throw new Error('Укажите диаметр трубы')
  }

  if (input.plates.enabled) {
    const p = input.plates
    if (p.segmentLength <= 0 || p.plateWidth <= 0 || p.platesPerPile <= 0) {
      throw new Error('Заполните параметры соединительных пластин')
    }
    if (p.gap < 0) throw new Error('Зазор между пластинами не может быть отрицательным')

    const summary = summarizePlates(input)
    if (!summary || summary.platesPerSegment < 1) {
      throw new Error(
        'С одного кольца не получается ни одной пластины — проверьте диаметр, ширину и зазор',
      )
    }
    warnings.push(
      `Пластины: нужно ${summary.totalPlates} шт (${summary.totalPiles} свай × ${p.platesPerPile}). С кольца: ${summary.platesPerSegment} шт. Колец в раскрой: ${summary.segmentsNeeded} × ${summary.segmentLength} мм.`,
    )
  }

  return warnings
}

export function planEconomical(input: JobInput): CuttingPlan {
  const warnings = validateInput(input)
  const workPieces = expandWorkPieces(input)
  for (const piece of workPieces) {
    assertPieceFitsStock(piece.length, input)
  }

  const { bars, blocks } = packEconomicalDense(workPieces, input)

  return buildPlan(bars, input, blocks, workPieces, warnings)
}

export function calculatePlan(input: JobInput): CuttingPlan {
  return planEconomical(input)
}
