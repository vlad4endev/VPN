import { supabase } from '../../../lib/supabase/client.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'

const TICKETS_TABLE = 'vpn_firestore_documents'

function ticketPath(ticketId) {
  return `artifacts/${APP_ID}/public/data/tickets/${ticketId}`
}

function ticketsCollectionPath() {
  return `artifacts/${APP_ID}/public/data/tickets`
}

function messagePath(ticketId, messageId) {
  return `artifacts/${APP_ID}/public/data/tickets/${ticketId}/messages/${messageId}`
}

function messagesCollectionPath(ticketId) {
  return `artifacts/${APP_ID}/public/data/tickets/${ticketId}/messages`
}

export const supportService = {
  async createTicket(user, subject, message) {
    if (!supabase || !user?.id) throw new Error('База данных недоступна или пользователь не авторизован')
    const trimmedSubject = (subject || '').trim()
    const trimmedMessage = (message || '').trim()
    if (!trimmedSubject || !trimmedMessage) throw new Error('Укажите тему и текст сообщения')

    try {
      const ticketId = crypto.randomUUID()
      const now = new Date().toISOString()
      const ticketData = {
        userId: user.id,
        userEmail: user.email || '',
        userName: user.name || user.email?.split('@')[0] || 'Пользователь',
        subject: trimmedSubject,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      }

      const { error: ticketErr } = await supabase.from(TICKETS_TABLE).insert({
        app_id: APP_ID,
        document_path: ticketPath(ticketId),
        collection_path: ticketsCollectionPath(),
        collection_name: 'tickets',
        document_id: ticketId,
        data: ticketData,
        source_created_at: now,
        source_updated_at: now,
      })
      if (ticketErr) throw ticketErr

      const messageId = crypto.randomUUID()
      const { error: msgErr } = await supabase.from(TICKETS_TABLE).insert({
        app_id: APP_ID,
        document_path: messagePath(ticketId, messageId),
        collection_path: messagesCollectionPath(ticketId),
        collection_name: 'messages',
        document_id: messageId,
        parent_document_path: ticketPath(ticketId),
        data: { from: 'user', userId: user.id, text: trimmedMessage, createdAt: now },
        source_created_at: now,
      })
      if (msgErr) throw msgErr

      logger.info('Support', 'Тикет создан', { ticketId, userId: user.id, subject: trimmedSubject })
      return { id: ticketId }
    } catch (err) {
      logger.error('Support', 'Ошибка создания тикета', { userId: user.id }, err)
      throw err
    }
  },

  async createTicketAsAdmin(adminUser, targetUser, subject, message) {
    if (!supabase || !adminUser?.id || !targetUser?.id) throw new Error('База данных недоступна или не указан админ/пользователь')
    const trimmedSubject = (subject || '').trim()
    const trimmedMessage = (message || '').trim()
    if (!trimmedSubject || !trimmedMessage) throw new Error('Укажите тему и текст сообщения')

    try {
      const ticketId = crypto.randomUUID()
      const now = new Date().toISOString()

      const { error: ticketErr } = await supabase.from(TICKETS_TABLE).insert({
        app_id: APP_ID,
        document_path: ticketPath(ticketId),
        collection_path: ticketsCollectionPath(),
        collection_name: 'tickets',
        document_id: ticketId,
        data: {
          userId: targetUser.id,
          userEmail: targetUser.email || '',
          userName: targetUser.name || targetUser.email?.split('@')[0] || 'Пользователь',
          subject: trimmedSubject,
          status: 'answered',
          createdAt: now,
          updatedAt: now,
        },
        source_created_at: now,
        source_updated_at: now,
      })
      if (ticketErr) throw ticketErr

      const messageId = crypto.randomUUID()
      const { error: msgErr } = await supabase.from(TICKETS_TABLE).insert({
        app_id: APP_ID,
        document_path: messagePath(ticketId, messageId),
        collection_path: messagesCollectionPath(ticketId),
        collection_name: 'messages',
        document_id: messageId,
        parent_document_path: ticketPath(ticketId),
        data: { from: 'support', userId: adminUser.id, text: trimmedMessage, createdAt: now },
        source_created_at: now,
      })
      if (msgErr) throw msgErr

      logger.info('Support', 'Тикет создан админом', { ticketId, targetUserId: targetUser.id })
      return { id: ticketId }
    } catch (err) {
      logger.error('Support', 'Ошибка создания тикета админом', { targetUserId: targetUser.id }, err)
      throw err
    }
  },

  async getTicketsByUser(userId, filter = 'all') {
    if (!supabase || !userId) return []
    try {
      let q = supabase
        .from(TICKETS_TABLE)
        .select('*')
        .eq('app_id', APP_ID)
        .eq('collection_name', 'tickets')
        .contains('data', { userId })
        .order('source_updated_at', { ascending: false })

      const { data, error } = await q
      if (error) throw error

      let list = (data || []).map((d) => ({ id: d.document_id, ...d.data }))
      if (filter === 'active') list = list.filter((t) => ['open', 'answered'].includes(t.status))
      else if (filter === 'archived') list = list.filter((t) => t.status === 'closed')
      return list
    } catch (err) {
      logger.error('Support', 'Ошибка загрузки тикетов', { userId }, err)
      throw err
    }
  },

  async getTicket(ticketId, userId, isAdmin = false) {
    if (!supabase || !ticketId) return null
    try {
      const { data: ticketDoc, error: ticketErr } = await supabase
        .from(TICKETS_TABLE)
        .select('*')
        .eq('app_id', APP_ID)
        .eq('document_id', ticketId)
        .eq('collection_name', 'tickets')
        .single()

      if (ticketErr || !ticketDoc) return null
      const ticketData = ticketDoc.data
      if (!isAdmin && ticketData.userId !== userId) return null

      const { data: msgDocs } = await supabase
        .from(TICKETS_TABLE)
        .select('*')
        .eq('app_id', APP_ID)
        .eq('collection_name', 'messages')
        .eq('parent_document_path', ticketPath(ticketId))
        .order('source_created_at', { ascending: true })

      const messages = (msgDocs || []).map((d) => ({ id: d.document_id, ...d.data }))
      return { id: ticketId, ...ticketData, messages }
    } catch (err) {
      logger.error('Support', 'Ошибка загрузки тикета', { ticketId }, err)
      throw err
    }
  },

  subscribeTicket(ticketId, userId, isAdmin, onUpdate) {
    if (!supabase || !ticketId || !onUpdate) return () => {}

    let cancelled = false
    let timer = null
    let inFlight = false
    const poll = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        const ticket = await this.getTicket(ticketId, userId, isAdmin)
        if (!cancelled && ticket) onUpdate(ticket, ticket.messages || [])
        else if (!cancelled) onUpdate(null, [])
      } catch (err) {
        if (!cancelled) {
          logger.warn('Support', 'subscribeTicket poll failed', { ticketId, userId }, err)
          onUpdate(null, [])
        }
      } finally {
        inFlight = false
        if (!cancelled) {
          timer = setTimeout(poll, 5000)
        }
      }
    }
    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  },

  async addMessage(ticketId, user, text, from = 'user') {
    if (!supabase || !ticketId || !user?.id) throw new Error('Недостаточно данных для отправки сообщения')
    const trimmed = (text || '').trim()
    if (!trimmed) throw new Error('Введите текст сообщения')

    try {
      const now = new Date().toISOString()
      const messageId = crypto.randomUUID()

      const { error: msgInsertErr } = await supabase.from(TICKETS_TABLE).insert({
        app_id: APP_ID,
        document_path: messagePath(ticketId, messageId),
        collection_path: messagesCollectionPath(ticketId),
        collection_name: 'messages',
        document_id: messageId,
        parent_document_path: ticketPath(ticketId),
        data: { from, userId: user.id, text: trimmed, createdAt: now },
        source_created_at: now,
      })
      if (msgInsertErr) throw msgInsertErr

      const newStatus = from === 'support' ? 'answered' : 'open'
      const { data: existing } = await supabase
        .from(TICKETS_TABLE)
        .select('data')
        .eq('document_id', ticketId)
        .eq('collection_name', 'tickets')
        .eq('app_id', APP_ID)
        .single()

      if (existing) {
        await supabase
          .from(TICKETS_TABLE)
          .update({ data: { ...existing.data, status: newStatus, updatedAt: now }, source_updated_at: now })
          .eq('document_id', ticketId)
          .eq('collection_name', 'tickets')
          .eq('app_id', APP_ID)
      }

      logger.info('Support', 'Сообщение добавлено', { ticketId, from, userId: user.id })
    } catch (err) {
      logger.error('Support', 'Ошибка добавления сообщения', { ticketId }, err)
      throw err
    }
  },

  async updateTicketStatus(ticketId, status) {
    if (!supabase || !ticketId) throw new Error('Не указан тикет')
    const allowed = ['open', 'answered', 'closed']
    if (!allowed.includes(status)) throw new Error('Недопустимый статус')

    try {
      const now = new Date().toISOString()
      const { data: existing } = await supabase
        .from(TICKETS_TABLE)
        .select('data')
        .eq('document_id', ticketId)
        .eq('collection_name', 'tickets')
        .eq('app_id', APP_ID)
        .single()

      if (existing) {
        await supabase
          .from(TICKETS_TABLE)
          .update({ data: { ...existing.data, status, updatedAt: now }, source_updated_at: now })
          .eq('document_id', ticketId)
          .eq('collection_name', 'tickets')
          .eq('app_id', APP_ID)
      }
      logger.info('Support', 'Статус тикета обновлён', { ticketId, status })
    } catch (err) {
      logger.error('Support', 'Ошибка обновления статуса', { ticketId }, err)
      throw err
    }
  },

  async getAllTickets(filter = 'all') {
    if (!supabase) return []
    try {
      const { data, error } = await supabase
        .from(TICKETS_TABLE)
        .select('*')
        .eq('app_id', APP_ID)
        .eq('collection_name', 'tickets')
        .order('source_updated_at', { ascending: false })

      if (error) throw error
      let list = (data || []).map((d) => ({ id: d.document_id, ...d.data }))
      if (filter === 'active') list = list.filter((t) => ['open', 'answered'].includes(t.status))
      else if (filter === 'archived') list = list.filter((t) => t.status === 'closed')
      return list
    } catch (err) {
      logger.error('Support', 'Ошибка загрузки всех тикетов', null, err)
      throw err
    }
  },
}
