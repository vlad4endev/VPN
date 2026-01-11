/**
 * Минимальный Webhook Proxy для n8n
 * 
 * Этот сервер только принимает запросы от фронтенда и перенаправляет их в n8n webhooks.
 * Вся логика взаимодействия с 3x-ui вынесена в n8n workflows.
 * 
 * Использование:
 *   npm install express cors helmet dotenv axios
 *   node server/n8n-webhook-proxy.js
 */

import express from 'express'
import axios from 'axios'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import os from 'os'

dotenv.config()

// Firebase Admin SDK для доступа к Firestore
let admin = null
let db = null

// Инициализация Firebase Admin SDK (асинхронная)
async function initFirebaseAdmin() {
  try {
    const firebaseAdmin = await import('firebase-admin')
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID
    
    if (!projectId) {
      console.log('⚠️ Firebase Admin SDK не настроен (FIREBASE_PROJECT_ID не указан)')
      return
    }

    // Проверяем, не инициализирован ли уже
    if (firebaseAdmin.apps.length > 0) {
      admin = firebaseAdmin
      db = admin.firestore()
      console.log('✅ Firebase Admin SDK уже инициализирован')
      return
    }

    // Инициализируем с Application Default Credentials или переменными окружения
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : null

    if (serviceAccount) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
        projectId,
      })
    } else {
      // Используем Application Default Credentials (для production)
      firebaseAdmin.initializeApp({
        projectId,
      })
    }

    admin = firebaseAdmin
    db = admin.firestore()
    console.log('✅ Firebase Admin SDK инициализирован')
  } catch (err) {
    console.log('⚠️ Firebase Admin SDK недоступен:', err.message)
    console.log('⚠️ Настройки платежей будут загружаться только из запросов фронтенда')
  }
}

// Инициализируем Firebase Admin SDK при старте
initFirebaseAdmin()

const app = express()

// ========== Безопасность ==========

app.use(helmet({
  contentSecurityPolicy: false, // Упрощаем для разработки
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}))

// CORS - разрешаем все в development
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}))

// Парсинг JSON
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ========== Конфигурация n8n ==========

const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://n8n.skypath.fun'
const N8N_API_KEY = process.env.N8N_API_KEY || ''

// Базовый webhook ID (можно переопределить через переменные окружения)
const DEFAULT_WEBHOOK_ID = process.env.N8N_WEBHOOK_ID || '8a8b74ff-eedf-4ad2-9783-a5123ac073ed'
const TEST_WEBHOOK_ID = process.env.N8N_WEBHOOK_TEST_ID || '8a8b74ff-eedf-4ad2-9783-a5123ac073ed'

// Webhook URLs для различных операций
// По умолчанию используем один webhook для всех операций, но можно переопределить через переменные окружения
// ВАЖНО: Приоритет использования webhook URL:
// 1. Из запроса (заголовок X-N8N-Webhook-Url или поле webhookUrl в теле запроса) - из Firestore настроек
// 2. Из переменных окружения (N8N_WEBHOOK_*)
// 3. Дефолтные значения
const getDefaultWebhooks = () => ({
  addClient: process.env.N8N_WEBHOOK_ADD_CLIENT || `${N8N_BASE_URL}/webhook/${DEFAULT_WEBHOOK_ID}`,
  deleteClient: process.env.N8N_WEBHOOK_DELETE_CLIENT || `${N8N_BASE_URL}/webhook/${DEFAULT_WEBHOOK_ID}`,
  getClientStats: process.env.N8N_WEBHOOK_GET_STATS || `${N8N_BASE_URL}/webhook/${DEFAULT_WEBHOOK_ID}`,
  getInbounds: process.env.N8N_WEBHOOK_GET_INBOUNDS || `${N8N_BASE_URL}/webhook/${DEFAULT_WEBHOOK_ID}`,
  getInbound: process.env.N8N_WEBHOOK_GET_INBOUND || `${N8N_BASE_URL}/webhook/${DEFAULT_WEBHOOK_ID}`,
  syncUser: process.env.N8N_WEBHOOK_SYNC_USER || `${N8N_BASE_URL}/webhook/${DEFAULT_WEBHOOK_ID}`,
  health: process.env.N8N_WEBHOOK_HEALTH || `${N8N_BASE_URL}/webhook/${TEST_WEBHOOK_ID}`,
})

