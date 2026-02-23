const MS_DAY = 24 * 60 * 60 * 1000
const EXPIRING_SOON_DAYS = 2   // Показывать «Истекает через X дней», если осталось меньше 2 дней
const GRACE_DAYS_AFTER_EXPIRY = 5 // «expired» и «Нет подписки» только через 5 дней после просрочки

import i18n from '../../i18n'

function t (key, opts = {}) {
  return i18n.t(key, opts)
}

/**
 * Нормализует дату окончания в миллисекунды.
 * Поддерживает: number (ms или секунды), Date, ISO-строка, Firestore Timestamp.
 */
function toExpiryMs (value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (Number.isFinite(value) && value > 0) {
      return value > 1e12 ? value : value * 1000 // уже ms или секунды
    }
    return null
  }
  // Firestore Timestamp (объект с toMillis или seconds)
  if (value && typeof value === 'object') {
    if (typeof value.toMillis === 'function') return value.toMillis()
    if (typeof value.toDate === 'function') return value.toDate().getTime()
    if (Number.isFinite(value.seconds)) return value.seconds * 1000
  }
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * Статус по дате окончания: active до конца срока, expiring_soon < 2 дней, grace 5 дней после, затем expired
 * @returns {Object|null} { status, label, color } или null если нет expiryTime
 */
export function getStatusFromExpiry (expiryTime, now = Date.now()) {
  const expiry = toExpiryMs(expiryTime)
  if (expiry == null || expiry <= 0) return null
  const msLeft = expiry - now
  const daysLeft = msLeft / MS_DAY
  const daysPast = -daysLeft

  if (msLeft > 0) {
    if (daysLeft < EXPIRING_SOON_DAYS) {
      const d = Math.ceil(daysLeft)
      const dayWord = d === 1 ? t('dashboard.day_one') : d < 5 ? t('dashboard.day_few') : t('dashboard.day_many')
      return { status: 'expiring_soon', label: t('status.expiringInDays', { count: d, dayWord }), color: 'text-yellow-400' }
    }
    return { status: 'active', label: t('status.active'), color: 'text-green-400' }
  }

  if (daysPast <= GRACE_DAYS_AFTER_EXPIRY) {
    const d = Math.ceil(daysPast)
    const dayWord = d === 1 ? t('dashboard.day_one') : d < 5 ? t('dashboard.day_few') : t('dashboard.day_many')
    return { status: 'grace', label: t('status.graceDays', { count: d, dayWord }), color: 'text-orange-400' }
  }

  return { status: 'expired', label: t('status.expired'), color: 'text-red-400' }
}

/**
 * Функция определения статуса пользователя
 *
 * Логика по дате окончания:
 * - До конца срока: status «active».
 * - Меньше 2 дней до конца: «expiring_soon», блок «Подписка истекает через X дней» + Продлить.
 * - До 5 дней после просрочки: «grace», подписка не прячется, можно продлить.
 * - Через 5+ дней после просрочки: «expired», только тогда «Нет подписки».
 *
 * @param {Object} user - Данные пользователя
 * @param {Object|null} clientStats - Опциональная статистика из 3x-ui
 * @param {Object|null} subscription - Опциональные данные подписки
 * @returns {Object} { status, label, color }
 */
export const getUserStatus = (user, clientStats = null, subscription = null) => {
  const now = Date.now()

  if (!user.uuid || user.uuid.trim() === '') {
    return { status: 'no-key', label: t('status.noKey'), color: 'text-slate-400' }
  }

  function getExpiryMs () {
    if (clientStats && clientStats.expiryTime) return toExpiryMs(clientStats.expiryTime)
    if (subscription?.expiresAt) return toExpiryMs(subscription.expiresAt)
    if (user.expiresAt) return toExpiryMs(user.expiresAt)
    return null
  }

  const expiryMs = getExpiryMs()

  if (subscription && subscription.status) {
    const subStatus = subscription.status

    switch (subStatus) {
      case 'pending_payment':
        return { status: 'pending', label: t('status.pendingPayment'), color: 'text-yellow-400' }

      case 'test_period': {
        const testEndDate = subscription.testPeriodEndDate || user.testPeriodEndDate
        const testEnd = testEndDate ? toExpiryMs(testEndDate) : null
        if (testEnd != null && testEnd < now) {
          const byDate = getStatusFromExpiry(testEnd, now)
          if (byDate) return byDate
          return { status: 'grace', label: t('status.overdue'), color: 'text-orange-400' }
        }
        const hoursLeft = testEnd ? Math.floor((testEnd - now) / (60 * 60 * 1000)) : 0
        const minutesLeft = testEnd ? Math.floor(((testEnd - now) % (60 * 60 * 1000)) / (60 * 1000)) : 0
        return { status: 'test_period', label: t('status.testRemaining', { hours: hoursLeft, minutes: minutesLeft }), color: 'text-yellow-400' }
      }

      case 'activating':
        return { status: 'activating', label: t('status.activating'), color: 'text-blue-400' }

      case 'active':
        if (expiryMs != null) return getStatusFromExpiry(expiryMs, now) || { status: 'active', label: t('status.active'), color: 'text-green-400' }
        return { status: 'active', label: t('status.active'), color: 'text-green-400' }

      case 'expired':
        if (expiryMs != null) return getStatusFromExpiry(expiryMs, now)
        return { status: 'expired', label: t('status.expired'), color: 'text-red-400' }

      case 'cancelled':
        return { status: 'cancelled', label: t('status.cancelled'), color: 'text-slate-400' }

      case 'failed':
        return { status: 'failed', label: t('status.activationError'), color: 'text-red-400' }

      default:
        if (expiryMs != null) return getStatusFromExpiry(expiryMs, now)
        return { status: 'unknown', label: t('status.unknown'), color: 'text-orange-400' }
    }
  }

  const hasExpiresAt = user.expiresAt && toExpiryMs(user.expiresAt) > 0
  const hasTariffId = user.tariffId && user.tariffId.trim() !== ''
  const hasPaymentStatus = user.paymentStatus && user.paymentStatus.trim() !== ''

  if (!hasExpiresAt && !hasTariffId && !hasPaymentStatus) {
    return { status: 'no-subscription', label: t('status.noSubscription'), color: 'text-slate-400' }
  }

  if (user.paymentStatus === 'test_period') {
    const testEnd = toExpiryMs(user.testPeriodEndDate)
    if (testEnd != null && testEnd < now) {
      const byDate = getStatusFromExpiry(testEnd, now)
      if (byDate) return byDate
    }
    if (user.testPeriodEndDate && user.testPeriodEndDate > now) {
      const hoursLeft = Math.floor((user.testPeriodEndDate - now) / (60 * 60 * 1000))
      const minutesLeft = Math.floor(((user.testPeriodEndDate - now) % (60 * 60 * 1000)) / (60 * 1000))
      return { status: 'test_period', label: t('status.testRemaining', { hours: hoursLeft, minutes: minutesLeft }), color: 'text-yellow-400' }
    }
  }

  if (user.paymentStatus === 'unpaid' && expiryMs != null) {
    return getStatusFromExpiry(expiryMs, now)
  }
  if (user.paymentStatus === 'unpaid') {
    return { status: 'unpaid', label: t('status.unpaid'), color: 'text-red-400' }
  }

  if (expiryMs != null) {
    return getStatusFromExpiry(expiryMs, now)
  }

  if (hasTariffId || hasPaymentStatus) {
    return { status: 'inactive', label: t('status.inactive'), color: 'text-orange-400' }
  }

  return { status: 'no-subscription', label: t('status.noSubscription'), color: 'text-slate-400' }
}

