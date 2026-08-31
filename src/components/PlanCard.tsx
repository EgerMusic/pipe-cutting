import { useState } from 'react'
import type { CuttingPlan, JobInput } from '../lib/types'
import { downloadPlanPdf } from '../lib/pdf'

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

  return (
    <section className="card plan highlight">
      <div className="plan-head">
        <div>
          <h2>{plan.title}</h2>
          <p className="muted">{plan.description}</p>
        </div>
        <button type="button" className="secondary" onClick={onPdf} disabled={pdfBusy}>
          {pdfBusy ? 'Готовим PDF…' : 'Скачать PDF'}
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Труб купить</span>
          <strong className="stat-value">{plan.barsCount}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">Типов схем</span>
          <strong className="stat-value">{plan.patterns.length}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">Пары / одиночные</span>
          <strong className="stat-value">
            {plan.pairCount} / {plan.singleCount}
          </strong>
        </div>
        <div className="stat">
          <span className="stat-label">Отход</span>
          <strong className="stat-value">{plan.wastePercent.toFixed(1)}%</strong>
        </div>
      </div>

      {plan.warnings.length > 0 && (
        <ul className="warnings">
          {plan.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <h3>Схемы раскроя</h3>
      <div className="bars">
        {plan.patterns.map((pattern, patternIndex) => {
          const usedPct = (pattern.used / input.stockLength) * 100
          return (
            <div key={pattern.signature} className="bar-row">
              <div className="bar-meta">
                <strong>
                  Схема {patternIndex + 1} × {pattern.count} шт
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
                      className={`segment ${block.kind}`}
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
              <ol className="block-list">
                {pattern.blocks.map((block, idx) => (
                  <li key={`${pattern.signature}-list-${idx}`}>
                    {block.kind === 'pair' ? 'Пара' : 'Одиночная'}: {block.label} →{' '}
                    {block.consumed} мм
                    {input.kerf > 0 ? ` + пропил ${input.kerf} мм` : ''}
                  </li>
                ))}
              </ol>
            </div>
          )
        })}
      </div>

      <h3>Таблица остатков по схемам</h3>
      {plan.patterns.every((pattern) => pattern.remnant === 0) ? (
        <p className="muted">Остатков нет.</p>
      ) : (
        <table className="remnants">
          <thead>
            <tr>
              <th>Схема</th>
              <th>Кол-во труб</th>
              <th>Остаток, мм</th>
            </tr>
          </thead>
          <tbody>
            {plan.patterns
              .map((pattern, index) => ({ pattern, index }))
              .filter(({ pattern }) => pattern.remnant > 0)
              .map(({ pattern, index }) => (
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
