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
import path from 'path'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import firebaseAdmin from 'firebase-admin'
import crypto, { randomUUID } from 'crypto'
import { sendTelegramMessage, getTelegramBotInfo, getTelegramChat, setTelegramWebhook, getTelegramWebhookInfo, answerCallbackQuery } from './lib/telegram.js'
import webpush from 'web-push'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Firebase Admin SDK для доступа к Firestore
let admin = null
let db = null

// Инициализация Firebase Admin SDK (асинхронная)
async function initFirebaseAdmin() {
  try {
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
    // 0. FIREBASE_SERVICE_ACCOUNT_PATH (путь к JSON-файлу)
    // 1. FIREBASE_SERVICE_ACCOUNT_KEY (JSON строка)
    // 2. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (отдельные переменные)

    let credential = null

    // Вариант 0: JSON-файл (удобно для ключа с переносами строк)
    const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    if (keyPath && !credential) {
      try {
        const resolvedPath = path.isAbsolute(keyPath) ? keyPath : path.join(__dirname, keyPath)
        const json = await readFile(resolvedPath, 'utf8')
        const serviceAccount = JSON.parse(json)
        if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
        credential = firebaseAdmin.credential.cert(serviceAccount)
        console.log('📝 Используется FIREBASE_SERVICE_ACCOUNT_PATH')
      } catch (err) {
        console.log('⚠️ Ошибка чтения FIREBASE_SERVICE_ACCOUNT_PATH:', err.message)
      }
    }

    // Вариант 1: Service Account JSON из env
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (serviceAccountKey && !credential) {
      try {
        const serviceAccount = JSON.parse(serviceAccountKey)
        if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
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

    // Инициализация только при наличии явных учётных данных
    if (credential) {
      firebaseAdmin.initializeApp({
        credential,
        projectId,
      })
      admin = firebaseAdmin
      db = admin.firestore()
      console.log('✅ Firebase Admin SDK инициализирован')
    } else {
      // Нет ключа и нет ADC — не вызываем initializeApp, чтобы не было "Could not load the default credentials"
      console.log('⚠️ Firebase Admin SDK не настроен: задайте FIREBASE_SERVICE_ACCOUNT_KEY (или FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) в server/.env')
      console.log('   Админ-API и Telegram будут возвращать 503 до настройки ключа.')
    }
  } catch (err) {
    console.log('⚠️ Firebase Admin SDK недоступен:', err.message)
    console.log('   Задайте FIREBASE_SERVICE_ACCOUNT_KEY в server/.env (JSON ключа из Firebase Console → Project settings → Service accounts).')
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

// CORS - настройка для безопасности
// Разрешаем только определенные домены для frontend
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'http://[::1]:5173',
      'http://[::1]:3000',
      'https://skypath.fun',
      'https://www.skypath.fun',
    ]

const isDev = process.env.NODE_ENV !== 'production'

function isLocalOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false
  try {
    const u = new URL(origin)
    const host = u.hostname.toLowerCase()
    const localHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0']
    return localHosts.includes(host)
  } catch {
    return false
  }
}

const corsOptions = {
  origin: (origin, callback) => {
    // Запросы без Origin (Postman, curl, SSR, часть мобильных клиентов)
    if (!origin) {
      if (isDev) {
        return callback(null, true)
      }
      return callback(null, true)
    }
    // Явно разрешённые origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    // В development разрешаем любой localhost/127.0.0.1
    if (isDev && isLocalOrigin(origin)) {
      return callback(null, true)
    }
    // То же для production, если запрос с локальных хостов (обратный прокси/тесты)
    if (isLocalOrigin(origin)) {
      return callback(null, true)
    }
    console.warn('⚠️ n8n-webhook-proxy: CORS блокирован для origin:', origin, 'allowed:', allowedOrigins)
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-N8N-Webhook-Secret', 'X-App-Id', 'Accept', 'X-Telegram-InitData'],
}

// CORS для обычных API endpoints (frontend)
app.use(cors(corsOptions))

// Парсинг JSON
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ========== Telegram Mini App: валидация initData (опционально, не ломает старых клиентов) ==========
const TELEGRAM_BOT_TOKEN_ENV = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()
const TELEGRAM_WEBAPP_SECRET = TELEGRAM_BOT_TOKEN_ENV
  ? crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN_ENV).digest()
  : null

/**
 * Валидирует initData от Telegram Web App (HMAC-SHA256).
 * @param {string} initData - строка query string из Telegram.WebApp.initData
 * @returns {Object|null} - объект с полями (user, auth_date, ...) или null при невалидных данных
 */
function validateTelegramInitData(initData) {
  if (!initData || !TELEGRAM_WEBAPP_SECRET) return null
  try {
    const data = new URLSearchParams(initData)
    const hash = data.get('hash')
    if (!hash) return null
    data.delete('hash')
    const dataCheckString = [...data.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    const computedHash = crypto.createHmac('sha256', TELEGRAM_WEBAPP_SECRET).update(dataCheckString).digest('hex')
    if (computedHash !== hash) return null
    const parsed = Object.fromEntries(data)
    if (parsed.user && typeof parsed.user === 'string') {
      try {
        parsed.user = JSON.parse(parsed.user)
      } catch (_) {}
    }
    return parsed
  } catch (_) {
    return null
  }
}

app.use((req, res, next) => {
  const initData = req.headers['x-telegram-initdata'] || req.query.initData || ''
  if (initData) {
    const validated = validateTelegramInitData(initData)
    if (validated) {
      req.telegramUser = validated
      if (validated.user && validated.user.id) {
        console.log('Telegram user:', validated.user.id)
      }
    }
  }
  next()
})

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
 * Логирование n8n событий в Firestore для мониторинга
 * @param {string} eventType - Тип события (webhook_call, payment_processed, activation_success, activation_failed, etc.)
 * @param {Object} eventData - Данные события
 * @param {string} status - Статус (success, error, warning)
 * @param {string} errorMessage - Сообщение об ошибке (если есть)
 */
async function logN8NEvent(eventType, eventData, status = 'success', errorMessage = null) {
  if (!db) {
    console.log('⚠️ n8n-webhook-proxy: Firestore недоступен для логирования события', { eventType, status })
    return
  }

  try {
    const APP_ID = process.env.APP_ID || 'skyputh'
    const eventsCollection = db.collection(`artifacts/${APP_ID}/public/data/n8n_events`)
    
    const eventLog = {
      eventType,
      status,
      eventData: {
        ...eventData,
        // Ограничиваем размер данных для производительности
        timestamp: new Date().toISOString()
      },
      errorMessage: errorMessage || null,
      createdAt: new Date().toISOString()
    }
    
    await eventsCollection.add(eventLog)
    
    // Логируем в консоль для отладки
    const logLevel = status === 'error' ? 'error' : status === 'warning' ? 'warn' : 'info'
    console[logLevel](`📊 n8n-webhook-proxy: Событие залогировано`, {
      eventType,
      status,
      hasError: !!errorMessage
    })
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка логирования n8n события', {
      eventType,
      error: error.message
    })
  }
}

/**
 * Создать уведомление пользователю в Firestore (бэкенд; обходит правила безопасности).
 * @param {Object} params - { userId, type, title, body, overview?, data? }
 * @returns {Promise<boolean>} true если создано, false при ошибке или недоступной БД
 */
async function createNotification(params) {
  if (!db) return false
  const { userId, type, title, body, overview = null, data = null } = params
  if (!userId || !type || !title || !body) return false
  try {
    const appIdForNotifications = process.env.APP_ID || 'skyputh'
    const coll = db.collection(`artifacts/${appIdForNotifications}/public/data/notifications`)
    await coll.add({
      userId: String(userId),
      type: String(type),
      title: String(title),
      body: String(body),
      overview: overview != null ? String(overview) : null,
      read: false,
      createdAt: new Date().toISOString(),
      data: data && typeof data === 'object' ? data : null
    })
    return true
  } catch (err) {
    console.error('❌ n8n-webhook-proxy: Ошибка создания уведомления', { userId, type, error: err.message })
    return false
  }
}

const APP_ID = process.env.APP_ID || 'skyputh'

// Web Push (VAPID) — для уведомлений в фоне (тикеты поддержки)
const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC || '').trim()
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE || '').trim()
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_MAILTO || 'mailto:support@skypath.fun',
      VAPID_PUBLIC,
      VAPID_PRIVATE
    )
    console.log('✅ Web Push (VAPID) настроен для уведомлений о тикетах')
  } catch (e) {
    console.warn('⚠️ Web Push VAPID не настроен:', e.message)
  }
} else {
  console.warn('⚠️ Web Push: задайте VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys)')
}

/**
 * Отправить Web Push всем подпискам пользователя (ответ поддержки). Работает при закрытой вкладке.
 */
async function sendWebPushToUser(userId, payload) {
  if (!db || !VAPID_PUBLIC || !VAPID_PRIVATE) return { sent: 0, errors: [] }
  const uid = String(userId || '').trim()
  if (!uid) return { sent: 0, errors: [] }
  const col = db.collection(`artifacts/${APP_ID}/public/data/push_subscriptions`)
  const snap = await col.where('userId', '==', uid).get()
  const errors = []
  let sent = 0
  for (const doc of snap.docs) {
    const data = doc.data()
    const sub = {
      endpoint: data.endpoint,
      keys: { p256dh: data.keys?.p256dh || data.p256dh, auth: data.keys?.auth || data.auth },
      expirationTime: data.expirationTime || null,
    }
    if (!sub.endpoint || !sub.keys.p256dh || !sub.keys.auth) continue
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 86400 })
      sent++
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        try { await doc.ref.delete() } catch (_) {}
      }
      errors.push(err.message || String(err))
    }
  }
  return { sent, errors }
}

/**
 * Проверить Firebase ID token и убедиться, что пользователь — админ (claim или роль в Firestore).
 * Возвращает { ok: true, uid } или отправляет 401/403 и возвращает { ok: false }.
 */
async function ensureAdmin(req, res) {
  if (!admin || !db) {
    res.status(503).json({ success: false, error: 'Сервис недоступен' })
    return { ok: false }
  }
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Требуется авторизация' })
    return { ok: false }
  }
  const idToken = authHeader.slice(7)
  let decoded
  try {
    decoded = await admin.auth().verifyIdToken(idToken)
  } catch (err) {
    res.status(401).json({ success: false, error: 'Неверный или истёкший токен' })
    return { ok: false }
  }
  const uid = decoded.uid
  if (decoded.admin === true) {
    return { ok: true, uid }
  }
  const clientAppId = (req.headers['x-app-id'] || req.headers['X-App-Id'] || '').trim() || null
  const appIdsToTry = [
    clientAppId,
    APP_ID,
    'skyputh',
    'skypathvpn',
    process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  ].filter(Boolean).filter((id, i, arr) => arr.indexOf(id) === i)

  const isAdminRole = (value) => String(value ?? '').trim().toLowerCase() === 'admin'

  for (const appId of appIdsToTry) {
    try {
      const userRef = db.doc(`artifacts/${appId}/public/data/users_v4/${uid}`)
      const snap = await userRef.get()
      if (snap.exists) {
        const data = snap.data()
        const role = data.role
        if (isAdminRole(role)) {
          return { ok: true, uid }
        }
        console.warn('ensureAdmin: документ найден, но role не admin', {
          appId,
          uid,
          roleFound: role,
          roleType: typeof role,
          email: data.email,
        })
      }
    } catch (err) {
      console.warn('ensureAdmin: ошибка чтения пользователя из Firestore', { uid, appId, error: err.message })
    }
  }
  // Запасной вариант: ищем по email в users_v4 (если ID документа не uid, а например uuid)
  const emailFromToken = (decoded.email || '').trim().toLowerCase()
  if (emailFromToken) {
    for (const appId of appIdsToTry) {
      try {
        const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
        const snap = await usersRef.where('email', '==', emailFromToken).limit(5).get()
        for (const doc of snap.docs) {
          const role = doc.data().role
          if (isAdminRole(role)) {
            console.log('ensureAdmin: доступ по email (документ найден по email)', { appId, docId: doc.id, uid })
            return { ok: true, uid }
          }
        }
      } catch (err) {
        console.warn('ensureAdmin: поиск по email', { appId, error: err.message })
      }
    }
  }
  // Опциональный обход: список email из env (если Firestore не нашёл роль)
  const adminEmailsRaw = process.env.ADMIN_EMAILS || ''
  if (adminEmailsRaw.trim()) {
    const email = (decoded.email || '').trim().toLowerCase()
    const allowed = adminEmailsRaw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (email && allowed.includes(email)) {
      return { ok: true, uid }
    }
  }
  console.warn('ensureAdmin: доступ запрещён (нет claim admin и нет role: admin в Firestore)', {
    uid,
    APP_ID,
    xAppId: clientAppId || '(не передан)',
    appIdsTried: appIdsToTry,
  })
  const firestorePath = `artifacts/${APP_ID}/public/data/users_v4/${uid}`
  res.status(403).json({
    success: false,
    error: 'Недостаточно прав',
    firestorePath,
    uid,
    hint: `Путь к документу: ${firestorePath}. ID документа должен быть ваш UID из Firebase Authentication (Authentication → Пользователи), не поле uuid. В документе должно быть поле role со значением "admin" (строка). Либо задайте ADMIN_EMAILS в server/.env и перезапустите backend.`,
  })
  return { ok: false }
}

/**
 * Проверить Firebase ID token (любой пользователь). Возвращает { ok: true, uid } или 401 и { ok: false }.
 */
async function verifyIdToken(req, res) {
  if (!admin) {
    res.status(503).json({ success: false, error: 'Сервис недоступен' })
    return { ok: false }
  }
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Требуется авторизация' })
    return { ok: false }
  }
  const idToken = authHeader.slice(7)
  try {
    const decoded = await admin.auth().verifyIdToken(idToken)
    return { ok: true, uid: decoded.uid }
  } catch (err) {
    res.status(401).json({ success: false, error: 'Неверный или истёкший токен' })
    return { ok: false }
  }
}

/** Сумма бонуса приглашающему за одного приглашённого (баллы). Переопределяется через REFERRAL_BONUS_AMOUNT. */
const REFERRAL_BONUS_AMOUNT = Number(process.env.REFERRAL_BONUS_AMOUNT) || 100

/**
 * Реферальная система: начисление бонуса пригласителю после регистрации приглашённого (один раз на одного).
 * POST /api/referral/process
 * Body: { referredUserId: string, inviterId: string }
 * Header: Authorization: Bearer <Firebase ID token приглашённого>
 */
app.post('/api/referral/process', async (req, res) => {
  const authResult = await verifyIdToken(req, res)
  if (!authResult.ok) return
  if (!db) {
    return res.status(503).json({ success: false, error: 'Firestore недоступен' })
  }
  const { referredUserId, inviterId } = req.body || {}
  if (!referredUserId || !inviterId || referredUserId === inviterId) {
    return res.status(400).json({
      success: false,
      error: 'Обязательны referredUserId и inviterId; приглашённый и пригласитель должны различаться'
    })
  }
  if (authResult.uid !== referredUserId) {
    return res.status(403).json({
      success: false,
      error: 'Токен должен принадлежать приглашённому пользователю'
    })
  }
  const usersCol = `artifacts/${APP_ID}/public/data/users_v4`
  const rewardsCol = `artifacts/${APP_ID}/public/data/referral_rewards`
  try {
    const referredRef = db.doc(`${usersCol}/${referredUserId}`)
    const referredSnap = await referredRef.get()
    if (!referredSnap.exists) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' })
    }
    const referredData = referredSnap.data()
    if (referredData.referredBy !== inviterId) {
      return res.status(400).json({
        success: false,
        error: 'У пользователя не указан этот пригласитель'
      })
    }
    const rewardDocId = referredUserId
    const rewardRef = db.doc(`${rewardsCol}/${rewardDocId}`)
    const rewardSnap = await rewardRef.get()
    if (rewardSnap.exists) {
      return res.json({ success: true, message: 'Бонус уже был начислен ранее' })
    }
    const inviterRef = db.doc(`${usersCol}/${inviterId}`)
    const inviterSnap = await inviterRef.get()
    if (!inviterSnap.exists) {
      return res.status(400).json({ success: false, error: 'Пригласитель не найден' })
    }
    const now = new Date().toISOString()
    const currentBalance = Number(inviterSnap.data().referralBonusBalance) || 0
    const newBalance = currentBalance + REFERRAL_BONUS_AMOUNT
    await rewardRef.set({
      inviterId,
      referredUserId,
      bonusAmount: REFERRAL_BONUS_AMOUNT,
      bonusGrantedAt: now,
    })
    await inviterRef.update({
      referralBonusBalance: newBalance,
      updatedAt: now,
    })
    console.log('Referral: бонус начислен', { inviterId, referredUserId, bonus: REFERRAL_BONUS_AMOUNT, newBalance })
    return res.json({
      success: true,
      bonusAmount: REFERRAL_BONUS_AMOUNT,
      referralBonusBalance: newBalance,
    })
  } catch (err) {
    console.error('POST /api/referral/process:', err)
    return res.status(500).json({ success: false, error: err.message || 'Ошибка сервера' })
  }
})

/**
 * Рассылка уведомлений через бэкенд (обходит Firestore rules).
 * POST /api/admin/notifications/broadcast
 * Body: { userIds: string[], type: string, title: string, body: string, overview?: string }
 * Header: Authorization: Bearer <Firebase ID token>
 */
