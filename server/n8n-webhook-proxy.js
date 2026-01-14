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

    // Приоритет инициализации:
    // 1. FIREBASE_SERVICE_ACCOUNT_KEY (JSON строка)
    // 2. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (отдельные переменные)
    // 3. Application Default Credentials (для production)

    let credential = null

    // Вариант 1: Service Account JSON
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (serviceAccountKey) {
      try {
        const serviceAccount = JSON.parse(serviceAccountKey)
        credential = firebaseAdmin.credential.cert(serviceAccount)
        console.log('📝 Используется FIREBASE_SERVICE_ACCOUNT_KEY')
      } catch (err) {
        console.log('⚠️ Ошибка парсинга FIREBASE_SERVICE_ACCOUNT_KEY:', err.message)
      }
    }

    // Вариант 2: Отдельные переменные (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
    if (!credential) {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
      
      if (clientEmail && privateKey) {
        // Нормализуем private key (заменяем \n на реальные переносы строк)
        const normalizedPrivateKey = privateKey.replace(/\\n/g, '\n')
        credential = firebaseAdmin.credential.cert({
          projectId,
          clientEmail,
          privateKey: normalizedPrivateKey,
        })
        console.log('📝 Используется FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY')
      }
    }

    // Инициализация
    if (credential) {
      firebaseAdmin.initializeApp({
        credential,
        projectId,
      })
    } else {
      // Вариант 3: Application Default Credentials (для production)
      firebaseAdmin.initializeApp({
        projectId,
      })
      console.log('📝 Используются Application Default Credentials')
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
    // Детальное логирование ошибки
    const errorData = error.response?.data
    const errorStatus = error.response?.status
    const errorStatusText = error.response?.statusText
    const hasErrorData = errorData && (typeof errorData === 'object' ? Object.keys(errorData).length > 0 : true)
    
    console.error(`❌ n8n error:`, {
      message: error.message,
      status: errorStatus,
      statusText: errorStatusText,
      hasData: !!errorData,
      dataType: typeof errorData,
      dataKeys: errorData && typeof errorData === 'object' ? Object.keys(errorData) : 'N/A',
      dataPreview: errorData ? (typeof errorData === 'string' ? errorData.substring(0, 200) : JSON.stringify(errorData).substring(0, 200)) : 'empty',
      url: webhookUrl,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    })
    
    // Улучшенная обработка ошибок от n8n
    let errorMessage = error.message || 'Ошибка вызова n8n webhook'
    const n8nDetails = errorData?.n8nDetails || {}
    
    if (errorStatus === 404 || errorStatus === 500 || errorStatus === 400) {
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
      } else if (typeof errorData === 'string' && errorData.trim()) {
        // Если ответ - строка (например, HTML страница с ошибкой)
        errorMessage = `Ошибка от n8n (${errorStatus}): ${errorData.substring(0, 500)}`
      } else if (!hasErrorData || (typeof errorData === 'object' && Object.keys(errorData).length === 0)) {
        // Пустой ответ или пустой объект
        errorMessage = `Ошибка от n8n (${errorStatus}): ${errorStatusText || 'Пустой ответ от сервера'}\n\n` +
          `🔧 Возможные причины:\n` +
          `1. Workflow в n8n не активирован\n` +
          `2. Ошибка выполнения workflow (проверьте логи n8n)\n` +
          `3. Узел "Respond to Webhook" не настроен или не подключен\n` +
          `4. Webhook URL неправильный: ${webhookUrl}\n\n` +
          `💡 Проверьте логи n8n для детальной информации об ошибке.`
      } else {
        // Неизвестный формат ответа
        errorMessage = `Ошибка от n8n (${errorStatus}): ${errorStatusText || 'Unknown error'}\n\n` +
          `Получен ответ: ${JSON.stringify(errorData, null, 2).substring(0, 1000)}`
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      errorMessage = `Не удалось подключиться к n8n (${error.code}): ${error.message}\n\n` +
        `🔧 Проверьте:\n` +
        `1. Доступность n8n по адресу: ${N8N_BASE_URL}\n` +
        `2. Правильность N8N_BASE_URL в переменных окружения\n` +
        `3. Сетевые настройки и firewall`
    }
    
    // Создаем объект ошибки с дополнительной информацией
    const enhancedError = new Error(errorMessage)
    enhancedError.status = errorStatus
    enhancedError.statusText = errorStatusText
    enhancedError.originalError = error.message
    enhancedError.webhookUrl = webhookUrl
    enhancedError.errorData = errorData
    
    throw enhancedError
  }
}

