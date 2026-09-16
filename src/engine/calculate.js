import { SERIES, GLASS, profileCode, typeName, typeMeta } from './catalog.js'

const MIN_OPENING = 400
const MIN_FRAME = 300
const MIN_BOTTOM = 350
const MIN_GLASS = 180
const FOAM_M_PER_CAN = 12
const SEALANT_M_PER_TUBE = 10
const PLATE_SPACING = 400

function roundMm(n) {
  return Math.round(n)
}

function money(n) {
  return Math.round(n * 100) / 100
}

function m3(n) {
  return Math.round(n * 1000) / 1000
}

function m4(n) {
  return Math.round(n * 10000) / 10000
}

function tiltTurnCode(sashH) {
  if (sashH >= 1600) return 'HW-HEAVY'
  if (sashH >= 1200) return 'HW-PLUS'
  return 'HW-STD'
}

function hardwareForSash(winType, sashH) {
  const kind = typeMeta(winType).hardware
  if (kind === 'casement') return { set: 'HW-CASE', handle: true, remark: '侧开合页' }
  if (kind === 'awning') return { set: 'HW-AWN', handle: true, remark: '上悬撑挡' }
  if (kind === 'tilt-turn') return { set: tiltTurnCode(sashH), handle: true, remark: `内开内倒 扇高 ${sashH} mm` }
  return null
}

function platesOnSide(len) {
  return Math.max(2, Math.ceil(len / PLATE_SPACING))
}

function item(base, extra) {
  return { pieces: 0, lengthMm: 0, widthMm: 0, heightMm: 0, remark: '', ...base, ...extra }
}

function glassSize(innerW, innerH, series) {
  return {
    w: roundMm(innerW + 2 * series.glassInset - 2 * series.glassGap),
    h: roundMm(innerH + 2 * series.glassInset - 2 * series.glassGap)
  }
}

function sashOuter(cell, series) {
  const ov = series.sashOverlap
  if (cell.meet === 'center') {
    return {
      w: cell.w + ov,
      h: roundMm(cell.h + 2 * ov)
    }
  }
  return {
    w: roundMm(cell.w + 2 * ov),
    h: roundMm(cell.h + 2 * ov)
  }
}

function pairSashOuters(leftCell, rightCell, series) {
  const ov = series.sashOverlap
  const totalW = roundMm(leftCell.w + rightCell.w + 2 * ov)
  const leftW = Math.floor(totalW / 2)
  const h = roundMm(leftCell.h + 2 * ov)
  return [
    { w: leftW, h, label: leftCell.label, meet: 'center' },
    { w: totalW - leftW, h, label: rightCell.label, meet: 'center' }
  ]
}

const MIN_BAY = 280

function splitTwoBays(innerW, series, leftBayW) {
  const mf = series.mullionFace
  const avail = innerW - mf
  const errors = []
  const warnings = []
  if (avail < MIN_BAY * 2) {
    errors.push('洞口宽度不足以做左右两格，请加大洞口')
    return { bays: [], mullionXs: [], errors, warnings }
  }
  let left = roundMm(Number(leftBayW) > 0 ? Number(leftBayW) : avail / 2)
  const maxLeft = avail - MIN_BAY
  if (left < MIN_BAY) {
    left = MIN_BAY
    warnings.push(`左格过窄，已调整为 ${left} mm`)
  }
  if (left > maxLeft) {
    left = maxLeft
    warnings.push(`左格过宽，已调整为 ${left} mm`)
  }
  const right = avail - left
  return {
    bays: [
      { id: 'left', x: 0, w: left },
      { id: 'right', x: left + mf, w: right }
    ],
    mullionXs: [left],
    errors,
    warnings
  }
}

function splitBays(innerW, series, bayLayout, sideBayW) {
  if (!bayLayout || bayLayout === 'none') {
    return { bays: [{ id: 'full', x: 0, w: innerW }], mullionXs: [], errors: [], warnings: [] }
  }
  const mf = series.mullionFace
  const avail = innerW - 2 * mf
  const errors = []
  const warnings = []
  if (avail < MIN_BAY * 3) {
    errors.push('洞口宽度不足以做左中右三格，请改用「不分格」或加大洞口')
    return { bays: [{ id: 'full', x: 0, w: innerW }], mullionXs: [], errors, warnings }
  }
  let side = roundMm(Number(sideBayW) > 0 ? Number(sideBayW) : avail / 3)
  const maxSide = Math.floor((avail - MIN_BAY) / 2)
  if (side < MIN_BAY) {
    side = MIN_BAY
    warnings.push(`两侧格过窄，已调整为 ${side} mm`)
  }
  if (side > maxSide) {
    side = maxSide
    warnings.push(`两侧格过宽，已调整为 ${side} mm`)
  }
  const center = avail - 2 * side
  return {
    bays: [
      { id: 'left', x: 0, w: side },
      { id: 'center', x: side + mf, w: center },
      { id: 'right', x: side + mf + center + mf, w: side }
    ],
    mullionXs: [side, side + mf + center],
    errors,
    warnings
  }
}

