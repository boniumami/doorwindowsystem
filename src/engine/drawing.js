// import { jsPDF } from 'jspdf'
import { SERIES, typeMeta, typeName } from './catalog.js'

const INK = '#1b2838'
const MUTED = '#5b6b7c'
const FRAME = '#2c3d4f'
const SASH = '#1f6f8b'
const GLASS_OPEN = '#c5e0ea'
const GLASS_FIX = '#e4edf2'
const DASH = '#1a5f78'

function n(v, fallback) {
  const x = Number(v)
  return Number.isFinite(x) ? x : fallback
}

function txt(x, y, content, size = 13, anchor = 'middle', fill = MUTED) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-size="${size}" font-family="Noto Sans SC, Source Han Sans SC, Microsoft YaHei, sans-serif">${content}</text>`
}

function rect(x, y, w, h, stroke, fill, sw = 2) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`
}

function sashBox(cell, ox, oy, ov) {
  let x = ox + cell.x - ov
  let y = oy + cell.y - ov
  let w = cell.w + 2 * ov
  let h = cell.h + 2 * ov
  if (cell.meet === 'center') {
    h = cell.h + 2 * ov
    y = oy + cell.y - ov
    if (cell.hinge === 'right') {
      x = ox + cell.x
      w = cell.w + ov
    } else {
      x = ox + cell.x - ov
      w = cell.w + ov
    }
  }
  return { x, y, w, h }
}

function openingSymbol(x, y, w, h, hinge, tilt) {
  const p = Math.min(w, h) * 0.1
  const ix = x + p
  const iy = y + p
  const iw = Math.max(8, w - p * 2)
  const ih = Math.max(8, h - p * 2)
  let s = ''
  if (hinge === 'left') {
    s += `<polygon points="${ix},${iy} ${ix},${iy + ih} ${ix + iw},${iy + ih / 2}" fill="none" stroke="${DASH}" stroke-width="2.2" stroke-dasharray="10 6" />`
  } else if (hinge === 'right') {
    s += `<polygon points="${ix + iw},${iy} ${ix + iw},${iy + ih} ${ix},${iy + ih / 2}" fill="none" stroke="${DASH}" stroke-width="2.2" stroke-dasharray="10 6" />`
  } else if (hinge === 'top') {
    s += `<polygon points="${ix},${iy} ${ix + iw},${iy} ${ix + iw / 2},${iy + ih}" fill="none" stroke="${DASH}" stroke-width="2.2" stroke-dasharray="10 6" />`
  }
  if (tilt) {
    const mid = x + w / 2
    const top = y + Math.min(18, h * 0.08)
    s += `<polyline points="${mid - 22},${top + 14} ${mid},${top} ${mid + 22},${top + 14}" fill="none" stroke="${DASH}" stroke-width="2" />`
  }
  return s
}

function hingeMarks(x, y, w, h, hinge) {
  const dots = []
  if (hinge === 'left') {
    dots.push([x + 5, y + h * 0.18], [x + 5, y + h * 0.5], [x + 5, y + h * 0.82])
  } else if (hinge === 'right') {
    dots.push([x + w - 5, y + h * 0.18], [x + w - 5, y + h * 0.5], [x + w - 5, y + h * 0.82])
  } else if (hinge === 'top') {
    dots.push([x + w * 0.18, y + 5], [x + w * 0.5, y + 5], [x + w * 0.82, y + 5])
  }
  return dots.map(([cx, cy]) => `<rect x="${cx - 4}" y="${cy - 7}" width="8" height="14" rx="1" fill="${FRAME}" />`).join('')
}

function handleMark(x, y, w, h, hinge) {
  if (hinge === 'top') {
    return `<rect x="${x + w / 2 - 16}" y="${y + h - 14}" width="32" height="8" rx="2" fill="${SASH}" />`
  }
  const hx = hinge === 'left' ? x + w - 12 : x + 12
  return `<rect x="${hx - 4}" y="${y + h * 0.46}" width="8" height="28" rx="2" fill="${SASH}" />`
}

