/**
 * Модуль для хранения данных о платежах
 *
 * Поддерживает Firestore (продакшен) и in-memory (fallback).
 * Вызовите initStorage(db, appId) при запуске сервера для использования Firestore.
 * Без инициализации используется in-memory (данные теряются при перезапуске).
 */

let storageDb = null
let storageAppId = null

/** In-memory fallback при отсутствии Firestore */
const paymentsMemory = new Map()

/**
 * Инициализировать хранилище платежей для Firestore
 * @param {FirebaseFirestore.Firestore} db - экземпляр Firestore
 * @param {string} appId - ID приложения (APP_ID)
 */
export function initStorage(db, appId) {
  if (db && appId) {
    storageDb = db
    storageAppId = appId
    console.log('📦 Payment storage: Firestore (artifacts/' + appId + '/public/data/payments)')
  }
}

function getPaymentsRef() {
  if (!storageDb || !storageAppId) return null
  return storageDb.collection(`artifacts/${storageAppId}/public/data/payments`)
}

/**
 * Сохранить новый платеж
 * @param {string} orderId - Уникальный идентификатор заказа
 * @param {string} label - Метка платежа (обычно = orderId)
 * @param {string} status - Статус платежа ('pending', 'completed', 'failed')
 * @param {Object} additionalData - Дополнительные данные (amount, userId, tariffId и т.д.)
 * @returns {Promise<Object>} Сохраненная запись
 */
export async function savePayment(orderId, label, status = 'pending', additionalData = {}) {
  const payment = {
    orderId,
    label,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...additionalData,
  }

  const ref = getPaymentsRef()
  if (ref) {
    try {
      await ref.doc(orderId).set(payment)
      console.log(`💾 Payment saved (Firestore): ${orderId} (${status})`)
      return payment
    } catch (err) {
      console.error(`❌ Payment save failed (Firestore): ${orderId}`, err.message)
      throw err
    }
  }

  paymentsMemory.set(orderId, payment)
  console.log(`💾 Payment saved (memory): ${orderId} (${status})`)
  return payment
}

/**
 * Получить платеж по orderId
 * @param {string} orderId - Уникальный идентификатор заказа
 * @returns {Promise<Object|null>} Данные платежа или null, если не найден
 */
export async function getPayment(orderId) {
  const ref = getPaymentsRef()
  if (ref) {
    try {
      const doc = await ref.doc(orderId).get()
      if (doc.exists) {
        return { orderId, ...doc.data() }
      }
      return null
    } catch (err) {
      console.error(`❌ Payment get failed (Firestore): ${orderId}`, err.message)
      return null
    }
  }

  const payment = paymentsMemory.get(orderId)
  if (!payment) {
    return null
  }
  return payment
}

/**
 * Обновить статус платежа
 * @param {string} orderId - Уникальный идентификатор заказа
 * @param {string} status - Новый статус
 * @param {Object} updateData - Дополнительные данные для обновления
 * @returns {Promise<Object|null>} Обновленная запись или null, если не найдена
 */
export async function updatePaymentStatus(orderId, status, updateData = {}) {
  const ref = getPaymentsRef()
  if (ref) {
    try {
      const docRef = ref.doc(orderId)
      const doc = await docRef.get()
      if (!doc.exists) {
        console.log(`⚠️ Payment not found for update: ${orderId}`)
        return null
      }
      const updated = {
        ...doc.data(),
        ...updateData,
        status,
        updatedAt: new Date().toISOString(),
      }
      await docRef.update(updated)
      console.log(`🔄 Payment updated (Firestore): ${orderId} -> ${status}`)
      return updated
    } catch (err) {
      console.error(`❌ Payment update failed (Firestore): ${orderId}`, err.message)
      return null
    }
  }

  const payment = paymentsMemory.get(orderId)
  if (!payment) {
    console.log(`⚠️ Payment not found for update: ${orderId}`)
    return null
  }
  const updatedPayment = {
    ...payment,
    ...updateData,
    status,
    updatedAt: new Date().toISOString(),
  }
  paymentsMemory.set(orderId, updatedPayment)
  console.log(`🔄 Payment updated (memory): ${orderId} -> ${status}`)
  return updatedPayment
}

/**
 * Получить все платежи (для отладки). В Firestore — только платежи с orderId как doc ID (YooMoney).
 * @returns {Promise<Array>} Массив платежей
 */
export async function getAllPayments() {
  const ref = getPaymentsRef()
  if (ref) {
    try {
      const snapshot = await ref.limit(500).get()
      return snapshot.docs.map((d) => ({ orderId: d.id, ...d.data() }))
    } catch (err) {
      console.error('❌ getAllPayments failed (Firestore):', err.message)
      return []
    }
  }
  return Array.from(paymentsMemory.values())
}

/**
 * Очистить все платежи (для тестирования). В Firestore не выполняет массовое удаление.
 */
export function clearAllPayments() {
  paymentsMemory.clear()
  console.log('🗑️ All payments cleared (memory only)')
}
