import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, query, where } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { stripUndefinedForFirestore } from '../../../shared/utils/firestoreSafe.js'
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
      // ВАЖНО: subId всегда должен быть строкой
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      // Не сбрасываем uuid при частичном обновлении (например, смена роли): если в updates uuid пустой, оставляем из текущего user
      const hasUuid = updateData.uuid != null && String(updateData.uuid).trim() !== ''
      if (!hasUuid && user && user.uuid && String(user.uuid).trim() !== '') {
        updateData.uuid = String(user.uuid).trim()
      }
      
      // Автоматическое обновление paymentStatus при изменении expiresAt
      // Если expiresAt больше testPeriodEndDate, меняем статус на 'paid'
      if (updates.expiresAt !== undefined && updates.expiresAt !== null) {
        const testPeriodEndDate = user.testPeriodEndDate || updates.testPeriodEndDate
        if (testPeriodEndDate && updates.expiresAt > testPeriodEndDate) {
          // Если дата окончания подписки больше даты окончания тестового периода,
          // автоматически меняем статус на 'paid'
          if (updates.paymentStatus === undefined || updates.paymentStatus === 'test_period') {
            updateData.paymentStatus = 'paid'
            logger.info('Admin', 'Автоматическое обновление paymentStatus на paid', {
              userId,
              expiresAt: updates.expiresAt,
              testPeriodEndDate,
            })
          }
        }
      }
      
      // Явно устанавливаем subId как строку (нормализуем значение)
      if (updates.subId !== undefined && updates.subId !== null) {
        updateData.subId = String(updates.subId).trim()
      } else if (updates.subId === null || updates.subId === '') {
        // Если subId явно установлен в null или пустую строку, сохраняем как пустую строку
        updateData.subId = ''
      }
      
      logger.info('Admin', 'Сохранение в Firestore', { 
        userId, 
        updateData, 
        updateDataKeys: Object.keys(updateData),
        subId: updateData.subId,
      })
      console.log('🔥 Сохранение в Firestore:', { 
        userId, 
        updateData,
        updateDataKeys: Object.keys(updateData),
        subId: updateData.subId,
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
            subId: savedData.subId,
          }
        })
        
        // Проверяем, что subId сохранился правильно
        if (updateData.subId !== undefined) {
          const savedSubId = savedData.subId || savedData.subid // Обратная совместимость
          const expectedSubId = updateData.subId
          if (String(savedSubId || '').trim() !== String(expectedSubId || '').trim()) {
            console.warn('⚠️ Предупреждение: subId может быть сохранен некорректно', {
              expected: expectedSubId,
              saved: savedSubId,
            })
          } else {
            console.log('✅ subId успешно сохранен:', savedSubId)
          }
        }
      } else {
        console.error('❌ Документ не найден после сохранения!')
      }

      // Если обновляем данные в 3x-ui (expiryTime, totalGB, limitIp, subId)
      // Обновляем в 3x-ui если изменились: expiresAt, trafficGB, devices, uuid, или subId
      const mergedUser = { ...user, ...updates }
      
      // Проверяем, изменился ли subId (строка)
      const oldSubId = user.subId || (user.subid ? (Array.isArray(user.subid) ? user.subid[0] : user.subid) : '')
      const newSubId = updates.subId || ''
      const subIdChanged = String(oldSubId || '').trim() !== String(newSubId || '').trim()
      
      const shouldUpdateXui = mergedUser.uuid && (
        updates.expiresAt !== undefined || 
        updates.trafficGB !== undefined || 
        updates.devices !== undefined || 
        updates.uuid !== undefined ||
        (updates.subId !== undefined && subIdChanged)
      )
      
      console.log('🔍 adminService.updateUser: Проверка обновления в 3x-ui', {
        userId,
        shouldUpdateXui,
        hasUuid: !!mergedUser.uuid,
        subIdChanged,
        oldSubId,
        newSubId,
        updatesKeys: Object.keys(updates),
      })
      
      if (shouldUpdateXui) {
        const inboundId = settings?.xuiInboundId || import.meta.env.VITE_XUI_INBOUND_ID
        if (inboundId) {
          try {
            const expiryTime = mergedUser.expiresAt ? new Date(mergedUser.expiresAt).getTime() : 0
            // Используем subId (строка) из обновлений или из mergedUser
            const subId = String(mergedUser.subId || '').trim()
            
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
          // Инициализируем appLinks если их нет
          appLinks: data.appLinks || {
            android: '',
            ios: '',
            macos: '',
            windows: '',
          },
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
          // Ссылки на приложения HAPP Proxy
          appLinks: {
            android: '',
            ios: '',
            macos: '',
            windows: '',
          },
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
          // Ссылки на приложения HAPP Proxy
          appLinks: {
            android: '',
            ios: '',
            macos: '',
            windows: '',
          },
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
      await setDoc(settingsDoc, stripUndefinedForFirestore({
        ...settings,
        servers: servers,
        updatedAt: new Date().toISOString(),
        updatedBy: adminId,
      }))
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

  /**
   * Загрузка промокодов
   * @returns {Promise<Array>} Список промокодов
   */
  async loadPromocodes() {
    if (!db) throw new Error('База данных недоступна')
    try {
      const coll = collection(db, `artifacts/${APP_ID}/public/data/promocodes`)
      const snap = await getDocs(coll)
      const list = []
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }))
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки промокодов', null, err)
      throw err
    }
  },

  /**
   * Создание промокода
   * @param {Object} data - { code, type: 'percent'|'fixed', value, tariffIds?, active, maxUsages?, validFrom?, validUntil?, description? }
   */
  async createPromocode(data, adminId) {
    if (!db) throw new Error('База данных недоступна')
    try {
      const coll = collection(db, `artifacts/${APP_ID}/public/data/promocodes`)
      const docData = {
        code: (data.code || '').trim().toUpperCase(),
        type: data.type || 'percent',
        value: Number(data.value) || 0,
        tariffIds: Array.isArray(data.tariffIds) ? data.tariffIds : null,
        active: Boolean(data.active !== false),
        maxUsages: data.maxUsages != null ? Number(data.maxUsages) : null,
        currentUsages: 0,
        validFrom: data.validFrom || null,
        validUntil: data.validUntil || null,
        description: data.description || null,
        createdAt: new Date().toISOString(),
        createdBy: adminId || null,
      }
      const ref = await addDoc(coll, docData)
      return { id: ref.id, ...docData }
    } catch (err) {
      logger.error('Admin', 'Ошибка создания промокода', null, err)
      throw err
    }
  },

  /**
   * Обновление промокода
   */
  async updatePromocode(promocodeId, data) {
    if (!db) throw new Error('База данных недоступна')
    try {
      const ref = doc(db, `artifacts/${APP_ID}/public/data/promocodes`, promocodeId)
      const updates = {
        ...(data.code != null && { code: String(data.code).trim().toUpperCase() }),
        ...(data.type != null && { type: data.type }),
        ...(data.value != null && { value: Number(data.value) }),
        ...(data.tariffIds !== undefined && { tariffIds: Array.isArray(data.tariffIds) ? data.tariffIds : null }),
        ...(data.active !== undefined && { active: Boolean(data.active) }),
        ...(data.maxUsages !== undefined && { maxUsages: data.maxUsages != null ? Number(data.maxUsages) : null }),
        ...(data.validFrom !== undefined && { validFrom: data.validFrom || null }),
        ...(data.validUntil !== undefined && { validUntil: data.validUntil || null }),
        ...(data.description !== undefined && { description: data.description || null }),
        updatedAt: new Date().toISOString(),
      }
      await updateDoc(ref, stripUndefinedForFirestore(updates))
      return updates
    } catch (err) {
      logger.error('Admin', 'Ошибка обновления промокода', { promocodeId }, err)
      throw err
    }
  },

  /**
   * Удаление промокода
   */
  async deletePromocode(promocodeId) {
    if (!db) throw new Error('База данных недоступна')
    try {
      const ref = doc(db, `artifacts/${APP_ID}/public/data/promocodes`, promocodeId)
      await deleteDoc(ref)
      logger.info('Admin', 'Промокод удален', { promocodeId })
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления промокода', { promocodeId }, err)
      throw err
    }
  },

  /**
   * Загрузка всех платежей (для админ-аналитики финансов)
   * @returns {Promise<Array>} Список всех платежей, отсортированных по дате (новые первые)
   */
  async loadAllPayments() {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      logger.info('Admin', 'Загрузка всех платежей для аналитики')
      const paymentsCollection = collection(db, `artifacts/${APP_ID}/public/data/payments`)
      const snapshot = await getDocs(paymentsCollection)
      const list = []

      snapshot.forEach((docSnapshot) => {
        list.push({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      })

      list.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })

      logger.info('Admin', 'Платежи для аналитики загружены', { count: list.length })
      return list
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки платежей для аналитики', null, err)
      throw err
    }
  },

  /**
   * Очистка всей истории платежей: удаляются только документы из коллекции payments.
   * Включает платежи любых пользователей (в т.ч. админов и бухгалтеров). Роли и данные
   * пользователей (users_v4) не изменяются. Обнуляет статистику по платежам. Необратимо.
   * @returns {Promise<number>} Количество удалённых документов
   */
  async deleteAllPayments() {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    // Только коллекция payments — пользователи и роли не трогаем
    const paymentsCollection = collection(db, `artifacts/${APP_ID}/public/data/payments`)
    const snapshot = await getDocs(paymentsCollection)
    let deleted = 0
    const batchSize = 500
    const ids = snapshot.docs.map((d) => d.id)

    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize)
      await Promise.all(
        chunk.map((id) => deleteDoc(doc(paymentsCollection, id)))
      )
      deleted += chunk.length
    }

    logger.info('Admin', 'Удалены все платежи', { count: deleted })
    return deleted
  },

  /**
   * Перегенерация уникальных subId для всех пользователей
   * @returns {Promise<Object>} Результат операции с количеством обновленных пользователей
   */
  async regenerateAllSubIds() {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    try {
      logger.info('Admin', 'Начало перегенерации subId для всех пользователей')
      
      // Получаем всех пользователей
      const usersCollection = collection(db, `artifacts/${APP_ID}/public/data/users_v4`)
      const usersSnapshot = await getDocs(usersCollection)
      
      const users = []
      usersSnapshot.forEach((docSnapshot) => {
        users.push({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      })
      
      logger.info('Admin', `Найдено пользователей для обновления: ${users.length}`)
      
      let updatedCount = 0
      let errorCount = 0
      const errors = []
      
      // Генерируем уникальные subId для каждого пользователя
      const usedSubIds = new Set()
      
      for (const user of users) {
        try {
          // Генерируем новый subId (формат base36: 16 символов)
          let newSubId = ThreeXUI.generateSubId()
          
          // Проверяем уникальность (хотя вероятность дубликата очень мала)
          let attempts = 0
          const maxAttempts = 10
          while (usedSubIds.has(newSubId) && attempts < maxAttempts) {
            logger.warn('Admin', `subId ${newSubId} уже использован, генерируем новый`, {
              userId: user.id,
              attempt: attempts + 1
            })
            newSubId = ThreeXUI.generateSubId()
            attempts++
          }
          
          if (usedSubIds.has(newSubId)) {
            // Если не удалось сгенерировать уникальный после всех попыток
            throw new Error(`Не удалось сгенерировать уникальный subId после ${maxAttempts} попыток`)
          }
          
          usedSubIds.add(newSubId)
          
          // Обновляем subId в Firestore
          const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
          await updateDoc(userDoc, {
            subId: newSubId,
            updatedAt: new Date().toISOString(),
          })
          
          updatedCount++
          logger.info('Admin', `subId перегенерирован для пользователя`, {
            userId: user.id,
            email: user.email,
            oldSubId: user.subId,
            newSubId: newSubId
          })
        } catch (err) {
          errorCount++
          const errorInfo = {
            userId: user.id,
            email: user.email,
            error: err.message
          }
          errors.push(errorInfo)
          logger.error('Admin', 'Ошибка перегенерации subId для пользователя', errorInfo, err)
        }
      }
      
      const result = {
        total: users.length,
        updated: updatedCount,
        errors: errorCount,
        errorDetails: errors
      }
      
      logger.info('Admin', 'Перегенерация subId завершена', result)
      return result
    } catch (err) {
      logger.error('Admin', 'Ошибка перегенерации subId для всех пользователей', null, err)
      throw err
    }
  },

  /**
   * Удаление всех платежей со статусом 'pending' и 'test' для всех пользователей
   * Два отдельных запроса — иначе тестовые могли не попадать в выборку
   * @returns {Promise<Object>} Результат удаления (количество удаленных платежей)
   */
  async clearAllPendingPayments() {
    if (!db) {
      throw new Error('База данных недоступна')
    }

    const path = `artifacts/${APP_ID}/public/data/payments`
    const paymentsCollection = collection(db, path)

    try {
      logger.info('Admin', 'Очистка всех платежей со статусом pending и test для всех пользователей')

      const [pendingSnap, testSnap] = await Promise.all([
        getDocs(query(paymentsCollection, where('status', '==', 'pending'))),
        getDocs(query(paymentsCollection, where('status', '==', 'test')))
      ])

      const idsToDelete = new Set()
      pendingSnap.forEach((d) => idsToDelete.add(d.id))
      testSnap.forEach((d) => idsToDelete.add(d.id))

      if (idsToDelete.size === 0) {
        logger.info('Admin', 'Платежи со статусом pending или test не найдены')
        return { deleted: 0, message: 'Не найдено платежей со статусом pending или test' }
      }

      const deletePromises = Array.from(idsToDelete).map((id) =>
        deleteDoc(doc(db, path, id))
      )
      await Promise.all(deletePromises)

      const deletedCount = deletePromises.length
      logger.info('Admin', 'Платежи со статусом pending и test удалены', {
        deletedCount,
        pending: pendingSnap.size,
        test: testSnap.size
      })

      return {
        deleted: deletedCount,
        message: `Удалено ${deletedCount} платежей (pending и тестовые)`
      }
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления платежей со статусом pending и test', null, err)
      throw err
    }
  },
}

