import type { JobInput, PieceDemand } from '../lib/types'

type Props = {
  value: JobInput
  onChange: (next: JobInput) => void
  onCalculate: () => void
  error: string | null
}

function newPiece(): PieceDemand {
  return {
    id: crypto.randomUUID(),
    name: '',
    length: 5000,
    quantity: 1,
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

  const removePiece = (id: string) => {
    onChange({
      ...value,
      pieces: value.pieces.filter((piece) => piece.id !== id),
    })
  }

  return (
    <section className="card">
      <h2>Параметры раскроя</h2>

      <div className="grid-3">
        <label>
          Длина заготовки, мм
          <input
            type="number"
            min={1}
            value={value.stockLength}
            onChange={(e) => update({ stockLength: Number(e.target.value) })}
          />
        </label>
        <label>
          Пропил, мм
          <input
            type="number"
            min={0}
            value={value.kerf}
            onChange={(e) => update({ kerf: Number(e.target.value) })}
          />
        </label>
        <label>
          Мин. остаток, мм
          <input
            type="number"
            min={0}
            value={value.minRemnant}
            onChange={(e) => update({ minRemnant: Number(e.target.value) })}
          />
        </label>
      </div>

      <p className="hint" style={{ marginTop: '-4px', marginBottom: '12px' }}>
        Пропил вычитается на каждый блок реза. На трубе всегда остаётся хвост не меньше
        мин. остатка (полезная длина = заготовка − мин. остаток).
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
              value={value.coneLength}
              onChange={(e) => update({ coneLength: Number(e.target.value) })}
            />
          </label>
          <label>
            Длина «конус в конусе», мм
            <input
              type="number"
              min={1}
              value={value.nestedConeLength}
              onChange={(e) => update({ nestedConeLength: Number(e.target.value) })}
            />
          </label>
          <p className="hint">
            Расход пары A+B = A + B − 2×конус + «конус в конусе». Плюс пропил на блок.
          </p>
        </div>
      )}

      <div className="pieces-head">
        <h3>Изделия</h3>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            onChange({
              ...value,
              pieces: [...value.pieces, newPiece()],
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
              <th>Длина, мм</th>
              <th>Кол-во</th>
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
                    value={piece.length}
                    onChange={(e) =>
                      updatePiece(piece.id, { length: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={piece.quantity}
                    onChange={(e) =>
                      updatePiece(piece.id, { quantity: Number(e.target.value) })
                    }
                  />
                </td>
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