function fixedGlass(x, y, w, h) {
  const p = Math.min(w, h) * 0.16
  return (
    rect(x, y, w, h, '#8ea0ae', GLASS_FIX, 1.2) +
    `<line x1="${x + p}" y1="${y + p}" x2="${x + w - p}" y2="${y + h - p}" stroke="#9aaebc" stroke-width="1.4" />` +
    `<line x1="${x + w - p}" y1="${y + p}" x2="${x + p}" y2="${y + h - p}" stroke="#9aaebc" stroke-width="1.4" />`
  )
}

function dimH(x, y1, y2, label) {
  const mid = (y1 + y2) / 2
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${MUTED}" stroke-width="1" />
    <line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}" stroke="${MUTED}" stroke-width="1" />
    <line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}" stroke="${MUTED}" stroke-width="1" />
    ${txt(x - 8, mid + 4, label, 12, 'end', INK)}
  `
}

function dimW(y, x1, x2, label) {
  const mid = (x1 + x2) / 2
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${MUTED}" stroke-width="1" />
    <line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}" stroke="${MUTED}" stroke-width="1" />
    <line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}" stroke="${MUTED}" stroke-width="1" />
    ${txt(mid, y + 16, label, 12, 'middle', INK)}
  `
}

function bayCaption(win) {
  const meta = typeMeta(win.type)
  if (meta.split === 'two') return `左右两格 左格 ${n(win.leftBayW, 700)}`
  if (win.bayLayout === 'center-open') return '中开两侧固'
  if (win.bayLayout === 'sides-open') return '两侧开中间固'
  return '不分格'
}

function buildElevation(win, layout) {
  const series = SERIES[win.seriesId] || SERIES['70']
  const Wf = layout?.Wf || Math.max(400, n(win.openingW, 1500) - 2 * n(win.installGap, 15))
  const Hf = layout?.Hf || Math.max(400, n(win.openingH, 1500) - 2 * n(win.installGap, 15))
  const ff = layout?.frameFace || series.frameFace
  const sf = layout?.sashFace || series.sashFace
  const ov = layout?.sashOverlap || series.sashOverlap
  const tf = layout?.transomFace || series.transomFace
  const innerX = ff
  const innerY = ff
  const type = win.type
  const title = typeName(type)

  let inner = rect(0, 0, Wf, Hf, FRAME, '#cfd6dc', 3)
  inner += rect(innerX, innerY, Wf - 2 * ff, Hf - 2 * ff, FRAME, '#f7fafc', 1.2)

  const cells = layout?.cells?.length
    ? layout.cells
    : [{ kind: 'fixed', w: Wf - 2 * ff, h: Hf - 2 * ff, x: 0, y: 0, label: '固定玻璃' }]

  for (const m of layout?.mullions || []) {
    if (m.kind === 'mullion') {
      inner += rect(innerX + (m.x ?? 0), innerY, m.w || tf, Hf - 2 * ff, FRAME, '#b7c2cb', 1.6)
    } else {
      const mx = innerX + (m.x ?? 0)
      const my = innerY + (m.y ?? 0)
      const mw = m.w ?? Wf - 2 * ff
      inner += rect(mx, my, mw, m.h || tf, FRAME, '#b7c2cb', 1.6)
    }
  }

  for (const cell of cells) {
    if (cell.kind === 'sash') {
      const box = sashBox(cell, innerX, innerY, ov)
      const gx = box.x + sf
      const gy = box.y + sf
      const gw = Math.max(4, box.w - 2 * sf)
      const gh = Math.max(4, box.h - 2 * sf)
      inner += rect(box.x, box.y, box.w, box.h, SASH, '#9bb8c6', 2.4)
      inner += rect(gx, gy, gw, gh, '#7a98a8', GLASS_OPEN, 1)
      inner += openingSymbol(gx, gy, gw, gh, cell.hinge, cell.tilt)
      inner += hingeMarks(box.x, box.y, box.w, box.h, cell.hinge)
      inner += handleMark(box.x, box.y, box.w, box.h, cell.hinge)
      inner += txt(gx + gw / 2, gy + gh / 2 + 6, cell.label, 13, 'middle', INK)
    } else {
      const x = innerX + (cell.x || 0)
      const y = innerY + (cell.y || 0)
      inner += fixedGlass(x, y, cell.w, cell.h)
      inner += txt(x + cell.w / 2, y + cell.h / 2 + 5, cell.label, 13, 'middle', INK)
    }
  }

  const left = -78
  let extraH = ''
  if ((layout?.mullions || []).length && layout.transomH) {
    extraH += dimH(left + 28, innerY, innerY + layout.transomH, `${layout.transomH}`)
    extraH += dimH(left + 28, innerY + layout.transomH + tf, Hf - ff, `${layout.bottomH}`)
  }

  const vbX = -90
  const vbY = -36
  const vbW = Wf + 120
  const vbH = Hf + 92
  const body = `
    ${txt(Wf / 2, -14, `室内立面 · ${title}`, 16, 'middle', INK)}
    ${inner}
    ${dimW(Hf + 18, 0, Wf, `框宽 ${Wf}`)}
    ${dimH(left + 52, 0, Hf, `框高 ${Hf}`)}
    ${extraH}
    ${txt(Wf / 2, Hf + 48, `洞口 ${n(win.openingW, 0)} × ${n(win.openingH, 0)} · ${series.name} · ${bayCaption(win)}`, 12, 'middle', MUTED)}
  `
  return { Wf, Hf, vbX, vbY, vbW, vbH, body, title, series }
}