function bayIsOpen(bayLayout, bayId) {
  if (!bayLayout || bayLayout === 'none' || bayId === 'full') return true
  if (bayLayout === 'center-open') return bayId === 'center'
  if (bayLayout === 'sides-open') return bayId === 'left' || bayId === 'right'
  return true
}

function pushOpening(cells, type, bayLayout, bayId, x, y, w, h) {
  const meta = typeMeta(type)
  const tilt = meta.hardware === 'tilt-turn'
  const pair = meta.sash >= 2 && (bayId === 'full' || (bayLayout === 'center-open' && bayId === 'center'))
  const pos = bayId === 'left' ? '左' : bayId === 'right' ? '右' : bayId === 'center' ? '中' : ''
  const row = y > 0 ? '下' : meta.transom ? '上' : ''
  if (pair) {
    const leftW = Math.floor(w / 2)
    const rightW = w - leftW
    cells.push({ kind: 'sash', w: leftW, h, x, y, meet: 'center', hinge: 'left', tilt, label: `左${row}开启扇` })
    cells.push({ kind: 'sash', w: rightW, h, x: x + leftW, y, meet: 'center', hinge: 'right', tilt, label: `右${row}开启扇` })
    return
  }
  const hinge = meta.hardware === 'awning' ? 'top' : bayId === 'right' ? 'right' : 'left'
  const kindName = meta.hardware === 'awning' ? '悬扇' : '开启扇'
  cells.push({ kind: 'sash', w, h, x, y, hinge, tilt, label: `${pos}${row}${kindName}` || kindName })
}

