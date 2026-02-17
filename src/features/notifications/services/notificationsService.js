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
        logger.warn('Notifications', 'Подписка недоступна (правила или индекс Firestore)', { userId, code: err?.code || err?.message })
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
   * Рассылка уведомлений нескольким пользователям через бэкенд (обходит Firestore rules).
   * Требуется авторизованный админ (Firebase ID token в заголовке).
   * @param {string[]} userIds
   * @param {{ type: string, title: string, body: string, overview?: string }} payload
   */
  async broadcastViaApi(userIds, payload) {
    if (!Array.isArray(userIds) || userIds.length === 0) throw new Error('userIds обязателен')
    const { type, title, body, overview = null } = payload
    if (!type || !title || !body) throw new Error('type, title, body обязательны')
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    if (!token) throw new Error('Требуется авторизация')
    const base = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : ''
    const res = await fetch(`${base}/api/admin/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        [APP_ID_HEADER]: APP_ID,
      },
      body: JSON.stringify({
        userIds,
        type,
        title,
        body,
        overview: overview != null ? overview : undefined,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || res.statusText || 'Ошибка рассылки')
    }
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
