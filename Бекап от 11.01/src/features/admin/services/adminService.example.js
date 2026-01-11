/**
 * ПРИМЕР: Обновленный adminService.js для работы через Proxy
 * 
 * ВАЖНО: Это пример - замените прямые вызовы ThreeXUI на useXUI()
 * в ваших React компонентах, а не в сервисе
 */

import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
// ❌ УДАЛИТЬ: import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Сервис для работы с админ-панелью
 * 
 * ВАЖНО: VPN операции (addClient, deleteClient) теперь выполняются
 * через Proxy в React компонентах с помощью useXUI()
 * 
 * Этот сервис только для работы с Firestore (не VPN)
 */
export const adminService = {
  /**
   * Загрузка всех пользователей (только для админа)
   */
  async loadUsers() {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      logger.info('Admin', 'Загрузка всех пользователей из Firestore (только для админа)')
      const usersCollection = collection(db, `artifacts/${APP_ID}/public/data/users_v4`)
      const usersSnapshot = await getDocs(usersCollection)
      const usersList = []
      
      usersSnapshot.forEach((docSnapshot) => {
        usersList.push({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      })
      
      logger.info('Admin', `Загружено пользователей: ${usersList.length}`)
      return usersList
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки пользователей', { code: err.code }, err)
      throw err
    }
  },

  /**
   * Обновление пользователя (только Firestore, НЕ VPN)
   * 
   * ВАЖНО: VPN операции (expiryTime, totalGB, limitIp) теперь выполняются
   * через Proxy в компонентах, а не здесь
   */
  async updateUser(userId, updates) {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      logger.info('Admin', 'Обновление пользователя в Firestore', { userId, updates })
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, userId)
      
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      
      await setDoc(userDoc, updateData, { merge: true })
      
      logger.info('Admin', 'Пользователь обновлен в Firestore', { userId })
      return updateData
    } catch (err) {
      logger.error('Admin', 'Ошибка обновления пользователя', { userId }, err)
      throw err
    }
  },

  // ❌ УДАЛИТЬ все методы, которые вызывают ThreeXUI напрямую
  // VPN операции теперь через Proxy в компонентах
}
