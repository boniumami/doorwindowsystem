// import * as XLSX from 'xlsx'
const  XLSX  = window.XLSX;
import { bayName, typeMeta, typeName } from './catalog.js'

function bayLabel(win, calc) {
  const layout = calc?.layout
  const meta = typeMeta(win.type)
  if (meta.split === 'two') {
    const left = layout?.leftBayW || win.leftBayW || ''
    return `左右两格，左格内空 ${left} mm`
  }
  const bay = layout?.bayLayout || win.bayLayout || 'none'
  if (bay === 'none') return '不分格'
  const side = layout?.sideBayW || win.sideBayW || ''
  return `${bayName(bay)}，两侧格内空 ${side} mm`
}


function sheet(rows) {
  return XLSX.utils.aoa_to_sheet(rows)
}

function colWidths(ws, widths) {
  ws['!cols'] = widths.map((w) => ({ wch: w }))
}

function stamp() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function windowSheetTitle(row, index) {
  const loc = String(row?.win?.name || '').trim()
  const model = String(row?.win?.modelName || '').trim()
  return [loc, model].filter(Boolean).join('+') || `樘窗${index + 1}`
}

function safeSheetName(name, index) {
  const cleaned = String(name || `樘窗${index + 1}`).replace(/[:\\/?*[\]]/g, ' ').trim()
  const base = cleaned.slice(0, 31) || `樘窗${index + 1}`
  return base.slice(0, 31)
}

function fileNamePart(name) {
  return String(name || '樘窗').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}

function categoryOrder(cat) {
  return { 型材: 1, 玻璃: 2, 密封胶条: 3, 辅料: 4, 五金: 5 }[cat] || 9
}

