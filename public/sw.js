/* Service worker básico de Finanzas en Pareja.
   En producción lo genera vite-plugin-pwa (Workbox) desde vite.config.ts.
   Este archivo es el fallback manual: cachea el shell de la app y
   sirve la página offline si no hay red. */
const CACHE = 'finanzas-en-pareja-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  // Nunca cachear la API de Supabase: los datos siempre van en vivo.
  if (event.request.url.includes('supabase.co')) return
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(event.request, copy))
        return res
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/index.html'))),
  )
})
