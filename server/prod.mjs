import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 改回你原来的动态路径，不再硬编码 /app
const staticRoot = path.join(__dirname, '../dist');
const backendHost = '127.0.0.1';
const backendPort = 3002; // API后端端口3002不变

// MIME对照表，解决浏览器ES模块MIME空报错
const mimeMap = {
  '.html': 'text/html;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  // API请求转发到3002后端
  if (req.url.startsWith('/api')) {
    const proxyReq = http.request({
      host: backendHost,
      port: backendPort,
      path: req.url,
      method: req.method,
      headers: req.headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    req.pipe(proxyReq);
    proxyReq.on('error', () => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ msg: '后端服务不可用' }));
    });
    return;
  }

  // 静态文件处理
  let filePath;
  if (req.url === '/') {
    filePath = path.join(staticRoot, 'index.html');
  } else {
    filePath = path.join(staticRoot, req.url);
  }

  fs.stat(filePath, (err, stat) => {
    // 文件不存在，SPA兜底返回index.html
    if (err || !stat.isFile()) {
      filePath = path.join(staticRoot, 'index.html');
    }
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath);
      const contentType = mimeMap[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

const PORT = Number(process.env.PORT) || 3001;
// 捕获启动阶段错误，把崩溃信息打印到日志
process.on('uncaughtException', (err) => {
  console.error('prod.mjs 异常崩溃：', err);
});
server.listen(PORT, () => {
  console.log(`原生静态代理服务启动，端口：${PORT}`);
});
