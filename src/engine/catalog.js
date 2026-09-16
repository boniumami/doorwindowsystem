export const SERIES = {
  '60': {
    id: '60',
    name: '60系列隔热平开',
    depth: 60,
    frameFace: 50,
    sashFace: 60,
    mullionFace: 64,
    transomFace: 64,
    insert: 20,
    sashOverlap: 20,
    sashDeduct: 60,
    glassInset: 18,
    glassGap: 5
  },
  '65': {
    id: '65',
    name: '65系列断桥平开',
    depth: 65,
    frameFace: 50,
    sashFace: 64,
    mullionFace: 68,
    transomFace: 68,
    insert: 21,
    sashOverlap: 17.5,
    sashDeduct: 65,
    glassInset: 18,
    glassGap: 5
  },
  '70': {
    id: '70',
    name: '70系列断桥平开',
    depth: 70,
    frameFace: 50,
    sashFace: 70,
    mullionFace: 74,
    transomFace: 74,
    insert: 22,
    sashOverlap: 15,
    sashDeduct: 70,
    glassInset: 20,
    glassGap: 5
  },
  '80': {
    id: '80',
    name: '80系列断桥平开',
    depth: 80,
    frameFace: 55,
    sashFace: 78,
    mullionFace: 82,
    transomFace: 82,
    insert: 25,
    sashOverlap: 15,
    sashDeduct: 80,
    glassInset: 22,
    glassGap: 5
  }
}

export const WINDOW_TYPES = [
  { id: 'fixed', name: '固定窗', sash: 0, hardware: 'none' },
  { id: 'casement-single', name: '单扇内开内倒', sash: 1, hardware: 'tilt-turn' },
  { id: 'casement-double', name: '双扇内开内倒', sash: 2, hardware: 'tilt-turn' },
  { id: 'in-single', name: '单扇内开（上开下固）', sash: 1, hardware: 'casement', transom: true },
  { id: 'in-double', name: '双扇内开（上开下固）', sash: 2, hardware: 'casement', transom: true },
  { id: 'awning', name: '悬窗（上开下固）', sash: 1, hardware: 'awning', transom: true },
  { id: 'top-fixed-casement', name: '上固下开', sash: 1, hardware: 'tilt-turn', transom: true },
  { id: 'top-fixed-double', name: '上固下双开', sash: 2, hardware: 'tilt-turn', transom: true },
  { id: 'left-fix-right-open', name: '左固定右开', sash: 1, hardware: 'casement', split: 'two' },
  { id: 'left-open-right-fix', name: '左开右固定', sash: 1, hardware: 'casement', split: 'two' },
  { id: 'left-fix-right-top-open', name: '左固定右上开右下固定', sash: 1, hardware: 'casement', split: 'two', transom: true },
  { id: 'left-top-open-right-fix', name: '左上开左下固定右固定', sash: 1, hardware: 'casement', split: 'two', transom: true }
]

export const BAY_LAYOUTS = [
  { id: 'none', name: '不分格' },
  { id: 'center-open', name: '中开两侧固' },
  { id: 'sides-open', name: '两侧开中间固' }
]

export const GLASS = [
  { id: '5-12A-5', name: '中空钢化 5+12A+5', spec: '5+12A+5', thickness: 22, price: 88 },
  { id: '5-12A-5L', name: '中空 Low-E 5+12A+5', spec: '5+12A+5 Low-E', thickness: 22, price: 118 },
  { id: '6-12A-6', name: '中空钢化 6+12A+6', spec: '6+12A+6', thickness: 24, price: 108 },
  { id: '6-12A-6L', name: '中空 Low-E 6+12A+6', spec: '6+12A+6 Low-E', thickness: 24, price: 138 },
  { id: '5-15A-5', name: '中空钢化 5+15A+5', spec: '5+15A+5', thickness: 25, price: 96 }
]

const PROFILE_META = {
  FRAME: { suffix: '外框', waste: 0.05, price: { '60': 22, '65': 25, '70': 28, '80': 32 } },
  SASH: { suffix: '扇料', waste: 0.05, price: { '60': 24, '65': 27, '70': 30, '80': 34 } },
  MULLION: { suffix: '中挺/中横', waste: 0.05, price: { '60': 26, '65': 29, '70': 32, '80': 36 } },
  BEAD: { suffix: '玻璃压线', waste: 0.08, price: { '60': 6.5, '65': 7.5, '70': 8, '80': 9 } }
}

