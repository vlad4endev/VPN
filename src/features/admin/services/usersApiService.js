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
 * API-сервис для работы с пользователями через backend (создание через Firebase Admin).
 * Требуется авторизованный админ (Firebase ID token).
 */
export const usersApiService = {
  /**
   * Создание пользователя администратором.
   * @param {{ email: string, password: string, name: string, phone?: string, role?: string, plan?: string, tgId?: string, tariffId?: string, tariffName?: string, expiresAt?: string|number }} data
   * @returns {Promise<Object>} Созданный пользователь ({ id, ...fields })
   */
  async createUser(data) {
    const res = await fetch(`${getBaseUrl()}/api/admin/users`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(data),
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok || !json.success) {
      throw new Error(json.error || res.statusText || 'Ошибка создания пользователя')
    }

    return json.user
  },

  /**
   * Импорт пользователей из NocoDB (получить записи таблицы и создать аккаунты).
   * @param {{ baseUrl?: string, apiToken?: string, tableId?: string, defaultPassword: string, emailColumn?: string, nameColumn?: string, phoneColumn?: string, tgIdColumn?: string }} params
   * @returns {Promise<{ created: number, skipped: number, emptyRows?: number, errors: number, sampleRowKeys?: string[], details: Object }>}
   */
  async importFromNocoDB(params) {
    const res = await fetch(`${getBaseUrl()}/api/admin/import-from-nocodb`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(params),
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok || !json.success) {
      throw new Error(json.error || res.statusText || 'Ошибка импорта из NocoDB')
    }

    return {
      created: json.created ?? 0,
      skipped: json.skipped ?? 0,
      emptyRows: json.emptyRows ?? 0,
      errors: json.errors ?? 0,
      sampleRowKeys: Array.isArray(json.sampleRowKeys) ? json.sampleRowKeys : [],
      details: json.details ?? { created: [], skipped: [], errors: [] },
    }
  },
}

