import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'

const APP_ID_HEADER = 'X-App-Id'

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
  const baseUrl = getApiBaseUrl()
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
  const baseUrl = getApiBaseUrl()
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
