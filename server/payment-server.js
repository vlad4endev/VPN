/**
 * Минимальный Express сервер для работы с платежами ЮMoney
 *
 * Этот сервер:
 * 1. Создает платежи через ЮMoney API
 * 2. Сохраняет данные о платежах в Firestore (или in-memory при отсутствии Firebase)
 * 3. Отдает пользователю ссылку на оплату
 *
 * ВАЖНО: Проверка статуса оплаты выполняется в n8n через operation-history API.
 * n8n будет опрашивать operation-history по label (orderId) и обновлять статус.
 */

import express from 'express'
import compression from 'compression'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createPayment } from './paymentService.js'
import { getPayment, getAllPayments, initStorage } from './storage.js'
import { initFirebaseAdmin } from './lib/firebaseInit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config()
if (fs.existsSync(path.join(__dirname, '.env'))) {
  dotenv.config({ path: path.join(__dirname, '.env'), override: false })
}

const app = express()

app.use(compression())

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) || ['https://skypath.fun'])
    : '*',
  credentials: true
}))
app.use(express.json())

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
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
    const payment = await getPayment(orderId)

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Платеж не найден'
      })
    }

    res.json({
      success: true,
      payment
    })
  } catch (error) {
    console.error('❌ Error in /payment/:orderId:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Ошибка получения платежа'
    })
  }
})

/**
 * GET /payments (для отладки)
 * 
 * Получить все платежи
 */
app.get('/payments', async (req, res) => {
  try {
    const payments = await getAllPayments()
    res.json({
      success: true,
      count: payments.length,
      payments
    })
  } catch (error) {
    console.error('❌ Error in /payments:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Ошибка получения платежей'
    })
  }
})

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'payment-server',
    timestamp: new Date().toISOString()
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

// Запуск сервера
const PORT = process.env.PAYMENT_SERVER_PORT || 3002
const HOST = process.env.PAYMENT_SERVER_HOST || '0.0.0.0'

async function startPaymentServer() {
  const { db } = await initFirebaseAdmin()
  const appId = process.env.APP_ID || 'skyputh'
  if (db) {
    initStorage(db, appId)
  } else {
    console.warn('⚠️ Firebase не настроен: платежи будут храниться в памяти (потеряются при перезапуске)')
  }

  app.listen(PORT, HOST, () => {
  console.log('🚀 Payment Server запущен')
  console.log(`📡 http://${HOST}:${PORT}`)
  console.log(`💳 Endpoints:`)
  console.log(`   POST /create-payment - Создать платеж`)
  console.log(`   GET  /payment/:orderId - Получить платеж`)
  console.log(`   GET  /payments - Получить все платежи (отладка)`)
  console.log(`   GET  /health - Health check`)
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
}

startPaymentServer().catch((err) => {
  console.error('❌ Ошибка запуска Payment Server:', err)
  process.exit(1)
})

export default app
