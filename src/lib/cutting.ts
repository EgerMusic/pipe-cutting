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

/** Distinct block types that still fit — identical lengths are one variant, not N copies. */
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

  for (const piece of pool) {
    add({ block: makeSingle(piece), pieces: [piece] }, `s:${piece.role}:${piece.length}`)
  }

  if (input.useConeNesting) {
    const piles = pool.filter((piece) => piece.role === 'pile')
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

  result.sort((a, b) => b.block.consumed - a.block.consumed || b.pieces.length - a.pieces.length)
  return result
}

function scoreFill(blocks: CutBlock[], input: JobInput): number {
  const used = usedOnBar(blocks, input.kerf)
  const pairs = blocks.filter((block) => block.kind === 'pair').length
  const piecesCount = blocks.reduce((n, block) => n + block.lengths.length, 0)
  return piecesCount * 1_000_000_000 + pairs * 1_000_000 + used
}

function poolStateKey(pool: WorkPiece[], space: number): string {
  const counts = new Map<string, number>()
  for (const piece of pool) {
    const key = `${piece.role}:${piece.length}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const body = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}*${count}`)
    .join(',')
  return `${space}|${body}`
}

type BarFill = {
  blocks: CutBlock[]
  usedIds: string[]
}

/**
 * Try every distinct way to fill leftover space (not greedy smallest-first).
 * Identical lengths are not re-tried as separate branches.
 */
function searchBestFill(
  pool: WorkPiece[],
  input: JobInput,
  start: BarFill,
): BarFill {
  const best: BarFill & { score: number } = {
    blocks: [...start.blocks],
    usedIds: [...start.usedIds],
    score: scoreFill(start.blocks, input),
  }
  const seen = new Set<string>()
  let nodes = 0
  const nodeLimit = 30_000

  const dfs = (currentPool: WorkPiece[], blocks: CutBlock[], usedIds: string[]) => {
    nodes += 1
    if (nodes > nodeLimit) return

    const space = availableForNextBlock(blocks, input)
    const state = poolStateKey(currentPool, Math.floor(space))
    if (seen.has(state)) return
    seen.add(state)

    const choices = listFitChoices(currentPool, input, space)
    if (choices.length === 0) {
      const score = scoreFill(blocks, input)
      if (score > best.score) {
        best.score = score
        best.blocks = [...blocks]
        best.usedIds = [...usedIds]
      }
      return
    }

    for (const choice of choices) {
      const ids = choice.pieces.map((piece) => piece.id)
      const nextPool = currentPool.filter((piece) => !ids.includes(piece.id))
      blocks.push(choice.block)
      usedIds.push(...ids)
      dfs(nextPool, blocks, usedIds)
      usedIds.splice(usedIds.length - ids.length, ids.length)
      blocks.pop()
      if (nodes > nodeLimit) return
    }
  }

  const rest = pool.filter((piece) => !start.usedIds.includes(piece.id))
  dfs(rest, [...start.blocks], [...start.usedIds])
  return { blocks: best.blocks, usedIds: best.usedIds }
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

function packEconomicalDense(poolInput: WorkPiece[], input: JobInput) {
  const pool = [...poolInput]
  const bars: StockBar[] = []
  const allBlocks: CutBlock[] = []

  while (pool.length > 0) {
    pool.sort((a, b) => b.length - a.length)
    const largest = pool[0]

    const firstCandidates: BlockChoice[] = [
      { block: makeSingle(largest), pieces: [largest] },
    ]
    const seenFirst = new Set<string>([`s:${largest.role}:${largest.length}`])

    if (input.useConeNesting && largest.role === 'pile') {
      for (const other of pool) {
        if (other.id === largest.id || other.role !== 'pile') continue
        if (!pairFitsOnStock(largest.length, other.length, input)) continue
        const key = `p:${Math.max(largest.length, other.length)}+${Math.min(largest.length, other.length)}`
        if (seenFirst.has(key)) continue
        seenFirst.add(key)
        firstCandidates.push({
          block: makePair(largest, other, input.coneLength, input.nestedConeLength),
          pieces: [largest, other],
        })
      }
    }

    let bestFill: BarFill | null = null
    let bestScore = -1

    for (const first of firstCandidates) {
      if (!blockFitsAlone(first.block.consumed, input)) continue
      const fill = searchBestFill(pool, input, {
        blocks: [first.block],
        usedIds: first.pieces.map((piece) => piece.id),
      })
      const used = usedOnBar(fill.blocks, input.kerf)
      if (used > barCapacity(input)) continue
      const score = scoreFill(fill.blocks, input)
      if (score > bestScore) {
        bestScore = score
        bestFill = fill
      }
    }

    if (!bestFill) {
      throw new Error('Не удалось разложить изделия на заготовки')
    }

    removeByIds(pool, bestFill.usedIds)
    allBlocks.push(...bestFill.blocks)
    bars.push(finalizeBar(bestFill.blocks, input, bars.length + 1))
  }

  return { bars, blocks: allBlocks }
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

  return {
    mode: 'economical',
    title: `Раскрой Ø${input.pipeDiameter} трубы`,
    description: '',
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
  if (input.pieces.length === 0) throw new Error('Добавьте хотя бы одну позицию')
  if (input.pieces.some((p) => p.length <= 0 || p.quantity <= 0)) {
    throw new Error('Длина и количество должны быть > 0')
  }

  warnings.push(
    `Пропил ${input.kerf} мм между отрезками на трубе. Мин. остаток: ${input.minRemnant} мм (полезная длина ${barCapacity(input)} мм).`,
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
