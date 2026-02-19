/**
 * Сбор и агрегация метрик пользователей для AI-воронки.
 * Обновляет lastActiveAt при активности (VPN/приложение), считает сессии, оплаты, LTV.
 */

import { USER_METRICS_FIELDS } from './analytics.model.js'

const USER_METRICS_COLLECTION = 'user_metrics'
const USERS_COLLECTION = 'users_v4'
const PAYMENTS_COLLECTION = 'payments'
const TICKETS_COLLECTION = 'tickets'

/**
 * Путь к коллекции метрик.
 * @param {string} appId
 * @returns {string}
 */
export function getMetricsCollectionPath(appId) {
  return `artifacts/${appId}/public/data/${USER_METRICS_COLLECTION}`
}

/**
 * Путь к коллекции пользователей.
 */
function getUsersPath(appId) {
  return `artifacts/${appId}/public/data/${USERS_COLLECTION}`
}

function getPaymentsPath(appId) {
  return `artifacts/${appId}/public/data/${PAYMENTS_COLLECTION}`
}

function getTicketsPath(appId) {
  return `artifacts/${appId}/public/data/${TICKETS_COLLECTION}`
}

/** Ключевые фразы тикетов «не смогли воспользоваться / не работало» — для приоритета поощрений. */
const PROBLEM_TICKET_PATTERNS = [
  'не работа',
  'не работал',
  'не работало',
  'не работает',
  'не могу',
  'не смог',
  'не смогли',
  'не подключается',
  'не подключиться',
  'не получилось',
  'не удалось',
  'не могу подключиться',
  'не могу воспользоваться',
  'ошибка',
  'полом',
  'сломал',
  'не загруз',
  'не открыва',
  'не могу войти',
  'не входит',
]

/**
 * Является ли тикет «проблемным» (жалоба на невозможность воспользоваться или неработоспособность).
 * @param {string} subject - тема тикета
 * @param {string} [firstMessage] - первое сообщение (опционально)
 * @returns {boolean}
 */
function isProblemTicket(subject, firstMessage = '') {
  const text = `${(subject || '').toLowerCase()} ${(firstMessage || '').toLowerCase()}`
  return PROBLEM_TICKET_PATTERNS.some((p) => text.includes(p.toLowerCase()))
}

/**
 * Обновить lastActiveAt для пользователя (вызывать при подключении VPN или входе в приложение).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {string} userId
 * @param {string} [isoDate] - если не передано, используется текущее время
 * @returns {Promise<boolean>}
 */
export async function updateLastActiveAt(db, appId, userId, isoDate) {
  if (!db || !appId || !userId) return false
  const now = isoDate || new Date().toISOString()
  const metricsRef = db.doc(`${getMetricsCollectionPath(appId)}/${userId}`)
  const usersRef = db.doc(`${getUsersPath(appId)}/${userId}`)
  try {
    await db.runTransaction(async (tx) => {
      tx.set(metricsRef, { userId, lastActiveAt: now, updatedAt: new Date().toISOString() }, { merge: true })
      tx.set(usersRef, { lastActiveAt: now }, { merge: true })
    })
    return true
  } catch (err) {
    try {
      await metricsRef.set({ userId, lastActiveAt: now, updatedAt: new Date().toISOString() }, { merge: true })
      await usersRef.set({ lastActiveAt: now }, { merge: true })
      return true
    } catch (e) {
      console.warn('[analytics/metrics] updateLastActiveAt:', e.message)
      return false
    }
  }
}

/**
 * Подсчёт активных дней за последние N дней (по lastActiveAt или по сессиям).
 * @param {string[]} activeDates - массив ISO дат активности
 * @param {number} days
 * @returns {number}
 */
export function countActiveDays(activeDates, days = 30) {
  if (!Array.isArray(activeDates) || activeDates.length === 0) return 0
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const set = new Set()
  for (const d of activeDates) {
    const date = d ? new Date(d) : null
    if (date && !isNaN(date.getTime()) && date >= cutoff) set.add(date.toISOString().slice(0, 10))
  }
  return set.size
}

/**
 * Агрегировать метрики по одному пользователю из Firestore (users_v4, payments, tickets).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {string} userId
 * @returns {Promise<import('./analytics.model.js').UserMetrics|null>}
 */
