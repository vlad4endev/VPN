import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'

const APP_ID_HEADER = 'X-App-Id'

function getBaseUrl() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
    ? import.meta.env.VITE_API_BASE_URL
    : ''
}

async function getAuthHeaders() {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
  if (!token) throw new Error('Требуется авторизация')
  return {
    Authorization: `Bearer ${token}`,
    [APP_ID_HEADER]: APP_ID,
  }
}

/**
 * GET /api/analytics/funnel — воронка: сегменты, топ по приоритету, средний churnScore, прогноз оттока.
 * @returns {Promise<{ segments: object, topByPriority: array, avgChurnScore: number, churnForecast: object, totalUsers: number }>}
 */
export async function getFunnel() {
  const base = getBaseUrl()
  const headers = await getAuthHeaders()
  const res = await fetch(`${base}/api/analytics/funnel`, { headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || res.statusText)
  }
  return res.json()
}

/**
 * GET /api/analytics/user/:id — аналитика по пользователю (сегмент, churnScore, LTV, стратегия).
 * @param {string} userId
 * @param {{ refresh?: boolean }} [opts]
 */
export async function getUserAnalytics(userId, opts = {}) {
  const base = getBaseUrl()
  const headers = await getAuthHeaders()
  const qs = opts.refresh ? '?refresh=true' : ''
  const res = await fetch(`${base}/api/analytics/user/${encodeURIComponent(userId)}${qs}`, { headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || res.statusText)
  }
  return res.json()
}

/**
 * POST /api/analytics/refresh-metrics — пересобрать метрики по всем пользователям.
 * @param {{ limit?: number }} [body]
 */
export async function refreshMetrics(body = {}) {
  const base = getBaseUrl()
  const headers = await getAuthHeaders()
  const res = await fetch(`${base}/api/analytics/refresh-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || res.statusText)
  }
  return res.json()
}

/**
 * POST /api/analytics/send-churn-offer/:id — отправить оффер в Telegram пользователю (churnScore > 80).
 * @param {string} userId
 */
export async function sendChurnOffer(userId) {
  const base = getBaseUrl()
  const headers = await getAuthHeaders()
  const res = await fetch(`${base}/api/analytics/send-churn-offer/${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || res.statusText)
  }
  return res.json()
}

/**
 * POST /api/admin/users/:userId/assign-discount — назначить персональную скидку пользователю.
 * @param {string} userId
 * @param {{ percent: number, validFrom: string, validTo: string }} opts — percent 0–100, даты в ISO или локальном формате
 * @returns {Promise<{ success: boolean, updated: boolean, telegramSent?: boolean, reason?: string }>}
 */
export async function assignDiscount(userId, opts = {}) {
  const base = getBaseUrl()
  const headers = await getAuthHeaders()
  const res = await fetch(`${base}/api/admin/users/${encodeURIComponent(userId)}/assign-discount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      percent: Math.min(100, Math.max(0, Number(opts.percent) || 0)),
      validFrom: opts.validFrom || undefined,
      validTo: opts.validTo || undefined,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || res.statusText)
  }
  return res.json()
}

/**
 * POST /api/admin/notifications/send-user-telegram — отправить текст пользователю в Telegram.
 * @param {string} userId
 * @param {string} text
 */
export async function sendUserTelegram(userId, text) {
  const base = getBaseUrl()
  const headers = await getAuthHeaders()
  const res = await fetch(`${base}/api/admin/notifications/send-user-telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ userId: String(userId || '').trim(), text: String(text || '').trim() }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

/**
 * POST /api/analytics/ai-strategy — ИИ анализирует пользователя и даёт шаги для админа + текст предложения.
 * @param {string} userId
 * @param {{ sendToTelegram?: boolean, includeMetricsSummary?: boolean }} [opts]
 * @returns {Promise<{ strategy: string, steps: string[], offerType: string, suggestedOfferMessage: string, sentToTelegram?: boolean }>}
 */
export async function getAiStrategy(userId, opts = {}) {
  const base = getBaseUrl()
  const url = `${base}/api/analytics/ai-strategy`.replace(/\/+/g, '/')
  const headers = await getAuthHeaders()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      userId,
      sendToTelegram: opts.sendToTelegram === true,
      includeMetricsSummary: opts.includeMetricsSummary === true,
    }),
  })
  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  if (!res.ok) {
    const data = isJson ? await res.json().catch(() => ({})) : {}
    const msg = data.error || data.message || res.statusText || `Ошибка ${res.status}`
    throw new Error(msg)
  }
  if (!isJson) {
    throw new Error('Сервер вернул не JSON. Убедитесь, что backend запущен на порту из VITE_API_BASE_URL (или через proxy).')
  }
  const data = await res.json()
  return data
}