const N8N_WEBHOOKS = getDefaultWebhooks()

/**
 * Получение webhook URL для операции
 * Приоритет: из запроса (заголовок или тело) > переменные окружения > дефолтные
 */
function getWebhookUrl(operation, req) {
  // 1. Проверяем заголовок X-N8N-Webhook-Url (передается из Firestore настроек)
  const headerWebhook = req.headers['x-n8n-webhook-url'] || req.headers['X-N8N-Webhook-Url']
  if (headerWebhook && headerWebhook.trim()) {
    console.log(`📌 Используется webhook URL из заголовка (Firestore): ${headerWebhook}`)
    return headerWebhook.trim()
  }

  // 2. Проверяем поле webhookUrl в теле запроса (если есть)
  const bodyWebhook = req.body?.webhookUrl
  if (bodyWebhook && bodyWebhook.trim()) {
    console.log(`📌 Используется webhook URL из тела запроса (Firestore): ${bodyWebhook}`)
    return bodyWebhook.trim()
  }

  // 3. Используем значение из переменных окружения или дефолтное
  const defaultUrl = N8N_WEBHOOKS[operation] || N8N_WEBHOOKS.addClient
  return defaultUrl
}

// ========== Утилиты ==========

/**
 * Вызов n8n webhook
 */
async function callN8NWebhook(webhookUrl, data, method = 'POST') {
  try {
    const config = {
      method,
      url: webhookUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 60000,
    }

    if (N8N_API_KEY) {
      config.headers['X-N8N-API-KEY'] = N8N_API_KEY
    }

    if (method === 'POST' && data) {
      config.data = data
    } else if (method === 'GET' && data) {
      config.params = data
    }

    console.log(`📤 Calling n8n: ${webhookUrl}`)
    const response = await axios(config)
    console.log(`✅ n8n response: ${response.status}`)
    
    return response.data
  } catch (error) {
    console.error(`❌ n8n error:`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: webhookUrl
    })
    
    // Улучшенная обработка ошибок от n8n
    let errorMessage = error.message || 'Ошибка вызова n8n webhook'
    
    // Извлекаем детальную информацию об ошибке из ответа n8n
    const errorData = error.response?.data
    const n8nDetails = errorData?.n8nDetails || {}
    
    if (error.response?.status === 404 || error.response?.status === 500 || error.response?.status === 400) {
      // Проверяем различные типы ошибок n8n
      if (errorData?.errorMessage) {
        const n8nError = errorData.errorMessage
        
        // Специальная обработка для ошибки "Unused Respond to Webhook"
        if (n8nError.includes('Unused Respond to Webhook')) {
          errorMessage = `Ошибка конфигурации n8n workflow:\n\n` +
            `❌ Обнаружен неиспользуемый узел "Respond to Webhook" в workflow.\n\n` +
            `🔧 Решение:\n` +
            `1. Откройте ваш workflow в n8n\n` +
            `2. Найдите узел "Respond to Webhook"\n` +
            `3. Убедитесь, что он правильно подключен к основному потоку\n` +
            `4. Если узел не нужен - удалите его\n` +
            `5. Если нужен - подключите его после всех узлов обработки данных\n` +
            `6. Сохраните и активируйте workflow\n\n` +
            `💡 Совет: В n8n workflow должен быть только ОДИН узел "Respond to Webhook", ` +
            `и он должен быть в конце потока обработки.`
        } else if (n8nError.includes('not registered') || n8nError.includes('not found')) {
          errorMessage = n8nError + '\n\n' +
            `🔧 Решение:\n` +
            `1. Проверьте, что workflow активирован в n8n\n` +
            `2. Проверьте правильность webhook URL: ${webhookUrl}\n` +
            `3. Убедитесь, что webhook ID совпадает с ID в настройках workflow`
        } else {
          // Общая ошибка с деталями
          errorMessage = `Ошибка n8n: ${n8nError}`
          
          // Добавляем детали, если они есть
          if (errorData?.errorDetails && Object.keys(errorData.errorDetails).length > 0) {
            errorMessage += `\n\nДетали: ${JSON.stringify(errorData.errorDetails, null, 2)}`
          }
        }
      } else if (errorData?.error) {
        errorMessage = errorData.error
      } else if (errorData?.message) {
        errorMessage = errorData.message
      } else {
        errorMessage = `Ошибка от n8n (${error.response.status}): ${error.response.statusText || 'Unknown error'}`
      }
    }
    
    throw new Error(errorMessage)
  }
}

