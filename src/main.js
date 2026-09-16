import { SERIES, WINDOW_TYPES, BAY_LAYOUTS, GLASS, buildDefaultCatalog, materialMap, mergeCatalog, typeName, typeMeta } from './engine/catalog.js'
import { billQuantity, calculateProject, calculateWindow, lineAmount } from './engine/calculate.js'
import { downloadAllDrawings, downloadWindowDrawing, elevationSvg, openingLegend } from './engine/drawing.js'
import { downloadAllWindowQuotes, downloadExcel, downloadWindowQuote } from './engine/excel.js'
import { addUser, changeOwnPassword, currentUser, DEFAULT_ADMIN, fetchLoginHint, isDefaultAdminPassword, login, logout, publicUsers, removeUser, restoreSession, resetUserPassword } from './auth.js'
import { api } from './api.js'

function uid() {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function defaultWindow(i) {
  return {
    id: uid(),
    name: `南立面-${i}`,
    modelName: '',
    qty: 1,
    type: 'in-single',
    openingW: 1500,
    openingH: 1500,
    seriesId: '70',
    glassId: '5-12A-5',
    installGap: 15,
    transomH: 450,
    bayLayout: 'none',
    sideBayW: 600,
    leftBayW: 700
  }
}

function normalizeWindow(win, i) {
  return {
    ...defaultWindow(i + 1),
    ...win,
    modelName: win.modelName ?? ''
  }
}

const UI_KEY = 'aw-ui-v2'

function loadUi() {
  try {
    return JSON.parse(sessionStorage.getItem(UI_KEY) || 'null') || {}
  } catch {
    return {}
  }
}

const ui = loadUi()
const state = {
  project: {
    name: '示例工程',
    customer: '',
    note: '',
    windows: [defaultWindow(1)]
  },
  catalog: buildDefaultCatalog(),
  selectedId: ui.selectedId || null,
  tab: ui.tab || 'edit',
  updatedAt: 0,
  synced: false
}

let catalog = materialMap(state.catalog)
let persistTimer = 0
let pollTimer = 0
let saving = false
let syncError = ''
let userList = []

function persistUi() {
  sessionStorage.setItem(UI_KEY, JSON.stringify({ selectedId: state.selectedId, tab: state.tab }))
}

function applyWorkspace(data, { keepSelection = true } = {}) {
  const prevId = state.selectedId
  state.project = {
    name: data.project?.name || '示例工程',
    customer: data.project?.customer || '',
    note: data.project?.note || '',
    windows: (data.project?.windows || []).map(normalizeWindow)
  }
  state.catalog = mergeCatalog(data.catalog)
  state.updatedAt = data.updatedAt || 0
  catalog = materialMap(state.catalog)
  if (!keepSelection || !state.project.windows.some((w) => w.id === prevId)) {
    state.selectedId = state.project.windows[0]?.id || null
  } else {
    state.selectedId = prevId
  }
}

async function loadWorkspace() {
  const data = await api('/api/workspace')
  applyWorkspace(data)
  state.synced = true
  syncError = ''
}

async function saveWorkspace() {
  if (!canEdit()) return
  saving = true
  try {
    const data = await api('/api/workspace', {
      method: 'PUT',
      body: { project: state.project, catalog: state.catalog }
    })
    applyWorkspace(data)
    state.synced = true
    syncError = ''
  } catch (err) {
    syncError = err.message || '同步失败'
  } finally {
    saving = false
  }
}

function persist() {
  persistUi()
  if (!canEdit()) return
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    saveWorkspace().then(() => {
      persistTimer = 0
      if (syncError) render()
    })
  }, 400)
}

async function refreshWorkspace({ force = false } = {}) {
  if (!currentUser()) return
  try {
    const data = await api('/api/workspace')
    if (!force && data.updatedAt === state.updatedAt) return
    if (canEdit() && (saving || persistTimer)) return
    applyWorkspace(data)
    state.synced = true
    syncError = ''
    render()
  } catch (err) {
    if (err.status === 401) {
      await logout()
      render()
      return
    }
    syncError = err.message || '同步失败'
    render()
  }
}

function isAdmin() {
  return currentUser()?.role === 'admin'
}

function canEdit() {
  return isAdmin()
}

function roAttr() {
  return canEdit() ? '' : 'disabled'
}

function selectedWindow() {
  return state.project.windows.find((w) => w.id === state.selectedId) || state.project.windows[0]
}

