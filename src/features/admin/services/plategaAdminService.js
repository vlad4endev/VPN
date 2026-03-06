import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'

const APP_ID_HEADER = 'X-App-Id'

const DEFAULT_BACKEND_PORT = 3001

/**
 * Базовый URL для API-запросов.
 * - localhost: возвращает http://localhost:3001 (или из VITE_API_BASE_URL / VITE_BACKEND_URL).
 * - production (skypath.fun): возвращает '' — используется относительный путь /api (тот же origin).
 */
function getBaseUrl() {
  const fromEnv = typeof import.meta !== 'undefined' && (import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_BACKEND_URL)
    ? (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL)
    : ''
  if (fromEnv) return fromEnv.toString().replace(/\/+$/, '')

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
      return `http://localhost:${DEFAULT_BACKEND_PORT}`
    }
  }
  return ''
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
 * Загрузить настройки Platega с бэкенда (GET /api/admin/payment-settings).
 * secretKey НЕ возвращается — только hasSecretKey.
 * @returns {Promise<{ plategaMerchantId: string, plategaSecretKey: string, hasMerchantId: boolean, hasSecretKey: boolean }>}
 */
export async function getPlategaSettings() {
  const baseUrl = getBaseUrl()
  const url = baseUrl ? `${baseUrl}/api/admin/payment-settings` : '/api/admin/payment-settings'
  const res = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status !== 200 || !json.success) {
    console.error('[Platega] GET /api/admin/payment-settings failed:', {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      json,
      url,
    })
    if (res.status === 403) throw new Error(json.hint || json.error || 'Доступ запрещён')
    if (res.status >= 500) throw new Error(json.error || 'Сервис недоступен. Проверьте, что backend запущен.')
    throw new Error(json.error || res.statusText || 'Ошибка загрузки настроек Platega')
  }
  return {
    plategaMerchantId: json.plategaMerchantId || '',
    plategaSecretKey: '', // secretKey не возвращается с бэкенда
    hasMerchantId: !!json.hasMerchantId,
    hasSecretKey: !!json.hasSecretKey,
  }
}

/**
 * Сохранить настройки Platega на бэкенд (POST /api/admin/payment-settings).
 * Если plategaSecretKey пустой — на сервере сохраняется существующий ключ.
 * @param {{ plategaMerchantId?: string, plategaSecretKey?: string }} data
 * @returns {Promise<{ hasMerchantId: boolean, hasSecretKey: boolean }>}
 */
export async function savePlategaSettings(data) {
  const baseUrl = getBaseUrl()
  const url = baseUrl ? `${baseUrl}/api/admin/payment-settings` : '/api/admin/payment-settings'
  const res = await fetch(url, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      plategaMerchantId: (data.plategaMerchantId ?? '').toString().trim(),
      plategaSecretKey: (data.plategaSecretKey ?? '').toString().trim(),
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status !== 200 || !json.success) {
    console.error('[Platega] POST /api/admin/payment-settings failed:', {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      json,
      url,
    })
    if (res.status === 400) throw new Error(json.error || 'Неверные данные')
    if (res.status === 403) throw new Error(json.hint || json.error || 'Доступ запрещён')
    if (res.status >= 500) throw new Error(json.error || 'Сервис недоступен. Проверьте, что backend запущен.')
    throw new Error(json.error || res.statusText || 'Ошибка сохранения настроек Platega')
  }
  return { hasMerchantId: !!json.hasMerchantId, hasSecretKey: !!json.hasSecretKey }
}
