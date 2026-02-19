/**
 * Модель UserMetrics для AI-воронки аналитики.
 * Документы хранятся в Firestore: artifacts/{appId}/public/data/user_metrics (doc id = userId).
 * Архитектура расширяема для будущей подстановки ML-модели вместо правил в ai.engine.
 */

export const USER_METRICS_FIELDS = {
  userId: '',
  telegramId: '',
  registeredAt: null,
  lastActiveAt: null,
  totalSessions: 0,
  avgSessionDurationMinutes: 0,
  subscriptionExpiresAt: null,
  totalPayments: 0,
  lifetimeValue: 0,
  supportTicketsCount: 0,
  problemTicketsCount: 0,
  trafficUsedBytes: 0,
  planType: '',
}

/**
 * @typedef {Object} UserMetrics
 * @property {string} userId
 * @property {string} [telegramId]
 * @property {string|null} registeredAt - ISO date
 * @property {string|null} lastActiveAt - ISO date
 * @property {number} totalSessions
 * @property {number} avgSessionDurationMinutes
 * @property {string|null} subscriptionExpiresAt - ISO date
 * @property {number} totalPayments
 * @property {number} lifetimeValue
 * @property {number} supportTicketsCount
 * @property {number} trafficUsedBytes
 * @property {string} planType
 */

/** Сегменты воронки (расширяемо). */
export const SEGMENTS = Object.freeze({
  NEW: 'new',
  ACTIVE: 'active',
  RISK: 'risk',
  CHURNING: 'churning',
  LOST: 'lost',
})

export const SEGMENT_ORDER = [SEGMENTS.NEW, SEGMENTS.ACTIVE, SEGMENTS.RISK, SEGMENTS.CHURNING, SEGMENTS.LOST]