function ensureDraft(w) {
  if (!w) {
    editDraft = null
    return null
  }
  if (!editDraft || editDraft.id !== w.id) editDraft = { ...w }
  return editDraft
}

function readEditorForm(base) {
  const val = (id) => document.getElementById(id)?.value
  const num = (id, fallback) => {
    const el = document.getElementById(id)
    if (!el) return fallback
    const n = Number(el.value)
    return Number.isFinite(n) ? n : fallback
  }
  return {
    ...base,
    name: val('w-name') ?? base.name,
    modelName: val('w-model') ?? base.modelName,
    qty: num('w-qty', base.qty),
    type: val('w-type') ?? base.type,
    openingW: num('w-ow', base.openingW),
    openingH: num('w-oh', base.openingH),
    installGap: num('w-gap', base.installGap),
    transomH: num('w-th', base.transomH),
    leftBayW: num('w-leftw', base.leftBayW),
    bayLayout: val('w-bay') ?? base.bayLayout,
    sideBayW: num('w-bayw', base.sideBayW),
    seriesId: val('w-series') ?? base.seriesId,
    glassId: val('w-glass') ?? base.glassId
  }
}

function captureEditorDraft() {
  const w = selectedWindow()
  if (!w || !document.getElementById('w-name')) return
  editDraft = readEditorForm(ensureDraft(w) || w)
}

function commitEditor() {
  if (!canEdit()) return false
  const w = selectedWindow()
  if (!w) return false
  const next = document.getElementById('w-name') ? readEditorForm(ensureDraft(w) || w) : (ensureDraft(w) || w)
  Object.assign(w, next)
  editDraft = { ...w }
  persist()
  return true
}

function refreshEditorDraft() {
  if (!canEdit()) return
  captureEditorDraft()
  render()
}

function needsTransom(type) {
  return !!typeMeta(type).transom
}

function isTwoSplit(type) {
  return typeMeta(type).split === 'two'
}

