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
 * API-сервис для работы с промокодами через backend (обходит Firestore rules).
 * Требуется авторизованный админ (Firebase ID token).
 */
export const promocodesApiService = {
  async loadPromocodes() {
    const res = await fetch(`${getBaseUrl()}/api/admin/promocodes`, {
      method: 'GET',
      headers: await getAuthHeaders(),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || res.statusText || 'Ошибка загрузки промокодов')
    }
    const json = await res.json()
    return json.promocodes || []
  },

  async createPromocode(data) {
    const res = await fetch(`${getBaseUrl()}/api/admin/promocodes`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || res.statusText || 'Ошибка создания промокода')
    }
    return res.json()
  },

  async updatePromocode(id, data) {
    const res = await fetch(`${getBaseUrl()}/api/admin/promocodes/${id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || res.statusText || 'Ошибка обновления промокода')
    }
    return res.json()
  },

  async deletePromocode(id) {
    const res = await fetch(`${getBaseUrl()}/api/admin/promocodes/${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || res.statusText || 'Ошибка удаления промокода')
    }
    return res.json()
  },
}