export async function aggregateUserMetrics(db, appId, userId) {
  if (!db || !appId || !userId) return null
  const usersRef = db.collection(getUsersPath(appId))
  const paymentsRef = db.collection(getPaymentsPath(appId))
  const ticketsRef = db.collection(getTicketsPath(appId))

  const [userSnap, paymentsSnap, ticketsSnap] = await Promise.all([
    usersRef.doc(userId).get(),
    paymentsRef.where('userId', '==', userId).get(),
    ticketsRef.where('userId', '==', userId).get(),
  ])

  const user = userSnap.exists ? userSnap.data() : null
  if (!user) return null

  const completedPayments = paymentsSnap.docs.filter((d) => (d.data().status || '').toString().toLowerCase() === 'completed')
  const totalPayments = completedPayments.length
  let lifetimeValue = 0
  for (const d of completedPayments) {
    const amount = Number(d.data().amount)
    if (!Number.isNaN(amount)) lifetimeValue += amount
  }

  const supportTicketsCount = ticketsSnap.size
  let problemTicketsCount = 0
  const problemTicketSubjects = []
  for (const tDoc of ticketsSnap.docs) {
    const t = tDoc.data() || {}
    const subject = (t.subject || '').toString().trim()
    if (isProblemTicket(subject)) {
      problemTicketsCount += 1
      if (problemTicketSubjects.length < 5 && subject) problemTicketSubjects.push(subject.slice(0, 120))
    }
  }

  const registeredAt = user.createdAt || user.registeredAt || null
  const lastActiveAt = user.lastActiveAt || user.lastSeenDate || user.updatedAt || registeredAt
  const subscriptionExpiresAt = user.expiresAt || null
  const trafficUsedBytes = Number(user.trafficUsedBytes || user.trafficUsed || 0) || 0
  const planType = (user.plan || user.tariffName || user.tariffId || '').toString().trim()

  let totalSessions = Number(user.totalSessions) || 0
  let avgSessionDurationMinutes = Number(user.avgSessionDurationMinutes) || 0
  if (user.lastSeenTimestamp && user.sessionDurations && Array.isArray(user.sessionDurations)) {
    totalSessions = user.sessionDurations.length
    if (totalSessions > 0) {
      const sum = user.sessionDurations.reduce((a, b) => a + (Number(b) || 0), 0)
      avgSessionDurationMinutes = Math.round(sum / totalSessions / 60)
    }
  }

  const metrics = {
    ...USER_METRICS_FIELDS,
    userId,
    name: (user.name || '').toString().trim(),
    email: (user.email || '').toString().trim(),
    telegramId: (user.tgId || user.telegramId || '').toString().trim(),
    registeredAt,
    lastActiveAt,
    totalSessions,
    avgSessionDurationMinutes,
    subscriptionExpiresAt,
    totalPayments,
    lifetimeValue,
    supportTicketsCount,
    problemTicketsCount,
    problemTicketSubjects: problemTicketSubjects.length ? problemTicketSubjects : undefined,
    trafficUsedBytes,
    planType,
  }
  return metrics
}

/**
 * Сохранить агрегированные метрики в коллекцию user_metrics.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {import('./analytics.model.js').UserMetrics} metrics
 */
export async function saveUserMetrics(db, appId, metrics) {
  if (!db || !appId || !metrics || !metrics.userId) return
  const ref = db.doc(`${getMetricsCollectionPath(appId)}/${metrics.userId}`)
  await ref.set(
    {
      ...metrics,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

/**
 * Загрузить метрики пользователя из user_metrics или пересчитать из сырых данных.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {string} userId
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<import('./analytics.model.js').UserMetrics|null>}
 */
export async function getUserMetrics(db, appId, userId, opts = {}) {
  if (!db || !appId || !userId) return null
  if (!opts.forceRefresh) {
    const ref = db.doc(`${getMetricsCollectionPath(appId)}/${userId}`)
    const snap = await ref.get()
    if (snap.exists) return { ...USER_METRICS_FIELDS, ...snap.data() }
  }
  const aggregated = await aggregateUserMetrics(db, appId, userId)
  if (aggregated) await saveUserMetrics(db, appId, aggregated)
  return aggregated
}

/**
 * Загрузить метрики всех пользователей (батчами) и сохранить в user_metrics.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<number>} количество обработанных
 */
export async function refreshAllMetrics(db, appId, opts = {}) {
  if (!db || !appId) return 0
  const limit = Math.min(Math.max(0, opts.limit || 2000), 5000)
  const usersRef = db.collection(getUsersPath(appId))
  const snapshot = await usersRef.limit(limit).get()
  let count = 0
  const BATCH = 20
  for (let i = 0; i < snapshot.docs.length; i += BATCH) {
    const chunk = snapshot.docs.slice(i, i + BATCH)
    await Promise.all(
      chunk.map(async (doc) => {
        const metrics = await aggregateUserMetrics(db, appId, doc.id)
        if (metrics) {
          await saveUserMetrics(db, appId, metrics)
          count++
        }
      })
    )
  }
  return count
}
