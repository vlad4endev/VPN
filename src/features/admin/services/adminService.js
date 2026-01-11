import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Сервис для работы с админ-панелью
 */
export const adminService = {
  /**
   * Загрузка всех пользователей (только для админа)
   * @returns {Promise<Array>} Список всех пользователей
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
   * Обновление пользователя
   * @param {string} userId - ID пользователя
   * @param {Object} updates - Обновления (может включать все поля: uuid, name, phone, expiresAt, trafficGB, devices, tariffId, plan и т.д.)
   * @param {Object} user - Полные данные пользователя (для обновления в 3x-ui)
   * @param {Object} settings - Настройки (для получения inboundId)
   * @returns {Promise<Object>} Обновленные данные пользователя
   */
  async updateUser(userId, updates, user, settings) {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      logger.info('Admin', 'Обновление пользователя', { userId, updates })
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, userId)
      
      // Подготавливаем обновления: сохраняем все поля, включая name и phone
      // ВАЖНО: Явно указываем все поля, чтобы сохранить пустые значения и null
      // ВАЖНО: subid всегда должен быть массивом, даже если пустым
      const updateData = {
        ...updates,
        // Явно устанавливаем subid как массив (даже если пустой)
        subid: updates.subid !== undefined 
          ? (Array.isArray(updates.subid) ? updates.subid : (updates.subid ? [updates.subid] : []))
          : undefined, // Если subid не указан, не перезаписываем его
        updatedAt: new Date().toISOString(),
      }
      
      // Удаляем subid из updateData, если он undefined (чтобы не перезаписать существующее значение)
      if (updateData.subid === undefined) {
        delete updateData.subid
      }
      
      logger.info('Admin', 'Сохранение в Firestore', { 
        userId, 
        updateData, 
        updateDataKeys: Object.keys(updateData),
        subid: updateData.subid,
        subidType: Array.isArray(updateData.subid) ? 'array' : typeof updateData.subid,
        subidLength: Array.isArray(updateData.subid) ? updateData.subid.length : 0,
      })
      console.log('🔥 Сохранение в Firestore:', { 
        userId, 
        updateData,
        updateDataKeys: Object.keys(updateData),
        subid: updateData.subid,
        subidType: Array.isArray(updateData.subid) ? 'array' : typeof updateData.subid,
        subidLength: Array.isArray(updateData.subid) ? updateData.subid.length : 0,
      })
      
      // ВАЖНО: Используем setDoc с merge вместо updateDoc для гарантии сохранения всех полей
      await setDoc(userDoc, updateData, { merge: true })
      
      console.log('✅ Данные сохранены в Firestore')
      
      // Проверяем, что данные действительно сохранились
      const verifyDoc = await getDoc(userDoc)
      if (verifyDoc.exists()) {
        const savedData = verifyDoc.data()
        console.log('✅ Проверка сохраненных данных:', {
          savedKeys: Object.keys(savedData),
          savedValues: {
            uuid: savedData.uuid,
            name: savedData.name,
            phone: savedData.phone,
            expiresAt: savedData.expiresAt,
            trafficGB: savedData.trafficGB,
            devices: savedData.devices,
            tariffId: savedData.tariffId,
            plan: savedData.plan,
            subid: savedData.subid,
            subidType: Array.isArray(savedData.subid) ? 'array' : typeof savedData.subid,
            subidLength: Array.isArray(savedData.subid) ? savedData.subid.length : savedData.subid ? 1 : 0,
          }
        })
        
        // Проверяем, что subid сохранился правильно
        if (updateData.subid !== undefined) {
          const savedSubid = savedData.subid
          const expectedSubid = updateData.subid
          if (JSON.stringify(savedSubid) !== JSON.stringify(expectedSubid)) {
            console.warn('⚠️ Предупреждение: subid может быть сохранен некорректно', {
              expected: expectedSubid,
              saved: savedSubid,
            })
          } else {
            console.log('✅ subid успешно сохранен:', savedSubid)
          }
        }
      } else {
        console.error('❌ Документ не найден после сохранения!')
      }

      // Если обновляем данные в 3x-ui (expiryTime, totalGB, limitIp, subId)
      // Обновляем в 3x-ui если изменились: expiresAt, trafficGB, devices, uuid, или subid
      const mergedUser = { ...user, ...updates }
      
      // Проверяем, изменился ли subid (правильное сравнение массивов)
      const oldSubid = Array.isArray(user.subid) ? user.subid : (user.subid ? [user.subid] : [])
      const newSubid = Array.isArray(updates.subid) ? updates.subid : (updates.subid ? [updates.subid] : [])
      const subidChanged = JSON.stringify(oldSubid) !== JSON.stringify(newSubid)
      
      const shouldUpdateXui = mergedUser.uuid && (
        updates.expiresAt !== undefined || 
        updates.trafficGB !== undefined || 
        updates.devices !== undefined || 
        updates.uuid !== undefined ||
        (updates.subid !== undefined && subidChanged)
      )
      
      console.log('🔍 adminService.updateUser: Проверка обновления в 3x-ui', {
        userId,
        shouldUpdateXui,
        hasUuid: !!mergedUser.uuid,
        subidChanged,
        oldSubid,
        newSubid,
        updatesKeys: Object.keys(updates),
      })
      
      if (shouldUpdateXui) {
        const inboundId = settings?.xuiInboundId || import.meta.env.VITE_XUI_INBOUND_ID
        if (inboundId) {
          try {
            const expiryTime = mergedUser.expiresAt ? new Date(mergedUser.expiresAt).getTime() : 0
            // Получаем первый subid из массива (3x-ui использует один subId для клиента)
            // Если subid - массив, берем первый непустой элемент, иначе сам subid или пустую строку
            let subId = ''
            if (mergedUser.subid) {
              if (Array.isArray(mergedUser.subid) && mergedUser.subid.length > 0) {
                subId = mergedUser.subid.find(s => s && s.trim() !== '') || mergedUser.subid[0] || ''
              } else if (typeof mergedUser.subid === 'string' && mergedUser.subid.trim() !== '') {
                subId = mergedUser.subid.trim()
              }
            }
            
            await ThreeXUI.updateClient(inboundId, mergedUser.email, {
              expiryTime: expiryTime,
              totalGB: mergedUser.trafficGB || 0,
              limitIp: mergedUser.devices || 0,
              subId: subId,
            })
            logger.info('Admin', 'Пользователь обновлен в 3x-ui', { 
              email: mergedUser.email,
              subId: subId,
              hasSubId: !!subId
            })
          } catch (xuiError) {
            logger.error('Admin', 'Ошибка обновления в 3x-ui', { email: mergedUser.email }, xuiError)
            // Не пробрасываем ошибку, так как данные в Firestore уже обновлены
          }
        }
      }

      logger.info('Admin', 'Пользователь успешно обновлен', { userId })
      return updateData
    } catch (err) {
      logger.error('Admin', 'Ошибка обновления пользователя', { userId }, err)
      throw err
    }
  },

  /**
   * Удаление пользователя
   * @param {string} userId - ID пользователя
   * @param {Object} user - Данные пользователя
   * @returns {Promise<void>}
   */
  async deleteUser(userId, user) {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      logger.info('Admin', 'Удаление пользователя', { userId, email: user.email })
      
      // Сначала удаляем из 3x-ui (если у пользователя есть UUID)
      if (user.uuid && user.uuid.trim() !== '') {
        try {
          const inboundId = import.meta.env.VITE_XUI_INBOUND_ID
          if (inboundId) {
            await ThreeXUI.deleteClient(inboundId, user.email)
            logger.info('Admin', 'Пользователь удален из 3x-ui', { email: user.email })
          }
        } catch (xuiError) {
          logger.warn('Admin', 'Ошибка удаления клиента из 3x-ui', { email: user.email }, xuiError)
          // Продолжаем удаление из Firestore даже если ошибка в 3x-ui
        }
      }

      // Удаляем из Firestore
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, userId)
      await deleteDoc(userDoc)
      logger.info('Admin', 'Пользователь удален из Firestore', { userId })
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления пользователя', { userId }, err)
      throw err
    }
  },

  /**
   * Загрузка настроек из Firestore
   * @returns {Promise<Object>} Настройки
   */
  async loadSettings() {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      logger.info('Admin', 'Загрузка глобальных настроек системы (только для админа)')
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      const settingsSnapshot = await getDoc(settingsDoc)
      
      if (settingsSnapshot.exists()) {
        const data = settingsSnapshot.data()
        // Очищаем username от кавычек при загрузке
        const firestoreServers = (data.servers || []).map(server => {
          const cleanServer = {
            ...server,
            xuiUsername: (server.xuiUsername || '').trim().replace(/^["']|["']$/g, ''),
          }
          
          // Если у сервера нет поля protocol, определяем его по порту
          if (!cleanServer.protocol) {
            cleanServer.protocol = (cleanServer.serverPort === 443 || cleanServer.serverPort === 40919) ? 'https' : 'http'
          }
          return cleanServer
        })
        
        return {
          ...data,
          servers: firestoreServers,
        }
      } else {
        // Создаем настройки по умолчанию
        const defaultSettings = {
          serverIP: import.meta.env.VITE_XUI_HOST || 'http://localhost',
          serverPort: Number(import.meta.env.VITE_XUI_PORT) || 2053,
          xuiUsername: import.meta.env.VITE_XUI_USERNAME || '',
          xuiPassword: import.meta.env.VITE_XUI_PASSWORD || '',
          xuiInboundId: import.meta.env.VITE_XUI_INBOUND_ID || '',
          servers: [],
          updatedAt: new Date().toISOString(),
        }
        await setDoc(settingsDoc, defaultSettings)
        return defaultSettings
      }
    } catch (err) {
      // Обработка офлайн-режима
      const isOffline = err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document because the client is offline')
      
      if (isOffline) {
        logger.warn('Admin', 'Офлайн-режим: используем настройки по умолчанию', null)
        // Используем настройки по умолчанию из переменных окружения
        return {
          serverIP: import.meta.env.VITE_XUI_HOST || 'http://localhost',
          serverPort: Number(import.meta.env.VITE_XUI_PORT) || 2053,
          xuiUsername: import.meta.env.VITE_XUI_USERNAME || '',
          xuiPassword: import.meta.env.VITE_XUI_PASSWORD || '',
          xuiInboundId: import.meta.env.VITE_XUI_INBOUND_ID || '',
          servers: [],
          updatedAt: new Date().toISOString(),
        }
      }
      
      logger.error('Admin', 'Ошибка загрузки настроек', null, err)
      throw err
    }
  },

  /**
   * Сохранение настроек в Firestore
   * @param {Object} settings - Настройки
   * @param {Array} servers - Список серверов
   * @param {string} adminId - ID администратора
   * @returns {Promise<void>}
   */
  async saveSettings(settings, servers, adminId) {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      logger.info('Admin', 'Сохранение глобальных настроек системы', { adminId })
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      await setDoc(settingsDoc, {
        ...settings,
        servers: servers,
        updatedAt: new Date().toISOString(),
        updatedBy: adminId,
      })
      logger.info('Admin', 'Глобальные настройки успешно сохранены', { adminId })
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения настроек', { adminId }, err)
      throw err
    }
  },

  /**
   * Загрузка тарифов из Firestore
   * @returns {Promise<Array>} Список тарифов
   */
  async loadTariffs() {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      const tariffsCollection = collection(db, `artifacts/${APP_ID}/public/data/tariffs`)
      const tariffsSnapshot = await getDocs(tariffsCollection)
      const tariffsList = []
      
      tariffsSnapshot.forEach((docSnapshot) => {
        tariffsList.push({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      })
      
      logger.info('Admin', 'Тарифы загружены', { count: tariffsList.length })
      return tariffsList
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки тарифов', null, err)
      throw err
    }
  },

  /**
   * Сохранение тарифа
   * @param {string} tariffId - ID тарифа
   * @param {Object} tariffData - Данные тарифа
   * @returns {Promise<Object>} Сохраненные данные тарифа
   */
  async saveTariff(tariffId, tariffData) {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, tariffId)
      await updateDoc(tariffDoc, {
        ...tariffData,
        updatedAt: new Date().toISOString(),
      })
      logger.info('Admin', 'Тариф сохранен', { tariffId })
      return tariffData
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения тарифа', { tariffId }, err)
      throw err
    }
  },

  /**
   * Удаление тарифа
   * @param {string} tariffId - ID тарифа
   * @returns {Promise<void>}
   */
  async deleteTariff(tariffId) {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, tariffId)
      await deleteDoc(tariffDoc)
      logger.info('Admin', 'Тариф удален', { tariffId })
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления тарифа', { tariffId }, err)
      throw err
    }
  },
}

