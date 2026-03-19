import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'

const APP_ID_HEADER = 'X-App-Id'
const DEV_SECRET_HEADER = 'X-Monitoring-Dev-Secret'

async function buildMonitoringReportHeaders() {
  const devSecret =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_MONITORING_AI_REPORT_DEV_SECRET
      ? String(import.meta.env.VITE_MONITORING_AI_REPORT_DEV_SECRET).trim()
      : ''

  const headers = {
    'Content-Type': 'application/json',
    [APP_ID_HEADER]: APP_ID,
  }
  if (devSecret) {
    headers[DEV_SECRET_HEADER] = devSecret
  }

  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
  if (token) {
    headers.Authorization = `Bearer ${token}`
  } else if (!devSecret) {
    const localUi =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]')
    if (!localUi) {
      throw new Error(
        'Требуется вход в аккаунт, либо VITE_MONITORING_AI_REPORT_DEV_SECRET, либо откройте админку с localhost (тогда backend на :3001 примет запрос без Firebase Admin).',
      )
    }
  }

  return headers
}

/**
 * Запросить ИИ-отчёт по мониторингу (сервер подмешивает буфер логов).
 * @param {{
 *   status?: object|null,
 *   logs?: Array,
 *   responseTimeHistory?: Array,
 *   clientStatus?: object|null,
 *   logLimit?: number,
 * }} snapshot
 * @returns {Promise<{ report: string, heuristicOnly: boolean, generatedAt?: string, aiError?: string }>}
 */
export async function fetchMonitoringAiReport(snapshot = {}) {
  const res = await fetch(`${getApiBaseUrl()}/api/admin/system/monitoring-ai-report`, {
    method: 'POST',
    headers: await buildMonitoringReportHeaders(),
    body: JSON.stringify({
      status: snapshot.status ?? null,
      logs: snapshot.logs ?? [],
      responseTimeHistory: snapshot.responseTimeHistory ?? [],
      clientStatus: snapshot.clientStatus ?? null,
      logLimit: snapshot.logLimit,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 403) {
      throw new Error(json.hint || json.error || 'Доступ запрещён')
    }
    if (res.status === 404) {
      throw new Error(
        'Маршрут POST /api/admin/system/monitoring-ai-report не найден (404). ' +
          'Задеплойте обновлённый backend (n8n-webhook-proxy). ' +
          'При локальной разработке: запустите backend на :3001 и уберите VITE_API_BASE_URL из .env (или укажите origin dev-сервера), чтобы запросы шли через прокси Vite на тот же хост.',
      )
    }
    if (res.status === 503) {
      const base = json.error || res.statusText || 'Сервис недоступен (503)'
      throw new Error(
        `${base} Убедитесь, что backend слушает :3001 и запрос идёт через прокси Vite (origin localhost). ` +
          'Опционально: Firebase Admin в server/.env или пара секретов MONITORING_AI_REPORT_DEV_SECRET / VITE_MONITORING_AI_REPORT_DEV_SECRET.',
      )
    }
    throw new Error(json.error || res.statusText || 'Не удалось получить отчёт')
  }
  return {
    report: String(json.report || ''),
    heuristicOnly: Boolean(json.heuristicOnly),
    generatedAt: json.generatedAt,
    aiError: json.aiError,
  }
}