export function elevationSvg(win, layout) {
  const s = buildElevation(win, layout)
  return `<svg class="elev-svg" viewBox="${s.vbX} ${s.vbY} ${s.vbW} ${s.vbH}" role="img" aria-label="${s.title}室内立面">${s.body}</svg>`
}

export function openingLegend(type, bayLayout) {
  const bay =
    bayLayout === 'center-open'
      ? '宽洞口分格：中间开启，左右固定，两根竖中挺。'
      : bayLayout === 'sides-open'
        ? '宽洞口分格：左右开启，中间固定，两根竖中挺。'
        : ''
  let base = ''
  if (type === 'fixed') base = '固定玻璃，无开启扇。虚线交叉为固定符号。'
  else if (type === 'in-single') base = '上开下固：上部单扇内开，中横，下部固定。默认上扇内空 450 mm。'
  else if (type === 'in-double') base = '上开下固：上部双扇内开对开，中横，下部固定。'
  else if (type === 'awning') base = '上开下固：上部上悬扇，中横，下部固定。默认上扇内空 450 mm。'
  else if (type === 'casement-single') base = '单扇内开内倒。侧开三角 + 顶部内倒符号。'
  else if (type === 'casement-double') base = '双扇内开内倒对开，开扇格内无竖中挺。'
  else if (type === 'top-fixed-casement') base = '上亮子固定，中横，下部单扇内开内倒。'
  else if (type === 'top-fixed-double') base = '上亮子固定，中横，下部双扇内开内倒。'
  else if (type === 'left-fix-right-open') base = '左右两格，竖中挺分隔：左固定，右整格内开。'
  else if (type === 'left-open-right-fix') base = '左右两格，竖中挺分隔：左整格内开，右固定。'
  else if (type === 'left-fix-right-top-open') base = '左右两格：左整格固定；右格上开下固，仅右侧有中横。'
  else if (type === 'left-top-open-right-fix') base = '左右两格：左格上开下固，仅左侧有中横；右整格固定。'
  return [base, bay].filter(Boolean).join(' ')
}

function xmlEsc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function filePart(name) {
  return String(name || '樘窗').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}

