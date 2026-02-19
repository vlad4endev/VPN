/**
 * Сервис аналитики: агрегация метрик, расчёт воронки, кэширование Redis.
 */

import { SEGMENTS, SEGMENT_ORDER } from './analytics.model.js'
import { getMetricsCollectionPath, getUserMetrics, refreshAllMetrics } from './metrics.service.js'
import { scoreUser } from './ai.engine.js'

const FUNNEL_CACHE_TTL_SEC = 120
const USER_ANALYTICS_CACHE_TTL_SEC = 60
const CACHE_KEY_FUNNEL = 'analytics:funnel'
const CACHE_KEY_USER_PREFIX = 'analytics:user:'

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {(key: string) => Promise<string|null>} redisGet
 * @param {(key: string, value: string, ttl?: number) => Promise<void>} redisSet
 */
export async function getFunnel(db, appId, redisGet, redisSet) {
  const cached = redisGet ? await redisGet(CACHE_KEY_FUNNEL) : null
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch (_) {}
  }

  const metricsRef = db.collection(getMetricsCollectionPath(appId))
  const snapshot = await metricsRef.limit(5000).get()

  const segmentCounts = {}
  SEGMENT_ORDER.forEach((s) => { segmentCounts[s] = 0 })

  const usersWithScores = []
  let churnSum = 0
  let count = 0

  const now = Date.now()
  const EXPIRED_DAYS_MS = 30 * 24 * 60 * 60 * 1000
  const expiredThreshold = now - EXPIRED_DAYS_MS

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const metrics = { userId: doc.id, ...data }
    const result = scoreUser(metrics)
    segmentCounts[result.segment] = (segmentCounts[result.segment] || 0) + 1
    churnSum += result.churnScore
    count += 1
    const expiresAt = metrics.subscriptionExpiresAt
    const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : null
    const problemTicketsCount = data.problemTicketsCount ?? 0
    usersWithScores.push({
      userId: metrics.userId,
      name: metrics.name ?? '',
      email: metrics.email ?? '',
      ...result,
      lifetimeValue: metrics.lifetimeValue ?? 0,
      subscriptionExpiresAt: expiresAt || null,
      subscriptionExpired: expiresAtMs != null && !Number.isNaN(expiresAtMs) && expiresAtMs < now,
      problemTicketsCount,
      hasProblemTickets: problemTicketsCount > 0,
      problemTicketSubjects: data.problemTicketSubjects || [],
    })
  }

  const topByPriority = [...usersWithScores]
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
    .slice(0, 20)

  // Только те, у кого нет подписки или подписка давно просрочена и не продлевалась (expiresAt > 30 дней назад)
  const noSubscriptionOrExpired = [...usersWithScores]
    .filter((u) => {
      const exp = u.subscriptionExpiresAt
      if (!exp) return true
      const ms = new Date(exp).getTime()
      return Number.isNaN(ms) || ms < expiredThreshold
    })
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
    .slice(0, 50)

  const avgChurnScore = count > 0 ? Math.round((churnSum / count) * 10) / 10 : 0
  const riskCount = (segmentCounts[SEGMENTS.RISK] || 0) + (segmentCounts[SEGMENTS.CHURNING] || 0)
  const churnForecast = {
    atRiskUsers: riskCount,
    estimatedChurnRate: count > 0 ? Math.round((riskCount / count) * 1000) / 10 : 0,
  }

  const funnel = {
    segments: segmentCounts,
    topByPriority,
    noSubscriptionOrExpired,
    avgChurnScore,
    churnForecast,
    totalUsers: count,
  }

  if (redisSet) {
    try {
      await redisSet(CACHE_KEY_FUNNEL, JSON.stringify(funnel), FUNNEL_CACHE_TTL_SEC)
    } catch (_) {}
  }
  return funnel
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {string} userId
 * @param {(key: string) => Promise<string|null>} redisGet
 * @param {(key: string, value: string, ttl?: number) => Promise<void>} redisSet
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function getUserAnalytics(db, appId, userId, redisGet, redisSet, opts = {}) {
  const cacheKey = CACHE_KEY_USER_PREFIX + userId
  if (!opts.forceRefresh && redisGet) {
    const cached = await redisGet(cacheKey)
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch (_) {}
    }
  }

  const metrics = await getUserMetrics(db, appId, userId, { forceRefresh: opts.forceRefresh })
  if (!metrics) return null

  const result = scoreUser(metrics)
  const response = {
    userId: metrics.userId,
    segment: result.segment,
    churnScore: result.churnScore,
    priorityScore: result.priorityScore,
    lifetimeValue: metrics.lifetimeValue ?? 0,
    recommendedAction: result.recommendedAction,
    offerType: result.offerType,
    messageTone: result.messageTone,
    metrics: {
      lastActiveAt: metrics.lastActiveAt,
      totalPayments: metrics.totalPayments,
      subscriptionExpiresAt: metrics.subscriptionExpiresAt,
      supportTicketsCount: metrics.supportTicketsCount,
      telegramId: metrics.telegramId || undefined,
    },
  }

  if (redisSet) {
    try {
      await redisSet(cacheKey, JSON.stringify(response), USER_ANALYTICS_CACHE_TTL_SEC)
    } catch (_) {}
  }
  return response
}

/**
 * Обновить метрики по всем пользователям (для админки или крона).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {{ limit?: number }} [opts]
 */
export async function refreshMetrics(db, appId, opts = {}) {
  return refreshAllMetrics(db, appId, opts)
}

/**
 * Сформировать текст персонального оффера для Telegram по стратегии.
 * @param {{ offerType: string, messageTone: string, segment?: string }} strategy
 * @returns {string}
 */
export function buildChurnOfferMessage(strategy) {
  const tone = strategy.messageTone || 'friendly'
  const offer = strategy.offerType || 'discount_20'
  const lines = []
  if (tone === 'premium') {
    lines.push('Здравствуйте! Вы для нас важный клиент.')
  } else if (tone === 'empathetic') {
    lines.push('Мы скучали! Хотим вернуть вас обратно.')
  } else {
    lines.push('Здравствуйте! У нас для вас специальное предложение.')
  }
  if (offer === 'personal_discount') lines.push('Персональная скидка на продление подписки — напишите в поддержку.')
  else if (offer === 'discount_20') lines.push('Скидка 20% на продление по промокоду: COMEBACK20')
  else if (offer === 'win_back_30') lines.push('Специальное предложение для возвращения — скидка 30%. Напишите в поддержку.')
  else if (offer === 'loyalty_offer') lines.push('Предложение лояльности — детали в поддержке.')
  else lines.push('Продлите подписку по выгодной цене. Подробности в поддержке.')
  return lines.join('\n\n')
}
