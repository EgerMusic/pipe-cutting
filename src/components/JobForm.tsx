import { jobDiameters, pieceDiameter, platesPerSegment } from '../lib/types'
import type { JobInput, PieceDemand } from '../lib/types'

type Props = {
  value: JobInput
  onChange: (next: JobInput) => void
  onCalculate: () => void
  error: string | null
}

/** Show empty instead of sticky 0 so the field can be cleared. */
function numInputValue(value: number): number | '' {
  return value === 0 || Number.isNaN(value) ? '' : value
}

function parseNum(raw: string): number {
  if (raw === '') return 0
  const n = Number(raw)
  return Number.isNaN(n) ? 0 : n
}

function newPiece(defaultDiameter: number): PieceDemand {
  return {
    id: crypto.randomUUID(),
    name: '',
    length: 0,
    quantity: 0,
    pipeDiameter: defaultDiameter > 0 ? defaultDiameter : 0,
    needsPlates: true,
  }
}

export function JobForm({ value, onChange, onCalculate, error }: Props) {
  const update = (patch: Partial<JobInput>) => onChange({ ...value, ...patch })

  const updatePiece = (id: string, patch: Partial<PieceDemand>) => {
    onChange({
      ...value,
      pieces: value.pieces.map((piece) =>
        piece.id === id ? { ...piece, ...patch } : piece,
      ),
    })
  }

  const updatePlates = (patch: Partial<JobInput['plates']>) => {
    onChange({
      ...value,
      plates: { ...value.plates, ...patch },
    })
  }

  const removePiece = (id: string) => {
    onChange({
      ...value,
      pieces: value.pieces.filter((piece) => piece.id !== id),
    })
  }

  const pilesWithPlates = value.pieces
    .filter((piece) => piece.needsPlates)
    .reduce((sum, piece) => sum + piece.quantity, 0)
  const totalPlates = pilesWithPlates * value.plates.platesPerPile
  const plateRingHint =
    value.plates.enabled && totalPlates > 0
      ? jobDiameters(value)
          .map((d) => {
            const perRing = platesPerSegment(value.plates, d)
            const piles = value.pieces.filter(
              (p) => p.needsPlates && pieceDiameter(p, value) === d,
            )
            const plates = piles.reduce((s, p) => s + p.quantity, 0) * value.plates.platesPerPile
            const rings = perRing > 0 ? Math.ceil(plates / perRing) : 0
            return `Ø${d}: ${rings} кол.`
          })
          .join(' · ')
      : ''

  return (
    <section className="card">
      <h2 className="section-title">Параметры раскроя</h2>

      <label style={{ marginBottom: 16, maxWidth: 320 }}>
        Диаметр по умолчанию, мм
        <input
          type="number"
          min={1}
          value={numInputValue(value.pipeDiameter)}
          onChange={(e) => update({ pipeDiameter: parseNum(e.target.value) })}
        />
      </label>
      <p className="hint" style={{ marginTop: '-8px', marginBottom: 12 }}>
        У каждой позиции можно указать свой Ø; пусто в строке — берётся значение по умолчанию.
      </p>

      <div className="grid-3">
        <label>
          Длина заготовки, мм
          <input
            type="number"
            min={1}
            value={numInputValue(value.stockLength)}
            onChange={(e) => update({ stockLength: parseNum(e.target.value) })}
          />
        </label>
        <label>
          Пропил, мм
          <input
            type="number"
            min={0}
            value={numInputValue(value.kerf)}
            onChange={(e) => update({ kerf: parseNum(e.target.value) })}
          />
        </label>
        <label>
          Мин. остаток, мм
          <input
            type="number"
            min={0}
            value={numInputValue(value.minRemnant)}
            onChange={(e) => update({ minRemnant: parseNum(e.target.value) })}
          />
        </label>
      </div>

      <label style={{ marginTop: 0, marginBottom: 12, maxWidth: 320 }}>
        12-метровые, шт
        <input
          type="number"
          min={0}
          value={numInputValue(value.twelveMeterCount)}
          onChange={(e) => update({ twelveMeterCount: parseNum(e.target.value) })}
        />
      </label>

      <p className="hint" style={{ marginTop: '-4px', marginBottom: '12px' }}>
        Пропил учитывается только между отрезками на одной трубе. Хвост не меньше мин.
        остатка (полезная длина = заготовка − мин. остаток). 12-метровые добавляются к
        общему количеству труб без раскроя.
      </p>

      <label className="checkbox" style={{ marginTop: 0, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={value.useConeNesting}
          onChange={(e) => update({ useConeNesting: e.target.checked })}
        />
        Использовать «конус в конусе»
      </label>

      {value.useConeNesting && (
        <div className="grid-2 nest-box">
          <label>
            Длина конуса одной сваи, мм
            <input
              type="number"
              min={1}
              value={numInputValue(value.coneLength)}
              onChange={(e) => update({ coneLength: parseNum(e.target.value) })}
            />
          </label>
          <label>
            Длина «конус в конусе», мм
            <input
              type="number"
              min={1}
              value={numInputValue(value.nestedConeLength)}
              onChange={(e) => update({ nestedConeLength: parseNum(e.target.value) })}
            />
          </label>
          <p className="hint">
            Расход пары A+B = A + B − 2×конус + «конус в конусе». Пропил — только между блоками.
          </p>
        </div>
      )}

      <label className="checkbox" style={{ marginTop: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={value.plates.enabled}
          onChange={(e) => updatePlates({ enabled: e.target.checked })}
        />
        Соединительные пластины
      </label>

      {value.plates.enabled && (
        <div className="nest-box" style={{ marginBottom: 16 }}>
          <div className="grid-3">
            <label>
              Длина кольца вдоль трубы, мм
              <input
                type="number"
                min={1}
                value={numInputValue(value.plates.segmentLength)}
                onChange={(e) => updatePlates({ segmentLength: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Ширина пластины, мм
              <input
                type="number"
                min={1}
                value={numInputValue(value.plates.plateWidth)}
                onChange={(e) => updatePlates({ plateWidth: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Зазор между пластинами, мм
              <input
                type="number"
                min={0}
                value={numInputValue(value.plates.gap)}
                onChange={(e) => updatePlates({ gap: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Пластин на 1 сваю, шт
              <input
                type="number"
                min={1}
                value={numInputValue(value.plates.platesPerPile)}
                onChange={(e) => updatePlates({ platesPerPile: parseNum(e.target.value) })}
              />
            </label>
          </div>
          {plateRingHint && (
            <p className="hint">
              Свай с пластинами: {pilesWithPlates} · колец в раскрой: {plateRingHint} ×{' '}
              {value.plates.segmentLength || '—'} мм
            </p>
          )}
        </div>
      )}

      <div className="pieces-head">
        <h3 className="section-title" style={{ margin: 0, flex: 1 }}>Изделия</h3>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            onChange({
              ...value,
              pieces: [...value.pieces, newPiece(value.pipeDiameter)],
            })
          }
        >
          + Добавить длину
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Ø, мм</th>
              <th>Длина, мм</th>
              <th>Кол-во</th>
              {value.plates.enabled && <th>Пластины</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {value.pieces.map((piece) => (
              <tr key={piece.id}>
                <td>
                  <input
                    type="text"
                    placeholder="например Свая 1"
                    value={piece.name}
                    onChange={(e) => updatePiece(piece.id, { name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    placeholder={value.pipeDiameter ? String(value.pipeDiameter) : '—'}
                    value={numInputValue(piece.pipeDiameter)}
                    onChange={(e) =>
                      updatePiece(piece.id, { pipeDiameter: parseNum(e.target.value) })
                    }
                    title="Пусто — диаметр по умолчанию"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={numInputValue(piece.length)}
                    onChange={(e) =>
                      updatePiece(piece.id, { length: parseNum(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={numInputValue(piece.quantity)}
                    onChange={(e) =>
                      updatePiece(piece.id, { quantity: parseNum(e.target.value) })
                    }
                  />
                </td>
                {value.plates.enabled && (
                  <td>
                    <input
                      type="checkbox"
                      checked={piece.needsPlates}
                      onChange={(e) =>
                        updatePiece(piece.id, { needsPlates: e.target.checked })
                      }
                      title="Нужны соединительные пластины"
                    />
                  </td>
                )}
                <td>
                  <button
                    type="button"
                    className="danger ghost"
                    disabled={value.pieces.length <= 1}
                    onClick={() => removePiece(piece.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="error">{error}</p>}

      <button type="button" className="primary calculate" onClick={onCalculate}>
        Рассчитать раскрой
      </button>
    </section>
  )
}
