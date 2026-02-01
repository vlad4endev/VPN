const MS_DAY = 24 * 60 * 60 * 1000
const EXPIRING_SOON_DAYS = 2   // Показывать «Истекает через X дней», если осталось меньше 2 дней
const GRACE_DAYS_AFTER_EXPIRY = 5 // «expired» и «Нет подписки» только через 5 дней после просрочки

/**
 * Нормализует дату окончания в миллисекунды
 */
function toExpiryMs (value) {
  if (value == null || value === 0) return null
  if (typeof value === 'number' && value > 1e12) return value // уже ms
  if (typeof value === 'number') return value
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
      const dayWord = d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'
      return { status: 'expiring_soon', label: `Истекает через ${d} ${dayWord}`, color: 'text-yellow-400' }
    }
    return { status: 'active', label: 'Активен', color: 'text-green-400' }
  }

  if (daysPast <= GRACE_DAYS_AFTER_EXPIRY) {
    const d = Math.ceil(daysPast)
    const dayWord = d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'
    return { status: 'grace', label: `Просрочено ${d} ${dayWord}`, color: 'text-orange-400' }
  }

  return { status: 'expired', label: 'Истек', color: 'text-red-400' }
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
    return { status: 'no-key', label: 'Нет ключа', color: 'text-slate-400' }
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
        return { status: 'pending', label: 'Ожидает оплаты', color: 'text-yellow-400' }

      case 'test_period': {
        const testEndDate = subscription.testPeriodEndDate || user.testPeriodEndDate
        const testEnd = testEndDate ? toExpiryMs(testEndDate) : null
        if (testEnd != null && testEnd < now) {
          const byDate = getStatusFromExpiry(testEnd, now)
          if (byDate) return byDate
          return { status: 'grace', label: 'Просрочено', color: 'text-orange-400' }
        }
        const hoursLeft = testEnd ? Math.floor((testEnd - now) / (60 * 60 * 1000)) : 0
        const minutesLeft = testEnd ? Math.floor(((testEnd - now) % (60 * 60 * 1000)) / (60 * 1000)) : 0
        return { status: 'test_period', label: `Тест (осталось ${hoursLeft}ч ${minutesLeft}м)`, color: 'text-yellow-400' }
      }

      case 'activating':
        return { status: 'activating', label: 'Активация...', color: 'text-blue-400' }

      case 'active':
        if (expiryMs != null) return getStatusFromExpiry(expiryMs, now) || { status: 'active', label: 'Активен', color: 'text-green-400' }
        return { status: 'active', label: 'Активен', color: 'text-green-400' }

      case 'expired':
        if (expiryMs != null) return getStatusFromExpiry(expiryMs, now)
        return { status: 'expired', label: 'Истек', color: 'text-red-400' }

      case 'cancelled':
        return { status: 'cancelled', label: 'Отменена', color: 'text-slate-400' }

      case 'failed':
        return { status: 'failed', label: 'Ошибка активации', color: 'text-red-400' }

      default:
        if (expiryMs != null) return getStatusFromExpiry(expiryMs, now)
        return { status: 'unknown', label: 'Неизвестный статус', color: 'text-orange-400' }
    }
  }

  const hasExpiresAt = user.expiresAt && toExpiryMs(user.expiresAt) > 0
  const hasTariffId = user.tariffId && user.tariffId.trim() !== ''
  const hasPaymentStatus = user.paymentStatus && user.paymentStatus.trim() !== ''

  if (!hasExpiresAt && !hasTariffId && !hasPaymentStatus) {
    return { status: 'no-subscription', label: 'Нет подписки', color: 'text-slate-400' }
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
      return { status: 'test_period', label: `Тест (осталось ${hoursLeft}ч ${minutesLeft}м)`, color: 'text-yellow-400' }
    }
  }

  if (user.paymentStatus === 'unpaid' && expiryMs != null) {
    return getStatusFromExpiry(expiryMs, now)
  }
  if (user.paymentStatus === 'unpaid') {
    return { status: 'unpaid', label: 'Не оплачено', color: 'text-red-400' }
  }

  if (expiryMs != null) {
    return getStatusFromExpiry(expiryMs, now)
  }

  if (hasTariffId || hasPaymentStatus) {
    return { status: 'inactive', label: 'Неактивна', color: 'text-orange-400' }
  }

  return { status: 'no-subscription', label: 'Нет подписки', color: 'text-slate-400' }
}

