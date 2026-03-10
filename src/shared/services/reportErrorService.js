/**
 * Отправка отчётов об ошибках админу (бэкенд пишет в Firestore и при настроенном Telegram шлёт в чат).
 * Вызывается из ErrorBoundary и при необработанных promise rejection.
 */

import { auth } from '../../lib/firebase/config.js'
import { APP_ID } from '../constants/app.js'
import { getApiBaseUrl } from '../utils/apiBase.js'

const APP_ID_HEADER = 'X-App-Id'

let reportedIds = new Set()
const MAX_TRACKED = 100

/**
 * Отправить отчёт об ошибке на бэкенд.
 * @param {{ message: string, source?: string, context?: string, stack?: string, severity?: 'low'|'medium'|'high'|'critical' }} opts
 * @returns {Promise<{ success: boolean, id?: string, telegramSent?: boolean }>}
 */
export async function reportErrorToAdmin(opts) {
  const message = (opts.message != null && String(opts.message).trim()) ? String(opts.message).trim().slice(0, 1000) : 'Ошибка'
  const dedupeKey = `${opts.source || 'frontend'}:${message.slice(0, 80)}`
  if (reportedIds.has(dedupeKey)) return { success: false }
  if (reportedIds.size >= MAX_TRACKED) reportedIds.clear()
  reportedIds.add(dedupeKey)

  const headers = {
    'Content-Type': 'application/json',
    [APP_ID_HEADER]: APP_ID,
  }
  const token = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/report-error`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        source: (opts.source || 'frontend').slice(0, 64),
        context: opts.context != null ? String(opts.context).slice(0, 500) : null,
        stack: opts.stack != null ? String(opts.stack).slice(0, 2000) : null,
        severity: opts.severity || 'medium',
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok && json.success) return { success: true, id: json.id, telegramSent: json.telegramSent }
  } catch (_) {}
  return { success: false }
}

/**
 * Подписаться на необработанные rejection (опционально). Вызвать один раз при инициализации приложения.
 */
export function initGlobalErrorReporting() {
  if (typeof window === 'undefined') return
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || event.reason?.toString?.() || String(event.reason)
    reportErrorToAdmin({
      message: msg,
      source: 'unhandledrejection',
      stack: event.reason?.stack,
      severity: 'medium',
    }).catch((err) => console.warn('reportErrorService: report failed', err?.message))
  })
}
