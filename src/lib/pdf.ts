import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { CuttingPlan, JobInput } from './types'

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildReportElement(plan: CuttingPlan, input: JobInput): HTMLDivElement {
  const root = document.createElement('div')
  root.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;padding:32px;background:#fff;color:#111;font-family:Arial,sans-serif;'

  const patterns = plan.patterns
    .map((pattern, index) => {
      const segments = pattern.blocks
        .map((block) => {
          const width = (block.consumed / input.stockLength) * 100
          const bg = block.kind === 'pair' ? '#7c3aed' : '#2563eb'
          return `<div style="width:${width}%;background:${bg};color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;">${escapeHtml(block.label)}</div>`
        })
        .join('')
      const remnantWidth = (pattern.remnant / input.stockLength) * 100
      const remnant =
        pattern.remnant > 0
          ? `<div style="width:${remnantWidth}%;background:repeating-linear-gradient(45deg,#ccc,#ccc 5px,#e5e5e5 5px,#e5e5e5 10px);"></div>`
          : ''
      const list = pattern.blocks
        .map(
          (block, i) =>
            `<li style="margin:2px 0;">${i + 1}) ${block.kind === 'pair' ? 'Пара' : 'Одиночная'}: ${escapeHtml(block.label)} → ${block.consumed} мм</li>`,
        )
        .join('')

      return `
        <div style="margin:0 0 18px;padding-bottom:12px;border-bottom:1px solid #ddd;break-inside:avoid;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Схема ${index + 1} × ${pattern.count} шт</div>
          <div style="font-size:12px;margin-bottom:6px;">Занято ${pattern.used} мм · остаток ${pattern.remnant} мм</div>
          <div style="display:flex;height:26px;border:1px solid #999;border-radius:4px;overflow:hidden;background:#eee;">${segments}${remnant}</div>
          <ol style="margin:8px 0 0;padding-left:18px;font-size:12px;">${list}</ol>
        </div>
      `
    })
    .join('')

  const pieces = input.pieces
    .map((piece) => {
      const name = piece.name.trim() ? ` (${escapeHtml(piece.name)})` : ''
      return `<li>${piece.quantity} шт × ${piece.length} мм${name}</li>`
    })
    .join('')

  root.innerHTML = `
    <h1 style="margin:0 0 8px;font-size:20px;">Раскрой труб</h1>
    <p style="margin:0 0 12px;font-size:13px;">${escapeHtml(plan.description)}</p>
    <p style="margin:0 0 4px;font-size:13px;">Заготовка: ${input.stockLength} мм · Пропил: ${input.kerf} мм · Мин. остаток: ${input.minRemnant} мм</p>
    ${
      input.useConeNesting
        ? `<p style="margin:0 0 4px;font-size:13px;">Конус: ${input.coneLength} мм · Конус в конусе: ${input.nestedConeLength} мм</p>`
        : ''
    }
    <p style="margin:0 0 4px;font-size:13px;"><strong>Труб нужно: ${plan.barsCount} шт</strong></p>
    <p style="margin:0 0 4px;font-size:13px;">Пар: ${plan.pairCount}, одиночных: ${plan.singleCount}</p>
    <p style="margin:0 0 16px;font-size:13px;">Использовано: ${plan.totalUsedMm} / ${plan.totalStockMm} мм (отход ${plan.wastePercent.toFixed(1)}%)</p>
    <h2 style="margin:0 0 8px;font-size:16px;">Позиции заказа</h2>
    <ul style="margin:0 0 16px;padding-left:18px;font-size:13px;">${pieces}</ul>
    <h2 style="margin:0 0 8px;font-size:16px;">Схемы раскроя</h2>
    ${patterns}
  `

  document.body.appendChild(root)
  return root
}

export async function downloadPlanPdf(plan: CuttingPlan, input: JobInput) {
  const el = buildReportElement(plan, input)
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    })

    const img = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 10
    const contentWidth = pageWidth - margin * 2
    const contentHeight = pageHeight - margin * 2

    const imgWidth = contentWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    let heightLeft = imgHeight
    let position = margin

    pdf.addImage(img, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= contentHeight

    while (heightLeft > 0) {
      position = margin - (imgHeight - heightLeft)
      pdf.addPage()
      pdf.addImage(img, 'PNG', margin, position, imgWidth, imgHeight)
      heightLeft -= contentHeight
    }

    pdf.save(`raskroy-${plan.barsCount}-tubes.pdf`)
  } finally {
    el.remove()
  }
}