// ========== Routes ==========

/**
 * Health Check
 * GET /api/vpn/health
 */
app.get('/api/vpn/health', async (req, res) => {
  try {
    const healthData = await callN8NWebhook(N8N_WEBHOOKS.health, {}, 'GET')
    res.json({
      status: 'ok',
      service: 'n8n-webhook-proxy',
      timestamp: new Date().toISOString(),
      n8n: { available: true, baseUrl: N8N_BASE_URL, ...healthData },
    })
  } catch (error) {
    res.status(503).json({
      status: 'error',
      service: 'n8n-webhook-proxy',
      timestamp: new Date().toISOString(),
      n8n: { available: false, baseUrl: N8N_BASE_URL, error: error.message },
    })
  }
})

/**
 * Добавление клиента
 * POST /api/vpn/add-client
 */
app.post('/api/vpn/add-client', async (req, res) => {
  try {
    console.log('📥 n8n-webhook-proxy: Получен запрос POST /api/vpn/add-client', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      operation: req.body?.operation,
      category: req.body?.category,
      userId: req.body?.userId,
      email: req.body?.email,
      clientId: req.body?.clientId,
      inboundId: req.body?.inboundId
    })
    
    if (!req.body || !req.body.clientId) {
      console.error('❌ n8n-webhook-proxy: Отсутствует clientId в запросе')
      return res.status(400).json({
        success: false,
        error: 'Отсутствует обязательное поле: clientId (UUID пользователя)',
      })
    }
    
    // Получаем webhook URL (приоритет: из запроса > из env > дефолтный)
    const webhookUrl = getWebhookUrl('addClient', req)
    console.log('📤 n8n-webhook-proxy: Отправка запроса в n8n webhook:', webhookUrl)
    const result = await callN8NWebhook(webhookUrl, req.body)
    
    console.log('✅ n8n-webhook-proxy: Получен ответ от n8n:', {
      hasResult: !!result,
      success: result?.success,
      hasVpnUuid: !!result?.vpnUuid,
      resultKeys: result ? Object.keys(result) : []
    })
    
    res.json(result)
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка при обработке запроса add-client:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    })
    
    // Определяем правильный HTTP статус код
    let statusCode = 500
    if (error.response?.status) {
      statusCode = error.response.status
    } else if (error.message.includes('not registered') || error.message.includes('not found')) {
      statusCode = 404
    }
    
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Ошибка создания клиента через n8n',
      details: error.response?.data || null,
      hint: error.message?.includes('not registered') 
        ? 'Проверьте, что workflow активен в n8n и webhook настроен правильно. URL: ' + N8N_WEBHOOKS.addClient
        : null
    })
  }
})

/**
 * Удаление клиента
 * POST /api/vpn/delete-client
 */
