import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'

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
 * Загрузить настройки Platega с бэкенда (GET /api/admin/platega-settings).
 * @returns {Promise<{ plategaMerchantId: string, plategaSecretKey: string, hasMerchantId: boolean, hasSecretKey: boolean }>}
 */
export async function getPlategaSettings() {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/admin/platega-settings', { method: 'GET', headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    console.error('[Platega] GET /api/admin/platega-settings failed:', { status: res.status, json })
    if (res.status === 403) throw new Error(json.hint || json.error || 'Доступ запрещён')
    if (res.status >= 500) throw new Error(json.error || 'Сервис недоступен. Проверьте, что backend запущен.')
    throw new Error(json.error || res.statusText || 'Ошибка загрузки настроек Platega')
  }
  return {
    plategaMerchantId: json.plategaMerchantId || '',
    plategaSecretKey: json.plategaSecretKey || '',
    hasMerchantId: !!json.plategaMerchantId || !!json.hasMerchantId,
    hasSecretKey: !!json.plategaSecretKey || !!json.hasSecretKey,
  }
}

/**
 * Сохранить настройки Platega на бэкенд (PATCH /api/admin/platega-settings).
 * @param {{ plategaMerchantId?: string, plategaSecretKey?: string }} data
 * @returns {Promise<{ hasMerchantId: boolean, hasSecretKey: boolean }>}
 */
export async function savePlategaSettings(data) {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/admin/platega-settings', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      plategaMerchantId: (data.plategaMerchantId ?? '').toString().trim(),
      plategaSecretKey: (data.plategaSecretKey ?? '').toString().trim(),
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    console.error('[Platega] PATCH /api/admin/platega-settings failed:', { status: res.status, json })
    if (res.status === 400) throw new Error(json.error || 'Неверные данные')
    if (res.status === 403) throw new Error(json.hint || json.error || 'Доступ запрещён')
    if (res.status >= 500) throw new Error(json.error || 'Сервис недоступен. Проверьте, что backend запущен.')
    throw new Error(json.error || res.statusText || 'Ошибка сохранения настроек Platega')
  }
  return { hasMerchantId: !!json.hasMerchantId, hasSecretKey: !!json.hasSecretKey }
}
