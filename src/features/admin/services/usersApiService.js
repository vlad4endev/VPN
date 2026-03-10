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
    const res = await fetch(`${getApiBaseUrl()}/api/admin/users`, {
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
   * Загрузка данных из NocoDB без создания пользователей (для окна сопоставления колонок).
   * @param {{ baseUrl: string, apiToken: string, tableId: string }} params
   * @returns {Promise<{ list: Object[], columns: string[] }>}
   */
  async fetchNocoDBPreview(params) {
    const baseUrl = getApiBaseUrl()
    const res = await fetch(`${baseUrl}/api/admin/import-from-nocodb/preview`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(params),
    })
    const json = await res.json().catch(() => ({}))
    if (res.status === 404) {
      throw new Error(
        'Эндпоинт импорта не найден (404). Убедитесь, что backend обновлён и запущен.',
      )
    }
    if (!res.ok || !json.success) {
      throw new Error(json.error || res.statusText || 'Ошибка загрузки данных из NocoDB')
    }
    return {
      list: Array.isArray(json.list) ? json.list : [],
      columns: Array.isArray(json.columns) ? json.columns : [],
    }
  },

  /**
   * Импорт пользователей из NocoDB (создать аккаунты по заданному маппингу колонок).
   * @param {Object} params — baseUrl, apiToken, tableId, emailColumn, nameColumn, phoneColumn, tgIdColumn, roleColumn, planColumn, writeBackToNocoDB, loginColumn, passwordColumn
   * @returns {Promise<{ created, skipped, emptyRows, errors, writeBackOk?, writeBackErrors?, details }>}
   */
  async importFromNocoDB(params) {
    const res = await fetch(`${getApiBaseUrl()}/api/admin/import-from-nocodb`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(params),
    })

    const json = await res.json().catch(() => ({}))

    if (res.status === 404) {
      throw new Error(
        'Эндпоинт импорта не найден (404). Убедитесь, что backend обновлён и запущен.',
      )
    }
    if (!res.ok || !json.success) {
      throw new Error(json.error || res.statusText || 'Ошибка импорта из NocoDB')
    }

    return {
      created: json.created ?? 0,
      updated: json.updated ?? 0,
      skipped: json.skipped ?? 0,
      emptyRows: json.emptyRows ?? 0,
      errors: json.errors ?? 0,
      writeBackOk: json.writeBackOk,
      writeBackErrors: json.writeBackErrors,
      sampleRowKeys: Array.isArray(json.sampleRowKeys) ? json.sampleRowKeys : [],
      details: json.details ?? { created: [], updated: [], skipped: [], errors: [] },
    }
  },

  /**
   * Получить сохранённые настройки импорта NocoDB (для автозагрузки и подстановки в форму).
   * @returns {Promise<{ config: Object | null }>}
   */
  async getSavedNocoDBImportConfig() {
    const baseUrl = getApiBaseUrl()
    const res = await fetch(`${baseUrl}/api/admin/import-from-nocodb/saved-config`, {
      method: 'GET',
      headers: await getAuthHeaders(),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || res.statusText || 'Ошибка загрузки настроек')
    return { config: json.config ?? null }
  },

  /**
   * Сохранить настройки импорта NocoDB на сервере (для ежедневной автозагрузки по расписанию).
   * @param {Object} params — те же поля, что у importFromNocoDB (baseUrl, apiToken, tableId, маппинг колонок, writeBack)
   */
  async saveNocoDBImportConfig(params) {
    const res = await fetch(`${getApiBaseUrl()}/api/admin/import-from-nocodb/save-config`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(params),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) throw new Error(json.error || res.statusText || 'Ошибка сохранения настроек')
    return json
  },
}

