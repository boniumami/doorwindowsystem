import { spawn } from 'node:child_process'
const api = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' })
const fe = spawn('cmd.exe', ['/c','npx','vite','--host','0.0.0.0','--port','5173'], { stdio: 'inherit' })

function stop() {
  api.kill()
  fe.kill()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
api.on('exit', (code) => {
  if (code) fe.kill()
})
fe.on('exit', (code) => {
  api.kill()
  process.exit(code ?? 0)
})
