import { useState } from 'react'
import { downloadPlanPdf } from '../lib/pdf'
import { formatPercent, tubesWord } from '../lib/ru'
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
    <section className="card plan cutting-card">
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

      <div className="plan-summary">
        <div className="summary-metric summary-metric-amber">
          <span className="summary-metric-label">Количество труб</span>
          <div className="summary-metric-main">
            <strong>{plan.barsCount}</strong>
            <span className="summary-metric-unit">шт</span>
          </div>
          <span className="summary-metric-sub">
            {plan.twelveMeterCount > 0
              ? `${plan.cutBarsCount} раскрой + ${plan.twelveMeterCount} × 12 м`
              : '\u00a0'}
          </span>
        </div>
        <div className="summary-metric">
          <span className="summary-metric-label">Польза</span>
          <div className="summary-metric-main">
            <strong>{formatPercent(100 - plan.wastePercent)}</strong>
          </div>
          <span className="summary-metric-sub" aria-hidden="true">
            &nbsp;
          </span>
        </div>
        <div className="summary-metric">
          <span className="summary-metric-label">Остатки</span>
          <div className="summary-metric-main">
            <strong>{formatPercent(plan.wastePercent)}</strong>
          </div>
          <span className="summary-metric-sub">{plan.wasteMm} мм</span>
        </div>
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
                <div className="bar-meta-stats">
                  <div className="bar-meta-stat">
                    <span className="bar-meta-stat-label">занято</span>
                    <span>{pattern.used} мм</span>
                  </div>
                  <div className="bar-meta-stat bar-meta-stat-rem">
                    <span className="bar-meta-stat-label">остаток</span>
                    <span>
                      {formatPercent((pattern.remnant / input.stockLength) * 100)} ·{' '}
                      {pattern.remnant} мм
                    </span>
                  </div>
                </div>
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
              <th>Остаток</th>
            </tr>
          </thead>
          <tbody>
            {remnantRows.map(({ pattern, index }) => (
              <tr key={`rem-${pattern.signature}`}>
                <td>{index + 1}</td>
                <td>{pattern.count}</td>
                <td>
                  {formatPercent((pattern.remnant / input.stockLength) * 100)} ·{' '}
                  {pattern.remnant} мм
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
