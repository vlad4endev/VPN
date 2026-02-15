/**
 * Service Worker для Web Push: уведомления о тикетах поддержки работают в фоне (вкладка закрыта).
 * Сервер отправляет push через Web Push API, SW показывает уведомление; по клику открывается обращение.
 */
self.addEventListener('push', function (event) {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch (_) {
    payload = { title: 'Уведомление', body: event.data.text() || '' }
  }
  const title = payload.title || 'Ответ поддержки'
  const body = payload.body || 'Новое сообщение в обращении'
  const url = payload.url || '/#support'
  const tag = payload.ticketId ? 'support-reply-' + payload.ticketId : 'support-reply'
  const options = {
    body: body.slice(0, 200) + (body.length > 200 ? '…' : ''),
    tag: tag,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: url, ticketId: payload.ticketId || null, type: payload.type || 'support-reply' },
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const data = event.notification.data || {}
  const url = data.url || '/#support'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i]
        if (client.url && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
