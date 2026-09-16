const CACHE_NAME = 'pwa-cache-v1';
// const STATIC_FILES = ['/'];

const STATIC_FILES = [
  '/',
  '/index.html',
  '/xlsx.full.min.js',
  '/jspdf.umd.min.js',
  '/src/main.js',
  '/src/style.css',
  '/manifest.json',
  '/icon-192.png'
];


// 安装：缓存首页
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截：优先缓存，后台更新 stale-while-revalidate
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        const fetchPromise = fetch(event.request)
          .then(networkResponse => {
            // 关键：只缓存成功、非跨域的GET请求
            if (
              networkResponse.ok &&
              event.request.method === 'GET' &&
              // 过滤外部CDN跨域请求，不缓存
              event.request.url.startsWith(self.location.origin)
            ) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, clone);
              });
            }
            return networkResponse;
          })
          .catch(err => {
            console.warn('fetch failed', err);
            throw err;
          });

        return cachedResponse || fetchPromise;
      })
  );
});
