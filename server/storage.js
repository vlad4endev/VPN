/**
 * Модуль для хранения данных о платежах
 * 
 * ВАЖНО: Это минимальная реализация для прототипа.
 * В продакшене рекомендуется использовать базу данных (PostgreSQL, MongoDB, Firestore и т.д.)
 * 
 * Для интеграции с n8n:
 * - n8n будет опрашивать operation-history ЮMoney по label (orderId)
 * - После успешной оплаты n8n обновит статус через этот модуль или напрямую в БД
 */

// In-memory хранилище (для прототипа)
// В продакшене заменить на реальную БД
const payments = new Map()

/**
 * Сохранить новый платеж
 * @param {string} orderId - Уникальный идентификатор заказа
 * @param {string} label - Метка платежа (обычно = orderId)
 * @param {string} status - Статус платежа ('pending', 'completed', 'failed')
 * @param {Object} additionalData - Дополнительные данные (amount, userId, tariffId и т.д.)
 * @returns {Object} Сохраненная запись
 */
export function savePayment(orderId, label, status = 'pending', additionalData = {}) {
  const payment = {
    orderId,
    label,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...additionalData
  }
  
  payments.set(orderId, payment)
  
  console.log(`💾 Payment saved: ${orderId} (${status})`)
  
  return payment
}

/**
 * Получить платеж по orderId
 * @param {string} orderId - Уникальный идентификатор заказа
 * @returns {Object|null} Данные платежа или null, если не найден
 */
export function getPayment(orderId) {
  const payment = payments.get(orderId)
  
  if (!payment) {
    console.log(`⚠️ Payment not found: ${orderId}`)
    return null
  }
  
  return payment
}

/**
 * Обновить статус платежа
 * @param {string} orderId - Уникальный идентификатор заказа
 * @param {string} status - Новый статус
 * @param {Object} updateData - Дополнительные данные для обновления
 * @returns {Object|null} Обновленная запись или null, если не найдена
 */
export function updatePaymentStatus(orderId, status, updateData = {}) {
  const payment = payments.get(orderId)
  
  if (!payment) {
    console.log(`⚠️ Payment not found for update: ${orderId}`)
    return null
  }
  
  const updatedPayment = {
    ...payment,
    ...updateData,
    status,
    updatedAt: new Date().toISOString()
  }
  
  payments.set(orderId, updatedPayment)
  
  console.log(`🔄 Payment updated: ${orderId} -> ${status}`)
  
  return updatedPayment
}

/**
 * Получить все платежи (для отладки)
 * @returns {Array} Массив всех платежей
 */
export function getAllPayments() {
  return Array.from(payments.values())
}

/**
 * Очистить все платежи (для тестирования)
 */
export function clearAllPayments() {
  payments.clear()
  console.log('🗑️ All payments cleared')
}
