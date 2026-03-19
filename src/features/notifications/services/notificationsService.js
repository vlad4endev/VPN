import { supabase } from '../../../lib/supabase/client.js'
import { auth } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'

const APP_ID_HEADER = 'X-App-Id'
import logger from '../../../shared/utils/logger.js'

const TABLE = 'vpn_firestore_documents'

/** Токен для API: приоритет Firebase Auth (если пользователь залогинен), иначе Supabase */
async function getAuthToken() {
  if (auth?.currentUser) {
    try {
      return await auth.currentUser.getIdToken()
    } catch (_) {}
  }
  if (supabase) {
    const { data, error } = await supabase.auth.getSession()
    if (error) return null
    return data?.session?.access_token || null
  }
  return null
}

export const notificationsService = {
  async getList(userId, options = {}) {
    if (!supabase || !userId) return []
    const { limit: limitCount = 50, unreadOnly = false } = options
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('app_id', APP_ID)
        .eq('collection_name', 'notifications')
        .contains('data', { userId })
        .order('source_created_at', { ascending: false })
        .limit(Math.min(limitCount, 100))

      if (error) throw error
      let items = (data || []).map((d) => ({ id: d.document_id, ...d.data }))
      if (unreadOnly) items = items.filter((n) => !n.read)
      return items
    } catch (err) {
      logger.error('Notifications', 'Ошибка загрузки списка', { userId }, err)
      return []
    }
  },

  async markAsRead(notificationId) {
    if (!supabase || !notificationId) return
    try {
      const { data: existing } = await supabase
        .from(TABLE)
        .select('data')
        .eq('document_id', notificationId)
        .eq('collection_name', 'notifications')
        .eq('app_id', APP_ID)
        .single()

      if (existing) {
        await supabase
          .from(TABLE)
          .update({ data: { ...existing.data, read: true } })
          .eq('document_id', notificationId)
          .eq('collection_name', 'notifications')
          .eq('app_id', APP_ID)
      }
    } catch (err) {
      logger.error('Notifications', 'Ошибка пометки прочитанным', { notificationId }, err)
    }
  },

  subscribe(userId, callback) {
    if (!supabase || !userId || typeof callback !== 'function') return () => {}

    let cancelled = false
    let timer = null
    let inFlight = false
    const poll = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        const items = await notificationsService.getList(userId)
        if (!cancelled) callback(items)
      } finally {
        inFlight = false
        if (!cancelled) {
          timer = setTimeout(poll, 10000)
        }
      }
    }
    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  },

  async createOne(payload) {
    if (!supabase) throw new Error('Supabase недоступен')
    const { userId, type, title, body, overview = null, data = null } = payload
    if (!userId || !type || !title || !body) throw new Error('userId, type, title, body обязательны')

    const notifId = crypto.randomUUID()
    const now = new Date().toISOString()
    const { error } = await supabase.from(TABLE).insert({
      app_id: APP_ID,
      document_path: `artifacts/${APP_ID}/public/data/notifications/${notifId}`,
      collection_path: `artifacts/${APP_ID}/public/data/notifications`,
      collection_name: 'notifications',
      document_id: notifId,
      data: {
        userId: String(userId),
        type: String(type),
        title: String(title),
        body: String(body),
        overview: overview != null ? String(overview) : null,
        read: false,
        createdAt: now,
        data: data && typeof data === 'object' ? data : null,
      },
      source_created_at: now,
    })
    if (error) throw error
  },

  async getTemplates() {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/admin/notifications/templates`, {
      headers: { Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
    const data = await res.json()
    return data.templates || []
  },

  async createTemplate(payload) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/admin/notifications/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
    return (await res.json()).id
  },

  async updateTemplate(id, payload) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/admin/notifications/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  },

  async deleteTemplate(id) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/admin/notifications/templates/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  },

  async getBroadcastHistory(params = {}) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
    const q = new URLSearchParams()
    if (params.limit) q.set('limit', String(params.limit))
    const res = await fetch(`${base}/api/admin/notifications/history${q.toString() ? `?${q.toString()}` : ''}`, {
      headers: { Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
    return (await res.json()).history || []
  },

  async broadcastViaApi(userIds, payload) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
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
    if (body.recipientFilter === 'userIds' && Array.isArray(userIds) && userIds.length > 0) body.userIds = userIds
    if (!body.templateId && (!body.title || !body.body)) throw new Error('Укажите title и body или выберите шаблон')

    const res = await fetch(`${base}/api/admin/notifications/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText || 'Ошибка рассылки')
    return res.json()
  },

  async sendToOne(userId, payload) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText || 'Ошибка отправки')
    return res.json()
  },

  async getScheduled(params = {}) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
    const q = new URLSearchParams()
    if (params.from) q.set('from', params.from)
    if (params.to) q.set('to', params.to)
    if (params.status) q.set('status', params.status)
    const res = await fetch(`${base}/api/admin/notifications/scheduled${q.toString() ? `?${q.toString()}` : ''}`, {
      headers: { Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
    return (await res.json()).scheduled || []
  },

  async createScheduled(payload) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/admin/notifications/scheduled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
    return (await res.json()).id
  },

  async updateScheduled(id, updates) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/admin/notifications/scheduled/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
      body: JSON.stringify(updates),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  },

  async deleteScheduled(id) {
    const token = await getAuthToken()
    if (!token) throw new Error('Требуется авторизация')
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/admin/notifications/scheduled/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, [APP_ID_HEADER]: APP_ID },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  },

  async broadcast(userIds, payload) {
    if (!supabase) throw new Error('Supabase недоступен')
    if (!Array.isArray(userIds) || userIds.length === 0) throw new Error('userIds обязателен')
    const { type, title, body, overview = null, data = null } = payload
    if (!type || !title || !body) throw new Error('type, title, body обязательны')
    const now = new Date().toISOString()

    const rows = userIds.map((uid) => {
      const notifId = crypto.randomUUID()
      return {
        app_id: APP_ID,
        document_path: `artifacts/${APP_ID}/public/data/notifications/${notifId}`,
        collection_path: `artifacts/${APP_ID}/public/data/notifications`,
        collection_name: 'notifications',
        document_id: notifId,
        data: {
          userId: String(uid),
          type: String(type),
          title: String(title),
          body: String(body),
          overview: overview != null ? String(overview) : null,
          read: false,
          createdAt: now,
          data: data && typeof data === 'object' ? data : null,
        },
        source_created_at: now,
      }
    })

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error } = await supabase.from(TABLE).insert(chunk)
      if (error) throw error
    }
  },
}
