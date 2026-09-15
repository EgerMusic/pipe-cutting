import { useState } from 'react'
import { downloadCostPdf } from '../lib/pdf'
import { formatRub } from '../lib/ru'
import type { CostEstimate, CostInput } from '../lib/costTypes'

type Props = {
  estimate: CostEstimate
  costInput: CostInput
}

export function CostCard({ estimate, costInput }: Props) {
  const [pdfBusy, setPdfBusy] = useState(false)

  const onPdf = async () => {
    try {
      setPdfBusy(true)
      await downloadCostPdf(estimate, costInput)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось скачать PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <section className="card plan">
      <div className="plan-head">
        <div>
          <p className="hero-mark" style={{ marginBottom: 6 }}>
            Смета
          </p>
          <h2>Стоимость изготовления</h2>
        </div>
        <button type="button" className="secondary" onClick={onPdf} disabled={pdfBusy}>
          {pdfBusy ? 'PDF…' : 'Скачать PDF'}
        </button>
      </div>

      <div className="plan-summary">
        <div className="summary-metric summary-metric-amber">
          <span className="summary-metric-label">Итого</span>
          <div className="summary-metric-main">
            <strong>{formatRub(estimate.totalRub)}</strong>
          </div>
          <span className="summary-metric-sub">
            {estimate.paintAreaM2 > 0
              ? `${estimate.paintAreaM2.toFixed(1)} м² окраски`
              : '\u00a0'}
          </span>
        </div>
        <div className="summary-metric">
          <span className="summary-metric-label">Металл</span>
          <div className="summary-metric-main">
            <strong>{formatRub(estimate.metalRub)}</strong>
          </div>
          <span className="summary-metric-sub">
            {estimate.metalMassTon > 0 ? `${estimate.metalMassTon.toFixed(3)} т` : '\u00a0'}
          </span>
        </div>
        <div className="summary-metric">
          <span className="summary-metric-label">Окраска</span>
          <div className="summary-metric-main">
            <strong>{formatRub(estimate.paintMaterialRub + estimate.paintLaborRub)}</strong>
          </div>
          <span className="summary-metric-sub">
            {estimate.paintKg > 0 ? `${estimate.paintKg.toFixed(1)} кг эмали` : '\u00a0'}
          </span>
        </div>
      </div>

      <h3 className="section-title">Статьи</h3>
      <table className="remnants cost-table">
        <thead>
          <tr>
            <th>Статья</th>
            <th>Детали</th>
            <th className="cost-col-rub">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {estimate.lines.map((line) => (
            <tr key={line.label}>
              <td>{line.label}</td>
              <td className="muted">{line.detail}</td>
              <td className="cost-col-rub">{formatRub(line.rub)}</td>
            </tr>
          ))}
          <tr className="cost-total-row">
            <td colSpan={2}>
              <strong>Стоимость изготовления</strong>
            </td>
            <td className="cost-col-rub">
              <strong>{formatRub(estimate.totalRub)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