function summarizeLines(lines) {
  const bucket = new Map()
  for (const line of lines) {
    const prev = bucket.get(line.code)
    if (prev) {
      prev.billed += line.billed
      prev.net += line.net || line.perWindowQty * line.qty
      prev.amount += line.amount
    } else {
      bucket.set(line.code, {
        category: line.category,
        code: line.code,
        name: line.name,
        spec: line.spec,
        unit: line.unit,
        waste: line.waste,
        price: line.price,
        billed: line.billed,
        net: line.net || line.perWindowQty * line.qty,
        amount: line.amount
      })
    }
  }
  return [...bucket.values()].sort((a, b) => {
    const d = categoryOrder(a.category) - categoryOrder(b.category)
    return d !== 0 ? d : a.code.localeCompare(b.code)
  })
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function appendQuoteSheets(wb, project, row, date) {
  const w = row.win
  const calc = row.calc
  const cover = [
    ['铝合金门窗分樘报价单'],
    [],
    ['工程名称', project.name || ''],
    ['客户', project.customer || ''],
    ['位置', w.name || ''],
    ['窗型名称', w.modelName || ''],
    ['开启形式', calc.typeName || typeName(w.type)],
    ['型材系列', calc.seriesName || `${w.seriesId}系列`],
    ['玻璃', calc.glassName || w.glassId],
    ['洞口尺寸(mm)', `${w.openingW} × ${w.openingH}`],
    ['框外沿(mm)', calc.layout ? `${calc.layout.Wf} × ${calc.layout.Hf}` : ''],
    ['水平分格', bayLabel(w, calc)],
    ['上格/亮子内空高(mm)', typeMeta(w.type).transom ? (w.transomH || '') : ''],
    ['安装间隙(mm)', w.installGap],
    ['数量(樘)', row.qty],
    ['单樘报价(元)', row.unitTotal],
    ['本规格合计(元)', row.total],
    ['导出日期', date],
    ['备注', project.note || '']
  ]
  const wsCover = sheet(cover)
  colWidths(wsCover, [18, 28])
  XLSX.utils.book_append_sheet(wb, wsCover, '报价封面')

  const summary = summarizeLines(row.lines)
  const sum = [['类别', '编码', '名称', '规格', '单位', '计价数量', '单价', '金额']]
  for (const r of summary) {
    sum.push([r.category, r.code, r.name, r.spec, r.unit, r.billed, r.price, money(r.amount)])
  }
  sum.push([])
  sum.push(['', '', '', '', '', '', '合计', row.total])
  const wsSum = sheet(sum)
  colWidths(wsSum, [12, 16, 22, 22, 8, 12, 10, 12])
  XLSX.utils.book_append_sheet(wb, wsSum, '报价明细')

  const cut = [['型材', '单长(mm)', '单樘根数', '总根数', '总长度(m)', '单价', '金额', '说明']]
  for (const line of row.lines) {
    if (line.category !== '型材') continue
    cut.push([
      line.name,
      line.lengthMm || '',
      line.pieces,
      (line.pieces || 0) * line.qty,
      line.billed,
      line.price,
      line.amount,
      line.remark
    ])
  }
  const wsCut = sheet(cut)
  colWidths(wsCut, [18, 12, 12, 10, 12, 10, 12, 24])
  XLSX.utils.book_append_sheet(wb, wsCut, '型材下料')

  const gl = [['玻璃', '宽(mm)', '高(mm)', '单樘块数', '总块数', '面积(m2)', '单价', '金额']]
  for (const line of row.lines) {
    if (line.category !== '玻璃') continue
    gl.push([
      line.name,
      line.widthMm,
      line.heightMm,
      line.pieces,
      line.pieces * line.qty,
      line.billed,
      line.price,
      line.amount
    ])
  }
  const wsGl = sheet(gl)
  colWidths(wsGl, [22, 10, 10, 12, 10, 12, 10, 12])
  XLSX.utils.book_append_sheet(wb, wsGl, '玻璃清单')
}

export function buildWorkbook(project, result) {
  const wb = XLSX.utils.book_new()
  const date = stamp()

  const info = [
    ['铝合金门窗用料清单'],
    [],
    ['工程名称', project.name || ''],
    ['客户', project.customer || ''],
    ['备注', project.note || ''],
    ['导出日期', date],
    ['有效樘数', result.validCount],
    ['材料合计金额(元)', result.total],
    [],
    ['分樘报价一览'],
    ['位置', '窗型名称', '开启形式', '洞口宽(mm)', '洞口高(mm)', '分格', '数量', '系列', '玻璃', '单樘报价(元)', '本规格合计(元)', '状态']
  ]
  for (const row of result.windows) {
    const w = row.win
    info.push([
      w.name,
      w.modelName || '',
      typeName(w.type),
      w.openingW,
      w.openingH,
      bayLabel(w, row.calc),
      w.qty,
      w.seriesId,
      w.glassId,
      row.calc.ok ? row.unitTotal : '',
      row.calc.ok ? row.total : '',
      row.calc.ok ? '已计算' : row.calc.errors.join('；')
    ])
  }
  const wsInfo = sheet(info)
  colWidths(wsInfo, [16, 16, 16, 14, 14, 22, 10, 10, 16, 14, 16, 28])
  XLSX.utils.book_append_sheet(wb, wsInfo, '工程信息')

  const sum = [
    ['材料编码', '类别', '名称', '规格', '单位', '净用量', '损耗率', '计价数量', '单价', '金额']
  ]
  for (const r of result.summary) {
    sum.push([
      r.code,
      r.category,
      r.name,
      r.spec,
      r.unit,
      r.net,
      `${Math.round((r.waste || 0) * 100)}%`,
      r.billed,
      r.price,
      r.amount
    ])
  }
  sum.push([])
  sum.push(['', '', '', '', '', '', '', '', '合计', result.total])
  const wsSum = sheet(sum)
  colWidths(wsSum, [16, 10, 22, 22, 8, 12, 10, 12, 10, 12])
  XLSX.utils.book_append_sheet(wb, wsSum, '采购汇总')

  const detail = [
    ['位置', '窗型名称', '樘数', '类别', '编码', '名称', '规格', '单樘数量', '单位', '损耗率', '计价数量', '单价', '金额', '说明']
  ]
  for (const row of result.windows) {
    if (!row.calc.ok) continue
    for (const line of row.lines) {
      detail.push([
        line.windowName,
        line.modelName || '',
        line.qty,
        line.category,
        line.code,
        line.name,
        line.spec,
        line.perWindowQty,
        line.unit,
        `${Math.round((line.waste || 0) * 100)}%`,
        line.billed,
        line.price,
        line.amount,
        line.remark
      ])
    }
  }
  const wsDetail = sheet(detail)
  colWidths(wsDetail, [14, 16, 8, 10, 14, 20, 20, 12, 8, 10, 12, 10, 12, 24])
  XLSX.utils.book_append_sheet(wb, wsDetail, '分樘明细')

  const cut = [['位置', '窗型名称', '樘数', '型材', '单长(mm)', '单樘根数', '总根数', '总长度(m)', '说明']]
  for (const row of result.windows) {
    if (!row.calc.ok) continue
    for (const line of row.lines) {
      if (line.category !== '型材') continue
      const totalPcs = (line.pieces || 0) * line.qty
      cut.push([
        line.windowName,
        line.modelName || '',
        line.qty,
        line.name,
        line.lengthMm || '',
        line.pieces,
        totalPcs,
        line.billed,
        line.remark
      ])
    }
  }
  const wsCut = sheet(cut)
  colWidths(wsCut, [14, 16, 8, 16, 12, 12, 10, 12, 24])
  XLSX.utils.book_append_sheet(wb, wsCut, '型材下料')

  const gl = [['位置', '窗型名称', '樘数', '玻璃', '宽(mm)', '高(mm)', '单樘块数', '总块数', '面积(m2)', '说明']]
  for (const row of result.windows) {
    if (!row.calc.ok) continue
    for (const line of row.lines) {
      if (line.category !== '玻璃') continue
      gl.push([
        line.windowName,
        line.modelName || '',
        line.qty,
        line.name,
        line.widthMm,
        line.heightMm,
        line.pieces,
        line.pieces * line.qty,
        line.billed,
        line.remark
      ])
    }
  }
  const wsGl = sheet(gl)
  colWidths(wsGl, [14, 16, 8, 22, 10, 10, 12, 10, 12, 18])
  XLSX.utils.book_append_sheet(wb, wsGl, '玻璃清单')

  const price = [['编码', '类别', '名称', '规格', '单位', '单价', '损耗率']]
  const seen = new Map()
  for (const r of result.summary) seen.set(r.code, r)
  for (const r of seen.values()) {
    price.push([r.code, r.category, r.name, r.spec, r.unit, r.price, `${Math.round((r.waste || 0) * 100)}%`])
  }
  const wsPrice = sheet(price)
  colWidths(wsPrice, [16, 10, 22, 22, 8, 10, 10])
  XLSX.utils.book_append_sheet(wb, wsPrice, '单价目录')

  return wb
}

export function downloadExcel(project, result) {
  const wb = buildWorkbook(project, result)
  const name = `${project.name || '门窗用料'}.xlsx`
  XLSX.writeFile(wb, name)
}

export function buildWindowQuoteWorkbook(project, row) {
  const wb = XLSX.utils.book_new()
  appendQuoteSheets(wb, project, row, stamp())
  return wb
}

export function downloadWindowQuote(project, row) {
  const wb = buildWindowQuoteWorkbook(project, row)
  const title = windowSheetTitle(row, 0)
  const name = `${fileNamePart(project.name)}-${fileNamePart(title)}-报价.xlsx`
  XLSX.writeFile(wb, name)
}

export function downloadAllWindowQuotes(project, result) {
  const valid = result.windows.filter((row) => row.calc.ok && row.qty > 0)
  const wb = XLSX.utils.book_new()
  const date = stamp()
  const index = [
    ['分樘独立报价一览'],
    [],
    ['工程名称', project.name || ''],
    ['客户', project.customer || ''],
    ['导出日期', date],
    ['有效规格', valid.length],
    ['工程合计(元)', result.total],
    [],
    ['序号', '位置', '窗型名称', '开启形式', '洞口(mm)', '数量', '单樘报价(元)', '本规格合计(元)']
  ]
  valid.forEach((row, i) => {
    index.push([
      i + 1,
      row.win.name,
      row.win.modelName || '',
      row.calc.typeName || typeName(row.win.type),
      `${row.win.openingW}×${row.win.openingH}`,
      row.qty,
      row.unitTotal,
      row.total
    ])
  })
  index.push([])
  index.push(['', '', '', '', '', '', '合计', result.total])
  const wsIndex = sheet(index)
  colWidths(wsIndex, [8, 16, 16, 16, 16, 8, 16, 16])
  XLSX.utils.book_append_sheet(wb, wsIndex, '分樘报价一览')

  const used = new Set(['分樘报价一览'])
  valid.forEach((row, i) => {
    let name = safeSheetName(windowSheetTitle(row, i), i)
    if (used.has(name)) name = `${name.slice(0, 28)}-${i + 1}`.slice(0, 31)
    used.add(name)
    const summary = summarizeLines(row.lines)
    const rows = [
      ['位置', row.win.name],
      ['窗型名称', row.win.modelName || ''],
      ['开启形式', row.calc.typeName || typeName(row.win.type)],
      ['洞口(mm)', `${row.win.openingW} × ${row.win.openingH}`],
      ['分格', bayLabel(row.win, row.calc)],
      ['系列', row.calc.seriesName || row.win.seriesId],
      ['玻璃', row.calc.glassName || row.win.glassId],
      ['数量(樘)', row.qty],
      ['单樘报价(元)', row.unitTotal],
      ['本规格合计(元)', row.total],
      [],
      ['类别', '名称', '规格', '单位', '计价数量', '单价', '金额', '说明']
    ]
    for (const line of summary) {
      rows.push([line.category, line.name, line.spec, line.unit, line.billed, line.price, money(line.amount), ''])
    }
    rows.push([])
    rows.push(['', '', '', '', '', '合计', row.total, ''])
    const ws = sheet(rows)
    colWidths(ws, [12, 22, 22, 8, 12, 10, 12, 20])
    XLSX.utils.book_append_sheet(wb, ws, name)
  })
  XLSX.writeFile(wb, `${fileNamePart(project.name)}-分樘报价.xlsx`)
}
