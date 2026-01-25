/**
 * Функция определения статуса пользователя
 * 
 * КРИТИЧЕСКИ ВАЖНО: subscription.status - единственный источник правды для статуса подписки!
 * Если subscription передана, используется ТОЛЬКО subscription.status.
 * paymentStatus в user используется ТОЛЬКО для обратной совместимости (устаревший путь).
 * 
 * @param {Object} user - Данные пользователя
 * @param {Object|null} clientStats - Опциональная статистика из 3x-ui
 * @param {Object|null} subscription - Опциональные данные подписки (ПРИОРИТЕТНЫЙ источник статуса)
 * @returns {Object} { status, label, color }
 */
export const getUserStatus = (user, clientStats = null, subscription = null) => {
  const now = Date.now()
  
  // Если нет UUID - нет ключа
  if (!user.uuid || user.uuid.trim() === '') {
    return { status: 'no-key', label: 'Нет ключа', color: 'text-slate-400' }
  }
  
  // ПРИОРИТЕТ: Используем subscription.status как единственный источник правды
  if (subscription && subscription.status) {
    const subStatus = subscription.status
    
    switch (subStatus) {
      case 'pending_payment':
        return { status: 'pending', label: 'Ожидает оплаты', color: 'text-yellow-400' }
      
      case 'test_period':
        // Проверяем, не истек ли тестовый период
        const testEndDate = subscription.testPeriodEndDate || user.testPeriodEndDate
        if (testEndDate && testEndDate < now) {
          return { status: 'expired', label: 'Истек', color: 'text-red-400' }
        }
        const hoursLeft = testEndDate ? Math.floor((testEndDate - now) / (60 * 60 * 1000)) : 0
        const minutesLeft = testEndDate ? Math.floor(((testEndDate - now) % (60 * 60 * 1000)) / (60 * 1000)) : 0
        return { 
          status: 'test_period', 
          label: `Тест (осталось ${hoursLeft}ч ${minutesLeft}м)`, 
          color: 'text-yellow-400' 
        }
      
      case 'activating':
        return { status: 'activating', label: 'Активация...', color: 'text-blue-400' }
      
      case 'active':
        // Проверяем expiryTime: сначала из 3x-ui, затем из subscription, затем из user
        let expiryTime = null
        if (clientStats && clientStats.expiryTime) {
          expiryTime = clientStats.expiryTime
        } else if (subscription.expiresAt) {
          expiryTime = subscription.expiresAt
        } else if (user.expiresAt) {
          expiryTime = user.expiresAt
        }
        
        // Если срок истек - принудительно ставим статус 'Истек'
        if (expiryTime && expiryTime > 0 && expiryTime < now) {
          return { status: 'expired', label: 'Истек', color: 'text-red-400' }
        }
        
        return { status: 'active', label: 'Активен', color: 'text-green-400' }
      
      case 'expired':
        return { status: 'expired', label: 'Истек', color: 'text-red-400' }
      
      case 'cancelled':
        return { status: 'cancelled', label: 'Отменена', color: 'text-slate-400' }
      
      case 'failed':
        return { status: 'failed', label: 'Ошибка активации', color: 'text-red-400' }
      
      default:
        // Неизвестный статус подписки
        return { status: 'unknown', label: 'Неизвестный статус', color: 'text-orange-400' }
    }
  }
  
  // FALLBACK: Устаревший путь (для обратной совместимости)
  // Используется только если subscription не передана
  // ВАЖНО: Этот код должен быть удален после полной миграции на subscription.status
  
  // Проверяем, есть ли у пользователя подписка (старый способ)
  const hasExpiresAt = user.expiresAt && user.expiresAt > 0
  const hasTariffId = user.tariffId && user.tariffId.trim() !== ''
  const hasPaymentStatus = user.paymentStatus && user.paymentStatus.trim() !== ''
  
  // Если нет подписки (нет ни одного признака подписки)
  if (!hasExpiresAt && !hasTariffId && !hasPaymentStatus) {
    return { status: 'no-subscription', label: 'Нет подписки', color: 'text-slate-400' }
  }
  
  // Старая логика на основе paymentStatus (устаревшая)
  if (user.paymentStatus === 'test_period') {
    if (user.testPeriodEndDate && user.testPeriodEndDate < now) {
      return { status: 'unpaid', label: 'Не оплачено', color: 'text-red-400' }
    }
    
    if (user.expiresAt && user.testPeriodEndDate && user.expiresAt > user.testPeriodEndDate) {
      if (user.expiresAt > now) {
        return { status: 'active', label: 'Активен', color: 'text-green-400' }
      } else {
        return { status: 'expired', label: 'Истек', color: 'text-red-400' }
      }
    }
    
    const hoursLeft = Math.floor((user.testPeriodEndDate - now) / (60 * 60 * 1000))
    const minutesLeft = Math.floor(((user.testPeriodEndDate - now) % (60 * 60 * 1000)) / (60 * 1000))
    return { 
      status: 'test_period', 
      label: `Тест (осталось ${hoursLeft}ч ${minutesLeft}м)`, 
      color: 'text-yellow-400' 
    }
  }
  
  if (user.paymentStatus === 'unpaid') {
    return { status: 'unpaid', label: 'Не оплачено', color: 'text-red-400' }
  }
  
  // Приоритет: сначала проверяем expiryTime из 3x-ui, затем из Firestore
  let expiryTime = null
  if (clientStats && clientStats.expiryTime) {
    expiryTime = clientStats.expiryTime
  } else if (user.expiresAt) {
    expiryTime = user.expiresAt
  }
  
  // Если срок истек - принудительно ставим статус 'Истек'
  if (expiryTime && expiryTime > 0 && expiryTime < now) {
    return { status: 'expired', label: 'Истек', color: 'text-red-400' }
  }
  
  // Если есть expiresAt в будущем
  if (expiryTime && expiryTime > 0 && expiryTime > now) {
    return { status: 'active', label: 'Активен', color: 'text-green-400' }
  }
  
  // Если есть tariffId или paymentStatus, но нет expiresAt или он в прошлом
  if (hasTariffId || hasPaymentStatus) {
    if (!hasExpiresAt || (expiryTime && expiryTime < now)) {
      return { status: 'inactive', label: 'Неактивна', color: 'text-orange-400' }
    }
  }
  
  // По умолчанию - нет подписки
  return { status: 'no-subscription', label: 'Нет подписки', color: 'text-slate-400' }
}

