import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'

const APP_ID_HEADER = 'X-App-Id'

function getBaseUrl() {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : ''
}

async function getAuthHeaders() {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
  if (!token) throw new Error('Требуется авторизация')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    [APP_ID_HEADER]: APP_ID,
  }
}

/**
 * Отправить клиенту в Telegram сообщение о назначенной скидке (только админ).
 * @param {{ userId: string, percent: number, validFrom: number|string, validTo: number|string }} opts
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function notifyDiscountAssigned(opts) {
  const { userId, percent, validFrom, validTo } = opts
  const res = await fetch(`${getBaseUrl()}/api/notify/discount-assigned`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      userId: String(userId || '').trim(),
      percent: Math.min(100, Math.max(0, Number(percent) || 0)),
      validFrom: validFrom != null ? validFrom : undefined,
      validTo: validTo != null ? validTo : undefined,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'Ошибка отправки уведомления в Telegram')
  }
  return { sent: Boolean(data.sent), reason: data.reason || null }
}
