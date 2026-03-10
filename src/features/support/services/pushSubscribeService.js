/**
 * Подписка на Web Push для уведомлений о тикетах в фоне (вкладка закрыта).
 * Регистрирует Service Worker, подписывается на push и отправляет подписку на сервер.
 */

import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

/**
 * Получить публичный ключ VAPID с сервера.
 * @returns {Promise<string|null>}
 */
export async function getVapidPublicKey() {
  const base = getApiBaseUrl()
  const res = await fetch(`${base}/api/push-vapid-public`)
  const json = await res.json().catch(() => ({}))
  return json.publicKey || null
}

/**
 * Сохранить подписку на сервере (требуется авторизация).
 * @param {PushSubscription} subscription
 * @param {() => Promise<string>} getIdToken
 */
export async function savePushSubscription(subscription, getIdToken) {
  const base = getApiBaseUrl()
  const token = await getIdToken()
  if (!token) throw new Error('Требуется авторизация')
  const sub = subscription.toJSON ? subscription.toJSON() : subscription
  const res = await fetch(`${base}/api/push-subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subscription: sub }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || res.statusText || 'Ошибка сохранения подписки')
  return json
}

/**
 * Зарегистрировать SW и подписаться на push, отправить подписку на сервер.
 * Вызывать при открытой странице, когда пользователь авторизован и разрешил уведомления.
 * @param {() => Promise<string>} getIdToken
 * @returns {Promise<boolean>} true если подписка успешно зарегистрирована
 */
export async function registerAndSubscribe(getIdToken) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await reg.update()
    const publicKey = await getVapidPublicKey()
    if (!publicKey) return false

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }
    if (sub) {
      await savePushSubscription(sub, getIdToken)
      return true
    }
  } catch (err) {
    console.warn('[PushSubscribe]', err.message)
  }
  return false
}