function layoutWindow(win, series) {
  const warnings = []
  const errors = []
  const openingW = Number(win.openingW)
  const openingH = Number(win.openingH)
  const gap = Number(win.installGap)
  if (!Number.isFinite(openingW) || !Number.isFinite(openingH)) {
    errors.push('洞口尺寸无效')
  }
  if (!Number.isFinite(gap) || gap < 0) {
    errors.push('安装间隙无效')
  }
  const Wf = roundMm(openingW - 2 * gap)
  const Hf = roundMm(openingH - 2 * gap)

  if (Number.isFinite(openingW) && Number.isFinite(openingH) && (openingW < MIN_OPENING || openingH < MIN_OPENING)) {
    errors.push(`洞口尺寸需至少 ${MIN_OPENING} mm`)
  }
  if (Number.isFinite(Wf) && Number.isFinite(Hf) && (Wf < MIN_FRAME || Hf < MIN_FRAME)) {
    errors.push('扣除安装间隙后框外沿过小')
  }

  const innerW = Wf - 2 * series.frameFace
  const innerH = Hf - 2 * series.frameFace
  if (innerW < 200 || innerH < 200) errors.push('框内空过小，无法布置窗格')

  const meta = typeMeta(win.type)
  const twoSplit = meta.split === 'two'
  const needsTransom = !!meta.transom
  const sashOnTop = win.type === 'in-single' || win.type === 'in-double' || win.type === 'awning'
  const sashOnBottom = win.type === 'top-fixed-casement' || win.type === 'top-fixed-double'
  let transomH = roundMm(Number(win.transomH) || 450)
  let bottomH = innerH
  let topH = 0

  if (needsTransom && errors.length === 0) {
    const maxTransom = innerH - MIN_BOTTOM - series.transomFace
    if (maxTransom < 200) {
      errors.push('洞口高度不足以布置上格与下格')
    } else if (transomH > maxTransom) {
      transomH = maxTransom
      warnings.push(`上格内空过高，已调整为 ${transomH} mm`)
    } else if (transomH < 200) {
      transomH = 200
      warnings.push('上格内空过低，已调整为 200 mm')
    }
    topH = transomH
    bottomH = innerH - transomH - series.transomFace
  }

  const bayLayout = twoSplit ? 'none' : win.bayLayout || 'none'
  const split = twoSplit
    ? splitTwoBays(innerW, series, win.leftBayW)
    : splitBays(innerW, series, bayLayout, win.sideBayW)
  errors.push(...split.errors)
  warnings.push(...split.warnings)

  const cells = []
  const mullions = []

  if (errors.length) {
    return { Wf, Hf, innerW, innerH, cells, mullions, transomH, bayLayout, errors, warnings }
  }

  const tf = series.transomFace
  const mf = series.mullionFace

  for (const mx of split.mullionXs) {
    mullions.push({
      kind: 'mullion',
      length: roundMm(innerH + 2 * series.insert),
      x: mx,
      y: 0,
      w: mf,
      h: innerH,
      remark: '竖中挺 插接框槽'
    })
  }

  const openBayId =
    win.type === 'left-fix-right-open' || win.type === 'left-fix-right-top-open'
      ? 'right'
      : win.type === 'left-open-right-fix' || win.type === 'left-top-open-right-fix'
        ? 'left'
        : null

  if (twoSplit) {
    for (const bay of split.bays) {
      const openSide = bay.id === openBayId
      if (needsTransom && openSide) {
        mullions.push({
          kind: 'transom',
          length: roundMm(bay.w + 2 * series.insert),
          x: bay.x,
          y: topH,
          w: bay.w,
          h: tf,
          remark: '中横 插接框槽'
        })
        cells.push({ kind: 'sash', w: bay.w, h: topH, x: bay.x, y: 0, hinge: bay.id === 'right' ? 'right' : 'left', label: `${bay.id === 'right' ? '右' : '左'}上开启扇` })
        cells.push({ kind: 'fixed', w: bay.w, h: bottomH, x: bay.x, y: topH + tf, label: `${bay.id === 'right' ? '右' : '左'}下固定玻璃` })
      } else {
        const label = openSide ? `${bay.id === 'right' ? '右' : '左'}开启扇` : `${bay.id === 'right' ? '右' : '左'}固定玻璃`
        if (openSide) {
          cells.push({ kind: 'sash', w: bay.w, h: innerH, x: bay.x, y: 0, hinge: bay.id === 'right' ? 'right' : 'left', label })
        } else {
          cells.push({ kind: 'fixed', w: bay.w, h: innerH, x: bay.x, y: 0, label })
        }
      }
    }
  } else {
    if (needsTransom) {
      for (const bay of split.bays) {
        mullions.push({
          kind: 'transom',
          length: roundMm(bay.w + 2 * series.insert),
          x: bay.x,
          y: topH,
          w: bay.w,
          h: tf,
          remark: '中横 插接框槽'
        })
      }
    }

    for (const bay of split.bays) {
      const open = bayIsOpen(bayLayout, bay.id) && win.type !== 'fixed'
      if (!needsTransom) {
        if (open) pushOpening(cells, win.type, bayLayout, bay.id, bay.x, 0, bay.w, innerH)
        else cells.push({ kind: 'fixed', w: bay.w, h: innerH, x: bay.x, y: 0, label: '固定玻璃' })
      } else {
        if (open && sashOnTop) pushOpening(cells, win.type, bayLayout, bay.id, bay.x, 0, bay.w, topH)
        else cells.push({ kind: 'fixed', w: bay.w, h: topH, x: bay.x, y: 0, label: sashOnBottom ? '上亮子' : '上固定' })
        if (open && sashOnBottom) pushOpening(cells, win.type, bayLayout, bay.id, bay.x, topH + tf, bay.w, bottomH)
        else cells.push({ kind: 'fixed', w: bay.w, h: bottomH, x: bay.x, y: topH + tf, label: '下固定玻璃' })
      }
    }
  }

  return {
    Wf,
    Hf,
    innerW,
    innerH,
    cells,
    mullions,
    transomH,
    bottomH,
    bayLayout,
    leftBayW: twoSplit ? split.bays[0]?.w : 0,
    sideBayW: !twoSplit && bayLayout !== 'none' ? split.bays[0]?.w : 0,
    frameFace: series.frameFace,
    sashFace: series.sashFace,
    sashOverlap: series.sashOverlap,
    transomFace: series.transomFace,
    mullionFace: series.mullionFace,
    errors,
    warnings
  }
}

