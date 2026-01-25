import { doc, getDoc } from 'firebase/firestore'
import { APP_ID } from '../constants/app.js'

/**
 * Получение активной подписки пользователя из Firestore
 * @param {Object} db - Экземпляр Firestore
 * @param {string} subscriptionId - ID подписки
 * @returns {Promise<Object|null>} Данные подписки или null
 */
export async function getSubscriptionById(db, subscriptionId) {
  if (!db || !subscriptionId) {
    return null
  }

  try {
    const subscriptionRef = doc(db, `artifacts/${APP_ID}/public/data/subscriptions`, subscriptionId)
    const subscriptionDoc = await getDoc(subscriptionRef)
    
    if (!subscriptionDoc.exists()) {
      return null
    }
    
    return {
      id: subscriptionDoc.id,
      ...subscriptionDoc.data()
    }
  } catch (error) {
    console.error('❌ subscriptionUtils: Ошибка получения подписки', {
      subscriptionId,
      error: error.message
    })
    return null
  }
}

/**
 * Получение активной подписки пользователя по userId
 * @param {Object} db - Экземпляр Firestore
 * @param {string} userId - ID пользователя
 * @returns {Promise<Object|null>} Данные активной подписки или null
 */
export async function getActiveSubscriptionByUserId(db, userId) {
  if (!db || !userId) {
    return null
  }

  try {
    // Сначала пытаемся получить по subscriptionId из user
    // Если у пользователя есть subscriptionId, используем его
    const userRef = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, userId)
    const userDoc = await getDoc(userRef)
    
    if (userDoc.exists()) {
      const userData = userDoc.data()
      if (userData.subscriptionId) {
        const subscription = await getSubscriptionById(db, userData.subscriptionId)
        if (subscription && ['pending_payment', 'test_period', 'activating', 'active'].includes(subscription.status)) {
          return subscription
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('❌ subscriptionUtils: Ошибка получения активной подписки', {
      userId,
      error: error.message
    })
    return null
  }
}
