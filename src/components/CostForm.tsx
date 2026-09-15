import { useState } from 'react'
import { paintPositionsFromJob } from '../lib/cost'
import { PLACEHOLDER_COST_RATES } from '../lib/costDefaults'
import { saveCostRates } from '../lib/costStorage'
import type { CostInput, CostPosition, CostRates, PaintSourceMode } from '../lib/costTypes'
import type { CuttingPlan, JobInput } from '../lib/types'

type Props = {
  value: CostInput
  onChange: (next: CostInput) => void
  onCalculate: () => void
  error: string | null
  job: JobInput
  plan: CuttingPlan | null
}

function numInputValue(value: number): number | '' {
  return value === 0 || Number.isNaN(value) ? '' : value
}

function parseNum(raw: string): number {
  if (raw === '') return 0
  const n = Number(raw)
  return Number.isNaN(n) ? 0 : n
}

function newPosition(defaultDiameter: number): CostPosition {
  return {
    id: crypto.randomUUID(),
    name: '',
    pipeDiameterMm: defaultDiameter,
    lengthMm: 0,
    quantity: 0,
    paintLengthMm: 0,
  }
}

export function CostForm({ value, onChange, onCalculate, error, job, plan }: Props) {
  const [ratesOpen, setRatesOpen] = useState(false)

  const update = (patch: Partial<CostInput>) => onChange({ ...value, ...patch })
  const updateRates = (patch: Partial<CostRates>) => {
    const rates = { ...value.rates, ...patch }
    onChange({ ...value, rates })
    saveCostRates(rates)
  }
  const updateSimple = (patch: Partial<CostInput['simple']>) =>
    onChange({ ...value, simple: { ...value.simple, ...patch } })

  const updatePosition = (id: string, patch: Partial<CostPosition>) => {
    onChange({
      ...value,
      positions: value.positions.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  }

  const setMode = (sourceMode: PaintSourceMode) => {
    const next: CostInput = { ...value, sourceMode }
    if (sourceMode === 'fromCutting' && plan) {
      next.positions = paintPositionsFromJob(job)
      next.metalEnabled = true
      next.metalTubeCount = plan.barsCount
      next.metalStockLengthMm = job.stockLength
    }
    onChange(next)
  }

  const resetRates = () => {
    const rates = { ...PLACEHOLDER_COST_RATES }
    onChange({ ...value, rates })
    saveCostRates(rates)
  }

  return (
    <section className="card">
      <h2 className="section-title">Смета изготовления</h2>

      {value.sourceMode === 'simple' && (
        <label style={{ marginBottom: 16, maxWidth: 280 }}>
          Диаметр трубы, мм
          <input
            type="number"
            min={1}
            value={numInputValue(value.pipeDiameterMm)}
            onChange={(e) => update({ pipeDiameterMm: parseNum(e.target.value) })}
          />
        </label>
      )}

      <p className="hint" style={{ marginTop: value.sourceMode === 'simple' ? '-8px' : 0, marginBottom: 12 }}>
        Окраска — только наружная поверхность. В режиме «По позициям» Ø задаётся в каждой строке.
      </p>

      <div className="cost-mode">
        <span className="cost-mode-label">Источник площади</span>
        <div className="cost-mode-buttons">
          <button
            type="button"
            className={value.sourceMode === 'simple' ? 'primary' : 'secondary'}
            onClick={() => setMode('simple')}
          >
            Простой
          </button>
          <button
            type="button"
            className={value.sourceMode === 'positions' ? 'primary' : 'secondary'}
            onClick={() => setMode('positions')}
          >
            По позициям
          </button>
          <button
            type="button"
            className={value.sourceMode === 'fromCutting' ? 'primary' : 'secondary'}
            onClick={() => setMode('fromCutting')}
            disabled={!plan}
            title={plan ? undefined : 'Сначала рассчитайте раскрой'}
          >
            Из раскроя
          </button>
        </div>
      </div>

      {value.sourceMode === 'simple' && (
        <div className="grid-3 nest-box" style={{ marginBottom: 16 }}>
          <label>
            Количество, шт
            <input
              type="number"
              min={1}
              value={numInputValue(value.simple.quantity)}
              onChange={(e) => updateSimple({ quantity: parseNum(e.target.value) })}
            />
          </label>
          <label>
            Длина трубы, мм
            <input
              type="number"
              min={1}
              value={numInputValue(value.simple.lengthMm)}
              onChange={(e) => {
                const lengthMm = parseNum(e.target.value)
                updateSimple({
                  lengthMm,
                  paintLengthMm: value.simple.paintLengthMm || lengthMm,
                })
              }}
            />
          </label>
          <label>
            Окраска, мм
            <input
              type="number"
              min={0}
              value={numInputValue(value.simple.paintLengthMm)}
              onChange={(e) => updateSimple({ paintLengthMm: parseNum(e.target.value) })}
            />
          </label>
        </div>
      )}

      {value.sourceMode === 'positions' && (
        <>
          <div className="pieces-head">
            <h3 className="section-title" style={{ margin: 0, flex: 1 }}>
              Позиции
            </h3>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onChange({
                  ...value,
                  positions: [...value.positions, newPosition(job.pipeDiameter || value.pipeDiameterMm)],
                })
              }
            >
              + Добавить
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
                  <th>Окраска, мм</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {value.positions.map((piece) => (
                  <tr key={piece.id}>
                    <td>
                      <input
                        type="text"
                        value={piece.name}
                        onChange={(e) => updatePosition(piece.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={numInputValue(piece.pipeDiameterMm)}
                        onChange={(e) =>
                          updatePosition(piece.id, { pipeDiameterMm: parseNum(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={numInputValue(piece.lengthMm)}
                        onChange={(e) =>
                          updatePosition(piece.id, { lengthMm: parseNum(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={numInputValue(piece.quantity)}
                        onChange={(e) =>
                          updatePosition(piece.id, { quantity: parseNum(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={numInputValue(piece.paintLengthMm)}
                        onChange={(e) =>
                          updatePosition(piece.id, { paintLengthMm: parseNum(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="danger ghost"
                        disabled={value.positions.length <= 1}
                        onClick={() =>
                          onChange({
                            ...value,
                            positions: value.positions.filter((p) => p.id !== piece.id),
                          })
                        }
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {value.sourceMode === 'fromCutting' && plan && (
        <>
          <div className="nest-box" style={{ marginBottom: 12 }}>
            <p className="hint" style={{ margin: 0 }}>
              Металл: {plan.barsCount} труб × {job.stockLength} мм. Укажите длину окраски по каждой
              позиции (не обязательно на всю длину сваи).
            </p>
            <button
              type="button"
              className="secondary"
              style={{ marginTop: 10 }}
              onClick={() =>
                onChange({
                  ...value,
                  positions: paintPositionsFromJob(job),
                  metalTubeCount: plan.barsCount,
                  metalStockLengthMm: job.stockLength,
                  pipeDiameterMm: job.pipeDiameter,
                })
              }
            >
              Обновить из раскроя
            </button>
          </div>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Ø, мм</th>
                  <th>Длина, мм</th>
                  <th>Кол-во</th>
                  <th>Окраска, мм</th>
                </tr>
              </thead>
              <tbody>
                {value.positions.map((piece) => (
                  <tr key={piece.id}>
                    <td>{piece.name || '—'}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={numInputValue(piece.pipeDiameterMm)}
                        onChange={(e) =>
                          updatePosition(piece.id, { pipeDiameterMm: parseNum(e.target.value) })
                        }
                      />
                    </td>
                    <td>{piece.lengthMm}</td>
                    <td>{piece.quantity}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={numInputValue(piece.paintLengthMm)}
                        onChange={(e) =>
                          updatePosition(piece.id, { paintLengthMm: parseNum(e.target.value) })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <label className="checkbox" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={value.metalEnabled}
          onChange={(e) => update({ metalEnabled: e.target.checked })}
        />
        Считать металл (трубы, ₽/т)
      </label>

      {value.metalEnabled && value.sourceMode === 'positions' && (
        <div className="grid-2 nest-box" style={{ marginBottom: 16 }}>
          <label>
            Труб, шт
            <input
              type="number"
              min={1}
              value={numInputValue(value.metalTubeCount)}
              onChange={(e) => update({ metalTubeCount: parseNum(e.target.value) })}
            />
          </label>
          <label>
            Длина трубы, мм
            <input
              type="number"
              min={1}
              value={numInputValue(value.metalStockLengthMm)}
              onChange={(e) => update({ metalStockLengthMm: parseNum(e.target.value) })}
            />
          </label>
        </div>
      )}

      <button
        type="button"
        className="secondary"
        style={{ marginBottom: 12 }}
        onClick={() => setRatesOpen(!ratesOpen)}
      >
        {ratesOpen ? '▾' : '▸'} Расценки (редко меняются)
      </button>

      {ratesOpen && (
        <div className="nest-box" style={{ marginBottom: 16 }}>
          <div className="grid-3">
            <label>
              Труба, ₽/т
              <input
                type="number"
                min={0}
                value={numInputValue(value.rates.pipePricePerTon)}
                onChange={(e) => updateRates({ pipePricePerTon: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Стенка, мм
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={numInputValue(value.rates.wallThicknessMm)}
                onChange={(e) => updateRates({ wallThicknessMm: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Накладные, %
              <input
                type="number"
                min={0}
                value={numInputValue(value.rates.overheadPercent)}
                onChange={(e) => updateRates({ overheadPercent: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Расход при эталоне, кг/м²
              <input
                type="number"
                min={0}
                step={0.01}
                value={numInputValue(value.rates.consumptionKgPerM2AtRef)}
                onChange={(e) =>
                  updateRates({ consumptionKgPerM2AtRef: parseNum(e.target.value) })
                }
              />
            </label>
            <label>
              Эталон DFT, мкм
              <input
                type="number"
                min={1}
                value={numInputValue(value.rates.referenceDftUm)}
                onChange={(e) => updateRates({ referenceDftUm: parseNum(e.target.value) })}
              />
            </label>
            <label>
              DFT заказа, мкм
              <input
                type="number"
                min={1}
                value={numInputValue(value.rates.targetDftUm)}
                onChange={(e) => updateRates({ targetDftUm: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Эмаль, ₽/кг
              <input
                type="number"
                min={0}
                value={numInputValue(value.rates.enamelPricePerKg)}
                onChange={(e) => updateRates({ enamelPricePerKg: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Потери, %
              <input
                type="number"
                min={0}
                value={numInputValue(value.rates.paintWastePercent)}
                onChange={(e) => updateRates({ paintWastePercent: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Людей, чел.
              <input
                type="number"
                min={1}
                value={numInputValue(value.rates.workers)}
                onChange={(e) => updateRates({ workers: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Производительность, м²/чел·ч
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={numInputValue(value.rates.productivityM2PerPersonHour)}
                onChange={(e) =>
                  updateRates({ productivityM2PerPersonHour: parseNum(e.target.value) })
                }
              />
            </label>
            <label>
              Ставка, ₽/ч
              <input
                type="number"
                min={0}
                value={numInputValue(value.rates.laborRatePerHour)}
                onChange={(e) => updateRates({ laborRatePerHour: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Резка, ч
              <input
                type="number"
                min={0}
                step={0.5}
                value={numInputValue(value.rates.cutLaborHours)}
                onChange={(e) => updateRates({ cutLaborHours: parseNum(e.target.value) })}
              />
            </label>
            <label>
              Резка, ₽/ч
              <input
                type="number"
                min={0}
                value={numInputValue(value.rates.cutLaborRatePerHour)}
                onChange={(e) => updateRates({ cutLaborRatePerHour: parseNum(e.target.value) })}
              />
            </label>
          </div>
          <button type="button" className="secondary" style={{ marginTop: 12 }} onClick={resetRates}>
            Сбросить расценки к заглушкам
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <button type="button" className="primary calculate" onClick={onCalculate}>
        Рассчитать смету
      </button>
    </section>
  )
}
