import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { CostEstimate, CostInput } from './costTypes'
import { formatPercent, formatRub, tubesWord } from './ru'
import { jobDiameters, pieceDiameter, type CuttingPlan, type JobInput, type PatternGroup } from './types'

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const PAGE_WIDTH_PX = 794

const shell = `
  font-family: Arial, Helvetica, sans-serif;
  color: #0f172a;
  background: #fff;
`

function makeHost(): HTMLDivElement {
  const root = document.createElement('div')
  root.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_WIDTH_PX}px;padding:0;background:#fff;`
  document.body.appendChild(root)
  return root
}

async function renderHtml(html: string): Promise<HTMLCanvasElement> {
  const host = makeHost()
  host.innerHTML = html
  try {
    return await html2canvas(host, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    })
  } finally {
    host.remove()
  }
}

function remnantCellHtml(percent: number, mm: number): string {
  return `<span style="color:#0f766e;font-weight:600;">${formatPercent(percent)} · ${mm} мм</span>`
}

function patternHtml(pattern: PatternGroup, index: number, stockLength: number): string {
  const segments = pattern.blocks
    .map((block) => {
      const width = (block.consumed / stockLength) * 100
      const bg =
        block.role === 'plate' ? '#0f766e' : block.kind === 'pair' ? '#7c3aed' : '#1d4ed8'
      return `<div style="width:${width}%;background:${bg};color:#fff;font-size:10px;font-family:Consolas,monospace;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;">${escapeHtml(block.label)}</div>`
    })
    .join('')
  const remnantWidth = (pattern.remnant / stockLength) * 100
  const remnant =
    pattern.remnant > 0
      ? `<div style="width:${remnantWidth}%;background:repeating-linear-gradient(-45deg,#e2e8f0,#e2e8f0 4px,#f1f5f9 4px,#f1f5f9 8px);"></div>`
      : ''

  return `
    <div style="${shell};border:1px solid #334155;padding:10px 12px;margin:0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;font-size:12px;margin-bottom:8px;font-family:Consolas,monospace;">
        <strong style="letter-spacing:0.04em;">Схема ${index + 1} — ${pattern.count} ${tubesWord(pattern.count)}</strong>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <div style="border:1px solid #cbd5e1;background:#f8fafc;padding:4px 10px;text-align:right;line-height:1.25;">
            <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">занято</div>
            <div style="color:#475569;">${pattern.used} мм</div>
          </div>
          <div style="border:1px solid #99f6e4;background:#f0fdfa;padding:4px 10px;text-align:right;line-height:1.25;">
            <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">остаток</div>
            <div style="color:#0f766e;font-weight:600;">${formatPercent((pattern.remnant / stockLength) * 100)} · ${pattern.remnant} мм</div>
          </div>
        </div>
      </div>
      <div style="display:flex;height:28px;border:1px solid #64748b;overflow:hidden;background:#f8fafc;">${segments}${remnant}</div>
    </div>
  `
}

function remnantsTableHtml(
  rows: Array<{ index: number; count: number; remnant: number }>,
  stockLength: number,
  withHeader: boolean,
): string {
  const th =
    'border:1px solid #334155;padding:8px 10px;text-align:left;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;background:#0f172a;color:#e2e8f0;font-family:Consolas,monospace;'
  const td =
    'border:1px solid #94a3b8;padding:8px 10px;text-align:left;font-size:13px;font-family:Consolas,monospace;'

  const head = withHeader
    ? `<thead><tr>
        <th style="${th};width:20%;">Схема</th>
        <th style="${th};width:25%;">Труб, шт</th>
        <th style="${th};width:35%;">Остаток</th>
      </tr></thead>`
    : ''

  const body = rows
    .map(
      (row) => `<tr>
        <td style="${td}">${row.index + 1}</td>
        <td style="${td}">${row.count}</td>
        <td style="${td}">${remnantCellHtml((row.remnant / stockLength) * 100, row.remnant)}</td>
      </tr>`,
    )
    .join('')

  return `
    <div style="${shell}">
      <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
        ${head}
        <tbody>${body}</tbody>
      </table>
    </div>
  `
}

type PdfCursor = {
  pdf: jsPDF
  y: number
  margin: number
  contentWidth: number
  contentHeight: number
}

function canvasHeightMm(canvas: HTMLCanvasElement, widthMm: number): number {
  return (canvas.height * widthMm) / canvas.width
}

