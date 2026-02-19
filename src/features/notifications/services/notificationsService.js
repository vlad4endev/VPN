import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  onSnapshot,
  addDoc,
  writeBatch,
  getDoc,
} from 'firebase/firestore'
import { db, auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'

const APP_ID_HEADER = 'X-App-Id'
import logger from '../../../shared/utils/logger.js'

const NOTIFICATIONS_PATH = `artifacts/${APP_ID}/public/data/notifications`

/**
 * Сервис уведомлений: список, пометить прочитанным, подписка в реальном времени, создание (админ).
 */
export const notificationsService = {
  /**
   * Получить список уведомлений пользователя (последние сначала).
   * @param {string} userId
   * @param {{ limit?: number, unreadOnly?: boolean }} options
   */
  async getList(userId, options = {}) {
    if (!db || !userId) return []
    const { limit: limitCount = 50, unreadOnly = false } = options
    try {
      const coll = collection(db, NOTIFICATIONS_PATH)
      const q = query(
        coll,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(Math.min(limitCount, 100))
      )
      const snapshot = await getDocs(q)
      let items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      if (unreadOnly) items = items.filter((n) => !n.read)
      return items
    } catch (err) {
      logger.error('Notifications', 'Ошибка загрузки списка', { userId }, err)
      return []
    }
  },

  /**
   * Пометить уведомление как прочитанное.
   * @param {string} notificationId
   */
  async markAsRead(notificationId) {
    if (!db || !notificationId) return
    try {
      const ref = doc(db, NOTIFICATIONS_PATH, notificationId)
      await updateDoc(ref, { read: true })
    } catch (err) {
      logger.error('Notifications', 'Ошибка пометки прочитанным', { notificationId }, err)
    }
  },

  /**
   * Подписка на уведомления пользователя в реальном времени.
   * @param {string} userId
   * @param {(notifications: Array<{ id: string, ... }>) => void} callback
   * @returns {() => void} отписка
   */
  subscribe(userId, callback) {
    if (!db || !userId || typeof callback !== 'function') return () => {}
    const coll = collection(db, NOTIFICATIONS_PATH)
    const q = query(
      coll,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    )
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        callback(list)
      },
      (err) => {
        const code = err?.code || err?.message
        logger.warn(
          'Notifications',
          code === 'failed-precondition'
            ? 'Подписка недоступна: нужен составной индекс Firestore (userId + createdAt). Выполните: firebase deploy --only firestore:indexes'
            : 'Подписка недоступна (правила или индекс Firestore)',
          { userId, code }
        )
        callback([])
      }
    )
    return unsubscribe
  },

  /**
   * Создать одно уведомление (только админ; Firestore rules проверяют isAdmin).
   * @param {{ userId: string, type: string, title: string, body: string, overview?: string, data?: object }} payload
   */
  async createOne(payload) {
    if (!db) throw new Error('Firestore недоступен')
    const { userId, type, title, body, overview = null, data = null } = payload
    if (!userId || !type || !title || !body) throw new Error('userId, type, title, body обязательны')
    const coll = collection(db, NOTIFICATIONS_PATH)
    await addDoc(coll, {
      userId: String(userId),
      type: String(type),
      title: String(title),
      body: String(body),
      overview: overview != null ? String(overview) : null,
      read: false,
      createdAt: new Date().toISOString(),
      data: data && typeof data === 'object' ? data : null,
    })
  },

  /**
   * Список шаблонов уведомлений (админ).
   */
  async getTemplates() {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    if (!token) throw new Error('Требуется авторизация')
    const base = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : ''
    const res = await fetch(`${base}/api/admin/notifications/templates`, {
      headers: { Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
    const data = await res.json()
    return data.templates || []
  },

  async createTemplate(payload) {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    if (!token) throw new Error('Требуется авторизация')
    const base = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : ''
    const res = await fetch(`${base}/api/admin/notifications/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        [APP_ID_HEADER]: APP_ID,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || res.statusText)
    }
    const data = await res.json()
    return data.id
  },

  async updateTemplate(id, payload) {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    if (!token) throw new Error('Требуется авторизация')
    const base = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : ''
    const res = await fetch(`${base}/api/admin/notifications/templates/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        [APP_ID_HEADER]: APP_ID,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || res.statusText)
    }
  },

  async deleteTemplate(id) {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    if (!token) throw new Error('Требуется авторизация')
    const base = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : ''
    const res = await fetch(`${base}/api/admin/notifications/templates/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || res.statusText)
    }
  },

  /**
   * Рассылка уведомлений через бэкенд (шаблоны, фильтры, кнопки).
   * @param {string[]} [userIds] - при recipientFilter === 'userIds'
   * @param {{ type?: string, title?: string, body?: string, overview?: string, templateId?: string, recipientFilter?: 'userIds'|'all'|'plan'|'tariff', plan?: string, tariffId?: string, buttons?: { label: string, url: string }[] }} payload
   */
  async broadcastViaApi(userIds, payload) {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    if (!token) throw new Error('Требуется авторизация')
    const base = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : ''
    const body = {
      type: payload.type || 'admin_broadcast',
      title: payload.title != null ? String(payload.title).trim() : '',
      body: payload.body != null ? String(payload.body).trim() : '',
      overview: payload.overview != null ? String(payload.overview).trim() || null : undefined,
      templateId: payload.templateId || undefined,
      recipientFilter: payload.recipientFilter || (Array.isArray(userIds) && userIds.length > 0 ? 'userIds' : 'all'),
      plan: payload.plan || undefined,
      tariffId: payload.tariffId || undefined,
      buttons: Array.isArray(payload.buttons) ? payload.buttons : undefined,
    }
    if (body.recipientFilter === 'userIds' && Array.isArray(userIds) && userIds.length > 0) {
      body.userIds = userIds
    }
    if (!body.templateId && (!body.title || !body.body)) throw new Error('Укажите title и body или выберите шаблон')
    const res = await fetch(`${base}/api/admin/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        [APP_ID_HEADER]: APP_ID,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || res.statusText || 'Ошибка рассылки')
    }
    return res.json()
  },

  /**
   * Отправить одно уведомление пользователю (из карточки пользователя).
   * @param {string} userId
   * @param {{ templateId?: string, type?: string, title?: string, body?: string, overview?: string, buttons?: { label: string, url: string }[] }} payload
   */
  async sendToOne(userId, payload) {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    if (!token) throw new Error('Требуется авторизация')
    const base = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : ''
    const body = {
      userId: String(userId || '').trim(),
      templateId: payload.templateId || undefined,
      type: payload.type || 'admin_broadcast',
      title: payload.title != null ? String(payload.title).trim() : '',
      body: payload.body != null ? String(payload.body).trim() : '',
      overview: payload.overview != null ? String(payload.overview).trim() || null : undefined,
      buttons: Array.isArray(payload.buttons) ? payload.buttons : undefined,
    }
    if (!body.templateId && (!body.title || !body.body)) throw new Error('Укажите title и body или выберите шаблон')
    const res = await fetch(`${base}/api/admin/notifications/send-one`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        [APP_ID_HEADER]: APP_ID,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || res.statusText || 'Ошибка отправки')
    }
    return res.json()
  },

  /**
   * Рассылка уведомлений нескольким пользователям напрямую в Firestore (админ; требует правил Firestore).
   * @param {string[]} userIds
   * @param {{ type: string, title: string, body: string, overview?: string, data?: object }} payload
   */
  async broadcast(userIds, payload) {
    if (!db) throw new Error('Firestore недоступен')
    if (!Array.isArray(userIds) || userIds.length === 0) throw new Error('userIds обязателен')
    const { type, title, body, overview = null, data = null } = payload
    if (!type || !title || !body) throw new Error('type, title, body обязательны')
    const BATCH_SIZE = 500
    const coll = collection(db, NOTIFICATIONS_PATH)
    const createdAt = new Date().toISOString()
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      const chunk = userIds.slice(i, i + BATCH_SIZE)
      for (const uid of chunk) {
        const ref = doc(coll)
        batch.set(ref, {
          userId: String(uid),
          type: String(type),
          title: String(title),
          body: String(body),
          overview: overview != null ? String(overview) : null,
          read: false,
          createdAt,
          data: data && typeof data === 'object' ? data : null,
        })
      }
      await batch.commit()
    }
  },
}