function fmt(n, digits) {
  if (typeof n !== 'number' || Number.isNaN(n)) return ''
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function money(n) {
  return fmt(n, 2)
}

let loginError = ''
let userError = ''
let userOk = ''
let busy = null
let editDraft = null

function setBusy(text, detail) {
  busy = text ? { text, detail: detail || '' } : null
  const old = document.getElementById('busy-overlay')
  if (!busy) {
    old?.remove()
    return
  }
  const html = `<div class="busy-overlay" id="busy-overlay"><div class="busy-card">${esc(busy.text)}${busy.detail ? `<small>${esc(busy.detail)}</small>` : ''}</div></div>`
  if (old) old.outerHTML = html
  else document.body.insertAdjacentHTML('beforeend', html)
}

function render() {
  const user = currentUser()
  const app = document.getElementById('app')
  if (!user) {
    app.innerHTML = `
      <div class="login-page">
        <form class="login-card" id="login-form">
          <div class="login-brand">
            <div class="brand-mark">窗</div>
            <h1>铝合金门窗用料计算器</h1>
          </div>
          <p class="sub">请登录后录入洞口尺寸并计算用料</p>
          <div class="form">
            <label>用户名<input id="login-user" name="username" autocomplete="username" required /></label>
            <label>密码<input id="login-pass" name="password" type="password" autocomplete="current-password" required /></label>
            ${loginError ? `<div class="bad">${esc(loginError)}</div>` : ''}
            <button class="btn" type="submit">登录</button>
          </div>
          <div class="hint">${isDefaultAdminPassword()
            ? `默认管理员账号 ${DEFAULT_ADMIN.username} / ${DEFAULT_ADMIN.password}，登录后请尽快修改密码。`
            : '请使用已分配的账号登录。'}</div>
        </form>
      </div>
    `
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const username = document.getElementById('login-user').value
      const password = document.getElementById('login-pass').value
      const res = await login(username, password)
      if (!res.ok) {
        loginError = res.error
        render()
        return
      }
      loginError = ''
      userError = ''
      userOk = ''
      try {
        await loadWorkspace()
        if (currentUser()?.role === 'admin') userList = await publicUsers()
      } catch (err) {
        syncError = err.message || '加载工作区失败'
      }
      startPolling()
      render()
    })
    return
  }

  if (user.role !== 'admin' && state.tab === 'users') state.tab = 'edit'
  if (!state.tab || !['edit', 'window', 'summary', 'detail', 'cut', 'glass', 'price', 'users'].includes(state.tab)) {
    state.tab = 'edit'
  }
  persistUi()

  catalog = materialMap(state.catalog)
  const result = calculateProject(state.project, catalog)
  const sel = selectedWindow()
  const selRow = result.windows.find((r) => r.win.id === sel?.id)

  app.innerHTML = `
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">窗</div>
          <h1>铝合金门窗用料计算器</h1>
        </div>
        <div class="topbar-right">
          <div class="user-chip">
            <span class="avatar">${esc((user.name || user.username).slice(0, 1))}</span>
            <div class="user-meta">
              <b>${esc(user.name || user.username)}</b>
              <span class="role-tag">${user.role === 'admin' ? '管理员' : '用户'}</span>
            </div>
          </div>
          ${user.role === 'admin' ? '<button class="btn ghost" id="btn-users">用户管理</button>' : ''}
          <button class="btn ghost" id="btn-logout">退出</button>
        </div>
      </header>
      ${syncError ? `<div class="bad" style="margin:0 0 10px">${esc(syncError)}</div>` : ''}

      <section class="project-bar">
        <div class="form project-fields">
          <label>工程名称<input id="p-name" value="${esc(state.project.name)}" ${roAttr()} /></label>
          <label>客户<input id="p-customer" value="${esc(state.project.customer)}" ${roAttr()} /></label>
          <label class="span-note">备注<input id="p-note" value="${esc(state.project.note)}" ${roAttr()} /></label>
        </div>
        <div class="kpis">
          <div class="kpi"><span>有效樘数</span><b>${result.validCount}</b></div>
          <div class="kpi"><span>材料种类</span><b>${result.summary.length}</b></div>
          <div class="kpi"><span>型材(m)</span><b>${fmt(sumBy(result.summary, '型材'), 1)}</b></div>
          <div class="kpi accent"><span>合计(元)</span><b>${money(result.total)}</b></div>
        </div>
        <div class="export-row">
          <button class="btn" id="btn-export">导出工程清单</button>
          <button class="btn ghost" id="btn-export-quotes">全部分樘报价</button>
          <button class="btn ghost" id="btn-export-drawings">全部图纸</button>
          <button class="btn ghost" id="btn-price">单价表</button>
          ${canEdit() ? '<button class="btn ghost" id="btn-reset">恢复单价</button>' : ''}
        </div>
      </section>

      <div class="workspace">
        <aside class="card sidebar">
          <div class="toolbar">
            <h2>樘窗列表</h2>
            ${canEdit() ? '<button class="btn ghost" id="btn-add">添加樘窗</button>' : '<small class="section-sub">只读查看</small>'}
          </div>
          <div class="win-list">
            ${state.project.windows.map((w) => {
              const row = result.windows.find((r) => r.win.id === w.id)
              const err = row && !row.calc.ok
              return `<div class="win ${w.id === sel?.id ? 'active' : ''}" data-id="${w.id}">
                <div class="row"><b>${esc(w.name)}</b><small>${w.qty} 樘</small></div>
                <small>${esc(w.modelName || typeName(w.type))} · ${w.openingW}×${w.openingH} · ${w.seriesId}系列</small>
                ${err ? `<div class="bad">${esc(row.calc.errors.join('；'))}</div>` : row?.calc.ok ? `<div class="win-price">报价 ${money(row.total)} 元</div>` : ''}
              </div>`
            }).join('')}
          </div>
        </aside>
        <main class="workspace-main">
          <section class="card result-card">
            ${state.tab === 'users' ? renderUsersTab() : state.tab === 'price' ? renderTab(result, selRow) : `
            <div class="tabs">
              ${tabBtn('edit', '当前樘窗')}
              ${tabBtn('window', '本樘用料')}
              ${tabBtn('summary', '采购汇总')}
              ${tabBtn('detail', '分樘明细')}
              ${tabBtn('cut', '型材下料')}
              ${tabBtn('glass', '玻璃')}
            </div>
            ${state.tab === 'edit' ? (sel ? renderEditor(ensureDraft(sel), selRow) : '<div class="empty">请先选择一樘窗。</div>') : renderTab(result, selRow)}`}
          </section>
        </main>
      </div>
    </div>
  `

  bind(result)
}

