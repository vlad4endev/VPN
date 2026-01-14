/**
 * Форматирование даты в читаемый формат
 * @param {number|string|Date} timestamp - Timestamp или дата
 * @returns {string} Отформатированная дата
 */
export const formatDate = (timestamp) => {
  if (!timestamp) return 'Не указано'
  const date = new Date(timestamp)
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Форматирование оставшегося времени до окончания подписки
 * @param {number|string|Date} expiresAt - Timestamp окончания подписки
 * @returns {Object} Объект с разбивкой времени: { months, days, hours, minutes, totalMs }
 */
export const getTimeRemaining = (expiresAt) => {
  if (!expiresAt) {
    return { months: 0, days: 0, hours: 0, minutes: 0, totalMs: 0, isExpired: true }
  }

  const now = Date.now()
  const expiryTime = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime()
  const totalMs = expiryTime - now

  if (totalMs <= 0) {
    return { months: 0, days: 0, hours: 0, minutes: 0, totalMs: 0, isExpired: true }
  }

  // Вычисляем компоненты времени (от меньших к большим)
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60))
  const hours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  
  // Для расчета дней и месяцев используем даты для точности
  const nowDate = new Date(now)
  const expiryDate = new Date(expiryTime)
  
  // Вычисляем разницу в днях
  const daysDiff = Math.floor((expiryDate - nowDate) / (1000 * 60 * 60 * 24))
  const days = daysDiff % 30 // Остаток дней после месяцев
  
  // Вычисляем месяцы (приблизительно, используя 30 дней как среднее)
  const months = Math.floor(daysDiff / 30)

  return { months, days, hours, minutes, totalMs, isExpired: false }
}

/**
 * Форматирование оставшегося времени в читаемый формат
 * @param {number|string|Date} expiresAt - Timestamp окончания подписки
 * @returns {string} Отформатированная строка с оставшимся временем
 */
export function formatTimeRemaining(expiresAt) {
  const timeRemaining = getTimeRemaining(expiresAt)

  if (timeRemaining.isExpired) {
    return 'Истекла'
  }

  const parts = []
  
  if (timeRemaining.months > 0) {
    const monthWord = timeRemaining.months === 1 ? 'месяц' : 
                     timeRemaining.months < 5 ? 'месяца' : 'месяцев'
    parts.push(`${timeRemaining.months} ${monthWord}`)
  }
  
  if (timeRemaining.days > 0) {
    const dayWord = timeRemaining.days === 1 ? 'день' : 
                   timeRemaining.days < 5 ? 'дня' : 'дней'
    parts.push(`${timeRemaining.days} ${dayWord}`)
  }
  
  // Показываем часы только если нет месяцев или если осталось меньше месяца
  if (timeRemaining.hours > 0 && (timeRemaining.months === 0 || timeRemaining.days < 7)) {
    const hourWord = timeRemaining.hours === 1 ? 'час' : 
                    timeRemaining.hours < 5 ? 'часа' : 'часов'
    parts.push(`${timeRemaining.hours} ${hourWord}`)
  }
  
  // Показываем минуты только если осталось меньше дня
  if (timeRemaining.minutes > 0 && timeRemaining.months === 0 && timeRemaining.days === 0) {
    const minuteWord = timeRemaining.minutes === 1 ? 'минута' : 
                       timeRemaining.minutes < 5 ? 'минуты' : 'минут'
    parts.push(`${timeRemaining.minutes} ${minuteWord}`)
  }

  if (parts.length === 0) {
    return 'Меньше минуты'
  }

  return parts.join(', ')
}
