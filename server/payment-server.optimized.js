/**
 * Минимальный Express сервер для работы с платежами ЮMoney (ОПТИМИЗИРОВАННАЯ ВЕРСИЯ)
 * 
 * ОПТИМИЗАЦИИ:
 * 1. ✅ Добавлено кэширование для GET запросов (получение платежей)
 * 2. ✅ Поддержка cluster mode для многопоточности
 * 3. ✅ Оптимизировано логирование
 * 
 * Этот сервер:
 * 1. Создает платежи через ЮMoney API
 * 2. Сохраняет данные о платежах в локальное хранилище
 * 3. Отдает пользователю ссылку на оплату
 * 
 * ВАЖНО: Проверка статуса оплаты выполняется в n8n через operation-history API.
 * n8n будет опрашивать operation-history по label (orderId) и обновлять статус.
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createPayment } from './paymentService.js'
import { getPayment, getAllPayments, initStorage } from './storage.js'
import { cache } from './cache.js'
import { startCluster, getWorkerInfo } from './cluster.js'
import { initFirebaseAdmin } from './lib/firebaseInit.js'

dotenv.config()

async function createApp() {
  const { db } = await initFirebaseAdmin()
  const appId = process.env.APP_ID || 'skyputh'
  if (db) initStorage(db, appId)

  const app = express()

  // Middleware
  app.use(cors({
    origin: '*', // В продакшене указать конкретные домены
    credentials: true
  }))
  app.use(express.json())

  // Логирование запросов (оптимизировано)
  app.use((req, res, next) => {
    const workerInfo = getWorkerInfo()
    const workerPrefix = workerInfo.isWorker ? `[Worker ${workerInfo.workerId}] ` : ''
    console.log(`${workerPrefix}[${new Date().toISOString()}] ${req.method} ${req.path}`)
    next()
  })

  /**
   * POST /create-payment
   * 
   * Создает платеж через ЮMoney API и сохраняет данные
   * 
   * Body:
   * {
   *   "orderId": "order_1234567890",
   *   "amount": 150,
   *   "description": "Оплата VPN подписки" (опционально),
   *   "userId": "user123" (опционально),
   *   "tariffId": "tariff123" (опционально)
   * }
   * 
   * Response:
   * {
   *   "success": true,
   *   "orderId": "order_1234567890",
   *   "label": "order_1234567890",
   *   "requestId": "request_id_from_yoomoney",
   *   "paymentURL": "https://yoomoney.ru/...",
   *   "amount": 150,
   *   "status": "pending"
   * }
   */
  app.post('/create-payment', async (req, res) => {
    try {
      const { orderId, amount, description, userId, tariffId } = req.body

      // Валидация входных данных
      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: 'orderId обязателен'
        })
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'amount должен быть больше 0'
        })
      }

      console.log('📥 Creating payment request:', {
        orderId,
        amount,
        userId,
        tariffId
      })

      // Создаем платеж
      const result = await createPayment(orderId, amount, {
        description,
        userId,
        tariffId
      })

      console.log('✅ Payment created:', {
        orderId: result.orderId,
        paymentURL: result.paymentURL,
        status: result.status
      })

      // ОПТИМИЗАЦИЯ: Инвалидируем кэш для этого orderId
      cache.delete(`payment_${orderId}`)
      cache.delete('payments_all') // Инвалидируем кэш списка всех платежей

      // Возвращаем результат пользователю
      res.json({
        success: true,
        orderId: result.orderId,
        label: result.label, // Для поиска в operation-history
        requestId: result.requestId,
        paymentURL: result.paymentURL,
        amount: result.amount,
        status: result.status
      })
    } catch (error) {
      console.error('❌ Error in /create-payment:', {
        errorMessage: error.message,
        stack: error.stack
      })

      res.status(500).json({
        success: false,
        error: error.message || 'Ошибка создания платежа'
      })
    }
  })

  /**
   * GET /payment/:orderId
   * 
   * ОПТИМИЗАЦИЯ: Добавлено кэширование на 10 секунд
   * 
   * Получить информацию о платеже по orderId
   * 
   * Response:
   * {
   *   "orderId": "order_1234567890",
   *   "label": "order_1234567890",
   *   "status": "pending",
   *   "amount": 150,
   *   "createdAt": "2024-01-01T00:00:00.000Z"
   * }
   */
  app.get('/payment/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params

      // ОПТИМИЗАЦИЯ: Проверяем кэш
      const cacheKey = `payment_${orderId}`
      const cachedPayment = cache.get(cacheKey)
      
      if (cachedPayment) {
        console.log(`💾 Cache HIT: payment/${orderId}`)
        return res.json({
          success: true,
          payment: cachedPayment
        })
      }

      const payment = await getPayment(orderId)

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'Платеж не найден'
        })
      }

      // ОПТИМИЗАЦИЯ: Сохраняем в кэш на 10 секунд
      cache.set(cacheKey, payment, 10)

      res.json({
        success: true,
        payment
      })
    } catch (error) {
      console.error('❌ Error in /payment/:orderId:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Ошибка получения платежа'
      })
    }
  })

  /**
   * GET /payments (для отладки)
   * 
   * ОПТИМИЗАЦИЯ: Добавлено кэширование на 5 секунд
   * 
   * Получить все платежи
   */
  app.get('/payments', async (req, res) => {
    try {
      // ОПТИМИЗАЦИЯ: Проверяем кэш
      const cacheKey = 'payments_all'
      const cachedPayments = cache.get(cacheKey)
      
      if (cachedPayments) {
        console.log(`💾 Cache HIT: /payments`)
        return res.json({
          success: true,
          count: cachedPayments.length,
          payments: cachedPayments
        })
      }

      const payments = await getAllPayments()
      
      // ОПТИМИЗАЦИЯ: Сохраняем в кэш на 5 секунд
      cache.set(cacheKey, payments, 5)

      res.json({
        success: true,
        count: payments.length,
        payments
      })
    } catch (error) {
      console.error('❌ Error in /payments:', error)
      res.status(500).json({
        success: false,
        error: error.message || 'Ошибка получения платежей'
      })
    }
  })

  /**
   * Health check (с информацией о worker и кэше)
   */
  app.get('/health', (req, res) => {
    const workerInfo = getWorkerInfo()
    res.json({
      status: 'ok',
      service: 'payment-server',
      timestamp: new Date().toISOString(),
      worker: workerInfo,
      cache: cache.getStats()
    })
  })

  // Обработка ошибок
  app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  })

  return app
}