async function addBlock(cursor: PdfCursor, html: string, gapMm = 3) {
  const canvas = await renderHtml(html)
  let h = canvasHeightMm(canvas, cursor.contentWidth)

  if (h > cursor.contentHeight) {
    if (cursor.y > cursor.margin + 0.5) cursor.pdf.addPage()
    cursor.y = cursor.margin
    const fitH = cursor.contentHeight
    const fitW = (canvas.width * fitH) / canvas.height
    const x = cursor.margin + Math.max(0, (cursor.contentWidth - fitW) / 2)
    cursor.pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, cursor.y, fitW, fitH)
    cursor.pdf.addPage()
    cursor.y = cursor.margin
    return
  }

  if (cursor.y + h > cursor.margin + cursor.contentHeight) {
    cursor.pdf.addPage()
    cursor.y = cursor.margin
  }

  cursor.pdf.addImage(
    canvas.toDataURL('image/png'),
    'PNG',
    cursor.margin,
    cursor.y,
    cursor.contentWidth,
    h,
  )
  cursor.y += h + gapMm
}

/** Pack remnant rows into whole-table chunks that fit the remaining page. */
async function addRemnantsTable(
  cursor: PdfCursor,
  rows: Array<{ index: number; count: number; remnant: number }>,
  stockLength: number,
) {
  if (rows.length === 0) {
    await addBlock(
      cursor,
      `<div style="${shell};font-size:13px;padding:4px 0;">Остатков нет.</div>`,
    )
    return
  }

  let start = 0
  while (start < rows.length) {
    const spaceLeft = cursor.margin + cursor.contentHeight - cursor.y
    // Estimate ~9mm/row + 12mm header; refine by measuring
    let take = Math.max(1, Math.min(rows.length - start, Math.floor((spaceLeft - 8) / 9)))

    // Grow/shrink until chunk fits remaining space (or full page)
    let fitted = false
    while (!fitted && take >= 1) {
      const chunk = rows.slice(start, start + take)
      const html = remnantsTableHtml(chunk, stockLength, true)
      const canvas = await renderHtml(html)
      const h = canvasHeightMm(canvas, cursor.contentWidth)

      const fitsHere = cursor.y + h <= cursor.margin + cursor.contentHeight
      const fitsPage = h <= cursor.contentHeight

      if (fitsHere) {
        cursor.pdf.addImage(
          canvas.toDataURL('image/png'),
          'PNG',
          cursor.margin,
          cursor.y,
          cursor.contentWidth,
          h,
        )
        cursor.y += h + 3
        start += take
        fitted = true
      } else if (!fitsPage && take > 1) {
        take -= 1
      } else if (!fitsHere && cursor.y > cursor.margin + 0.5) {
        cursor.pdf.addPage()
        cursor.y = cursor.margin
        // retry same take on new page
      } else {
        // single row somehow taller than page — force place scaled
        cursor.pdf.addImage(
          canvas.toDataURL('image/png'),
          'PNG',
          cursor.margin,
          cursor.y,
          cursor.contentWidth,
          Math.min(h, cursor.contentHeight),
        )
        cursor.pdf.addPage()
        cursor.y = cursor.margin
        start += take
        fitted = true
      }
    }

    if (!fitted) {
      // safety
      start += 1
    }
  }
}

