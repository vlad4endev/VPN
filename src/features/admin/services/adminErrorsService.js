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
 * Список последних ошибок для админа.
 * @param {{ limit?: number }} opts
 * @returns {Promise<{ errors: Array<{ id: string, source: string, message: string, context?: string, stack?: string, severity: string, userId?: string, telegramSent: boolean, createdAt: string }> }>}
 */
export async function getAdminErrors(opts = {}) {
  const limit = opts.limit != null ? Math.min(Math.max(0, opts.limit), 200) : 100
  const url = `${getApiBaseUrl()}/api/admin/errors${limit ? `?limit=${limit}` : ''}`
  const res = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    if (res.status === 403) throw new Error(json.error || 'Доступ запрещён')
    throw new Error(json.error || res.statusText || 'Ошибка загрузки списка ошибок')
  }
  return { errors: json.errors || [] }
}
