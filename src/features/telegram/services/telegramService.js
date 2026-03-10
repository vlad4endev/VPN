import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'

const APP_ID_HEADER = 'X-App-Id'

/**
 * Получить ссылку для привязки Telegram (открыть бота с токеном).
 * Требуется авторизация.
 * @returns {Promise<{ success: boolean, link?: string, expiresIn?: number, error?: string }>}
 */
export async function getBindLink() {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
  if (!token) {
    return { success: false, error: 'Требуется авторизация' }
  }
  const res = await fetch(`${getApiBaseUrl()}/api/telegram/bind-link`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      [APP_ID_HEADER]: APP_ID,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error || res.statusText
    const hint = res.status === 503
      ? ' Запустите бэкенд (node server/n8n-webhook-proxy.js), проверьте Firebase и токен бота в админке (Telegram).'
      : ''
    return { success: false, error: msg + hint }
  }
  return { success: true, link: data.link, expiresIn: data.expiresIn }
}

/**
 * Отвязать Telegram от аккаунта.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function unbindTelegram() {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
  if (!token) {
    return { success: false, error: 'Требуется авторизация' }
  }
  const res = await fetch(`${getApiBaseUrl()}/api/telegram/unbind`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      [APP_ID_HEADER]: APP_ID,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { success: false, error: data.error || res.statusText }
  }
  return { success: true }
}
