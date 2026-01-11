// Функция определения статуса пользователя
// clientStats - опциональный параметр со статистикой из 3x-ui
export const getUserStatus = (user, clientStats = null) => {
  if (!user.uuid || user.uuid.trim() === '') {
    return { status: 'no-key', label: 'Нет ключа', color: 'text-slate-400' }
  }
  
  const now = Date.now()
  
  // Проверяем статус оплаты
  if (user.paymentStatus === 'test_period') {
    // Проверяем, не истек ли тестовый период
    if (user.testPeriodEndDate && user.testPeriodEndDate < now) {
      // Тестовый период истек - меняем статус на не оплачено
      return { status: 'unpaid', label: 'Не оплачено', color: 'text-red-400' }
    }
    // Тестовый период еще активен
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
    // expiryTime из 3x-ui в миллисекундах
    expiryTime = clientStats.expiryTime
  } else if (user.expiresAt) {
    // expiryTime из Firestore
    expiryTime = user.expiresAt
  }
  
  // Если срок истек - принудительно ставим статус 'Истек'
  if (expiryTime && expiryTime > 0 && expiryTime < now) {
    return { status: 'expired', label: 'Истек', color: 'text-red-400' }
  }
  
  return { status: 'active', label: 'Активен', color: 'text-green-400' }
}

