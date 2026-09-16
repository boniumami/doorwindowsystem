const express = require('express');
const path = require('path');
const http = require('http');

const app = express();

// 解析json请求体
app.use(express.json());

// ===================== 静态资源，直接用绝对路径 /app/dist =====================
const staticDir = path.join('/app', 'dist');
app.use(express.static(staticDir));

// ===================== API代理（代理到后端 3001，你的index.js） =====================
app.use('/api', (req, res) => {
  const targetHost = '127.0.0.1';
  const targetPort = 3001;

  const proxyReq = http.request({
    host: targetHost,
    port: targetPort,
    path: req.originalUrl,
    method: req.method,
    headers: req.headers
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  req.pipe(proxyReq, { end: true });

  proxyReq.on('error', (err) => {
    console.error('api proxy error:', err);
    res.status(503).json({ msg: '后端服务不可用' });
  });
});

// ===================== SPA前端路由兜底，刷新页面404修复 =====================
app.get('*', (req, res) => {
  const indexFile = path.join(staticDir, 'index.html');
  res.sendFile(indexFile, (err) => {
    if(err) {
      console.error('sendFile error', err);
      res.status(404).send('页面不存在');
    }
  });
});

// ===================== 启动监听，Railway自动注入PORT =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`prod server start on port ${PORT}`);
  console.log(`static folder: ${staticDir}`);
});
