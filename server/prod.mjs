import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticRoot = path.join('/app', 'dist');
const backendHost = '127.0.0.1';
const backendPort = 3001;

const server = http.createServer((req, res) => {
  // API请求，转发到后端
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

  // 静态文件
  let filePath;
  if (req.url === '/') {
    filePath = path.join(staticRoot, 'index.html');
  } else {
    filePath = path.join(staticRoot, req.url);
  }

  fs.stat(filePath, (err, stat) => {
    // 文件不存在 → 返回index.html（SPA兜底）
    if (err || !stat.isFile()) {
      filePath = path.join(staticRoot, 'index.html');
    }
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404);
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200);
      res.end(data);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`原生静态代理服务启动，端口：${PORT}`);
});