export async function downloadPlanPdf(plan: CuttingPlan, input: JobInput) {
  const title = plan.title || `Раскрой Ø${input.pipeDiameter} трубы`
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const margin = 12
  const cursor: PdfCursor = {
    pdf,
    y: margin,
    margin,
    contentWidth: pdf.internal.pageSize.getWidth() - margin * 2,
    contentHeight: pdf.internal.pageSize.getHeight() - margin * 2,
  }

  await addBlock(
    cursor,
    `
      <div style="${shell};border:2px solid #0f172a;padding:16px 18px;">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-end;">
          <div>
            <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;font-family:Consolas,monospace;margin-bottom:6px;">Карта раскроя</div>
            <div style="font-size:22px;font-weight:800;margin:0;">${escapeHtml(title)}</div>
          </div>
          <div style="text-align:right;font-family:Consolas,monospace;font-size:11px;color:#475569;line-height:1.55;">
            <div>Документ: раскрой</div>
            <div>${jobDiameters(input).length > 1 ? `Ø ${jobDiameters(input).join(', ')} мм` : `Ø ${input.pipeDiameter} мм`}</div>
          </div>
        </div>
        <div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
          <div style="border:1px solid #b45309;background:#fffbeb;padding:10px 12px;font-family:Consolas,monospace;">
            <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#b45309;margin-bottom:6px;">Количество труб</div>
            <div style="display:flex;align-items:baseline;gap:8px;min-height:34px;">
              <strong style="font-size:22px;color:#92400e;line-height:1;">${plan.barsCount}</strong>
              <span style="font-size:11px;color:#b45309;">шт</span>
            </div>
            <div style="min-height:18px;font-size:12px;color:#b45309;margin-top:2px;">${
              plan.twelveMeterCount > 0
                ? `${plan.cutBarsCount} раскрой + ${plan.twelveMeterCount} × 12 м`
                : '—'
            }</div>
          </div>
          <div style="border:1px solid #0f766e;background:#f0fdfa;padding:10px 12px;font-family:Consolas,monospace;">
            <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;margin-bottom:6px;">Польза</div>
            <div style="min-height:34px;display:flex;align-items:flex-end;">
              <strong style="font-size:22px;color:#0f766e;line-height:1;">${formatPercent(100 - plan.wastePercent)}</strong>
            </div>
            <div style="min-height:18px;font-size:12px;color:#64748b;opacity:0;">—</div>
          </div>
          <div style="border:1px solid #0f766e;background:#f0fdfa;padding:10px 12px;font-family:Consolas,monospace;">
            <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;margin-bottom:6px;">Остатки</div>
            <div style="min-height:34px;display:flex;align-items:flex-end;">
              <strong style="font-size:22px;color:#0f766e;line-height:1;">${formatPercent(plan.wastePercent)}</strong>
            </div>
            <div style="min-height:18px;font-size:12px;color:#64748b;margin-top:2px;">${plan.wasteMm} мм</div>
          </div>
        </div>
      </div>
    `,
    6,
  )

  const multiDiameter = jobDiameters(input).length > 1
  const pieces = input.pieces
    .map((piece) => {
      const name = piece.name.trim() ? ` (${escapeHtml(piece.name)})` : ''
      const d = pieceDiameter(piece, input)
      const dLabel = multiDiameter ? `Ø${d} · ` : ''
      return `<li style="margin:3px 0;font-family:Consolas,monospace;">${dLabel}${piece.quantity} шт × ${piece.length} мм${name}</li>`
    })
    .join('')

  await addBlock(
    cursor,
    `
      <div style="${shell};border:1px solid #cbd5e1;padding:12px 14px;">
        <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;font-family:Consolas,monospace;margin-bottom:8px;">Позиции заказа</div>
        <ul style="margin:0;padding-left:18px;font-size:13px;">${pieces}</ul>
      </div>
    `,
    6,
  )

  await addBlock(
    cursor,
    `<div style="${shell};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;font-family:Consolas,monospace;padding:2px 0;">Схемы раскроя</div>`,
    2,
  )

  for (const [index, pattern] of plan.patterns.entries()) {
    await addBlock(cursor, patternHtml(pattern, index, input.stockLength), 3)
  }

  await addBlock(
    cursor,
    `<div style="${shell};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;font-family:Consolas,monospace;padding:6px 0 2px;">Остатки по схемам</div>`,
    2,
  )

  const remnantRows = plan.patterns
    .map((pattern, index) => ({
      index,
      count: pattern.count,
      remnant: pattern.remnant,
    }))
    .filter((row) => row.remnant > 0)

  await addRemnantsTable(cursor, remnantRows, input.stockLength)

  const dTag = jobDiameters(input).length === 1 ? jobDiameters(input)[0] : 'multi'
  pdf.save(`raskroy-d${dTag}-${plan.barsCount}tubes.pdf`)
}

const COST_MODE_LABEL: Record<CostInput['sourceMode'], string> = {
  simple: 'Простой',
  positions: 'По позициям',
  fromCutting: 'Из раскроя',
}

