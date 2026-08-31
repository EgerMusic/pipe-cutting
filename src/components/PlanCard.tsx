import { useState } from 'react'
import { downloadPlanPdf } from '../lib/pdf'
import { tubesWord } from '../lib/ru'
import type { CuttingPlan, JobInput } from '../lib/types'

type Props = {
  plan: CuttingPlan
  input: JobInput
}

export function PlanCard({ plan, input }: Props) {
  const [pdfBusy, setPdfBusy] = useState(false)

  const onPdf = async () => {
    try {
      setPdfBusy(true)
      await downloadPlanPdf(plan, input)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось скачать PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  const remnantRows = plan.patterns
    .map((pattern, index) => ({ pattern, index }))
    .filter(({ pattern }) => pattern.remnant > 0)

  return (
    <section className="card plan">
      <div className="plan-head">
        <div>
          <p className="hero-mark" style={{ marginBottom: 6 }}>
            Результат
          </p>
          <h2>{plan.title || `Раскрой Ø${input.pipeDiameter} трубы`}</h2>
        </div>
        <button type="button" className="secondary" onClick={onPdf} disabled={pdfBusy}>
          {pdfBusy ? 'PDF…' : 'Скачать PDF'}
        </button>
      </div>

      <div className="tube-count">
        <span>Количество труб</span>
        <strong>{plan.barsCount}</strong>
        <span>шт</span>
      </div>

      <h3 className="section-title">Схемы раскроя</h3>
      <div className="legend">
        <span>
          <i className="l-single" /> одиночная
        </span>
        <span>
          <i className="l-pair" /> конус в конусе
        </span>
        <span>
          <i className="l-plate" /> пластина
        </span>
        <span>
          <i className="l-rem" /> остаток
        </span>
      </div>

      <div className="bars">
        {plan.patterns.map((pattern, patternIndex) => {
          const usedPct = (pattern.used / input.stockLength) * 100
          return (
            <div key={pattern.signature} className="bar-row">
              <div className="bar-meta">
                <strong>
                  Схема {patternIndex + 1} — {pattern.count} {tubesWord(pattern.count)}
                </strong>
                <span>
                  {pattern.used} мм · остаток {pattern.remnant} мм
                </span>
              </div>
              <div className="bar-track">
                {pattern.blocks.map((block, idx) => {
                  const widthPct = (block.consumed / input.stockLength) * 100
                  return (
                    <div
                      key={`${pattern.signature}-${idx}`}
                      className={`segment ${block.role === 'plate' ? 'plate' : block.kind}`}
                      style={{ width: `${widthPct}%` }}
                      title={`${block.label} → ${block.consumed} мм`}
                    >
                      <span>{block.label}</span>
                    </div>
                  )
                })}
                {pattern.remnant > 0 && (
                  <div
                    className="segment remnant"
                    style={{ width: `${100 - usedPct}%` }}
                    title={`Остаток ${pattern.remnant} мм`}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <h3 className="section-title">Остатки по схемам</h3>
      {remnantRows.length === 0 ? (
        <p className="muted">Остатков нет.</p>
      ) : (
        <table className="remnants">
          <thead>
            <tr>
              <th>Схема</th>
              <th>Труб, шт</th>
              <th>Остаток, мм</th>
            </tr>
          </thead>
          <tbody>
            {remnantRows.map(({ pattern, index }) => (
              <tr key={`rem-${pattern.signature}`}>
                <td>{index + 1}</td>
                <td>{pattern.count}</td>
                <td>{pattern.remnant}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
