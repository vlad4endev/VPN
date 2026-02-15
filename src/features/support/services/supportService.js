import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'

const TICKETS_PATH = `artifacts/${APP_ID}/public/data/tickets`

/**
 * Сервис тикетов техподдержки.
 * Тикеты: collection tickets. Сообщения: subcollection tickets/{id}/messages.
 */
export const supportService = {
  /**
   * Создать тикет (пользователь).
   * @param {Object} user - { id, email, name }
   * @param {string} subject - тема
   * @param {string} message - первое сообщение
   * @returns {Promise<{ id: string }>}
   */
  async createTicket(user, subject, message) {
    if (!db || !user?.id) {
      throw new Error('База данных недоступна или пользователь не авторизован')
    }
    const trimmedSubject = (subject || '').trim()
    const trimmedMessage = (message || '').trim()
    if (!trimmedSubject || !trimmedMessage) {
      throw new Error('Укажите тему и текст сообщения')
    }

    try {
      const ticketsRef = collection(db, TICKETS_PATH)
      const ticketRef = await addDoc(ticketsRef, {
        userId: user.id,
        userEmail: user.email || '',
        userName: user.name || user.email?.split('@')[0] || 'Пользователь',
        subject: trimmedSubject,
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const messagesRef = collection(db, TICKETS_PATH, ticketRef.id, 'messages')
      await addDoc(messagesRef, {
        from: 'user',
        userId: user.id,
        text: trimmedMessage,
        createdAt: new Date().toISOString(),
      })

      logger.info('Support', 'Тикет создан', {
        ticketId: ticketRef.id,
        userId: user.id,
        subject: trimmedSubject,
      })
      return { id: ticketRef.id }
    } catch (err) {
      logger.error('Support', 'Ошибка создания тикета', { userId: user.id }, err)
      throw err
    }
  },

  /**
   * Создать тикет от имени поддержки (админ → пользователь).
   * @param {Object} adminUser - { id } — текущий админ
   * @param {Object} targetUser - { id, email?, name? } — пользователь, которому открывается тикет
   * @param {string} subject - тема
   * @param {string} message - первое сообщение от поддержки
   * @returns {Promise<{ id: string }>}
   */
  async createTicketAsAdmin(adminUser, targetUser, subject, message) {
    if (!db || !adminUser?.id || !targetUser?.id) {
      throw new Error('База данных недоступна или не указан админ/пользователь')
    }
    const trimmedSubject = (subject || '').trim()
    const trimmedMessage = (message || '').trim()
    if (!trimmedSubject || !trimmedMessage) {
      throw new Error('Укажите тему и текст сообщения')
    }

    try {
      const ticketsRef = collection(db, TICKETS_PATH)
      const ticketRef = await addDoc(ticketsRef, {
        userId: targetUser.id,
        userEmail: targetUser.email || '',
        userName: targetUser.name || targetUser.email?.split('@')[0] || 'Пользователь',
        subject: trimmedSubject,
        status: 'answered',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const messagesRef = collection(db, TICKETS_PATH, ticketRef.id, 'messages')
      await addDoc(messagesRef, {
        from: 'support',
        userId: adminUser.id,
        text: trimmedMessage,
        createdAt: new Date().toISOString(),
      })

      logger.info('Support', 'Тикет создан админом', {
        ticketId: ticketRef.id,
        targetUserId: targetUser.id,
        subject: trimmedSubject,
      })
      return { id: ticketRef.id }
    } catch (err) {
      logger.error('Support', 'Ошибка создания тикета админом', { targetUserId: targetUser.id }, err)
      throw err
    }
  },

  /**
   * Список тикетов пользователя.
   * @param {string} userId
   * @returns {Promise<Array<{ id, ... }>>}
   */
  async getTicketsByUser(userId) {
    if (!db || !userId) return []

    try {
      const ticketsRef = collection(db, TICKETS_PATH)
      const q = query(
        ticketsRef,
        where('userId', '==', userId),
        orderBy('updatedAt', 'desc')
      )
      const snapshot = await getDocs(q)
      const list = []
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }))
      return list
    } catch (err) {
      logger.error('Support', 'Ошибка загрузки тикетов', { userId }, err)
      throw err
    }
  },

  /**
   * Один тикет по id (проверка доступа по userId или админ).
   * @param {string} ticketId
   * @param {string} userId - текущий пользователь
   * @param {boolean} isAdmin
   * @returns {Promise<{ id, messages: [] } | null>}
   */
  async getTicket(ticketId, userId, isAdmin = false) {
    if (!db || !ticketId) return null

    try {
      const ticketRef = doc(db, TICKETS_PATH, ticketId)
      const ticketSnap = await getDoc(ticketRef)
      if (!ticketSnap.exists()) return null

      const data = ticketSnap.data()
      if (!isAdmin && data.userId !== userId) {
        logger.warn('Support', 'Нет доступа к тикету', { ticketId, userId })
        return null
      }

      const messagesRef = collection(db, TICKETS_PATH, ticketId, 'messages')
      const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'))
      const messagesSnap = await getDocs(messagesQuery)
      const messages = []
      messagesSnap.forEach((d) => messages.push({ id: d.id, ...d.data() }))

      return {
        id: ticketSnap.id,
        ...data,
        messages,
      }
    } catch (err) {
      logger.error('Support', 'Ошибка загрузки тикета', { ticketId }, err)
      throw err
    }
  },

  /**
   * Подписка на тикет в реальном времени (для чата).
   * @param {string} ticketId
   * @param {string} userId
   * @param {boolean} isAdmin
   * @param {function} onUpdate - (ticket, messages) => void
   * @returns {function} unsubscribe
   */
  subscribeTicket(ticketId, userId, isAdmin, onUpdate) {
    if (!db || !ticketId || !onUpdate) return () => {}

    const ticketRef = doc(db, TICKETS_PATH, ticketId)
    const messagesRef = collection(db, TICKETS_PATH, ticketId, 'messages')
    const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'))

    let ticketData = null
    let lastMessages = []

    const unsubTicket = onSnapshot(ticketRef, (ticketSnap) => {
      if (!ticketSnap.exists()) {
        ticketData = null
        onUpdate(null, [])
        return
      }
      const data = ticketSnap.data()
      if (!isAdmin && data.userId !== userId) {
        ticketData = null
        onUpdate(null, [])
        return
      }
      ticketData = { id: ticketSnap.id, ...data }
      onUpdate(ticketData, lastMessages)
    })

    const unsubMessages = onSnapshot(messagesQuery, (messagesSnap) => {
      lastMessages = []
      messagesSnap.forEach((d) => lastMessages.push({ id: d.id, ...d.data() }))
      if (ticketData) onUpdate(ticketData, lastMessages)
    })

    return () => {
      unsubTicket()
      unsubMessages()
    }
  },

  /**
   * Добавить сообщение в тикет.
   * @param {string} ticketId
   * @param {Object} user - { id }
   * @param {string} text
   * @param {'user'|'support'} from - user или support (админ)
   * @returns {Promise<void>}
   */
  async addMessage(ticketId, user, text, from = 'user') {
    if (!db || !ticketId || !user?.id) {
      throw new Error('Недостаточно данных для отправки сообщения')
    }
    const trimmed = (text || '').trim()
    if (!trimmed) throw new Error('Введите текст сообщения')

    try {
      const ticketRef = doc(db, TICKETS_PATH, ticketId)
      const ticketSnap = await getDoc(ticketRef)
      if (!ticketSnap.exists()) throw new Error('Тикет не найден')

      const ticketData = ticketSnap.data()
      const isAdmin = false // вызывающий код передаёт право; здесь только проверка владельца для from===user
      if (from === 'user' && ticketData.userId !== user.id) {
        throw new Error('Нет доступа к этому тикету')
      }

      const messagesRef = collection(db, TICKETS_PATH, ticketId, 'messages')
      await addDoc(messagesRef, {
        from,
        userId: user.id,
        text: trimmed,
        createdAt: new Date().toISOString(),
      })

      const newStatus = from === 'support' ? 'answered' : 'open'
      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      })

      logger.info('Support', 'Сообщение добавлено', {
        ticketId,
        from,
        userId: user.id,
      })
    } catch (err) {
      logger.error('Support', 'Ошибка добавления сообщения', { ticketId }, err)
      throw err
    }
  },

  /**
   * Обновить статус тикета (админ: open, answered, closed).
   * @param {string} ticketId
   * @param {string} status
   */
  async updateTicketStatus(ticketId, status) {
    if (!db || !ticketId) throw new Error('Не указан тикет')
    const allowed = ['open', 'answered', 'closed']
    if (!allowed.includes(status)) throw new Error('Недопустимый статус')

    try {
      const ticketRef = doc(db, TICKETS_PATH, ticketId)
      await updateDoc(ticketRef, {
        status,
        updatedAt: new Date().toISOString(),
      })
      logger.info('Support', 'Статус тикета обновлён', { ticketId, status })
    } catch (err) {
      logger.error('Support', 'Ошибка обновления статуса', { ticketId }, err)
      throw err
    }
  },

  /**
   * Все тикеты (для админа).
   * @returns {Promise<Array<{ id, ... }>>}
   */
  async getAllTickets() {
    if (!db) return []

    try {
      const ticketsRef = collection(db, TICKETS_PATH)
      const q = query(ticketsRef, orderBy('updatedAt', 'desc'))
      const snapshot = await getDocs(q)
      const list = []
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }))
      return list
    } catch (err) {
      logger.error('Support', 'Ошибка загрузки всех тикетов', null, err)
      throw err
    }
  },
}
