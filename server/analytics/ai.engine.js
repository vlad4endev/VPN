/**
 * AI Scoring Engine для воронки аналитики.
 * Рассчитывает churnScore, priorityScore, сегмент и стратегию возврата.
 * Архитектура расширяема: правила можно заменить на вызов ML-модели (например predictChurn(userId, metrics)).
 */

import { SEGMENTS } from './analytics.model.js'

const INACTIVE_DAYS_RISK = 14
const INACTIVE_DAYS_CHURNING = 30
const INACTIVE_DAYS_LOST = 60
const SUBSCRIPTION_DAYS_NEAR_EXPIRY = 7
const NEW_USER_DAYS = 14
const HIGH_LTV_THRESHOLD = 500
const MEDIUM_LTV_THRESHOLD = 150

/**
 * Дней неактивности по lastActiveAt.
 * @param {string|null} lastActiveAt - ISO date
 * @returns {number}
 */
export function getDaysInactive(lastActiveAt) {
  if (!lastActiveAt) return 999
  const t = new Date(lastActiveAt).getTime()
  if (Number.isNaN(t)) return 999
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)))
}

/**
 * Дней до окончания подписки.
 * @param {string|null} subscriptionExpiresAt - ISO date
 * @returns {number} положительное = дней до конца, отрицательное = уже истекло
 */
export function getDaysUntilExpiry(subscriptionExpiresAt) {
  if (!subscriptionExpiresAt) return 999
  const t = new Date(subscriptionExpiresAt).getTime()
  if (Number.isNaN(t)) return 999
  return Math.floor((t - Date.now()) / (24 * 60 * 60 * 1000))
}

/**
 * Рассчитать churnScore (0–100): выше = выше риск ухода.
 * Факторы: дни неактивности, близость окончания подписки, снижение активности, отсутствие оплат.
 * @param {import('./analytics.model.js').UserMetrics} metrics
 * @returns {{ churnScore: number, factors: object }}
 */
export function calculateChurnScore(metrics) {
  if (!metrics) return { churnScore: 0, factors: {} }
  const daysInactive = getDaysInactive(metrics.lastActiveAt)
  const daysUntilExpiry = getDaysUntilExpiry(metrics.subscriptionExpiresAt)
  const hasRecentPayment = (metrics.totalPayments || 0) > 0
  const subscriptionExpired = daysUntilExpiry < 0

  let score = 0
  const factors = {}

  if (subscriptionExpired) {
    const severity = Math.min(100, 40 + Math.min(30, Math.abs(daysUntilExpiry) / 3))
    score += severity
    factors.subscriptionExpired = severity
  } else if (daysUntilExpiry <= SUBSCRIPTION_DAYS_NEAR_EXPIRY) {
    const severity = 25 * (1 - daysUntilExpiry / SUBSCRIPTION_DAYS_NEAR_EXPIRY)
    score += severity
    factors.nearExpiry = severity
  }

  if (daysInactive >= INACTIVE_DAYS_LOST) {
    score += 35
    factors.longInactive = 35
  } else if (daysInactive >= INACTIVE_DAYS_CHURNING) {
    score += 25
    factors.inactiveChurning = 25
  } else if (daysInactive >= INACTIVE_DAYS_RISK) {
    score += 15
    factors.inactiveRisk = 15
  }

  if (!hasRecentPayment && (metrics.registeredAt ? getDaysInactive(metrics.registeredAt) > 30 : true)) {
    score += 15
    factors.noRecentPayments = 15
  }

  if ((metrics.totalSessions || 0) === 0 && daysInactive > 7) {
    score += 10
    factors.neverOrStoppedSessions = 10
  }

  const churnScore = Math.min(100, Math.round(score))
  return { churnScore, factors }
}

/**
 * Рассчитать priorityScore: высокий LTV + риск ухода = высокий приоритет для удержания.
 * @param {import('./analytics.model.js').UserMetrics} metrics
 * @param {number} churnScore
 * @returns {number} 0–100
 */
export function calculatePriorityScore(metrics, churnScore) {
  if (!metrics) return 0
  const ltv = metrics.lifetimeValue || 0
  const ltvComponent = Math.min(50, (ltv / HIGH_LTV_THRESHOLD) * 25)
  const churnComponent = Math.min(50, (churnScore / 100) * 50)
  return Math.min(100, Math.round(ltvComponent + churnComponent))
}