function pushProfile(items, mat, lengthMm, pieces, remark) {
  if (pieces <= 0 || lengthMm <= 0) return
  items.push(
    item(mat, {
      spec: `${lengthMm} mm`,
      lengthMm,
      pieces,
      perWindowQty: m3((lengthMm / 1000) * pieces),
      remark
    })
  )
}

function pushQty(items, mat, qty, remark, spec) {
  if (qty <= 0) return
  items.push(
    item(mat, {
      spec: spec || mat.spec,
      pieces: mat.integer ? Math.round(qty) : 0,
      perWindowQty: mat.integer ? qty : m3(qty),
      remark
    })
  )
}

export function calculateWindow(win, catalog) {
  const mats = catalog
  const series = SERIES[win.seriesId]
  const glass = GLASS.find((g) => g.id === win.glassId) || GLASS[0]
  if (!series) {
    return { ok: false, errors: ['未知型材系列'], warnings: [], items: [], layout: null }
  }

  const layout = layoutWindow(win, series)
  if (layout.errors.length) {
    return { ok: false, errors: layout.errors, warnings: layout.warnings, items: [], layout }
  }

  const items = []
  const frame = mats[profileCode(win.seriesId, 'FRAME')]
  const sashMat = mats[profileCode(win.seriesId, 'SASH')]
  const mullionMat = mats[profileCode(win.seriesId, 'MULLION')]
  const beadMat = mats[profileCode(win.seriesId, 'BEAD')]
  const glassMat = mats[`GLASS-${glass.id}`]

  pushProfile(items, frame, layout.Hf, 2, `边框竖料 45° 外沿高 ${layout.Hf}`)
  pushProfile(items, frame, layout.Wf, 2, `边框横料 45° 外沿宽 ${layout.Wf}`)

  for (const m of layout.mullions) {
    pushProfile(items, mullionMat, m.length, 1, m.remark)
  }

  const sashes = []
  const glasses = []

  const cells = layout.cells
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    if (cell.kind !== 'sash') {
      const g = glassSize(cell.w, cell.h, series)
      glasses.push({ ...g, label: `${cell.label}` })
      continue
    }
    const next = cells[i + 1]
    let pair = null
    if (cell.meet === 'center' && next?.kind === 'sash' && next.meet === 'center') {
      pair = pairSashOuters(cell, next, series)
      i += 1
    }
    const cuts = pair || [{ ...sashOuter(cell, series), label: cell.label, meet: cell.meet }]
    for (const s of cuts) {
      sashes.push(s)
      const meetNote = s.meet === 'center' ? '对开碰头' : '搭接框/中挺'
      pushProfile(items, sashMat, s.h, 2, `${s.label} 竖料 45° ${s.w}×${s.h} ${meetNote}`)
      pushProfile(items, sashMat, s.w, 2, `${s.label} 横料 45° ${s.w}×${s.h} ${meetNote}`)
      const g = glassSize(s.w - 2 * series.sashFace, s.h - 2 * series.sashFace, series)
      glasses.push({ ...g, label: `${s.label}玻璃` })
    }
  }

  for (const g of glasses) {
    if (g.w < MIN_GLASS || g.h < MIN_GLASS) {
      layout.warnings.push(`${g.label} 尺寸 ${g.w}×${g.h} mm 过小，请核对洞口`)
    }
    const area = m4((g.w / 1000) * (g.h / 1000))
    items.push(
      item(glassMat, {
        spec: `${g.w}×${g.h} mm`,
        widthMm: g.w,
        heightMm: g.h,
        pieces: 1,
        perWindowQty: area,
        remark: g.label
      })
    )
    pushProfile(items, beadMat, g.w, 2, `${g.label}压线 横料`)
    pushProfile(items, beadMat, g.h, 2, `${g.label}压线 竖料`)
  }

  const framePerimM = (2 * (layout.Wf + layout.Hf)) / 1000
  pushQty(items, mats['GASKET-FRAME'], framePerimM, '框周密封', mats['GASKET-FRAME'].spec)

  let sashGasketM = 0
  for (const s of sashes) sashGasketM += (2 * (s.w + s.h)) / 1000
  if (sashGasketM > 0) {
    pushQty(items, mats['GASKET-SASH'], sashGasketM, `开启扇 ${sashes.length} 扇周长`, mats['GASKET-SASH'].spec)
  }

  let glassGasketM = 0
  for (const g of glasses) glassGasketM += (2 * (g.w + g.h) * 2) / 1000
  pushQty(items, mats['GASKET-GLASS'], glassGasketM, '玻璃室内外胶条', mats['GASKET-GLASS'].spec)

  const openingPerimM = (2 * (Number(win.openingW) + Number(win.openingH))) / 1000
  pushQty(items, mats.FOAM, openingPerimM / FOAM_M_PER_CAN, `洞口周长 ${m3(openingPerimM)} m，按 ${FOAM_M_PER_CAN} m/支`, '750ml')
  pushQty(items, mats.SEALANT, openingPerimM / SEALANT_M_PER_TUBE, `洞口周长 ${m3(openingPerimM)} m，按 ${SEALANT_M_PER_TUBE} m/支`, '300ml')

  const plateCount =
    platesOnSide(Number(win.openingW)) * 2 + platesOnSide(Number(win.openingH)) * 2
  pushQty(items, mats.PLATE, plateCount, '四周间距约 400 mm，每边不少于 2 片')
  pushQty(items, mats.ANCHOR, plateCount * 2, '每固定片 2 只')
  pushQty(items, mats.CORNER, 4 + sashes.length * 4, `外框 4 只，每扇 4 只`)
  pushQty(items, mats.BLOCK, glasses.length * 6, '每块玻璃 6 只')
  pushQty(items, mats.SCREW, 24 + plateCount * 2 + sashes.length * 16, '组角、固定片与扇装配')
  pushQty(items, mats.DRAIN, win.type === 'fixed' ? 2 : 4, '下框排水')

  for (const s of sashes) {
    const hw = hardwareForSash(win.type, s.h)
    if (!hw) continue
    pushQty(items, mats[hw.set], 1, `${s.label} ${hw.remark}`)
    if (hw.handle) pushQty(items, mats.HANDLE, 1, s.label)
  }

  const clean = items.filter((it) => it.perWindowQty > 0 && it.code)
  return {
    ok: true,
    errors: [],
    warnings: layout.warnings,
    items: clean,
    layout,
    sashes,
    glasses,
    seriesName: series.name,
    typeName: typeName(win.type),
    glassName: glass.name
  }
}