app.post('/api/vpn/delete-client', async (req, res) => {
  try {
    console.log('📥 n8n-webhook-proxy: Получен запрос POST /api/vpn/delete-client', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      operation: req.body?.operation,
      category: req.body?.category,
      userId: req.body?.userId,
      email: req.body?.email,
      clientId: req.body?.clientId,
      inboundId: req.body?.inboundId
    })
    
    if (!req.body || !req.body.clientId) {
      console.error('❌ n8n-webhook-proxy: Отсутствует clientId в запросе')
      return res.status(400).json({
        success: false,
        error: 'Отсутствует обязательное поле: clientId (UUID пользователя)',
      })
    }
    
    // Получаем webhook URL (приоритет: из запроса > из env > дефолтный)
    const webhookUrl = getWebhookUrl('deleteClient', req)
    console.log('📤 n8n-webhook-proxy: Отправка запроса в n8n webhook:', webhookUrl)
    const result = await callN8NWebhook(webhookUrl, req.body)
    
    console.log('✅ n8n-webhook-proxy: Получен ответ от n8n:', {
      hasResult: !!result,
      success: result?.success,
      resultKeys: result ? Object.keys(result) : []
    })
    
    res.json(result)
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка при обработке запроса delete-client:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    })
    
    // Определяем правильный HTTP статус код
    let statusCode = 500
    if (error.response?.status) {
      statusCode = error.response.status
    } else if (error.message.includes('not registered') || error.message.includes('not found')) {
      statusCode = 404
    }
    
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Ошибка удаления клиента через n8n',
      details: error.response?.data || null,
      hint: error.message?.includes('Unused Respond to Webhook')
        ? 'Проверьте настройку workflow в n8n: должен быть правильно настроен узел "Respond to Webhook" в цепочке выполнения. URL: ' + N8N_WEBHOOKS.deleteClient
        : error.message?.includes('not registered')
        ? 'Проверьте, что workflow активен в n8n и webhook настроен правильно. URL: ' + N8N_WEBHOOKS.deleteClient
        : null
    })
  }
})

/**
 * Получение статистики клиента
 * POST /api/vpn/client-stats
 */
app.post('/api/vpn/client-stats', async (req, res) => {
  try {
    const webhookUrl = getWebhookUrl('getClientStats', req)
    const result = await callN8NWebhook(webhookUrl, req.body)
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка получения статистики через n8n',
    })
  }
})

/**
 * Получение списка инбаундов
 * GET /api/vpn/inbounds
 */
app.get('/api/vpn/inbounds', async (req, res) => {
  try {
    // Добавляем маркировку операции из query параметров или используем по умолчанию
    const operationData = {
      operation: req.query.operation || 'get_inbounds',
      category: req.query.category || 'get_server_data',
      timestamp: req.query.timestamp || new Date().toISOString(),
      ...req.query,
    }
    const webhookUrl = getWebhookUrl('getInbounds', req)
    const result = await callN8NWebhook(webhookUrl, operationData, 'GET')
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка получения списка инбаундов через n8n',
    })
  }
})

/**
 * Получение инбаунда по ID
 * GET /api/vpn/inbounds/:inboundId
 */
app.get('/api/vpn/inbounds/:inboundId', async (req, res) => {
  try {
    const { inboundId } = req.params
    // Добавляем маркировку операции из query параметров или используем по умолчанию
    const operationData = {
      operation: req.query.operation || 'get_inbound',
      category: req.query.category || 'get_server_data',
      timestamp: req.query.timestamp || new Date().toISOString(),
      inboundId,
      ...req.query,
    }
    const webhookUrl = getWebhookUrl('getInbound', req)
    const result = await callN8NWebhook(webhookUrl, operationData, 'GET')
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка получения инбаунда через n8n',
    })
  }
})

/**
 * Синхронизация данных пользователя с n8n
 * POST /api/vpn/sync-user
 * 
 * Запрашивает актуальное состояние профиля пользователя из n8n
 * и возвращает данные для сравнения с локальной базой
 */
app.post('/api/vpn/sync-user', async (req, res) => {
  try {
    const { userId, email, uuid } = req.body

    if (!userId && !email && !uuid) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать userId, email или uuid',
      })
    }

    const webhookUrl = getWebhookUrl('syncUser', req)
    const result = await callN8NWebhook(webhookUrl, req.body)
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка синхронизации пользователя через n8n',
    })
  }
})

/**
 * Генерация ссылки на оплату через YooMoney
 * POST /api/payment/generate-link
 * 
 * Принимает данные о платеже и отправляет запрос в n8n workflow
 * для генерации ссылки на оплату
 */
