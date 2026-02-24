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
    if (res.status === 404) {
      throw new Error(
        data.error || data.msg ||
        'Эндпоинт аналитики не найден (404). Перезапустите backend: npm start (из корня или из папки server).'
      )
    }
    throw new Error(data.error || data.msg || res.statusText)
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
 * POST /api/admin/notifications/send-user-telegram — отправить текст пользователю в Telegram с инлайн-кнопкой.
 * @param {string} userId
 * @param {string} text
 * @param {{ buttonText?: string }} [opts] — текст кнопки (по умолчанию «Перейти в личный кабинет»). Например: «Воспользоваться предложением», «Подключить подписку».
 */
export async function sendUserTelegram(userId, text, opts = {}) {
  const base = getBaseUrl()
  const headers = await getAuthHeaders()
  const body = { userId: String(userId || '').trim(), text: String(text || '').trim() }
  if (opts.buttonText != null && String(opts.buttonText).trim()) body.buttonText = String(opts.buttonText).trim()
  const res = await fetch(`${base}/api/admin/notifications/send-user-telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
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
    let msg = data.error || data.message || data.msg
    if (!msg) {
      if (res.status === 502) msg = 'Сервис ИИ недоступен (502). Проверьте настройки ИИ в разделе «Интеграции» и повторите позже.'
      else if (res.status === 503) msg = 'ИИ не настроен или недоступен. Задайте API-ключ в разделе «Интеграции → ИИ».'
      else if (res.status === 504) msg = 'ИИ не успел ответить. Попробуйте ещё раз.'
      else msg = res.statusText || `Ошибка ${res.status}`
    }
    throw new Error(msg)
  }
  if (!isJson) {
    throw new Error(res.status === 502
      ? 'Сервис ИИ недоступен (502). Проверьте настройки ИИ и повторите позже.'
      : 'Сервер вернул не JSON. Убедитесь, что backend запущен на порту из VITE_API_BASE_URL (или через proxy).')
  }
  const data = await res.json()
  return data
}

/**
 * POST /api/analytics/ai-funnel-analysis — ИИ анализирует данные пользователей (подписка, оплаты, тикеты) и возвращает таблицу с индексами сложности.
 * Сначала желательно вызвать refreshMetrics().
 * @param {{ limit?: number }} [opts] — макс. пользователей для анализа (по умолчанию 30)
 * @returns {Promise<{ success: boolean, rows: array, segments: object, totalUsers: number, churnForecast: object, avgChurnScore: number }>}
 */
export async function runAiFunnelAnalysis(opts = {}) {
  const base = getBaseUrl()
  const headers = await getAuthHeaders()
  const res = await fetch(`${base}/api/analytics/ai-funnel-analysis`.replace(/\/+/g, '/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ limit: Math.min(35, Math.max(1, Number(opts.limit) || 30)) }),
  })
  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  if (!res.ok) {
    const data = isJson ? await res.json().catch(() => ({})) : {}
    throw new Error(data.error || data.message || res.statusText || 'Ошибка ИИ-анализа воронки')
  }
  if (!isJson) throw new Error('Сервер вернул не JSON')
  return res.json()
}

/**
 * POST /api/analytics/finance-analysis — ИИ анализирует доходы и расходы, даёт рекомендации и шаги для роста выручки и подписок.
 */
export async function runFinanceAnalysis(opts = {}) {
  const base = getBaseUrl()
  const headers = await getAuthHeaders()
  const res = await fetch(`${base}/api/analytics/finance-analysis`.replace(/\/+/g, '/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      periodLabel: opts.periodLabel || 'период',
      totalRevenue: Number(opts.totalRevenue) || 0,
      totalExpenses: Number(opts.totalExpenses) || 0,
      subscriptionsCount: Math.max(0, parseInt(opts.subscriptionsCount, 10) || 0),
      revenueGrowth: opts.revenueGrowth != null ? Number(opts.revenueGrowth) : undefined,
      payersGrowth: opts.payersGrowth != null ? Number(opts.payersGrowth) : undefined,
      balance: opts.balance != null ? Number(opts.balance) : undefined,
      revenueByTariff: Array.isArray(opts.revenueByTariff) ? opts.revenueByTariff : undefined,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        'Эндпоинт анализа финансов не найден (404). Запустите backend из папки server: npm start (n8n-webhook-proxy). Если на 3001 запущен proxy-server — запустите n8n-webhook-proxy на 3002: PORT=3002 npm start.'
      )
    }
    throw new Error(data.error || res.statusText || 'Ошибка анализа финансов')
  }
  return data
}