app.post('/api/admin/notifications/broadcast', async (req, res) => {
  const authResult = await ensureAdmin(req, res)
  if (!authResult.ok) return
  if (!db) {
    return res.status(503).json({ success: false, error: 'Firestore недоступен' })
  }
  const { userIds, type, title, body, overview } = req.body || {}
  if (!Array.isArray(userIds) || userIds.length === 0 || !type || !title || !body) {
    return res.status(400).json({
      success: false,
      error: 'Обязательны: userIds (массив), type, title, body'
    })
  }
  const payload = {
    type: String(type),
    title: String(title).trim(),
    body: String(body).trim(),
    overview: overview != null ? String(overview).trim() || null : null
  }
  const baseUrl = (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host'])
    ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
    : (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')
  const linkUrl = baseUrl ? `${baseUrl}/#dashboard` : '/#dashboard'
  let sent = 0
  let failed = 0
  for (const uid of userIds) {
    if (!uid) continue
    const ok = await createNotification({
      userId: String(uid),
      ...payload
    })
    if (ok) {
      sent += 1
      const pushPayload = { title: payload.title, body: payload.body.slice(0, 200), url: linkUrl, type: 'notification', notificationType: payload.type }
      await sendWebPushToUser(String(uid), pushPayload)
    } else {
      failed += 1
    }
  }
  if (failed > 0) {
    notifyAdminError({
      source: 'broadcast',
      message: `Рассылка уведомлений: отправлено ${sent}, ошибок ${failed}`,
      severity: failed === userIds.length ? 'high' : 'medium',
    }).catch(() => {})
  }
  res.json({ success: true, sent, failed })
})

/**
 * Проверка и алерты для подписок в проблемном состоянии
 * @param {string} subscriptionId - ID подписки
 * @param {Object} subscriptionData - Данные подписки
 */
async function checkSubscriptionAlerts(subscriptionId, subscriptionData) {
  if (!db || !subscriptionId) return

  try {
    const APP_ID = process.env.APP_ID || 'skyputh'
    const alerts = []
    
    // Проверка на dead-letter состояние
    if (subscriptionData.status === 'failed') {
      alerts.push({
        type: 'dead_letter',
        severity: 'critical',
        message: `Подписка ${subscriptionId} в dead-letter состоянии после ${subscriptionData.activationAttempt || 0} попыток`,
        subscriptionId,
        userId: subscriptionData.userId,
        lastError: subscriptionData.lastActivationError
      })
    }
    
    // Проверка на превышение лимита попыток
    const maxAttempts = subscriptionData.maxActivationAttempts || 3
    if (subscriptionData.activationAttempt >= maxAttempts && subscriptionData.status === 'activating') {
      alerts.push({
        type: 'retry_overflow',
        severity: 'high',
        message: `Подписка ${subscriptionId} превысила лимит попыток активации (${subscriptionData.activationAttempt}/${maxAttempts})`,
        subscriptionId,
        userId: subscriptionData.userId,
        lastError: subscriptionData.lastActivationError
      })
    }
    
    // Проверка на долгое время в состоянии activating
    if (subscriptionData.status === 'activating') {
      const createdAt = subscriptionData.createdAt ? new Date(subscriptionData.createdAt) : null
      if (createdAt) {
        const hoursInActivating = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60)
        if (hoursInActivating > 24) {
          alerts.push({
            type: 'stuck_activating',
            severity: 'medium',
            message: `Подписка ${subscriptionId} находится в состоянии activating более 24 часов`,
            subscriptionId,
            userId: subscriptionData.userId,
            hoursInActivating: Math.round(hoursInActivating * 10) / 10
          })
        }
      }
    }
    
    // Логируем алерты и уведомляем админа (Telegram + панель ошибок)
    if (alerts.length > 0) {
      for (const alert of alerts) {
        await logN8NEvent('subscription_alert', alert, 'warning', alert.message)
        console.warn(`🚨 n8n-webhook-proxy: Алерт: ${alert.message}`, alert)
        if (alert.severity === 'critical' || alert.severity === 'high') {
          notifyAdminError({
            source: 'subscription_alert',
            message: alert.message,
            context: alert.lastError || alert.subscriptionId,
            severity: alert.severity,
            userId: subscriptionData.userId,
          }).catch(() => {})
        }
      }
    }
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка проверки алертов', {
      subscriptionId,
      error: error.message
    })
  }
}

/**
 * Retry функция с exponential backoff
 * @param {Function} fn - Функция для выполнения
 * @param {number} maxAttempts - Максимальное количество попыток
 * @param {number} baseDelayMs - Базовая задержка в миллисекундах
 * @returns {Promise<any>} Результат выполнения функции
 */
async function retryWithBackoff(fn, maxAttempts = 3, baseDelayMs = 1000) {
  let lastError = null
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      if (attempt === maxAttempts) {
        // Последняя попытка - выбрасываем ошибку
        throw error
      }
      
      // Вычисляем задержку с exponential backoff: baseDelay * 2^(attempt-1)
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1)
      
      console.log(`⚠️ n8n-webhook-proxy: Попытка ${attempt}/${maxAttempts} не удалась, повтор через ${delayMs}ms`, {
        error: error.message,
        nextAttempt: attempt + 1
      })
      
      // Ждем перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  // Не должно достичь сюда, но на всякий случай
  throw lastError
}

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
    
    // Логируем начало вызова n8n
    await logN8NEvent('n8n_webhook_call_started', {
      webhookUrl,
      method,
      hasData: !!data
    }, 'info')
    
    const response = await axios(config)
    console.log(`✅ n8n response: ${response.status}`)
    
    const responseData = response.data
    
    // Логируем успешный ответ от n8n
    await logN8NEvent('n8n_webhook_call_success', {
      webhookUrl,
      status: response.status,
      hasResponseData: !!responseData
    }, 'success')
    
    // Проверяем, не является ли успешный ответ ошибкой от n8n
    // n8n может возвращать HTTP 200, но с ошибкой в теле ответа
    if (responseData && typeof responseData === 'object') {
      // Проверяем на ошибки в ответе
      if (responseData.error || responseData.errorMessage || responseData.message) {
        const errorMsg = responseData.error || responseData.errorMessage || responseData.message
        console.warn(`⚠️ n8n вернул ошибку в успешном ответе (HTTP ${response.status}): ${errorMsg}`)
        
        // Специальная обработка для "No item to return was found"
        if (errorMsg.includes('No item to return') || errorMsg.includes('No item to return was found')) {
          // Создаем объект ошибки, который будет обработан как HTTP ошибка
          const error = new Error('No item to return was found')
          error.response = {
            status: 500,
            statusText: 'Internal Server Error',
            data: {
              error: 'No item to return was found',
              errorMessage: 'n8n workflow не вернул данные. Убедитесь, что workflow правильно настроен и возвращает paymentUrl и orderId через узел "Respond to Webhook".'
            }
          }
          
          // Логируем ошибку от n8n
          await logN8NEvent('n8n_webhook_call_error', {
            webhookUrl,
            error: 'No item to return was found',
            httpStatus: response.status
          }, 'error', 'n8n workflow не вернул данные')
          
          throw error
        }
        
        // Для других ошибок тоже выбрасываем исключение
        const error = new Error(errorMsg)
        error.response = {
          status: 500,
          statusText: 'Internal Server Error',
          data: {
            error: errorMsg,
            errorMessage: `Ошибка n8n workflow: ${errorMsg}`
          }
        }
        throw error
      }
    }
    
    return responseData
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
    
    // Логируем ошибку вызова n8n
    await logN8NEvent('n8n_webhook_call_error', {
      webhookUrl,
      method,
      errorMessage: error.message,
      errorStatus,
      errorCode: error.code
    }, 'error', error.message || 'Ошибка вызова n8n webhook')
    
    // Улучшенная обработка ошибок от n8n
    let errorMessage = error.message || 'Ошибка вызова n8n webhook'
    const n8nDetails = errorData?.n8nDetails || {}
    
    // Специальная обработка для "No item to return was found"
    if (error.message && (error.message.includes('No item to return') || error.message.includes('No item to return was found'))) {
      // Если ошибка уже обработана в блоке try (HTTP 200 с ошибкой в теле)
      if (error.response && error.response.data && error.response.data.errorMessage) {
        errorMessage = error.response.data.errorMessage
      } else {
        errorMessage = 'n8n workflow не вернул данные. Убедитесь, что workflow правильно настроен и возвращает paymentUrl и orderId через узел "Respond to Webhook".'
      }
    } else if (errorStatus === 404 || errorStatus === 500 || errorStatus === 400) {
      // Проверяем различные типы ошибок n8n
      if (errorData?.errorMessage) {
        const n8nError = errorData.errorMessage
        
        // Специальная обработка для "No item to return was found" в errorData
        if (n8nError.includes('No item to return') || n8nError.includes('No item to return was found')) {
          errorMessage = 'n8n workflow не вернул данные. Убедитесь, что workflow правильно настроен и возвращает paymentUrl и orderId через узел "Respond to Webhook".'
        } else if (n8nError.includes('Unused Respond to Webhook')) {
          // Специальная обработка для ошибки "Unused Respond to Webhook"
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
 * Health Check (простой для скриптов запуска)
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'n8n-webhook-proxy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

/**
 * Health Check (полный)
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
 * Публичный отзыв без авторизации
 * POST /api/public/review
 * Body: { author?: string, rating?: number, text: string }
 * Отзыв сохраняется в Firestore со статусом pending и затем модерируется в админке.
 * Требуется Firebase Admin: FIREBASE_PROJECT_ID + FIREBASE_SERVICE_ACCOUNT_KEY (или FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).
 */
app.post('/api/public/review', async (req, res) => {
  try {
    if (!db) {
      await initFirebaseAdmin()
    }
    if (!db) {
      console.warn('⚠️ POST /api/public/review: Firestore недоступен (настройте Firebase Admin в .env)')
      return res.status(503).json({
        success: false,
        error: 'Сервис отзывов временно недоступен. Обратитесь к администратору.',
      })
    }
    const body = req.body || {}
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const author = typeof body.author === 'string' ? body.author.trim().slice(0, 100) : ''
    let rating = Number(body.rating)
    if (!Number.isFinite(rating) || rating < 1) rating = 5
    if (rating > 5) rating = 5

    if (!text || text.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Текст отзыва обязателен (минимум 2 символа)',
      })
    }
    if (text.length > 3000) {
      return res.status(400).json({
        success: false,
        error: 'Текст отзыва не более 3000 символов',
      })
    }

    const APP_ID = process.env.APP_ID || 'skyputh'
    const reviewsRef = db.collection(`artifacts/${APP_ID}/public/data/reviews`).doc()
    const now = new Date().toISOString()
    await reviewsRef.set({
      userId: null,
      userEmail: '',
      author: author || 'Гость',
      rating,
      text,
      status: 'pending',
      createdAt: now,
    })
    console.log('✅ Публичный отзыв создан:', reviewsRef.id)
    return res.status(200).json({
      success: true,
      id: reviewsRef.id,
      message: 'Отзыв отправлен на модерацию',
    })
  } catch (err) {
    console.error('❌ POST /api/public/review:', err)
    return res.status(500).json({
      success: false,
      error: err.message || 'Не удалось отправить отзыв',
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

    // Telegram Mini App: подставляем telegram user id для сохранения в 3x-ui (не меняем текущую логику)
    const addClientPayload = { ...req.body }
    if (req.telegramUser && req.telegramUser.user && req.telegramUser.user.id) {
      addClientPayload.telegramUserId = String(req.telegramUser.user.id)
    }
    
    // Получаем webhook URL (приоритет: из запроса > из env > дефолтный)
    const webhookUrl = getWebhookUrl('addClient', req)
    console.log('📤 n8n-webhook-proxy: Отправка запроса в n8n webhook:', webhookUrl)
    const result = await callN8NWebhook(webhookUrl, addClientPayload)
    
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

    const deleteClientPayload = { ...req.body }
    if (req.telegramUser && req.telegramUser.user && req.telegramUser.user.id) {
      deleteClientPayload.telegramUserId = String(req.telegramUser.user.id)
    }
    
    // Получаем webhook URL (приоритет: из запроса > из env > дефолтный)
    const webhookUrl = getWebhookUrl('deleteClient', req)
    console.log('📤 n8n-webhook-proxy: Отправка запроса в n8n webhook:', webhookUrl)
    const result = await callN8NWebhook(webhookUrl, deleteClientPayload)
    
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

    // Telegram Mini App: добавляем telegramUserId в тело для n8n (опционально)
    const syncPayload = { ...req.body }
    if (req.telegramUser && req.telegramUser.user && req.telegramUser.user.id) {
      syncPayload.telegramUserId = String(req.telegramUser.user.id)
    }

    const webhookUrl = getWebhookUrl('syncUser', req)
    const result = await callN8NWebhook(webhookUrl, syncPayload)
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка синхронизации пользователя через n8n',
    })
  }
})

/**
 * Валидация промокода
 * POST /api/promocodes/validate
 * Body: { code: string, tariffId: string, amount: number, userId?: string }
 * Response: { valid: boolean, discount: number, discountAmount: number, message?: string, promocodeId?: string }
 * Если userId передан — проверяется, не использовал ли пользователь этот промокод ранее (1 раз на пользователя).
 */
app.post('/api/promocodes/validate', async (req, res) => {
  try {
    const { code, tariffId, amount, userId } = req.body || {}
    const codeTrimmed = typeof code === 'string' ? code.trim().toUpperCase() : ''

    if (!codeTrimmed) {
      return res.status(400).json({
        valid: false,
        discount: 0,
        discountAmount: 0,
        message: 'Введите промокод'
      })
    }

    if (!db) {
      await initFirebaseAdmin()
    }
    if (!db) {
      return res.status(503).json({
        valid: false,
        discount: 0,
        discountAmount: 0,
        message: 'Сервис временно недоступен'
      })
    }

    const promocodesRef = db.collection(`artifacts/${APP_ID}/public/data/promocodes`)
    const snapshot = await promocodesRef.where('code', '==', codeTrimmed).limit(1).get()

    if (snapshot.empty) {
      return res.json({
        valid: false,
        discount: 0,
        discountAmount: 0,
        message: 'Промокод не найден'
      })
    }

    const doc = snapshot.docs[0]
    const promo = { id: doc.id, ...doc.data() }

    if (!promo.active) {
      return res.json({
        valid: false,
        discount: 0,
        discountAmount: 0,
        message: 'Промокод неактивен'
      })
    }

    const now = new Date()
    if (promo.validFrom && new Date(promo.validFrom) > now) {
      return res.json({
        valid: false,
        discount: 0,
        discountAmount: 0,
        message: 'Промокод ещё не действует'
      })
    }
    if (promo.validUntil && new Date(promo.validUntil) < now) {
      return res.json({
        valid: false,
        discount: 0,
        discountAmount: 0,
        message: 'Срок действия промокода истёк'
      })
    }

    const maxUsages = promo.maxUsages != null ? Number(promo.maxUsages) : null
    const currentUsages = Number(promo.currentUsages || 0)
    if (maxUsages != null && currentUsages >= maxUsages) {
      return res.json({
        valid: false,
        discount: 0,
        discountAmount: 0,
        message: 'Промокод исчерпан'
      })
    }

    // Проверка: пользователь уже использовал этот промокод (1 раз на пользователя)
    if (userId && typeof userId === 'string' && userId.trim()) {
      const usedByRef = db.doc(`artifacts/${APP_ID}/public/data/promocodes/${promo.id}/usedBy/${userId.trim()}`)
      const usedBySnap = await usedByRef.get()
      if (usedBySnap.exists) {
        return res.json({
          valid: false,
          discount: 0,
          discountAmount: 0,
          message: 'Вы уже использовали этот промокод'
        })
      }
    }

    if (tariffId && promo.tariffIds && Array.isArray(promo.tariffIds) && promo.tariffIds.length > 0) {
      if (!promo.tariffIds.includes(tariffId)) {
        return res.json({
          valid: false,
          discount: 0,
          discountAmount: 0,
          message: 'Промокод не действует для выбранного тарифа'
        })
      }
    }

    const baseAmount = Number(amount) || 0
    let discountAmount = 0
    let discount = 0

    if (promo.type === 'percent') {
      const percent = Math.min(100, Math.max(0, Number(promo.value) || 0))
      discount = percent / 100
      discountAmount = baseAmount * discount
    } else if (promo.type === 'fixed') {
      const fixedValue = Math.max(0, Number(promo.value) || 0)
      discountAmount = Math.min(fixedValue, baseAmount)
      discount = baseAmount > 0 ? discountAmount / baseAmount : 0
    }

    return res.json({
      valid: true,
      discount,
      discountAmount,
      promocodeId: promo.id,
      message: promo.type === 'percent'
        ? `Скидка ${Math.round((promo.value || 0))}%`
        : `Скидка ${Math.round(discountAmount)} ₽`
    })
  } catch (err) {
    console.error('❌ n8n-webhook-proxy: Ошибка валидации промокода:', err.message)
    res.status(500).json({
      valid: false,
      discount: 0,
      discountAmount: 0,
      message: 'Ошибка проверки промокода'
    })
  }
})

/**
 * API для управления пользователями (создание через Firebase Admin + Firestore)
 * Только админ, обходит Firestore rules
 */

/** Внутренняя функция: создать одного пользователя (Auth + Firestore). Возвращает { user } или бросает. */
async function createOneUser(adminInst, dbInst, appId, payload) {
  const rawEmail = typeof payload.email === 'string' ? payload.email.trim() : ''
  const rawName = typeof payload.name === 'string' ? payload.name.trim() : ''
  const rawPassword = typeof payload.password === 'string' ? payload.password : ''
  const rawPhone = typeof payload.phone === 'string' ? payload.phone.trim() : ''
  const rawRole = typeof payload.role === 'string' ? payload.role.trim() : 'user'
  const rawPlan = typeof payload.plan === 'string' ? payload.plan.trim() : 'free'
  const rawTgId = payload.tgId != null ? String(payload.tgId).trim() : ''
  const rawTariffId = payload.tariffId != null ? String(payload.tariffId).trim() : ''
  const rawTariffName = payload.tariffName != null ? String(payload.tariffName).trim() : ''
  const rawExpiresAt = payload.expiresAt

  if (!rawEmail || !rawName || !rawPassword || rawPassword.length < 6) {
    throw new Error('Email, имя и пароль (≥6 символов) обязательны')
  }

  const email = rawEmail.toLowerCase()
  const name = rawName
  const phone = rawPhone
  const allowedRoles = ['user', 'admin', 'accountant', 'бухгалтер']
  const role = allowedRoles.includes(rawRole) ? rawRole : 'user'
  const plan = rawPlan || 'free'

  let expiresAt = null
  if (rawExpiresAt !== undefined && rawExpiresAt !== null && rawExpiresAt !== '') {
    if (typeof rawExpiresAt === 'number') {
      expiresAt = Number.isFinite(rawExpiresAt) ? rawExpiresAt : null
    } else if (typeof rawExpiresAt === 'string') {
      const ms = Date.parse(rawExpiresAt)
      expiresAt = Number.isFinite(ms) ? ms : null
    }
  }

  let createdUid = null
  const userRecord = await adminInst.auth().createUser({
    email,
    password: rawPassword,
    displayName: name,
    disabled: false,
  })
  createdUid = userRecord.uid

  try {
    const uuid = randomUUID()
    const subIdLength = 16
    const subIdChars = '0123456789abcdefghijklmnopqrstuvwxyz'
    let subId = ''
    for (let i = 0; i < subIdLength; i++) {
      subId += subIdChars[Math.floor(Math.random() * subIdChars.length)]
    }
    const nowIso = new Date().toISOString()
    const userData = {
      email,
      name,
      phone,
      role,
      plan,
      uuid,
      subId,
      expiresAt: expiresAt ?? null,
      tariffName: rawTariffName || '',
      tariffId: rawTariffId || '',
      photoURL: userRecord.photoURL || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    if (rawTgId) userData.tgId = rawTgId
    const userDocRef = dbInst.doc(`artifacts/${appId}/public/data/users_v4/${createdUid}`)
    await userDocRef.set(userData)
    return { user: { id: createdUid, ...userData } }
  } catch (e) {
    if (createdUid) {
      try { await adminInst.auth().deleteUser(createdUid) } catch (_) {}
    }
    throw e
  }
}

/** Извлечь значение из объекта по нескольким возможным ключам (регистронезависимо). */
function pickFirst(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return ''
  const lower = (s) => String(s).toLowerCase()
  for (const k of keys) {
    const found = Object.keys(obj).find((key) => lower(key) === lower(k))
    if (found != null && obj[found] !== undefined && obj[found] !== null) {
      return String(obj[found]).trim()
    }
  }
  return ''
}

/** POST /api/admin/users — создать пользователя (Firebase Auth + Firestore users_v4) */
app.post('/api/admin/users', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!admin || !db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }
  try {
    const body = req.body || {}
    const rawPassword = typeof body.password === 'string' ? body.password : ''
    if (!rawPassword || rawPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Пароль обязателен и должен содержать не менее 6 символов' })
    }
    const result = await createOneUser(admin, db, APP_ID, {
      email: body.email,
      name: body.name,
      password: body.password,
      phone: body.phone,
      role: body.role,
      plan: body.plan,
      tgId: body.tgId,
      tariffId: body.tariffId,
      tariffName: body.tariffName,
      expiresAt: body.expiresAt,
    })
    return res.status(201).json({ success: true, user: result.user })
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ success: false, error: 'Пользователь с таким email уже существует' })
    }
    console.error('❌ POST /api/admin/users:', err.message)
    return res.status(500).json({ success: false, error: err.message || 'Ошибка создания пользователя' })
  }
})

