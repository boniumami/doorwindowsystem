import http from 'node:http'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { buildDefaultCatalog } from '../src/engine/catalog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3001
const DATA_DIR = join(__dirname, '..', 'data')
const DB_PATH = join(DATA_DIR, 'app.db')
const PROJECT_ID = 'default'

const DEFAULT_ADMIN = {
  id: 'u-admin',
  username: 'admin',
  name: '管理员',
  role: 'admin',
  password: 'admin123'
}

mkdirSync(DATA_DIR, { recursive: true })
const db = new DatabaseSync(DB_PATH)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    customer TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS windows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    payload TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS catalog_items (
    code TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  );
`)

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 32).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false
  const parts = stored.split('$')
  if (parts.length !== 3) return false
  const actual = scryptSync(String(password), parts[1], 32)
  const expected = Buffer.from(parts[2], 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function now() {
  return Date.now()
}

function defaultWindow(i) {
  return {
    id: uid('w'),
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

function runTx(fn) {
  db.exec('BEGIN')
  try {
    fn()
    db.exec('COMMIT')
  } catch (err) {
    try { db.exec('ROLLBACK') } catch { /* ignore */ }
    throw err
  }
}

function seed() {
  const admin = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin')
  if (!admin) {
    db.prepare('INSERT INTO users (id, username, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      DEFAULT_ADMIN.id,
      DEFAULT_ADMIN.username,
      DEFAULT_ADMIN.name,
      DEFAULT_ADMIN.role,
      hashPassword(DEFAULT_ADMIN.password),
      now()
    )
  }
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(PROJECT_ID)
  if (!project) {
    db.prepare('INSERT INTO projects (id, name, customer, note, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      PROJECT_ID,
      '示例工程',
      '',
      '',
      now()
    )
    const win = defaultWindow(1)
    db.prepare('INSERT INTO windows (id, project_id, sort_order, payload) VALUES (?, ?, ?, ?)').run(
      win.id,
      PROJECT_ID,
      0,
      JSON.stringify(win)
    )
  }
  const catalogCount = db.prepare('SELECT COUNT(*) AS n FROM catalog_items').get()
  if (!catalogCount?.n) {
    const insert = db.prepare('INSERT INTO catalog_items (code, payload) VALUES (?, ?)')
    runTx(() => {
      for (const item of buildDefaultCatalog()) {
        insert.run(item.code, JSON.stringify(item))
      }
    })
  }
}

seed()

function publicUser(row) {
  if (!row) return null
  return { id: row.id, username: row.username, name: row.name, role: row.role, createdAt: row.created_at }
}

function userById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

function userByName(username) {
  return db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(String(username || '').trim())
}

function sessionUser(token) {
  if (!token) return null
  const row = db.prepare(`
    SELECT u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token)
  return row || null
}

function bearer(req) {
  const h = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : ''
}

function loadWorkspace() {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(PROJECT_ID)
  const windows = db.prepare('SELECT payload FROM windows WHERE project_id = ? ORDER BY sort_order, id').all(PROJECT_ID)
    .map((r) => JSON.parse(r.payload))
  const catalog = db.prepare('SELECT payload FROM catalog_items').all().map((r) => JSON.parse(r.payload))
  return {
    project: {
      name: project?.name || '示例工程',
      customer: project?.customer || '',
      note: project?.note || '',
      windows: windows.length ? windows : [defaultWindow(1)]
    },
    catalog,
    updatedAt: project?.updated_at || 0
  }
}

function saveWorkspace(body) {
  const project = body?.project || {}
  const windows = Array.isArray(project.windows) ? project.windows : []
  const catalog = Array.isArray(body?.catalog) ? body.catalog : []
  const ts = now()
  runTx(() => {
    db.prepare('UPDATE projects SET name = ?, customer = ?, note = ?, updated_at = ? WHERE id = ?').run(
      String(project.name || '未命名工程'),
      String(project.customer || ''),
      String(project.note || ''),
      ts,
      PROJECT_ID
    )
    db.prepare('DELETE FROM windows WHERE project_id = ?').run(PROJECT_ID)
    const insertWin = db.prepare('INSERT INTO windows (id, project_id, sort_order, payload) VALUES (?, ?, ?, ?)')
    windows.forEach((win, i) => {
      const id = String(win?.id || uid('w'))
      const payload = { ...win, id }
      insertWin.run(id, PROJECT_ID, i, JSON.stringify(payload))
    })
    if (catalog.length) {
      db.prepare('DELETE FROM catalog_items').run()
      const insertCat = db.prepare('INSERT INTO catalog_items (code, payload) VALUES (?, ?)')
      for (const item of catalog) {
        if (!item?.code) continue
        insertCat.run(item.code, JSON.stringify(item))
      }
    }
  })
  return loadWorkspace()
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('JSON 无效'))
      }
    })
    req.on('error', reject)
  })
}

function requireUser(req, res) {
  const user = sessionUser(bearer(req))
  if (!user) {
    json(res, 401, { ok: false, error: '请先登录' })
    return null
  }
  return user
}

function requireAdmin(req, res) {
  const user = requireUser(req, res)
  if (!user) return null
  if (user.role !== 'admin') {
    json(res, 403, { ok: false, error: '仅管理员可执行此操作' })
    return null
  }
  return user
}