function stamp() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function sheetTitle(win) {
  return [win?.name, win?.modelName].filter(Boolean).join('+') || '樘窗图纸'
}

export function drawingSheetSvg(win, layout, project = {}) {
  const s = buildElevation(win, layout)
  const pageW = 420
  const pageH = 297
  const margin = 10
  const titleH = 28
  const innerW = pageW - margin * 2
  const innerH = pageH - margin * 2 - titleH - 18
  const scale = Math.min(innerW / s.vbW, innerH / s.vbH)
  const drawW = s.vbW * scale
  const drawH = s.vbH * scale
  const ox = margin + (innerW - drawW) / 2
  const oy = margin + titleH + (innerH - drawH) / 2
  const loc = xmlEsc(win.name || '')
  const model = xmlEsc(win.modelName || '')
  const proj = xmlEsc(project.name || '')
  const customer = xmlEsc(project.customer || '')
  const qty = win.qty || 1
  const note = xmlEsc(openingLegend(win.type, win.bayLayout))

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}">
  <rect x="0" y="0" width="${pageW}" height="${pageH}" fill="#fff"/>
  <rect x="${margin}" y="${margin}" width="${innerW}" height="${pageH - margin * 2}" fill="none" stroke="${FRAME}" stroke-width="0.6"/>
  <rect x="${margin}" y="${margin}" width="${innerW}" height="${titleH}" fill="#f4f7fa" stroke="${FRAME}" stroke-width="0.4"/>
  ${txt(pageW / 2, margin + 12, '铝合金门窗室内立面图', 8, 'middle', INK)}
  ${txt(pageW / 2, margin + 22, `${loc}${model ? ' · ' + model : ''} · ${s.title} · ${qty} 樘`, 5.5, 'middle', MUTED)}
  <g transform="translate(${ox} ${oy}) scale(${scale}) translate(${-s.vbX} ${-s.vbY})">
    ${s.body}
  </g>
  <rect x="${margin}" y="${pageH - margin - 16}" width="${innerW}" height="16" fill="#f4f7fa" stroke="${FRAME}" stroke-width="0.4"/>
  ${txt(margin + 4, pageH - margin - 6, `工程 ${proj}  客户 ${customer}  系列 ${s.series.name}  洞口 ${n(win.openingW, 0)}×${n(win.openingH, 0)}  ${bayCaption(win)}  ${stamp()}`, 4.2, 'start', INK)}
  ${txt(margin + 4, pageH - margin - 1, note, 3.6, 'start', MUTED)}
</svg>`
}

function svgToPng(svgText, widthPx, heightPx) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = widthPx
      canvas.height = heightPx
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, widthPx, heightPx)
      ctx.drawImage(img, 0, 0, widthPx, heightPx)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图纸渲染失败'))
    }
    img.src = url
  })
}

const { jsPDF } = window.jspdf;
async function drawingsToPdf(project, rows, filename, onProgress) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  const pageW = 420
  const pageH = 297
  const pxW = 2480
  const pxH = 1754
  for (let i = 0; i < rows.length; i++) {
    if (onProgress) onProgress(i + 1, rows.length)
    const svg = drawingSheetSvg(rows[i].win, rows[i].calc.layout, project)
    const png = await svgToPng(svg, pxW, pxH)
    if (i > 0) pdf.addPage('a3', 'landscape')
    pdf.addImage(png, 'PNG', 0, 0, pageW, pageH)
  }
  pdf.save(filename)
}

export async function downloadWindowDrawing(project, row, onProgress) {
  await drawingsToPdf(project, [row], `${filePart(sheetTitle(row.win))}-立面图.pdf`, onProgress)
}

export async function downloadAllDrawings(project, result, onProgress) {
  const rows = (result.windows || []).filter((r) => r.calc?.ok)
  if (!rows.length) return
  await drawingsToPdf(project, rows, `${filePart(project.name)}-立面图纸.pdf`, onProgress)
}