export async function downloadCostPdf(estimate: CostEstimate, input: CostInput) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const margin = 12
  const cursor: PdfCursor = {
    pdf,
    y: margin,
    margin,
    contentWidth: pdf.internal.pageSize.getWidth() - margin * 2,
    contentHeight: pdf.internal.pageSize.getHeight() - margin * 2,
  }

  const pdfPositions =
    input.sourceMode === 'positions'
      ? input.manualPositions
      : input.sourceMode === 'fromCutting'
        ? input.cuttingPositions
        : []
  const diameters =
    input.sourceMode === 'simple'
      ? [input.pipeDiameterMm]
      : [...new Set(pdfPositions.map((p) => p.pipeDiameterMm).filter((d) => d > 0))].sort(
          (a, b) => a - b,
        )
  const diameterLabel =
    diameters.length === 0
      ? '—'
      : diameters.length === 1
        ? `Ø ${diameters[0]} мм`
        : `Ø ${diameters.join(', ')} мм`

  await addBlock(
    cursor,
    `
      <div style="${shell};border:2px solid #0f172a;padding:16px 18px;">
        <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-end;">
          <div>
            <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;font-family:Consolas,monospace;margin-bottom:6px;">Смета</div>
            <div style="font-size:22px;font-weight:800;margin:0;">Стоимость изготовления</div>
          </div>
          <div style="text-align:right;font-family:Consolas,monospace;font-size:11px;color:#475569;line-height:1.55;">
            <div>Документ: смета</div>
            <div>${escapeHtml(diameterLabel)}</div>
            <div>Режим: ${escapeHtml(COST_MODE_LABEL[input.sourceMode])}</div>
          </div>
        </div>
        <div style="margin-top:14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
          <div style="border:1px solid #b45309;background:#fffbeb;padding:10px 12px;font-family:Consolas,monospace;">
            <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#b45309;margin-bottom:6px;">Итого</div>
            <div style="display:flex;align-items:baseline;gap:8px;min-height:34px;">
              <strong style="font-size:22px;color:#92400e;line-height:1;">${escapeHtml(formatRub(estimate.totalRub))}</strong>
            </div>
            <div style="min-height:18px;font-size:12px;color:#b45309;margin-top:2px;">${
              estimate.paintAreaM2 > 0 ? `${estimate.paintAreaM2.toFixed(1)} м² окраски` : '—'
            }</div>
          </div>
          <div style="border:1px solid #0f766e;background:#f0fdfa;padding:10px 12px;font-family:Consolas,monospace;">
            <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;margin-bottom:6px;">Металл</div>
            <div style="min-height:34px;display:flex;align-items:flex-end;">
              <strong style="font-size:22px;color:#0f766e;line-height:1;">${escapeHtml(formatRub(estimate.metalRub))}</strong>
            </div>
            <div style="min-height:18px;font-size:12px;color:#64748b;margin-top:2px;">${
              estimate.metalMassTon > 0 ? `${estimate.metalMassTon.toFixed(3)} т` : '—'
            }</div>
          </div>
          <div style="border:1px solid #0f766e;background:#f0fdfa;padding:10px 12px;font-family:Consolas,monospace;">
            <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;margin-bottom:6px;">Окраска</div>
            <div style="min-height:34px;display:flex;align-items:flex-end;">
              <strong style="font-size:22px;color:#0f766e;line-height:1;">${escapeHtml(formatRub(estimate.paintMaterialRub + estimate.paintLaborRub))}</strong>
            </div>
            <div style="min-height:18px;font-size:12px;color:#64748b;margin-top:2px;">${
              estimate.paintKg > 0 ? `${estimate.paintKg.toFixed(1)} кг эмали` : '—'
            }</div>
          </div>
        </div>
      </div>
    `,
    6,
  )

  const th =
    'border:1px solid #334155;padding:8px 10px;text-align:left;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;background:#0f172a;color:#e2e8f0;font-family:Consolas,monospace;'
  const td =
    'border:1px solid #94a3b8;padding:8px 10px;text-align:left;font-size:13px;font-family:Consolas,monospace;'
  const tdRub =
    'border:1px solid #94a3b8;padding:8px 10px;text-align:right;font-size:13px;font-family:Consolas,monospace;white-space:nowrap;'

  const rows = estimate.lines
    .map(
      (line) => `<tr>
        <td style="${td}">${escapeHtml(line.label)}</td>
        <td style="${td};color:#64748b;">${escapeHtml(line.detail)}</td>
        <td style="${tdRub}">${escapeHtml(formatRub(line.rub))}</td>
      </tr>`,
    )
    .join('')

  await addBlock(
    cursor,
    `
      <div style="${shell}">
        <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;font-family:Consolas,monospace;margin-bottom:8px;">Статьи</div>
        <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
          <thead>
            <tr>
              <th style="${th};width:28%;">Статья</th>
              <th style="${th};width:44%;">Детали</th>
              <th style="${th};width:28%;text-align:right;">Сумма</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr>
              <td style="${td};border-top:2px solid #334155;" colspan="2"><strong>Стоимость изготовления</strong></td>
              <td style="${tdRub};border-top:2px solid #334155;"><strong>${escapeHtml(formatRub(estimate.totalRub))}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  )

  pdf.save(`smeta-${input.sourceMode}.pdf`)
}
