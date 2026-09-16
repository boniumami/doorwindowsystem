import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 获取当前prod.mjs文件所在目录，再向上一层拿到项目根dist
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dist = path.join(__dirname, '../dist')

const backend = spawn(process.execPath, ['./index.js'], { stdio: 'inherit', cwd: __dirname })
const PORT = Number(process.env.PORT) || 3000

const mime = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`)

  if (u.pathname.startsWith('/api')) {
    const proxy = http.request(
      { hostname: '127.0.0.1', port: 3001, path: u.pathname + u.search, method: req.method, headers: req.headers },
      r => { res.writeHead(r.statusCode, r.headers); r.pipe(res) }
    )
    req.pipe(proxy)
    return
  }

  let fp = path.join(dist, u.pathname === '/' ? 'index.html' : u.pathname.slice(1))
  if (!fp.startsWith(dist)) { res.writeHead(404); return res.end() }

  try {
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const buf = await fsp.readFile(fp)
      res.writeHead(200, { 'Content-Type': mime[path.extname(fp)] || 'application/octet-stream' })
      return res.end(buf)
    }
  } catch {}

  // SPA路由兜底
  try {
    const buf = await fsp.readFile(path.join(dist, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' })
    res.end(buf)
  } catch {
    res.writeHead(404);
    res.end('dist not found, run npm run build first')
  }
}).listen(PORT, '0.0.0.0', () => console.log(`prod server on ${PORT}`))

const stop = () => { backend.kill(); process.exit() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
backend.on('exit', stop)
