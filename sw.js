// sw.js — 缓存应用外壳，让断网也能打开界面（看到明确的网络提示）；数据与文件请求不缓存
const CACHE = 'fhr-v1'
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'vendor/supabase.js', 'js/app.js', 'js/router.js', 'js/db.js', 'js/api.js',
  'js/utils.js', 'js/config.js', 'js/compress.js',
  'js/views/setup.js', 'js/views/login.js', 'js/views/home.js', 'js/views/timeline.js',
  'js/views/detail.js', 'js/views/form.js', 'icons/icon.svg', 'icons/icon-180.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return  // Supabase 请求不拦截
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, copy))
        return res
      })
      .catch(() => caches.match(e.request).then(hit => hit ?? caches.match('index.html')))
  )
})