/**
 * Определить сегмент пользователя.
 * @param {import('./analytics.model.js').UserMetrics} metrics
 * @param {number} churnScore
 * @returns {string}
 */
export function getSegment(metrics, churnScore) {
  if (!metrics) return SEGMENTS.LOST
  const daysInactive = getDaysInactive(metrics.lastActiveAt)
  const registeredAt = metrics.registeredAt ? new Date(metrics.registeredAt).getTime() : 0
  const daysSinceRegistration = Number.isNaN(registeredAt) ? 999 : Math.floor((Date.now() - registeredAt) / (24 * 60 * 60 * 1000))

  if (daysSinceRegistration <= NEW_USER_DAYS) return SEGMENTS.NEW
  if (daysInactive >= INACTIVE_DAYS_LOST) return SEGMENTS.LOST
  if (daysInactive >= INACTIVE_DAYS_CHURNING || churnScore >= 70) return SEGMENTS.CHURNING
  if (daysInactive >= INACTIVE_DAYS_RISK || churnScore >= 50) return SEGMENTS.RISK
  return SEGMENTS.ACTIVE
}

/**
 * Рекомендуемая стратегия возврата: action, offerType, messageTone.
 * churnScore > 70 → персональная скидка; high LTV + risk → персональный менеджер; low LTV + risk → авто-скидка 20%.
 * @param {import('./analytics.model.js').UserMetrics} metrics
 * @param {number} churnScore
 * @param {string} segment
 * @returns {{ recommendedAction: string, offerType: string, messageTone: string }}
 */
export function getRetentionStrategy(metrics, churnScore, segment) {
  const ltv = (metrics && metrics.lifetimeValue) || 0
  const highLtv = ltv >= HIGH_LTV_THRESHOLD
  const mediumLtv = ltv >= MEDIUM_LTV_THRESHOLD

  if (segment === SEGMENTS.NEW) {
    return {
      recommendedAction: 'onboarding_sequence',
      offerType: 'first_purchase_discount',
      messageTone: 'friendly',
    }
  }
  if (segment === SEGMENTS.ACTIVE) {
    return {
      recommendedAction: 'nurture',
      offerType: 'none',
      messageTone: 'neutral',
    }
  }
  if (segment === SEGMENTS.LOST) {
    return {
      recommendedAction: 'win_back_campaign',
      offerType: 'win_back_30',
      messageTone: 'empathetic',
    }
  }

  if (churnScore > 70) {
    if (highLtv) {
      return { recommendedAction: 'personal_manager', offerType: 'personal_discount', messageTone: 'premium' }
    }
    if (mediumLtv) {
      return { recommendedAction: 'personal_offer', offerType: 'personal_discount', messageTone: 'caring' }
    }
    return { recommendedAction: 'auto_discount', offerType: 'discount_20', messageTone: 'friendly' }
  }

  if (segment === SEGMENTS.RISK) {
    if (highLtv) {
      return { recommendedAction: 'proactive_contact', offerType: 'loyalty_offer', messageTone: 'premium' }
    }
    return { recommendedAction: 'reminder_offer', offerType: 'discount_20', messageTone: 'friendly' }
  }

  return {
    recommendedAction: 'monitor',
    offerType: 'none',
    messageTone: 'neutral',
  }
}

/**
 * Полный расчёт по пользователю: churnScore, segment, priorityScore, стратегия возврата.
 * Расширяемо: вместо правил можно вызвать ML-модель и подставить её предсказания.
 * @param {import('./analytics.model.js').UserMetrics} metrics
 * @returns {{
 *   churnScore: number,
 *   segment: string,
 *   priorityScore: number,
 *   recommendedAction: string,
 *   offerType: string,
 *   messageTone: string,
 *   factors?: object
 * }}
 */
export function scoreUser(metrics) {
  const { churnScore, factors } = calculateChurnScore(metrics)
  const segment = getSegment(metrics, churnScore)
  const priorityScore = calculatePriorityScore(metrics, churnScore)
  const strategy = getRetentionStrategy(metrics, churnScore, segment)
  return {
    churnScore,
    segment,
    priorityScore,
    factors,
    ...strategy,
  }
}