function tabBtn(id, label) {
  return `<button class="tab ${state.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`
}

function sumBy(summary, cat) {
  return summary.filter((r) => r.category === cat).reduce((s, r) => s + r.billed, 0)
}

function renderEditor(w) {
  const transom = needsTransom(w.type)
  const two = isTwoSplit(w.type)
  const transomLabel = w.type === 'top-fixed-casement' || w.type === 'top-fixed-double' ? '亮子内空高' : '上开启扇内空高'
  const draftCalc = calculateWindow(w, catalog)
  const err = !draftCalc.ok
  const qty = Math.max(0, Number(w.qty) || 0)
  let unitTotal = 0
  if (draftCalc.ok) {
    for (const it of draftCalc.items) {
      unitTotal += lineAmount(billQuantity(it.perWindowQty, 1, it.waste, it.integer), it.price)
    }
  }
  const specTotal = unitTotal * qty
  return `
    <div class="section-head">
      <div>
        <h2>当前樘窗</h2>
        <p class="section-sub">${esc(w.name)} · ${esc(w.modelName || typeName(w.type))} · ${w.openingW}×${w.openingH} mm</p>
      </div>
      ${draftCalc.ok ? `<div class="quote-box compact"><span>单樘 ${money(unitTotal)} 元</span><b>本规格 ${money(specTotal)} 元</b></div>` : ''}
    </div>
    <div class="editor-layout">
      <div class="form">
        <div class="field-group">
          <h3>基本信息</h3>
          <div class="form-grid">
            <label>位置名称<input id="w-name" value="${esc(w.name)}" placeholder="如 南立面-1" ${roAttr()} /></label>
            <label>窗型名称<input id="w-model" value="${esc(w.modelName || '')}" placeholder="如 70断桥双开" ${roAttr()} /></label>
            <label>数量<input id="w-qty" type="number" min="1" step="1" value="${w.qty}" ${roAttr()} /></label>
            <label>开启形式
              <select id="w-type" ${roAttr()}>
                ${WINDOW_TYPES.map((t) => `<option value="${t.id}" ${t.id === w.type ? 'selected' : ''}>${t.name}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>
        <div class="field-group">
          <h3>尺寸与分格</h3>
          <div class="form-grid">
            <label>洞口宽 mm<input id="w-ow" type="number" min="400" step="1" value="${w.openingW}" ${roAttr()} /></label>
            <label>洞口高 mm<input id="w-oh" type="number" min="400" step="1" value="${w.openingH}" ${roAttr()} /></label>
            <label>安装间隙 mm（单边）<input id="w-gap" type="number" min="0" step="1" value="${w.installGap}" ${roAttr()} /></label>
            ${transom ? `<label>${transomLabel} mm<input id="w-th" type="number" min="200" step="1" value="${w.transomH}" ${roAttr()} /></label>` : ''}
            ${two ? `<label>左格内空宽 mm<input id="w-leftw" type="number" min="280" step="1" value="${w.leftBayW || 700}" ${roAttr()} /></label>` : ''}
            ${two ? '' : `<label>水平分格
              <select id="w-bay" ${roAttr()}>
                ${BAY_LAYOUTS.map((t) => `<option value="${t.id}" ${t.id === (w.bayLayout || 'none') ? 'selected' : ''}>${t.name}</option>`).join('')}
              </select>
            </label>`}
            ${!two && w.bayLayout && w.bayLayout !== 'none' ? `<label>两侧格内空宽 mm<input id="w-bayw" type="number" min="280" step="1" value="${w.sideBayW || 600}" ${roAttr()} /></label>` : ''}
          </div>
        </div>
        <div class="field-group">
          <h3>材料</h3>
          <div class="form-grid">
            <label>型材系列
              <select id="w-series" ${roAttr()}>
                ${Object.values(SERIES).map((s) => `<option value="${s.id}" ${s.id === w.seriesId ? 'selected' : ''}>${s.name}</option>`).join('')}
              </select>
            </label>
            <label>玻璃型号
              <select id="w-glass" ${roAttr()}>
                ${GLASS.map((g) => `<option value="${g.id}" ${g.id === w.glassId ? 'selected' : ''}>${g.name}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>
        <div class="editor-actions">
          ${canEdit() ? '<button class="btn" id="btn-apply" type="button">确定</button>' : ''}
          ${canEdit() ? '<button class="btn ghost" id="btn-dup">复制此樘</button>' : ''}
          <button class="btn ghost" id="btn-quote" ${draftCalc.ok ? '' : 'disabled'}>导出本樘报价</button>
          <button class="btn ghost" id="btn-drawing" ${draftCalc.ok ? '' : 'disabled'}>导出本樘图纸</button>
          ${canEdit() ? '<button class="btn danger" id="btn-del">删除此樘</button>' : ''}
        </div>
        ${canEdit() ? '<p class="elev-note">改完点确定，才会写入左侧列表和用料汇总。</p>' : '<p class="elev-note">普通用户仅可查看与导出，修改请联系管理员。</p>'}
        ${err ? `<div class="bad">${esc(draftCalc.errors.join('；'))}</div>` : ''}
        ${draftCalc.ok && draftCalc.warnings.length ? `<div class="warn">${esc(draftCalc.warnings.join('；'))}</div>` : ''}
      </div>
      <div class="elev-card panel">
        <h3>室内立面</h3>
        ${elevationSvg(w, draftCalc.ok ? draftCalc.layout : null)}
        <p class="elev-note">${esc(openingLegend(w.type, w.bayLayout))}</p>
      </div>
    </div>
  `
}

function renderWindowBom(selRow) {
  if (!selRow) return `<div class="empty">请先选择一樘窗。</div>`
  if (!selRow.calc.ok) return `<div class="empty">${esc(selRow.calc.errors.join('；'))}</div>`
  const w = selRow.win
  const groups = {}
  for (const line of selRow.lines) {
    if (!groups[line.category]) groups[line.category] = []
    groups[line.category].push(line)
  }
  const cats = ['型材', '玻璃', '密封胶条', '辅料', '五金']
  return `
    <div class="window-bom-head">
      <div>
        <b>${esc(w.name)}</b>
        <span>${esc(w.modelName || '未填窗型名称')} · ${esc(typeName(w.type))} · ${w.openingW}×${w.openingH} mm · ${w.qty} 樘</span>
      </div>
      <div class="quote-box compact">
        <span>单樘 ${money(selRow.unitTotal)} 元</span>
        <b>本规格 ${money(selRow.total)} 元</b>
      </div>
    </div>
    ${cats.map((cat) => {
      const lines = groups[cat]
      if (!lines?.length) return ''
      const sub = lines.reduce((s, l) => s + l.amount, 0)
      return `
        <h3 class="bom-cat">${esc(cat)}<small>${money(sub)} 元</small></h3>
        ${table(
          ['名称', '规格', '单位', '单樘用量', '计价数量', '单价', '金额', '说明'],
          lines.map((l) => [
            l.name, l.spec, l.unit,
            num(l.perWindowQty, l.integer ? 2 : 3),
            num(l.billed, l.integer ? 0 : 3),
            money(l.price), money(l.amount), l.remark
          ])
        )}
      `
    }).join('')}
  `
}

function renderTab(result, selRow) {
  if (state.tab === 'window') return renderWindowBom(selRow)
  if (state.tab === 'summary') {
    if (!result.summary.length) return `<div class="empty">请先添加有效樘窗。</div>`
    return table(
      ['编码', '类别', '名称', '规格', '单位', '计价数量', '单价', '金额'],
      result.summary.map((r) => [
        r.code, r.category, r.name, r.spec, r.unit,
        num(r.billed, r.integer ? 0 : 3), money(r.price), money(r.amount)
      ])
    )
  }
  if (state.tab === 'detail') {
    const lines = result.windows.flatMap((row) => row.lines)
    if (!lines.length) return `<div class="empty">暂无明细。</div>`
    return table(
      ['位置', '窗型名称', '樘数', '类别', '名称', '规格', '单樘', '计价数量', '金额', '说明'],
      lines.map((l) => [
        l.windowName, l.modelName || '', l.qty, l.category, l.name, l.spec,
        num(l.perWindowQty, l.integer ? 2 : 3), num(l.billed, l.integer ? 0 : 3), money(l.amount), l.remark
      ])
    )
  }
  if (state.tab === 'cut') {
    const lines = result.windows.flatMap((row) => row.lines.filter((l) => l.category === '型材'))
    if (!lines.length) return `<div class="empty">暂无型材。</div>`
    return table(
      ['位置', '窗型名称', '型材', '单长 mm', '单樘根数', '总根数', '总长 m', '说明'],
      lines.map((l) => [
        l.windowName, l.modelName || '', l.name, l.lengthMm || '周长拆分', l.pieces, (l.pieces || 0) * l.qty, num(l.billed, 3), l.remark
      ])
    )
  }
  if (state.tab === 'glass') {
    const lines = result.windows.flatMap((row) => row.lines.filter((l) => l.category === '玻璃'))
    if (!lines.length) return `<div class="empty">暂无玻璃。</div>`
    return table(
      ['位置', '窗型名称', '玻璃', '宽 mm', '高 mm', '块数', '面积 m2'],
      lines.map((l) => [l.windowName, l.modelName || '', l.name, l.widthMm, l.heightMm, l.pieces * l.qty, num(l.billed, 4)])
    )
  }
  if (state.tab === 'price') {
    return `
      <div class="section-head">
        <div>
          <h2>单价表</h2>
          <p class="section-sub">${canEdit() ? '修改后立即参与算料；可点右上角恢复单价还原默认值' : '当前为只读查看，修改单价请联系管理员'}</p>
        </div>
        <button class="btn ghost" id="btn-back-work">返回算料</button>
      </div>
      <table><thead><tr><th>编码</th><th>类别</th><th>名称</th><th>单位</th><th class="num">单价</th><th class="num">损耗%</th></tr></thead><tbody>
      ${state.catalog.map((m) => `<tr>
        <td>${esc(m.code)}</td><td>${esc(m.category)}</td><td>${esc(m.name)}<br><small>${esc(m.spec)}</small></td>
        <td>${esc(m.unit)}</td>
        <td class="num">${canEdit() ? `<input class="price-input" data-price="${m.code}" type="number" min="0" step="0.01" value="${m.price}" />` : money(m.price)}</td>
        <td class="num">${canEdit() ? `<input class="price-input" data-waste="${m.code}" type="number" min="0" max="30" step="0.1" value="${((m.waste || 0) * 100).toFixed(1)}" />` : ((m.waste || 0) * 100).toFixed(1)}</td>
      </tr>`).join('')}
    </tbody></table>`
  }
  if (selRow && !selRow.calc.ok) return `<div class="empty">${esc(selRow.calc.errors.join('；'))}</div>`
  return ''
}

function renderUsersTab() {
  if (currentUser()?.role !== 'admin') return `<div class="empty">仅管理员可管理用户。</div>`
  const users = userList
  const me = currentUser()
  return `
    <div class="section-head">
      <div>
        <h2>用户管理</h2>
        <p class="section-sub">添加账号、改密、重置他人密码</p>
      </div>
      <button class="btn ghost" id="btn-back-work">返回算料</button>
    </div>
    <h3 class="bom-cat">修改我的密码</h3>
    <form class="users-form form pwd-form" id="pwd-form">
      <label>当前密码<input id="pwd-old" type="password" required autocomplete="current-password" /></label>
      <label>新密码<input id="pwd-new" type="password" required minlength="6" autocomplete="new-password" /></label>
      <label>确认新密码<input id="pwd-confirm" type="password" required minlength="6" autocomplete="new-password" /></label>
      <button class="btn" type="submit">保存密码</button>
    </form>
    <h3 class="bom-cat">添加用户</h3>
    <form class="users-form form" id="user-form">
      <label>用户名<input id="nu-user" required placeholder="字母数字下划线" /></label>
      <label>显示名<input id="nu-name" placeholder="可选" /></label>
      <label>密码<input id="nu-pass" type="password" required minlength="6" /></label>
      <label>角色
        <select id="nu-role">
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>
      </label>
      <button class="btn" type="submit">添加用户</button>
    </form>
    ${userError ? `<div class="bad" style="margin-bottom:8px">${esc(userError)}</div>` : ''}
    ${userOk ? `<div class="ok" style="margin-bottom:8px">${esc(userOk)}</div>` : ''}
    <table><thead><tr><th>用户名</th><th>显示名</th><th>角色</th><th>重置密码</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr>
        <td>${esc(u.username)}</td>
        <td>${esc(u.name || '')}</td>
        <td>${u.role === 'admin' ? '管理员' : '普通用户'}</td>
        <td>${u.id === me.id ? '请用上方表单' : `<span class="reset-row"><input class="price-input" data-reset-pass="${u.id}" type="password" minlength="6" placeholder="新密码" /><button class="btn ghost" data-reset-user="${u.id}">重置</button></span>`}</td>
        <td>${u.id === me.id ? '' : `<button class="btn danger" data-del-user="${u.id}">删除</button>`}</td>
      </tr>`).join('')}
    </tbody></table>
  `
}

function table(headers, rows) {
  const numIdx = new Set()
  headers.forEach((h, i) => {
    if (/数量|单价|金额|根数|块数|面积|总长|单樘|mm|樘数/.test(h)) numIdx.add(i)
  })
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h, i) => `<th class="${numIdx.has(i) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${numIdx.has(i) ? 'num' : ''}">${esc(String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}

function num(n, d) {
  return fmt(Number(n), d)
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function bind(result) {
  const on = (id, ev, fn) => {
    const el = document.getElementById(id)
    if (el) el.addEventListener(ev, fn)
  }

  on('p-name', 'input', (e) => { if (!canEdit()) return; state.project.name = e.target.value; persist() })
  on('p-customer', 'input', (e) => { if (!canEdit()) return; state.project.customer = e.target.value; persist() })
  on('p-note', 'input', (e) => { if (!canEdit()) return; state.project.note = e.target.value; persist() })

  on('btn-add', 'click', () => {
    if (!canEdit()) return
    const w = defaultWindow(state.project.windows.length + 1)
    state.project.windows.push(w)
    state.selectedId = w.id
    editDraft = { ...w }
    persist()
    render()
  })

  on('btn-dup', 'click', () => {
    if (!canEdit()) return
    const src = selectedWindow()
    if (!src) return
    const copy = {
      ...src,
      id: uid(),
      name: `${src.name || '樘窗'}-副本`
    }
    const idx = state.project.windows.findIndex((x) => x.id === src.id)
    state.project.windows.splice(idx + 1, 0, copy)
    state.selectedId = copy.id
    editDraft = { ...copy }
    persist()
    render()
  })

  on('btn-del', 'click', () => {
    if (!canEdit()) return
    if (state.project.windows.length <= 1) {
      state.project.windows = [defaultWindow(1)]
      state.selectedId = state.project.windows[0].id
    } else {
      state.project.windows = state.project.windows.filter((w) => w.id !== state.selectedId)
      state.selectedId = state.project.windows[0].id
    }
    editDraft = null
    persist()
    render()
  })

  on('btn-apply', 'click', () => {
    if (!canEdit()) return
    if (!commitEditor()) return
    render()
  })

  on('btn-export', 'click', () => {
    if (!result.validCount) {
      alert('请先添加有效樘窗后再导出。')
      return
    }
    downloadExcel(state.project, result)
  })

  on('btn-export-quotes', 'click', () => {
    if (!result.validCount) {
      alert('请先添加有效樘窗后再导出分樘报价。')
      return
    }
    downloadAllWindowQuotes(state.project, result)
  })

  on('btn-quote', 'click', () => {
    commitEditor()
    const fresh = calculateProject(state.project, catalog)
    const row = fresh.windows.find((r) => r.win.id === selectedWindow()?.id)
    if (!row || !row.calc.ok) {
      alert('当前樘窗无法计算，请先修正尺寸后再导出报价。')
      render()
      return
    }
    downloadWindowQuote(state.project, row)
    render()
  })

  on('btn-drawing', 'click', async () => {
    commitEditor()
    const fresh = calculateProject(state.project, catalog)
    const row = fresh.windows.find((r) => r.win.id === selectedWindow()?.id)
    if (!row || !row.calc.ok) {
      alert('当前樘窗无法计算，请先修正尺寸后再导出图纸。')
      render()
      return
    }
    setBusy('正在导出本樘图纸', '生成 A3 PDF…')
    try {
      await downloadWindowDrawing(state.project, row)
    } catch (err) {
      alert('本樘图纸导出失败，请重试。')
    } finally {
      setBusy(null)
    }
  })

  on('btn-export-drawings', 'click', async () => {
    if (!result.validCount) {
      alert('请先添加有效樘窗后再导出图纸。')
      return
    }
    setBusy('正在导出全部图纸', `共 ${result.validCount} 樘，每樘一页 A3 PDF`)
    try {
      await downloadAllDrawings(state.project, result, (done, total) => {
        setBusy('正在导出全部图纸', `第 ${done} / ${total} 页`)
      })
    } catch (err) {
      alert('全部图纸导出失败，请重试。')
    } finally {
      setBusy(null)
    }
  })

  on('btn-price', 'click', () => {
    state.tab = 'price'
    persistUi()
    render()
  })

  on('btn-reset', 'click', () => {
    if (!canEdit()) return
    state.catalog = buildDefaultCatalog()
    persist()
    render()
  })

  on('btn-logout', 'click', async () => {
    stopPolling()
    await logout()
    userError = ''
    userOk = ''
    loginError = ''
    userList = []
    render()
  })

  on('btn-users', 'click', async () => {
    state.tab = 'users'
    persistUi()
    try { userList = await publicUsers() } catch { /* keep */ }
    render()
  })

  on('btn-back-work', 'click', () => {
    state.tab = 'edit'
    persistUi()
    render()
  })

  const userForm = document.getElementById('user-form')
  if (userForm) {
    userForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const res = await addUser({
        username: document.getElementById('nu-user').value,
        name: document.getElementById('nu-name').value,
        password: document.getElementById('nu-pass').value,
        role: document.getElementById('nu-role').value
      })
      userError = res.ok ? '' : res.error
      userOk = res.ok ? '用户已添加' : ''
      if (res.ok) {
        try { userList = await publicUsers() } catch { /* keep */ }
      }
      render()
    })
  }

  const pwdForm = document.getElementById('pwd-form')
  if (pwdForm) {
    pwdForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const res = await changeOwnPassword({
        oldPassword: document.getElementById('pwd-old').value,
        newPassword: document.getElementById('pwd-new').value,
        confirmPassword: document.getElementById('pwd-confirm').value
      })
      userError = res.ok ? '' : res.error
      userOk = res.ok ? '密码已修改' : ''
      render()
    })
  }

  document.querySelectorAll('[data-reset-user]').forEach((el) => {
    el.addEventListener('click', async () => {
      const input = document.querySelector(`[data-reset-pass="${el.dataset.resetUser}"]`)
      const res = await resetUserPassword(el.dataset.resetUser, input?.value || '')
      userError = res.ok ? '' : res.error
      userOk = res.ok ? '该用户密码已重置' : ''
      render()
    })
  })

  document.querySelectorAll('[data-del-user]').forEach((el) => {
    el.addEventListener('click', async () => {
      const res = await removeUser(el.dataset.delUser)
      userError = res.ok ? '' : res.error
      userOk = res.ok ? '用户已删除' : ''
      if (res.ok) {
        try { userList = await publicUsers() } catch { /* keep */ }
      }
      render()
    })
  })

  document.querySelectorAll('.win').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.id === state.selectedId && state.tab === 'edit') return
      state.selectedId = el.dataset.id
      editDraft = null
      if (state.tab === 'users' || state.tab === 'price') state.tab = 'edit'
      persistUi()
      render()
    })
  })

  document.querySelectorAll('.tab').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.tab === state.tab) return
      state.tab = el.dataset.tab
      persistUi()
      render()
    })
  })

  ;['w-name', 'w-model', 'w-qty', 'w-ow', 'w-oh', 'w-gap', 'w-th', 'w-leftw', 'w-bayw', 'w-series', 'w-glass'].forEach((id) => {
    on(id, 'change', refreshEditorDraft)
  })
  on('w-type', 'change', refreshEditorDraft)
  on('w-bay', 'change', refreshEditorDraft)

  document.querySelectorAll('[data-price]').forEach((el) => {
    el.addEventListener('change', (e) => {
      if (!canEdit()) return
      const m = state.catalog.find((x) => x.code === el.dataset.price)
      if (m) m.price = Number(e.target.value) || 0
      persist()
      render()
    })
  })
  document.querySelectorAll('[data-waste]').forEach((el) => {
    el.addEventListener('change', (e) => {
      if (!canEdit()) return
      const m = state.catalog.find((x) => x.code === el.dataset.waste)
      if (m) m.waste = (Number(e.target.value) || 0) / 100
      persist()
      render()
    })
  })
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    refreshWorkspace()
  }, 8000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = 0
  }
}

async function boot() {
  await fetchLoginHint()
  const user = await restoreSession()
  if (user) {
    try {
      await loadWorkspace()
      if (user.role === 'admin') userList = await publicUsers()
    } catch (err) {
      syncError = err.message || '加载工作区失败'
    }
    startPolling()
  }
  render()
}

boot()
