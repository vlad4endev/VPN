/**
 * Service Worker для SKYFLOW PWA
 * - Кэширование статики для быстрой загрузки на мобильных
 * - Офлайн shell: показ закэшированного UI при отсутствии сети
 * - Web Push: уведомления о тикетах поддержки
 */
const CACHE_VERSION = 'skyflow-v1'
const CACHE_STATIC = `${CACHE_VERSION}-static`
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`
const CACHE_OFFLINE = `${CACHE_VERSION}-offline`

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
]

// Максимум записей в runtime-кэше
const RUNTIME_CACHE_MAX = 64

// Install: precache критичных URL
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'reload' }).then((r) => {
            if (r.ok) return cache.put(url, r.clone())
          }).catch(() => {})
        )
      ).then(() => cache.addAll(PRECACHE_URLS).catch(() => {}))
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Activate: очистка старых кэшей
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('skyflow-') && k !== CACHE_STATIC && k !== CACHE_RUNTIME && k !== CACHE_OFFLINE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

function isApiRequest(url) {
  try {
    const u = new URL(url)
    return u.pathname.startsWith('/api/') || u.pathname.includes('/api/')
  } catch {
    return false
  }
}

function isStaticAsset(url) {
  try {
    const u = new URL(url)
    const path = u.pathname
    return (
      /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/i.test(path) ||
      path.startsWith('/assets/')
    )
  } catch {
    return false
  }
}

function trimRuntimeCache(cache, maxItems) {
  return cache.keys().then((keys) => {
    if (keys.length <= maxItems) return
    return cache.delete(keys[0]).then(() => trimRuntimeCache(cache, maxItems))
  })
}

// Fetch: стратегии кэширования
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = request.url

  if (request.method !== 'GET') return
  if (url.includes('chrome-extension') || url.includes('__webpack')) return

  if (isApiRequest(url)) {
    // API: только сеть, без кэша
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_RUNTIME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((resp) => {
            if (resp.ok) {
              cache.put(request, resp.clone())
              trimRuntimeCache(cache, RUNTIME_CACHE_MAX)
            }
            return resp
          })
          return cached || fetchPromise
        })
      )
    )
    return
  }

  // Навигация (HTML): Network First, fallback на кэш
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const clone = resp.clone()
          if (resp.ok) {
            caches.open(CACHE_RUNTIME).then((cache) => {
              cache.put(request, clone)
              trimRuntimeCache(cache, RUNTIME_CACHE_MAX)
            })
          }
          return resp
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || caches.match('/index.html').then((fallback) => fallback || new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SKYFLOW</title></head><body style="margin:0;padding:1rem;background:#020617;color:#94a3b8;font-family:system-ui;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"><p>Нет подключения к интернету</p><p style="font-size:0.875rem;margin-top:0.5rem">Откройте приложение позже</p></body></html>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            ))
          )
        )
    )
  }
})

// --- Web Push (уведомления поддержки) ---
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Уведомление', body: event.data.text() || '' }
  }
  const title = payload.title || 'Ответ поддержки'
  const body = (payload.body || 'Новое сообщение в обращении').slice(0, 200) + (payload.body?.length > 200 ? '…' : '')
  const url = payload.url || '/#support'
  const tag = payload.ticketId ? 'support-reply-' + payload.ticketId : 'support-reply'
  const options = {
    body,
    tag,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url, ticketId: payload.ticketId || null, type: payload.type || 'support-reply' },
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data || {}).url || '/#support'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