app.post('/api/payment/generate-link', async (req, res) => {
  try {
    console.log('📥 n8n-webhook-proxy: Получен запрос POST /api/payment/generate-link', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      userId: req.body?.userId,
      amount: req.body?.amount,
      tariffId: req.body?.tariffId
    })
    
    const { userId, amount, tariffId, paymentSettings } = req.body
    
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать userId и amount (сумма должна быть больше 0)',
      })
    }
    
    // Получаем webhook URL для платежей (приоритет: из запроса > из env > дефолтный)
    const webhookUrl = getWebhookUrl('addClient', req) // Используем существующий механизм
    console.log('📤 n8n-webhook-proxy: Отправка запроса в n8n webhook для генерации ссылки:', webhookUrl)
    
    // Если paymentSettings не переданы из запроса, загружаем из Firestore
    let finalPaymentSettings = paymentSettings
    if (!paymentSettings || Object.keys(paymentSettings).length === 0 || 
        !paymentSettings.yoomoneyWallet || !paymentSettings.yoomoneySecretKey) {
      console.log('⚠️ paymentSettings не переданы или неполные, загружаем из Firestore')
      finalPaymentSettings = await loadPaymentSettings()
      console.log('📥 n8n-webhook-proxy: Настройки платежей загружены из Firestore', {
        hasWallet: !!finalPaymentSettings.yoomoneyWallet,
        hasSecretKey: !!finalPaymentSettings.yoomoneySecretKey
      })
    }
    
    // Формируем данные для n8n workflow, включая настройки платежной системы
    const paymentData = {
      mode: 'generateLink',
      userId,
      amount: Number(amount),
      tariffId: tariffId || null,
      // Передаем настройки платежной системы (из запроса или из Firestore)
      paymentSettings: finalPaymentSettings || {},
      ...req.body
    }
    
    console.log('📤 n8n-webhook-proxy: Данные для n8n workflow:', {
      mode: paymentData.mode,
      userId: paymentData.userId,
      amount: paymentData.amount,
      tariffId: paymentData.tariffId,
      hasPaymentSettings: !!paymentData.paymentSettings && Object.keys(paymentData.paymentSettings).length > 0,
      paymentSettingsKeys: paymentData.paymentSettings ? Object.keys(paymentData.paymentSettings) : []
    })
    
    const result = await callN8NWebhook(webhookUrl, paymentData)
    
    console.log('✅ n8n-webhook-proxy: Получен ответ от n8n для генерации ссылки:', {
      hasResult: !!result,
      resultType: Array.isArray(result) ? 'array' : typeof result,
      resultLength: Array.isArray(result) ? result.length : undefined,
      hasPaymentUrl: Array.isArray(result) ? !!result[0]?.paymentUrl : !!result?.paymentUrl,
      hasOrderId: Array.isArray(result) ? !!result[0]?.orderId : !!result?.orderId,
      resultKeys: result ? (Array.isArray(result) ? (result[0] ? Object.keys(result[0]) : []) : Object.keys(result)) : [],
      fullResult: JSON.stringify(result, null, 2).substring(0, 500)
    })
    
    // callN8NWebhook возвращает данные из response.data
    // n8n может вернуть массив или объект, поэтому обрабатываем оба случая
    let responseData = null
    
    if (Array.isArray(result)) {
      // Если ответ - массив, берем первый элемент
      responseData = result[0] || result.find(item => item?.paymentUrl || item?.orderId) || {}
      console.log('📦 n8n-webhook-proxy: Ответ от n8n - массив, извлечен первый элемент:', {
        hasPaymentUrl: !!responseData.paymentUrl,
        hasOrderId: !!responseData.orderId
      })
    } else if (result?.data) {
      // Если ответ имеет поле data
      responseData = result.data
    } else {
      // Иначе используем сам result
      responseData = result || {}
    }
    
    // Проверяем, что в ответе есть необходимые поля
    if (!responseData.paymentUrl && !responseData.orderId) {
      console.error('❌ n8n-webhook-proxy: Неполные данные от n8n workflow:', {
        responseData,
        result,
        resultType: typeof result,
        isArray: Array.isArray(result),
        resultKeys: result ? (Array.isArray(result) ? (result[0] ? Object.keys(result[0]) : []) : Object.keys(result)) : []
      })
      return res.status(500).json({
        success: false,
        error: 'Неполные данные от n8n workflow: отсутствует paymentUrl или orderId',
        receivedData: responseData
      })
    }
    
    console.log('✅ n8n-webhook-proxy: Отправка ответа клиенту:', {
      paymentUrl: responseData.paymentUrl,
      orderId: responseData.orderId,
      amount: responseData.amount,
      status: responseData.status,
      allKeys: Object.keys(responseData),
      fullResponse: JSON.stringify(responseData, null, 2)
    })
    
    // Отправляем ответ клиенту
    res.json({
      success: true,
      paymentUrl: responseData.paymentUrl,
      orderId: responseData.orderId,
      amount: responseData.amount,
      status: responseData.status,
      userId: responseData.userId
    })
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка при обработке запроса generate-link:', {
      message: error.message,
      stack: error.stack
    })
    
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка генерации ссылки на оплату через n8n',
    })
  }
})

