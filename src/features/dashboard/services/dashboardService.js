import { collection, getDocs, addDoc, deleteDoc, doc, query, where, updateDoc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import XUIService from '../../vpn/services/XUIService.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import paymentService from '../../payment/services/paymentService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Загрузка webhook URL из Firestore настроек
 * @returns {Promise<string|null>} Webhook URL или null
 */
async function loadWebhookUrl() {
  if (!db) return null

  try {
    const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
    const settingsSnapshot = await getDoc(settingsDoc)
    
    if (settingsSnapshot.exists()) {
      const data = settingsSnapshot.data()
      const url = data.n8nWebhookUrl || data.webhookUrl || null
      if (url) {
        logger.debug('Dashboard', 'Webhook URL загружен из Firestore', { webhookUrl: url })
      }
      return url
    }
  } catch (err) {
    logger.warn('Dashboard', 'Ошибка загрузки webhook URL из Firestore', null, err)
  }
  
  return null
}

/**
 * Сервис для работы с Dashboard
 */
export const dashboardService = {
  /**
   * Загрузка платежей пользователя
   * @param {string} userId - ID пользователя
   * @returns {Promise<Array>} Список платежей
   */
  async loadPayments(userId) {
    if (!db || !userId) return []

    try {
      const paymentsCollection = collection(db, `artifacts/${APP_ID}/public/data/payments`)
      // КРИТИЧНО: Фильтр по userId гарантирует, что пользователь видит только свои платежи
      const q = query(paymentsCollection, where('userId', '==', userId))
      const paymentsSnapshot = await getDocs(q)
      const paymentsList = []
      
      paymentsSnapshot.forEach((docSnapshot) => {
        paymentsList.push({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })
      })
      
      // Сортируем по дате (новые сначала)
      paymentsList.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })
      
      logger.info('Dashboard', 'Платежи загружены', { userId, count: paymentsList.length })
      return paymentsList
    } catch (err) {
      logger.error('Dashboard', 'Ошибка загрузки платежей', { userId }, err)
      throw err
    }
  },

  /**
   * Обновление статуса платежа по orderId (например, на «Успех» после подтверждения оплаты)
   * @param {string} orderId - ID заказа
   * @param {string} status - Новый статус ('completed' и т.д.)
   * @returns {Promise<boolean>} true, если обновлено
   */
  async updatePaymentStatus(orderId, status = 'completed') {
    if (!db || !orderId) return false
    try {
      const paymentsCollection = collection(db, `artifacts/${APP_ID}/public/data/payments`)
      const q = query(paymentsCollection, where('orderId', '==', orderId))
      const snapshot = await getDocs(q)
      if (snapshot.empty) {
        logger.warn('Dashboard', 'Платеж для обновления статуса не найден', { orderId })
        return false
      }
      const docRef = snapshot.docs[0].ref
      const updateData = {
        status,
        ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
      }
      await updateDoc(docRef, updateData)
      logger.info('Dashboard', 'Статус платежа обновлён на «Успех»', { orderId, status })
      return true
    } catch (err) {
      logger.error('Dashboard', 'Ошибка обновления статуса платежа', { orderId }, err)
      return false
    }
  },

  /**
   * Обновление профиля пользователя
   * @param {string} userId - ID пользователя
   * @param {Object} profileData - Данные профиля (name, phone)
   * @returns {Promise<Object>} Обновленные данные пользователя
   */
  async updateProfile(userId, profileData) {
    if (!db || !userId) {
      throw new Error('База данных недоступна или не указан ID пользователя')
    }

    try {
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, userId)
      await updateDoc(userDoc, {
        name: profileData.name.trim(),
        phone: profileData.phone.trim(),
        updatedAt: new Date().toISOString(),
      })

      logger.info('Dashboard', 'Профиль обновлен', { userId })
      
      return {
        name: profileData.name.trim(),
        phone: profileData.phone.trim(),
      }
    } catch (err) {
      logger.error('Dashboard', 'Ошибка обновления профиля', { userId }, err)
      throw err
    }
  },

  /**
   * Удаление аккаунта пользователя
   * @param {Object} user - Данные пользователя
   * @returns {Promise<void>}
   */
  async deleteAccount(user) {
    if (!db || !user || !user.id) {
      throw new Error('База данных недоступна или не указан ID пользователя')
    }

    try {
      // Удаляем клиента из 3x-ui, если есть UUID
      if (user.uuid) {
        try {
          const defaultInboundId = import.meta.env.VITE_XUI_INBOUND_ID || '1'
          
          // Получаем данные сервера для определения правильного inboundId
          let serverInboundId = defaultInboundId
          let activeServer = null
          
          try {
            const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
            const settingsSnapshot = await getDoc(settingsDoc)
            const settingsData = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
            const serversList = settingsData.servers || []
            
            // Ищем сервер, привязанный к тарифу пользователя (если есть tariffId)
            if (user.tariffId) {
              const serversForTariff = serversList.filter(server => {
                if (server.tariffIds && server.tariffIds.length > 0) {
                  return server.tariffIds.includes(user.tariffId)
                }
                return true
              })
              
              activeServer = serversForTariff.find(s => s.active && s.id)
              
              if (activeServer && activeServer.xuiInboundId) {
                serverInboundId = activeServer.xuiInboundId
                logger.info('Dashboard', 'Найден сервер для тарифа при удалении аккаунта', {
                  tariffId: user.tariffId,
                  serverId: activeServer.id,
                  inboundId: serverInboundId
                })
              }
            }
            
            // Если не нашли сервер для тарифа, используем первый активный сервер
            if (!activeServer) {
              activeServer = serversList.find(s => s.active && s.id)
              if (activeServer && activeServer.xuiInboundId) {
                serverInboundId = activeServer.xuiInboundId
              }
            }
          } catch (serverError) {
            logger.warn('Dashboard', 'Ошибка получения сервера при удалении аккаунта, используем дефолтный inboundId', {
              error: serverError.message
            })
          }
          
          const xuiService = XUIService.getInstance()

          // Формируем категоризированные данные для n8n с маркировкой операции удаления
          const deleteData = {
            operation: 'delete_client',
            category: 'delete_client',
            timestamp: new Date().toISOString(),

            // Базовые данные
            userId: user.id,
            userUuid: user.uuid,
            userName: user.name || user.email?.split('@')[0] || 'User',
            userEmail: user.email,

            // Данные для 3x-ui
            inboundId: parseInt(serverInboundId),
            email: user.email,
          }
          
          // Загружаем webhook URL из Firestore и передаем в запрос
          const webhookUrl = await loadWebhookUrl()
          if (webhookUrl) {
            deleteData.webhookUrl = webhookUrl
          }
          
          await xuiService.deleteClient(deleteData)
          logger.info('Dashboard', 'Клиент удален из 3x-ui', { email: user.email })
        } catch (err) {
          logger.warn('Dashboard', 'Ошибка удаления клиента из 3x-ui', { email: user.email }, err)
          // Продолжаем удаление даже если не удалось удалить из 3x-ui
        }
      }

      // Удаляем документ пользователя
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
      await deleteDoc(userDoc)
      logger.info('Dashboard', 'Документ пользователя удален из Firestore', { userId: user.id })

      // Удаляем все платежи пользователя
      const paymentsCollection = collection(db, `artifacts/${APP_ID}/public/data/payments`)
      const q = query(paymentsCollection, where('userId', '==', user.id))
      const paymentsSnapshot = await getDocs(q)
      const deletePromises = []
      paymentsSnapshot.forEach((docSnapshot) => {
        deletePromises.push(deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/payments`, docSnapshot.id)))
      })
      await Promise.all(deletePromises)

      logger.info('Dashboard', 'Аккаунт удален', { userId: user.id, email: user.email })
    } catch (err) {
      logger.error('Dashboard', 'Ошибка удаления аккаунта', { userId: user.id }, err)
      throw err
    }
  },

  /**
   * Получение ключа (создание клиента в 3x-ui через Backend Proxy)
   * Использует UUID из профиля пользователя, данные тарифа и сохраненную сессию
   * 
   * @param {Object} user - Данные пользователя
   * @returns {Promise<string>} UUID клиента
   */
  async getKey(user) {
    if (!db || !user) {
      throw new Error('База данных недоступна или пользователь не авторизован')
    }

    const xuiService = XUIService.getInstance()

    // ВАЖНО: Используем UUID из профиля пользователя (генерируется при регистрации)
    // Если UUID отсутствует, генерируем новый и сохраняем в Firestore
    let clientId = user.uuid
    
    if (!clientId || clientId.trim() === '') {
      logger.warn('Dashboard', 'UUID пользователя не найден, генерируем новый', { 
        email: user.email,
        userId: user.id
      })
      
      // Генерируем новый UUID v4
      clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
      
      // Сохраняем UUID в Firestore
      try {
        const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
        await updateDoc(userDoc, {
          uuid: clientId,
          updatedAt: new Date().toISOString(),
        })
        logger.info('Dashboard', 'UUID сгенерирован и сохранен в Firestore', { 
          email: user.email,
          userId: user.id,
          uuid: clientId
        })
      } catch (err) {
        logger.warn('Dashboard', 'Ошибка сохранения UUID в Firestore', { userId: user.id }, err)
        // Продолжаем работу, даже если не удалось сохранить
      }
    }

    logger.info('Dashboard', 'Используется UUID из профиля пользователя', { 
      email: user.email, 
      uuid: clientId 
    })

    // Загружаем тариф пользователя для получения лимитов
    let totalGB = 0
    let expiryTime = user.expiresAt || 0
    let limitIp = user.devices || 1 // Количество устройств из профиля или тарифа
    let inboundId = import.meta.env.VITE_XUI_INBOUND_ID
    let tariff = null

    if (user.tariffId) {
      try {
        const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, user.tariffId)
        const tariffSnapshot = await getDoc(tariffDoc)
        
        if (tariffSnapshot.exists()) {
          tariff = tariffSnapshot.data()
          totalGB = tariff.trafficGB > 0 ? tariff.trafficGB : 0
          
          // limitIp: используем количество устройств из тарифа или из профиля пользователя
          if (tariff.devices && tariff.devices > 0) {
            limitIp = tariff.devices
          } else if (user.devices && user.devices > 0) {
            limitIp = user.devices
          }
          
          // Если expiryTime не установлен, вычисляем из тарифа
          if (!expiryTime && tariff.durationDays > 0) {
            expiryTime = Date.now() + (tariff.durationDays * 24 * 60 * 60 * 1000)
          }
          
          logger.info('Dashboard', 'Тариф загружен', { 
            tariffId: user.tariffId,
            totalGB,
            limitIp,
            expiryTime: expiryTime > 0 ? new Date(expiryTime).toISOString() : 'без ограничений'
          })
    } else {
          logger.warn('Dashboard', 'Тариф не найден в Firestore', { tariffId: user.tariffId })
        }
      } catch (err) {
        logger.warn('Dashboard', 'Ошибка загрузки тарифа', { tariffId: user.tariffId }, err)
        // Продолжаем с дефолтными значениями
      }
    }

    // Если expiryTime не установлен, используем тестовые 24 часа
    // ВАЖНО: Фиксируем дату первого получения ключа, чтобы при повторном нажатии
    // срок не обновлялся еще на 24 часа
    if (!expiryTime || expiryTime === 0) {
      // Проверяем, есть ли уже зафиксированная дата первого получения ключа
      const firstKeyDate = user.firstKeyDate || user.createdAt
      
      if (firstKeyDate) {
        // Используем зафиксированную дату + 24 часа
        expiryTime = new Date(firstKeyDate).getTime() + (24 * 60 * 60 * 1000)
        logger.info('Dashboard', 'Используется тестовый срок 24 часа от зафиксированной даты', {
          firstKeyDate: new Date(firstKeyDate).toISOString(),
          expiryTime: new Date(expiryTime).toISOString()
        })
      } else {
        // Первое получение ключа - фиксируем текущую дату
        expiryTime = Date.now() + (24 * 60 * 60 * 1000) // 24 часа от текущего момента
        const firstKeyDateValue = new Date().toISOString()
        
        // Сохраняем дату первого получения ключа в Firestore
        try {
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
      await updateDoc(userDoc, {
            firstKeyDate: firstKeyDateValue,
        updatedAt: new Date().toISOString(),
          })
          logger.info('Dashboard', 'Зафиксирована дата первого получения ключа', {
            userId: user.id,
            firstKeyDate: firstKeyDateValue
          })
        } catch (err) {
          logger.warn('Dashboard', 'Ошибка сохранения firstKeyDate', { userId: user.id }, err)
          // Продолжаем работу, даже если не удалось сохранить
        }
        
        logger.info('Dashboard', 'Используется тестовый срок 24 часа (первое получение)', {
          expiryTime: new Date(expiryTime).toISOString()
        })
      }
    }

    // Получаем subId из профиля (генерируется при регистрации, должен быть уникальным)
    // Если subId отсутствует - это ошибка, так как он должен быть сгенерирован при регистрации
    const subId = user.subId || ''
    if (!subId) {
      logger.warn('Dashboard', 'У пользователя отсутствует subId, это может вызвать проблемы с 3x-ui', {
        userId: user.id,
        email: user.email
      })
    }
    const tgId = user.tgId || '' // Опционально, из Telegram

    // Если inboundId не установлен в env, пытаемся получить из настроек
    if (!inboundId) {
      // Можно загрузить из settings или использовать дефолтное значение
      logger.warn('Dashboard', 'VITE_XUI_INBOUND_ID не установлен, используем дефолтное значение', {})
      inboundId = '1' // Дефолтное значение
    }

    // Получаем активный сервер с сохраненной сессией и inboundId из настроек сервера
    // ВАЖНО: Ищем сервер, привязанный к тарифу пользователя (SUPER или MULTI)
    let serverId = null
    let sessionCookie = null
    let serverIP = null
    let serverPort = null
    let randompath = null
    let protocol = null
    let serverInboundId = null
    
    try {
      // Загружаем настройки, где хранятся серверы (как в createSubscription)
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      const settingsSnapshot = await getDoc(settingsDoc)
      const settingsData = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
      const serversList = settingsData.servers || []
      
      logger.info('Dashboard', 'Поиск сервера с сессией для getKey', { 
        totalServers: serversList.length,
        userTariffId: user.tariffId
      })
      
      // Ищем сервер, привязанный к тарифу пользователя (если есть tariffId)
      let serversToCheck = serversList
      if (user.tariffId) {
        serversToCheck = serversList.filter(server => {
          // Если у сервера есть привязка к тарифам, проверяем, есть ли наш тариф
          if (server.tariffIds && server.tariffIds.length > 0) {
            return server.tariffIds.includes(user.tariffId)
          }
          // Если привязки нет - сервер подходит для всех тарифов
          return true
        })
        
        logger.info('Dashboard', 'Фильтрация серверов по тарифу для getKey', {
          tariffId: user.tariffId,
          filteredServers: serversToCheck.length,
          totalServers: serversList.length
        })
      }
      
      // Ищем сервер с активной сессией среди серверов для этого тарифа
      for (const server of serversToCheck) {
        if (server.active && server.sessionCookie && server.sessionCookieReceivedAt) {
          // Проверяем, не истекла ли сессия (обычно сессия 3x-ui живет 1 час)
          const sessionAge = Date.now() - new Date(server.sessionCookieReceivedAt).getTime()
          const oneHour = 60 * 60 * 1000
          
          if (sessionAge < oneHour) {
            serverId = server.id
            sessionCookie = server.sessionCookie
            serverIP = server.serverIP
            serverPort = server.serverPort
            randompath = server.randompath
            protocol = server.protocol || (server.serverPort === 443 || server.serverPort === 40919 ? 'https' : 'http')
            serverInboundId = server.xuiInboundId || inboundId // Используем inboundId из настроек сервера
            
            logger.info('Dashboard', 'Найден активный сервер с сессией для getKey', { 
              serverId,
              serverName: server.name,
              serverInboundId,
              tariffId: user.tariffId,
              tariffIds: server.tariffIds,
              sessionAge: Math.round(sessionAge / 1000 / 60) + ' минут'
            })
            break
          } else {
            logger.warn('Dashboard', 'Сессия сервера истекла', { 
              serverId: server.id,
              serverName: server.name,
              sessionAge: Math.round(sessionAge / 1000 / 60) + ' минут'
            })
          }
        }
      }
      
      // Если не нашли сервер с сессией для тарифа, ищем любой активный сервер с credentials
      if (!serverId) {
        logger.warn('Dashboard', 'Сервер с сессией для тарифа не найден, ищем любой активный сервер', {
          tariffId: user.tariffId
        })
        
        for (const server of serversToCheck) {
          const isActive = server.active !== false
          const hasCredentials = server.xuiUsername && server.xuiPassword
          const hasServerInfo = server.serverIP && server.serverPort
          
          if (isActive && hasCredentials && hasServerInfo) {
            serverId = server.id
            serverIP = server.serverIP
            serverPort = server.serverPort
            randompath = server.randompath
            protocol = server.protocol || (server.serverPort === 443 || server.serverPort === 40919 ? 'https' : 'http')
            serverInboundId = server.xuiInboundId || inboundId
            
            logger.info('Dashboard', 'Найден активный сервер с credentials для getKey (сессия будет получена автоматически)', {
              serverId,
              serverName: server.name,
              serverInboundId,
              tariffId: user.tariffId,
              tariffIds: server.tariffIds
            })
            break
          }
        }
      }
      
      if (!serverId || !serverIP || !serverPort) {
        throw new Error('Не найден активный сервер с сохраненной сессией или учетными данными для данного тарифа. Выполните тест сессии в настройках сервера.')
      }
    } catch (err) {
      logger.error('Dashboard', 'Ошибка получения сервера с сессией', null, err)
      throw new Error('Не удалось получить сессию сервера. Выполните тест сессии в настройках сервера.')
    }

    // Используем inboundId из настроек сервера, если он есть
    const finalInboundId = serverInboundId || inboundId || '1'

    // Определяем, является ли это новой подпиской (первое подключение тарифа)
    // Это первая подписка, если у пользователя нет активного тарифа или UUID
    const isNewSubscription = !user.tariffId || !user.uuid || !user.plan

    // Создаем клиента в 3x-ui через Backend Proxy
    // Backend использует сохраненную сессию из базы данных
    try {
      // Формируем категоризированные данные для n8n
      const operationData = {
        // Маркировка операции
        operation: 'add_client',
        category: isNewSubscription ? 'new_subscription' : 'update_subscription',
        timestamp: new Date().toISOString(),
        
        // Базовые данные для всех операций
        userId: user.id,
        userUuid: clientId, // UUID профиля - самое главное!
        userName: user.name || user.email?.split('@')[0] || 'User',
        userEmail: user.email,
        
        // Данные для 3x-ui
        email: user.name || user.email, // Имя пользователя из профиля
        inboundId: parseInt(finalInboundId), // ID инбаунда из настроек сервера
        totalGB: totalGB, // Ограничения по тарифу
        expiryTime: expiryTime, // Срок работы подписки в миллисекундах
        limitIp: limitIp, // Количество устройств
        clientId: clientId, // UUID из карточки личного кабинета пользователя
        subId: subId, // Генерируется при регистрации нового пользователя
        tgId: tgId, // Опционально, из Telegram
        
        // Данные сервера
        serverId: serverId,
        sessionCookie: sessionCookie, // Сессия из базы данных
        serverIP: serverIP,
        serverPort: serverPort,
        randompath: randompath,
        protocol: protocol,
      }

      // Если это новая подписка, добавляем детальные данные для n8n
      if (isNewSubscription) {
        operationData.subscriptionDetails = {
          tariffName: 'FREE', // Для getKey всегда FREE тариф
          devices: limitIp,
          period: {
            expiryDate3xui: expiryTime, // В миллисекундах для 3x-ui (Unix Timestamp * 1000)
            expiryDateIso: expiryTime > 0 ? new Date(expiryTime).toISOString() : null,
            expiryDateUnix: expiryTime > 0 ? Math.floor(expiryTime / 1000) : 0, // Unix timestamp в секундах
          },
          userName: user.name || user.email?.split('@')[0] || 'User',
          profileUuid: clientId, // UUID профиля - самое главное!
        }
      }

      // Загружаем webhook URL из Firestore и передаем в запрос
      const webhookUrl = await loadWebhookUrl()
      if (webhookUrl) {
        operationData.webhookUrl = webhookUrl
        logger.info('Dashboard', 'Webhook URL загружен из Firestore и добавлен в запрос', { webhookUrl })
      }
      
      const result = await xuiService.addClient(operationData)

      logger.info('Dashboard', 'Клиент создан в 3x-ui через Proxy', { 
        email: user.email, 
        uuid: result.vpnUuid || clientId,
        serverId,
        totalGB,
        expiryTime: expiryTime > 0 ? new Date(expiryTime).toISOString() : 'без ограничений'
      })

      // Генерируем ссылку на подписку вместо UUID
      // Формат: https://subs.skypath.fun:3458/vk198/{SUBID} или из тарифа
      const finalSubId = user.subId || ''
      if (!finalSubId) {
        logger.error('Dashboard', 'У пользователя отсутствует subId, невозможно сгенерировать ссылку подписки', {
          userId: user.id,
          email: user.email
        })
        throw new Error('Отсутствует subId пользователя. Обратитесь к администратору.')
      }
      
      // Загружаем тариф пользователя, если он есть, чтобы использовать ссылку из тарифа
      let subscriptionLink
      if (user.tariffId) {
        try {
          const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, user.tariffId)
          const tariffSnapshot = await getDoc(tariffDoc)
          if (tariffSnapshot.exists()) {
            const tariff = tariffSnapshot.data()
            if (tariff.subscriptionLink && tariff.subscriptionLink.trim()) {
              // Убираем завершающий слэш, если есть, и добавляем subId
              const baseLink = tariff.subscriptionLink.trim().replace(/\/$/, '')
              subscriptionLink = `${baseLink}/${finalSubId}`
              logger.info('Dashboard', 'Использована ссылка из тарифа для getKey', {
                tariffId: user.tariffId,
                baseLink: tariff.subscriptionLink,
                finalLink: subscriptionLink
              })
            }
          }
        } catch (tariffError) {
          logger.warn('Dashboard', 'Ошибка загрузки тарифа для getKey, используем дефолтную ссылку', {
            tariffId: user.tariffId
          }, tariffError)
        }
      }
      
      // Если ссылка из тарифа не получена, используем дефолтную
      if (!subscriptionLink) {
        subscriptionLink = `https://subs.skypath.fun:3458/vk198/${finalSubId}`
        logger.info('Dashboard', 'Использована дефолтная ссылка подписки для getKey', {
          subscriptionLink
        })
      }
      
      logger.info('Dashboard', 'Ссылка на подписку сгенерирована для getKey', {
        userId: user.id,
        email: user.email,
        subscriptionLink
      })

      // Возвращаем ссылку на подписку вместо UUID
      return subscriptionLink
    } catch (error) {
      logger.error('Dashboard', 'Ошибка создания клиента в 3x-ui', { 
        email: user.email, 
        inboundId,
        serverId
      }, error)
      throw error
    }
  },

  /**
   * Инициация оплаты через YooMoney
   * @param {Object} user - Данные пользователя
   * @param {Object} tariff - Данные тарифа
   * @param {number} amount - Сумма платежа
   * @param {number} devices - Количество устройств (для SUPER тарифа)
   * @param {number} periodMonths - Период оплаты в месяцах (для SUPER тарифа)
   * @param {number} discount - Скидка (0-1)
   * @returns {Promise<Object>} Объект с paymentUrl и orderId
   */
  /**
   * Опции для инициации платежа (добавление устройств к Super)
   * @param {string} [options.operationType] - 'add_devices' для доплаты за устройства
   * @param {number} [options.newDevicesCount] - итоговое количество устройств после оплаты
   */
  async initiatePayment(user, tariff, amount, devices = null, periodMonths = 1, discount = 0, promocodeId = null, options = null) {
    try {
      logger.info('Dashboard', 'Инициация оплаты через Platega', {
        userId: user?.id,
        tariffId: tariff?.id,
        amount,
        devices,
        periodMonths,
        discount
      })

      // Проверяем существующие платежи со статусом 'pending' для этого пользователя
      try {
        const paymentsCollection = collection(db, `artifacts/${APP_ID}/public/data/payments`)
        const pendingQuery = query(
          paymentsCollection,
          where('userId', '==', user.id),
          where('status', '==', 'pending')
        )
        const pendingSnapshot = await getDocs(pendingQuery)
        
        if (!pendingSnapshot.empty) {
          const pendingPayments = []
          pendingSnapshot.forEach((docSnapshot) => {
            pendingPayments.push({
              id: docSnapshot.id,
              ...docSnapshot.data(),
            })
          })
          
          // Сортируем по дате создания (новые сначала)
          pendingPayments.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
            return dateB - dateA
          })
          
          const latestPending = pendingPayments[0]
          
          logger.info('Dashboard', 'Найдены существующие платежи со статусом pending', {
            userId: user.id,
            count: pendingPayments.length,
            latestOrderId: latestPending.orderId,
            latestCreatedAt: latestPending.createdAt
          })
          
          // Возвращаем существующий платеж, если он был создан недавно (менее 24 часов назад)
          const paymentAge = latestPending.createdAt 
            ? (Date.now() - new Date(latestPending.createdAt).getTime()) / (1000 * 60 * 60)
            : Infinity
          
          if (paymentAge < 24) {
            logger.info('Dashboard', 'Найден существующий платеж со статусом pending, пропускаем проверку', {
              orderId: latestPending.orderId,
              paymentAgeHours: paymentAge.toFixed(2),
              amount: latestPending.amount
            })
            
            // Разрешаем создание нового платежа, даже если есть pending
            // Пользователь может создать новый платеж для того же тарифа или другого
            // Старые pending платежи будут обработаны webhook или очищены админом
            logger.info('Dashboard', 'Продолжаем создание нового платежа несмотря на существующий pending', {
              existingOrderId: latestPending.orderId
            })
          }
        }
      } catch (err) {
        // Если это ошибка о существующем платеже, пробрасываем её
        if (err.message && err.message.includes('незавершенный платеж')) {
          throw err
        }
        // Иначе логируем и продолжаем
        logger.warn('Dashboard', 'Ошибка проверки существующих платежей', { userId: user.id }, err)
      }

      // Загружаем настройки платежной системы из Firestore
      let paymentSettings = {}
      try {
        const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
        const settingsSnapshot = await getDoc(settingsDoc)
        if (settingsSnapshot.exists()) {
          const settingsData = settingsSnapshot.data()
          paymentSettings = {
            plategaMerchantId: settingsData.plategaMerchantId || null,
            plategaSecretKey: settingsData.plategaSecretKey || null,
          }
          logger.info('Dashboard', 'Настройки платежной системы загружены', {
            hasMerchantId: !!paymentSettings.plategaMerchantId,
            hasSecretKey: !!paymentSettings.plategaSecretKey
          })
        } else {
          logger.warn('Dashboard', 'Документ settings не найден в Firestore')
        }
      } catch (err) {
        logger.error('Dashboard', 'Ошибка загрузки настроек платежной системы', null, err)
        // Продолжаем работу без настроек, n8n может использовать свои настройки
      }

      // Вычисляем финальную сумму с учетом скидки (промокод)
      let finalAmount = amount
      if (discount > 0 && discount < 1) {
        finalAmount = amount * (1 - discount)
      }

      // Скидка за смену тарифа (остаток при понижении в первой половине периода) — применяется к следующей одной оплате
      let nextPaymentDiscountAmountUsed = 0
      try {
        const userDocRef = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
        const userDocSnap = await getDoc(userDocRef)
        if (userDocSnap.exists()) {
          const planChangeDiscount = userDocSnap.get('nextPaymentDiscountAmount')
          if (typeof planChangeDiscount === 'number' && planChangeDiscount > 0) {
            nextPaymentDiscountAmountUsed = Math.min(planChangeDiscount, finalAmount)
            finalAmount = Math.max(0, finalAmount - nextPaymentDiscountAmountUsed)
            logger.info('Dashboard', 'Применена скидка за смену тарифа к сумме оплаты', {
              userId: user.id,
              nextPaymentDiscountAmountUsed,
              finalAmount,
            })
          }
        }
      } catch (e) {
        logger.warn('Dashboard', 'Не удалось прочитать nextPaymentDiscountAmount', { userId: user.id }, e)
      }

      // Получаем inboundId для тарифа (из сервера, привязанного к тарифу)
      let tariffInboundId = null
      try {
        const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
        const settingsSnapshot = await getDoc(settingsDoc)
        if (settingsSnapshot.exists()) {
          const settingsData = settingsSnapshot.data()
          const serversList = settingsData.servers || []
          
          // Ищем сервер, привязанный к данному тарифу
          const serverForTariff = serversList.find(server => {
            if (server.tariffIds && server.tariffIds.length > 0) {
              return server.tariffIds.includes(tariff.id)
            }
            return false
          })
          
          if (serverForTariff && serverForTariff.xuiInboundId) {
            tariffInboundId = serverForTariff.xuiInboundId
            logger.info('Dashboard', 'Найден inboundId для тарифа из сервера', {
              tariffId: tariff.id,
              serverId: serverForTariff.id,
              inboundId: tariffInboundId
            })
          } else {
            logger.warn('Dashboard', 'Не найден сервер для тарифа, inboundId не будет передан', {
              tariffId: tariff.id
            })
          }
        }
      } catch (inboundIdError) {
        logger.warn('Dashboard', 'Ошибка получения inboundId для тарифа', {
          tariffId: tariff.id
        }, inboundIdError)
      }

      // Генерируем ссылку на оплату (Platega). Запись платежа создаётся только на бэкенде (generate-link), не дублируем на фронте.
      const paymentServiceInstance = paymentService.getInstance()
      const paymentResult = await paymentServiceInstance.generatePaymentLink(
        user.id,
        finalAmount,
        tariff.id,
        paymentSettings,
        {
          uuid: user.uuid || null,
          email: user.email || null,
          inboundId: tariffInboundId || null
        },
        {
          tariffName: tariff.name ?? null,
          devices: devices ?? tariff.devices ?? 1,
          periodMonths: periodMonths ?? 1,
          discount: discount ?? 0,
          originalAmount: amount,
          ...(nextPaymentDiscountAmountUsed > 0 && { nextPaymentDiscountAmountUsed }),
          ...(options?.operationType === 'add_devices' && options?.newDevicesCount != null && {
            operationType: 'add_devices',
            newDevicesCount: options.newDevicesCount,
          }),
        }
      )

      return {
        success: true,
        paymentUrl: paymentResult.paymentUrl,
        orderId: paymentResult.orderId,
        amount: paymentResult.amount || finalAmount,
        requiresPayment: true, // Указываем, что требуется оплата
      }
  } catch (error) {
    logger.error('Dashboard', 'Ошибка инициации оплаты', {
      userId: user?.id,
      tariffId: tariff?.id,
      amount
    }, error)
    throw error
  }
},

  /**
   * Удаление всех платежей со статусом 'pending' для пользователя
   * @param {string} userId - ID пользователя
   * @returns {Promise<Object>} Результат удаления (количество удаленных платежей)
   */
  async clearPendingPayments(userId) {
    if (!db || !userId) {
      throw new Error('База данных недоступна или userId не указан')
    }

    try {
      logger.info('Dashboard', 'Очистка платежей со статусом pending', { userId })
      
      const paymentsCollection = collection(db, `artifacts/${APP_ID}/public/data/payments`)
      const pendingQuery = query(
        paymentsCollection,
        where('userId', '==', userId),
        where('status', '==', 'pending')
      )
      const pendingSnapshot = await getDocs(pendingQuery)
      
      if (pendingSnapshot.empty) {
        logger.info('Dashboard', 'Платежи со статусом pending не найдены', { userId })
        return { deleted: 0, message: 'Не найдено платежей со статусом pending' }
      }
      
      const deletePromises = []
      pendingSnapshot.forEach((docSnapshot) => {
        deletePromises.push(deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/payments`, docSnapshot.id)))
      })
      
      await Promise.all(deletePromises)
      
      const deletedCount = deletePromises.length
      logger.info('Dashboard', 'Платежи со статусом pending удалены', { 
        userId, 
        deletedCount 
      })
      
      return { 
        deleted: deletedCount, 
        message: `Удалено ${deletedCount} платежей со статусом pending` 
      }
    } catch (err) {
      logger.error('Dashboard', 'Ошибка удаления платежей со статусом pending', { userId }, err)
      throw err
    }
  },

  /**
   * Инициация оплаты за добавление устройств к действующей подписке Super.
   * Сумма = (доп. устройства) × (цена за устройство/мес) × (оставшиеся месяцы). Скидка 5%.
   * @param {Object} user - Текущий пользователь
   * @param {Object} tariff - Тариф Super
   * @param {number} additionalDevices - Сколько устройств добавить
   * @returns {Promise<Object>} { paymentUrl, orderId, amount, requiresPayment, tariffId, tariffName, devices, periodMonths, operationType: 'add_devices', newDevicesCount }
   */
  async addDevicesToSubscription(user, tariff, additionalDevices) {
    if (!user || !tariff || !user.expiresAt || additionalDevices < 1) {
      throw new Error('Недостаточно данных или некорректное количество устройств')
    }
    const isSuper = tariff.name?.toLowerCase() === 'super' || tariff.plan?.toLowerCase() === 'super'
    if (!isSuper) {
      throw new Error('Добавление устройств доступно только для тарифа Super')
    }
    const now = Date.now()
    const expiresAt = new Date(user.expiresAt).getTime()
    if (expiresAt <= now) {
      throw new Error('Подписка истекла. Сначала продлите подписку.')
    }
    const remainingMs = expiresAt - now
    const remainingMonths = Math.max(1, Math.ceil(remainingMs / (30 * 24 * 60 * 60 * 1000)))
    const currentDevices = user.devices || 1
    const newDevicesCount = currentDevices + additionalDevices
    const devicePrice = tariff.price || 150
    const amount = additionalDevices * devicePrice * remainingMonths
    if (amount <= 0) {
      throw new Error('Некорректная сумма оплаты')
    }
    const ADD_DEVICES_DISCOUNT = 0.05 // скидка 5% при добавлении устройств
    const result = await this.initiatePayment(
      user,
      tariff,
      amount,
      newDevicesCount,
      remainingMonths,
      ADD_DEVICES_DISCOUNT,
      null,
      { operationType: 'add_devices', newDevicesCount }
    )
    return {
      ...result,
      operationType: 'add_devices',
      newDevicesCount,
      devices: newDevicesCount,
      periodMonths: remainingMonths,
    }
  },

  /**
   * После успешной оплаты «добавить устройства»: обновляет devices в Firestore и limitIp в 3x-ui.
   * @param {Object} user - Текущий пользователь (с uuid, tariffId, expiresAt, email и т.д.)
   * @param {number} newDevicesCount - Итоговое количество устройств
   * @returns {Promise<Object>} Обновлённые данные пользователя
   */
  async applyAddDevicesAfterPayment(user, newDevicesCount) {
    if (!db || !user || !user.id || user.uuid == null || user.uuid === '') {
      throw new Error('Недостаточно данных пользователя для применения добавления устройств')
    }
    const clientId = user.uuid
    const inboundId = import.meta.env?.VITE_XUI_INBOUND_ID || '1'

    const userDocRef = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
    await updateDoc(userDocRef, {
      devices: newDevicesCount,
      updatedAt: new Date().toISOString(),
    })
    logger.info('Dashboard', 'Обновлено количество устройств в Firestore', { userId: user.id, newDevicesCount })

    let serverId = null
    let sessionCookie = null
    let serverIP = null
    let serverPort = null
    let randompath = null
    let protocol = null
    let serverInboundId = null
    let tariffData = { trafficGB: 0 }
    try {
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      const settingsSnapshot = await getDoc(settingsDoc)
      const settingsData = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
      const serversList = settingsData.servers || []
      let serversToCheck = serversList
      if (user.tariffId) {
        serversToCheck = serversList.filter(server => {
          if (server.tariffIds && server.tariffIds.length > 0) return server.tariffIds.includes(user.tariffId)
          return true
        })
      }
      for (const server of serversToCheck) {
        if (server.active && (server.sessionCookie || (server.xuiUsername && server.xuiPassword))) {
          serverId = server.id
          sessionCookie = server.sessionCookie || null
          serverIP = server.serverIP
          serverPort = server.serverPort
          randompath = server.randompath
          protocol = server.protocol || (server.serverPort === 443 || server.serverPort === 40919 ? 'https' : 'http')
          serverInboundId = server.xuiInboundId || inboundId
          break
        }
      }
      if (user.tariffId) {
        const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, user.tariffId)
        const tariffSnap = await getDoc(tariffDoc)
        if (tariffSnap.exists()) tariffData = tariffSnap.data()
      }
      if (!serverId || !serverIP || !serverPort) {
        logger.warn('Dashboard', 'Сервер для 3x-ui не найден, устройства обновлены только в Firestore', { userId: user.id })
        return { ...user, devices: newDevicesCount }
      }
    } catch (err) {
      logger.warn('Dashboard', 'Ошибка получения сервера для обновления 3x-ui', { userId: user.id }, err)
      return { ...user, devices: newDevicesCount }
    }

    const finalInboundId = serverInboundId || inboundId || '1'
    const expiryTime = user.expiresAt ? new Date(user.expiresAt).getTime() : 0
    const totalGB = tariffData.trafficGB > 0 ? tariffData.trafficGB * 1024 * 1024 * 1024 : 0
    const xuiService = XUIService.getInstance()
    const webhookUrl = await loadWebhookUrl()
    const addClientData = {
      operation: 'add_client',
      category: 'update_subscription',
      timestamp: new Date().toISOString(),
      userId: user.id,
      userUuid: clientId,
      userName: user.name || user.email?.split('@')[0] || 'User',
      userEmail: user.email,
      email: user.name || user.email,
      inboundId: parseInt(finalInboundId),
      totalGB,
      expiryTime,
      limitIp: newDevicesCount,
      clientId,
      subId: user.subId || '',
      tgId: user.tgId || '',
      serverId,
      sessionCookie,
      serverIP,
      serverPort,
      randompath,
      protocol,
    }
    if (webhookUrl) addClientData.webhookUrl = webhookUrl
    try {
      await xuiService.addClient(addClientData)
      logger.info('Dashboard', 'Обновлён limitIp в 3x-ui после добавления устройств', { userId: user.id, newDevicesCount })
    } catch (err) {
      logger.error('Dashboard', 'Ошибка обновления 3x-ui при добавлении устройств', { userId: user.id, newDevicesCount }, err)
      throw new Error(`Устройства обновлены в личном кабинете, но не удалось обновить лимит в 3x-ui: ${err.message}`)
    }
    return { ...user, devices: newDevicesCount }
  },

  /**
   * Проверка статуса платежа по orderId
   * @param {string} orderId - ID заказа
   * @returns {Promise<Object|null>} Данные платежа или null
   */
  async checkPaymentStatus(orderId) {
    if (!db || !orderId) return null

    try {
      const paymentsCollection = collection(db, `artifacts/${APP_ID}/public/data/payments`)
      const q = query(paymentsCollection, where('orderId', '==', orderId))
      const paymentsSnapshot = await getDocs(q)
      
      if (paymentsSnapshot.empty) {
        logger.warn('Dashboard', 'Платеж не найден', { orderId })
        return null
      }
      
      const paymentDoc = paymentsSnapshot.docs[0]
      const paymentData = {
        id: paymentDoc.id,
        ...paymentDoc.data(),
      }
      
      logger.debug('Dashboard', 'Статус платежа проверен', {
        orderId,
        status: paymentData.status
      })
      
      return paymentData
    } catch (error) {
      logger.error('Dashboard', 'Ошибка проверки статуса платежа', { orderId }, error)
      throw error
    }
  },

  /**
   * Запрос статуса платежа через API (GET /api/payment/status/:orderId).
   * Используется для опроса после оплаты; бэкенд при необходимости запрашивает Platega и синхронизирует Firestore.
   * @param {string} orderId - ID заказа
   * @returns {Promise<{ success: boolean, status: string, payment?: object, plategaTransaction?: object }>}
   */
  async fetchPaymentStatus(orderId) {
    if (!orderId) {
      return { success: false, status: 'pending' }
    }
    try {
      const response = await fetch(`/api/payment/status/${encodeURIComponent(orderId)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        logger.warn('Dashboard', 'Ответ API статуса платежа не OK', { orderId, status: response.status, data })
        return { success: false, status: 'pending' }
      }
      return {
        success: !!data.success,
        status: data.status || 'pending',
        payment: data.payment,
        plategaTransaction: data.plategaTransaction,
      }
    } catch (error) {
      logger.warn('Dashboard', 'Ошибка запроса статуса платежа', { orderId }, error)
      return { success: false, status: 'pending' }
    }
  },

  /**
   * Проверка платежа через webhook
   * @param {string} orderId - ID заказа
   * @returns {Promise<Object>} Результат проверки платежа с данными платежа
   */
  async verifyPayment(orderId) {
    if (!orderId) {
      throw new Error('orderId обязателен для проверки платежа')
    }

    try {
      logger.info('Dashboard', 'Отправка запроса на проверку платежа', { orderId })

      // Отправляем запрос на проверку платежа через API
      // Сервер сам найдет платеж по orderId и проверит его
      const response = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: orderId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        logger.error('Dashboard', 'Ошибка от сервера при проверке платежа', {
          orderId,
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          fullErrorData: errorData
        })
        
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      logger.info('Dashboard', 'Результат проверки платежа получен от n8n', {
        orderId,
        success: result.success,
        hasPayment: !!result.payment,
        paymentStatus: result.payment?.status,
        hasResult: !!result.result,
        resultIsArray: Array.isArray(result.result),
        resultLength: Array.isArray(result.result) ? result.result.length : 'N/A',
        resultType: typeof result.result,
        resultKeys: result.result && typeof result.result === 'object' ? Object.keys(result.result) : 'N/A',
        fullResult: JSON.stringify(result).substring(0, 2000)
      })

      if (result.success && !result.payment && !result.result) {
        logger.warn('Dashboard', 'Verify успешен, но нет ни payment, ни result — n8n мог вернуть пустой или неожиданный формат. Проверьте логи бэкенда (n8n-webhook-proxy).', {
          orderId,
          responseKeys: Object.keys(result || {})
        })
      }

      // Возвращаем результат от n8n
      // n8n уже искал запись в базе данных по orderId и вернул данные, если найдена
      // Не делаем дополнительных запросов к Firestore или другим API
      return result
    } catch (error) {
      logger.error('Dashboard', 'Ошибка проверки платежа через webhook', {
        orderId
      }, error)
      throw error
    }
  },

  /**
   * Создание подписки
   * @param {Object} user - Данные пользователя
   * @param {Object} tariff - Данные тарифа
   * @param {number} devices - Количество устройств (для SUPER тарифа)
   * @param {string} natrockPort - Выбранный натрек-порт (для Multi тарифа)
   * @param {number} periodMonths - Период оплаты в месяцах (для SUPER тарифа)
   * @param {boolean} testPeriod - Тестовый период (3 GB трафика, 24 часа)
   * @param {string} paymentMode - Режим оплаты ('pay_now' или 'pay_later')
   * @param {number} discount - Скидка (0-1)
   * @returns {Promise<Object>} Обновленные данные пользователя с VPN ссылкой или ссылка на оплату
   */
  async createSubscription(user, tariff, devices = null, natrockPort = null, periodMonths = 1, testPeriod = false, paymentMode = 'pay_now', discount = 0, promocodeId = null) {
    console.log('🎯 dashboardService.createSubscription: Начало функции', {
      userId: user?.id,
      userEmail: user?.email,
      tariffName: tariff?.name,
      tariffId: tariff?.id,
      devices,
      natrockPort,
      periodMonths,
      testPeriod,
      paymentMode,
      discount,
      hasDb: !!db,
      hasUser: !!user,
      hasTariff: !!tariff
    })

    if (!db || !user || !tariff) {
      const missing = []
      if (!db) missing.push('db')
      if (!user) missing.push('user')
      if (!tariff) missing.push('tariff')
      console.error('❌ dashboardService.createSubscription: Отсутствуют данные:', missing)
      throw new Error(`Недостаточно данных для создания подписки. Отсутствуют: ${missing.join(', ')}`)
    }

    const inboundId = import.meta.env.VITE_XUI_INBOUND_ID
    if (!inboundId) {
      console.warn('⚠️ dashboardService.createSubscription: VITE_XUI_INBOUND_ID не настроен, будет использоваться значение из сервера')
    }

    console.log('🔄 dashboardService.createSubscription: Получение экземпляра XUIService...')
    const xuiService = XUIService.getInstance()
    console.log('✅ dashboardService.createSubscription: XUIService получен', {
      hasXuiService: !!xuiService
    })

    // Используем существующий UUID или генерируем новый
    let clientId = user.uuid
    if (!clientId || clientId.trim() === '') {
      // Генерируем новый UUID v4
      clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
      logger.info('Dashboard', 'UUID сгенерирован при создании подписки', { email: user.email, uuid: clientId })
    } else {
      logger.info('Dashboard', 'Используется существующий UUID при создании подписки', { email: user.email, uuid: clientId })
    }
    
    // Определяем количество устройств: приоритет от переданного параметра, затем тариф, затем профиль
    const finalDevices = devices || tariff.devices || user.devices || 1
    
    // Определяем период оплаты (для SUPER тарифа)
    const finalPeriodMonths = periodMonths || 1
    
    // Вычисляем дату окончания
    const now = Date.now()
    let expiryTime = 0
    let testPeriodStartDate = null
    let testPeriodEndDate = null
    let paymentStatus = 'paid' // 'paid', 'test_period', 'unpaid'
    
    // Проверяем, есть ли у пользователя активная подписка для продления
    const existingSubscriptionEndDate = user.subscriptionEndDate || user.expiresAt || 0
    const hasActiveSubscription = existingSubscriptionEndDate > now
    
    if (testPeriod && paymentMode === 'pay_later') {
      // Тестовый период: 3 GB трафика и 24 часа
      testPeriodStartDate = now
      testPeriodEndDate = now + (24 * 60 * 60 * 1000) // 24 часа
      expiryTime = testPeriodEndDate
      paymentStatus = 'test_period'
    } else if (paymentMode === 'paid') {
      // Платеж уже оплачен - создаем подписку с оплаченным статусом
      const durationDays = finalPeriodMonths * 30 // Примерно 30 дней в месяце
      
      // Если у пользователя уже есть активная подписка, продлеваем от текущей даты окончания
      if (hasActiveSubscription) {
        expiryTime = existingSubscriptionEndDate + (durationDays * 24 * 60 * 60 * 1000)
        logger.info('Dashboard', 'Продление существующей подписки', {
          userId: user.id,
          tariffId: tariff.id,
          periodMonths: finalPeriodMonths,
          currentEndDate: new Date(existingSubscriptionEndDate).toISOString(),
          newEndDate: new Date(expiryTime).toISOString(),
          extensionDays: durationDays
        })
      } else {
        // Создаем новую подписку от текущей даты
        expiryTime = now + (durationDays * 24 * 60 * 60 * 1000)
        logger.info('Dashboard', 'Создание новой подписки с уже оплаченным платежом', {
          userId: user.id,
          tariffId: tariff.id,
          periodMonths: finalPeriodMonths,
          expiresAt: new Date(expiryTime).toISOString()
        })
      }
      paymentStatus = 'paid'
    } else {
      // Обычная оплата: период из параметров или тарифа
      const durationDays = finalPeriodMonths * 30 // Примерно 30 дней в месяце
      
      // Если у пользователя уже есть активная подписка, продлеваем от текущей даты окончания
      if (hasActiveSubscription) {
        expiryTime = existingSubscriptionEndDate + (durationDays * 24 * 60 * 60 * 1000)
        logger.info('Dashboard', 'Продление существующей подписки (обычная оплата)', {
          userId: user.id,
          tariffId: tariff.id,
          periodMonths: finalPeriodMonths,
          currentEndDate: new Date(existingSubscriptionEndDate).toISOString(),
          newEndDate: new Date(expiryTime).toISOString(),
          extensionDays: durationDays
        })
      } else {
        // Создаем новую подписку от текущей даты
        expiryTime = now + (durationDays * 24 * 60 * 60 * 1000)
      }
      paymentStatus = 'paid'
    }

    // Тестовый период для лимита трафика (нужно до блока объединённого тарифа)
    const isTestPeriodForTraffic = Boolean(testPeriod || paymentMode === 'pay_later')

    // Получаем активный сервер с сохраненной сессией из настроек
    let serverId = null
    let sessionCookie = null
    let serverIP = null
    let serverPort = null
    let randompath = null
    let protocol = null
    let xuiUsername = null
    let xuiPassword = null
    let serverInboundId = null
    
    try {
      // Загружаем настройки, где хранятся серверы
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      const settingsSnapshot = await getDoc(settingsDoc)
      const settingsData = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
      const serversList = settingsData.servers || []
      
      logger.info('Dashboard', 'Поиск сервера с сессией из настроек', { 
        totalServers: serversList.length,
        hasSettings: settingsSnapshot.exists()
      })

      // Объединённый тариф: несколько серверов по очереди, настройки и ссылка подписки для каждого; цена общая
      const linkedConfigs = Array.isArray(tariff.linkedTariffConfigs) && tariff.linkedTariffConfigs.length > 0 ? tariff.linkedTariffConfigs : null
      const linkedIds = Array.isArray(tariff.linkedTariffIds) ? tariff.linkedTariffIds.filter(Boolean) : []
      let listToUse = linkedConfigs && linkedConfigs.length > 0 ? linkedConfigs : null
      if (!listToUse && linkedIds.length > 0) {
        const linkedTariffs = []
        for (const tid of linkedIds) {
          const ref = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, tid)
          const snap = await getDoc(ref)
          if (snap.exists()) linkedTariffs.push({ id: snap.id, ...snap.data() })
        }
        if (linkedTariffs.length === 0) {
          throw new Error('Объединённый тариф: не найдены связанные тарифы. Проверьте настройки тарифа в админке.')
        }
        listToUse = linkedTariffs.map(lt => ({
          tariffId: lt.id,
          subscriptionLink: (lt.subscriptionLink || '').trim(),
          devices: finalDevices,
          trafficGB: tariff.trafficGB ?? 0,
          plan: (lt.plan || lt.name || '').toLowerCase() || undefined,
        }))
      }
      const useConfigs = !!linkedConfigs && linkedConfigs.length > 0

      if (listToUse && listToUse.length > 0) {
        const subscriptionLinks = []
        let firstUuid = null
        const webhookUrl = await loadWebhookUrl()

        for (let i = 0; i < listToUse.length; i++) {
          const cfg = listToUse[i]
          const tid = cfg.tariffId || cfg.id
          const perDevices = useConfigs ? (Number(cfg.devices) || 1) : finalDevices
          const perTrafficGB = useConfigs ? (Number(cfg.trafficGB) ?? 0) : (tariff.trafficGB ?? 0)
          const totalGB = isTestPeriodForTraffic ? (3 * 1024 * 1024 * 1024) : (perTrafficGB > 0 ? perTrafficGB * 1024 * 1024 * 1024 : 0)

          let serversForTariff = serversList.filter(s => (s.tariffIds || []).includes(tid))
          if (serversForTariff.length === 0) serversForTariff = serversList
          let server = null
          for (const s of serversForTariff) {
            if (s.active === false || !s.serverIP || !s.serverPort) continue
            if (s.sessionCookie && s.sessionCookieReceivedAt) {
              const age = Date.now() - new Date(s.sessionCookieReceivedAt).getTime()
              if (age < 60 * 60 * 1000) { server = s; break }
            }
          }
          if (!server) {
            for (const s of serversForTariff) {
              if (s.active !== false && s.xuiUsername && s.xuiPassword && s.serverIP && s.serverPort) {
                server = s
                break
              }
            }
          }
          if (!server) {
            throw new Error(`Не найден активный сервер для тарифа (id: ${tid}). Настройте сервер в админке.`)
          }

          const perClientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0
            const v = c === 'x' ? r : (r & 0x3) | 0x8
            return v.toString(16)
          })
          const serverInboundId = server.xuiInboundId || import.meta.env.VITE_XUI_INBOUND_ID || '1'
          // Формат как у одиночного тарифа, чтобы n8n получал и обрабатывал каждый вызов так же (webhook 1 раз для 1-го клиента, 2-й раз для 2-го)
          const addData = {
            operation: 'add_client',
            category: 'new_subscription',
            timestamp: new Date().toISOString(),
            testPeriod: !!testPeriod,
            userId: user.id,
            userUuid: perClientId,
            userName: user.name || user.email?.split('@')[0] || 'User',
            userEmail: user.email,
            email: user.name || user.email,
            inboundId: parseInt(serverInboundId),
            totalGB,
            expiryTime: expiryTime,
            limitIp: perDevices,
            clientId: perClientId,
            subId: user.subId || '',
            tgId: user.tgId || '',
            serverId: server.id,
            sessionCookie: server.sessionCookie || null,
            serverIP: server.serverIP,
            serverPort: server.serverPort,
            randompath: server.randompath || '',
            protocol: server.protocol || (server.serverPort === 443 || server.serverPort === 40919 ? 'https' : 'http'),
            subscriptionDetails: {
              tariffName: tariff.name || tariff.plan || 'Unknown',
              devices: perDevices,
              period: {
                months: finalPeriodMonths,
                expiryDate3xui: expiryTime,
                expiryDateIso: expiryTime > 0 ? new Date(expiryTime).toISOString() : null,
                expiryDateUnix: expiryTime > 0 ? Math.floor(expiryTime / 1000) : 0,
              },
              userName: user.name || user.email?.split('@')[0] || 'User',
              profileUuid: perClientId,
            },
            isCombinedTariff: true,
            combinedTariffIndex: i + 1,
            combinedTariffTotal: listToUse.length,
          }
          if (server.xuiUsername && server.xuiPassword && !addData.sessionCookie) {
            addData.xuiUsername = server.xuiUsername
            addData.xuiPassword = server.xuiPassword
          }
          if (webhookUrl) addData.webhookUrl = webhookUrl

          const result = await xuiService.addClient(addData)
          const linkBase = (cfg.subscriptionLink && String(cfg.subscriptionLink).trim())
            ? String(cfg.subscriptionLink).trim().replace(/\/$/, '')
            : 'https://subs.skypath.fun:3458/vk198'
          subscriptionLinks.push(`${linkBase}/${user.subId || ''}`)
          if (i === 0) firstUuid = result?.vpnUuid || perClientId
        }

        const subscriptionLinksWithPlan = listToUse.map((cfg, idx) => ({
          link: subscriptionLinks[idx],
          plan: (cfg.plan || '').toLowerCase() || (idx === 0 ? 'super' : 'multi'),
        }))
        const primaryLink = subscriptionLinks[0]
        const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
        await updateDoc(userDoc, {
          plan: tariff.plan,
          expiresAt: expiryTime > 0 ? expiryTime : null,
          tariffName: tariff.name,
          tariffId: tariff.id,
          devices: finalDevices,
          periodMonths: finalPeriodMonths,
          paymentStatus: paymentStatus,
          testPeriodStartDate: testPeriodStartDate,
          testPeriodEndDate: testPeriodEndDate,
          discount: 0,
          vpnLink: primaryLink,
          subscriptionLink: primaryLink,
          subscriptionLinks,
          subscriptionLinksWithPlan,
          uuid: firstUuid,
          updatedAt: new Date().toISOString(),
        })
        if (paymentStatus === 'paid') {
          await updateDoc(userDoc, { unpaidStartDate: null })
        }

        logger.info('Dashboard', 'Объединённый тариф: клиенты созданы на всех серверах', {
          userId: user.id,
          serversCount: listToUse.length,
          subscriptionLinksCount: subscriptionLinks.length,
        })

        return {
          success: true,
          uuid: firstUuid,
          plan: tariff.plan,
          expiresAt: expiryTime > 0 ? expiryTime : null,
          tariffName: tariff.name,
          tariffId: tariff.id,
          devices: finalDevices,
          periodMonths: finalPeriodMonths,
          paymentStatus: paymentStatus,
          vpnLink: primaryLink,
          subscriptionLink: primaryLink,
          subscriptionLinks,
          subscriptionLinksWithPlan,
        }
      }
      
      // Ищем сервер, привязанный к данному тарифу (если есть привязка)
      let serversToCheck = serversList.filter(server => {
        // Если у сервера есть привязка к тарифам, проверяем, есть ли наш тариф
        if (server.tariffIds && server.tariffIds.length > 0) {
          return server.tariffIds.includes(tariff.id)
        }
        // Если привязки нет - сервер подходит для всех тарифов
        return true
      })
      
      // Если не нашли серверов для этого тарифа, используем все серверы
      if (serversToCheck.length === 0) {
        serversToCheck = serversList
        logger.warn('Dashboard', 'Не найдено серверов для тарифа, используем все доступные', {
          tariffId: tariff.id
        })
      }
      
      // Сначала ищем сервер с активной сессией (не старше 1 часа)
      let foundServer = null
      for (const server of serversToCheck) {
        const hasSession = server.sessionCookie && server.sessionCookieReceivedAt
        const isActive = server.active !== false // Считаем активным, если не указано явно false
        
        logger.debug('Dashboard', 'Проверка сервера', {
          serverId: server.id,
          serverName: server.name,
          isActive,
          hasSession,
          hasCredentials: !!(server.xuiUsername && server.xuiPassword),
          tariffIds: server.tariffIds,
        })
        
        if (hasSession) {
          const sessionAge = Date.now() - new Date(server.sessionCookieReceivedAt).getTime()
          const oneHour = 60 * 60 * 1000
          
          if (sessionAge < oneHour) {
            // Нашли сервер с валидной сессией
            foundServer = server
            logger.info('Dashboard', 'Найден сервер с валидной сессией', {
              serverId: server.id,
              serverName: server.name,
              sessionAge: Math.round(sessionAge / 1000 / 60) + ' минут',
              inboundId: server.xuiInboundId
            })
            break
          } else {
            logger.debug('Dashboard', 'Сессия сервера истекла', {
              serverId: server.id,
              serverName: server.name,
              sessionAge: Math.round(sessionAge / 1000 / 60) + ' минут'
            })
          }
        }
      }
      
      // Если не нашли сервер с валидной сессией, ищем любой активный сервер с credentials
      if (!foundServer) {
        logger.warn('Dashboard', 'Сервер с валидной сессией не найден, ищем любой активный сервер', {})
        
        for (const server of serversToCheck) {
          const isActive = server.active !== false
          const hasCredentials = server.xuiUsername && server.xuiPassword
          const hasServerInfo = server.serverIP && server.serverPort
          
          if (isActive && hasCredentials && hasServerInfo) {
            foundServer = server
            logger.info('Dashboard', 'Найден активный сервер с credentials (сессия будет получена автоматически)', {
              serverId: server.id,
              serverName: server.name,
              inboundId: server.xuiInboundId
            })
            break
          }
        }
      }
      
      if (!foundServer) {
        // Логируем все доступные серверы для отладки
        const availableServers = serversList.map(server => ({
          id: server.id,
          name: server.name,
          active: server.active,
          hasSession: !!(server.sessionCookie && server.sessionCookieReceivedAt),
          hasCredentials: !!(server.xuiUsername && server.xuiPassword),
          hasServerInfo: !!(server.serverIP && server.serverPort),
          tariffIds: server.tariffIds || [],
        }))
        
        logger.error('Dashboard', 'Не найден подходящий сервер', { 
          availableServers,
          requestedTariffId: tariff.id
        })
        throw new Error('Не найден активный сервер с сохраненной сессией или учетными данными для данного тарифа. Выполните тест сессии в настройках сервера.')
      }
      
      // Заполняем данные из найденного сервера
      serverId = foundServer.id
      sessionCookie = foundServer.sessionCookie || null // Может быть null, если сессия истекла
      serverIP = foundServer.serverIP
      serverPort = foundServer.serverPort
      randompath = foundServer.randompath
      protocol = foundServer.protocol || (foundServer.serverPort === 443 || foundServer.serverPort === 40919 ? 'https' : 'http')
      xuiUsername = foundServer.xuiUsername
      xuiPassword = foundServer.xuiPassword
      serverInboundId = foundServer.xuiInboundId // Используем inboundId из настроек сервера
      
      logger.info('Dashboard', 'Данные сервера получены', {
        serverId,
        serverName: foundServer.name,
        serverIP,
        serverPort,
        hasSession: !!sessionCookie,
        inboundId: serverInboundId
      })
      
      // Если сессия отсутствует, но есть credentials - бэкенд получит сессию автоматически
      if (!sessionCookie && xuiUsername && xuiPassword) {
        logger.info('Dashboard', 'Сессия отсутствует, но есть credentials - бэкенд получит сессию автоматически', {
          serverId,
          serverName: foundServer.name
        })
      }
      
      if (!serverIP || !serverPort) {
        throw new Error('У сервера отсутствуют обязательные поля serverIP или serverPort')
      }
      
      if (!serverInboundId) {
        logger.warn('Dashboard', 'У сервера не указан xuiInboundId, используем из переменных окружения', {
          serverId,
          inboundIdFromEnv: inboundId
        })
        serverInboundId = inboundId || '1'
      }
      
    } catch (err) {
      logger.error('Dashboard', 'Ошибка получения сервера с сессией', null, err)
      throw err // Пробрасываем оригинальную ошибку
    }

    // Используем inboundId из настроек сервера
    const finalInboundId = serverInboundId || inboundId || '1'
    
    // ВАЖНО: Backend Proxy ожидает expiryTime в миллисекундах и сам конвертирует в секунды для 3x-ui
    // Согласно документации XUIService и коду backend proxy, expiryTime передается в миллисекундах
    const expiryTimeForBackend = expiryTime // Передаем в миллисекундах, backend конвертирует в секунды
    
    // Определяем, является ли это новой подпиской (новый пользователь подключает тариф впервые)
    // Это первая подписка, если у пользователя нет активного тарифа или тариф отличается
    const isNewSubscription = !user.tariffId || !user.plan || user.tariffId !== tariff.id
    
    // ВАЖНО: Если требуется оплата (pay_now и !testPeriod), НЕ создаем подписку здесь
    // Подписка будет создана только после получения webhook от YooMoney о успешной оплате
    // Проверяем ДО подготовки данных для создания подписки
    logger.debug('Dashboard', 'Проверка условий оплаты', {
      paymentMode,
      testPeriod,
      shouldCheckPayment: paymentMode === 'pay_now' && !testPeriod
    })
    
    if (paymentMode === 'pay_now' && !testPeriod) {
      logger.debug('Dashboard', 'Условие оплаты выполнено, рассчитываем сумму', {
        tariffName: tariff.name,
        tariffPlan: tariff.plan,
        price: tariff.price
      })
      
      const isSuper = tariff.name?.toLowerCase() === 'super' || tariff.plan?.toLowerCase() === 'super'
      let paymentAmount = 0
      
      if (isSuper) {
        // Используем цену из тарифа (цена за устройство за месяц)
        const devicePrice = tariff.price || 150
        const basePrice = finalDevices * devicePrice * finalPeriodMonths
        const discountAmount = discount > 0 ? basePrice * discount : 0
        paymentAmount = basePrice - discountAmount
      } else {
        paymentAmount = tariff.price || 0
      }
      
      logger.debug('Dashboard', 'Сумма платежа рассчитана', {
        paymentAmount,
        isSuper,
        finalDevices,
        finalPeriodMonths,
        discount
      })
      
      if (paymentAmount > 0) {
        // Инициируем оплату БЕЗ создания подписки
        logger.info('Dashboard', 'Инициация оплаты БЕЗ создания подписки (подписка будет создана после webhook)', {
          userId: user.id,
          tariffId: tariff.id,
          amount: paymentAmount
        })
        
        const paymentResult = await this.initiatePayment(
          user,
          tariff,
          paymentAmount,
          finalDevices,
          finalPeriodMonths,
          discount,
          promocodeId
        )
        
        logger.debug('Dashboard', 'Платеж инициирован, получен результат', {
          hasPaymentUrl: !!paymentResult.paymentUrl,
          orderId: paymentResult.orderId,
          amount: paymentResult.amount
        })
        
        // НЕ обновляем статус оплаты здесь - статус изменится только после подтверждения платежа через webhook
        // Это позволяет пользователю попробовать оплатить снова, если оплата не прошла
        
        // Возвращаем ссылку на оплату, НЕ создавая подписку
        logger.info('Dashboard', 'Возвращаем результат с paymentUrl, НЕ создавая подписку', {
          paymentUrl: paymentResult.paymentUrl,
          orderId: paymentResult.orderId,
          amount: paymentResult.amount
        })
        
        const returnValue = {
          success: true,
          paymentUrl: paymentResult.paymentUrl,
          orderId: paymentResult.orderId,
          amount: paymentResult.amount,
          requiresPayment: true,
          // НЕ возвращаем paymentStatus здесь - статус остается прежним до подтверждения
          tariffId: tariff.id,
          tariffName: tariff.name,
          devices: finalDevices,
          periodMonths: finalPeriodMonths,
          discount: discount || 0,
          message: 'Требуется оплата для активации подписки'
        }
        
        logger.debug('Dashboard', 'Возвращаемое значение', returnValue)
        return returnValue
      } else {
        logger.debug('Dashboard', 'Сумма платежа <= 0, пропускаем блок оплаты', { paymentAmount })
      }
    } else {
      logger.debug('Dashboard', 'Условие оплаты НЕ выполнено, продолжаем создание подписки', {
        paymentMode,
        testPeriod
      })
    }

    const TEST_PERIOD_TRAFFIC_BYTES = 3 * 1024 * 1024 * 1024 // 3 GB в байтах

    // Формируем категоризированные данные для n8n с маркировкой операции
    const operationData = {
      // Маркировка операции для разделения потоков в n8n
      operation: 'add_client',
      category: isNewSubscription ? 'new_subscription' : 'update_subscription',
      timestamp: new Date().toISOString(),
      testPeriod: !!testPeriod, // явный флаг для n8n/прокси, чтобы всегда применять 3 GB при тесте

      // Базовые данные для всех операций
      userId: user.id,
      userUuid: clientId, // UUID профиля - самое главное!
      userName: user.name || user.email?.split('@')[0] || 'User',
      userEmail: user.email,

      // Данные для 3x-ui
      email: user.name || user.email, // Имя пользователя из профиля
      inboundId: parseInt(finalInboundId), // Используем inboundId из настроек сервера
      // ВАЖНО: 3x-ui принимает трафик в БАЙТАХ, а не в ГБ
      // Для тестовой подписки (pay_later / testPeriod): всегда 3 GB в байтах
      // Для оплаченной подписки: трафик из тарифа в байтах
      totalGB: isTestPeriodForTraffic
        ? TEST_PERIOD_TRAFFIC_BYTES
        : (tariff.trafficGB > 0 ? tariff.trafficGB * 1024 * 1024 * 1024 : 0), // Конвертируем ГБ в байты
      expiryTime: expiryTimeForBackend, // В миллисекундах, backend конвертирует в секунды для 3x-ui
      limitIp: finalDevices, // Используем определенное количество устройств
      clientId: clientId, // UUID из профиля или сгенерированный
      subId: user.subId || '', // Уникальный subId для 3x-ui (генерируется при регистрации)
      tgId: user.tgId || '',
      
      // Данные сервера
      serverId: serverId,
      sessionCookie: sessionCookie, // Может быть null, если сессия истекла
      serverIP: serverIP,
      serverPort: serverPort,
      randompath: randompath || '',
      protocol: protocol,
      
      // Всегда передаём subscriptionDetails в webhook (n8n: body.subscriptionDetails.tariffName и др.)
      subscriptionDetails: {
        tariffName: tariff.name || tariff.plan || 'Unknown',
        devices: finalDevices,
        period: {
          months: finalPeriodMonths,
          expiryDate3xui: expiryTimeForBackend,
          expiryDateIso: expiryTime > 0 ? new Date(expiryTime).toISOString() : null,
          expiryDateUnix: expiryTime > 0 ? Math.floor(expiryTime / 1000) : 0,
        },
        userName: user.name || user.email?.split('@')[0] || 'User',
        profileUuid: clientId,
      },
      
      // Если сессия отсутствует, передаем credentials для автоматического получения сессии
      ...(xuiUsername && xuiPassword && !sessionCookie ? {
        xuiUsername: xuiUsername,
        xuiPassword: xuiPassword,
      } : {}),
    }

    logger.info('Dashboard', '📤 Подготовка к созданию клиента в 3x-ui через Proxy', {
      operation: operationData.operation,
      category: operationData.category,
      userId: user.id,
      email: user.email,
      clientId: clientId,
      inboundId: finalInboundId,
      expiryTime: expiryTimeForBackend,
      expiryTimeDate: expiryTime > 0 ? new Date(expiryTime).toISOString() : 'без ограничений',
      isTestPeriodForTraffic,
      totalGBLog: isTestPeriodForTraffic ? 3 : (tariff.trafficGB > 0 ? tariff.trafficGB : 0),
      limitIp: finalDevices,
      isNewSubscription,
      subscriptionDetails: operationData.subscriptionDetails
    })

    // Используем operationData как данные для запроса
    const addClientData = operationData

    // Подробное логирование перед отправкой запроса
    logger.info('Dashboard', '📤 Отправка запроса на создание клиента в 3x-ui', {
      ...addClientData,
      // Не логируем пароли и sessionCookie полностью
      sessionCookieLength: addClientData.sessionCookie ? addClientData.sessionCookie.length : 0,
      hasPassword: !!addClientData.xuiPassword,
      passwordLength: addClientData.xuiPassword ? addClientData.xuiPassword.length : 0,
    })

    // Создаем клиента в 3x-ui через Backend Proxy
    // Backend выполнит транзакцию: Firestore (status: creating) → 3x-ui → Firestore (finalize)
    // ВАЖНО: Этот вызов выполняется только для тестового периода или если оплата не требуется
    logger.info('Dashboard', '🚀 Начинаю создание клиента в 3x-ui', {
      testPeriod: testPeriod,
      paymentMode: paymentMode,
      expiryTime: expiryTimeForBackend,
    })
    
    let result
    try {
      logger.info('Dashboard', '📞 Вызов xuiService.addClient...', {
        baseURL: '/api/vpn',
        endpoint: '/add-client'
      })
      
      // Загружаем webhook URL из Firestore и передаем в запрос
      const webhookUrl = await loadWebhookUrl()
      if (webhookUrl) {
        addClientData.webhookUrl = webhookUrl
        logger.info('Dashboard', 'Webhook URL загружен из Firestore и добавлен в запрос', { webhookUrl })
      }
      
      result = await xuiService.addClient(addClientData)
      
      logger.info('Dashboard', '✅ Клиент успешно создан в 3x-ui через Proxy', {
        hasResult: !!result,
        vpnUuid: result?.vpnUuid || clientId,
        sessionUpdated: result?.sessionUpdated || false,
        responseKeys: result ? Object.keys(result) : []
      })
      
      // Успех: явные vpnUuid/success или формат n8n (массив с sub/KEY/ПодпискаДо)
      const hasN8nFormat = Array.isArray(result) && result.length > 0 && (result[0].sub != null || result[0].KEY != null)
      const hasSuccess = result && (result.vpnUuid || result.success || hasN8nFormat)
      if (!hasSuccess) {
        logger.warn('Dashboard', '⚠️ Ответ от Proxy получен, но без UUID или success', {
          result: result
        })
      }
    } catch (error) {
      logger.error('Dashboard', '❌ КРИТИЧЕСКАЯ ОШИБКА: Не удалось создать клиента в 3x-ui', {
        errorMessage: error.message,
        errorType: error.constructor.name,
        errorResponse: error.response?.data,
        errorStatus: error.response?.status,
        errorStatusText: error.response?.statusText,
        errorCode: error.code,
        requestURL: error.config?.url,
        requestMethod: error.config?.method,
        requestBaseURL: error.config?.baseURL,
        requestData: {
          ...addClientData,
          sessionCookie: addClientData.sessionCookie ? `[REDACTED:${addClientData.sessionCookie.length} chars]` : null,
          xuiPassword: addClientData.xuiPassword ? '[REDACTED]' : null,
        },
        fullError: error.toString(),
        stack: error.stack
      }, error)
      
      // Проверяем, является ли это ошибкой недоступности backend proxy
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
        const detailedError = new Error(
          `Backend Proxy недоступен (порт 3001). ` +
          `Убедитесь, что backend proxy сервер запущен на http://localhost:3001\n\n` +
          `Детали ошибки: ${error.message}`
        )
        logger.error('Dashboard', 'Backend Proxy недоступен', null, detailedError)
        throw detailedError
      }
      
      throw error
    }
    
    logger.info('Dashboard', '✅ Клиент успешно создан в 3x-ui через Proxy', { 
      email: user.email, 
      uuid: result.vpnUuid || clientId,
      sessionUpdated: result.sessionUpdated || false,
      inboundId: finalInboundId,
      expiryTime: expiryTimeForBackend,
      expiryTimeSeconds: expiryTime > 0 ? Math.floor(expiryTime / 1000) : 0,
      testPeriod: testPeriod,
      paymentMode: paymentMode
    })

      // Если сессия была обновлена на бэкенде, обновляем её в Firestore (в settings.servers)
      if (result.sessionUpdated && result.sessionCookie && result.serverId) {
        try {
          // Обновляем сессию в settings.servers
          const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
          const settingsSnapshot = await getDoc(settingsDoc)
          const settingsData = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
          const serversList = settingsData.servers || []
          
          // Находим сервер и обновляем его сессию
          const updatedServers = serversList.map(server => {
            if (server.id === result.serverId) {
              return {
                ...server,
                sessionCookie: result.sessionCookie,
                sessionCookieReceivedAt: result.sessionCookieReceivedAt || new Date().toISOString(),
              }
            }
            return server
          })
          
          // Сохраняем обновленные серверы в settings
          await updateDoc(settingsDoc, {
            servers: updatedServers,
            updatedAt: new Date().toISOString(),
          })
          
          logger.info('Dashboard', 'Сессия сервера обновлена в Firestore settings', {
            serverId: result.serverId
          })
        } catch (err) {
          logger.warn('Dashboard', 'Ошибка обновления сессии в Firestore', { 
            serverId: result.serverId 
          }, err)
          // Продолжаем работу, даже если не удалось обновить сессию
        }
      }
    
    // Используем UUID из ответа backend, если он есть
    const finalClientId = result.vpnUuid || clientId

    // Загружаем настройки для получения данных сервера для генерации VPN ссылки
    const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
    const settingsSnapshot = await getDoc(settingsDoc)
    const settingsData = settingsSnapshot.exists() ? settingsSnapshot.data() : {}

    // Генерируем ссылку на подписку (sub link) вместо VLESS
    // Формат: https://subs.skypath.fun:3458/vk198/{SUBID}
    // Если у пользователя нет subId, генерируем его
    let subId = user.subId || ''
    if (!subId) {
      logger.warn('Dashboard', 'У пользователя отсутствует subId, генерируем новый', {
        userId: user.id,
        email: user.email
      })
      
      // Генерируем subId используя ThreeXUI.generateSubId
      try {
        const generatedSubId = ThreeXUI.generateSubId()
        
        // Сохраняем subId в Firestore
        const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
        await updateDoc(userDoc, {
          subId: generatedSubId,
          updatedAt: new Date().toISOString(),
        })
        
        subId = generatedSubId
        user.subId = generatedSubId // Обновляем объект user для согласованности
        logger.info('Dashboard', 'subId сгенерирован и сохранен для пользователя', {
          userId: user.id,
          email: user.email,
          subId: generatedSubId
        })
      } catch (subIdError) {
        logger.error('Dashboard', 'Ошибка генерации subId для пользователя', {
          userId: user.id,
          email: user.email
        }, subIdError)
        throw new Error('Не удалось сгенерировать subId. Обратитесь к администратору.')
      }
    }
    
    // Формируем ссылку на подписку
    // Используем ссылку из тарифа, если она есть, иначе используем дефолтную
    let subscriptionLink
    if (tariff.subscriptionLink && tariff.subscriptionLink.trim()) {
      // Убираем завершающий слэш, если есть, и добавляем subId
      const baseLink = tariff.subscriptionLink.trim().replace(/\/$/, '')
      subscriptionLink = `${baseLink}/${subId}`
      logger.info('Dashboard', 'Использована ссылка из тарифа', {
        tariffId: tariff.id,
        baseLink: tariff.subscriptionLink,
        finalLink: subscriptionLink
      })
    } else {
      // Дефолтная ссылка, если в тарифе не указана
      subscriptionLink = `https://subs.skypath.fun:3458/vk198/${subId}`
      logger.info('Dashboard', 'Использована дефолтная ссылка подписки', {
        tariffId: tariff.id,
        subscriptionLink
      })
    }
    const vpnLink = subscriptionLink // Используем vpnLink для обратной совместимости

    // Обновляем данные пользователя в Firestore с количеством устройств
    const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
    const updateData = {
      plan: tariff.plan,
      expiresAt: expiryTime > 0 ? expiryTime : null,
      tariffName: tariff.name,
      tariffId: tariff.id,
      devices: finalDevices, // Сохраняем количество устройств
      natrockPort: natrockPort || null, // Сохраняем выбранный порт для Multi тарифа
      periodMonths: finalPeriodMonths, // Период оплаты
      paymentStatus: paymentStatus, // Статус оплаты
      testPeriodStartDate: testPeriodStartDate, // Начало тестового периода
      testPeriodEndDate: testPeriodEndDate, // Конец тестового периода
      discount: 0, // Промокод действует только на 1 оплату — не сохраняем скидку (иначе применится при продлении)
      vpnLink: subscriptionLink, // Ссылка на подписку (для обратной совместимости)
      subscriptionLink: subscriptionLink, // Явная ссылка на подписку
      updatedAt: new Date().toISOString(),
    }
    // Если подписка оплачена, очищаем unpaidStartDate
    if (paymentStatus === 'paid') {
      updateData.unpaidStartDate = null
    }
    // Обновляем UUID только если его не было
    if (!user.uuid || user.uuid.trim() === '') {
      updateData.uuid = finalClientId
    }
    await updateDoc(userDoc, updateData)
    logger.info('Dashboard', 'Подписка привязана к пользователю', { 
      userId: user.id, 
      tariffId: tariff.id,
      devices: finalDevices,
      natrockPort: natrockPort,
      periodMonths: finalPeriodMonths,
      paymentStatus: paymentStatus,
      testPeriod: testPeriod,
      expiryTime: expiryTime > 0 ? new Date(expiryTime).toISOString() : null
    })

    // Платеж уже обработан в блоке выше (строка 959), здесь код не должен выполняться
    
    // Создаем запись о платеже для тестового периода
    if (testPeriod) {
      // Для тестового периода создаем запись со статусом 'test'
      const paymentsCollection = collection(db, `artifacts/${APP_ID}/public/data/payments`)
      await addDoc(paymentsCollection, {
        userId: user.id,
        email: user.email,
        tariffId: tariff.id,
        tariffName: tariff.name,
        amount: 0,
        status: 'test',
        devices: finalDevices,
        periodMonths: finalPeriodMonths,
        testPeriodStartDate: testPeriodStartDate,
        testPeriodEndDate: testPeriodEndDate,
        createdAt: new Date().toISOString(),
      })
      logger.info('Dashboard', 'Тестовый период создан', { 
        userId: user.id,
        testPeriodEndDate: new Date(testPeriodEndDate).toISOString()
      })
    }

    // Формируем объект результата для возврата из функции
    const subscriptionResult = {
      uuid: finalClientId,
      plan: tariff.plan,
      expiresAt: expiryTime > 0 ? expiryTime : null,
      tariffName: tariff.name,
      tariffId: tariff.id,
      devices: finalDevices,
      periodMonths: finalPeriodMonths,
      paymentStatus: paymentStatus,
      testPeriodStartDate: testPeriodStartDate,
      testPeriodEndDate: testPeriodEndDate,
      discount: 0, // Промокод действует только на 1 оплату — не возвращаем скидку
      vpnLink: vpnLink, // Ссылка на подписку: https://subs.skypath.fun:3458/vk198/{subId}
      subscriptionLink: subscriptionLink, // Явная ссылка на подписку для ясности
    }

    console.log('✅ dashboardService.createSubscription: Функция завершена успешно, возвращаем результат:', {
      hasUuid: !!subscriptionResult.uuid,
      tariffName: subscriptionResult.tariffName,
      devices: subscriptionResult.devices,
      periodMonths: subscriptionResult.periodMonths,
      paymentStatus: subscriptionResult.paymentStatus,
      hasVpnLink: !!subscriptionResult.vpnLink,
      expiresAt: subscriptionResult.expiresAt ? new Date(subscriptionResult.expiresAt).toISOString() : null
    })

    return subscriptionResult
  },

  /**
   * Проверка и обновление статуса тестового периода
   * Вызывается при загрузке Dashboard для проверки истекших тестовых периодов
   * @param {Object} user - Данные пользователя
   * @returns {Promise<Object|null>} Обновленные данные пользователя или null если обновление не требуется
   */
  async checkAndUpdateTestPeriod(user) {
    if (!db || !user || !user.id) {
      return null
    }

    // Проверяем только если статус - тестовый период
    if (user.paymentStatus !== 'test_period') {
      return null
    }

    const now = Date.now()

    // Если тестовый период истек
    if (user.testPeriodEndDate && user.testPeriodEndDate < now) {
      try {
        const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
        const unpaidStartDate = new Date().toISOString()
        await updateDoc(userDoc, {
          paymentStatus: 'unpaid',
          unpaidStartDate: unpaidStartDate, // Сохраняем дату начала периода неоплаты
          updatedAt: new Date().toISOString(),
        })

        logger.info('Dashboard', 'Тестовый период истек, статус обновлен на unpaid', {
          userId: user.id,
          testPeriodEndDate: new Date(user.testPeriodEndDate).toISOString(),
          unpaidStartDate: unpaidStartDate,
        })

        return {
          ...user,
          paymentStatus: 'unpaid',
          unpaidStartDate: unpaidStartDate,
        }
      } catch (err) {
        logger.error('Dashboard', 'Ошибка обновления статуса тестового периода', { userId: user.id }, err)
        return null
      }
    }

    return null
  },

  /**
   * Проверка и автоматическое удаление неоплаченной подписки после 5 дней
   * @param {Object} user - Данные пользователя
   * @returns {Promise<Object|null>} Обновленные данные пользователя или null если подписка удалена
   */
  async checkAndDeleteUnpaidSubscription(user) {
    if (!db || !user || !user.id) {
      return null
    }

    // Проверяем только если статус - не оплачено
    if (user.paymentStatus !== 'unpaid') {
      return null
    }

    const now = Date.now()
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000 // 5 дней в миллисекундах

    // Определяем дату начала периода неоплаты
    let unpaidStartDate = user.unpaidStartDate
    if (!unpaidStartDate && user.testPeriodEndDate) {
      // Если unpaidStartDate не установлена, используем testPeriodEndDate как дату начала
      unpaidStartDate = user.testPeriodEndDate
    }

    if (!unpaidStartDate) {
      // Если нет даты начала неоплаты, устанавливаем текущую дату
      unpaidStartDate = new Date().toISOString()
      try {
        const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
        await updateDoc(userDoc, {
          unpaidStartDate: unpaidStartDate,
          updatedAt: new Date().toISOString(),
        })
        logger.info('Dashboard', 'Установлена дата начала периода неоплаты', {
          userId: user.id,
          unpaidStartDate: unpaidStartDate,
        })
      } catch (err) {
        logger.error('Dashboard', 'Ошибка установки unpaidStartDate', { userId: user.id }, err)
      }
      return { ...user, unpaidStartDate: unpaidStartDate }
    }

    const unpaidStartTime = new Date(unpaidStartDate).getTime()
    const daysUnpaid = (now - unpaidStartTime) / (24 * 60 * 60 * 1000)

    // Если прошло больше 5 дней - удаляем подписку
    if (daysUnpaid >= 5) {
      logger.info('Dashboard', 'Период неоплаты превысил 5 дней, удаляем подписку', {
        userId: user.id,
        unpaidStartDate: unpaidStartDate,
        daysUnpaid: Math.ceil(daysUnpaid),
      })

      // Вызываем deleteSubscription для полного удаления
      try {
        await this.deleteSubscription(user)
        logger.info('Dashboard', 'Неоплаченная подписка автоматически удалена', {
          userId: user.id,
          daysUnpaid: Math.ceil(daysUnpaid),
        })
        return null // Подписка удалена
      } catch (err) {
        logger.error('Dashboard', 'Ошибка автоматического удаления неоплаченной подписки', { userId: user.id }, err)
        // Продолжаем работу, но логируем ошибку
        return user
      }
    }

    return user // Подписка не удалена, возвращаем пользователя без изменений
  },

  /**
   * Преобразование ошибки в понятное сообщение
   * @param {Error} error - Ошибка
   * @returns {string} Сообщение об ошибке
   */
  getErrorMessage(error) {
    if (!error) return 'Произошла ошибка. Попробуйте еще раз.'

    const message = error.message || ''
    
    if (message.includes('уже существует') || message.includes('already exists')) {
      return 'Ключ уже существует. Обновите страницу.'
    } else if (message.includes('network') || message.includes('fetch')) {
      return 'Ошибка сети при подключении к VPN панели. Проверьте настройки.'
    } else if (message.includes('404') || message.includes('Not Found')) {
      return 'Не удалось подключиться к панели VPN. Проверьте настройки XUI_HOST и прокси в vite.config.js'
    } else if (message.includes('не найден') || message.includes('not found')) {
      return `Ошибка: ${message}. Проверьте правильность VITE_XUI_INBOUND_ID.`
    } else if (error.response?.status === 404) {
      return 'Панель VPN недоступна (404). Проверьте настройки XUI_HOST и прокси.'
    }
    
    return message || 'Произошла ошибка. Попробуйте еще раз.'
  },

  /**
   * Синхронизация данных пользователя с n8n
   * Запрашивает актуальное состояние профиля через webhook и обновляет локальную базу данных,
   * если данные отличаются от текущих
   * 
   * @param {Object} user - Текущие данные пользователя из Firestore
   * @returns {Promise<Object>} Результат синхронизации с информацией об обновленных полях
   */
  async sync_with_n8n(user) {
    if (!db || !user || !user.id) {
      throw new Error('База данных недоступна или не указан ID пользователя')
    }

    try {
      logger.info('Dashboard', 'Начало синхронизации с n8n', { 
        userId: user.id,
        email: user.email 
      })

      // Запрашиваем актуальное состояние профиля через webhook
      const xuiService = XUIService.getInstance()
      
      // Формируем категоризированные данные для n8n с маркировкой операции синхронизации
      const syncData = {
        // Маркировка операции для разделения потоков в n8n
        operation: 'sync_user',
        category: 'get_user_data',
        timestamp: new Date().toISOString(),
        
        // Базовые данные
        userId: user.id,
        userUuid: user.uuid,
        userName: user.name || user.email?.split('@')[0] || 'User',
        userEmail: user.email,
        uuid: user.uuid,
      }
      
      // Вызываем webhook для получения данных пользователя из n8n
      const response = await xuiService.api.post('/sync-user', syncData)

      const n8nData = response.data

      if (!n8nData || !n8nData.success) {
        logger.warn('Dashboard', 'n8n не вернул данные пользователя', {
          userId: user.id,
          response: n8nData
        })
        return {
          success: false,
          updated: false,
          message: 'n8n не вернул данные пользователя',
          changes: []
        }
      }

      // Извлекаем актуальные данные из ответа n8n
      const remoteUserData = n8nData.user || n8nData.data || {}

      // Сравниваем данные и определяем, что нужно обновить
      const changes = []
      const updateData = {}

      // Список полей для сравнения (исключаем служебные поля)
      const fieldsToCompare = [
        'name', 'email', 'phone', 'uuid', 'vpnUuid',
        'plan', 'expiresAt', 'tariffId', 'tariffName',
        'devices', 'natrockPort', 'periodMonths',
        'paymentStatus', 'testPeriodStartDate', 'testPeriodEndDate',
        'discount', 'vpnLink', 'status'
      ]

      // Сравниваем каждое поле
      for (const field of fieldsToCompare) {
        const localValue = user[field]
        const remoteValue = remoteUserData[field]

        // Нормализуем значения для сравнения
        const normalizeValue = (value) => {
          if (value === null || value === undefined) return null
          if (typeof value === 'string') return value.trim()
          if (typeof value === 'number') return value
          if (value instanceof Date) return value.toISOString()
          return value
        }

        const normalizedLocal = normalizeValue(localValue)
        const normalizedRemote = normalizeValue(remoteValue)

        // Если значения отличаются, добавляем в список изменений
        if (normalizedLocal !== normalizedRemote) {
          // Если удаленное значение не пустое или локальное значение пустое, обновляем
          if (normalizedRemote !== null && normalizedRemote !== undefined && normalizedRemote !== '') {
            changes.push({
              field,
              oldValue: normalizedLocal,
              newValue: normalizedRemote
            })
            updateData[field] = normalizedRemote
          } else if (normalizedLocal === null || normalizedLocal === undefined || normalizedLocal === '') {
            // Если локальное значение пустое, а удаленное есть - обновляем
            changes.push({
              field,
              oldValue: normalizedLocal,
              newValue: normalizedRemote
            })
            updateData[field] = normalizedRemote
          }
        }
      }

      // Если есть изменения, обновляем Firestore
      if (changes.length > 0) {
        const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
        
        // Добавляем метаданные обновления
        updateData.updatedAt = new Date().toISOString()
        updateData.syncedWithN8nAt = new Date().toISOString()
        updateData.lastSyncChanges = changes.map(c => c.field)

        await updateDoc(userDoc, updateData)

        logger.info('Dashboard', 'Данные пользователя синхронизированы с n8n', {
          userId: user.id,
          email: user.email,
          changesCount: changes.length,
          changedFields: changes.map(c => c.field)
        })

        return {
          success: true,
          updated: true,
          message: `Синхронизировано: обновлено ${changes.length} полей`,
          changes: changes,
          updatedFields: changes.map(c => c.field),
          syncedAt: updateData.syncedWithN8nAt
        }
      } else {
        logger.info('Dashboard', 'Данные пользователя актуальны, обновление не требуется', {
          userId: user.id,
          email: user.email
        })

        // Обновляем только метаданные синхронизации (без изменений данных)
        const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
        await updateDoc(userDoc, {
          syncedWithN8nAt: new Date().toISOString(),
          lastSyncChanges: []
        })

        return {
          success: true,
          updated: false,
          message: 'Данные актуальны, обновление не требуется',
          changes: [],
          syncedAt: new Date().toISOString()
        }
      }
    } catch (err) {
      logger.error('Dashboard', 'Ошибка синхронизации с n8n', {
        userId: user.id,
        email: user.email
      }, err)

      // Проверяем, является ли это ошибкой недоступности n8n
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED') || err.message?.includes('connect')) {
        throw new Error(
          `n8n недоступен. Убедитесь, что n8n запущен и webhook настроен.\n\n` +
          `Детали ошибки: ${err.message}`
        )
      }

      throw new Error(
        `Ошибка синхронизации с n8n: ${err.message || 'Неизвестная ошибка'}`
      )
    }
  },

  /**
   * Синхронизация данных пользователя с 3x-ui
   * Получает остаток трафика, статус подключения, последнее время в сети из 3x-ui
   * Обновляет дату окончания в 3x-ui из базы данных (приоритет базы)
   * Сохраняет все данные в Firestore
   * 
   * @param {Object} user - Данные пользователя из Firestore
   * @returns {Promise<Object>} Результат синхронизации с обновленными данными
   */
  async syncUserWith3xUI(user) {
    if (!db || !user || !user.id || !user.uuid) {
      throw new Error('База данных недоступна, не указан ID пользователя или UUID')
    }

    try {
      logger.info('Dashboard', 'Начало синхронизации пользователя с 3x-ui', {
        userId: user.id,
        email: user.email,
        uuid: user.uuid
      })

      const xuiService = XUIService.getInstance()

      // Получаем статистику клиента из 3x-ui
      const statsData = {
        operation: 'get_client_stats',
        category: 'sync_user',
        timestamp: new Date().toISOString(),
        userId: user.id,
        userEmail: user.email,
        email: user.email || user.name,
        uuid: user.uuid,
        clientId: user.uuid,
      }

      // Загружаем webhook URL из Firestore и передаем в запрос
      const webhookUrl = await loadWebhookUrl()
      if (webhookUrl) {
        statsData.webhookUrl = webhookUrl
      }

      // Получаем статистику из 3x-ui
      const statsResponse = await xuiService.getClientStats(statsData)
      const stats = statsResponse.stats || statsResponse.data || statsResponse

      logger.info('Dashboard', 'Статистика получена из 3x-ui', {
        userId: user.id,
        email: user.email,
        hasStats: !!stats,
        statsKeys: stats ? Object.keys(stats) : []
      })

      // Обновляем данные пользователя
      const updateData = {
        updatedAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
      }

      // 1. Остаток трафика (из 3x-ui → база, конвертация байты → GB)
      if (stats.total !== undefined && stats.up !== undefined && stats.down !== undefined) {
        const totalBytes = stats.total || 0 // Общий лимит в байтах
        const usedBytes = (stats.up || 0) + (stats.down || 0) // Использовано в байтах
        const remainingBytes = Math.max(0, totalBytes - usedBytes) // Остаток в байтах
        
        // Конвертируем в GB: байты / (1024^3)
        const remainingGB = remainingBytes / (1024 * 1024 * 1024)
        const usedGB = usedBytes / (1024 * 1024 * 1024)
        const totalGB = totalBytes / (1024 * 1024 * 1024)

        updateData.trafficRemainingBytes = remainingBytes
        updateData.trafficRemainingGB = remainingGB
        updateData.trafficUsedBytes = usedBytes
        updateData.trafficUsedGB = usedGB
        updateData.trafficTotalBytes = totalBytes
        updateData.trafficTotalGB = totalGB

        logger.info('Dashboard', 'Трафик обработан и конвертирован', {
          userId: user.id,
          totalBytes,
          usedBytes,
          remainingBytes,
          totalGB: totalGB.toFixed(2),
          usedGB: usedGB.toFixed(2),
          remainingGB: remainingGB.toFixed(2)
        })
      }

      // 2. Статус подключения и последнее время в сети
      if (stats.lastSeen !== undefined) {
        const lastSeenTimestamp = stats.lastSeen
        const now = Date.now()
        const timeSinceLastSeen = now - lastSeenTimestamp
        
        // Считаем, что пользователь в сети, если последний раз был менее 5 минут назад
        const ONLINE_THRESHOLD = 5 * 60 * 1000 // 5 минут в миллисекундах
        const isOnline = timeSinceLastSeen < ONLINE_THRESHOLD
        
        updateData.lastSeenTimestamp = lastSeenTimestamp
        updateData.lastSeenDate = new Date(lastSeenTimestamp).toISOString()
        updateData.isOnline = isOnline
        updateData.timeSinceLastSeen = timeSinceLastSeen

        logger.info('Dashboard', 'Статус подключения определен', {
          userId: user.id,
          lastSeenTimestamp,
          lastSeenDate: updateData.lastSeenDate,
          isOnline,
          timeSinceLastSeenMinutes: Math.floor(timeSinceLastSeen / (60 * 1000))
        })
      }

      // 3. Обновление даты окончания в 3x-ui из базы данных (приоритет базы)
      // ВАЖНО: Обновление expiryTime в 3x-ui требует отдельного workflow в n8n
      // Пока только логируем намерение обновить
      if (user.expiresAt) {
        logger.info('Dashboard', 'Дата окончания из базы данных (приоритет)', {
          userId: user.id,
          expiresAt: user.expiresAt,
          expiresAtTimestamp: new Date(user.expiresAt).getTime(),
          expiresAtSeconds: Math.floor(new Date(user.expiresAt).getTime() / 1000)
        })
        // TODO: Реализовать обновление expiryTime в 3x-ui через n8n workflow
        // Для этого нужно добавить endpoint update-client в backend proxy
      }

      // Сохраняем обновленные данные в Firestore
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
      await updateDoc(userDoc, updateData)

      logger.info('Dashboard', 'Данные пользователя синхронизированы с 3x-ui', {
        userId: user.id,
        email: user.email,
        updatedFields: Object.keys(updateData)
      })

      return {
        success: true,
        updated: true,
        message: 'Данные успешно синхронизированы с 3x-ui',
        data: updateData,
        syncedAt: updateData.lastSyncedAt
      }
    } catch (error) {
      logger.error('Dashboard', 'Ошибка синхронизации с 3x-ui', {
        userId: user.id,
        email: user.email
      }, error)

      throw new Error(
        `Ошибка синхронизации с 3x-ui: ${error.message || 'Неизвестная ошибка'}`
      )
    }
  },

  /**
   * Удаление/отмена подписки
   * @param {Object} user - Данные пользователя
   * @returns {Promise<Object>} Результат удаления
   */
  async deleteSubscription(user) {
    console.log('🗑️ dashboardService.deleteSubscription: Начало удаления подписки', {
      userId: user?.id,
      userEmail: user?.email,
      userUuid: user?.uuid,
      hasDb: !!db
    })

    if (!db || !user) {
      const missing = []
      if (!db) missing.push('db')
      if (!user) missing.push('user')
      console.error('❌ dashboardService.deleteSubscription: Отсутствуют данные:', missing)
      throw new Error(`Недостаточно данных для удаления подписки. Отсутствуют: ${missing.join(', ')}`)
    }

    if (!user.uuid) {
      throw new Error('У пользователя нет активной подписки для удаления')
    }

    try {
      const xuiService = XUIService.getInstance()
      const defaultInboundId = import.meta.env.VITE_XUI_INBOUND_ID || '1'

      // Получаем данные сервера
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      const settingsSnapshot = await getDoc(settingsDoc)
      const settingsData = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
      const serversList = settingsData.servers || []

      // Находим сервер, привязанный к тарифу пользователя (если есть tariffId)
      let activeServer = null
      
      if (user.tariffId) {
        // Ищем сервер, привязанный к данному тарифу
        const serversForTariff = serversList.filter(server => {
          // Если у сервера есть привязка к тарифам, проверяем, есть ли наш тариф
          if (server.tariffIds && server.tariffIds.length > 0) {
            return server.tariffIds.includes(user.tariffId)
          }
          // Если привязки нет - сервер подходит для всех тарифов
          return true
        })
        
        // Ищем активный сервер среди серверов для этого тарифа
        activeServer = serversForTariff.find(s => s.active && s.id)
        
        if (activeServer) {
          logger.info('Dashboard', 'Найден сервер для тарифа пользователя', {
            tariffId: user.tariffId,
            serverId: activeServer.id,
            serverName: activeServer.name,
            tariffIds: activeServer.tariffIds,
            inboundId: activeServer.xuiInboundId
          })
        } else {
          logger.warn('Dashboard', 'Не найден активный сервер для тарифа, используем первый активный', {
            tariffId: user.tariffId,
            availableServersForTariff: serversForTariff.length
          })
        }
      }
      
      // Если не нашли сервер для тарифа, используем первый активный сервер (fallback)
      if (!activeServer) {
        activeServer = serversList.find(s => s.active && s.id)
      }
      
      if (!activeServer) {
        throw new Error('Не найден активный сервер для удаления клиента')
      }

      // Используем inboundId из найденного сервера, а не из переменной окружения
      const inboundId = activeServer.xuiInboundId || defaultInboundId
      
      logger.info('Dashboard', 'Удаление клиента из 3x-ui', {
        email: user.email,
        uuid: user.uuid,
        tariffId: user.tariffId || null,
        tariffName: user.tariffName || null,
        serverId: activeServer.id,
        serverName: activeServer.name,
        inboundId,
        serverId: activeServer.id,
        serverName: activeServer.name,
        serverIP: activeServer.serverIP,
        serverPort: activeServer.serverPort,
        randompath: activeServer.randompath || '',
        protocol: activeServer.protocol || 'https',
        serverTariffIds: activeServer.tariffIds || []
      })

      // Удаляем клиента из 3x-ui через Backend Proxy
      const deleteData = {
        operation: 'delete_client',
        category: 'subscription_cancellation',
        timestamp: new Date().toISOString(),
        userId: user.id,
        email: user.email || user.name,
        inboundId: inboundId,
        clientId: user.uuid,
        serverId: activeServer.id,
        sessionCookie: activeServer.sessionCookie || null,
        serverIP: activeServer.serverIP,
        serverPort: activeServer.serverPort,
        randompath: activeServer.randompath || '',
        protocol: activeServer.protocol || 'https',
        xuiUsername: activeServer.xuiUsername,
        xuiPassword: activeServer.xuiPassword,
      }

      let deletionWarning = null
      try {
        // Загружаем webhook URL из Firestore и передаем в запрос
        const webhookUrl = await loadWebhookUrl()
        if (webhookUrl) {
          deleteData.webhookUrl = webhookUrl
        }
        
        await xuiService.deleteClient(deleteData)
        logger.info('Dashboard', 'Клиент успешно удален из 3x-ui', {
          email: user.email,
          uuid: user.uuid
        })
      } catch (deleteError) {
        // Логируем ошибку для диагностики
        logger.warn('Dashboard', 'Не удалось удалить клиента из 3x-ui', {
          email: user.email,
          uuid: user.uuid,
          errorMessage: deleteError.message,
          errorType: deleteError.constructor.name
        })
        
        // Если ошибка связана с настройкой n8n workflow, продолжаем удаление данных,
        // но предупреждаем пользователя
        const errorMessage = deleteError.message || ''
        if (errorMessage.includes('Unused Respond to Webhook') || 
            errorMessage.includes('Respond to Webhook') ||
            errorMessage.includes('workflow') ||
            errorMessage.includes('n8n')) {
          logger.warn('Dashboard', 'Ошибка связана с настройкой n8n workflow - продолжаем удаление данных', {
            email: user.email,
            uuid: user.uuid
          })
          deletionWarning = 'Подписка отменена, но удаление из VPN сервера не выполнено из-за ошибки настройки n8n workflow. Обратитесь к администратору для ручного удаления клиента из VPN сервера.'
        } else {
          // Для других ошибок тоже продолжаем, но логируем
          deletionWarning = 'Подписка отменена, но могут возникнуть проблемы с удалением из VPN сервера. Обратитесь к администратору при необходимости.'
        }
        // Продолжаем выполнение - очищаем данные подписки в Firestore
      }

      // Очищаем данные подписки в Firestore (даже если удаление из 3x-ui не удалось)
      // ВАЖНО: subId НЕ удаляется, так как он постоянный идентификатор пользователя
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
      await updateDoc(userDoc, {
        uuid: null,
        plan: null,
        expiresAt: null,
        tariffName: null,
        tariffId: null,
        devices: null,
        natrockPort: null,
        periodMonths: null,
        paymentStatus: null,
        testPeriodStartDate: null,
        testPeriodEndDate: null,
        unpaidStartDate: null, // Очищаем дату начала неоплаты
        discount: null,
        vpnLink: null,
        // subId сохраняется - это постоянный идентификатор пользователя
        updatedAt: new Date().toISOString(),
      })

      logger.info('Dashboard', 'Данные подписки очищены в Firestore', {
        userId: user.id,
        hasWarning: !!deletionWarning
      })

      return {
        success: true,
        message: deletionWarning ? 'Подписка отменена, но требуется ручное удаление из VPN сервера' : 'Подписка успешно отменена',
        warning: deletionWarning || null
      }
    } catch (error) {
      logger.error('Dashboard', 'Ошибка удаления подписки', {
        userId: user.id,
        email: user.email
      }, error)

      // Проверяем, является ли это ошибкой недоступности backend proxy
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
        throw new Error(
          `Backend Proxy недоступен (порт 3001). ` +
          `Убедитесь, что backend proxy сервер запущен на http://localhost:3001\n\n` +
          `Детали ошибки: ${error.message}`
        )
      }

      // Для ошибок n8n workflow все равно пытаемся очистить данные подписки
      if (error.message?.includes('Unused Respond to Webhook') || error.message?.includes('workflow')) {
        logger.warn('Dashboard', 'Ошибка n8n workflow, но очищаем данные подписки в Firestore', {
          userId: user.id
        })

        try {
          // Очищаем данные подписки в Firestore, даже если удаление из 3x-ui не удалось
          // ВАЖНО: subId НЕ удаляется, так как он постоянный идентификатор пользователя
          const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
          await updateDoc(userDoc, {
            uuid: null,
            plan: null,
            expiresAt: null,
            tariffName: null,
            tariffId: null,
            devices: null,
            natrockPort: null,
            periodMonths: null,
            paymentStatus: null,
            testPeriodStartDate: null,
            testPeriodEndDate: null,
            unpaidStartDate: null, // Очищаем дату начала неоплаты
            discount: null,
            vpnLink: null,
            // subId сохраняется - это постоянный идентификатор пользователя
            updatedAt: new Date().toISOString(),
          })

          logger.info('Dashboard', 'Данные подписки очищены в Firestore (несмотря на ошибку n8n)', {
            userId: user.id
          })

          // Возвращаем успех, но с предупреждением
          return {
            success: true,
            message: 'Подписка отменена на уровне приложения',
            warning: 'Ошибка настройки workflow в n8n. Клиент может остаться в VPN сервере. Обратитесь к администратору для ручного удаления.'
          }
        } catch (firestoreError) {
          logger.error('Dashboard', 'Не удалось очистить данные подписки в Firestore', {
            userId: user.id
          }, firestoreError)
          throw new Error(
            'Не удалось отменить подписку. Ошибка n8n workflow и ошибка Firestore. Обратитесь к администратору.\n\n' +
            'Детали: ' + error.message
          )
        }
      }
      
      throw error
    }
  },

  /**
   * Смена тарифа (Super ↔ Multi): удаление клиента со старого сервера, создание на новом, скидка при понижении в первой половине периода.
   * @param {Object} user - Текущий пользователь (с активной подпиской)
   * @param {Object} newTariff - Новый тариф (super или multi)
   * @returns {Promise<Object>} { success, subscriptionLink, nextPaymentDiscountAmount?, message }
   */
  async changePlanTariff(user, newTariff) {
    if (!db || !user || !newTariff) {
      throw new Error('Недостаточно данных для смены тарифа')
    }
    const now = Date.now()
    if (!user.expiresAt || user.expiresAt <= now) {
      throw new Error('У вас нет активной подписки для смены тарифа')
    }
    if (!user.uuid || !user.tariffId) {
      throw new Error('Невозможно определить текущий тариф')
    }

    const xuiService = XUIService.getInstance()
    const defaultInboundId = import.meta.env.VITE_XUI_INBOUND_ID || '1'

    // Загружаем старый тариф
    const oldTariffRef = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, user.tariffId)
    const oldTariffSnap = await getDoc(oldTariffRef)
    if (!oldTariffSnap.exists()) {
      throw new Error('Текущий тариф не найден')
    }
    const oldTariff = { id: oldTariffSnap.id, ...oldTariffSnap.data() }

    const oldPlan = (oldTariff.plan || oldTariff.name || '').toLowerCase()
    const newPlan = (newTariff.plan || newTariff.name || '').toLowerCase()
    const allowed = ['super', 'multi']
    if (!allowed.includes(newPlan) || !allowed.includes(oldPlan)) {
      throw new Error('Смена тарифа возможна только между Super и MULTI')
    }
    if (oldPlan === newPlan) {
      throw new Error('Вы уже на этом тарифе')
    }

    // Цены за месяц: Super — за устройство, MULTI — фикс
    const oldPricePerMonth = oldPlan === 'super'
      ? (oldTariff.price || 150) * (user.devices || 1)
      : (oldTariff.price || 250)
    const newPricePerMonth = newPlan === 'super'
      ? (newTariff.price || 150) * (newTariff.devices || 1)
      : (newTariff.price || 250)
    const priceDiff = oldPricePerMonth - newPricePerMonth

    // Скидка на следующую оплату только при понижении и только в первой половине периода
    const periodMonths = user.periodMonths || 1
    const periodMs = periodMonths * 30 * 24 * 60 * 60 * 1000
    const periodStart = user.expiresAt - periodMs
    const periodMid = periodStart + (user.expiresAt - periodStart) / 2
    const isFirstHalfOfPeriod = now < periodMid
    const nextPaymentDiscountAmount = (priceDiff > 0 && isFirstHalfOfPeriod) ? Math.round(priceDiff) : 0

    const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
    const settingsSnapshot = await getDoc(settingsDoc)
    const settingsData = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
    const serversList = settingsData.servers || []

    // ——— 1. Удалить клиента со старого сервера ———
    let oldServer = null
    if (user.tariffId) {
      const forOld = serversList.filter(s => {
        if (s.tariffIds && s.tariffIds.length > 0) return s.tariffIds.includes(user.tariffId)
        return true
      })
      oldServer = forOld.find(s => s.active && s.id)
    }
    if (!oldServer) oldServer = serversList.find(s => s.active && s.id)
    if (!oldServer) {
      throw new Error('Не найден сервер текущего тарифа для удаления клиента')
    }

    const oldInboundId = oldServer.xuiInboundId || defaultInboundId
    const deleteData = {
      operation: 'delete_client',
      category: 'change_plan',
      timestamp: new Date().toISOString(),
      userId: user.id,
      email: user.email || user.name,
      inboundId: oldInboundId,
      clientId: user.uuid,
      serverId: oldServer.id,
      sessionCookie: oldServer.sessionCookie || null,
      serverIP: oldServer.serverIP,
      serverPort: oldServer.serverPort,
      randompath: oldServer.randompath || '',
      protocol: oldServer.protocol || 'https',
      xuiUsername: oldServer.xuiUsername,
      xuiPassword: oldServer.xuiPassword,
    }
    const webhookUrl = await loadWebhookUrl()
    if (webhookUrl) deleteData.webhookUrl = webhookUrl

    try {
      await xuiService.deleteClient(deleteData)
      logger.info('Dashboard', 'Клиент удален со старого сервера при смене тарифа', { email: user.email, oldTariff: oldTariff.name })
    } catch (err) {
      logger.warn('Dashboard', 'Ошибка удаления со старого сервера при смене тарифа', { email: user.email }, err)
      throw new Error('Не удалось отвязать подписку от старого сервера. Попробуйте позже или обратитесь в поддержку.')
    }

    // ——— 2. Найти сервер для нового тарифа ———
    let serversToCheck = serversList.filter(s => {
      if (s.tariffIds && s.tariffIds.length > 0) return s.tariffIds.includes(newTariff.id)
      return true
    })
    if (serversToCheck.length === 0) serversToCheck = serversList

    let newServer = null
    for (const s of serversToCheck) {
      if (s.sessionCookie && s.sessionCookieReceivedAt) {
        const age = Date.now() - new Date(s.sessionCookieReceivedAt).getTime()
        if (age < 60 * 60 * 1000) { newServer = s; break }
      }
    }
    if (!newServer) {
      for (const s of serversToCheck) {
        if (s.active !== false && s.xuiUsername && s.xuiPassword && s.serverIP && s.serverPort) {
          newServer = s
          break
        }
      }
    }
    if (!newServer || !newServer.serverIP || !newServer.serverPort) {
      throw new Error('Не найден активный сервер для нового тарифа')
    }

    const newInboundId = newServer.xuiInboundId || defaultInboundId || '1'
    const finalDevices = newTariff.devices || (newPlan === 'super' ? 1 : 5)
    const totalGB = newTariff.trafficGB > 0 ? newTariff.trafficGB * 1024 * 1024 * 1024 : 0

    // Новый UUID для нового инбаунда
    const newClientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })

    const addClientData = {
      operation: 'add_client',
      category: 'change_plan',
      timestamp: new Date().toISOString(),
      userId: user.id,
      userUuid: newClientId,
      userName: user.name || user.email?.split('@')[0] || 'User',
      userEmail: user.email,
      email: user.name || user.email,
      inboundId: parseInt(newInboundId),
      totalGB,
      expiryTime: user.expiresAt,
      limitIp: finalDevices,
      clientId: newClientId,
      subId: user.subId || '',
      tgId: user.tgId || '',
      serverId: newServer.id,
      sessionCookie: newServer.sessionCookie || null,
      serverIP: newServer.serverIP,
      serverPort: newServer.serverPort,
      randompath: newServer.randompath || '',
      protocol: newServer.protocol || (newServer.serverPort === 443 || newServer.serverPort === 40919 ? 'https' : 'http'),
      subscriptionDetails: {
        tariffName: newTariff.name || newTariff.plan || 'Unknown',
        devices: finalDevices,
        period: {
          months: user.periodMonths || 1,
          expiryDate3xui: user.expiresAt,
          expiryDateIso: user.expiresAt ? new Date(user.expiresAt).toISOString() : null,
          expiryDateUnix: user.expiresAt ? Math.floor(user.expiresAt / 1000) : 0,
        },
        userName: user.name || user.email?.split('@')[0] || 'User',
        profileUuid: newClientId,
      },
    }
    if (newServer.xuiUsername && newServer.xuiPassword && !addClientData.sessionCookie) {
      addClientData.xuiUsername = newServer.xuiUsername
      addClientData.xuiPassword = newServer.xuiPassword
    }
    if (webhookUrl) addClientData.webhookUrl = webhookUrl

    const addResult = await xuiService.addClient(addClientData)
    const finalUuid = addResult?.vpnUuid || newClientId

    let subscriptionLink
    if (newTariff.subscriptionLink && newTariff.subscriptionLink.trim()) {
      const base = newTariff.subscriptionLink.trim().replace(/\/$/, '')
      subscriptionLink = `${base}/${user.subId || ''}`
    } else {
      subscriptionLink = `https://subs.skypath.fun:3458/vk198/${user.subId || ''}`
    }

    const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, user.id)
    const updateData = {
      uuid: finalUuid,
      plan: newTariff.plan || newPlan,
      tariffName: newTariff.name,
      tariffId: newTariff.id,
      devices: finalDevices,
      vpnLink: subscriptionLink,
      subscriptionLink,
      updatedAt: new Date().toISOString(),
    }
    if (nextPaymentDiscountAmount > 0) {
      updateData.nextPaymentDiscountAmount = nextPaymentDiscountAmount
    }
    await updateDoc(userDoc, updateData)

    logger.info('Dashboard', 'Тариф успешно изменен', {
      userId: user.id,
      oldPlan,
      newPlan,
      nextPaymentDiscountAmount: nextPaymentDiscountAmount || undefined,
    })

    return {
      success: true,
      subscriptionLink,
      nextPaymentDiscountAmount: nextPaymentDiscountAmount > 0 ? nextPaymentDiscountAmount : undefined,
      message: nextPaymentDiscountAmount > 0
        ? `Тариф изменен на ${newTariff.name}. На следующую оплату применена скидка ${nextPaymentDiscountAmount} ₽.`
        : `Тариф изменен на ${newTariff.name}.`,
    }
  },
}