/** POST /api/admin/import-from-nocodb — получить записи из NocoDB и создать пользователей (только админ) */
app.post('/api/admin/import-from-nocodb', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!admin || !db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }

  const body = req.body || {}
  const baseUrl = (body.baseUrl || process.env.NOCODB_BASE_URL || '').toString().trim().replace(/\/+$/, '')
  const apiToken = (body.apiToken || process.env.NOCODB_API_TOKEN || '').toString().trim()
  const tableId = (body.tableId || process.env.NOCODB_TABLE_ID || '').toString().trim()
  const defaultPassword = (body.defaultPassword || process.env.IMPORT_DEFAULT_PASSWORD || '').toString()

  if (!baseUrl || !apiToken) {
    return res.status(400).json({
      success: false,
      error: 'Укажите baseUrl и apiToken (или задайте NOCODB_BASE_URL и NOCODB_API_TOKEN в .env)',
    })
  }
  if (!tableId) {
    return res.status(400).json({
      success: false,
      error: 'Укажите tableId (или задайте NOCODB_TABLE_ID в .env). Table ID можно взять из URL таблицы в NocoDB (начинается с m).',
    })
  }

  const passwordToUse = defaultPassword.length >= 6 ? defaultPassword : null
  if (!passwordToUse) {
    return res.status(400).json({
      success: false,
      error: 'Задайте пароль по умолчанию для импорта (минимум 6 символов) в поле defaultPassword или IMPORT_DEFAULT_PASSWORD в .env',
    })
  }

  try {
    const listUrl = `${baseUrl}/api/v2/tables/${tableId}/records`
    const limit = 1000
    const allRows = []
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const { data } = await axios.get(listUrl, {
        params: { limit, offset },
        headers: {
          'xc-token': apiToken,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        validateStatus: () => true,
      })
      const list = data?.list || data?.data || (Array.isArray(data) ? data : [])
      if (!Array.isArray(list) || list.length === 0) break
      allRows.push(...list)
      offset += list.length
      if (list.length < limit) hasMore = false
    }

    const created = []
    const skipped = []
    const errors = []

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i]
      const email = (pickFirst(row, 'email', 'Email', 'mail', 'E-mail') || '').toLowerCase()
      const name = pickFirst(row, 'name', 'Name', 'full_name', 'FullName', 'Имя')
      if (!email || !name) {
        skipped.push({ rowIndex: i + 1, reason: 'Нет email или имени', row: { email, name } })
        continue
      }

      const phone = pickFirst(row, 'phone', 'Phone', 'telephone', 'Телефон')
      const tgId = pickFirst(row, 'tgId', 'tg_id', 'telegram_id', 'TelegramId', 'Telegram ID')
      const roleRaw = (pickFirst(row, 'role', 'Role', 'роль') || 'user').toLowerCase()
      const planRaw = (pickFirst(row, 'plan', 'Plan', 'план') || 'free').toLowerCase()
      const allowedRoles = ['user', 'admin', 'accountant', 'бухгалтер']
      const role = allowedRoles.includes(roleRaw) ? roleRaw : 'user'
      const plan = planRaw || 'free'

      try {
        const result = await createOneUser(admin, db, APP_ID, {
          email,
          name,
          password: passwordToUse,
          phone,
          role,
          plan,
          tgId: tgId || undefined,
        })
        created.push({ email, id: result.user.id })
      } catch (err) {
        if (err.code === 'auth/email-already-exists') {
          skipped.push({ rowIndex: i + 1, email, reason: 'Уже существует' })
        } else {
          errors.push({ rowIndex: i + 1, email, error: err.message || String(err) })
        }
      }
    }

    return res.json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      errors: errors.length,
      details: { created, skipped, errors },
    })
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.msg || err.message
    console.error('❌ POST /api/admin/import-from-nocodb:', msg)
    return res.status(500).json({
      success: false,
      error: msg || 'Ошибка при запросе к NocoDB или создании пользователей',
    })
  }
})

/**
 * Модуль Telegram: привязка аккаунта, уведомления, напоминания.
 * Токен: из TELEGRAM_BOT_TOKEN (env) или из Firestore (настройки в админке).
 */
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET || ''
let telegramTokenCache = { token: null, expiresAt: 0 }
const TELEGRAM_CACHE_TTL_MS = 60 * 1000

/**
 * Токен бота: приоритет 1) TELEGRAM_BOT_TOKEN (env), 2) кэш, 3) Firestore (artifacts/APP_ID/public/settings.telegramBotToken).
 * Используется для webhook привязки, уведомлений об оплате, send-reminders и тестовых сообщений.
 */
async function getTelegramToken() {
  const fromEnv = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()
  if (fromEnv) return fromEnv
  if (telegramTokenCache.token && Date.now() < telegramTokenCache.expiresAt) {
    return telegramTokenCache.token
  }
  if (!db) return ''
  try {
    const snap = await db.doc(`artifacts/${APP_ID}/public/settings`).get()
    const token = (snap.exists && snap.data().telegramBotToken) ? String(snap.data().telegramBotToken).trim() : ''
    if (token) {
      telegramTokenCache = { token, expiresAt: Date.now() + TELEGRAM_CACHE_TTL_MS }
    }
    return token
  } catch {
    return ''
  }
}

// ——— Telegram Webhook: проверка secret_token (если задан TELEGRAM_WEBHOOK_SECRET) ———
const verifyTelegramWebhookSecret = (req, res, next) => {
  const secret = TELEGRAM_WEBHOOK_SECRET && TELEGRAM_WEBHOOK_SECRET.trim()
  if (!secret) return next()
  const received = req.headers['x-telegram-bot-api-secret-token'] || ''
  if (received !== secret) {
    console.warn('⚠️ Telegram webhook: неверный secret_token')
    return res.status(401).send()
  }
  next()
}