/**
 * Загрузка настроек платежей из Firestore
 */
async function loadPaymentSettings() {
  // Если Firebase Admin SDK еще не инициализирован, пытаемся инициализировать
  if (!db) {
    await initFirebaseAdmin()
  }

  if (!db) {
    console.log('⚠️ Firestore недоступен, настройки платежей не загружены')
    return {}
  }

  try {
    const APP_ID = process.env.APP_ID || 'vpn-service'
    // Путь к документу: artifacts/{APP_ID}/public/settings
    const settingsRef = db.doc(`artifacts/${APP_ID}/public/settings`)
    const settingsSnapshot = await settingsRef.get()
    
    if (settingsSnapshot.exists) {
      const data = settingsSnapshot.data()
      const paymentSettings = {
        yoomoneyWallet: data.yoomoneyWallet || data.yooMoneyWallet || null,
        yoomoneySecretKey: data.yoomoneySecretKey || data.yooMoneySecretKey || null,
      }
      console.log('✅ Настройки платежей загружены из Firestore', {
        hasWallet: !!paymentSettings.yoomoneyWallet,
        hasSecretKey: !!paymentSettings.yoomoneySecretKey
      })
      return paymentSettings
    } else {
      console.log('⚠️ Документ settings не найден в Firestore')
      return {}
    }
  } catch (err) {
    console.error('❌ Ошибка загрузки настроек платежей из Firestore:', err.message)
    return {}
  }
}

/**
 * Обработка webhook от YooMoney
 * POST /api/payment/webhook
 * 
 * Принимает уведомление от YooMoney (JSON) и отправляет в n8n workflow
 * для обработки платежа
 */
app.post('/api/payment/webhook', async (req, res) => {
  try {
    console.log('📥 n8n-webhook-proxy: Получен webhook от YooMoney', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      notificationType: req.body?.notification_type,
      operationId: req.body?.operation_id,
      label: req.body?.label
    })
    
    // Загружаем настройки платежей из Firestore
    const paymentSettings = await loadPaymentSettings()
    console.log('📥 n8n-webhook-proxy: Настройки платежей загружены', {
      hasWallet: !!paymentSettings.yoomoneyWallet,
      hasSecretKey: !!paymentSettings.yoomoneySecretKey
    })
    
    // Получаем webhook URL для обработки платежей
    const webhookUrl = getWebhookUrl('addClient', req) // Используем существующий механизм
    console.log('📤 n8n-webhook-proxy: Отправка webhook в n8n для обработки:', webhookUrl)
    
    // Формируем данные для n8n workflow, включая настройки платежей
    const webhookData = {
      mode: 'processNotification',
      paymentSettings: paymentSettings,
      ...req.body
    }
    
    const result = await callN8NWebhook(webhookUrl, webhookData)
    
    console.log('✅ n8n-webhook-proxy: Получен ответ от n8n для обработки webhook:', {
      hasResult: !!result,
      status: result?.status,
      hasOrderId: !!result?.orderId,
      orderId: result?.orderId || req.body?.label
    })
    
    // Логируем успешную обработку платежа
    if (result?.status === 'success' || result?.success) {
      console.log('🎉 n8n-webhook-proxy: Платеж успешно обработан!', {
        orderId: result?.orderId || req.body?.label,
        operationId: req.body?.operation_id,
        amount: req.body?.amount
      })
    }
    
    // YooMoney ожидает ответ 200 OK для успешной обработки
    res.status(200).json(result)
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка при обработке webhook от YooMoney:', {
      message: error.message,
      stack: error.stack
    })
    
    // YooMoney может повторять запросы при ошибках, поэтому возвращаем 200
    // но с информацией об ошибке
    res.status(200).json({
      success: false,
      error: error.message || 'Ошибка обработки webhook от YooMoney',
    })
  }
})

