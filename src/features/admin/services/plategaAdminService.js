import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'

const APP_ID_HEADER = 'X-App-Id'

function getBaseUrl() {
  return typeof import.meta !== 'undefined' && (import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_BACKEND_URL)
    ? (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL)
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
 * Загрузить настройки Platega из локального файла на сервере (только админ).
 * @returns {Promise<{ plategaMerchantId: string, plategaSecretKey: string, hasMerchantId: boolean, hasSecretKey: boolean }>}
 */
export async function getPlategaSettings() {
  const res = await fetch(`${getBaseUrl()}/api/admin/platega-settings`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 403) throw new Error(json.hint || json.error || 'Доступ запрещён')
    throw new Error(json.error || res.statusText || 'Ошибка загрузки настроек Platega')
  }
  return {
    plategaMerchantId: json.plategaMerchantId || '',
    plategaSecretKey: json.plategaSecretKey || '',
    hasMerchantId: !!json.hasMerchantId,
    hasSecretKey: !!json.hasSecretKey,
  }
}

/**
 * Сохранить настройки Platega в локальный файл на сервере (только админ). Данные никуда не передаются, только на сервер в файл.
 * @param {{ plategaMerchantId?: string, plategaSecretKey?: string }} data
 * @returns {Promise<{ hasMerchantId: boolean, hasSecretKey: boolean }>}
 */
export async function savePlategaSettings(data) {
  const res = await fetch(`${getBaseUrl()}/api/admin/platega-settings`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      plategaMerchantId: (data.plategaMerchantId ?? '').toString().trim(),
      plategaSecretKey: (data.plategaSecretKey ?? '').toString().trim(),
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 400) throw new Error(json.error || 'Неверные данные')
    if (res.status === 403) throw new Error(json.hint || json.error || 'Доступ запрещён')
    throw new Error(json.error || res.statusText || 'Ошибка сохранения настроек Platega')
  }
  return { hasMerchantId: !!json.hasMerchantId, hasSecretKey: !!json.hasSecretKey }
}