export const AUX_MATERIALS = [
  { code: 'GASKET-FRAME', category: '密封胶条', name: '框密封胶条', spec: '三元乙丙', unit: 'm', price: 2.6, waste: 0.1, integer: false },
  { code: 'GASKET-SASH', category: '密封胶条', name: '扇密封胶条', spec: '三元乙丙', unit: 'm', price: 2.6, waste: 0.1, integer: false },
  { code: 'GASKET-GLASS', category: '密封胶条', name: '玻璃密封胶条', spec: '三元乙丙双面', unit: 'm', price: 2.4, waste: 0.1, integer: false },
  { code: 'FOAM', category: '辅料', name: '聚氨酯发泡剂', spec: '750ml', unit: '支', price: 18, waste: 0, integer: true },
  { code: 'SEALANT', category: '辅料', name: '耐候密封胶', spec: '300ml', unit: '支', price: 15, waste: 0, integer: true },
  { code: 'PLATE', category: '辅料', name: '连接固定片', spec: '不锈钢 1.5mm', unit: '个', price: 0.6, waste: 0, integer: true },
  { code: 'ANCHOR', category: '辅料', name: '膨胀螺栓', spec: 'M8x80', unit: '个', price: 0.45, waste: 0, integer: true },
  { code: 'CORNER', category: '辅料', name: '组角码', spec: '铝合金', unit: '个', price: 1.2, waste: 0, integer: true },
  { code: 'BLOCK', category: '辅料', name: '玻璃垫块', spec: '尼龙', unit: '个', price: 0.15, waste: 0, integer: true },
  { code: 'SCREW', category: '辅料', name: '不锈钢自攻钉', spec: '4.8x25', unit: '个', price: 0.08, waste: 0, integer: true },
  { code: 'DRAIN', category: '辅料', name: '排水孔盖', spec: '尼龙', unit: '个', price: 0.35, waste: 0, integer: true },
  { code: 'HW-STD', category: '五金', name: '内开内倒五金套装', spec: '标准型 ≤1200mm', unit: '套', price: 88, waste: 0, integer: true },
  { code: 'HW-PLUS', category: '五金', name: '内开内倒五金套装', spec: '加强型 1200-1600mm', unit: '套', price: 118, waste: 0, integer: true },
  { code: 'HW-HEAVY', category: '五金', name: '内开内倒五金套装', spec: '重型 ≥1600mm', unit: '套', price: 158, waste: 0, integer: true },
  { code: 'HW-CASE', category: '五金', name: '内开合页五金套装', spec: '侧开合页+锁点', unit: '套', price: 48, waste: 0, integer: true },
  { code: 'HW-AWN', category: '五金', name: '上悬撑挡套装', spec: '滑撑+风撑', unit: '套', price: 56, waste: 0, integer: true },
  { code: 'HANDLE', category: '五金', name: '内开执手', spec: '锌合金', unit: '个', price: 18, waste: 0, integer: true }
]

export function profileCode(seriesId, kind) {
  return `${seriesId}-${kind}`
}

export function buildDefaultCatalog() {
  const materials = []
  for (const sid of Object.keys(SERIES)) {
    const series = SERIES[sid]
    for (const [kind, meta] of Object.entries(PROFILE_META)) {
      materials.push({
        code: profileCode(sid, kind),
        category: '型材',
        name: `${series.id}${meta.suffix}`,
        spec: `${series.name} ${meta.suffix}`,
        unit: 'm',
        price: meta.price[sid],
        waste: meta.waste,
        integer: false,
        seriesId: sid
      })
    }
  }
  for (const g of GLASS) {
    materials.push({
      code: `GLASS-${g.id}`,
      category: '玻璃',
      name: g.name,
      spec: g.spec,
      unit: 'm2',
      price: g.price,
      waste: 0.03,
      integer: false
    })
  }
  materials.push(...AUX_MATERIALS.map((m) => ({ ...m })))
  return materials
}

export function materialMap(list) {
  const map = {}
  for (const m of list) map[m.code] = m
  return map
}

export function mergeCatalog(saved) {
  const fresh = buildDefaultCatalog()
  if (!Array.isArray(saved) || saved.length === 0) return fresh
  const old = materialMap(saved)
  return fresh.map((item) => {
    const prev = old[item.code]
    if (!prev) return item
    return {
      ...item,
      price: typeof prev.price === 'number' ? prev.price : item.price,
      waste: typeof prev.waste === 'number' ? prev.waste : item.waste
    }
  })
}

export function typeName(id) {
  return WINDOW_TYPES.find((t) => t.id === id)?.name || id
}

export function typeMeta(id) {
  return WINDOW_TYPES.find((t) => t.id === id) || WINDOW_TYPES[0]
}

export function bayName(id) {
  return BAY_LAYOUTS.find((t) => t.id === id)?.name || '不分格'
}