// Запуск сервера
const PORT = process.env.PAYMENT_SERVER_PORT || 3002
const HOST = process.env.PAYMENT_SERVER_HOST || '0.0.0.0'

// ОПТИМИЗАЦИЯ: Запуск в cluster mode
startCluster(async () => {
  const app = await createApp()
  
  app.listen(PORT, HOST, () => {
    const workerInfo = getWorkerInfo()
    const workerPrefix = workerInfo.isWorker ? `[Worker ${workerInfo.workerId}] ` : ''
    
    console.log(`${workerPrefix}🚀 Payment Server запущен`)
    console.log(`${workerPrefix}📡 http://${HOST}:${PORT}`)
    console.log(`${workerPrefix}💳 Endpoints:`)
    console.log(`${workerPrefix}   POST /create-payment - Создать платеж`)
    console.log(`${workerPrefix}   GET  /payment/:orderId - Получить платеж`)
    console.log(`${workerPrefix}   GET  /payments - Получить все платежи (отладка)`)
    console.log(`${workerPrefix}   GET  /health - Health check`)
    console.log('')
    console.log('⚠️  ВАЖНО:')
    console.log('   - Проверка статуса оплаты выполняется в n8n')
    console.log('   - n8n опрашивает operation-history по label (orderId)')
    console.log('   - После успешной оплаты n8n обновит статус платежа')
    console.log('')
    
    // Проверка переменных окружения
    if (!process.env.YOOMONEY_ACCESS_TOKEN) {
      console.warn('⚠️  YOOMONEY_ACCESS_TOKEN не настроен!')
    }
    if (!process.env.YOOMONEY_WALLET) {
      console.warn('⚠️  YOOMONEY_WALLET не настроен!')
    }
  })
}, {
  enableCluster: process.env.ENABLE_CLUSTER !== 'false',
  workers: parseInt(process.env.CLUSTER_WORKERS) || undefined
})

export default createApp