async function handle(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname
  const method = req.method || 'GET'

  if (path === '/api/health' && method === 'GET') {
    return json(res, 200, { ok: true })
  }

  if (path === '/api/auth/hint' && method === 'GET') {
    const admin = db.prepare('SELECT password_hash FROM users WHERE username = ? AND role = ?').get('admin', 'admin')
    return json(res, 200, { ok: true, defaultAdminPassword: admin ? verifyPassword(DEFAULT_ADMIN.password, admin.password_hash) : false })
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const body = await readBody(req)
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    if (!username || !password) return json(res, 400, { ok: false, error: '请输入用户名和密码' })
    const user = userByName(username)
    if (!user || !verifyPassword(password, user.password_hash)) {
      return json(res, 401, { ok: false, error: '用户名或密码不正确' })
    }
    const token = randomBytes(24).toString('hex')
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, now())
    return json(res, 200, { ok: true, token, user: publicUser(user) })
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const token = bearer(req)
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return json(res, 200, { ok: true })
  }

  if (path === '/api/auth/me' && method === 'GET') {
    const user = requireUser(req, res)
    if (!user) return
    return json(res, 200, { ok: true, user: publicUser(user) })
  }

  if (path === '/api/users' && method === 'GET') {
    const actor = requireAdmin(req, res)
    if (!actor) return
    const users = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY created_at').all()
      .map(publicUser)
    return json(res, 200, { ok: true, users })
  }

  if (path === '/api/users' && method === 'POST') {
    const actor = requireAdmin(req, res)
    if (!actor) return
    const body = await readBody(req)
    const uname = String(body.username || '').trim()
    const pwd = String(body.password || '')
    const display = String(body.name || '').trim() || uname
    const role = body.role === 'admin' ? 'admin' : 'user'
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) {
      return json(res, 400, { ok: false, error: '用户名为 3-20 位字母、数字或下划线' })
    }
    if (pwd.length < 6) return json(res, 400, { ok: false, error: '密码至少 6 位' })
    if (userByName(uname)) return json(res, 400, { ok: false, error: '用户名已存在' })
    const id = uid('u')
    db.prepare('INSERT INTO users (id, username, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, uname, display, role, hashPassword(pwd), now()
    )
    return json(res, 200, { ok: true, user: { id, username: uname, name: display, role } })
  }

  if (path === '/api/users/password' && method === 'POST') {
    const actor = requireAdmin(req, res)
    if (!actor) return
    const body = await readBody(req)
    const oldPassword = String(body.oldPassword || '')
    const newPassword = String(body.newPassword || '')
    const confirmPassword = String(body.confirmPassword || '')
    if (newPassword !== confirmPassword) return json(res, 400, { ok: false, error: '两次输入的新密码不一致' })
    if (newPassword.length < 6) return json(res, 400, { ok: false, error: '新密码至少 6 位' })
    const me = userById(actor.id)
    if (!verifyPassword(oldPassword, me.password_hash)) return json(res, 400, { ok: false, error: '当前密码不正确' })
    if (verifyPassword(newPassword, me.password_hash)) return json(res, 400, { ok: false, error: '新密码与当前密码相同' })
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), me.id)
    return json(res, 200, { ok: true })
  }

  const userReset = /^\/api\/users\/([^/]+)\/reset-password$/.exec(path)
  if (userReset && method === 'POST') {
    const actor = requireAdmin(req, res)
    if (!actor) return
    const id = decodeURIComponent(userReset[1])
    if (id === actor.id) return json(res, 400, { ok: false, error: '请使用上方表单修改自己的密码' })
    const body = await readBody(req)
    const pwd = String(body.password || body.newPassword || '')
    if (pwd.length < 6) return json(res, 400, { ok: false, error: '新密码至少 6 位' })
    const target = userById(id)
    if (!target) return json(res, 404, { ok: false, error: '用户不存在' })
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(pwd), id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    return json(res, 200, { ok: true })
  }

  const userDel = /^\/api\/users\/([^/]+)$/.exec(path)
  if (userDel && method === 'DELETE') {
    const actor = requireAdmin(req, res)
    if (!actor) return
    const id = decodeURIComponent(userDel[1])
    const target = userById(id)
    if (!target) return json(res, 404, { ok: false, error: '用户不存在' })
    if (target.id === actor.id) return json(res, 400, { ok: false, error: '不能删除当前登录账号' })
    const admins = db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get('admin')
    if (target.role === 'admin' && admins.n <= 1) {
      return json(res, 400, { ok: false, error: '至少保留一名管理员' })
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    return json(res, 200, { ok: true })
  }

  if (path === '/api/workspace' && method === 'GET') {
    const user = requireUser(req, res)
    if (!user) return
    return json(res, 200, { ok: true, ...loadWorkspace() })
  }

  if (path === '/api/workspace' && method === 'PUT') {
    const actor = requireAdmin(req, res)
    if (!actor) return
    const body = await readBody(req)
    const data = saveWorkspace(body)
    return json(res, 200, { ok: true, ...data })
  }

  json(res, 404, { ok: false, error: '接口不存在' })
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    json(res, 500, { ok: false, error: err.message || '服务器错误' })
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BOM API listening on ${PORT}`)
})