/**
 * Проверка статуса платежа по orderId
 * GET /api/payment/status/:orderId
 * 
 * Возвращает статус платежа из Firestore
 */
app.get('/api/payment/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId обязателен'
      })
    }

    // Если Firebase Admin SDK еще не инициализирован, пытаемся инициализировать
    if (!db) {
      await initFirebaseAdmin()
    }

    if (!db) {
      console.log('⚠️ Firestore недоступен для проверки статуса платежа')
      return res.status(503).json({
        success: false,
        error: 'Firestore недоступен'
      })
    }

    try {
      const APP_ID = process.env.APP_ID || 'skyputh'
      const paymentsCollection = db.collection(`artifacts/${APP_ID}/public/data/payments`)
      const paymentQuery = paymentsCollection.where('orderId', '==', orderId).limit(1)
      const paymentSnapshot = await paymentQuery.get()

      if (paymentSnapshot.empty) {
        console.log('⚠️ Платеж не найден', { orderId })
        return res.status(404).json({
          success: false,
          error: 'Платеж не найден',
          orderId
        })
      }

      const paymentDoc = paymentSnapshot.docs[0]
      const paymentData = {
        id: paymentDoc.id,
        ...paymentDoc.data(),
      }

      console.log('📊 Статус платежа проверен', {
        orderId,
        status: paymentData.status,
        userId: paymentData.userId
      })

      res.json({
        success: true,
        orderId,
        status: paymentData.status,
        payment: {
          id: paymentData.id,
          orderId: paymentData.orderId,
          userId: paymentData.userId,
          amount: paymentData.amount,
          tariffId: paymentData.tariffId,
          status: paymentData.status,
          createdAt: paymentData.createdAt,
          completedAt: paymentData.completedAt,
          operationId: paymentData.operationId
        }
      })
    } catch (firestoreError) {
      console.error('❌ Ошибка при запросе к Firestore:', firestoreError)
      res.status(500).json({
        success: false,
        error: 'Ошибка при проверке статуса платежа',
        details: firestoreError.message
      })
    }
  } catch (error) {
    console.error('❌ Ошибка при проверке статуса платежа:', {
      message: error.message,
      stack: error.stack
    })
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка при проверке статуса платежа'
    })
  }
})

/**
 * System Monitoring Routes
 */
app.get('/api/system/status', async (req, res) => {
  try {
    const cpuLoad = os.loadavg()[0]
    const cpuCores = os.cpus().length
    const cpuUsagePercent = Math.min((cpuLoad / cpuCores) * 100, 100)
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()
    const usedMemory = totalMemory - freeMemory
    const memoryUsagePercent = (usedMemory / totalMemory) * 100
    const uptime = os.uptime()

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      cpu: { load: cpuLoad.toFixed(2), cores: cpuCores, usagePercent: cpuUsagePercent.toFixed(2) },
      memory: { total: totalMemory, used: usedMemory, free: freeMemory, usagePercent: memoryUsagePercent.toFixed(2) },
      uptime: { seconds: uptime, formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m` },
      n8n: { available: true, baseUrl: N8N_BASE_URL },
    })
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message })
  }
})

app.get('/api/system/logs', (req, res) => {
  res.json({ logs: [], message: 'Логи доступны в n8n workflows' })
})

// ========== Error Handling ==========

app.use((err, req, res, next) => {
  console.error('❌ Error:', err)
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  })
})

// ========== Server Start ==========

const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'

app.listen(PORT, HOST, () => {
  console.log('🚀 n8n Webhook Proxy Server')
  console.log(`📡 http://${HOST}:${PORT}`)
  console.log(`🔗 n8n: ${N8N_BASE_URL}`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
})