/** Базовый URL для кнопки Mini App (без слэша в конце) */
function getBaseUrlForTelegram() {
  return (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').toString().trim().replace(/\/+$/, '') || null
}

/** Отправить главное меню с кнопкой «Открыть панель» (Web App) */
async function sendMainMenu(botToken, chatId) {
  const baseUrl = getBaseUrlForTelegram()
  const appUrl = baseUrl ? `${baseUrl}/` : null
  const text = `🚀 <b>VPN Панель</b>\n\n<b>Доступные действия:</b>\n• Создать VPN конфиг\n• Управлять подписками\n• Статистика трафика`
  const replyMarkup = appUrl
    ? { inline_keyboard: [[{ text: '🛠️ Открыть панель', web_app: { url: appUrl } }]] }
    : null
  await sendTelegramMessage(botToken, chatId, text, { reply_markup: replyMarkup })
}

/**
 * Обработка данных из Mini App (message.web_app_data) → при необходимости вызов n8n/3x-ui
 * data.action: create_vpn | delete_vpn | и т.д.; данные передаются в n8n как есть, с telegramUserId
 */
async function handleMiniAppData(botToken, message) {
  const chatId = message.chat?.id
  const fromId = String(message.from?.id || '')
  if (!message.web_app_data?.data) return
  let data
  try {
    data = typeof message.web_app_data.data === 'string'
      ? JSON.parse(message.web_app_data.data)
      : message.web_app_data.data
  } catch (e) {
    await sendTelegramMessage(botToken, chatId, 'Ошибка формата данных.')
    return
  }
  const action = data.action || data.action_type
  console.log('📨 Telegram Mini App data:', { fromId, action })

  // Найти userId по tgId (привязка в ЛК)
  let userId = null
  if (db) {
    try {
      const snap = await db.collection(`artifacts/${APP_ID}/public/data/users_v4`)
        .where('tgId', '==', fromId)
        .limit(1)
        .get()
      if (!snap.empty) userId = snap.docs[0].id
    } catch (e) {
      console.warn('handleMiniAppData: поиск пользователя по tgId', e.message)
    }
  }

  const emptyReq = { body: {}, headers: {} }
  const webhookUrl = getWebhookUrl('addClient', emptyReq)
  const payload = {
    ...data,
    telegramUserId: fromId,
    userId: userId || undefined,
  }

  try {
    if (action === 'create_vpn' || action === 'add_client') {
      await callN8NWebhook(webhookUrl, { ...payload, operation: 'add_client' })
      await sendTelegramMessage(botToken, chatId, '✅ Запрос на создание VPN отправлен.')
    } else if (action === 'delete_vpn' || action === 'delete_client') {
      const deleteUrl = getWebhookUrl('deleteClient', emptyReq)
      await callN8NWebhook(deleteUrl, { ...payload, operation: 'delete_client' })
      await sendTelegramMessage(botToken, chatId, '🗑️ Запрос на удаление конфига отправлен.')
    } else {
      // Любой другой action — пробрасываем в n8n для кастомной логики
      await callN8NWebhook(webhookUrl, payload)
      await sendTelegramMessage(botToken, chatId, '✅ Данные получены.')
    }
  } catch (err) {
    console.error('❌ handleMiniAppData:', err.message)
    await sendTelegramMessage(botToken, chatId, `Ошибка: ${err.message || 'Попробуйте позже.'}`)
  }
}

/** Обработка callback от inline-кнопок */
async function handleCallbackQuery(botToken, callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id
  const fromId = String(callbackQuery.from?.id || '')
  const data = callbackQuery.data || ''
  const id = callbackQuery.id
  await answerCallbackQuery(botToken, id, { text: 'Ок' })
  if (data === 'open_panel' || data === 'menu') {
    await sendMainMenu(botToken, chatId)
  }
}

/** POST /api/telegram/webhook — единая точка входа: привязка, команды, Mini App, callback_query */
app.post('/api/telegram/webhook', verifyTelegramWebhookSecret, express.json(), async (req, res) => {
  const update = req.body
  res.status(200).send()
  if (!update) return

  const botToken = await getTelegramToken()
  if (!botToken) return

  try {
    if (update.callback_query) {
      await handleCallbackQuery(botToken, update.callback_query)
      return
    }

    const message = update.message || update.edited_message
    if (!message || !message.from) return

    const chatId = message.chat?.id
    const fromId = String(message.from.id)
    const text = (message.text || '').trim()

    if (message.web_app_data) {
      await handleMiniAppData(botToken, message)
      return
    }

    if (text.startsWith('/start ')) {
      const token = text.slice(7).trim()
      if (!token || !db) return
      try {
        const bindRef = db.doc(`artifacts/${APP_ID}/public/data/telegram_binds/${token}`)
        const snap = await bindRef.get()
        if (!snap.exists) {
          await sendTelegramMessage(botToken, chatId, 'Ссылка привязки недействительна или истекла. Получите новую в личном кабинете.')
          return
        }
        const { userId, expiresAt } = snap.data()
        if (expiresAt && Date.now() > expiresAt) {
          await bindRef.delete()
          await sendTelegramMessage(botToken, chatId, 'Ссылка привязки истекла. Получите новую в личном кабинете.')
          return
        }
        const userRef = db.doc(`artifacts/${APP_ID}/public/data/users_v4/${userId}`)
        await userRef.update({ tgId: fromId, updatedAt: new Date().toISOString() })
        await bindRef.delete()
        await sendTelegramMessage(botToken, chatId, '✅ Аккаунт успешно привязан к Telegram. Вы будете получать уведомления об оплате и напоминания о продлении подписки.')
        console.log('✅ Telegram: пользователь привязан', { userId, tgId: fromId })
      } catch (err) {
        console.error('❌ Telegram webhook bind:', err.message)
        await sendTelegramMessage(botToken, chatId, 'Ошибка привязки. Попробуйте позже или обратитесь в поддержку.')
      }
      return
    }

    if (text === '/start') {
      await sendMainMenu(botToken, chatId)
      await sendTelegramMessage(botToken, chatId, 'Чтобы привязать аккаунт SKYFLOW: личный кабинет → Профиль → Telegram → «Привязать».')
      return
    }

    if (text === '/menu') {
      await sendMainMenu(botToken, chatId)
      return
    }
  } catch (err) {
    console.error('❌ Telegram webhook:', err.message)
  }
})

/** GET /api/telegram/bind-link — ссылка для привязки (авторизованный пользователь) */
app.get('/api/telegram/bind-link', async (req, res) => {
  const authResult = await verifyIdToken(req, res)
  if (!authResult?.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  const botToken = await getTelegramToken()
  if (!botToken) return res.status(503).json({ success: false, error: 'Telegram-бот не настроен' })
  try {
    const token = randomUUID().replace(/-/g, '').slice(0, 24)
    const expiresAt = Date.now() + 15 * 60 * 1000
    const bindRef = db.doc(`artifacts/${APP_ID}/public/data/telegram_binds/${token}`)
    await bindRef.set({ userId: authResult.uid, expiresAt, createdAt: new Date().toISOString() })
    const botInfo = await getTelegramBotInfo(botToken)
    const username = botInfo.username || 'YourBot'
    res.json({ success: true, link: `https://t.me/${username}?start=${token}`, expiresIn: 900 })
  } catch (err) {
    console.error('❌ GET /api/telegram/bind-link:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** POST /api/telegram/unbind — отвязать Telegram */
app.post('/api/telegram/unbind', async (req, res) => {
  const authResult = await verifyIdToken(req, res)
  if (!authResult?.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  try {
    const userRef = db.doc(`artifacts/${APP_ID}/public/data/users_v4/${authResult.uid}`)
    await userRef.update({ tgId: null, updatedAt: new Date().toISOString() })
    res.json({ success: true })
  } catch (err) {
    console.error('❌ POST /api/telegram/unbind:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** POST /api/telegram/send-reminders — напоминания об истечении (cron; секрет в заголовке) */
app.post('/api/telegram/send-reminders', express.json(), async (req, res) => {
  const secret = req.headers['x-telegram-secret'] || req.body?.secret || ''
  if (TELEGRAM_WEBHOOK_SECRET && secret !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, error: 'Неверный секрет' })
  }
  const botToken = await getTelegramToken()
  if (!db || !botToken) return res.status(200).json({ success: true, sent: 0, message: 'Telegram не настроен' })
  try {
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    const inSevenDays = now + 7 * oneDay
    const inOneDay = now + oneDay
    const usersSnap = await db.collection(`artifacts/${APP_ID}/public/data/users_v4`).get()
    let sent = 0
    for (const doc of usersSnap.docs) {
      const u = doc.data()
      const tgId = u.tgId && String(u.tgId).trim()
      if (!tgId) continue
      const exp = u.expiresAt ? (typeof u.expiresAt === 'number' ? u.expiresAt : new Date(u.expiresAt).getTime()) : 0
      if (exp <= 0 || exp > inSevenDays) continue
      const tariffName = u.tariffName || 'Подписка'
      const daysLeft = Math.floor((exp - now) / oneDay)
      let text
      if (exp <= now) text = `⚠️ Подписка «${tariffName}» истекла. Оплатите продление в личном кабинете.`
      else if (exp <= inOneDay) text = `⏰ Подписка «${tariffName}» истекает сегодня! Оплатите продление в личном кабинете.`
      else text = `📅 Подписка «${tariffName}» истекает через ${daysLeft} дн. Оплатите продление в личном кабинете.`
      const result = await sendTelegramMessage(botToken, tgId, text)
      if (result.ok) sent++
    }
    res.json({ success: true, sent })
  } catch (err) {
    console.error('❌ POST /api/telegram/send-reminders:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** GET /api/admin/telegram/status — текущие настройки (только админ). Токен не возвращаем; отдаём username бота и Chat ID админа для отображения. */
app.get('/api/admin/telegram/status', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const token = await getTelegramToken()
  const adminChatId = await getTelegramAdminChatId()
  let botUsername = null
  if (token && token.trim()) {
    try {
      const info = await getTelegramBotInfo(token)
      if (info.ok && info.username) botUsername = info.username
    } catch (_) {}
  }
  res.json({
    success: true,
    configured: Boolean(token && token.trim()),
    adminChatIdSet: Boolean(adminChatId && adminChatId.trim()),
    adminChatId: adminChatId && adminChatId.trim() ? adminChatId.trim() : null,
    botUsername: botUsername || null,
  })
})

/** PATCH /api/admin/telegram/settings — сохранить токен бота в Firestore (только админ). Быстрая настройка без .env.
 * Сохранённый токен используется для: webhook привязки, уведомлений об оплате, напоминаний (send-reminders), тестовых сообщений.
 */
app.patch('/api/admin/telegram/settings', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  const body = req.body || {}
  const token = (body.token != null) ? String(body.token).trim() : undefined
  const adminChatId = (body.adminChatId != null) ? String(body.adminChatId).trim() : undefined
  try {
    const settingsRef = db.doc(`artifacts/${APP_ID}/public/settings`)
    const update = {}
    if (token !== undefined) {
      update.telegramBotToken = token || null
      update.telegramBotTokenUpdatedAt = new Date().toISOString()
      telegramTokenCache = { token: null, expiresAt: 0 }
    }
    if (adminChatId !== undefined) {
      update.telegramAdminChatId = adminChatId || null
    }
    if (Object.keys(update).length) {
      await settingsRef.set(update, { merge: true })
      if (token !== undefined) {
        console.log('✅ Telegram: токен сохранён в Firestore (artifacts/%s/public/settings). Будет использоваться для уведомлений и привязки.', APP_ID)
      }
      if (adminChatId !== undefined) {
        console.log('✅ Telegram: adminChatId для уведомлений о тикетах сохранён в Firestore.')
      }
    }
    res.json({ success: true, configured: Boolean(token !== undefined ? token : (await getTelegramToken())), savedTo: 'firestore' })
  } catch (err) {
    console.error('❌ PATCH /api/admin/telegram/settings:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** POST /api/admin/telegram/set-webhook — установить webhook в Telegram (secret_token + allowed_updates) */
app.post('/api/admin/telegram/set-webhook', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const botToken = await getTelegramToken()
  if (!botToken) return res.status(400).json({ success: false, error: 'Сначала сохраните токен бота' })
  const baseUrl = req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
    ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
    : (process.env.PUBLIC_URL || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`)
  const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/telegram/webhook`
  const opts = {
    allowed_updates: ['message', 'callback_query'],
    secret_token: TELEGRAM_WEBHOOK_SECRET && TELEGRAM_WEBHOOK_SECRET.trim() ? TELEGRAM_WEBHOOK_SECRET.trim() : undefined,
  }
  try {
    const result = await setTelegramWebhook(botToken, webhookUrl, opts)
    if (!result.ok) return res.status(400).json({ success: false, error: result.error || 'Ошибка Telegram API' })
    res.json({ success: true, webhookUrl, secretTokenSet: Boolean(opts.secret_token) })
  } catch (err) {
    console.error('❌ POST /api/admin/telegram/set-webhook:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** GET /api/admin/telegram/webhook-status — информация о текущем webhook (только админ) */
app.get('/api/admin/telegram/webhook-status', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const botToken = await getTelegramToken()
  if (!botToken) return res.status(400).json({ success: false, error: 'Токен бота не настроен' })
  try {
    const result = await getTelegramWebhookInfo(botToken)
    if (!result.ok) return res.status(400).json({ success: false, error: result.error })
    res.json({ success: true, webhookInfo: result.result })
  } catch (err) {
    console.error('❌ GET /api/admin/telegram/webhook-status:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** GET /api/admin/telegram/chat-info — данные чата/аккаунта по сохранённому Chat ID админа (только админ) */
app.get('/api/admin/telegram/chat-info', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const botToken = await getTelegramToken()
  const adminChatId = await getTelegramAdminChatId()
  if (!botToken || !adminChatId || !adminChatId.trim()) {
    return res.json({ success: true, chat: null, error: null })
  }
  try {
    const result = await getTelegramChat(botToken, adminChatId.trim())
    if (!result.ok) {
      return res.json({ success: true, chat: null, error: result.error || 'Не удалось получить данные чата' })
    }
    res.json({ success: true, chat: result.chat, error: null })
  } catch (err) {
    console.error('❌ GET /api/admin/telegram/chat-info:', err.message)
    res.json({ success: true, chat: null, error: err.message })
  }
})

/** POST /api/admin/telegram/send-test — отправить тестовое уведомление на указанный Telegram ID (только админ) */
app.post('/api/admin/telegram/send-test', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const botToken = await getTelegramToken()
  if (!botToken) return res.status(400).json({ success: false, error: 'Сначала сохраните токен бота' })
  const chatId = (req.body && req.body.chatId != null) ? String(req.body.chatId).trim() : ''
  if (!chatId) return res.status(400).json({ success: false, error: 'Укажите chatId (Telegram ID получателя)' })
  try {
    const result = await sendTelegramMessage(
      botToken,
      chatId,
      '🔔 Тестовое уведомление от SKYFLOW. Интеграция Telegram работает.',
    )
    if (!result.ok) return res.status(400).json({ success: false, error: result.error || 'Ошибка отправки' })
    res.json({ success: true, message: 'Тестовое сообщение отправлено' })
  } catch (err) {
    console.error('❌ POST /api/admin/telegram/send-test:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** Chat ID админа для уведомлений о тикетах: env TELEGRAM_ADMIN_CHAT_ID или Firestore settings.telegramAdminChatId */
async function getTelegramAdminChatId() {
  const fromEnv = process.env.TELEGRAM_ADMIN_CHAT_ID && String(process.env.TELEGRAM_ADMIN_CHAT_ID).trim()
  if (fromEnv) return fromEnv
  if (!db) return ''
  try {
    const snap = await db.doc(`artifacts/${APP_ID}/public/settings`).get()
    const id = (snap.exists && snap.data().telegramAdminChatId) ? String(snap.data().telegramAdminChatId).trim() : ''
    return id
  } catch {
    return ''
  }
}

function escapeHtml(s) {
  if (typeof s !== 'string') return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const ADMIN_ERRORS_LIMIT = 500

/**
 * Уведомить админа об ошибке: запись в Firestore + Telegram (если настроен).
 * @param {Object} opts - { source, message, context?, stack?, severity?, userId? }
 * @returns {Promise<{ id: string, telegramSent: boolean }>}
 */
async function notifyAdminError(opts) {
  const source = String(opts.source || 'server').slice(0, 64)
  const message = String(opts.message || 'Ошибка').slice(0, 1000)
  const context = opts.context != null ? String(opts.context).slice(0, 500) : null
  const stack = opts.stack != null ? String(opts.stack).slice(0, 2000) : null
  const severity = ['low', 'medium', 'high', 'critical'].includes(opts.severity) ? opts.severity : 'medium'
  const userId = opts.userId != null ? String(opts.userId).slice(0, 128) : null
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  let telegramSent = false

  if (db) {
    try {
      const col = db.collection(`artifacts/${APP_ID}/public/data/admin_errors`)
      await col.doc(id).set({
        source,
        message,
        context: context || null,
        stack: stack || null,
        severity,
        userId: userId || null,
        telegramSent: false,
        createdAt,
      })
      const snapshot = await col.orderBy('createdAt', 'desc').get()
      if (snapshot.docs.length > ADMIN_ERRORS_LIMIT) {
        const toDelete = snapshot.docs.slice(ADMIN_ERRORS_LIMIT)
        for (const doc of toDelete) {
          await doc.ref.delete().catch(() => {})
        }
      }
    } catch (err) {
      console.error('❌ notifyAdminError: не удалось записать в Firestore', err.message)
    }
  }

  const botToken = await getTelegramToken()
  const adminChatId = await getTelegramAdminChatId()
  if (botToken && adminChatId) {
    const ctxLine = context ? `\n📋 ${escapeHtml(context)}` : ''
    const text = `🚨 <b>Ошибка</b> [${escapeHtml(severity)}]\n\n${escapeHtml(source)}\n\n${escapeHtml(message)}${ctxLine}`
    const result = await sendTelegramMessage(botToken, adminChatId, text)
    if (result.ok) {
      telegramSent = true
      if (db) {
        try {
          await db.doc(`artifacts/${APP_ID}/public/data/admin_errors/${id}`).update({ telegramSent: true })
        } catch (_) {}
      }
      console.log('📨 Уведомление об ошибке отправлено админу в Telegram', { source, id })
    }
  }

  return { id, telegramSent }
}

/**
 * POST /api/notify/support-ticket — уведомление админу в Telegram (новый тикет или новое сообщение от пользователя).
 * Вызывается с фронта после createTicket или addMessage(from=user). Без авторизации (CORS + только наш фронт).
 */
app.post('/api/notify/support-ticket', express.json(), async (req, res) => {
  const botToken = await getTelegramToken()
  const adminChatId = await getTelegramAdminChatId()
  if (!botToken || !adminChatId) {
    return res.status(200).json({ success: true, sent: false, reason: 'Telegram не настроен для админа' })
  }
  const { type, ticketId, userEmail, userName, subject, text } = req.body || {}
  const tid = (ticketId ?? '').toString().trim()
  const uEmail = (userEmail ?? '').toString().trim()
  const uName = (userName ?? '').toString().trim() || uEmail || 'Пользователь'
  const subj = (subject ?? '').toString().trim()
  const msgText = (text ?? '').toString().trim().slice(0, 300)
  const ticketLine = tid ? `\n🆔 ID: <code>${escapeHtml(tid)}</code>` : ''
  let telegramText
  if (type === 'new_ticket') {
    telegramText = `🆕 <b>Новый тикет</b>${ticketLine}\n\n👤 ${escapeHtml(uName)}${uEmail ? ` (${uEmail})` : ''}\n📌 ${escapeHtml(subj) || '—'}\n\n${escapeHtml(msgText) || '—'}`
  } else if (type === 'new_message_user') {
    telegramText = `💬 <b>Новое сообщение в тикете</b>${ticketLine}\n\n👤 ${escapeHtml(uName)}${uEmail ? ` (${uEmail})` : ''}\n📌 ${escapeHtml(subj) || '—'}\n\n${escapeHtml(msgText) || '—'}`
  } else {
    return res.status(400).json({ success: false, error: 'Укажите type: new_ticket или new_message_user' })
  }
  try {
    const result = await sendTelegramMessage(botToken, adminChatId, telegramText)
    if (result.ok) {
      console.log('📨 Уведомление о тикете отправлено админу в Telegram', { type, ticketId })
      return res.json({ success: true, sent: true })
    }
    return res.status(500).json({ success: false, error: result.error || 'Ошибка Telegram' })
  } catch (err) {
    console.error('❌ POST /api/notify/support-ticket:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/** GET /api/push-vapid-public — публичный ключ VAPID для подписки на push (без авторизации). */
app.get('/api/push-vapid-public', (req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ success: false, error: 'Web Push не настроен' })
  res.json({ success: true, publicKey: VAPID_PUBLIC })
})

/** POST /api/push-subscribe — сохранить подписку на push (авторизованный пользователь). Для уведомлений о тикетах в фоне. */
app.post('/api/push-subscribe', express.json(), async (req, res) => {
  const authResult = await verifyIdToken(req, res)
  if (!authResult?.ok) return
  const uid = authResult.uid
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  const subscription = req.body?.subscription
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ success: false, error: 'Укажите subscription (endpoint, keys)' })
  }
  const keys = subscription.keys || {}
  const p256dh = (keys.p256dh || keys.p256dh || '').toString().trim()
  const auth = (keys.auth || '').toString().trim()
  if (!p256dh || !auth) return res.status(400).json({ success: false, error: 'В subscription должны быть keys.p256dh и keys.auth' })
  try {
    const col = db.collection(`artifacts/${APP_ID}/public/data/push_subscriptions`)
    const id = crypto.createHash('sha256').update(subscription.endpoint + uid).digest('hex').slice(0, 32)
    await col.doc(id).set({
      userId: uid,
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime || null,
      keys: { p256dh: p256dh, auth },
      createdAt: new Date().toISOString(),
    }, { merge: true })
    return res.json({ success: true, saved: true })
  } catch (err) {
    console.error('❌ POST /api/push-subscribe:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/** POST /api/report-error — принять отчёт об ошибке с фронта или из сервисов, записать и уведомить админа (Telegram). */
app.post('/api/report-error', express.json(), async (req, res) => {
  const body = req.body || {}
  const message = (body.message != null ? String(body.message) : '').trim() || 'Ошибка'
  const source = (body.source != null ? String(body.source) : 'frontend').slice(0, 64)
  const context = body.context != null ? String(body.context).slice(0, 500) : null
  const stack = body.stack != null ? String(body.stack).slice(0, 2000) : null
  const severity = ['low', 'medium', 'high', 'critical'].includes(body.severity) ? body.severity : 'medium'
  let userId = null
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ') && admin) {
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.slice(7))
      userId = decoded.uid
    } catch (_) {}
  }
  try {
    const result = await notifyAdminError({ source, message, context, stack, severity, userId })
    return res.status(200).json({ success: true, id: result.id, telegramSent: result.telegramSent })
  } catch (err) {
    console.error('❌ POST /api/report-error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/** GET /api/admin/errors — список последних ошибок для админа (только админ). */
app.get('/api/admin/errors', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200)
  try {
    const snap = await db
      .collection(`artifacts/${APP_ID}/public/data/admin_errors`)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()
    const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    return res.json({ success: true, errors: list })
  } catch (err) {
    console.error('❌ GET /api/admin/errors:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * POST /api/notify/support-reply — уведомление пользователю об ответе поддержки: Telegram (если привязан) + Web Push (в фоне).
 * Вызывается с фронта после addMessage(from=support) или createTicketAsAdmin.
 */
app.post('/api/notify/support-reply', express.json(), async (req, res) => {
  const { userId, ticketId, subject, text } = req.body || {}
  const uid = (userId ?? '').toString().trim()
  const tid = (ticketId ?? '').toString().trim()
  if (!uid) return res.status(400).json({ success: false, error: 'Укажите userId' })
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })

  const baseUrl = req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
    ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
    : (process.env.PUBLIC_URL || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`)
  const appRoot = baseUrl.replace(/\/$/, '')
  const linkPath = tid ? `/#support?ticket=${encodeURIComponent(tid)}` : '/#support'
  const linkUrl = `${appRoot}${linkPath}`
  const subj = (subject ?? '').toString().trim()
  const msgText = (text ?? '').toString().trim().slice(0, 200)
  const pushPayload = { title: 'Ответ поддержки', body: msgText || 'Новое сообщение в обращении', url: linkUrl, ticketId: tid, type: 'support-reply' }

  let telegramSent = false
  let webPushSent = 0

  try {
    const botToken = await getTelegramToken()
    const userSnap = await db.doc(`artifacts/${APP_ID}/public/data/users_v4/${uid}`).get()
    const tgId = (userSnap.exists && userSnap.data().tgId) ? String(userSnap.data().tgId).trim() : ''

    if (botToken && tgId) {
      const safeHref = linkUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      const telegramText = `📩 <b>Ответ поддержки</b>\n\nТема: ${escapeHtml(subj) || 'Обращение'}\n\n${escapeHtml(msgText) || '—'}\n\n🔗 <a href="${safeHref}">Открыть обращение в личном кабинете</a>`
      const result = await sendTelegramMessage(botToken, tgId, telegramText)
      if (result.ok) {
        telegramSent = true
        console.log('📨 Уведомление об ответе поддержки отправлено в Telegram', { userId: uid, ticketId: tid })
      }
    }

    const pushResult = await sendWebPushToUser(uid, pushPayload)
    webPushSent = pushResult.sent
    if (pushResult.sent > 0) {
      console.log('📨 Web Push отправлен пользователю (тикет)', { userId: uid, ticketId: tid, count: pushResult.sent })
    }
    if (pushResult.errors?.length) {
      pushResult.errors.forEach((e) => console.warn('Web Push ошибка:', e))
    }

    const sent = telegramSent || webPushSent > 0
    return res.status(200).json({
      success: true,
      sent,
      telegram: telegramSent,
      webPush: webPushSent,
      reason: sent ? null : (tgId ? 'Ошибка Telegram' : 'Включите уведомления в браузере или привяжите Telegram'),
    })
  } catch (err) {
    console.error('❌ POST /api/notify/support-reply:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * API для управления промокодами (только админ, обходит Firestore rules)
 * Использует Firebase Admin SDK
 */

/** GET /api/admin/promocodes — список промокодов */
app.get('/api/admin/promocodes', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }
  try {
    const snap = await db.collection(`artifacts/${APP_ID}/public/data/promocodes`).get()
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    res.json({ success: true, promocodes: list })
  } catch (err) {
    console.error('❌ GET /api/admin/promocodes:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** POST /api/admin/promocodes — создать промокод */
app.post('/api/admin/promocodes', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }
  try {
    const data = req.body || {}
    const docData = {
      code: (data.code || '').trim().toUpperCase(),
      type: data.type || 'percent',
      value: Number(data.value) || 0,
      tariffIds: Array.isArray(data.tariffIds) ? data.tariffIds : null,
      active: data.active !== false,
      maxUsages: data.maxUsages != null ? Number(data.maxUsages) : null,
      currentUsages: 0,
      validFrom: data.validFrom || null,
      validUntil: data.validUntil || null,
      description: data.description || null,
      createdAt: new Date().toISOString(),
      createdBy: adminOk.uid || null,
    }
    if (!docData.code) {
      return res.status(400).json({ success: false, error: 'Код промокода обязателен' })
    }
    const ref = await db.collection(`artifacts/${APP_ID}/public/data/promocodes`).add(docData)
    res.json({ success: true, id: ref.id, ...docData })
  } catch (err) {
    console.error('❌ POST /api/admin/promocodes:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** PATCH /api/admin/promocodes/:id — обновить промокод */
app.patch('/api/admin/promocodes/:id', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }
  try {
    const { id } = req.params
    const data = req.body || {}
    const ref = db.doc(`artifacts/${APP_ID}/public/data/promocodes/${id}`)
    const snap = await ref.get()
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: 'Промокод не найден' })
    }
    const updates = {}
    if (data.code != null) updates.code = String(data.code).trim().toUpperCase()
    if (data.type != null) updates.type = data.type
    if (data.value != null) updates.value = Number(data.value)
    if (data.tariffIds !== undefined) updates.tariffIds = Array.isArray(data.tariffIds) ? data.tariffIds : null
    if (data.active !== undefined) updates.active = Boolean(data.active)
    if (data.maxUsages !== undefined) updates.maxUsages = data.maxUsages != null ? Number(data.maxUsages) : null
    if (data.validFrom !== undefined) updates.validFrom = data.validFrom || null
    if (data.validUntil !== undefined) updates.validUntil = data.validUntil || null
    if (data.description !== undefined) updates.description = data.description || null
    updates.updatedAt = new Date().toISOString()
    await ref.update(updates)
    res.json({ success: true, id, ...updates })
  } catch (err) {
    console.error('❌ PATCH /api/admin/promocodes/:id:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** DELETE /api/admin/promocodes/:id — удалить промокод */
app.delete('/api/admin/promocodes/:id', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }
  try {
    const { id } = req.params
    const ref = db.doc(`artifacts/${APP_ID}/public/data/promocodes/${id}`)
    const snap = await ref.get()
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: 'Промокод не найден' })
    }
    await ref.delete()
    res.json({ success: true, id })
  } catch (err) {
    console.error('❌ DELETE /api/admin/promocodes/:id:', err.message)
    res.status(500).json({ success: false, error: err.message })
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
    
    let result
    try {
      result = await callN8NWebhook(webhookUrl, paymentData)
    } catch (webhookError) {
      // Обрабатываем ошибки от callN8NWebhook
      console.error('❌ n8n-webhook-proxy: Ошибка вызова n8n webhook:', {
        message: webhookError.message,
        status: webhookError.response?.status,
        statusText: webhookError.response?.statusText,
        errorData: webhookError.response?.data,
        stack: webhookError.stack?.substring(0, 500)
      })
      
      // Если ошибка уже содержит response.data с errorMessage, используем его
      if (webhookError.response?.data?.errorMessage) {
        return res.status(webhookError.response.status || 500).json({
          success: false,
          error: webhookError.response.data.errorMessage
        })
      }
      
      // Иначе используем стандартную обработку
      const errorMsg = webhookError.message || 'Ошибка вызова n8n workflow'
      return res.status(webhookError.response?.status || 500).json({
        success: false,
        error: errorMsg.includes('No item to return') 
          ? 'n8n workflow не вернул данные. Убедитесь, что workflow правильно настроен и возвращает paymentUrl и orderId через узел "Respond to Webhook".'
          : errorMsg
      })
    }
    
    console.log('✅ n8n-webhook-proxy: Получен ответ от n8n для генерации ссылки:', {
      hasResult: !!result,
      resultType: typeof result,
      isArray: Array.isArray(result),
      resultLength: Array.isArray(result) ? result.length : undefined,
      resultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
      hasError: !!(result?.error || result?.errorMessage || result?.message),
      errorMessage: result?.error || result?.errorMessage || result?.message,
      hasPaymentUrl: Array.isArray(result) ? !!result[0]?.paymentUrl : !!result?.paymentUrl,
      hasOrderId: Array.isArray(result) ? !!result[0]?.orderId : !!result?.orderId,
      fullResult: JSON.stringify(result, null, 2).substring(0, 2000)
    })

    // Проверяем, что result не пустой и не является ошибкой
    if (!result) {
      console.error('❌ n8n-webhook-proxy: n8n вернул пустой ответ')
      return res.status(500).json({
        success: false,
        error: 'n8n workflow вернул пустой ответ. Проверьте конфигурацию workflow.',
      })
    }

    // Проверяем на ошибки от n8n
    if (result.error || result.errorMessage || result.message) {
      const errorMsg = result.error || result.errorMessage || result.message
      console.error('❌ n8n-webhook-proxy: n8n вернул ошибку:', errorMsg)
      
      // Специальная обработка для ошибки "No item to return was found"
      if (errorMsg.includes('No item to return') || errorMsg.includes('No item to return was found')) {
        return res.status(500).json({
          success: false,
          error: 'n8n workflow не вернул данные. Убедитесь, что workflow правильно настроен и возвращает paymentUrl и orderId.',
        })
      }
      
      return res.status(500).json({
        success: false,
        error: `Ошибка n8n workflow: ${errorMsg}`,
      })
    }
    
    // callN8NWebhook возвращает данные из response.data
    // n8n может вернуть массив или объект, поэтому обрабатываем оба случая
    let responseData = null
    
    if (Array.isArray(result)) {
      if (result.length === 0) {
        console.error('❌ n8n-webhook-proxy: n8n вернул пустой массив')
        return res.status(500).json({
          success: false,
          error: 'n8n workflow вернул пустой массив. Проверьте конфигурацию workflow.',
        })
      }
      
      // Если ответ - массив, берем первый элемент
      // n8n может возвращать [{ json: { paymentUrl: ... } }] или [{ paymentUrl: ... }]
      const firstItem = result[0] || result.find(item => item?.paymentUrl || item?.json?.paymentUrl || item?.orderId || item?.json?.orderId)
      
      if (!firstItem) {
        console.error('❌ n8n-webhook-proxy: Не найдены данные платежа в ответе n8n:', {
          resultLength: result.length,
          firstItemKeys: result[0] ? Object.keys(result[0]) : [],
          resultPreview: JSON.stringify(result).substring(0, 500)
        })
        return res.status(500).json({
          success: false,
          error: 'n8n workflow не вернул данные платежа. Убедитесь, что workflow возвращает paymentUrl и orderId.',
        })
      }
      
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
 * Создание платежа (обратная совместимость со старым API)
 * POST /api/payments/create
 * 
 * Алиас для /api/payment/generate-link для поддержки старой версии фронтенда
 */
app.post('/api/payments/create', async (req, res) => {
  console.log('📥 n8n-webhook-proxy: Получен запрос POST /api/payments/create (legacy endpoint)', {
    body: req.body,
    timestamp: new Date().toISOString()
  })
  
  // Используем тот же код, что и для /api/payment/generate-link
  try {
    const { userId, amount, tariffId, paymentSettings, userData: requestUserData } = req.body

    // Валидация
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId обязателен'
      })
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amount должен быть больше 0'
      })
    }

    // Если paymentSettings не переданы из запроса, загружаем из Firestore
    let finalPaymentSettings = paymentSettings
    if (!paymentSettings || Object.keys(paymentSettings).length === 0 || 
        !paymentSettings.yoomoneyWallet || !paymentSettings.yoomoneySecretKey) {
      console.log('⚠️ paymentSettings не переданы или неполные, загружаем из Firestore')
      finalPaymentSettings = await loadPaymentSettings()
      console.log('📝 Загружены настройки платежей из Firestore:', {
        hasWallet: !!finalPaymentSettings.yoomoneyWallet,
        hasSecretKey: !!finalPaymentSettings.yoomoneySecretKey
      })
    }

    // Получаем webhook URL
    const webhookUrl = getWebhookUrl('addClient', req)
    
    if (!webhookUrl) {
      console.error('❌ n8n-webhook-proxy: Webhook URL не найден')
      return res.status(500).json({
        success: false,
        error: 'Webhook URL не настроен'
      })
    }

    // Формируем данные для n8n workflow
    const paymentData = {
      mode: 'createPayment',
      operation: 'generatePaymentLink',
      action: 'createPayment',
      taskType: 'payment',
      userId: userId,
      amount: Number(amount),
      tariffId: tariffId || null,
      userData: requestUserData || null,
      paymentSettings: finalPaymentSettings || {},
    }

    console.log('📤 n8n-webhook-proxy: Отправка webhook в n8n для создания платежа:', {
      webhookUrl,
      mode: paymentData.mode,
      userId: paymentData.userId,
      amount: paymentData.amount,
      tariffId: paymentData.tariffId,
      hasUserData: !!paymentData.userData,
      hasPaymentSettings: !!paymentData.paymentSettings && Object.keys(paymentData.paymentSettings).length > 0
    })

    let result
    try {
      result = await callN8NWebhook(webhookUrl, paymentData)
    } catch (webhookError) {
      // Обрабатываем ошибки от callN8NWebhook
      console.error('❌ n8n-webhook-proxy: Ошибка вызова n8n webhook (payments/create):', {
        message: webhookError.message,
        status: webhookError.response?.status,
        statusText: webhookError.response?.statusText,
        errorData: webhookError.response?.data,
        stack: webhookError.stack?.substring(0, 500)
      })
      
      // Если ошибка уже содержит response.data с errorMessage, используем его
      if (webhookError.response?.data?.errorMessage) {
        return res.status(webhookError.response.status || 500).json({
          success: false,
          error: webhookError.response.data.errorMessage
        })
      }
      
      // Иначе используем стандартную обработку
      const errorMsg = webhookError.message || 'Ошибка вызова n8n workflow'
      return res.status(webhookError.response?.status || 500).json({
        success: false,
        error: errorMsg.includes('No item to return') 
          ? 'n8n workflow не вернул данные. Убедитесь, что workflow правильно настроен и возвращает paymentUrl и orderId через узел "Respond to Webhook".'
          : errorMsg
      })
    }

    console.log('📥 n8n-webhook-proxy: Получен ответ от n8n для создания платежа:', {
      resultType: typeof result,
      isArray: Array.isArray(result),
      arrayLength: Array.isArray(result) ? result.length : null,
      resultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
      hasError: !!(result?.error || result?.errorMessage || result?.message),
      errorMessage: result?.error || result?.errorMessage || result?.message,
      resultPreview: JSON.stringify(result).substring(0, 2000)
    })

    // Проверяем, что result не пустой и не является ошибкой
    if (!result) {
      console.error('❌ n8n-webhook-proxy: n8n вернул пустой ответ')
      return res.status(500).json({
        success: false,
        error: 'n8n workflow вернул пустой ответ. Проверьте конфигурацию workflow.',
      })
    }

    // Проверяем на ошибки от n8n
    if (result.error || result.errorMessage || result.message) {
      const errorMsg = result.error || result.errorMessage || result.message
      console.error('❌ n8n-webhook-proxy: n8n вернул ошибку:', errorMsg)
      
      // Специальная обработка для ошибки "No item to return was found"
      if (errorMsg.includes('No item to return') || errorMsg.includes('No item to return was found')) {
        return res.status(500).json({
          success: false,
          error: 'n8n workflow не вернул данные. Убедитесь, что workflow правильно настроен и возвращает paymentUrl и orderId.',
        })
      }
      
      return res.status(500).json({
        success: false,
        error: `Ошибка n8n workflow: ${errorMsg}`,
      })
    }

    // Обрабатываем ответ от n8n
    // n8n может возвращать массив [{ json: {...} }] или объект { paymentUrl: ... }
    let firstItem = null
    let responseData = null

    if (Array.isArray(result)) {
      if (result.length === 0) {
        console.error('❌ n8n-webhook-proxy: n8n вернул пустой массив')
        return res.status(500).json({
          success: false,
          error: 'n8n workflow вернул пустой массив. Проверьте конфигурацию workflow.',
        })
      }
      firstItem = result[0] || result.find(item => item?.paymentUrl || item?.json?.paymentUrl || item?.orderId || item?.json?.orderId)
      if (!firstItem) {
        console.error('❌ n8n-webhook-proxy: Не найдены данные платежа в ответе n8n:', {
          resultLength: result.length,
          firstItemKeys: result[0] ? Object.keys(result[0]) : [],
          resultPreview: JSON.stringify(result).substring(0, 500)
        })
        return res.status(500).json({
          success: false,
          error: 'n8n workflow не вернул данные платежа. Убедитесь, что workflow возвращает paymentUrl и orderId.',
        })
      }
      responseData = firstItem.json || firstItem
    } else {
      // Если result - объект, используем его напрямую
      responseData = result
    }

    console.log('📦 n8n-webhook-proxy: Обработанные данные от n8n:', {
      hasPaymentUrl: !!responseData?.paymentUrl,
      hasOrderId: !!responseData?.orderId,
      responseDataKeys: responseData ? Object.keys(responseData) : [],
      paymentUrl: responseData?.paymentUrl,
      orderId: responseData?.orderId
    })

    // Извлекаем orderId из paymentUrl, если он не передан в ответе n8n
    if (!responseData.orderId && responseData.paymentUrl) {
      try {
        const url = new URL(responseData.paymentUrl)
        const label = url.searchParams.get('label')
        if (label && label.startsWith('order_')) {
          responseData.orderId = label
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
        result,
        responseData,
        firstItem
      })
      return res.status(500).json({
        success: false,
        error: 'Неполные данные от n8n workflow: отсутствует paymentUrl',
      })
    }
    
    // Отправляем ответ клиенту
    res.json({
      success: true,
      paymentUrl: responseData.paymentUrl,
      orderId: responseData.orderId,
      amount: responseData.amount || amount,
      status: responseData.status || 'pending',
    })
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка при обработке запроса payments/create:', {
      message: error.message,
      stack: error.stack
    })
    
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка создания платежа',
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
 * Проверка идемпотентности события
 * @param {string} eventId - Уникальный идентификатор события (operation_id)
 * @returns {Promise<{processed: boolean, eventDoc: any}>}
 */
async function checkEventIdempotency(eventId) {
  if (!db || !eventId) {
    return { processed: false, eventDoc: null }
  }

  try {
    const APP_ID = process.env.APP_ID || 'skyputh'
    const eventsCollection = db.collection(`artifacts/${APP_ID}/public/data/processed_events`)
    const eventQuery = eventsCollection.where('eventId', '==', eventId).limit(1)
    const eventSnapshot = await eventQuery.get()

    if (!eventSnapshot.empty) {
      const eventDoc = eventSnapshot.docs[0]
      const eventData = eventDoc.data()
      console.log('✅ n8n-webhook-proxy: Событие уже обработано (идемпотентность)', {
        eventId,
        processedAt: eventData.processedAt,
        result: eventData.result
      })
      return { processed: true, eventDoc: eventData }
    }

    return { processed: false, eventDoc: null }
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка проверки идемпотентности', {
      eventId,
      error: error.message
    })
    // В случае ошибки считаем, что событие не обработано (fail-open)
    return { processed: false, eventDoc: null }
  }
}

/**
 * Сохранение обработанного события для идемпотентности
 * @param {string} eventId - Уникальный идентификатор события
 * @param {Object} result - Результат обработки
 * @returns {Promise<void>}
 */
async function saveProcessedEvent(eventId, result) {
  if (!db || !eventId) {
    return
  }

  try {
    const APP_ID = process.env.APP_ID || 'skyputh'
    const eventsCollection = db.collection(`artifacts/${APP_ID}/public/data/processed_events`)
    
    await eventsCollection.add({
      eventId,
      processedAt: new Date().toISOString(),
      result: {
        success: result?.success || false,
        status: result?.status || null,
        orderId: result?.orderId || null
      },
      createdAt: new Date().toISOString()
    })

    console.log('✅ n8n-webhook-proxy: Событие сохранено для идемпотентности', { eventId })
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка сохранения обработанного события', {
      eventId,
      error: error.message
    })
    // Не прерываем выполнение, если не удалось сохранить
  }
}

/**
 * Проверка секретного заголовка для webhook endpoints
 * @param {Object} req - Express request
 * @returns {boolean} true если секрет валиден
 */
function validateWebhookSecret(req) {
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET
  
  // Если секрет не настроен, разрешаем в development
  if (!webhookSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ n8n-webhook-proxy: WEBHOOK_SECRET не настроен в production!')
      return false
    }
    return true // Разрешаем в development
  }
  
  const providedSecret = req.headers['x-n8n-webhook-secret'] || req.headers['x-webhook-secret']
  
  if (!providedSecret) {
    console.warn('⚠️ n8n-webhook-proxy: Секретный заголовок отсутствует')
    return false
  }
  
  if (providedSecret !== webhookSecret) {
    console.warn('⚠️ n8n-webhook-proxy: Неверный секретный заголовок')
    return false
  }
  
  return true
}

/**
 * Проверка IP адреса для webhook endpoints
 * @param {Object} req - Express request
 * @returns {boolean} true если IP разрешен
 */
function validateWebhookIP(req) {
  const allowedIPs = process.env.WEBHOOK_ALLOWED_IPS 
    ? process.env.WEBHOOK_ALLOWED_IPS.split(',').map(ip => ip.trim())
    : []
  
  // Если IP allowlist не настроен, разрешаем все в development
  if (allowedIPs.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ n8n-webhook-proxy: WEBHOOK_ALLOWED_IPS не настроен в production!')
      return false
    }
    return true // Разрешаем в development
  }
  
  // Получаем реальный IP (учитываем прокси)
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.connection.remoteAddress 
    || req.socket.remoteAddress
  
  if (!clientIP) {
    console.warn('⚠️ n8n-webhook-proxy: Не удалось определить IP адрес')
    return false
  }
  
  const isAllowed = allowedIPs.some(allowedIP => {
    // Поддержка CIDR нотации (например, 192.168.1.0/24)
    if (allowedIP.includes('/')) {
      // Упрощенная проверка CIDR (для production лучше использовать библиотеку)
      const [network, prefix] = allowedIP.split('/')
      const networkParts = network.split('.').map(Number)
      const clientParts = clientIP.split('.').map(Number)
      const prefixLength = parseInt(prefix)
      
      // Проверяем каждый октет
      for (let i = 0; i < 4; i++) {
        const bits = Math.min(8, prefixLength - i * 8)
        if (bits <= 0) break
        const mask = (0xFF << (8 - bits)) & 0xFF
        if ((networkParts[i] & mask) !== (clientParts[i] & mask)) {
          return false
        }
      }
      return true
    }
    
    // Точное совпадение IP
    return allowedIP === clientIP
  })
  
  if (!isAllowed) {
    console.warn('⚠️ n8n-webhook-proxy: IP адрес не разрешен:', clientIP)
  }
  
  return isAllowed
}

/**
 * Обработка webhook от YooMoney
 * POST /api/payment/webhook
 * 
 * КРИТИЧЕСКИ ВАЖНО:
 * - Вся проверка оплаты выполняется ИСКЛЮЧИТЕЛЬНО в n8n
 * - Backend НЕ проверяет факт оплаты
 * - Backend принимает только доверенные события от n8n
 * - Firestore используется ТОЛЬКО как база данных для хранения, НЕ для проверки оплаты
 * 
 * БЕЗОПАСНОСТЬ:
 * - Проверка секретного заголовка (X-N8N-Webhook-Secret)
 * - Проверка IP адреса (WEBHOOK_ALLOWED_IPS)
 * - БЕЗ CORS для webhook endpoints (только прямые запросы)
 * 
 * Процесс:
 * 1. Получает webhook от YooMoney
 * 2. Проверяет идемпотентность по operation_id
 * 3. Отправляет в n8n для проверки оплаты
 * 4. n8n проверяет оплату и возвращает результат
 * 5. Backend активирует подписку на основе результата n8n (БЕЗ проверки в Firestore)
 */
app.post('/api/payment/webhook', cors({ origin: false }), async (req, res) => {
  try {
    // БЕЗОПАСНОСТЬ: Проверка секретного заголовка и IP
    if (!validateWebhookSecret(req)) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid webhook secret'
      })
    }
    
    if (!validateWebhookIP(req)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: IP address not allowed'
      })
    }
    const operationId = req.body?.operation_id
    const label = req.body?.label

    console.log('📥 n8n-webhook-proxy: Получен webhook от YooMoney', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      notificationType: req.body?.notification_type,
      operationId,
      label
    })

    // ШАГ 1: Проверка идемпотентности
    // Используем operation_id как уникальный идентификатор события
    if (operationId) {
      const { processed, eventDoc } = await checkEventIdempotency(operationId)
      
      if (processed) {
        console.log('🔄 n8n-webhook-proxy: Событие уже обработано, возвращаем предыдущий результат', {
          operationId,
          previousResult: eventDoc.result
        })
        
        // Возвращаем 200 OK с предыдущим результатом
        // YooMoney ожидает 200 OK для успешной обработки
        return res.status(200).json({
          success: true,
          idempotent: true,
          message: 'Event already processed',
          previousResult: eventDoc.result
        })
      }
    } else {
      console.warn('⚠️ n8n-webhook-proxy: operation_id отсутствует, идемпотентность не гарантируется', {
        label
      })
    }
    
    // Загружаем настройки платежей из Firestore
    const paymentSettings = await loadPaymentSettings()
    console.log('📥 n8n-webhook-proxy: Настройки платежей загружены', {
      hasWallet: !!paymentSettings.yoomoneyWallet,
      hasSecretKey: !!paymentSettings.yoomoneySecretKey
    })
    
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
    
    // Получаем webhook URL для обработки платежей
    const webhookUrl = getWebhookUrl('addClient', req) // Используем существующий механизм
    console.log('📤 n8n-webhook-proxy: Отправка webhook в n8n для обработки:', webhookUrl)
    
    // Формируем данные для n8n workflow
    // ВАЖНО: n8n сам найдет платеж по orderId (label) и вернет все необходимые данные
    const webhookData = {
      mode: 'processNotification',
      paymentSettings: paymentSettings,
      // Дата и время оплаты
      paymentDate: paymentDate, // Формат: DD-MM-YYYY
      paymentTime: paymentTime, // Формат: ЧЧ:ММ
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
    
    // Нормализация: n8n может вернуть массив [{ Id, orderid, statuspay: "ОПЛАЧЕНО", uuid, tariffid, ... }]
    const payload = (Array.isArray(result) && result.length > 0)
      ? result[0]
      : (result && typeof result === 'object' && result.result != null ? result.result : result)
    
    console.log('✅ n8n-webhook-proxy: Получен ответ от n8n для обработки webhook:', {
      hasResult: !!result,
      isArray: Array.isArray(result),
      status: payload?.status || result?.status,
      statuspay: payload?.statuspay,
      orderId: payload?.orderid || payload?.orderId || req.body?.label,
      uuid: payload?.uuid
    })
    
    // ШАГ 2: Сохранение обработанного события для идемпотентности
    // Сохраняем ДО активации подписки, чтобы предотвратить повторную обработку
    if (operationId) {
      await saveProcessedEvent(operationId, result)
    }
    
    // Проверяем статус: ОПЛАЧЕНО в payload (формат n8n: orderid, statuspay, uuid, tariffid)
    const statuspay = String(payload?.statuspay || '').toLowerCase().trim()
    const isPaymentSuccess = result?.status === 'success' ||
                             result?.success === true ||
                             payload?.status === 'success' ||
                             payload?.success === true ||
                             statuspay === 'оплачено' ||
                             statuspay === 'оплачен' ||
                             statuspay === 'paid' ||
                             statuspay === 'completed' ||
                             statuspay === 'успешно'
    
    if (isPaymentSuccess) {
      // userId для Firestore users_v4 = Firebase uid; в данных n8n это поле uuid
      const userId = payload?.uuid || payload?.userId || payload?.userid || result?.uuid || result?.userId || result?.userid || null
      const orderId = payload?.orderid || payload?.orderId || result?.orderId || result?.orderid || req.body?.label
      const tariffId = payload?.tariffid || payload?.tariffId || result?.tariffId || result?.tariffid || null
      
      console.log('🎉 n8n-webhook-proxy: Платеж успешно обработан!', {
        orderId,
        operationId: req.body?.operation_id,
        amount: payload?.sum || payload?.amount || req.body?.amount,
        statuspay: payload?.statuspay,
        userId
      })
      
      // ВСЕ данные только из ответа n8n (payload), не из Firestore
      const paymentData = {
        orderId,
        userId,
        tariffId,
        amount: parseFloat(payload?.sum || payload?.amount || result?.amount || result?.sum || req.body?.amount || 0),
        devices: payload?.devices || result?.devices || 1,
        periodMonths: payload?.periodmonths || payload?.periodMonths || result?.periodMonths || result?.periodmonths || 1,
        discount: payload?.discount || result?.discount || 0,
        email: payload?.email || result?.email || null,
        uuid: payload?.uuid || result?.uuid || userId
      }
      
      // После успешной обработки: обновление данных в проекте (Firestore) и вебхук в 3x-ui
      if (db && paymentData.userId && paymentData.orderId) {
        console.log('🔄 n8n-webhook-proxy: Запуск активации подписки после успешной оплаты', {
          userId: paymentData.userId,
          orderId: paymentData.orderId,
          tariffId: paymentData.tariffId,
          amount: paymentData.amount
        })
        
        try {
          await activateSubscriptionAfterPayment(paymentData)
          console.log('✅ n8n-webhook-proxy: Активация подписки завершена успешно', {
            userId: paymentData.userId,
            orderId: paymentData.orderId
          })
        } catch (activationError) {
          // Логируем ошибку, но не прерываем ответ YooMoney
          console.error('❌ n8n-webhook-proxy: Ошибка активации подписки после оплаты', {
            userId: paymentData.userId,
            orderId: paymentData.orderId,
            error: activationError.message,
            stack: activationError.stack
          })
        }
      } else {
        console.warn('⚠️ n8n-webhook-proxy: Недостаточно данных для активации подписки', {
          hasDb: !!db,
          hasUserId: !!paymentData.userId,
          hasOrderId: !!paymentData.orderId,
          hasTariffId: !!paymentData.tariffId,
          paymentData
        })
      }
    } else {
      console.log('ℹ️ n8n-webhook-proxy: Платеж обработан, но статус не "успешно"', {
        orderId: req.body?.label,
        resultStatus: result?.status,
        resultSuccess: result?.success,
        resultStatuspay: result?.statuspay || result?.result?.statuspay
      })
    }
    
    // YooMoney ожидает ответ 200 OK для успешной обработки
    res.status(200).json(result)
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка при обработке webhook от YooMoney:', {
      message: error.message,
      stack: error.stack,
      operationId: req.body?.operation_id
    })
    
    // Сохраняем событие с ошибкой для идемпотентности
    // Это предотвратит повторную обработку того же события
    const operationId = req.body?.operation_id
    if (operationId) {
      await saveProcessedEvent(operationId, {
        success: false,
        error: error.message
      })
    }
    
    // YooMoney может повторять запросы при ошибках, поэтому возвращаем 200
    // но с информацией об ошибке
    res.status(200).json({
      success: false,
      error: error.message || 'Ошибка обработки webhook от YooMoney',
    })
  }
})

/**
 * Подтверждение оплаты от n8n (когда n8n уже получил данные с statuspay "ОПЛАЧЕНО")
 * POST /api/payment/n8n-payment-confirmed
 *
 * Сценарий: проект отправил вебхук в n8n → n8n получил/обновил запись (ОПЛАЧЕНО) →
 * n8n вызывает этот endpoint с телом вида:
 *   [ { "Id": 24, "orderid": "order_...", "statuspay": "ОПЛАЧЕНО", "uuid": "...", "tariffid": "...", "sum": "4", ... } ]
 *   или один объект без массива.
 * Backend обновляет данные в проекте (Firestore) и запускает активацию в 3x-ui.
 *
 * БЕЗОПАСНОСТЬ: обязателен заголовок X-N8N-Webhook-Secret.
 */
app.post('/api/payment/n8n-payment-confirmed', cors({ origin: false }), async (req, res) => {
  try {
    if (!validateWebhookSecret(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid webhook secret' })
    }
    if (!validateWebhookIP(req)) {
      return res.status(403).json({ success: false, error: 'Forbidden: IP not allowed' })
    }

    const body = req.body || {}
    const payload = (Array.isArray(body) && body.length > 0)
      ? body[0]
      : (body.result != null ? body.result : body)

    const statuspay = String(payload?.statuspay || '').toLowerCase().trim()
    const isPaid = statuspay === 'оплачено' || statuspay === 'оплачен' || statuspay === 'paid' || statuspay === 'completed' || statuspay === 'успешно'

    if (!isPaid) {
      console.log('ℹ️ n8n-webhook-proxy: n8n-payment-confirmed вызван без статуса ОПЛАЧЕНО', { statuspay: payload?.statuspay })
      return res.status(200).json({ success: true, processed: false, reason: 'status_not_paid' })
    }

    const userId = payload?.uuid || payload?.userId || payload?.userid || null
    const orderId = payload?.orderid || payload?.orderId || null
    const tariffId = payload?.tariffid || payload?.tariffId || null

    if (!userId || !orderId) {
      console.warn('⚠️ n8n-webhook-proxy: n8n-payment-confirmed без uuid/orderid', { userId: !!userId, orderId: !!orderId })
      return res.status(400).json({ success: false, error: 'Требуются uuid и orderid в теле запроса' })
    }

    const paymentData = {
      orderId,
      userId,
      tariffId,
      amount: parseFloat(payload?.sum || payload?.amount || 0),
      devices: payload?.devices || 1,
      periodMonths: payload?.periodmonths || payload?.periodMonths || 1,
      discount: payload?.discount || 0,
      email: payload?.email || null,
      uuid: payload?.uuid || userId
    }

    if (!db) {
      await initFirebaseAdmin()
    }
    if (db) {
      try {
        await activateSubscriptionAfterPayment(paymentData)
        console.log('✅ n8n-webhook-proxy: Активация после n8n-payment-confirmed завершена', { orderId, userId })
      } catch (activationError) {
        console.error('❌ n8n-webhook-proxy: Ошибка активации в n8n-payment-confirmed', { orderId, userId }, activationError)
        return res.status(500).json({ success: false, error: activationError.message })
      }
    }

    res.status(200).json({ success: true, processed: true, orderId, userId })
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка в n8n-payment-confirmed:', error)
    res.status(500).json({ success: false, error: error.message || 'Ошибка обработки' })
  }
})

/**
 * Получение статуса платежа по orderId (ТОЛЬКО для истории/отображения)
 * GET /api/payment/status/:orderId
 * 
 * ВАЖНО: Этот endpoint НЕ используется для проверки оплаты!
 * Проверка оплаты выполняется ТОЛЬКО через n8n.
 * Firestore payments используется ТОЛЬКО как база данных для хранения истории.
 * 
 * Возвращает статус платежа из Firestore (для отображения пользователю)
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
 * Процесс проверки статуса оплаты:
 * 1. Принимает orderId от клиента
 * 2. Отправляет webhook в n8n с orderId (БЕЗ обращения к Firestore)
 * 3. n8n ищет запись в своей базе данных по orderId
 * 4. Если запись найдена и статус "оплачено" - n8n возвращает данные платежа
 * 5. n8n возвращает результат обратно
 * 6. Сервер возвращает результат клиенту
 * 7. Клиент обновляет статусы подписки на основе результата от n8n
 */
app.post('/api/payment/verify', async (req, res) => {
  try {
    console.log('📥 n8n-webhook-proxy: Получен запрос POST /api/payment/verify', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      orderId: req.body?.orderId
    })
    
    const { orderId } = req.body
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId обязателен'
      })
    }

    // Получаем webhook URL
    const webhookUrl = getWebhookUrl('addClient', req)
    
    if (!webhookUrl) {
      console.error('❌ n8n-webhook-proxy: Webhook URL не найден')
      return res.status(500).json({
        success: false,
        error: 'Webhook URL не настроен'
      })
    }
    
    // Формируем данные для n8n workflow
    // Явные маркеры для маршрутизации в n8n: operation, action, taskType
    // Отправляем ТОЛЬКО orderId - n8n сам найдет запись в своей базе данных
    const verifyData = {
      mode: 'verifyPayment',
      operation: 'checkPaymentStatus', // Маркер для маршрутизации в n8n
      action: 'paymentStatusCheck', // Альтернативный маркер
      taskType: 'statusCheck', // Тип задачи
      checkPaymentStatus: true, // Булевый флаг для удобной проверки в n8n
      orderId: orderId // Единственное обязательное поле - n8n найдет запись по orderId
    }
    
    console.log('📤 n8n-webhook-proxy: Отправка webhook в n8n для проверки статуса платежа (поиск по orderId):', {
      webhookUrl,
      orderId,
      operation: verifyData.operation,
      action: verifyData.action,
      taskType: verifyData.taskType,
      checkPaymentStatus: verifyData.checkPaymentStatus,
      fullData: JSON.stringify(verifyData)
    })
    
    try {
      // Отправляем webhook в n8n - n8n будет искать запись в базе данных по orderId
      const result = await callN8NWebhook(webhookUrl, verifyData)
      
      console.log('✅ n8n-webhook-proxy: Webhook успешно отправлен в n8n, получен ответ:', {
        hasResult: !!result,
        resultType: typeof result,
        resultKeys: result && typeof result === 'object' ? Object.keys(result) : 'N/A',
        resultPreview: result ? JSON.stringify(result).substring(0, 500) : 'empty'
      })
    
      // Получаем результат обратно от n8n
      console.log('✅ n8n-webhook-proxy: Получен ответ от n8n (результат поиска в базе данных):', {
        hasResult: !!result,
        resultType: Array.isArray(result) ? 'array' : typeof result,
        resultLength: Array.isArray(result) ? result.length : 'N/A',
        status: result?.status,
        success: result?.success,
        paymentFound: !!result?.payment,
        paymentStatus: result?.payment?.status,
        orderId: result?.orderId || result?.payment?.orderId,
        fullResult: result ? JSON.stringify(result).substring(0, 1000) : 'empty'
      })
      
      // Обрабатываем результат от n8n
      // n8n может вернуть:
      // 1. Массив [{ Id, orderid, statuspay: "ОПЛАЧЕНО", ... }]
      // 2. Объект { result: [...], payment: {...} }
      // 3. Объект { Id, orderid, statuspay: "ОПЛАЧЕНО", ... }
      let paymentData = null
      
      // Проверяем, есть ли в объекте поле result, которое является массивом
      let resultArray = null
      if (result && typeof result === 'object' && !Array.isArray(result) && Array.isArray(result.result)) {
        resultArray = result.result
        console.log('📦 n8n-webhook-proxy: Обнаружен объект с полем result (массив)', {
          resultArrayLength: resultArray.length,
          hasPayment: !!result.payment,
          paymentTariffId: result.payment?.tariffId
        })
      } else if (Array.isArray(result)) {
        resultArray = result
      } else if (result && typeof result === 'object' && !Array.isArray(result)) {
        // Разные обёртки ответа n8n (body, output, data) — чтобы не терять результат
        if (Array.isArray(result.body)) {
          resultArray = result.body
          console.log('📦 n8n-webhook-proxy: Обнаружена обёртка result.body (массив)', { length: result.body.length })
        } else if (result.body && typeof result.body === 'object' && !Array.isArray(result.body) && (result.body.orderid != null || result.body.statuspay != null || result.body.orederid != null)) {
          resultArray = [result.body]
          console.log('📦 n8n-webhook-proxy: Обнаружена обёртка result.body (объект платежа)')
        } else if (Array.isArray(result.data)) {
          resultArray = result.data
          console.log('📦 n8n-webhook-proxy: Обнаружена обёртка result.data (массив)', { length: result.data.length })
        } else if (result.data && typeof result.data === 'object' && !Array.isArray(result.data) && (result.data.orderid != null || result.data.statuspay != null || result.data.orederid != null)) {
          resultArray = [result.data]
          console.log('📦 n8n-webhook-proxy: Обнаружена обёртка result.data (объект платежа)')
        } else if (Array.isArray(result.output)) {
          const first = result.output[0]
          if (Array.isArray(first) && first.length > 0) resultArray = first
          else if (first && typeof first === 'object') resultArray = [first]
          else resultArray = result.output
          console.log('📦 n8n-webhook-proxy: Обнаружена обёртка result.output', { resultArrayLength: resultArray?.length })
        }
        if (!resultArray) {
          console.log('📦 n8n-webhook-proxy: Не найдена известная обёртка (result/body/data/output), ключи ответа:', Object.keys(result))
        }
      }
      
      // Если результат - массив (или поле result в объекте), берем первый элемент
      if (resultArray && resultArray.length > 0) {
        const n8nPayment = resultArray[0]
        console.log('📦 n8n-webhook-proxy: n8n вернул массив, обрабатываем первый элемент', {
          hasOrderid: !!n8nPayment?.orderid,
          statuspay: n8nPayment?.statuspay,
          hasStatuspay: !!n8nPayment?.statuspay,
          hasTariffId: !!n8nPayment?.tariffId,
          hasTariffid: !!n8nPayment?.tariffid,
          tariffId: n8nPayment?.tariffId,
          tariffid: n8nPayment?.tariffid,
          allKeys: Object.keys(n8nPayment || {})
        })
        
        // Маппим данные из формата n8n в формат приложения
        // n8n формат: { orderid, statuspay: "ОПЛАЧЕНО", sum, uuid, ... }
        // Формат приложения: { orderId, status: "completed", amount, userId, ... }
        const statuspay = n8nPayment?.statuspay || n8nPayment?.statuspay || ''
        const statuspayLower = String(statuspay).toLowerCase().trim()
        
        // Определяем статус платежа
        let paymentStatus = 'pending'
        if (statuspayLower === 'оплачено' || statuspayLower === 'оплачен' || statuspayLower === 'paid' || statuspayLower === 'completed' || statuspayLower === 'успешно') {
          paymentStatus = 'completed'
        } else if (statuspayLower === 'не оплачено' || statuspayLower === 'неоплачен' || statuspayLower === 'unpaid' || statuspayLower === 'failed') {
          paymentStatus = 'failed'
        } else if (statuspayLower === 'отменен' || statuspayLower === 'cancelled' || statuspayLower === 'rejected') {
          paymentStatus = 'cancelled'
        }
        
        // Извлекаем tariffId с учетом разных вариантов написания (в т.ч. опечатка trafikid из n8n)
        const extractedTariffId = n8nPayment?.tariffId || n8nPayment?.tariffid || n8nPayment?.trafikid || n8nPayment?.TariffId || n8nPayment?.TariffID || null

        // Формируем данные платежа в формате приложения (orederid → orderId)
        paymentData = {
          id: n8nPayment?.Id?.toString() || n8nPayment?.id?.toString() || null,
          orderId: n8nPayment?.orederid || n8nPayment?.orderid || n8nPayment?.orderId || orderId,
          userId: n8nPayment?.uuid || n8nPayment?.userId || null,
          amount: parseFloat(n8nPayment?.sum) || n8nPayment?.amount || 0,
          status: paymentStatus,
          originalStatus: n8nPayment?.statuspay || n8nPayment?.statuspay || null,
          tariffId: extractedTariffId,
          tariffName: n8nPayment?.tariffName || n8nPayment?.tariffname || null,
          devices: n8nPayment?.devices || 1,
          periodMonths: n8nPayment?.periodMonths || n8nPayment?.periodmonths || 1,
          discount: n8nPayment?.discount || 0,
          createdAt: n8nPayment?.CreatedAt || n8nPayment?.createdAt || null,
          completedAt: n8nPayment?.datapay || n8nPayment?.completedAt || null,
          operationId: n8nPayment?.operationId || null
        }
        
        console.log('📦 n8n-webhook-proxy: Данные платежа обработаны из формата n8n', {
          orderId: paymentData.orderId,
          originalStatus: paymentData.originalStatus,
          mappedStatus: paymentData.status,
          amount: paymentData.amount,
          userId: paymentData.userId,
          tariffId: paymentData.tariffId,
          tariffName: paymentData.tariffName,
          extractedTariffId: extractedTariffId,
          sourceTariffId: n8nPayment?.tariffId,
          sourceTariffid: n8nPayment?.tariffid
        })
      } else if (result && typeof result === 'object' && !Array.isArray(result) && !result.result) {
        // Если результат - объект (не массив)
        // n8n возвращает объект с данными платежа в корне: { Id, orderid, statuspay: "ОПЛАЧЕНО", ... }
        console.log('📦 n8n-webhook-proxy: n8n вернул объект (не массив), обрабатываем его', {
          hasOrderid: !!result?.orderid,
          statuspay: result?.statuspay,
          hasStatuspay: !!result?.statuspay,
          resultKeys: Object.keys(result || {})
        })
        
        // Проверяем, есть ли данные платежа в формате n8n
        console.log('📦 n8n-webhook-proxy: Проверка данных объекта от n8n', {
          hasOrderid: !!result?.orderid,
          orderid: result?.orderid,
          hasStatuspay: !!result?.statuspay,
          statuspay: result?.statuspay,
          conditionCheck: !!(result?.orderid || result?.statuspay || result?.orederid)
        })

        if (result?.orderid || result?.statuspay || result?.orederid) {
          const statuspay = result?.statuspay || ''
          const statuspayLower = String(statuspay).toLowerCase().trim()
          
          console.log('📦 n8n-webhook-proxy: Обработка статуса платежа', {
            statuspay: statuspay,
            statuspayLower: statuspayLower
          })
          
          // Определяем статус платежа
          let paymentStatus = 'pending'
          if (statuspayLower === 'оплачено' || statuspayLower === 'оплачен' || statuspayLower === 'paid' || statuspayLower === 'completed' || statuspayLower === 'успешно') {
            paymentStatus = 'completed'
          } else if (statuspayLower === 'не оплачено' || statuspayLower === 'неоплачен' || statuspayLower === 'unpaid' || statuspayLower === 'failed') {
            paymentStatus = 'failed'
          } else if (statuspayLower === 'отменен' || statuspayLower === 'cancelled' || statuspayLower === 'rejected') {
            paymentStatus = 'cancelled'
          }
          
          // Формируем данные платежа в формате приложения (orederid/trafikid → orderId/tariffId)
          paymentData = {
            id: result?.Id?.toString() || result?.id?.toString() || null,
            orderId: result?.orederid || result?.orderid || result?.orderId || orderId,
            userId: result?.uuid || result?.userId || null,
            amount: parseFloat(result?.sum) || result?.amount || 0,
            status: paymentStatus,
            originalStatus: result?.statuspay || null,
            tariffId: result?.tariffId || result?.tariffid || result?.trafikid || null,
            tariffName: result?.tariffName || null,
            devices: result?.devices || 1,
            periodMonths: result?.periodMonths || 1,
            discount: result?.discount || 0,
            createdAt: result?.CreatedAt || result?.createdAt || null,
            completedAt: result?.datapay || result?.completedAt || null,
            operationId: result?.operationId || null
          }
          
          console.log('📦 n8n-webhook-proxy: ✅ Данные платежа обработаны из объекта n8n', {
            orderId: paymentData.orderId,
            originalStatus: paymentData.originalStatus,
            mappedStatus: paymentData.status,
            amount: paymentData.amount,
            userId: paymentData.userId
          })
        } else {
          console.log('⚠️ n8n-webhook-proxy: Объект от n8n не содержит orderid, orederid или statuspay', {
            resultKeys: Object.keys(result || {}),
            hasOrderid: !!result?.orderid,
            hasStatuspay: !!result?.statuspay
          })

          // Если данных в формате n8n нет, проверяем стандартные поля
          paymentData = result?.payment || result?.data?.payment || null

          // Если данные платежа есть, но в формате n8n (в т.ч. orederid/trafikid), маппим их
          if (paymentData && (paymentData.statuspay || paymentData.orderid || paymentData.orederid)) {
            const statuspay = paymentData.statuspay || ''
            const statuspayLower = String(statuspay).toLowerCase().trim()

            let paymentStatus = 'pending'
            if (statuspayLower === 'оплачено' || statuspayLower === 'оплачен' || statuspayLower === 'paid' || statuspayLower === 'completed' || statuspayLower === 'успешно') {
              paymentStatus = 'completed'
            }

            paymentData = {
              ...paymentData,
              orderId: paymentData.orederid || paymentData.orderid || paymentData.orderId || orderId,
              tariffId: paymentData.trafikid || paymentData.tariffId || paymentData.tariffid || null,
              status: paymentStatus,
              originalStatus: paymentData.statuspay,
              amount: parseFloat(paymentData.sum) || paymentData.amount || 0,
              userId: paymentData.uuid || paymentData.userId || null
            }
          }
        }
      }
      
      // Возвращаем результат от n8n
      // Если n8n нашел запись и статус "оплачено", то paymentData будет содержать данные платежа
      console.log('📤 n8n-webhook-proxy: Отправка ответа клиенту', {
        success: true,
        orderId,
        hasResult: !!result,
        hasPayment: !!paymentData,
        paymentStatus: paymentData?.status,
        paymentOrderId: paymentData?.orderId,
        paymentTariffId: paymentData?.tariffId,
        paymentTariffName: paymentData?.tariffName,
        paymentDevices: paymentData?.devices,
        paymentPeriodMonths: paymentData?.periodMonths,
        paymentDiscount: paymentData?.discount,
        fullPaymentData: paymentData ? JSON.stringify(paymentData) : 'null'
      })
      
      // Последняя попытка: если в payment нет tariffId, взять из первого элемента result (trafikid/orederid)
      const firstItem = (resultArray && resultArray[0]) || (result?.result && result.result[0])
      if (paymentData && firstItem && (paymentData.tariffId == null || paymentData.tariffId === '')) {
        const fallbackTariffId = firstItem.trafikid || firstItem.tariffId || firstItem.tariffid || null
        if (fallbackTariffId) {
          paymentData.tariffId = fallbackTariffId
          console.log('📦 n8n-webhook-proxy: tariffId восстановлен из result[0] перед отправкой', { tariffId: fallbackTariffId })
        }
      }

      // При успешной оплате: обновляем статус платежа в Firestore (idempotency) для ВСЕХ оплаченных заказов;
      // затем при наличии promocodeId — инкрементируем счётчик промокода (отдельный шаг).
      if (paymentData?.status === 'completed' && db) {
        try {
          const paymentsRef = db.collection(`artifacts/${APP_ID}/public/data/payments`)
          const paymentsSnap = await paymentsRef.where('orderId', '==', orderId).limit(1).get()
          if (!paymentsSnap.empty) {
            const paymentDoc = paymentsSnap.docs[0]
            const paymentDocData = paymentDoc.data()
            // 1) Всегда обновляем статус pending → completed (для всех оплаченных заказов, с промокодом и без)
            if (paymentDocData.status === 'pending') {
              await paymentDoc.ref.update({ status: 'completed' })
              console.log('✅ n8n-webhook-proxy: Статус платежа обновлён на completed', { orderId })
              // 2) Только при первом переходе в completed: инкремент использования промокода (не при повторе вебхука)
              const promocodeId = paymentDocData.promocodeId
              const paymentUserId = paymentDocData.userId
              if (promocodeId) {
                const promoRef = db.doc(`artifacts/${APP_ID}/public/data/promocodes/${promocodeId}`)
                const promoSnap = await promoRef.get()
                if (promoSnap.exists) {
                  const promoData = promoSnap.data()
                  const currentUsages = Number(promoData.currentUsages || 0)
                  await promoRef.update({
                    currentUsages: currentUsages + 1,
                    lastUsedAt: new Date().toISOString()
                  })
                  // Записываем, что этот пользователь использовал промокод (повторное использование запрещено)
                  if (paymentUserId && typeof paymentUserId === 'string') {
                    const usedByRef = db.doc(`artifacts/${APP_ID}/public/data/promocodes/${promocodeId}/usedBy/${paymentUserId}`)
                    await usedByRef.set({
                      usedAt: new Date().toISOString(),
                      orderId: orderId
                    })
                  }
                  console.log('✅ n8n-webhook-proxy: Промокод использован', { promocodeId, orderId, userId: paymentUserId })
                }
              }
            }
          }
        } catch (updateErr) {
          console.warn('⚠️ n8n-webhook-proxy: Ошибка обновления платежа/промокода (не критично):', updateErr.message)
        }
      }

      // Отдаём клиенту тот же массив/объект, из которого собрали paymentData, чтобы фронт мог использовать result, если payment не подошёл
      const responseResult = resultArray != null
        ? resultArray
        : (result && typeof result === 'object' && !Array.isArray(result) && result.result != null)
          ? result.result
          : result
      
      res.json({
        success: true,
        orderId,
        result: responseResult,
        // Данные платежа из n8n (если найдены и обработаны)
        // ВАЖНО: используем paymentData, созданный из result[0] или result.result[0], а не payment из ответа n8n
        payment: paymentData
      })
    } catch (webhookError) {
      console.error('❌ n8n-webhook-proxy: Ошибка при вызове webhook в n8n:', {
        message: webhookError.message,
        status: webhookError.response?.status,
        statusText: webhookError.response?.statusText,
        errorData: webhookError.response?.data,
        url: webhookUrl,
        orderId: orderId,
        stack: webhookError.stack?.substring(0, 500)
      })
      
      // Если это ошибка от n8n (404, 500 и т.д.), возвращаем её
      if (webhookError.response) {
        return res.status(webhookError.response.status || 500).json({
          success: false,
          error: webhookError.response.data?.error || webhookError.message || 'Ошибка при проверке платежа в n8n',
          n8nError: webhookError.response.data
        })
      }
      
      // Иначе возвращаем общую ошибку
      res.status(500).json({
        success: false,
        error: webhookError.message || 'Ошибка при проверке платежа'
      })
    }
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка при проверке платежа через n8n:', {
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
 * Очистка устаревших флагов активации (cleanup для TTL)
 * Вызывается периодически для освобождения "зависших" флагов
 * Работает с коллекцией activation_locks
 * @returns {Promise<number>} Количество очищенных флагов
 */
async function cleanupExpiredActivationLocks() {
  if (!db) {
    return 0
  }

  try {
    const APP_ID = process.env.APP_ID || 'skyputh'
    const locksCollection = db.collection(`artifacts/${APP_ID}/public/data/activation_locks`)
    const now = Date.now()
    
    // Находим все активные блокировки
    const activeLocksQuery = locksCollection
      .where('active', '==', true)
      .limit(100) // Ограничиваем для производительности
    
    const activeLocksSnapshot = await activeLocksQuery.get()
    
    if (activeLocksSnapshot.empty) {
      return 0
    }

    const batch = db.batch()
    let count = 0

    activeLocksSnapshot.docs.forEach((doc) => {
      const data = doc.data()
      const expiresAt = data.expiresAt || 0
      
      // Фильтруем только истекшие блокировки
      if (expiresAt > 0 && expiresAt < now) {
        batch.update(doc.ref, {
          active: false,
          expiresAt: null,
          startedAt: null
        })
        count++
      }
    })

    if (count > 0) {
      await batch.commit()
      console.log('🧹 n8n-webhook-proxy: Очищено устаревших блокировок активации', { count })
    }

    return count
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка очистки устаревших блокировок', {
      error: error.message
    })
    return 0
  }
}

/**
 * Создание или обновление подписки в Firestore
 * 
 * ВАЖНО: Firestore используется ТОЛЬКО как база данных для хранения состояния.
 * Проверка оплаты НЕ выполняется здесь - она уже выполнена в n8n.
 * 
 * @param {Object} subscriptionData - Данные подписки
 * @returns {Promise<string>} ID созданной/обновленной подписки
 */
async function createOrUpdateSubscription(subscriptionData) {
  if (!db || !subscriptionData.userId) {
    throw new Error('Недостаточно данных для создания подписки')
  }

  try {
    const APP_ID = process.env.APP_ID || 'skyputh'
    const subscriptionsCollection = db.collection(`artifacts/${APP_ID}/public/data/subscriptions`)
    
    // Ищем существующую активную подписку пользователя
    const existingQuery = subscriptionsCollection
      .where('userId', '==', subscriptionData.userId)
      .where('status', 'in', ['pending_payment', 'test_period', 'activating', 'active'])
      .limit(1)
    
    const existingSnapshot = await existingQuery.get()
    
    if (!existingSnapshot.empty) {
      // Обновляем существующую подписку
      const existingDoc = existingSnapshot.docs[0]
      const subscriptionId = existingDoc.id
      
      await existingDoc.ref.update({
        ...subscriptionData,
        updatedAt: new Date().toISOString()
      })
      
      console.log('✅ n8n-webhook-proxy: Подписка обновлена', {
        subscriptionId,
        userId: subscriptionData.userId,
        status: subscriptionData.status
      })
      
      return subscriptionId
    } else {
      // Создаем новую подписку
      const newSubscription = {
        ...subscriptionData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      const docRef = await subscriptionsCollection.add(newSubscription)
      
      console.log('✅ n8n-webhook-proxy: Подписка создана', {
        subscriptionId: docRef.id,
        userId: subscriptionData.userId,
        status: subscriptionData.status
      })
      
      return docRef.id
    }
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка создания/обновления подписки', {
      userId: subscriptionData.userId,
      error: error.message
    })
    throw error
  }
}

/**
 * Получение активной подписки пользователя
 * @param {string} userId - ID пользователя
 * @returns {Promise<Object|null>} Данные подписки или null
 */
async function getActiveSubscription(userId) {
  if (!db || !userId) {
    return null
  }

  try {
    const APP_ID = process.env.APP_ID || 'skyputh'
    const subscriptionsCollection = db.collection(`artifacts/${APP_ID}/public/data/subscriptions`)
    
    const activeQuery = subscriptionsCollection
      .where('userId', '==', userId)
      .where('status', 'in', ['pending_payment', 'test_period', 'activating', 'active'])
      .orderBy('createdAt', 'desc')
      .limit(1)
    
    const snapshot = await activeQuery.get()
    
    if (snapshot.empty) {
      return null
    }
    
    const doc = snapshot.docs[0]
    return {
      id: doc.id,
      ...doc.data()
    }
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка получения активной подписки', {
      userId,
      error: error.message
    })
    return null
  }
}

/**
 * Активация клиента в 3x-ui через n8n с retry механизмом
 * 
 * RETRY МЕХАНИЗМ:
 * - Выполняет до 3 попыток с exponential backoff (2s, 4s, 8s)
 * - Все попытки происходят внутри одного вызова функции
 * - Если все попытки не удались, возвращает {success: false, error: ...}
 * 
 * ВАЖНО: Это внутренний retry для одного вызова активации.
 * Внешний retry (через activationAttempt) происходит при повторных вызовах
 * activateSubscriptionAfterPayment (например, через cron job или ручную синхронизацию).
 * 
 * @param {Object} params - Параметры активации
 * @param {string} params.clientId - UUID клиента
 * @param {string} params.userId - ID пользователя
 * @param {string} params.tariffId - ID тарифа
 * @param {Object} params.tariffData - Данные тарифа
 * @param {Object} params.userData - Данные пользователя
 * @param {Object} params.paymentData - Данные платежа
 * @param {number} params.expiresAt - Дата окончания подписки (timestamp)
 * @param {number} params.devices - Количество устройств
 * @param {number} params.periodMonths - Период подписки в месяцах
 * @param {boolean} params.needsClientCreation - Нужно ли создавать нового клиента
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function activateClientIn3XUI({
  clientId,
  userId,
  tariffId,
  tariffData,
  userData,
  paymentData,
  expiresAt,
  devices,
  periodMonths,
  needsClientCreation
}) {
  const webhookUrl = N8N_WEBHOOKS.addClient
  const addClientData = {
    operation: 'add_client',
    category: needsClientCreation ? 'new_subscription' : 'update_subscription',
    clientId: clientId,
    email: paymentData.email || userData.email || null,
    userId: userId,
    tariffId: tariffId,
    devices: devices,
    periodMonths: periodMonths,
    inboundId: tariffData.inboundId || null,
    expiryTime: expiresAt, // В миллисекундах
    totalGB: tariffData.trafficGB > 0 ? tariffData.trafficGB * 1024 * 1024 * 1024 : 0, // В байтах
    limitIp: devices
  }
  
  // Retry с exponential backoff: 3 попытки, базовая задержка 2 секунды
  // Задержки: 2s, 4s, 8s
  try {
    await retryWithBackoff(
      () => callN8NWebhook(webhookUrl, addClientData),
      3, // maxAttempts
      2000 // baseDelayMs (2 секунды)
    )
    
    console.log('✅ n8n-webhook-proxy: Клиент успешно активирован в 3x-ui', { 
      userId, 
      uuid: clientId,
      isNew: needsClientCreation
    })
    
    return { success: true }
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка активации клиента в 3x-ui после всех попыток', {
      userId,
      uuid: clientId,
      error: error.message,
      stack: error.stack
    })
    
    return { 
      success: false, 
      error: error.message || 'Неизвестная ошибка активации клиента'
    }
  }
}

/**
 * Активация подписки после успешной оплаты
 * Вызывается после того, как n8n успешно обработал платеж
 * 
 * КРИТИЧЕСКИ ВАЖНО:
 * - Работает ТОЛЬКО с данными из n8n
 * - НЕ обращается к Firestore payments для проверки оплаты
 * - Firestore используется ТОЛЬКО как база данных для хранения состояния подписки
 * - Вся проверка оплаты выполняется ИСКЛЮЧИТЕЛЬНО в n8n
 * 
 * ЗАЩИТА ОТ RACE CONDITION: использует флаг activationInProgress и блокировки
 * RETRY МЕХАНИЗМ: exponential backoff для активации клиента в 3x-ui
 * 
 * @param {Object} paymentData - Данные платежа из n8n (n8n уже проверил оплату):
 *   - orderId: string
 *   - userId: string
 *   - tariffId: string
 *   - amount: number
 *   - devices: number
 *   - periodMonths: number
 *   - discount: number
 *   - email: string (опционально)
 *   - uuid: string (опционально)
 */
async function activateSubscriptionAfterPayment(paymentData) {
  if (!db || !paymentData || !paymentData.userId || !paymentData.orderId) {
    console.warn('⚠️ n8n-webhook-proxy: Недостаточно данных для активации подписки', {
      hasDb: !!db,
      hasPaymentData: !!paymentData,
      hasUserId: !!paymentData?.userId,
      hasOrderId: !!paymentData?.orderId
    })
    return
  }

  const { userId, orderId, tariffId, devices = 1, periodMonths = 1, discount = 0 } = paymentData

  // ШАГ 1: Проверка идемпотентности через operation_id (уже проверено в webhook handler)
  // Используем orderId как ключ для блокировки активации
  const lockKey = `activation_${orderId}`
  let lockAcquired = false

  try {
    const APP_ID = process.env.APP_ID || 'skyputh'
    
    // ШАГ 2: Установка флага активации (защита от race condition)
    // Используем отдельную коллекцию для блокировок активации
    const locksCollection = db.collection(`artifacts/${APP_ID}/public/data/activation_locks`)
    const lockRef = locksCollection.doc(lockKey)
    const lockDoc = await lockRef.get()
    
    const now = Date.now()
    const ttlSeconds = 300 // 5 минут
    const expiresAt = now + (ttlSeconds * 1000)
    
    if (lockDoc.exists) {
      const lockData = lockDoc.data()
      const lockExpiresAt = lockData.expiresAt || 0
      
      if (lockData.active && lockExpiresAt > now) {
        console.log('ℹ️ n8n-webhook-proxy: Активация уже выполняется другим процессом', {
          orderId,
          expiresAt: new Date(lockExpiresAt).toISOString()
        })
        return
      }
    }
    
    // Устанавливаем блокировку
    await lockRef.set({
      active: true,
      expiresAt: expiresAt,
      startedAt: new Date().toISOString(),
      orderId,
      userId
    }, { merge: true })
    
    lockAcquired = true
    console.log('✅ n8n-webhook-proxy: Блокировка активации установлена', {
      orderId,
      expiresAt: new Date(expiresAt).toISOString()
    })
    
    if (!tariffId) {
      console.warn('⚠️ n8n-webhook-proxy: tariffId не найден в данных n8n', { orderId })
      await lockRef.update({ active: false, expiresAt: null })
      return
    }
    
    // 3. Проверяем существующую активную подписку (идемпотентность)
    const existingSubscription = await getActiveSubscription(userId)
    if (existingSubscription && existingSubscription.status === 'active') {
      console.log('ℹ️ n8n-webhook-proxy: У пользователя уже есть активная подписка', {
        userId,
        existingSubscriptionId: existingSubscription.id,
        existingStatus: existingSubscription.status,
        orderId
      })
      
      // Если подписка уже активна, просто освобождаем блокировку
      await lockRef.update({ active: false, expiresAt: null })
      return
    }
    
    // 4. Получаем данные пользователя из Firestore
    const usersCollection = db.collection(`artifacts/${APP_ID}/public/data/users_v4`)
    const userDoc = await usersCollection.doc(userId).get()
    
    if (!userDoc.exists) {
      console.warn('⚠️ n8n-webhook-proxy: Пользователь не найден для активации подписки', { userId })
      await lockRef.update({ active: false, expiresAt: null })
      return
    }
    
    const userData = userDoc.data()
    const userUpdatedAt = userData.updatedAt || userData.createdAt // Для optimistic locking
    
    // 5. Получаем данные тарифа из Firestore
    const tariffsCollection = db.collection(`artifacts/${APP_ID}/public/data/tariffs`)
    const tariffDoc = await tariffsCollection.doc(tariffId).get()
    
    if (!tariffDoc.exists) {
      console.warn('⚠️ n8n-webhook-proxy: Тариф не найден для активации подписки', { tariffId })
      await lockRef.update({ active: false, expiresAt: null })
      return
    }
    
    const tariffData = tariffDoc.data()
    
    // 6. Вычисляем дату окончания подписки
    const currentTime = Date.now()
    const durationDays = periodMonths * 30 // Примерно 30 дней в месяце
    
    // Если у пользователя уже есть активная подписка, продлеваем от текущей даты окончания
    const existingSubscriptionEndDate = userData.expiresAt || 0
    const hasActiveSubscription = existingSubscriptionEndDate > currentTime
    
    let subscriptionExpiresAt = 0
    if (hasActiveSubscription) {
      subscriptionExpiresAt = existingSubscriptionEndDate + (durationDays * 24 * 60 * 60 * 1000)
      console.log('📅 n8n-webhook-proxy: Продление существующей подписки', {
        userId,
        currentEndDate: new Date(existingSubscriptionEndDate).toISOString(),
        newEndDate: new Date(subscriptionExpiresAt).toISOString()
      })
    } else {
      subscriptionExpiresAt = currentTime + (durationDays * 24 * 60 * 60 * 1000)
      console.log('📅 n8n-webhook-proxy: Создание новой подписки', {
        userId,
        expiresAt: new Date(subscriptionExpiresAt).toISOString()
      })
    }
    
    // 7. ШАГ 4: Создание/обновление подписки в коллекции subscriptions
    // Статус подписки - единственный источник правды
    // Статус 'activating' устанавливается сразу при создании подписки
    const subscriptionData = {
      userId: userId,
      tariffId: tariffId,
      tariffName: tariffData.name || null,
      plan: tariffData.plan || 'free',
      status: 'activating', // Статус активации (будет обновлен на 'active' после успешного создания клиента или 'failed' при ошибке)
      expiresAt: subscriptionExpiresAt > 0 ? subscriptionExpiresAt : null,
      devices: devices,
      periodMonths: periodMonths,
      discount: discount,
      amount: paymentData.amount,
      orderId: orderId,
      activationAttempt: 1, // Начинаем с первой попытки
      maxActivationAttempts: 3, // Максимальное количество попыток
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    let subscriptionId = null
    try {
      subscriptionId = await createOrUpdateSubscription(subscriptionData)
      console.log('✅ n8n-webhook-proxy: Подписка создана/обновлена в коллекции subscriptions', {
        subscriptionId,
        userId,
        status: 'activating'
      })
      
      // Логируем создание подписки
      await logN8NEvent('subscription_created', {
        subscriptionId,
        userId,
        orderId,
        tariffId,
        status: 'activating'
      }, 'info')
    } catch (subscriptionError) {
      console.error('❌ n8n-webhook-proxy: Ошибка создания подписки', {
        userId,
        error: subscriptionError.message
      })
      await lockRef.update({ active: false, expiresAt: null })
      return
    }
    
    // 8. Обновляем данные пользователя в Firestore (ссылка на подписку)
    // ВАЖНО: subscription.status - единственный источник правды для статуса подписки!
    // paymentStatus обновляется ТОЛЬКО для обратной совместимости со старым кодом.
    // Вся логика статусов должна использовать subscription.status из коллекции subscriptions.
    const userUpdateData = {
      subscriptionId: subscriptionId, // Ссылка на подписку (ОСНОВНОЙ источник статуса)
      plan: tariffData.plan || 'free',
      expiresAt: subscriptionExpiresAt > 0 ? subscriptionExpiresAt : null,
      tariffName: tariffData.name || null,
      tariffId: tariffId,
      devices: devices,
      periodMonths: periodMonths,
      paymentStatus: 'paid', // ТОЛЬКО для обратной совместимости (устаревшее поле)
      discount: 0, // Промокод действует только на 1 оплату — не сохраняем скидку (иначе применится при продлении)
      unpaidStartDate: null, // Очищаем дату начала неоплаченного периода
      updatedAt: new Date().toISOString(),
    }
    
    // Создаем или обновляем клиента в 3x-ui
    let clientId = paymentData.uuid || userData.uuid
    const needsClientCreation = !clientId || typeof clientId !== 'string' || clientId.trim() === ''
    
    if (needsClientCreation) {
      // Генерируем новый UUID v4
      clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
      userUpdateData.uuid = clientId
      console.log('🔄 n8n-webhook-proxy: UUID сгенерирован, создаем клиента в 3x-ui', {
        userId,
        uuid: clientId
      })
    } else {
      console.log('🔄 n8n-webhook-proxy: UUID существует, обновляем клиента в 3x-ui', {
        userId,
        uuid: clientId
      })
    }
    
    // Вызываем создание/обновление клиента в 3x-ui через n8n с retry механизмом
    // ВАЖНО: Вызываем даже если UUID уже есть - нужно обновить expiryTime и другие параметры
    const activationResult = await activateClientIn3XUI({
      clientId,
      userId,
      tariffId,
      tariffData,
      userData,
      paymentData,
      expiresAt: subscriptionExpiresAt,
      devices,
      periodMonths,
      needsClientCreation
    })
    
    // Обновляем статус подписки в зависимости от результата активации
    // ВАЖНО: retry механизм внутри activateClientIn3XUI делает 3 попытки за один вызов
    // Поэтому activationAttempt увеличивается только при следующем вызове activateSubscriptionAfterPayment
    if (subscriptionId) {
      const subscriptionsCollection = db.collection(`artifacts/${APP_ID}/public/data/subscriptions`)
      const subscriptionDoc = await subscriptionsCollection.doc(subscriptionId).get()
      
      if (subscriptionDoc.exists) {
        const currentData = subscriptionDoc.data()
        const currentAttempt = currentData.activationAttempt || 1
        const maxAttempts = currentData.maxActivationAttempts || 3
        
        if (activationResult.success) {
          // Успешная активация - обновляем статус на 'active'
          await subscriptionsCollection.doc(subscriptionId).update({
            status: 'active',
            activatedAt: new Date().toISOString(),
            activationAttempt: currentAttempt,
            lastActivationError: null,
            lastActivationAttemptAt: null,
            updatedAt: new Date().toISOString()
          })
          console.log('✅ n8n-webhook-proxy: Статус подписки обновлен на active', {
            subscriptionId,
            userId,
            activationAttempt: currentAttempt
          })
          
          // Логируем успешную активацию
          await logN8NEvent('subscription_activated', {
            subscriptionId,
            userId,
            orderId: paymentData.orderId,
            activationAttempt: currentAttempt
          }, 'success')
          
          // Проверяем алерты (не должно быть, но на всякий случай)
          await checkSubscriptionAlerts(subscriptionId, {
            ...currentData,
            status: 'active'
          })
          // Уведомление пользователю о продлении подписки
          const tariffName = tariffData.name || 'Подписка'
          const expiresAtStr = subscriptionExpiresAt ? new Date(subscriptionExpiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
          await createNotification({
            userId,
            type: 'subscription',
            title: 'Подписка активирована',
            body: `Ваша подписка «${tariffName}» успешно продлена${expiresAtStr ? ` до ${expiresAtStr}` : ''}.`,
            data: { subscriptionId, orderId: paymentData.orderId, tariffName, expiresAt: subscriptionExpiresAt }
          })
          const appBaseUrl = (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')
          const subscriptionPushUrl = appBaseUrl ? `${appBaseUrl}/#dashboard` : '/#dashboard'
          await sendWebPushToUser(userId, {
            title: 'Подписка активирована',
            body: `Ваша подписка «${tariffName}» успешно продлена${expiresAtStr ? ` до ${expiresAtStr}` : ''}.`,
            url: subscriptionPushUrl,
            type: 'subscription'
          })
          if (userData.tgId) {
            getTelegramToken().then((botToken) => {
              if (!botToken) return
              const msg = `✅ Оплата принята.\n\nПодписка «${tariffName}» активирована${expiresAtStr ? ` до ${expiresAtStr}` : ''}.`
              sendTelegramMessage(botToken, String(userData.tgId).trim(), msg).then((r) => {
                if (!r.ok) console.warn('⚠️ Telegram: не удалось отправить уведомление об оплате', { userId, error: r.error })
              }).catch((e) => console.warn('⚠️ Telegram send error:', e.message))
            })
          }
        } else {
          // Ошибка активации после всех retry попыток
          // Увеличиваем счетчик попыток для следующего вызова (если будет)
          const nextAttempt = currentAttempt + 1
          const isDeadLetter = nextAttempt > maxAttempts
          const newStatus = isDeadLetter ? 'failed' : 'activating'
          
          await subscriptionsCollection.doc(subscriptionId).update({
            status: newStatus,
            activationAttempt: nextAttempt,
            lastActivationError: activationResult.error || 'Неизвестная ошибка',
            lastActivationAttemptAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
          
          if (isDeadLetter) {
            console.error('❌ n8n-webhook-proxy: Подписка переведена в dead-letter состояние (failed)', {
              subscriptionId,
              userId,
              activationAttempt: nextAttempt,
              maxAttempts,
              error: activationResult.error
            })
            
            // Логируем dead-letter состояние
            await logN8NEvent('subscription_dead_letter', {
              subscriptionId,
              userId,
              orderId: paymentData.orderId,
              activationAttempt: nextAttempt,
              maxAttempts,
              error: activationResult.error
            }, 'error', `Подписка в dead-letter состоянии после ${nextAttempt} попыток`)
          } else {
            console.warn('⚠️ n8n-webhook-proxy: Статус подписки обновлен на activating (ожидание следующей попытки)', {
              subscriptionId,
              userId,
              activationAttempt: nextAttempt,
              maxAttempts,
              error: activationResult.error
            })
            
            // Логируем неудачную попытку активации
            await logN8NEvent('subscription_activation_failed', {
              subscriptionId,
              userId,
              orderId: paymentData.orderId,
              activationAttempt: nextAttempt,
              maxAttempts,
              error: activationResult.error
            }, 'warning', `Попытка активации ${nextAttempt}/${maxAttempts} не удалась`)
          }
          
          // Проверяем алерты для подписки
          await checkSubscriptionAlerts(subscriptionId, {
            ...currentData,
            status: newStatus,
            activationAttempt: nextAttempt
          })
        }
      }
    }
    
    // Продолжаем обновление пользователя даже если не удалось создать клиента
    // Клиент может быть создан позже через синхронизацию или retry
    
    // Генерируем subId для ссылки на подписку (если его еще нет)
    let subId = userData.subId
    if (!subId || typeof subId !== 'string' || subId.trim() === '') {
      // Генерируем subId из userId (первые 8 символов) + случайное число
      const userIdShort = userId.substring(0, 8)
      const randomNum = Math.floor(Math.random() * 10000)
      subId = `${userIdShort}${randomNum}`
      userUpdateData.subId = subId
      console.log('🔄 n8n-webhook-proxy: subId сгенерирован для ссылки на подписку', {
        userId,
        subId
      })
    }
    
    // Формируем ссылку на подписку
    let subscriptionLink = null
    if (tariffData.subscriptionLink && tariffData.subscriptionLink.trim()) {
      const baseLink = tariffData.subscriptionLink.trim().replace(/\/$/, '')
      subscriptionLink = `${baseLink}/${subId}`
    } else {
      // Дефолтная ссылка, если в тарифе не указана
      subscriptionLink = `https://subs.skypath.fun:3458/vk198/${subId}`
    }
    userUpdateData.vpnLink = subscriptionLink
    userUpdateData.subscriptionLink = subscriptionLink
    
    // 8. Обновляем пользователя
    try {
      await usersCollection.doc(userId).update(userUpdateData)
      console.log('✅ n8n-webhook-proxy: Данные пользователя обновлены после оплаты', {
        userId,
        subscriptionId,
        tariffId,
        expiresAt: new Date(subscriptionExpiresAt).toISOString(),
        devices,
        periodMonths,
        subscriptionLink,
        subId
      })
    } catch (updateError) {
      console.error('❌ n8n-webhook-proxy: Ошибка обновления пользователя', {
        userId,
        error: updateError.message
      })
      // Продолжаем выполнение, даже если не удалось обновить пользователя
    }
    
    // 9. Проверяем финальный статус подписки
    // Если клиент был создан успешно, статус уже обновлен на 'active' выше
    // Если была ошибка, статус обновлен на 'failed' или 'activating'
    if (subscriptionId) {
      try {
        const subscriptionsCollection = db.collection(`artifacts/${APP_ID}/public/data/subscriptions`)
        const subscriptionDoc = await subscriptionsCollection.doc(subscriptionId).get()
        
        if (subscriptionDoc.exists) {
          const finalStatus = subscriptionDoc.data().status
          console.log('📊 n8n-webhook-proxy: Финальный статус подписки', {
            subscriptionId,
            userId,
            status: finalStatus
          })
        }
      } catch (statusError) {
        console.error('❌ n8n-webhook-proxy: Ошибка проверки финального статуса подписки', {
          subscriptionId,
          error: statusError.message
        })
      }
    }
    
    // 10. Освобождаем блокировку активации
    await lockRef.update({ active: false, expiresAt: null })
    lockAcquired = false
    
    console.log('🎉 n8n-webhook-proxy: Подписка успешно активирована после оплаты', {
      userId,
      subscriptionId,
      orderId,
      tariffId,
      expiresAt: new Date(subscriptionExpiresAt).toISOString()
    })
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка активации подписки после оплаты', {
      userId: paymentData?.userId,
      orderId: paymentData?.orderId,
      error: error.message,
      stack: error.stack
    })
    
    // В случае ошибки освобождаем блокировку
    if (lockAcquired && lockKey) {
      try {
        const APP_ID = process.env.APP_ID || 'skyputh'
        const locksCollection = db.collection(`artifacts/${APP_ID}/public/data/activation_locks`)
        await locksCollection.doc(lockKey).update({ active: false, expiresAt: null })
      } catch (releaseError) {
        console.error('❌ n8n-webhook-proxy: Ошибка освобождения блокировки', {
          lockKey,
          error: releaseError.message
        })
      }
    }
    
    // Не пробрасываем ошибку, чтобы не прервать ответ YooMoney
    // Ошибка уже залогирована
  }
}

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

/**
 * Ручная синхронизация платежа
 * POST /admin/sync-payment
 * 
 * Инициируется вручную администратором для повторной проверки платежа через n8n.
 * Полезно когда:
 * - Платеж был пропущен
 * - Нужно перепроверить статус платежа
 * - Подписка не активировалась автоматически
 * 
 * ВАЖНО: Firestore используется ТОЛЬКО как база данных для хранения.
 * Вся проверка оплаты выполняется в n8n.
 * 
 * @body {string} orderId - ID заказа для синхронизации
 * @body {string} userId - ID пользователя (опционально, для поиска подписки)
 */
app.post('/admin/sync-payment', async (req, res) => {
  try {
    const { orderId, userId } = req.body
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId обязателен'
      })
    }
    
    console.log('🔄 n8n-webhook-proxy: Ручная синхронизация платежа', { orderId, userId })
    
    // Логируем начало синхронизации
    await logN8NEvent('manual_sync_started', {
      orderId,
      userId: userId || null,
      initiatedBy: req.headers['x-user-id'] || 'unknown'
    }, 'info')
    
    // Загружаем настройки платежей
    const paymentSettings = await loadPaymentSettings()
    
    // Получаем webhook URL для проверки платежа
    const webhookUrl = getWebhookUrl('addClient', req)
    
    // Формируем данные для n8n workflow
    const syncData = {
      mode: 'verifyPayment',
      operation: 'syncPayment',
      orderId: orderId,
      userId: userId || null,
      paymentSettings: paymentSettings,
      manualSync: true // Флаг ручной синхронизации
    }
    
    // Вызываем n8n workflow для проверки платежа
    let n8nResult = null
    try {
      n8nResult = await callN8NWebhook(webhookUrl, syncData)
      
      // Логируем успешный вызов n8n
      await logN8NEvent('n8n_webhook_call', {
        webhookUrl,
        operation: 'syncPayment',
        orderId,
        success: true
      }, 'success')
      
      console.log('✅ n8n-webhook-proxy: n8n вернул результат синхронизации', {
        orderId,
        hasResult: !!n8nResult,
        resultStatus: n8nResult?.status
      })
    } catch (n8nError) {
      // Логируем ошибку вызова n8n
      await logN8NEvent('n8n_webhook_call', {
        webhookUrl,
        operation: 'syncPayment',
        orderId,
        success: false
      }, 'error', n8nError.message)
      
      console.error('❌ n8n-webhook-proxy: Ошибка вызова n8n для синхронизации', {
        orderId,
        error: n8nError.message
      })
      
      return res.status(500).json({
        success: false,
        error: 'Ошибка вызова n8n workflow',
        details: n8nError.message
      })
    }
    
    // Проверяем результат от n8n
    if (n8nResult && n8nResult.status === 'success' && n8nResult.payment) {
      const paymentData = n8nResult.payment
      
      // Если платеж успешен и есть данные для активации, активируем подписку
      if (paymentData.userId && paymentData.tariffId) {
        console.log('🔄 n8n-webhook-proxy: Платеж подтвержден, активируем подписку', {
          orderId,
          userId: paymentData.userId
        })
        
        try {
          await activateSubscriptionAfterPayment(paymentData)
          
          // Логируем успешную активацию
          await logN8NEvent('subscription_activated', {
            orderId,
            userId: paymentData.userId,
            subscriptionId: paymentData.subscriptionId || null,
            manualSync: true
          }, 'success')
          
          return res.json({
            success: true,
            message: 'Платеж синхронизирован и подписка активирована',
            orderId,
            payment: paymentData,
            activated: true
          })
        } catch (activationError) {
          // Логируем ошибку активации
          await logN8NEvent('subscription_activation_failed', {
            orderId,
            userId: paymentData.userId,
            error: activationError.message
          }, 'error', activationError.message)
          
          return res.status(500).json({
            success: false,
            error: 'Ошибка активации подписки',
            details: activationError.message,
            payment: paymentData
          })
        }
      } else {
        // Платеж найден, но нет данных для активации
        return res.json({
          success: true,
          message: 'Платеж найден, но нет данных для активации подписки',
          orderId,
          payment: paymentData,
          activated: false
        })
      }
    } else {
      // Платеж не найден или не оплачен
      await logN8NEvent('payment_not_found', {
        orderId,
        n8nResult: n8nResult
      }, 'warning', 'Платеж не найден или не оплачен')
      
      return res.json({
        success: false,
        message: 'Платеж не найден или не оплачен',
        orderId,
        n8nResult: n8nResult
      })
    }
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка ручной синхронизации платежа', {
      error: error.message,
      stack: error.stack
    })
    
    // Логируем общую ошибку
    await logN8NEvent('manual_sync_failed', {
      orderId: req.body?.orderId,
      error: error.message
    }, 'error', error.message)
    
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка синхронизации платежа'
    })
  }
})

// ========== Error Handling ==========

app.use((err, req, res, next) => {
  const isCors = err.message === 'Not allowed by CORS'
  if (isCors) {
    console.warn('⚠️ CORS rejected:', req.headers.origin || '(no origin)')
    return res.status(403).json({
      success: false,
      error: err.message,
    })
  }
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
  
  // Периодическая очистка устаревших флагов активации (каждые 10 минут)
  setInterval(async () => {
    try {
      await cleanupExpiredActivationLocks()
    } catch (error) {
      console.error('❌ Ошибка периодической очистки флагов активации', {
        error: error.message
      })
    }
  }, 10 * 60 * 1000) // 10 минут
  
  // Первая очистка через 1 минуту после старта
  setTimeout(async () => {
    try {
      await cleanupExpiredActivationLocks()
    } catch (error) {
      console.error('❌ Ошибка первоначальной очистки флагов активации', {
        error: error.message
      })
    }
  }, 60 * 1000) // 1 минута
})