export function billQuantity(perWindowQty, qty, waste, integer) {
  const raw = perWindowQty * qty * (1 + (waste || 0))
  if (integer) return Math.ceil(raw - 1e-9)
  if (Math.abs(raw) >= 10) return m3(raw)
  return m4(raw)
}

export function lineAmount(qty, price) {
  return money(qty * price)
}

export function calculateProject(project, catalog) {
  const windows = []
  const bucket = new Map()
  let total = 0
  let validCount = 0

  for (const win of project.windows) {
    const calc = calculateWindow(win, catalog)
    const qty = Math.max(0, Number(win.qty) || 0)
    const lines = []
    if (calc.ok && qty > 0) {
      validCount += qty
      for (const it of calc.items) {
        const billed = billQuantity(it.perWindowQty, qty, it.waste, it.integer)
        const amount = lineAmount(billed, it.price)
        const line = { ...it, windowId: win.id, windowName: win.name, modelName: win.modelName || '', qty, billed, amount }
        lines.push(line)
        total += amount
        const prev = bucket.get(it.code)
        if (prev) {
          prev.billed = it.integer ? prev.billed + billed : m4(prev.billed + billed)
          if (it.integer) prev.billed = Math.round(prev.billed)
          prev.amount = money(prev.amount + amount)
          prev.net = m4(prev.net + it.perWindowQty * qty)
        } else {
          bucket.set(it.code, {
            category: it.category,
            code: it.code,
            name: it.name,
            spec: it.spec,
            unit: it.unit,
            waste: it.waste,
            price: it.price,
            integer: it.integer,
            billed,
            amount,
            net: m4(it.perWindowQty * qty)
          })
        }
      }
    }
    const windowTotal = money(lines.reduce((s, l) => s + l.amount, 0))
    const unitTotal = qty > 0 ? money(windowTotal / qty) : 0
    windows.push({ win, calc, lines, qty, total: windowTotal, unitTotal })
  }

  const summary = [...bucket.values()].sort((a, b) => {
    const order = { 型材: 1, 玻璃: 2, 密封胶条: 3, 辅料: 4, 五金: 5 }
    const d = (order[a.category] || 9) - (order[b.category] || 9)
    if (d !== 0) return d
    return a.code.localeCompare(b.code)
  })
  total = money(windows.reduce((s, w) => s + w.total, 0))

  return { windows, summary, total, validCount }
}