// ========== Routes ==========

/**
 * Health Check
 * GET /api/vpn/health
 * 
 * Простая проверка доступности сервера без обращения к n8n.
 * Health check не должен зависеть от доступности n8n.
 */
app.get('/api/vpn/health', async (req, res) => {
  try {
    // Простая проверка - сервер работает
    res.json({
      status: 'ok',
      service: 'n8n-webhook-proxy',
      timestamp: new Date().toISOString(),
      server: {
        port: PORT,
        host: HOST,
        uptime: process.uptime(),
      },
      n8n: {
        baseUrl: N8N_BASE_URL,
        webhookId: DEFAULT_WEBHOOK_ID,
        note: 'Для проверки доступности n8n используйте POST запрос к webhook endpoint'
      },
    })
  } catch (error) {
    // Критическая ошибка самого сервера
    console.error('❌ Health check critical error:', error)
    res.status(500).json({
      status: 'error',
      service: 'n8n-webhook-proxy',
      timestamp: new Date().toISOString(),
      error: error.message || 'Неизвестная ошибка',
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
    // Детальное логирование ошибки
    const errorStatus = error.status || error.response?.status || 500
    const errorData = error.errorData || error.response?.data
    const hasErrorData = errorData && (typeof errorData === 'object' ? Object.keys(errorData).length > 0 : typeof errorData === 'string' && errorData.trim().length > 0)
    
    console.error('❌ n8n-webhook-proxy: Ошибка при обработке запроса add-client:', {
      message: error.message,
      status: errorStatus,
      statusText: error.response?.statusText,
      hasErrorData: hasErrorData,
      errorDataType: typeof errorData,
      errorDataPreview: errorData ? (typeof errorData === 'string' ? errorData.substring(0, 200) : JSON.stringify(errorData).substring(0, 200)) : 'empty',
      webhookUrl: error.webhookUrl || getWebhookUrl('addClient', req),
      stack: error.stack?.substring(0, 500)
    })
    
    // Определяем правильный HTTP статус код
    let statusCode = 500
    if (errorStatus) {
      statusCode = errorStatus
    } else if (error.message?.includes('not registered') || error.message?.includes('not found')) {
      statusCode = 404
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      statusCode = 503
    }
    
    // Формируем детальное сообщение об ошибке
    let errorMessage = error.message || 'Ошибка создания клиента через n8n'
    let errorDetails = null
    
    // Если есть структурированные данные об ошибке, передаем их
    if (errorData) {
      if (typeof errorData === 'object') {
        errorDetails = errorData
        // Если есть errorMessage в данных, используем его
        if (errorData.errorMessage) {
          errorMessage = errorData.errorMessage
        } else if (errorData.error) {
          errorMessage = errorData.error
        } else if (errorData.message) {
          errorMessage = errorData.message
        }
      } else if (typeof errorData === 'string' && errorData.trim()) {
        errorDetails = { rawResponse: errorData.substring(0, 1000) }
        // Если ответ - строка, но не пустая, добавляем её к сообщению
        if (errorData.length < 200) {
          errorMessage = `${errorMessage}\n\nОтвет n8n: ${errorData}`
        }
      }
    }
    
    // Если ответ пустой, добавляем специальную подсказку
    if (!hasErrorData && errorStatus === 500) {
      errorMessage = `${errorMessage}\n\n` +
        `⚠️ Получен пустой ответ от n8n. Это может означать:\n` +
        `1. Workflow не активирован в n8n\n` +
        `2. Ошибка выполнения workflow (проверьте логи n8n)\n` +
        `3. Узел "Respond to Webhook" не настроен правильно\n` +
        `4. Webhook URL: ${error.webhookUrl || getWebhookUrl('addClient', req)}`
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      errorMessage: errorMessage, // Дублируем для совместимости с фронтендом
      errorDetails: errorDetails,
      status: errorStatus,
      webhookUrl: error.webhookUrl || getWebhookUrl('addClient', req),
      hint: error.message?.includes('not registered') || error.message?.includes('not found')
        ? 'Проверьте, что workflow активен в n8n и webhook настроен правильно.'
        : error.message?.includes('Unused Respond to Webhook')
        ? 'См. файл N8N_WORKFLOW_SETUP.md для инструкций по исправлению.'
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
      inboundId: req.body?.inboundId,
      serverId: req.body?.serverId,
      serverIP: req.body?.serverIP,
      serverPort: req.body?.serverPort,
      randompath: req.body?.randompath,
      protocol: req.body?.protocol
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
    
    const { userId, amount, tariffId, paymentSettings, userData: requestUserData } = req.body
    
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
    
    // Получаем данные пользователя (uuid, email, inboundId)
    // Приоритет: из запроса > из Firestore
    let userData = {
      uuid: null,
      email: null,
      inboundId: null,
      userId: userId
    }
    
    // Если данные пользователя переданы в запросе, используем их
    if (requestUserData && (requestUserData.uuid || requestUserData.email || requestUserData.inboundId)) {
      userData.uuid = requestUserData.uuid || null
      userData.email = requestUserData.email || null
      userData.inboundId = requestUserData.inboundId || null
      console.log('✅ n8n-webhook-proxy: Данные пользователя получены из запроса', {
        userId,
        hasEmail: !!userData.email,
        hasUuid: !!userData.uuid,
        hasInboundId: !!userData.inboundId,
        email: userData.email,
        uuid: userData.uuid,
        inboundId: userData.inboundId
      })
    } else {
      // Если данные не переданы, пытаемся получить из Firestore
      if (db && userId) {
        try {
          const APP_ID = process.env.APP_ID || 'skyputh'
          
          console.log('🔍 n8n-webhook-proxy: Загрузка данных пользователя из Firestore', {
            userId,
            appId: APP_ID,
            collectionPath: `artifacts/${APP_ID}/public/data/users_v4`
          })
          
          // Получаем данные пользователя из Firestore
          const usersCollection = db.collection(`artifacts/${APP_ID}/public/data/users_v4`)
          const userDoc = await usersCollection.doc(userId).get()
          
          if (userDoc.exists) {
            const userDocData = userDoc.data()
            userData.email = userDocData.email || null
            userData.uuid = userDocData.uuid || null
            
            console.log('✅ n8n-webhook-proxy: Данные пользователя загружены из Firestore для генерации ссылки', {
              userId,
              hasEmail: !!userData.email,
              hasUuid: !!userData.uuid,
              email: userData.email,
              uuid: userData.uuid,
              allUserDataKeys: Object.keys(userDocData)
            })
          } else {
            console.warn('⚠️ n8n-webhook-proxy: Пользователь не найден в Firestore для генерации ссылки', { 
              userId,
              appId: APP_ID,
              collectionPath: `artifacts/${APP_ID}/public/data/users_v4`
            })
          }
        } catch (userDataError) {
          console.error('❌ n8n-webhook-proxy: Ошибка получения данных пользователя для генерации ссылки', {
            userId,
            error: userDataError.message,
            stack: userDataError.stack
          })
          // Продолжаем работу даже если не удалось получить данные пользователя
        }
      } else {
        console.warn('⚠️ n8n-webhook-proxy: Не удалось загрузить данные пользователя', {
          hasDb: !!db,
          hasUserId: !!userId
        })
      }
    }
    
    // Формируем данные для n8n workflow, включая настройки платежной системы и данные пользователя
    const paymentData = {
      mode: 'generateLink',
      userId,
      amount: Number(amount),
      tariffId: tariffId || null,
      // Данные пользователя
      userData: {
        uuid: userData.uuid,
        email: userData.email,
        userId: userData.userId,
        inboundId: userData.inboundId || null // Inbound ID тарифа
      },
      // Передаем настройки платежной системы (из запроса или из Firestore)
      paymentSettings: finalPaymentSettings || {},
      ...req.body
    }
    
    console.log('📤 n8n-webhook-proxy: Данные для n8n workflow:', {
      mode: paymentData.mode,
      userId: paymentData.userId,
      amount: paymentData.amount,
      tariffId: paymentData.tariffId,
      hasUserData: !!paymentData.userData,
      userData: paymentData.userData,
      hasPaymentSettings: !!paymentData.paymentSettings && Object.keys(paymentData.paymentSettings).length > 0,
      paymentSettingsKeys: paymentData.paymentSettings ? Object.keys(paymentData.paymentSettings) : [],
      fullPaymentData: JSON.stringify(paymentData, null, 2).substring(0, 1000)
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
      // n8n может возвращать [{ json: { paymentUrl: ... } }] или [{ paymentUrl: ... }]
      const firstItem = result[0] || result.find(item => item?.paymentUrl || item?.json?.paymentUrl || item?.orderId || item?.json?.orderId) || {}
      
      // Проверяем, есть ли поле json (стандартный формат n8n)
      if (firstItem.json) {
        responseData = firstItem.json
      } else {
        responseData = firstItem
      }
      
      console.log('📦 n8n-webhook-proxy: Ответ от n8n - массив, извлечен первый элемент:', {
        hasPaymentUrl: !!responseData.paymentUrl,
        hasOrderId: !!responseData.orderId,
        hasJsonField: !!firstItem.json
      })
    } else if (result?.json) {
      // Если ответ имеет поле json (стандартный формат n8n)
      responseData = result.json
    } else if (result?.data) {
      // Если ответ имеет поле data
      responseData = result.data
    } else {
      // Иначе используем сам result
      responseData = result || {}
    }
    
    // Извлекаем orderId из paymentUrl, если он не передан в ответе n8n
    if (!responseData.orderId && responseData.paymentUrl) {
      try {
        const url = new URL(responseData.paymentUrl)
        const label = url.searchParams.get('label')
        if (label && label.startsWith('order_')) {
          responseData.orderId = label
          console.log('✅ n8n-webhook-proxy: orderId извлечен из paymentUrl', {
            orderId: responseData.orderId,
            label
          })
        }
      } catch (urlError) {
        console.warn('⚠️ n8n-webhook-proxy: Не удалось извлечь orderId из paymentUrl', {
          paymentUrl: responseData.paymentUrl,
          error: urlError.message
        })
      }
    }

    // Проверяем, что в ответе есть paymentUrl
    if (!responseData.paymentUrl) {
      console.error('❌ n8n-webhook-proxy: Отсутствует paymentUrl от n8n workflow:', {
        responseData,
        result,
        resultType: typeof result,
        isArray: Array.isArray(result),
        resultKeys: result ? (Array.isArray(result) ? (result[0] ? Object.keys(result[0]) : []) : Object.keys(result)) : []
      })
      return res.status(500).json({
        success: false,
        error: 'Неполные данные от n8n workflow: отсутствует paymentUrl',
        receivedData: responseData
      })
    }

    // Если orderId все еще отсутствует, генерируем его
    if (!responseData.orderId) {
      responseData.orderId = `order_${Date.now()}`
      console.warn('⚠️ n8n-webhook-proxy: orderId сгенерирован из timestamp', {
        orderId: responseData.orderId
      })
    }
    
    console.log('✅ n8n-webhook-proxy: Отправка ответа клиенту:', {
      paymentUrl: responseData.paymentUrl,
      orderId: responseData.orderId,
      amount: responseData.amount || amount,
      status: responseData.status,
      allKeys: Object.keys(responseData),
      fullResponse: JSON.stringify(responseData, null, 2)
    })
    
    // Отправляем ответ клиенту
    res.json({
      success: true,
      paymentUrl: responseData.paymentUrl,
      orderId: responseData.orderId,
      amount: responseData.amount || amount, // Используем amount из запроса, если n8n не вернул
      status: responseData.status || 'pending',
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
    const APP_ID = process.env.APP_ID || 'skyputh'
    // Путь к документу: artifacts/{APP_ID}/public/settings
    const settingsPath = `artifacts/${APP_ID}/public/settings`
    console.log('🔍 n8n-webhook-proxy: Загрузка настроек платежей из Firestore', {
      appId: APP_ID,
      settingsPath
    })
    
    const settingsRef = db.doc(settingsPath)
    const settingsSnapshot = await settingsRef.get()
    
    if (settingsSnapshot.exists) {
      const data = settingsSnapshot.data()
      const paymentSettings = {
        yoomoneyWallet: data.yoomoneyWallet || data.yooMoneyWallet || null,
        yoomoneySecretKey: data.yoomoneySecretKey || data.yooMoneySecretKey || null,
      }
      console.log('✅ n8n-webhook-proxy: Настройки платежей загружены из Firestore', {
        hasWallet: !!paymentSettings.yoomoneyWallet,
        hasSecretKey: !!paymentSettings.yoomoneySecretKey,
        wallet: paymentSettings.yoomoneyWallet ? `${paymentSettings.yoomoneyWallet.substring(0, 5)}...` : null,
        allSettingsKeys: Object.keys(data)
      })
      return paymentSettings
    } else {
      console.warn('⚠️ n8n-webhook-proxy: Документ settings не найден в Firestore', {
        appId: APP_ID,
        settingsPath
      })
      return {}
    }
  } catch (err) {
    console.error('❌ n8n-webhook-proxy: Ошибка загрузки настроек платежей из Firestore:', {
      error: err.message,
      stack: err.stack
    })
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
    
    // Получаем данные пользователя из платежа
    let userData = {
      uuid: null,
      email: null,
      userId: null
    }
    
    // Формируем дату и время оплаты в формате DD-MM-YYYY и время ЧЧ:ММ
    const paymentDateTime = new Date()
    const paymentDate = paymentDateTime.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) // Формат: DD-MM-YYYY
    const paymentTime = paymentDateTime.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) // Формат: ЧЧ:ММ
    
    // Пытаемся получить данные пользователя из платежа в Firestore
    if (db && req.body?.label) {
      try {
        const APP_ID = process.env.APP_ID || 'skyputh'
        const orderId = req.body.label
        
        // Ищем платеж по orderId
        const paymentsCollection = db.collection(`artifacts/${APP_ID}/public/data/payments`)
        const paymentQuery = paymentsCollection.where('orderId', '==', orderId).limit(1)
        const paymentSnapshot = await paymentQuery.get()
        
        if (!paymentSnapshot.empty) {
          const paymentDoc = paymentSnapshot.docs[0]
          const paymentData = paymentDoc.data()
          const userId = paymentData.userId
          
          if (userId) {
            userData.userId = userId
            
            // Получаем данные пользователя из Firestore
            const usersCollection = db.collection(`artifacts/${APP_ID}/public/data/users_v4`)
            const userDoc = await usersCollection.doc(userId).get()
            
            if (userDoc.exists) {
              const userDocData = userDoc.data()
              userData.email = userDocData.email || null
              userData.uuid = userDocData.uuid || null
              
              console.log('✅ n8n-webhook-proxy: Данные пользователя загружены из Firestore', {
                userId,
                hasEmail: !!userData.email,
                hasUuid: !!userData.uuid
              })
            } else {
              console.warn('⚠️ n8n-webhook-proxy: Пользователь не найден в Firestore', { userId })
            }
          } else {
            console.warn('⚠️ n8n-webhook-proxy: userId не найден в платеже', { orderId })
          }
        } else {
          console.warn('⚠️ n8n-webhook-proxy: Платеж не найден в Firestore', { orderId })
        }
      } catch (userDataError) {
        console.error('❌ n8n-webhook-proxy: Ошибка получения данных пользователя', {
          error: userDataError.message
        })
        // Продолжаем работу даже если не удалось получить данные пользователя
      }
    }
    
    // Получаем webhook URL для обработки платежей
    const webhookUrl = getWebhookUrl('addClient', req) // Используем существующий механизм
    console.log('📤 n8n-webhook-proxy: Отправка webhook в n8n для обработки:', webhookUrl)
    
    // Формируем данные для n8n workflow, включая настройки платежей и данные пользователя
    const webhookData = {
      mode: 'processNotification',
      paymentSettings: paymentSettings,
      // Данные пользователя
      userData: {
        uuid: userData.uuid,
        email: userData.email,
        userId: userData.userId
      },
      // Дата и время оплаты
      paymentDate: paymentDate, // Формат: DD-MM-YYYY
      paymentTime: paymentTime, // Формат: HH:MM:SS
      paymentDateTime: paymentDateTime.toISOString(), // ISO формат для совместимости
      // Оригинальные данные от YooMoney
      ...req.body
    }
    
    console.log('📤 n8n-webhook-proxy: Данные для n8n workflow:', {
      mode: webhookData.mode,
      hasUserData: !!webhookData.userData,
      userData: webhookData.userData,
      paymentDate: webhookData.paymentDate,
      paymentTime: webhookData.paymentTime,
      label: webhookData.label,
      operationId: webhookData.operation_id
    })
    
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
 * Проверка платежа (вызов webhook для проверки)
 * POST /api/payment/verify
 * 
 * Принимает orderId и отправляет запрос в n8n workflow для проверки платежа
 */
app.post('/api/payment/verify', async (req, res) => {
  try {
    console.log('📥 n8n-webhook-proxy: Получен запрос POST /api/payment/verify', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      orderId: req.body?.orderId,
      userId: req.body?.userId
    })
    
    const { orderId, userId, tariffId, amount } = req.body
    
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
      console.log('⚠️ Firestore недоступен для проверки платежа')
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
        console.log('⚠️ Платеж не найден для проверки', { orderId })
        return res.status(404).json({
          success: false,
          error: 'Платеж не найден',
          orderId
        })
      }

      const paymentDoc = paymentSnapshot.docs[0]
      const paymentData = paymentDoc.data()
      
      // Получаем данные пользователя из Firestore
      let userData = {
        uuid: null,
        email: paymentData.email || null,
        userId: paymentData.userId || userId
      }
      
      if (userData.userId) {
        try {
          const usersCollection = db.collection(`artifacts/${APP_ID}/public/data/users_v4`)
          const userDoc = await usersCollection.doc(userData.userId).get()
          
          if (userDoc.exists) {
            const userDocData = userDoc.data()
            userData.email = userDocData.email || userData.email
            userData.uuid = userDocData.uuid || null
          }
        } catch (userDataError) {
          console.error('❌ Ошибка получения данных пользователя', {
            userId: userData.userId,
            error: userDataError.message
          })
        }
      }
      
      // Загружаем настройки платежей
      const paymentSettings = await loadPaymentSettings()
      
      // Получаем webhook URL
      const webhookUrl = getWebhookUrl('addClient', req)
      
      // Формируем данные для n8n workflow
      const verifyData = {
        mode: 'verifyPayment',
        orderId: orderId,
        userId: userData.userId,
        // Данные пользователя
        userData: {
          uuid: userData.uuid,
          email: userData.email,
          userId: userData.userId
        },
        // Данные платежа
        paymentData: {
          orderId: orderId,
          userId: paymentData.userId,
          tariffId: paymentData.tariffId || tariffId,
          tariffName: paymentData.tariffName,
          amount: paymentData.amount || amount,
          status: paymentData.status,
          devices: paymentData.devices,
          periodMonths: paymentData.periodMonths,
          discount: paymentData.discount,
          createdAt: paymentData.createdAt
        },
        // Настройки платежей
        paymentSettings: paymentSettings
      }
      
      console.log('📤 n8n-webhook-proxy: Отправка запроса на проверку платежа в n8n:', {
        webhookUrl,
        orderId,
        userId: userData.userId,
        hasPaymentData: !!verifyData.paymentData
      })
      
      const result = await callN8NWebhook(webhookUrl, verifyData)
      
      console.log('✅ n8n-webhook-proxy: Получен ответ от n8n для проверки платежа:', {
        hasResult: !!result,
        status: result?.status,
        success: result?.success
      })
      
      res.json({
        success: true,
        orderId,
        result: result
      })
    } catch (firestoreError) {
      console.error('❌ Ошибка при запросе к Firestore для проверки платежа:', firestoreError)
      res.status(500).json({
        success: false,
        error: 'Ошибка при проверке платежа',
        details: firestoreError.message
      })
    }
  } catch (error) {
    console.error('❌ Ошибка при проверке платежа:', {
      message: error.message,
      stack: error.stack
    })
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка при проверке платежа'
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
