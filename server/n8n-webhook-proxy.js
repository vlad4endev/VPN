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
import cookieParser from 'cookie-parser'
import compression from 'compression'
import axios from 'axios'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { fileURLToPath } from 'url'
import firebaseAdmin from 'firebase-admin'
import crypto, { randomUUID } from 'crypto'
import { sendTelegramMessage, getTelegramBotInfo, getTelegramChat, setTelegramWebhook, getTelegramWebhookInfo, setTelegramMenuButton, answerCallbackQuery, editMessageText } from './lib/telegram.js'
import { buildMainKeyboard } from './lib/telegram.keyboard.js'
import { createTelegramRouter } from './routes/telegram.routes.js'
import { createBotBuilderRouter } from './bot-builder/botbuilder.routes.js'
import { findScenario as findScenarioBotBuilder, loadScenariosIntoCache } from './bot-builder/botbuilder.service.js'
import { createAnalyticsRouter } from './analytics/analytics.routes.js'
import * as analyticsController from './analytics/analytics.controller.js'
import webpush from 'web-push'
import { getMetrics, metricsMiddleware } from './lib/metrics.js'
import { unifiedChat, PROVIDERS, PROVIDER_MODELS } from './lib/ai/index.js'
import { getXuiClient, createXuiClient } from './lib/xuiClient.js'
import { initStorage } from './storage.js'
import { generateUniqueSubId } from './lib/generateUniqueSubId.js'
import { generatePaymentLink as generatePaymentLinkFromService, generateOrderId, verifyYooMoneyWebhookSignature, buildRedirectUrl } from './payment/index.js'
import { installConsoleCapture } from './lib/consoleCapture.js'
import { getSystemLogs, clearSystemLogs, getSystemLogMax } from './lib/systemLogBuffer.js'

dotenv.config()
// Загружаем server/.env (при запуске из корня проекта корневой .env уже загружен; server/.env перезаписывает/дополняет)
const serverEnvPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env')
if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath, override: false })
}

// Capture all server-side console logs into an in-memory ring buffer
// so the admin UI can show them (Integrations → Logs).
// Disable via SYSTEM_LOG_CAPTURE_CONSOLE=0 if you don't want the overhead.
installConsoleCapture({
  enabled: process.env.SYSTEM_LOG_CAPTURE_CONSOLE !== '0',
})

/** Для операций с 3x-ui используем только xuiClient (n8n для 3x-ui не используется). */
function getXuiForVpn() {
  const xui = getXuiClient()
  return xui.configured ? xui : null
}

// Webhook-пути для исключения из latency per route (учёт только в metricsWebhook)
function isWebhookPath(path) {
  return /\/api\/n8n\/|\/api\/payment\/webhook|webhook/.test(path || '')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')

// Firebase Admin SDK для доступа к Firestore
let admin = null
let db = null

// Инициализация Firebase Admin SDK (асинхронная)
async function initFirebaseAdmin() {
  try {
    // Проверяем, не инициализирован ли уже
    if (firebaseAdmin.apps.length > 0) {
      admin = firebaseAdmin
      db = admin.firestore()
      console.log('✅ Firebase Admin SDK уже инициализирован')
      return
    }

    // Приоритет: файл (PATH или server/firebase-service-account.json) → KEY → CLIENT_EMAIL+PRIVATE_KEY
    let credential = null
    let projectId = process.env.FIREBASE_PROJECT_ID || ''
    let serviceAccount = null

    // Вариант 0: JSON-файл (PATH из env или файл по умолчанию server/firebase-service-account.json)
    const keyPathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    const defaultKeyPath = path.join(__dirname, 'firebase-service-account.json')
    const keyPath = keyPathEnv
      ? (path.isAbsolute(keyPathEnv) ? keyPathEnv : path.join(__dirname, keyPathEnv))
      : (fs.existsSync(defaultKeyPath) ? defaultKeyPath : null)
    if (keyPath && !credential) {
      try {
        const json = await readFile(keyPath, 'utf8')
        serviceAccount = JSON.parse(json)
        if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
        credential = firebaseAdmin.credential.cert(serviceAccount)
        if (serviceAccount.project_id) projectId = projectId || serviceAccount.project_id
        console.log('📝 Используется ключ из файла:', keyPathEnv ? keyPathEnv : 'firebase-service-account.json', '(путь:', keyPath + ')')
      } catch (err) {
        console.warn('⚠️ Ошибка чтения ключа из файла:', keyPath, err.message)
      }
    }

    // Вариант 1: Service Account JSON из env (одной строкой или с переносами)
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (serviceAccountKey && !credential) {
      try {
        serviceAccount = JSON.parse(serviceAccountKey)
      } catch {
        try {
          serviceAccount = JSON.parse(serviceAccountKey.replace(/\r?\n/g, ''))
        } catch (err) {
          console.log('⚠️ Ошибка парсинга FIREBASE_SERVICE_ACCOUNT_KEY:', err.message)
          console.log('   Подсказка: сохраните ключ в server/firebase-service-account.json (будет подхвачен автоматически)')
        }
      }
      if (serviceAccount) {
        try {
          if (serviceAccount.private_key) {
            // Нормализация PEM: literal \n → перенос строки (разные способы экранирования в env)
            let pk = serviceAccount.private_key
            if (typeof pk === 'string') {
              pk = pk.replace(/\\n/g, '\n').replace(/\\\\n/g, '\n')
              serviceAccount.private_key = pk
            }
          }
          credential = firebaseAdmin.credential.cert(serviceAccount)
          if (serviceAccount.project_id) projectId = projectId || serviceAccount.project_id
          console.log('📝 Используется FIREBASE_SERVICE_ACCOUNT_KEY')
        } catch (err) {
          console.log('⚠️ Ошибка инициализации credential из FIREBASE_SERVICE_ACCOUNT_KEY:', err.message)
          console.log('   Рекомендация: положите JSON в server/firebase-service-account.json — экранирование в .env часто ломает private_key')
        }
      }
    }

    // Вариант 2: Отдельные переменные (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
    if (!credential) {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
      if (clientEmail && privateKey) {
        const normalizedPrivateKey = privateKey.replace(/\\n/g, '\n')
        credential = firebaseAdmin.credential.cert({
          projectId: projectId || 'skypathvpn',
          clientEmail,
          privateKey: normalizedPrivateKey,
        })
        if (!projectId) projectId = process.env.FIREBASE_PROJECT_ID || 'skypathvpn'
        console.log('📝 Используется FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY')
      }
    }

    if (!projectId && serviceAccount && serviceAccount.project_id) projectId = serviceAccount.project_id

    if (credential && projectId) {
      firebaseAdmin.initializeApp({
        credential,
        projectId,
      })
      admin = firebaseAdmin
      db = admin.firestore()
      console.log('✅ Firebase Admin SDK инициализирован (project:', projectId, ')')
    } else if (credential) {
      console.log('⚠️ Firebase Admin SDK: задайте FIREBASE_PROJECT_ID в server/.env (или положите ключ в server/firebase-service-account.json с project_id)')
    } else {
      console.log('⚠️ Firebase Admin SDK не настроен: положите ключ в server/firebase-service-account.json или задайте FIREBASE_SERVICE_ACCOUNT_KEY в server/.env')
      console.log('   Админ-API и Telegram будут возвращать 503 до настройки.')
    }
  } catch (err) {
    console.log('⚠️ Firebase Admin SDK недоступен:', err.message)
  }
}

// Инициализируем Firebase Admin SDK при старте
const app = express()

// ========== Безопасность ==========

app.use(helmet({
  contentSecurityPolicy: false, // Упрощаем для разработки
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}))

// Serve /assets/* and favicon BEFORE CORS so static resources are never blocked (avoids 403 + application/json for JS/CSS)
if (fs.existsSync(distPath)) {
  const assetsDir = path.join(distPath, 'assets')
  if (fs.existsSync(assetsDir)) {
    app.use('/assets', express.static(assetsDir, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0' }))
  }
  const faviconSvgPath = path.join(distPath, 'favicon.svg')
  if (fs.existsSync(faviconSvgPath)) {
    app.get('/favicon.ico', (req, res) => {
      res.type('image/svg+xml')
      res.sendFile(faviconSvgPath, (err) => { if (err) res.status(404).end() })
    })
  }
}

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
      'https://admin.skypath.fun',
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
    // Запросы без Origin (Postman, curl, SSR, Telegram WebView и др.)
    if (!origin || origin === 'null') {
      return callback(null, true)
    }
    // Явно разрешённые origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    // Домен сайта в любом поддомене (skypath.fun, www, admin и т.д.)
    if (origin.includes('skypath.fun')) {
      return callback(null, true)
    }
    // Telegram WebView / Mini App (иногда приходит web.telegram.org или t.me)
    if (origin.includes('telegram.org') || origin.includes('t.me')) {
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

// Gzip compression для JSON и текстовых ответов
app.use(compression())

// Парсинг JSON и cookie (для TMA sessionToken — httpOnly)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// Метрики запросов (latency, 4xx/5xx, activeRequests)
app.use(metricsMiddleware({ isWebhookPath }))

// ========== Telegram Mini App: валидация initData (опционально, не ломает старых клиентов) ==========
const TELEGRAM_BOT_TOKEN_ENV = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()
// Telegram: secret_key = HMAC_SHA256 with key "WebAppData", message = bot_token (see core.telegram.org/bots/webapps)
const TELEGRAM_WEBAPP_SECRET = TELEGRAM_BOT_TOKEN_ENV
  ? crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN_ENV).digest()
  : null

/** Максимальный возраст initData (мс). Telegram рекомендует проверять; по умолчанию 24 часа. */
const TELEGRAM_INIT_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Валидирует initData от Telegram Web App (HMAC-SHA256).
 * @param {string} initData - строка query string из Telegram.WebApp.initData
 * @returns {Object|null} - объект с полями (user, auth_date, ...) или null при невалидных данных
 */
function validateTelegramInitData(initData) {
  const result = validateTelegramInitDataWithReason(initData)
  return result.ok ? result.data : null
}

/**
 * Валидация initData с причиной ошибки (для ответов API).
 * @param {string} initData - строка query string из Telegram.WebApp.initData
 * @param {Buffer|null} [secretOverride] - HMAC-секрет (WebAppData); если передан, используется вместо TELEGRAM_WEBAPP_SECRET (для токена из админки)
 * @returns {{ ok: true, data: Object } | { ok: false, reason: string, message: string }}
 */
function validateTelegramInitDataWithReason(initData, secretOverride) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, reason: 'empty', message: 'initData не передан или пустой' }
  }
  const trimmed = initData.trim()
  if (!trimmed) {
    return { ok: false, reason: 'empty', message: 'initData пустой' }
  }
  const secret = secretOverride != null ? secretOverride : TELEGRAM_WEBAPP_SECRET
  if (!secret || (Buffer.isBuffer(secret) && secret.length === 0)) {
    console.warn('Telegram auth: токен бота не задан (ни в .env, ни в настройках Telegram в админ-панели)')
    return { ok: false, reason: 'no_token', message: 'Сервер не настроен для входа через Telegram. Задайте токен бота в .env или в настройках Telegram в админ-панели.' }
  }
  try {
    const data = new URLSearchParams(trimmed)
    const hash = data.get('hash')
    if (!hash) {
      return { ok: false, reason: 'no_hash', message: 'В данных Telegram отсутствует подпись (hash). Откройте приложение заново из меню бота.' }
    }
    // data_check_string должен совпадать с тем, что подписал Telegram: пары key=value в исходном виде (без декодирования).
    // URLSearchParams.entries() возвращает декодированные значения — из-за этого подпись не сходилась при наличии % в value.
    const pairs = trimmed.split('&')
      .map((s) => {
        const idx = s.indexOf('=')
        if (idx < 0) return [s, '']
        return [s.slice(0, idx), s.slice(idx + 1)]
      })
      .filter(([k]) => k !== 'hash')
    pairs.sort(([a], [b]) => a.localeCompare(b))
    const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n')
    const computedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
    if (computedHash !== hash) {
      console.warn('Telegram auth: неверная подпись initData (проверьте, что TELEGRAM_BOT_TOKEN соответствует боту Mini App)')
      return { ok: false, reason: 'invalid_hash', message: 'Неверная подпись данных. Убедитесь, что открываете приложение из того же бота, для которого настроен сервер.' }
    }
    const parsed = Object.fromEntries(data)
    if (parsed.user && typeof parsed.user === 'string') {
      try {
        parsed.user = JSON.parse(parsed.user)
      } catch (_) {
        return { ok: false, reason: 'parse_error', message: 'Не удалось прочитать данные пользователя Telegram' }
      }
    }
    if (!parsed.user || !parsed.user.id) {
      return { ok: false, reason: 'no_user', message: 'В данных Telegram нет пользователя' }
    }
    const authDate = parsed.auth_date ? parseInt(parsed.auth_date, 10) : 0
    if (authDate && TELEGRAM_INIT_DATA_MAX_AGE_MS > 0) {
      const age = Date.now() - authDate * 1000
      if (age > TELEGRAM_INIT_DATA_MAX_AGE_MS || age < 0) {
        return { ok: false, reason: 'expired', message: 'Сессия Telegram истекла. Откройте приложение заново из меню бота.' }
      }
    }
    return { ok: true, data: parsed }
  } catch (e) {
    console.warn('Telegram auth: ошибка разбора initData', e.message)
    return { ok: false, reason: 'parse_error', message: 'Ошибка проверки данных Telegram. Попробуйте открыть приложение заново.' }
  }
}

app.use(async (req, res, next) => {
  const initData = req.headers['x-telegram-initdata'] || req.query.initData || ''
  if (!initData) return next()
  try {
    const result = await validateTelegramInitDataWithReasonAsync(initData)
    if (result.ok) {
      req.telegramUser = result.data
      if (result.data.user && result.data.user.id) {
        logTelegramAuth('middleware_user', { tgUserId: result.data.user.id, path: req.path })
      }
    } else {
      logTelegramAuth('middleware_initData_fail', { reason: result.reason, path: req.path })
    }
  } catch (e) {
    logTelegramAuth('error', { step: 'middleware', message: e.message })
    console.warn('Telegram initData middleware:', e.message)
  }
  next()
})

/** Срок действия сессии TMA (мс). По умолчанию 90 дней. */
const TELEGRAM_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000

/** Буфер последних логов TMA для просмотра в админке (Интеграции → Telegram → Просмотреть логи). */
const TMA_LOG_BUFFER_MAX = 200
const tmaLogBuffer = []

/** Лог действий входа и операций через Telegram (в консоль + буфер для админки). События: auth_success, invalid_signature, expired_initData, firebase_error, auth_fail, initData_fail, session_fail, error. */
function logTelegramAuth(event, data = {}) {
  let severity = data.severity
  if (severity === undefined) {
    if (event === 'error' || event === 'firebase_error') severity = 'error'
    else if (event === 'invalid_signature') severity = 'error'
    else if (event === 'expired_initData' || event === 'session_fail') severity = 'warn'
    else if (event === 'auth_fail') severity = 'warn'
    else if (event === 'initData_fail') {
      const reason = data.reason || ''
      severity = (reason === 'invalid_signature' || reason === 'no_hash') ? 'error' : (reason === 'expired_initData' ? 'warn' : 'warn')
    } else severity = 'info'
  }
  const payload = { ts: new Date().toISOString(), event, severity, ...data }
  const line = `[TMA] ${JSON.stringify(payload)}`
  if (severity === 'error' || severity === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
  tmaLogBuffer.push(payload)
  if (tmaLogBuffer.length > TMA_LOG_BUFFER_MAX) tmaLogBuffer.shift()
}

/** Последние записи лога TMA (для GET /api/admin/telegram/logs). */
function getTmaLogBuffer(limit = 100) {
  const n = Math.min(Number(limit) || 100, TMA_LOG_BUFFER_MAX)
  return tmaLogBuffer.slice(-n)
}

/**
 * Авторизация через Telegram Mini App.
 * POST /api/telegram/auth
 * 1) По сессии: Header X-Telegram-Session-Token или body.sessionToken — сразу определяет пользователя без initData.
 * 2) По initData: Header X-Telegram-InitData или body.initData — валидация, поиск/создание по tgId, выдача customToken и sessionToken.
 * В ответе: { success, customToken [, sessionToken, sessionTokenExpiresAt ] }.
 * Обработчик в server/routes/telegram.routes.js (POST /auth).
 */

/**
 * Telegram Login Widget: валидация hash (https://core.telegram.org/widgets/login#checking-authorization).
 * Возвращает { ok: true, tgId } или { ok: false, reason, message }.
 */
async function validateTelegramWidgetData(widgetUser, botToken) {
  if (!widgetUser || typeof widgetUser !== 'object' || !botToken) {
    return { ok: false, reason: 'no_token', message: 'Токен бота не задан' }
  }
  const hash = widgetUser.hash
  if (!hash) return { ok: false, reason: 'no_hash', message: 'В данных виджета нет подписи' }
  const keys = Object.keys(widgetUser).filter(k => k !== 'hash').sort()
  const dataCheckString = keys.map(k => `${k}=${widgetUser[k]}`).join('\n')
  const secretKey = crypto.createHash('sha256').update(botToken).digest()
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  if (computedHash !== hash) {
    return { ok: false, reason: 'invalid_hash', message: 'Неверная подпись данных виджета' }
  }
  const authDate = parseInt(widgetUser.auth_date, 10)
  if (widgetUser.auth_date == null || widgetUser.auth_date === '' || Number.isNaN(authDate)) {
    return { ok: false, reason: 'no_auth_date', message: 'Отсутствует или невалиден auth_date в данных виджета' }
  }
  if (Date.now() / 1000 - authDate > TELEGRAM_INIT_DATA_MAX_AGE_MS / 1000) {
    return { ok: false, reason: 'expired', message: 'Сессия виджета истекла. Авторизуйтесь заново.' }
  }
  const tgId = String(widgetUser.id || '')
  if (!tgId) return { ok: false, reason: 'no_user', message: 'Нет id пользователя' }
  return { ok: true, tgId, user: widgetUser }
}

/**
 * Авторизация через Telegram Login Widget (для входа с обычного сайта, не Mini App).
 * POST /api/telegram/auth-widget
 * Body: { id, first_name, last_name, username, photo_url, auth_date, hash } — данные из onauth callback виджета.
 * Обработчик в server/routes/telegram.routes.js (POST /auth-widget).
 */

/**
 * Вход по логину, email или Telegram ID: по строке q вернуть email пользователя для signInWithEmailAndPassword.
 * GET /api/auth/resolve-login?q=loginOrEmailOrTgId
 * Ответ: { email } или 404.
 */
app.get('/api/auth/resolve-login', async (req, res) => {
  const q = (req.query.q || '').toString().trim()
  if (!q) return res.status(400).json({ error: 'Укажите q (логин, email или ID)' })
  if (!db) {
    try { await initFirebaseAdmin() } catch (_) {}
    if (!db) return res.status(503).json({ error: 'Сервис недоступен' })
  }
  const appId = process.env.APP_ID || 'skyputh'
  const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
  const qLower = q.toLowerCase()
  try {
    const byLogin = await usersRef.where('login', '==', qLower).limit(1).get()
    if (!byLogin.empty) {
      const email = byLogin.docs[0].data().email
      if (email) return res.json({ email })
    }
    const byEmail = await usersRef.where('email', '==', qLower).limit(1).get()
    if (!byEmail.empty) {
      const email = byEmail.docs[0].data().email
      if (email) return res.json({ email })
    }
    // Поиск по Telegram ID (поле tgId в users_v4)
    const byTgId = await usersRef.where('tgId', '==', q.trim()).limit(1).get()
    if (!byTgId.empty) {
      const email = byTgId.docs[0].data().email
      if (email) return res.json({ email })
    }
    // Документ с id tg_<id> (пользователи, созданные через Telegram)
    if (/^\d+$/.test(q.trim())) {
      const docRef = usersRef.doc(`tg_${q.trim()}`)
      const docSnap = await docRef.get()
      if (docSnap.exists) {
        const email = docSnap.data().email
        if (email) return res.json({ email })
      }
    }
    return res.status(404).json({ error: 'Пользователь не найден' })
  } catch (err) {
    console.error('❌ GET /api/auth/resolve-login:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * Проверка доступности логина и email при регистрации.
 * GET /api/auth/check-identifier?login=xxx&email=yyy
 * Ответ: { loginAvailable: boolean, emailAvailable: boolean }
 */
app.get('/api/auth/check-identifier', async (req, res) => {
  const login = (req.query.login || '').toString().trim().toLowerCase()
  const email = (req.query.email || '').toString().trim().toLowerCase()
  if (!db) {
    try { await initFirebaseAdmin() } catch (_) {}
    if (!db) return res.status(503).json({ error: 'Сервис недоступен' })
  }
  const appId = process.env.APP_ID || 'skyputh'
  const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
  try {
    let loginAvailable = true
    let emailAvailable = true
    if (login) {
      const snap = await usersRef.where('login', '==', login).limit(1).get()
      loginAvailable = snap.empty
    }
    if (email) {
      const snap = await usersRef.where('email', '==', email).limit(1).get()
      emailAvailable = snap.empty
    }
    return res.json({ loginAvailable, emailAvailable })
  } catch (err) {
    console.error('❌ GET /api/auth/check-identifier:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * Установка пароля по логину (страница по ссылке: ввод логина → создание пароля).
 * POST /api/auth/set-password-by-login
 * Body: { login: string, newPassword: string }
 * Находит пользователя по login в users_v4, обновляет пароль в Firebase Auth.
 */
app.post('/api/auth/set-password-by-login', express.json(), async (req, res) => {
  const login = (req.body.login || '').toString().trim().toLowerCase()
  const newPassword = (req.body.newPassword || '').toString()
  if (!login) return res.status(400).json({ error: 'Укажите логин' })
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' })
  if (newPassword.length > 128) return res.status(400).json({ error: 'Пароль слишком длинный' })
  if (!admin || !db) {
    try { await initFirebaseAdmin() } catch (_) {}
    if (!admin || !db) return res.status(503).json({ error: 'Сервис недоступен' })
  }
  const appId = process.env.APP_ID || 'skyputh'
  const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
  try {
    const snap = await usersRef.where('login', '==', login).limit(1).get()
    if (snap.empty) return res.status(404).json({ error: 'Пользователь с таким логином не найден' })
    const uid = snap.docs[0].id
    await admin.auth().updateUser(uid, { password: newPassword })
    return res.json({ success: true, message: 'Пароль успешно установлен' })
  } catch (err) {
    if (err.code === 'auth/weak-password') return res.status(400).json({ error: 'Пароль слишком простой' })
    console.error('❌ POST /api/auth/set-password-by-login:', err.message)
    return res.status(500).json({ error: err.message || 'Ошибка установки пароля' })
  }
})

/**
 * Создать документ пользователя в Firestore, если его нет (для аккаунтов Firebase Auth без записи в users_v4).
 * POST /api/auth/ensure-firestore-user
 * Header: Authorization: Bearer <Firebase ID token>
 * Ответ: { success: true, user: { id, email, name, role, ... } } или 404 если документ уже есть (клиент просто загрузит его).
 */
app.post('/api/auth/ensure-firestore-user', express.json(), async (req, res) => {
  const authResult = await verifyIdToken(req, res)
  if (!authResult?.ok) return
  if (!db || !admin) return res.status(503).json({ success: false, error: 'Сервис недоступен' })

  const uid = authResult.uid
  const userRef = db.doc(`artifacts/${APP_ID}/public/data/users_v4/${uid}`)

  try {
    const snap = await userRef.get()
    if (snap.exists) {
      return res.json({ success: true, alreadyExists: true, user: { id: uid, ...snap.data() } })
    }

    const authUser = await admin.auth().getUser(uid)
    const email = (authUser.email || '').trim()
    const displayName = (authUser.displayName || '').trim()
    const photoURL = authUser.photoURL || null

    const subId = await generateUniqueSubId(db, APP_ID)

    const now = new Date().toISOString()
    const newUserData = {
      email: email || null,
      name: displayName || email || '',
      phone: '',
      role: 'user',
      plan: 'free',
      uuid: crypto.randomUUID ? crypto.randomUUID() : randomUUIDFallback(),
      subId,
      expiresAt: null,
      tariffName: '',
      tariffId: '',
      photoURL,
      language: 'ru',
      createdAt: now,
      updatedAt: now,
    }
    await userRef.set(newUserData)
    console.log('✅ ensure-firestore-user: создан документ для uid', uid, email || '(no email)')
    return res.json({ success: true, created: true, user: { id: uid, ...newUserData } })
  } catch (err) {
    console.error('❌ POST /api/auth/ensure-firestore-user:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

function randomUUIDFallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Установка пароля для текущего пользователя (в т.ч. привязанного к Google).
 * Позволяет потом входить по email и паролю.
 * POST /api/auth/set-password
 * Body: { idToken: string, newPassword: string }
 */
app.post('/api/auth/set-password', express.json(), async (req, res) => {
  const idToken = (req.body.idToken || '').toString().trim()
  const newPassword = (req.body.newPassword || '').toString()
  if (!idToken) return res.status(400).json({ error: 'Укажите idToken' })
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' })
  if (newPassword.length > 128) return res.status(400).json({ error: 'Пароль слишком длинный' })
  if (!admin) {
    try { await initFirebaseAdmin() } catch (_) {}
    if (!admin) return res.status(503).json({ error: 'Сервис недоступен' })
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken)
    const uid = decoded.uid
    await admin.auth().updateUser(uid, { password: newPassword })
    return res.json({ success: true, message: 'Пароль успешно установлен. Теперь вы можете входить по email и паролю.' })
  } catch (err) {
    if (err.code === 'auth/weak-password') return res.status(400).json({ error: 'Пароль слишком простой' })
    if (err.code === 'auth/id-token-expired') return res.status(401).json({ error: 'Сессия истекла. Войдите снова.' })
    console.error('❌ POST /api/auth/set-password:', err.message)
    return res.status(500).json({ error: err.message || 'Ошибка установки пароля' })
  }
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
  updateClient: process.env.N8N_WEBHOOK_UPDATE_CLIENT || `${N8N_BASE_URL}/webhook/${DEFAULT_WEBHOOK_ID}`,
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

const NOTIFICATION_TEMPLATES_PATH = `artifacts/${process.env.APP_ID || 'skyputh'}/public/data/notification_templates`

/** Подстановка переменных в шаблон. Переменные: {{user.name}}, {{user.email}}, {{user.login}}, {{user.phone}}, {{user.tariffName}}, {{user.plan}}, {{user.expiresAt}}, {{user.subId}}, {{paymentLink}}. */
function substituteTemplate(template, user, extra = {}) {
  if (typeof template !== 'string') return ''
  const u = user && typeof user === 'object' ? user : {}
  const expiresAt = u.expiresAt != null ? (typeof u.expiresAt === 'number' ? new Date(u.expiresAt) : new Date(u.expiresAt)) : null
  const paymentLink = extra.paymentLink != null ? String(extra.paymentLink) : ''
  const vars = {
    'user.name': (u.name || u.login || u.email || '').toString().trim(),
    'user.email': (u.email || '').toString().trim(),
    'user.login': (u.login || u.email || '').toString().trim(),
    'user.phone': (u.phone || '').toString().trim(),
    'user.tariffName': (u.tariffName || '').toString().trim(),
    'user.plan': (u.plan || '').toString().trim(),
    'user.expiresAt': expiresAt ? expiresAt.toLocaleDateString('ru-RU') : '',
    'user.subId': (u.subId || '').toString().trim(),
    paymentLink,
  }
  let out = template
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key.replace(/\./g, '\\.')}\\s*\\}\\}`, 'g'), value)
  }
  return out
}

/** Единый APP_ID для Telegram router и артефактов; задаётся через process.env.APP_ID или один допустимый fallback. */
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

/** Кэш uid→admin (только положительные результаты, TTL 5 мин). Снижает Firestore reads. */
const adminCache = new Map() // uid -> { expiresAt: number }
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000
const ADMIN_CACHE_MAX_SIZE = 500

function cleanupAdminCache() {
  const now = Date.now()
  for (const [uid, entry] of adminCache.entries()) {
    if (now >= entry.expiresAt) adminCache.delete(uid)
  }
  while (adminCache.size > ADMIN_CACHE_MAX_SIZE) {
    const firstKey = adminCache.keys().next().value
    if (firstKey) adminCache.delete(firstKey)
  }
}

/**
 * Проверить Firebase ID token и убедиться, что пользователь — админ (claim или роль в Firestore).
 * Возвращает { ok: true, uid } или отправляет 401/403 и возвращает { ok: false }.
 */
async function ensureAdmin(req, res) {
  if (!admin || !db) {
    try {
      await initFirebaseAdmin()
    } catch (_) {}
    if (!admin || !db) {
      res.status(503).json({
        success: false,
        error: 'Firebase не настроен. Добавьте server/firebase-service-account.json или FIREBASE_SERVICE_ACCOUNT_KEY в server/.env и перезапустите backend.',
      })
      return { ok: false }
    }
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
  const cached = adminCache.get(uid)
  if (cached && Date.now() < cached.expiresAt) {
    return { ok: true, uid }
  }
  if (adminCache.size >= ADMIN_CACHE_MAX_SIZE) cleanupAdminCache()
  if (decoded.admin === true) {
    adminCache.set(uid, { expiresAt: Date.now() + ADMIN_CACHE_TTL_MS })
    return { ok: true, uid }
  }
  const clientAppId = (req.headers['x-app-id'] || req.headers['X-App-Id'] || '').trim() || null
  const appIdsToTry = [
    clientAppId,
    APP_ID,
    'skyputh',
    'skypathvpn',
    process.env.FIREBASE_PROJECT_ID,
  ].filter(Boolean).filter((id, i, arr) => arr.indexOf(id) === i)

  const isAdminRole = (value) => {
    const v = String(value ?? '').trim().toLowerCase()
    return v === 'admin' || v === 'админ'
  }

  for (const appId of appIdsToTry) {
    try {
      const userRef = db.doc(`artifacts/${appId}/public/data/users_v4/${uid}`)
      const snap = await userRef.get()
      if (snap.exists) {
        const data = snap.data()
        const role = data.role
        if (isAdminRole(role)) {
          if (adminCache.size >= ADMIN_CACHE_MAX_SIZE) cleanupAdminCache()
          adminCache.set(uid, { expiresAt: Date.now() + ADMIN_CACHE_TTL_MS })
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
            adminCache.set(uid, { expiresAt: Date.now() + ADMIN_CACHE_TTL_MS })
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
      adminCache.set(uid, { expiresAt: Date.now() + ADMIN_CACHE_TTL_MS })
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
 * Реферальная система: резолв кода в inviterId (без аутентификации — для регистрации).
 * GET /api/referral/resolve?code=ABC12345
 */
app.get('/api/referral/resolve', async (req, res) => {
  if (!db) {
    return res.status(503).json({ success: false, error: 'Firestore недоступен' })
  }
  const code = (req.query.code || '').trim()
  if (!code || code.length < 6) {
    return res.status(400).json({ success: false, error: 'Неверный или слишком короткий код' })
  }
  try {
    const usersCol = `artifacts/${APP_ID}/public/data/users_v4`
    const snap = await db.collection(usersCol).where('referralCode', '==', code).limit(1).get()
    if (snap.empty) {
      return res.status(404).json({ success: false, error: 'Код не найден' })
    }
    return res.json({ inviterId: snap.docs[0].id })
  } catch (err) {
    console.error('GET /api/referral/resolve:', err)
    return res.status(500).json({ success: false, error: err.message || 'Ошибка сервера' })
  }
})

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

/** Получить список uid по фильтру: all | plan | tariff. */
async function resolveRecipientIds(dbInst, appId, filter, plan, tariffId) {
  const usersRef = dbInst.collection(`artifacts/${appId}/public/data/users_v4`)
  let q = usersRef
  if (filter === 'plan' && plan) {
    q = q.where('plan', '==', String(plan).trim())
  } else if (filter === 'tariff' && tariffId) {
    q = q.where('tariffId', '==', String(tariffId).trim())
  }
  const snap = await q.get()
  return snap.docs.map((d) => d.id).filter(Boolean)
}

app.get('/api/admin/notifications/templates', async (req, res) => {
  const authResult = await ensureAdmin(req, res)
  if (!authResult.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Firestore недоступен' })
  try {
    const snap = await db.collection(NOTIFICATION_TEMPLATES_PATH).orderBy('createdAt', 'desc').get()
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    res.json({ success: true, templates: list })
  } catch (err) {
    console.error('GET /api/admin/notifications/templates:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/admin/notifications/templates', express.json(), async (req, res) => {
  const authResult = await ensureAdmin(req, res)
  if (!authResult.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Firestore недоступен' })
  const { name, type, titleTemplate, bodyTemplate, overviewTemplate, buttons } = req.body || {}
  if (!name || !type || !titleTemplate || !bodyTemplate) {
    return res.status(400).json({ success: false, error: 'Обязательны: name, type, titleTemplate, bodyTemplate' })
  }
  try {
    const now = new Date().toISOString()
    const doc = await db.collection(NOTIFICATION_TEMPLATES_PATH).add({
      name: String(name).trim(),
      type: String(type).trim(),
      titleTemplate: String(titleTemplate).trim(),
      bodyTemplate: String(bodyTemplate).trim(),
      overviewTemplate: overviewTemplate != null ? String(overviewTemplate).trim() || null : null,
      buttons: Array.isArray(buttons) ? buttons.filter((b) => b && (b.label || b.url)).map((b) => ({ label: String(b.label || '').trim(), url: String(b.url || '').trim() })) : [],
      createdAt: now,
      updatedAt: now,
    })
    res.status(201).json({ success: true, id: doc.id })
  } catch (err) {
    console.error('POST /api/admin/notifications/templates:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.patch('/api/admin/notifications/templates/:id', express.json(), async (req, res) => {
  const authResult = await ensureAdmin(req, res)
  if (!authResult.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Firestore недоступен' })
  const { id } = req.params
  const { name, type, titleTemplate, bodyTemplate, overviewTemplate, buttons } = req.body || {}
  try {
    const ref = db.doc(`${NOTIFICATION_TEMPLATES_PATH}/${id}`)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Шаблон не найден' })
    const updates = { updatedAt: new Date().toISOString() }
    if (name !== undefined) updates.name = String(name).trim()
    if (type !== undefined) updates.type = String(type).trim()
    if (titleTemplate !== undefined) updates.titleTemplate = String(titleTemplate).trim()
    if (bodyTemplate !== undefined) updates.bodyTemplate = String(bodyTemplate).trim()
    if (overviewTemplate !== undefined) updates.overviewTemplate = overviewTemplate != null ? String(overviewTemplate).trim() || null : null
    if (buttons !== undefined) updates.buttons = Array.isArray(buttons) ? buttons.filter((b) => b && (b.label || b.url)).map((b) => ({ label: String(b.label || '').trim(), url: String(b.url || '').trim() })) : []
    await ref.update(updates)
    res.json({ success: true })
  } catch (err) {
    console.error('PATCH /api/admin/notifications/templates/:id:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.delete('/api/admin/notifications/templates/:id', async (req, res) => {
  const authResult = await ensureAdmin(req, res)
  if (!authResult.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Firestore недоступен' })
  const { id } = req.params
  try {
    const ref = db.doc(`${NOTIFICATION_TEMPLATES_PATH}/${id}`)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Шаблон не найден' })
    await ref.delete()
    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/admin/notifications/templates/:id:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * Рассылка уведомлений (шаблоны, фильтры, кнопки).
 * POST /api/admin/notifications/broadcast
 * Body: userIds? | recipientFilter (userIds|all|plan|tariff), plan?, tariffId?, templateId?, type?, title?, body?, overview?, buttons?
 */
app.post('/api/admin/notifications/broadcast', async (req, res) => {
  const authResult = await ensureAdmin(req, res)
  if (!authResult.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Firestore недоступен' })
  const baseUrl = (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host'])
    ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
    : (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')
  const paymentLink = baseUrl ? `${baseUrl}/#dashboard` : '/#dashboard'
  const appId = process.env.APP_ID || 'skyputh'
  const body = req.body || {}
  let userIds = Array.isArray(body.userIds) ? body.userIds.filter(Boolean) : []
  const recipientFilter = (body.recipientFilter || (userIds.length > 0 ? 'userIds' : 'all')).toString()
  const plan = (body.plan || '').toString().trim()
  const tariffId = (body.tariffId || '').toString().trim()
  const templateId = (body.templateId || '').toString().trim()
  const type = (body.type || 'admin_broadcast').toString().trim()
  let title = (body.title || '').toString().trim()
  let bodyText = (body.body || '').toString().trim()
  let overview = body.overview != null ? String(body.overview).trim() || null : null
  let buttons = Array.isArray(body.buttons) ? body.buttons.filter((b) => b && (b.label || b.url)).map((b) => ({ label: String(b.label || '').trim(), url: String(b.url || '').trim() })) : []

  if (recipientFilter !== 'userIds') {
    userIds = await resolveRecipientIds(db, appId, recipientFilter, plan, tariffId)
  }
  if (userIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Нет получателей. Укажите userIds, либо фильтр all/plan/tariff с plan или tariffId.' })
  }

  let template = null
  if (templateId) {
    const tSnap = await db.doc(`${NOTIFICATION_TEMPLATES_PATH}/${templateId}`).get()
    if (!tSnap.exists) return res.status(404).json({ success: false, error: 'Шаблон не найден' })
    template = { id: tSnap.id, ...tSnap.data() }
    if (!title) title = template.titleTemplate || ''
    if (!bodyText) bodyText = template.bodyTemplate || ''
    if (overview == null && template.overviewTemplate != null) overview = template.overviewTemplate
    if (buttons.length === 0 && Array.isArray(template.buttons) && template.buttons.length > 0) buttons = template.buttons
  }

  if (!title || !bodyText) {
    return res.status(400).json({ success: false, error: 'Обязательны title и body (или выберите шаблон)' })
  }

  const linkUrl = paymentLink
  let sent = 0
  let failed = 0
  const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
  for (const uid of userIds) {
    const uidStr = String(uid)
    let userData = { id: uidStr }
    if (template || buttons.some((b) => (b.url || '').includes('{{'))) {
      try {
        const uSnap = await usersRef.doc(uidStr).get()
        if (uSnap.exists) userData = { id: uSnap.id, ...uSnap.data() }
      } catch (_) {}
    }
    const extra = { paymentLink }
    const finalTitle = substituteTemplate(title, userData, extra)
    const finalBody = substituteTemplate(bodyText, userData, extra)
    const finalOverview = overview != null ? substituteTemplate(overview, userData, extra) : null
    const finalButtons = buttons.map((b) => ({ label: substituteTemplate(b.label, userData, extra), url: substituteTemplate(b.url, userData, extra) }))
    const data = finalButtons.length > 0 ? { buttons: finalButtons } : null
    const ok = await createNotification({
      userId: uidStr,
      type,
      title: finalTitle,
      body: finalBody,
      overview: finalOverview,
      data,
    })
    if (ok) {
      sent += 1
      const pushPayload = { title: finalTitle, body: finalBody.slice(0, 200), url: linkUrl, type: 'notification', notificationType: type }
      await sendWebPushToUser(uidStr, pushPayload)
    } else {
      failed += 1
    }
  }
  if (failed > 0) {
    notifyAdminError({
      source: 'broadcast',
      message: `Рассылка: отправлено ${sent}, ошибок ${failed}`,
      severity: failed === userIds.length ? 'high' : 'medium',
    }).catch((err) => console.warn('notifyAdminError broadcast:', err?.message))
  }
  res.json({ success: true, sent, failed, total: userIds.length })
})

/**
 * Отправить одно уведомление пользователю (из карточки пользователя).
 * POST /api/admin/notifications/send-one
 */
app.post('/api/admin/notifications/send-one', express.json(), async (req, res) => {
  const authResult = await ensureAdmin(req, res)
  if (!authResult.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Firestore недоступен' })
  const baseUrl = (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host'])
    ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
    : (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')
  const paymentLink = baseUrl ? `${baseUrl}/#dashboard` : '/#dashboard'
  const appId = process.env.APP_ID || 'skyputh'
  const { userId, templateId, type: typeReq, title: titleReq, body: bodyReq, overview: overviewReq, buttons: buttonsReq } = req.body || {}
  const uid = (userId || '').toString().trim()
  if (!uid) return res.status(400).json({ success: false, error: 'Укажите userId' })
  const type = (typeReq || 'admin_broadcast').toString().trim()
  let title = (titleReq || '').toString().trim()
  let bodyText = (bodyReq || '').toString().trim()
  let overview = overviewReq != null ? String(overviewReq).trim() || null : null
  let buttons = Array.isArray(buttonsReq) ? buttonsReq.filter((b) => b && (b.label || b.url)).map((b) => ({ label: String(b.label || '').trim(), url: String(b.url || '').trim() })) : []
  let userData = { id: uid }
  const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
  try {
    const uSnap = await usersRef.doc(uid).get()
    if (uSnap.exists) userData = { id: uSnap.id, ...uSnap.data() }
  } catch (_) {}
  const extra = { paymentLink }
  if (templateId) {
    const tSnap = await db.doc(`${NOTIFICATION_TEMPLATES_PATH}/${templateId}`).get()
    if (!tSnap.exists) return res.status(404).json({ success: false, error: 'Шаблон не найден' })
    const t = tSnap.data()
    title = substituteTemplate(t.titleTemplate || '', userData, extra)
    bodyText = substituteTemplate(t.bodyTemplate || '', userData, extra)
    overview = t.overviewTemplate != null ? substituteTemplate(t.overviewTemplate, userData, extra) : null
    if (buttons.length === 0 && Array.isArray(t.buttons)) buttons = t.buttons.map((b) => ({ label: substituteTemplate(b.label || '', userData, extra), url: substituteTemplate(b.url || '', userData, extra) }))
  } else {
    if (!title || !bodyText) return res.status(400).json({ success: false, error: 'Укажите title и body или templateId' })
    title = substituteTemplate(title, userData, extra)
    bodyText = substituteTemplate(bodyText, userData, extra)
    if (overview != null) overview = substituteTemplate(overview, userData, extra)
    buttons = buttons.map((b) => ({ label: substituteTemplate(b.label, userData, extra), url: substituteTemplate(b.url, userData, extra) }))
  }
  const data = buttons.length > 0 ? { buttons } : null
  const ok = await createNotification({ userId: uid, type, title, body: bodyText, overview, data })
  if (!ok) return res.status(500).json({ success: false, error: 'Не удалось создать уведомление' })
  const linkUrl = paymentLink
  await sendWebPushToUser(uid, { title, body: bodyText.slice(0, 200), url: linkUrl, type: 'notification', notificationType: type })
  res.json({ success: true, sent: 1 })
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
          }).catch((err) => console.warn('notifyAdminError subscription_alert:', err?.message))
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
 * Добавление клиента в 3x-ui через n8n webhook.
 * POST /api/vpn/add-client
 * Тело запроса передаётся в n8n; ответ n8n возвращается клиенту как есть.
 */
app.post('/api/vpn/add-client', async (req, res) => {
  try {
    const body = req.body || {}
    if (!body.clientId) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствует обязательное поле: clientId (UUID пользователя)',
      })
    }

    const webhookUrl = getWebhookUrl('addClient', req)
    if (!webhookUrl || !webhookUrl.trim()) {
      return res.status(503).json({
        success: false,
        error: 'Webhook для addClient не настроен (N8N_WEBHOOK_ADD_CLIENT или webhookUrl в запросе)',
      })
    }

    const result = await callN8NWebhook(webhookUrl, body)
    res.json(result != null ? result : { success: true, vpnUuid: body.clientId })
  } catch (error) {
    const statusCode = error.response?.status || 500
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Ошибка создания клиента через n8n',
      errorMessage: error.message,
    })
  }
})

/**
 * Удаление клиента из 3x-ui через n8n webhook.
 * POST /api/vpn/delete-client
 * Тело запроса (clientId или email, serverId/inboundId и т.д.) передаётся в n8n; ответ возвращается как есть.
 */
app.post('/api/vpn/delete-client', async (req, res) => {
  try {
    const body = req.body || {}
    if (!body.clientId && !body.email) {
      return res.status(400).json({
        success: false,
        error: 'Укажите clientId или email',
      })
    }

    const webhookUrl = getWebhookUrl('deleteClient', req)
    if (!webhookUrl || !webhookUrl.trim()) {
      return res.status(503).json({
        success: false,
        error: 'Webhook для deleteClient не настроен (N8N_WEBHOOK_DELETE_CLIENT или webhookUrl в запросе)',
      })
    }

    const result = await callN8NWebhook(webhookUrl, { ...body, operation: 'delete_client' })
    res.json(result != null ? result : { success: true })
  } catch (error) {
    const statusCode = error.response?.status || 500
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Ошибка удаления клиента через n8n',
      details: error.response?.data || null,
    })
  }
})

/**
 * Обновление клиента в 3x-ui через n8n webhook.
 * POST /api/vpn/update-client
 * Тело запроса (clientId, inboundId, totalGB, expiryTime и т.д.) передаётся в n8n; ответ возвращается как есть.
 */
app.post('/api/vpn/update-client', async (req, res) => {
  try {
    const body = req.body || {}
    if (!body.clientId) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствует обязательное поле: clientId (UUID клиента)',
      })
    }

    const webhookUrl = getWebhookUrl('updateClient', req)
    if (!webhookUrl || !webhookUrl.trim()) {
      return res.status(503).json({
        success: false,
        error: 'Webhook для updateClient не настроен (N8N_WEBHOOK_UPDATE_CLIENT или webhookUrl в запросе)',
      })
    }

    const result = await callN8NWebhook(webhookUrl, { ...body, operation: 'update_client' })
    res.json(result != null ? result : { success: true })
  } catch (error) {
    const statusCode = error.response?.status || 500
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Ошибка обновления клиента через n8n',
      details: error.response?.data || null,
    })
  }
})

/**
 * Получение статистики клиента из 3x-ui (xuiClient).
 * POST /api/vpn/client-stats
 */
app.post('/api/vpn/client-stats', async (req, res) => {
  try {
    const body = req.body || {}
    let tariffId = body.tariffId
    let serverId = body.serverId
    if (!tariffId && !serverId && body.userId && db) {
      const userSnap = await db.doc(`artifacts/${APP_ID}/public/data/users_v4/${body.userId}`).get()
      if (userSnap.exists) {
        const userData = userSnap.data()
        if (userData?.tariffId) tariffId = userData.tariffId
      }
    }
    const { xui } = await getXuiAndInboundForRequest({
      tariffId,
      serverId,
      inboundId: body.inboundId,
    })
    if (!xui || !xui.configured) {
      return res.status(503).json({ success: false, error: '3x-ui не настроен или укажите tariffId/serverId привязанного сервера' })
    }
    const { uuid, clientId, email } = body
    const id = uuid || clientId
    let stats
    if (id) {
      stats = await xui.getClientStats(id)
    } else {
      const found = await xui.findClientByEmail(email || '')
      if (!found) return res.status(404).json({ success: false, error: 'Клиент не найден' })
      stats = await xui.getClientStats(found.client.id)
    }
    return res.json({ success: true, stats, data: stats })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка получения статистики',
    })
  }
})

/**
 * Прямое получение статистики клиента из 3x-ui (то же, что client-stats).
 * Используется фронтом в getClientStatsDirect для загрузки данных из 3x-ui.
 * POST /api/vpn/client-stats-direct
 */
app.post('/api/vpn/client-stats-direct', async (req, res) => {
  try {
    const body = req.body || {}
    let tariffId = body.tariffId
    let serverId = body.serverId
    if (!tariffId && !serverId && body.userId && db) {
      const userSnap = await db.doc(`artifacts/${APP_ID}/public/data/users_v4/${body.userId}`).get()
      if (userSnap.exists) {
        const userData = userSnap.data()
        if (userData?.tariffId) tariffId = userData.tariffId
      }
    }
    const { xui } = await getXuiAndInboundForRequest({
      tariffId,
      serverId,
      inboundId: body.inboundId,
    })
    if (!xui || !xui.configured) {
      return res.status(503).json({
        success: false,
        error: '3x-ui не настроен или укажите tariffId/serverId привязанного сервера',
      })
    }
    const { uuid, clientId, email } = body
    const id = uuid || clientId
    let stats
    if (id) {
      stats = await xui.getClientStats(id)
    } else {
      const found = await xui.findClientByEmail(email || '')
      if (!found) return res.status(404).json({ success: false, error: 'Клиент не найден' })
      stats = await xui.getClientStats(found.client.id)
    }
    return res.json({ success: true, stats, data: stats })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка получения статистики',
    })
  }
})

/**
 * Трафик клиента по UUID. 3x-ui: GET /panel/api/inbounds/getClientTrafficsById/{uuid}
 * GET /api/vpn/client-traffics-by-id/:uuid — query: tariffId?, serverId?, inboundId?, userId?
 * POST /api/vpn/client-traffics-by-id — body: { uuid (required), tariffId?, serverId?, inboundId?, userId? }
 */
async function handleClientTrafficsById(req, res) {
  try {
    const uuid = req.params?.uuid || req.body?.uuid
    if (!uuid || typeof uuid !== 'string' || !String(uuid).trim()) {
      return res.status(400).json({ success: false, error: 'invalid UUID', msg: 'uuid обязателен' })
    }
    const body = req.body || {}
    const query = req.query || {}
    let tariffId = body.tariffId ?? query.tariffId
    let serverId = body.serverId ?? query.serverId
    const userId = body.userId ?? query.userId
    if (!tariffId && !serverId && userId && db) {
      const userSnap = await db.doc(`artifacts/${APP_ID}/public/data/users_v4/${userId}`).get()
      if (userSnap.exists) {
        const userData = userSnap.data()
        if (userData?.tariffId) tariffId = userData.tariffId
      }
    }
    const { xui } = await getXuiAndInboundForRequest({
      tariffId,
      serverId,
      inboundId: body.inboundId ?? query.inboundId,
    })
    if (!xui || !xui.configured) {
      return res.status(503).json({
        success: false,
        error: '3x-ui не настроен или укажите tariffId/serverId привязанного сервера',
      })
    }
    const data = await xui.getClientTrafficsById(String(uuid).trim())
    return res.json({ success: true, data })
  } catch (error) {
    const status = error.response?.status === 404 ? 404 : error.response?.status === 401 ? 401 : 500
    res.status(status).json({
      success: false,
      error: error.message || 'Ошибка получения трафика по UUID',
    })
  }
}

app.get('/api/vpn/client-traffics-by-id/:uuid', (req, res, next) => {
  handleClientTrafficsById(req, res).catch(next)
})

app.post('/api/vpn/client-traffics-by-id', (req, res, next) => {
  handleClientTrafficsById(req, res).catch(next)
})

/**
 * Получение списка инбаундов
 * GET /api/vpn/inbounds
 */
app.get('/api/vpn/inbounds', async (req, res) => {
  try {
    const xui = getXuiForVpn()
    if (!xui) {
      return res.status(503).json({ success: false, error: '3x-ui не настроен (XUI_HOST, XUI_USERNAME, XUI_PASSWORD)' })
    }
    const list = await xui.getInbounds()
    return res.json({ success: true, obj: list, data: list })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка получения списка инбаундов',
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
    const xui = getXuiForVpn()
    if (!xui) {
      return res.status(503).json({ success: false, error: '3x-ui не настроен (XUI_HOST, XUI_USERNAME, XUI_PASSWORD)' })
    }
    const inbound = await xui.getInbound(inboundId)
    if (!inbound) return res.status(404).json({ success: false, error: 'Инбаунд не найден' })
    return res.json({ success: true, obj: inbound, data: inbound })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка получения инбаунда',
    })
  }
})

/**
 * Список инбаундов по Random Path из настроек сервера (Firestore: settings.servers).
 * IP, порт и Inbound ID берутся из настроек сервера.
 * Authentication (POST /login): username и password берутся из настроек сервера (xuiUsername, xuiPassword).
 * GET /api/:randomPath/inbounds
 */
app.get('/api/:randomPath/inbounds', async (req, res) => {
  try {
    const { randomPath } = req.params
    const server = await getServerByRandomPath(randomPath)
    if (!server) {
      return res.status(404).json({
        success: false,
        error: `Сервер с Random Path "${randomPath}" не найден в настройках`,
      })
    }
    // Логин и пароль для 3x-ui POST /login — из настроек сервера (fallback на env)
    const xui = createXuiClient({
      baseUrl: server.baseUrl,
      username: server.xuiUsername ?? process.env.XUI_USERNAME,
      password: server.xuiPassword ?? process.env.XUI_PASSWORD,
    })
    if (!xui.configured) {
      return res.status(503).json({ success: false, error: 'У сервера не заданы учётные данные (логин/пароль)' })
    }
    const list = await xui.getInbounds()
    return res.json({
      success: true,
      obj: list,
      data: list,
      server: { serverIP: server.serverIP, serverPort: server.serverPort, inboundId: server.xuiInboundId },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка получения списка инбаундов',
    })
  }
})

/**
 * Инбаунд по ID по Random Path из настроек сервера (IP, порт, Inbound ID из settings.servers).
 * Authentication (POST /login): username и password берутся из настроек сервера (xuiUsername, xuiPassword).
 * GET /api/:randomPath/inbounds/:inboundId
 */
app.get('/api/:randomPath/inbounds/:inboundId', async (req, res) => {
  try {
    const { randomPath, inboundId } = req.params
    const server = await getServerByRandomPath(randomPath)
    if (!server) {
      return res.status(404).json({
        success: false,
        error: `Сервер с Random Path "${randomPath}" не найден в настройках`,
      })
    }
    // Логин и пароль для 3x-ui POST /login — из настроек сервера (fallback на env)
    const xui = createXuiClient({
      baseUrl: server.baseUrl,
      username: server.xuiUsername ?? process.env.XUI_USERNAME,
      password: server.xuiPassword ?? process.env.XUI_PASSWORD,
    })
    if (!xui.configured) {
      return res.status(503).json({ success: false, error: 'У сервера не заданы учётные данные (логин/пароль)' })
    }
    const inbound = await xui.getInbound(inboundId)
    if (!inbound) return res.status(404).json({ success: false, error: 'Инбаунд не найден' })
    return res.json({
      success: true,
      obj: inbound,
      data: inbound,
      server: { serverIP: server.serverIP, serverPort: server.serverPort, xuiInboundId: server.xuiInboundId },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Ошибка получения инбаунда',
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
 * ИИ чат (только админ). Использует провайдер и модель из настроек (Интеграции → ИИ).
 * POST /api/ai/chat
 * Body: { messages: [{ role: "system"|"user"|"assistant", content: string }], model?, temperature?, max_tokens? }
 * Ответ: { success: true, content: string, usage? } или { success: false, error: string }
 */
app.post('/api/ai/chat', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const config = await getActiveAiConfig()
  if (!config?.apiKey) {
    return res.status(503).json({ success: false, error: 'ИИ не настроен: задайте API-ключ в разделе «Интеграции → ИИ»' })
  }
  const body = req.body || {}
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'Передайте массив messages (role, content)' })
  }
  const normalized = messages.map((m) => ({
    role: (m.role === 'system' || m.role === 'user' || m.role === 'assistant') ? m.role : 'user',
    content: typeof m.content === 'string' ? m.content : String(m.content || ''),
  }))
  const chatConfig = {
    provider: config.provider,
    apiKey: config.apiKey,
    model: body.model != null && String(body.model).trim() ? String(body.model).trim() : config.model,
    temperature: body.temperature != null ? body.temperature : config.temperature,
    max_tokens: body.max_tokens != null ? body.max_tokens : config.max_tokens,
    timeout: body.timeout != null ? body.timeout : config.timeout,
  }
  const result = await unifiedChat(normalized, chatConfig)
  if (result.ok) {
    return res.json({ success: true, content: result.content, usage: result.usage })
  }
  const status = result.code === 'NO_API_KEY' ? 503 : (result.code === 'TIMEOUT' ? 504 : 502)
  return res.status(status).json({ success: false, error: result.error, code: result.code })
})

/**
 * POST /api/ai/tariff-suggest — подбор тарифа с ИИ (публичный).
 * Body: { answers: object, tariffId?: string, tariffName?: string }
 * Ответ: { success: true, explanation: string } или { success: false }
 * Генерирует краткое объяснение, почему рекомендован тариф. Без API-ключа возвращает success: true, explanation: null.
 */
app.post('/api/ai/tariff-suggest', express.json(), async (req, res) => {
  try {
    const body = req.body || {}
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
    const tariffName = (body.tariffName || '').toString().trim() || 'тариф'
    const config = await getActiveAiConfig()
    if (!config?.apiKey) {
      return res.json({ success: true, explanation: null })
    }
    const userContext = `Ответы пользователя на вопросы подбора тарифа: ${JSON.stringify(answers)}. Рекомендованный тариф: ${tariffName}.`
    const systemPrompt = `Ты — консультант VPN-сервиса. Пользователь прошёл короткий опрос для подбора тарифа. Напиши 2–3 предложения на русском: почему ему подойдёт этот тариф, исходя из его ответов. Будь дружелюбен и конкретен. Только текст без заголовков и списков.`
    const chatConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      temperature: 0.5,
      max_tokens: 200,
      timeout: 15,
    }
    const result = await unifiedChat(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContext }],
      chatConfig
    )
    if (result.ok && result.content) {
      return res.json({ success: true, explanation: result.content.trim() })
    }
    return res.json({ success: true, explanation: null })
  } catch (err) {
    console.warn('POST /api/ai/tariff-suggest:', err.message)
    return res.json({ success: true, explanation: null })
  }
})

const SUPPORT_AI_SYSTEM_PROMPT = `Ты — оператор техподдержки Майкл, полноценный оператор в системе. Ты есть в базе пользователей (users_v4), в тикетах отвечаешь от своего имени. У тебя есть доступ к данным из базы (Firestore): подписка, тариф, срок действия, логин, email; и к данным из панели VPN (3x-ui): лимит трафика, использовано/остаток, срок в панели. Используй эти данные, чтобы консультировать пользователя по подписке, ключам, продлению и типовым вопросам.
Задачи:
1) Проанализировать вопрос пользователя и, опираясь на данные из базы и из 3x-ui, дать чёткий дружелюбный ответ на русском. Можешь ссылаться на конкретные цифры (остаток трафика, срок действия), если они есть.
2) Если в вопросе упоминаются ошибки, логи, сбои подключения, неработающий VPN или ты видишь признаки технической проблемы — в начале ответа напиши ровно одну строку: ESCALATE: <краткая причина>. Затем пустая строка. Затем абзац для пользователя: предупреди, что обращение передано специалисту. Затем основной текст ответа.
Формат ответа: только текст для ответа пользователю. При эскалации — первая строка ESCALATE: причина, затем пустая строка, затем предупреждение, затем ответ. Не упоминай «данные из базы» или «3x-ui» в ответе пользователю — формулируй по-человечески («по нашим данным», «ваша подписка» и т.д.).`

/**
 * POST /api/ai/support-suggest — предложить ответ по тикету (ИИ анализирует вопрос, данные пользователя, даёт ответ; при признаках проблемы — эскалация админу).
 * Только админ. Body: { ticketId: string }.
 * Ответ: { success, reply, escalate?, userWarning?, escalateReason? } или ошибка.
 */
app.post('/api/ai/support-suggest', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const config = await getActiveAiConfig()
  if (!config?.apiKey) {
    return res.status(503).json({ success: false, error: 'ИИ не настроен: задайте API-ключ в разделе «Интеграции → ИИ»' })
  }
  const ticketId = (req.body?.ticketId ?? '').toString().trim()
  if (!ticketId) return res.status(400).json({ success: false, error: 'Укажите ticketId' })
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })

  try {
    const ticketRef = db.doc(`artifacts/${APP_ID}/public/data/tickets/${ticketId}`)
    const ticketSnap = await ticketRef.get()
    if (!ticketSnap.exists) {
      return res.status(404).json({ success: false, error: 'Тикет не найден' })
    }
    const ticketData = ticketSnap.data()
    const userId = (ticketData.userId ?? '').toString().trim()
    if (!userId) {
      return res.status(400).json({ success: false, error: 'У тикета не указан userId' })
    }

    const messagesSnap = await db.collection(ticketRef.path, 'messages').orderBy('createdAt').get()
    const messagesList = messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

    let userDataSafe = {}
    const userSnap = await db.doc(`artifacts/${APP_ID}/public/data/users_v4/${userId}`).get()
    if (userSnap.exists) {
      const u = userSnap.data()
      const exp = u.expiresAt
      const expiresStr = exp == null ? 'не задано' : (typeof exp === 'string' ? new Date(exp).toLocaleDateString('ru-RU') : (typeof exp === 'number' ? new Date(exp).toLocaleDateString('ru-RU') : String(exp)))
      userDataSafe = {
        name: u.name || '',
        email: u.email || '',
        login: u.login || '',
        plan: u.plan || '',
        tariffName: u.tariffName || '',
        tariffId: u.tariffId || '',
        expiresAt: expiresStr,
        devices: u.devices,
        role: u.role || 'user',
      }
    }

    const threadMessages = messagesList.filter((m) => !m.isTyping)
    const threadText = threadMessages
      .map((m) => `${m.from === 'support' ? (m.userId === AI_SUPPORT_USER_ID ? AI_SUPPORT_DISPLAY_NAME : 'Поддержка') : 'Пользователь'}: ${(m.text || '').trim()}`)
      .join('\n\n')
    const uFor3x = userSnap.exists ? userSnap.data() : {}
    const context3xUi = await fetchOperatorContext3xUi(userId, uFor3x)
    const userPrompt = `Тема обращения: ${(ticketData.subject || '').trim()}\n\nДанные пользователя из базы (Firestore):\n${JSON.stringify(userDataSafe, null, 2)}\n\nДанные из панели VPN (3x-ui): ${context3xUi}\n\nПереписка:\n${threadText || '(пока нет сообщений)'}`

    const systemPrompt = (config.systemPromptPreset && String(config.systemPromptPreset).trim()) || SUPPORT_AI_SYSTEM_PROMPT
    const chatConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      temperature: 0.5,
      max_tokens: 1024,
      timeout: config.timeout != null ? config.timeout : 60,
    }
    const result = await unifiedChat(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      chatConfig
    )

    if (!result.ok) {
      const status = result.code === 'NO_API_KEY' ? 503 : (result.code === 'TIMEOUT' ? 504 : 502)
      return res.status(status).json({ success: false, error: result.error, code: result.code })
    }

    let reply = (result.content || '').trim()
    let escalate = false
    let userWarning = ''
    let escalateReason = ''

    const escalateMatch = reply.match(/^ESCALATE:\s*(.+?)(\n\n|$)/s)
    if (escalateMatch) {
      escalate = true
      escalateReason = (escalateMatch[1] || '').trim()
      reply = reply.slice(escalateMatch[0].length).trim()
      const firstParagraph = reply.split(/\n\n+/)[0] || ''
      if (firstParagraph.length > 0 && firstParagraph.length < 500) {
        userWarning = firstParagraph
        reply = reply.slice(firstParagraph.length).trim().replace(/^\n+/, '')
      } else {
        userWarning = 'Обнаружена возможная техническая проблема. Мы передали обращение специалисту, ожидайте ответа.'
      }
    }

    if (escalate) {
      const botToken = await getTelegramToken()
      const adminChatId = await getTelegramAdminChatId()
      if (botToken && adminChatId) {
        const escText = `⚠️ <b>ИИ: эскалация по тикету</b>\n🆔 <code>${escapeHtml(ticketId)}</code>\n📌 ${escapeHtml((ticketData.subject || '').slice(0, 100))}\n\nПричина: ${escapeHtml(escalateReason.slice(0, 200))}`
        await sendTelegramMessage(botToken, adminChatId, escText).catch((e) => console.warn('Telegram notify escalate:', e.message))
      }
    }

    return res.json({
      success: true,
      reply: reply || result.content.trim(),
      escalate,
      userWarning: escalate ? userWarning : undefined,
      escalateReason: escalate ? escalateReason : undefined,
    })
  } catch (err) {
    console.error('❌ POST /api/ai/support-suggest:', err.message)
    return res.status(500).json({ success: false, error: err.message || 'Ошибка формирования ответа ИИ' })
  }
})

/** Идентификатор и имя агента поддержки (ИИ) в тикетах. Оператор Майкл — полноценная запись в системе и в базе. */
const AI_SUPPORT_USER_ID = 'michael'
const AI_SUPPORT_DISPLAY_NAME = 'Майкл'
const AI_TAKE_WORK_MESSAGE = 'Специалист техподдержки Майкл взял обращение в работу.'
const AI_TAKE_WORK_DELAY_MS = 2000

/** UUID оператора Майкл (системный, не для входа в VPN). */
const MICHAEL_SYSTEM_UUID = '00000000-0000-0000-0000-000000000001'

/**
 * Убедиться, что в users_v4 есть документ оператора Майкл (для отображения в системе и в тикетах).
 * Вызывается при первом использовании автоответа. Firebase Auth пользователя не создаём.
 */
async function ensureMichaelOperator() {
  if (!db) return
  const operatorRef = db.doc(`artifacts/${APP_ID}/public/data/users_v4/${AI_SUPPORT_USER_ID}`)
  const snap = await operatorRef.get()
  if (snap.exists) return
  const nowIso = new Date().toISOString()
  await operatorRef.set({
    email: 'michael@system.placeholder',
    login: AI_SUPPORT_USER_ID,
    name: AI_SUPPORT_DISPLAY_NAME,
    phone: '',
    role: 'support_ai',
    plan: 'free',
    uuid: MICHAEL_SYSTEM_UUID,
    subId: 'michael',
    tgId: '',
    expiresAt: null,
    tariffName: '',
    tariffId: '',
    devices: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  })
  console.log('🤖 Оператор Майкл создан в базе (users_v4/michael)')
}

/**
 * Получить данные из панели VPN (3x-ui) для контекста оператора: трафик, срок в панели.
 * @param {string} userId - uid пользователя в Firestore
 * @param {{ uuid?: string, email?: string, subId?: string }} userData - данные из users_v4
 * @returns {Promise<string>} Текст для вставки в промпт или "нет данных"
 */
async function fetchOperatorContext3xUi(userId, userData) {
  const uuid = (userData?.uuid ?? '').toString().trim()
  const email = (userData?.email ?? userData?.login ?? '').toString().trim()
  if (!uuid && !email) return 'Нет данных (нет uuid/email для запроса в 3x-ui).'

  const xui = getXuiForVpn()
  if (!xui) return '3x-ui не настроен.'

  const formatStats = (stats) => {
    if (!stats || typeof stats !== 'object') return null
    const total = stats.total != null ? Number(stats.total) : null
    const up = stats.up != null ? Number(stats.up) : 0
    const down = stats.down != null ? Number(stats.down) : 0
    const usedBytes = up + down
    const totalGB = total != null ? (total / (1024 ** 3)).toFixed(2) : null
    const usedGB = (usedBytes / (1024 ** 3)).toFixed(2)
    const remainingGB = total != null ? Math.max(0, (total - usedBytes) / (1024 ** 3)).toFixed(2) : null
    const expiryTime = stats.expiryTime != null ? new Date(Number(stats.expiryTime) * 1000).toLocaleDateString('ru-RU') : (stats.expiryTime ?? 'не указано')
    const parts = []
    if (totalGB != null) parts.push(`Лимит трафика: ${totalGB} GB`)
    parts.push(`Использовано: ${usedGB} GB`)
    if (remainingGB != null) parts.push(`Остаток: ${remainingGB} GB`)
    parts.push(`Срок в панели VPN: ${expiryTime}`)
    return parts.join('; ')
  }

  try {
    let client
    if (uuid) {
      const inbounds = await xui.getInbounds()
      for (const ib of inbounds) {
        const c = (ib.clients || []).find((x) => x.id === uuid)
        if (c) {
          client = c
          break
        }
      }
    } else {
      const found = await xui.findClientByEmail(email)
      if (!found) return 'Клиент в 3x-ui не найден.'
      client = found.client
    }
    if (!client) return 'Клиент в 3x-ui не найден.'
    const traffic = await xui.getClientStats(client.id)
    const merged = {
      total: client.totalGB,
      expiryTime: client.expiryTime > 1000000000000 ? client.expiryTime / 1000 : client.expiryTime,
      up: traffic.up ?? 0,
      down: traffic.down ?? 0,
    }
    const text = formatStats(merged)
    return text || 'Данных о клиенте не получено.'
  } catch (err) {
    console.warn('🤖 Майкл: не удалось получить данные 3x-ui для контекста', err.message)
    return `Запрос в 3x-ui не выполнен: ${err.message || 'ошибка'}`
  }
}

/**
 * POST /api/ai/support-auto-reply — автоматический ответ ИИ по тикету при новом сообщении пользователя.
 * Вызывается с фронта после отправки сообщения пользователем. Доступ: владелец тикета (по Firebase ID token) или админ.
 * ИИ сам отвечает пользователю, если есть данные о нём и ответ без эскалации. Иначе — только уведомление админу в Telegram о необходимости живой консультации.
 * Body: { ticketId: string }.
 * Ответ: { success: true, replied: boolean, reason?: 'no_user_data'|'escalate' }.
 */
app.post('/api/ai/support-auto-reply', express.json(), async (req, res) => {
  const authResult = await verifyIdToken(req, res)
  if (!authResult?.ok) return
  const ticketId = (req.body?.ticketId ?? '').toString().trim()
  if (!ticketId) {
    console.warn('support-auto-reply: нет ticketId в body')
    return res.status(400).json({ success: false, error: 'Укажите ticketId' })
  }
  if (!db) {
    console.warn('support-auto-reply: Firestore недоступен')
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }

  const config = await getActiveAiConfig()
  if (!config?.apiKey) {
    console.warn('support-auto-reply: ИИ не настроен (API-ключ в разделе «Интеграции → ИИ»)')
    return res.status(503).json({ success: false, replied: false, reason: 'ai_unavailable', error: 'ИИ недоступен: задайте API-ключ в разделе «Интеграции → ИИ»' })
  }

  try {
    const ticketRef = db.doc(`artifacts/${APP_ID}/public/data/tickets/${ticketId}`)
    const ticketSnap = await ticketRef.get()
    if (!ticketSnap.exists) {
      console.warn('support-auto-reply: тикет не найден', { ticketId, appId: APP_ID })
      return res.status(404).json({ success: false, error: 'Тикет не найден' })
    }
    const ticketData = ticketSnap.data()
    const userId = (ticketData.userId ?? '').toString().trim()
    if (!userId) {
      return res.status(400).json({ success: false, error: 'У тикета не указан userId' })
    }
    if (userId !== authResult.uid) {
      const adminOk = await ensureAdmin(req, res)
      if (!adminOk?.ok) return
    }

    console.log('support-auto-reply: старт', { ticketId, userId })
    await ensureMichaelOperator()

    // Сообщение «Майкл взял в работу» и пауза 2 секунды перед ответом агента
    const nowIso0 = new Date().toISOString()
    await ticketRef.collection('messages').add({
      from: 'support',
      userId: AI_SUPPORT_USER_ID,
      text: AI_TAKE_WORK_MESSAGE,
      createdAt: nowIso0,
    })
    await ticketRef.update({ updatedAt: nowIso0 })
    await new Promise((r) => setTimeout(r, AI_TAKE_WORK_DELAY_MS))

    // Ответ клиенту сразу — анализ и ответ ИИ идут в фоне, сообщение придёт по подписке Firestore
    res.status(202).json({ success: true, status: 'processing' })
    console.log('support-auto-reply: 202 отправлен, фон запущен', { ticketId })

    const baseUrlForNotify = req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
      : (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '')

    ;(async () => {
      try {
        const userSnap = await db.doc(`artifacts/${APP_ID}/public/data/users_v4/${userId}`).get()
        const hasUserData = userSnap.exists && userSnap.data() && (userSnap.data().name || userSnap.data().email || userSnap.data().login)
        if (!hasUserData) {
          console.log('support-auto-reply (фон): нет данных пользователя, уведомление админу', { ticketId, userId })
          const botToken = await getTelegramToken()
          const adminChatId = await getTelegramAdminChatId()
          if (botToken && adminChatId) {
            const text = `⚠️ <b>Нужна живая консультация</b>\n🆔 Тикет <code>${escapeHtml(ticketId)}</code>\n📌 ${escapeHtml((ticketData.subject || '').slice(0, 100))}\n\nПричина: нет данных о пользователе в базе.`
            await sendTelegramMessage(botToken, adminChatId, text).catch((e) => console.warn('Telegram notify live support:', e.message))
          }
          return
        }

        const typingNow = new Date().toISOString()
        const typingRef = await ticketRef.collection('messages').add({
          from: 'support',
          userId: AI_SUPPORT_USER_ID,
          text: 'Майкл печатает...',
          isTyping: true,
          createdAt: typingNow,
        })
        await ticketRef.update({ updatedAt: typingNow })

        const messagesSnap = await db.collection(ticketRef.path, 'messages').orderBy('createdAt').get()
        console.log('support-auto-reply (фон): запрос к ИИ', { ticketId })
        const messagesList = messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

        let userDataSafe = {}
        if (userSnap.exists) {
          const u = userSnap.data()
          const exp = u.expiresAt
          const expiresStr = exp == null ? 'не задано' : (typeof exp === 'string' ? new Date(exp).toLocaleDateString('ru-RU') : (typeof exp === 'number' ? new Date(exp).toLocaleDateString('ru-RU') : String(exp)))
          userDataSafe = {
            name: u.name || '',
            email: u.email || '',
            login: u.login || '',
            plan: u.plan || '',
            tariffName: u.tariffName || '',
            tariffId: u.tariffId || '',
            expiresAt: expiresStr,
            devices: u.devices,
            role: u.role || 'user',
          }
        }

        const threadMessages = messagesList.filter((m) => !m.isTyping)
        const threadText = threadMessages
          .map((m) => `${m.from === 'support' ? (m.userId === AI_SUPPORT_USER_ID ? AI_SUPPORT_DISPLAY_NAME : 'Поддержка') : 'Пользователь'}: ${(m.text || '').trim()}`)
          .join('\n\n')
        const u = userSnap.data() || {}
        const context3xUi = await fetchOperatorContext3xUi(userId, u)
        const userPrompt = `Тема обращения: ${(ticketData.subject || '').trim()}\n\nДанные пользователя из базы (Firestore):\n${JSON.stringify(userDataSafe, null, 2)}\n\nДанные из панели VPN (3x-ui): ${context3xUi}\n\nПереписка:\n${threadText || '(пока нет сообщений)'}`

        const aiConfig = await getActiveAiConfig()
        const systemPrompt = (aiConfig?.systemPromptPreset && String(aiConfig.systemPromptPreset).trim()) || SUPPORT_AI_SYSTEM_PROMPT
        console.log('🤖 Майкл: запрос к ИИ...', { ticketId, provider: aiConfig?.provider, model: aiConfig?.model })
        const chatConfig = {
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          temperature: 0.5,
          max_tokens: 1024,
          timeout: aiConfig.timeout != null ? aiConfig.timeout : 60,
        }
        const result = await unifiedChat(
          [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          chatConfig
        )

        if (!result.ok) {
          console.error('🤖 Майкл: ошибка ИИ', { ticketId, code: result.code, error: result.error })
          await typingRef.update({ text: 'Не удалось сформировать ответ. Специалист ответит позже.', isTyping: false })
          return
        }

        let reply = (result.content || '').trim()
        let escalate = false
        let escalateReason = ''

        const escalateMatch = reply.match(/^ESCALATE:\s*(.+?)(\n\n|$)/s)
        if (escalateMatch) {
          escalate = true
          escalateReason = (escalateMatch[1] || '').trim()
          reply = reply.slice(escalateMatch[0].length).trim()
          const firstParagraph = reply.split(/\n\n+/)[0] || ''
          if (firstParagraph.length > 0 && firstParagraph.length < 500) {
            reply = reply.slice(firstParagraph.length).trim().replace(/^\n+/, '')
          } else {
            reply = ''
          }
        }

        if (escalate) {
          const botToken = await getTelegramToken()
          const adminChatId = await getTelegramAdminChatId()
          if (botToken && adminChatId) {
            const escText = `⚠️ <b>Нужна живая консультация</b>\n🆔 Тикет <code>${escapeHtml(ticketId)}</code>\n📌 ${escapeHtml((ticketData.subject || '').slice(0, 100))}\n\nПричина: ${escapeHtml(escalateReason.slice(0, 200))}`
            await sendTelegramMessage(botToken, adminChatId, escText).catch((e) => console.warn('Telegram notify live support:', e.message))
          }
          await typingRef.update({ text: 'Обращение передано специалисту. Ожидайте ответа.', isTyping: false })
          return
        }

        const replyText = reply || (result.content || '').trim()
        if (!replyText) {
          console.warn('🤖 Майкл: пустой ответ модели', { ticketId })
          await typingRef.update({ text: 'Не удалось сформировать ответ. Специалист ответит позже.', isTyping: false })
          return
        }

        const nowIso = new Date().toISOString()
        await typingRef.update({ text: replyText, isTyping: false })
        await ticketRef.update({ status: 'answered', updatedAt: nowIso })

        await notifyUserAboutSupportReply(userId, ticketId, ticketData.subject || '', replyText, baseUrlForNotify)

        console.log('🤖 Майкл (ИИ) ответил в тикете', { ticketId, userId })
      } catch (err) {
        console.error('❌ support-auto-reply (фон):', err.message, err.stack)
      }
    })()
    return
  } catch (err) {
    console.error('❌ POST /api/ai/support-auto-reply:', err.message)
    return res.status(500).json({ success: false, error: err.message || 'Ошибка автоответа ИИ' })
  }
})

/**
 * API для управления пользователями (создание через Firebase Admin + Firestore)
 * Только админ, обходит Firestore rules
 */

/** Внутренняя функция: создать одного пользователя (Auth + Firestore). Возвращает { user } или бросает. */
async function createOneUser(adminInst, dbInst, appId, payload) {
  let rawEmail = typeof payload.email === 'string' ? payload.email.trim() : ''
  const rawLogin = typeof payload.login === 'string' ? payload.login.trim() : ''
  const rawName = typeof payload.name === 'string' ? payload.name.trim() : ''
  const rawPassword = typeof payload.password === 'string' ? payload.password : ''
  const rawPhone = typeof payload.phone === 'string' ? payload.phone.trim() : ''
  const rawRole = typeof payload.role === 'string' ? payload.role.trim() : 'user'
  const rawPlan = typeof payload.plan === 'string' ? payload.plan.trim() : 'free'
  const rawTgId = payload.tgId != null ? String(payload.tgId).trim() : ''
  const rawTariffId = payload.tariffId != null ? String(payload.tariffId).trim() : ''
  const rawTariffName = payload.tariffName != null ? String(payload.tariffName).trim() : ''
  const rawPaymentStatus = payload.paymentStatus != null ? String(payload.paymentStatus).trim() : null
  const rawExpiresAt = payload.expiresAt
  const rawSubId = payload.subId != null ? String(payload.subId).trim() : ''
  const rawUuid = payload.uuid != null ? String(payload.uuid).trim() : ''
  const rawDevices = payload.devices != null ? (typeof payload.devices === 'number' ? payload.devices : parseInt(String(payload.devices), 10)) : null

  const login = (rawLogin || rawEmail).trim().toLowerCase()
  if (!login) throw new Error('Логин обязателен')
  if (!rawName || !rawPassword || rawPassword.length < 6) {
    throw new Error('Имя и пароль (≥6 символов) обязательны')
  }
  if (!rawEmail) rawEmail = `${login}@no-email.placeholder`
  const email = rawEmail.toLowerCase()

  const usersRef = dbInst.collection(`artifacts/${appId}/public/data/users_v4`)
  const existingLogin = await usersRef.where('login', '==', login).limit(1).get()
  if (!existingLogin.empty) throw new Error('Пользователь с таким логином уже существует')

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
    const uuid = rawUuid.length > 0 ? rawUuid : randomUUID()
    const subIdLength = 16
    const subIdChars = '0123456789abcdefghijklmnopqrstuvwxyz'
    let subId = rawSubId
    if (!subId || subId.length < 4) {
      subId = ''
      for (let i = 0; i < subIdLength; i++) {
        subId += subIdChars[Math.floor(Math.random() * subIdChars.length)]
      }
    }
    const devices = (rawDevices != null && Number.isFinite(rawDevices) && rawDevices >= 1) ? Math.min(99, Math.max(1, rawDevices)) : 1
    const nowIso = new Date().toISOString()
    const userData = {
      email,
      login,
      name,
      phone,
      role,
      plan,
      uuid,
      subId,
      expiresAt: expiresAt ?? null,
      tariffName: rawTariffName || '',
      tariffId: rawTariffId || '',
      devices,
      photoURL: userRecord.photoURL || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    if (rawTgId) userData.tgId = rawTgId
    if (rawPaymentStatus && ['test_period', 'paid', 'unpaid'].includes(rawPaymentStatus)) userData.paymentStatus = rawPaymentStatus
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

/**
 * Сокращает длинные ошибки Firebase/Google (403, PERMISSION_DENIED) для вывода в UI импорта.
 * Возвращает короткое сообщение и ссылку на настройку прав.
 */
function shortenFirebaseErrorForImport(msg) {
  if (typeof msg !== 'string') return msg
  const s = msg.trim()
  if (s.length < 300) return s
  if (/PERMISSION_DENIED|403|serviceusage\.serviceUsageConsumer|identitytoolkit\.googleapis\.com/i.test(s)) {
    return 'Ошибка Firebase: у сервисного аккаунта нет прав на создание пользователей. Выдайте роль «Service Usage Consumer» в Google Cloud: https://console.developers.google.com/iam-admin/iam (проект skypathvpn).'
  }
  if (/auth\/|Firebase/i.test(s)) return s.slice(0, 200) + '…'
  return s.slice(0, 200) + (s.length > 200 ? '…' : '')
}

/** Генерирует случайный пароль (буквы + цифры), длина по умолчанию 12. */
function generateRandomPassword(length = 12) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  const bytes = crypto.randomBytes(length)
  for (let i = 0; i < length; i++) s += chars[bytes[i] % chars.length]
  return s
}

/**
 * Проверка дубликата пользователя по логину и email (для импорта).
 * Возвращает { duplicate: true, reason: 'login'|'email' } или { duplicate: false }.
 * Email не проверяется, если это служебный placeholder (@imported.local, @no-email.placeholder, @telegram.placeholder).
 */
/**
 * Найти пользователя по Telegram ID (для обновления при повторном импорте).
 * @returns {{ found: boolean, uid?: string }}
 */
async function findUserByTgId(dbInst, appId, tgId) {
  const tgIdStr = (tgId != null && String(tgId).trim() !== '') ? String(tgId).trim() : ''
  if (!tgIdStr || !dbInst || !appId) return { found: false }
  const usersRef = dbInst.collection(`artifacts/${appId}/public/data/users_v4`)
  const snap = await usersRef.where('tgId', '==', tgIdStr).limit(1).get()
  if (snap.empty) return { found: false }
  return { found: true, uid: snap.docs[0].id }
}

/**
 * Проверка дубликата по логину/email. При duplicate: true возвращает existingUid (id документа users_v4).
 */
async function checkImportDuplicate(dbInst, appId, login, email) {
  const usersRef = dbInst.collection(`artifacts/${appId}/public/data/users_v4`)
  const loginNorm = (login || '').toString().trim().toLowerCase()
  const emailNorm = (email || '').toString().trim().toLowerCase()
  if (loginNorm) {
    const byLogin = await usersRef.where('login', '==', loginNorm).limit(1).get()
    if (!byLogin.empty) return { duplicate: true, reason: 'login', existingUid: byLogin.docs[0].id }
  }
  const isPlaceholderEmail = /@(imported\.local|no-email\.placeholder|telegram\.placeholder)$/i.test(emailNorm)
  if (emailNorm && !isPlaceholderEmail) {
    const byEmail = await usersRef.where('email', '==', emailNorm).limit(1).get()
    if (!byEmail.empty) return { duplicate: true, reason: 'email', existingUid: byEmail.docs[0].id }
  }
  return { duplicate: false }
}

/**
 * Обновить существующего пользователя в Firestore данными из строки NocoDB (при повторном импорте).
 */
async function updateUserFromNocoDBRow(dbInst, appId, uid, data) {
  const userRef = dbInst.doc(`artifacts/${appId}/public/data/users_v4/${uid}`)
  const updates = {
    updatedAt: new Date().toISOString(),
  }
  if (data.name != null && String(data.name).trim() !== '') updates.name = String(data.name).trim()
  if (data.phone !== undefined) updates.phone = data.phone != null ? String(data.phone).trim() : ''
  if (data.tgId !== undefined) updates.tgId = data.tgId != null ? String(data.tgId).trim() : ''
  if (data.plan !== undefined) updates.plan = data.plan != null ? String(data.plan).trim() : 'free'
  if (data.subId !== undefined && String(data.subId).trim() !== '') updates.subId = String(data.subId).trim()
  if (data.tariffName !== undefined) updates.tariffName = data.tariffName != null ? String(data.tariffName).trim() : ''
  if (data.tariffId !== undefined) updates.tariffId = data.tariffId != null ? String(data.tariffId).trim() : ''
  if (data.paymentStatus !== undefined) updates.paymentStatus = data.paymentStatus != null ? String(data.paymentStatus).trim() : null
  if (data.uuid !== undefined && String(data.uuid).trim() !== '') updates.uuid = String(data.uuid).trim()
  if (data.expiresAt !== undefined) updates.expiresAt = data.expiresAt
  if (data.devices !== undefined && Number.isFinite(data.devices)) updates.devices = Math.min(99, Math.max(1, data.devices))
  await userRef.update(updates)
}

/**
 * Нормализует значение «Статус подписки» из таблицы в paymentStatus.
 * пробная, тест, тестовый, trial → test_period; активн, оплачен, paid → paid; не оплачен, unpaid → unpaid.
 * @returns {string|null} 'test_period' | 'paid' | 'unpaid' | null
 */
function normalizeSubscriptionStatus(value) {
  if (value === undefined || value === null) return null
  const s = String(value).trim().toLowerCase()
  if (!s) return null
  if (/пробн|^тест|тестовый|^trial$|триал/.test(s)) return 'test_period'
  if (/активн|оплачен|^paid$/.test(s)) return 'paid'
  if (/не\s*оплачен|^unpaid$/.test(s)) return 'unpaid'
  if (s === 'test_period' || s === 'paid' || s === 'unpaid') return s
  return null
}

/** Парсит дату «действует до» из строки (ISO, DD.MM.YYYY, timestamp) в миллисекунды или null. */
function parseExpiresAt(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000
  }
  const s = String(value).trim()
  if (!s) return null
  const iso = Date.parse(s)
  if (Number.isFinite(iso)) return iso
  const ddmmyy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/)
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10)
    const ms = Date.UTC(year, parseInt(m, 10) - 1, parseInt(d, 10))
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

/**
 * По названию тарифа из NocoDB (SUPER, MULTI и т.д.) находит документ тарифа в Firestore
 * и возвращает { tariffId, tariffName }. Сравнение по полям name и plan без учёта регистра.
 * @returns {{ tariffId: string, tariffName: string } | null}
 */
async function resolveTariffByName(dbInst, appId, tariffName) {
  if (!tariffName || typeof tariffName !== 'string') return null
  const search = tariffName.trim().toLowerCase()
  if (!search) return null
  const tariffsRef = dbInst.collection(`artifacts/${appId}/public/data/tariffs`)
  const snapshot = await tariffsRef.get()
  for (const doc of snapshot.docs) {
    const d = doc.data() || {}
    const name = (d.name || '').toString().trim().toLowerCase()
    const plan = (d.plan || '').toString().trim().toLowerCase()
    if (name === search || plan === search) {
      return {
        tariffId: doc.id,
        tariffName: (d.name || doc.id).toString().trim() || doc.id,
      }
    }
  }
  return null
}

/**
 * NocoDB может возвращать ячейки как примитивы или как объекты { value, display_value }.
 * Приводит запись к плоскому объекту с нижним регистром ключей и строковыми значениями.
 */
function normalizeNocoDBRow(rawRow) {
  if (!rawRow || typeof rawRow !== 'object') return {}
  const flat = {}
  for (const key of Object.keys(rawRow)) {
    const v = rawRow[key]
    let str = ''
    if (v === null || v === undefined) {
      str = ''
    } else if (typeof v === 'object' && v !== null) {
      str = (v.value ?? v.display_value ?? v.displayValue ?? v.title ?? '').toString().trim()
    } else {
      str = String(v).trim()
    }
    const lowerKey = String(key).toLowerCase()
    flat[lowerKey] = str
    flat[key] = str
  }
  return flat
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
      login: body.login != null ? body.login : body.email,
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

/** Вернуть сохранённый конфиг импорта NocoDB из Firestore (для автозагрузки и подстановки в форму). */
async function getSavedNocoDBConfig() {
  const settings = await getSettingsCached()
  const config = settings.nocodbImportConfig
  return config && typeof config === 'object' ? config : null
}

/** GET /api/admin/import-from-nocodb/saved-config — получить сохранённые настройки импорта (подключение + маппинг). Только админ. */
app.get('/api/admin/import-from-nocodb/saved-config', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  try {
    const config = await getSavedNocoDBConfig()
    return res.json({ success: true, config: config || null })
  } catch (err) {
    console.error('❌ GET /api/admin/import-from-nocodb/saved-config:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/** POST /api/admin/import-from-nocodb/save-config — сохранить настройки импорта (подключение + маппинг) для автозагрузки. Body: те же поля, что у импорта. Только админ. */
app.post('/api/admin/import-from-nocodb/save-config', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  const body = req.body || {}
  const config = {
    baseUrl: (body.baseUrl || '').toString().trim().replace(/\/+$/, ''),
    apiToken: (body.apiToken || '').toString().trim(),
    tableId: (body.tableId || '').toString().trim(),
    tableId2: (body.tableId2 || '').toString().trim(),
    emailColumn: (body.emailColumn || body.email_column || '').toString().trim(),
    nameColumn: (body.nameColumn || body.name_column || '').toString().trim(),
    phoneColumn: (body.phoneColumn || body.phone_column || '').toString().trim(),
    tgIdColumn: (body.tgIdColumn || body.tgId_column || '').toString().trim(),
    roleColumn: (body.roleColumn || body.role_column || '').toString().trim(),
    planColumn: (body.planColumn || body.plan_column || '').toString().trim(),
    subIdColumn: (body.subIdColumn || body.subId_column || '').toString().trim(),
    tariffNameColumn: (body.tariffNameColumn || body.tariffName_column || body.tariffColumn || '').toString().trim(),
    expiresAtColumn: (body.expiresAtColumn || body.expiresAt_column || '').toString().trim(),
    orderIdColumn: (body.orderIdColumn || body.orderId_column || '').toString().trim(),
    amountColumn: (body.amountColumn || body.amount_column || '').toString().trim(),
    devicesColumn: (body.devicesColumn || body.devices_column || '').toString().trim(),
    subscriptionStatusColumn: (body.subscriptionStatusColumn || body.subscriptionStatus_column || body.statusColumn || body.status_column || '').toString().trim(),
    uuidColumn: (body.uuidColumn || body.uuid_column || '').toString().trim(),
    writeBackToNocoDB: body.writeBackToNocoDB !== false,
    writeBackLoginPasswordOnUpdate: body.writeBackLoginPasswordOnUpdate === true,
    updateExistingUsers: body.updateExistingUsers === true || body.updateExisting === true,
    loginColumn: (body.loginColumn || body.login_column || 'Login').toString().trim() || 'Login',
    passwordColumn: (body.passwordColumn || body.password_column || 'Password').toString().trim() || 'Password',
    savedAt: new Date().toISOString(),
  }
  if (!config.baseUrl || !config.apiToken || !config.tableId) {
    return res.status(400).json({ success: false, error: 'Укажите baseUrl, apiToken и tableId для сохранения' })
  }
  if (!config.emailColumn || !config.nameColumn) {
    return res.status(400).json({ success: false, error: 'Укажите колонки для логина и имени' })
  }
  try {
    settingsCache = { data: null, expiresAt: 0 }
    const settingsRef = db.doc(`artifacts/${APP_ID}/public/settings`)
    await settingsRef.set({ nocodbImportConfig: config }, { merge: true })
    console.log('✅ NocoDB: настройки импорта сохранены для автозагрузки', { tableId: config.tableId })
    return res.json({ success: true, message: 'Настройки сохранены. Их можно использовать для ежедневной автозагрузки.' })
  } catch (err) {
    console.error('❌ POST /api/admin/import-from-nocodb/save-config:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/** POST /api/admin/import-from-nocodb/preview — загрузить записи из NocoDB (и при наличии tableId2 — объединить колонки обеих таблиц для маппинга). */
app.post('/api/admin/import-from-nocodb/preview', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const body = req.body || {}
  const baseUrl = (body.baseUrl || process.env.NOCODB_BASE_URL || '').toString().trim().replace(/\/+$/, '')
  const apiToken = (body.apiToken || process.env.NOCODB_API_TOKEN || '').toString().trim()
  const tableId = (body.tableId || process.env.NOCODB_TABLE_ID || '').toString().trim()
  const tableId2 = (body.tableId2 || '').toString().trim()
  if (!baseUrl || !apiToken) {
    return res.status(400).json({ success: false, error: 'Укажите baseUrl и apiToken' })
  }
  if (!tableId) {
    return res.status(400).json({ success: false, error: 'Укажите tableId' })
  }
  const fetchTableRows = async (tid) => {
    const listUrl = `${baseUrl.replace(/\/+$/, '')}/api/v2/tables/${tid}/records`
    const limit = 1000
    const rows = []
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const resp = await axios.get(listUrl, {
        params: { limit, offset },
        headers: { 'xc-token': apiToken, 'Content-Type': 'application/json' },
        timeout: 30000,
        validateStatus: () => true,
      })
      const status = resp.status
      const data = resp.data
      if (status >= 400) {
        const errMsg = data?.message || data?.msg || data?.error || (typeof data === 'string' ? data : null)
        throw new Error(
          errMsg || `NocoDB вернул ${status}. Проверьте: URL базы (без /nc/... в конце), API-токен, ID таблицы (из URL, например mxxxxxxxx).`
        )
      }
      const list = data?.list || data?.data || (Array.isArray(data) ? data : [])
      if (!Array.isArray(list) || list.length === 0) break
      rows.push(...list)
      offset += list.length
      if (list.length < limit) hasMore = false
    }
    return rows
  }
  try {
    const allRows = await fetchTableRows(tableId)
    const columnsSet = new Set()
    allRows.forEach((r) => { if (r && typeof r === 'object') Object.keys(r).forEach((k) => columnsSet.add(k)) })
    if (tableId2) {
      const rows2 = await fetchTableRows(tableId2)
      rows2.forEach((r) => { if (r && typeof r === 'object') Object.keys(r).forEach((k) => columnsSet.add(k)) })
    }
    const columns = Array.from(columnsSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    return res.json({ success: true, list: allRows, columns })
  } catch (err) {
    let msg = err.response?.data?.message || err.response?.data?.msg || err.message
    if (err.code === 'ECONNREFUSED') msg = 'Не удалось подключиться к NocoDB. Проверьте URL базы и доступность сервера.'
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') msg = 'Таймаут при обращении к NocoDB. Проверьте сеть и URL.'
    if (err.code === 'ENOTFOUND') msg = 'Домен NocoDB не найден. Проверьте URL базы.'
    if (err.response?.status === 401) msg = msg || 'Неверный API-токен. Создайте токен в NocoDB: Account → API Token.'
    if (err.response?.status === 403) msg = msg || 'Доступ запрещён. Проверьте права токена и доступ к таблице.'
    if (err.response?.status === 404) msg = msg || 'Таблица не найдена. Проверьте ID таблицы (из URL, например mxxxxxxxx).'
    console.error('❌ POST /api/admin/import-from-nocodb/preview:', msg)
    return res.status(500).json({ success: false, error: msg || 'Ошибка загрузки данных из NocoDB' })
  }
})

/** POST /api/admin/import-from-nocodb — получить записи из NocoDB и создать пользователей (только админ). Поддерживает body.useSavedConfig: true — подставить сохранённый конфиг (для автозагрузки по расписанию). */
app.post('/api/admin/import-from-nocodb', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!admin || !db) {
    return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  }

  let body = req.body || {}
  if (body.useSavedConfig) {
    const saved = await getSavedNocoDBConfig()
    if (!saved || !saved.baseUrl) {
      return res.status(400).json({ success: false, error: 'Сохранённый конфиг импорта не найден. Сначала выполните сопоставление и нажмите «Сохранить для автозагрузки».' })
    }
    body = { ...saved, ...body }
    delete body.useSavedConfig
    delete body.savedAt
  }
  const baseUrl = (body.baseUrl || process.env.NOCODB_BASE_URL || '').toString().trim().replace(/\/+$/, '')
  const apiToken = (body.apiToken || process.env.NOCODB_API_TOKEN || '').toString().trim()
  const tableId = (body.tableId || process.env.NOCODB_TABLE_ID || '').toString().trim()
  const tableId2 = (body.tableId2 || '').toString().trim()
  const defaultPassword = (body.defaultPassword || process.env.IMPORT_DEFAULT_PASSWORD || '').toString()
  // Маппинг колонок: точные названия полей из NocoDB (задаются в окне сопоставления)
  const mapEmail = (body.emailColumn || body.email_column || '').toString().trim()
  const mapName = (body.nameColumn || body.name_column || '').toString().trim()
  const mapPhone = (body.phoneColumn || body.phone_column || '').toString().trim()
  const mapTgId = (body.tgIdColumn || body.tgId_column || '').toString().trim()
  const mapRole = (body.roleColumn || body.role_column || '').toString().trim()
  const mapPlan = (body.planColumn || body.plan_column || '').toString().trim()
  const mapSubId = (body.subIdColumn || body.subId_column || '').toString().trim()
  const mapTariffName = (body.tariffNameColumn || body.tariffName_column || body.tariffColumn || '').toString().trim()
  const mapExpiresAt = (body.expiresAtColumn || body.expiresAt_column || '').toString().trim()
  const mapOrderId = (body.orderIdColumn || body.orderId_column || '').toString().trim()
  const mapAmount = (body.amountColumn || body.amount_column || '').toString().trim()
  const mapDevices = (body.devicesColumn || body.devices_column || '').toString().trim()
  const mapUuid = (body.uuidColumn || body.uuid_column || '').toString().trim()
  const mapSubscriptionStatus = (body.subscriptionStatusColumn || body.subscriptionStatus_column || body.statusColumn || body.status_column || '').toString().trim()
  const skipEmptyRows = body.skipEmptyRows !== false
  const writeBackToNocoDB = body.writeBackToNocoDB !== false
  const writeBackLoginPasswordOnUpdate = body.writeBackLoginPasswordOnUpdate === true
  const updateExistingUsers = body.updateExistingUsers === true || body.updateExisting === true
  const loginColumn = (body.loginColumn || body.login_column || 'Login').toString().trim() || 'Login'
  const passwordColumn = (body.passwordColumn || body.password_column || 'Password').toString().trim() || 'Password'

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

  // Загружаем записи из одной или двух таблиц (одинаковая структура, разные данные)
  const fetchTableRows = async (tid) => {
    const listUrl = `${baseUrl.replace(/\/+$/, '')}/api/v2/tables/${tid}/records`
    const limit = 1000
    const rows = []
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const resp = await axios.get(listUrl, {
        params: { limit, offset },
        headers: {
          'xc-token': apiToken,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        validateStatus: () => true,
      })
      const status = resp.status
      const data = resp.data
      if (status >= 400) {
        const errMsg = data?.message || data?.msg || data?.error || (typeof data === 'string' ? data : null)
        throw new Error(
          errMsg || `NocoDB вернул ${status}. Проверьте: URL базы (без /nc/... в конце), API-токен, ID таблицы.`
        )
      }
      const list = data?.list || data?.data || (Array.isArray(data) ? data : [])
      if (!Array.isArray(list) || list.length === 0) break
      list.forEach((r) => {
        rows.push({ ...r, __tableId: tid })
      })
      offset += list.length
      if (list.length < limit) hasMore = false
    }
    return rows
  }

  try {
    const allRows = await fetchTableRows(tableId)
    if (tableId2) {
      const rows2 = await fetchTableRows(tableId2)
      allRows.push(...rows2)
    }

    const created = []
    const updated = []
    const skipped = []
    const errors = []
    const writeBackErrors = []
    let emptyRows = 0
    let writeBackOk = 0
    const sampleRowKeys = allRows.length > 0 ? Object.keys(allRows[0]) : []
    const patchHeaders = { 'xc-token': apiToken, 'Content-Type': 'application/json' }

    for (let i = 0; i < allRows.length; i++) {
      const rawRow = allRows[i]
      const row = normalizeNocoDBRow(rawRow)
      // Id записи: в NocoDB может быть Id, id, ID или __ncRecordId (см. data-apis-v2.nocodb.com)
      const recordId = rawRow.Id ?? rawRow.id ?? rawRow.ID ?? rawRow.__ncRecordId ?? rawRow.recordId

      // Колонка "email" в NocoDB записывается как логин; для Firebase Auth нужен email — если значение с @, используем как email, иначе добавляем @imported.local
      const loginValue = (mapEmail ? (row[mapEmail] ?? row[mapEmail.toLowerCase()] ?? '') : pickFirst(row, 'email', 'email', 'mail', 'e-mail') || '').toString().trim()
      const name = (mapName ? (row[mapName] ?? row[mapName.toLowerCase()] ?? '') : pickFirst(row, 'name', 'name', 'full_name', 'fullname', 'имя') || '').toString().trim()

      if (!loginValue || !name) {
        if (skipEmptyRows && !loginValue && !name) {
          emptyRows += 1
        } else {
          skipped.push({
            rowIndex: i + 1,
            reason: !loginValue && !name ? 'Пустая строка' : (!loginValue ? 'Нет логина (колонка email)' : 'Нет имени'),
            row: { login: loginValue || '(пусто)', name: name || '(пусто)' },
          })
        }
        continue
      }

      const login = loginValue.toLowerCase()
      const email = login.includes('@') ? login : `${login}@imported.local`
      const phone = mapPhone ? (row[mapPhone] ?? row[mapPhone.toLowerCase()] ?? '') : pickFirst(row, 'phone', 'phone', 'telephone', 'телефон')
      const tgId = mapTgId ? (row[mapTgId] ?? row[mapTgId.toLowerCase()] ?? '') : pickFirst(row, 'tgid', 'tg_id', 'telegram_id', 'telegramid', 'telegram id')
      const planRaw = (mapPlan ? (row[mapPlan] ?? row[mapPlan.toLowerCase()] ?? '') : pickFirst(row, 'plan', 'plan', 'план') || 'free').toLowerCase()
      const plan = planRaw || 'free'
      const subIdVal = mapSubId ? (row[mapSubId] ?? row[mapSubId.toLowerCase()] ?? '').toString().trim() : ''
      const tariffNameVal = mapTariffName ? (row[mapTariffName] ?? row[mapTariffName.toLowerCase()] ?? '').toString().trim() : ''
      const resolvedTariff = tariffNameVal ? await resolveTariffByName(db, APP_ID, tariffNameVal) : null
      const tariffIdVal = resolvedTariff ? resolvedTariff.tariffId : ''
      const tariffNameResolved = resolvedTariff ? resolvedTariff.tariffName : (tariffNameVal || '')
      const expiresAtVal = mapExpiresAt ? (row[mapExpiresAt] ?? row[mapExpiresAt.toLowerCase()] ?? '').toString().trim() : ''
      const orderIdVal = mapOrderId ? (row[mapOrderId] ?? row[mapOrderId.toLowerCase()] ?? '').toString().trim() : ''
      const amountVal = mapAmount ? (row[mapAmount] ?? row[mapAmount.toLowerCase()] ?? '').toString().trim() : ''
      const devicesVal = mapDevices ? (row[mapDevices] ?? row[mapDevices.toLowerCase()] ?? '').toString().trim() : ''
      const uuidVal = mapUuid ? (row[mapUuid] ?? row[mapUuid.toLowerCase()] ?? '').toString().trim() : ''
      const statusVal = mapSubscriptionStatus ? (row[mapSubscriptionStatus] ?? row[mapSubscriptionStatus.toLowerCase()] ?? '').toString().trim() : ''
      const paymentStatusVal = normalizeSubscriptionStatus(statusVal)
      const expiresAtMs = parseExpiresAt(expiresAtVal)
      const amountNum = amountVal ? parseFloat(String(amountVal).replace(',', '.')) : null
      const devicesNum = devicesVal ? parseInt(devicesVal, 10) : null

      // При повторном импорте обновляем существующих по Telegram ID (не по логину)
      if (updateExistingUsers && tgId && String(tgId).trim() !== '') {
        const byTgId = await findUserByTgId(db, APP_ID, String(tgId).trim())
        if (byTgId.found && byTgId.uid) {
          try {
            await updateUserFromNocoDBRow(db, APP_ID, byTgId.uid, {
              name,
              phone: phone || '',
              tgId: String(tgId).trim(),
              plan,
              subId: subIdVal || undefined,
              tariffName: tariffNameVal ? tariffNameResolved : undefined,
              tariffId: tariffIdVal || undefined,
              paymentStatus: paymentStatusVal || undefined,
              uuid: uuidVal || undefined,
              expiresAt: expiresAtMs,
              devices: Number.isFinite(devicesNum) && devicesNum >= 1 ? devicesNum : undefined,
            })
            updated.push({
              rowIndex: i + 1,
              login,
              email,
              id: byTgId.uid,
              recordId,
              tgId: String(tgId).trim(),
              tariffName: tariffNameResolved || null,
              tariffId: tariffIdVal || null,
            })
            // При повторной загрузке: записать логин и пароль в таблицу NocoDB (если включена галка)
            if (writeBackLoginPasswordOnUpdate && writeBackToNocoDB && recordId != null && String(recordId).trim() !== '') {
              const updatePassword = generateRandomPassword(12)
              try {
                const tableIdForPatch = rawRow.__tableId || tableId
                const patchUrl = `${baseUrl}/api/v2/tables/${tableIdForPatch}/records`
                const idKey = rawRow.Id !== undefined ? 'Id' : (rawRow.id !== undefined ? 'id' : 'ID')
                const patchBody = {
                  id: recordId,
                  [idKey]: recordId,
                  [loginColumn]: login,
                  [passwordColumn]: updatePassword,
                }
                const patchRes = await axios.patch(patchUrl, patchBody, { headers: patchHeaders, timeout: 15000, validateStatus: () => true })
                if (patchRes.status >= 200 && patchRes.status < 300) {
                  writeBackOk += 1
                  try {
                    await admin.auth().updateUser(byTgId.uid, { password: updatePassword })
                  } catch (authErr) {
                    console.warn('⚠️ Импорт NocoDB: логин/пароль записаны в таблицу, но не удалось обновить пароль в Firebase Auth', { uid: byTgId.uid, error: authErr.message })
                  }
                } else {
                  writeBackErrors.push({ rowIndex: i + 1, login, recordId, status: patchRes.status, error: patchRes.data?.message || patchRes.data?.msg || String(patchRes.data) })
                }
              } catch (patchErr) {
                writeBackErrors.push({ rowIndex: i + 1, login, recordId, error: patchErr.message || String(patchErr) })
              }
            }
          } catch (err) {
            errors.push({ rowIndex: i + 1, email, error: err.message || String(err) })
          }
          continue
        }
        // Включено «обновлять по Telegram ID», но пользователь с таким Telegram ID не найден — пропускаем с понятной причиной
        skipped.push({
          rowIndex: i + 1,
          reason: 'Обновление по Telegram ID: пользователь с таким Telegram ID не найден в системе',
          row: { login, email, tgId: String(tgId).trim() },
        })
        continue
      }

      const duplicateCheck = await checkImportDuplicate(db, APP_ID, login, email)
      if (duplicateCheck.duplicate) {
        skipped.push({
          rowIndex: i + 1,
          reason: duplicateCheck.reason === 'email' ? 'Дубликат (email уже зарегистрирован)' : 'Дубликат (логин уже существует)',
          row: { login, email },
        })
        continue
      }

      const generatedPassword = generateRandomPassword(12)
      // При импорте все пользователи создаются с ролью «пользователь»
      const role = 'user'

      try {
        const result = await createOneUser(admin, db, APP_ID, {
          email,
          login,
          name,
          password: generatedPassword,
          phone: phone || undefined,
          role,
          plan,
          tgId: tgId || undefined,
          subId: subIdVal || undefined,
          uuid: uuidVal || undefined,
          tariffName: tariffNameVal ? tariffNameResolved : undefined,
          tariffId: tariffIdVal || undefined,
          paymentStatus: paymentStatusVal || undefined,
          expiresAt: expiresAtMs,
          devices: Number.isFinite(devicesNum) && devicesNum >= 1 ? devicesNum : undefined,
        })
        const createdUid = result.user.id
        created.push({
          rowIndex: i + 1,
          login,
          email,
          id: createdUid,
          recordId,
          tariffName: tariffNameResolved || null,
          tariffId: tariffIdVal || null,
        })

        if (orderIdVal && Number.isFinite(amountNum) && amountNum > 0 && db) {
          try {
            const paymentsRef = db.collection(`artifacts/${APP_ID}/public/data/payments`)
            await paymentsRef.add({
              orderId: orderIdVal,
              userId: createdUid,
              amount: amountNum,
              status: 'pending',
              tariffName: tariffNameResolved || tariffNameVal || null,
              tariffId: tariffIdVal || null,
              createdAt: new Date().toISOString(),
              source: 'nocodb_import',
            })
          } catch (payErr) {
            console.warn('⚠️ Импорт NocoDB: не удалось создать запись платежа', { orderId: orderIdVal, error: payErr.message })
          }
        }

        if (writeBackToNocoDB && recordId != null && String(recordId).trim() !== '') {
          try {
            // NocoDB API v2: PATCH на .../records; id записи передаётся в теле; при двух таблицах — в ту, откуда строка
            const tableIdForPatch = rawRow.__tableId || tableId
            const patchUrl = `${baseUrl}/api/v2/tables/${tableIdForPatch}/records`
            const idKey = rawRow.Id !== undefined ? 'Id' : (rawRow.id !== undefined ? 'id' : 'ID')
            const patchBody = {
              id: recordId,
              [idKey]: recordId,
              [loginColumn]: login,
              [passwordColumn]: generatedPassword,
            }
            const patchRes = await axios.patch(patchUrl, patchBody, { headers: patchHeaders, timeout: 15000, validateStatus: () => true })
            if (patchRes.status >= 200 && patchRes.status < 300) {
              writeBackOk += 1
            } else {
              writeBackErrors.push({ rowIndex: i + 1, login, recordId, status: patchRes.status, error: patchRes.data?.message || patchRes.data?.msg || String(patchRes.data) })
            }
          } catch (patchErr) {
            writeBackErrors.push({ rowIndex: i + 1, login, recordId, error: patchErr.message || String(patchErr) })
          }
        }
      } catch (err) {
        const msg = err.message || String(err)
        if (err.code === 'auth/email-already-exists' || msg.includes('логином уже существует') || msg.includes('email already')) {
          skipped.push({ rowIndex: i + 1, login, email, reason: 'Дубликат (логин или email уже существует)' })
        } else {
          errors.push({ rowIndex: i + 1, email, error: shortenFirebaseErrorForImport(msg) })
        }
      }
    }

    return res.json({
      success: true,
      created: created.length,
      updated: updated.length,
      skipped: skipped.length,
      emptyRows,
      errors: errors.length,
      writeBackOk: writeBackToNocoDB ? writeBackOk : undefined,
      writeBackErrors: writeBackErrors.length ? writeBackErrors : undefined,
      sampleRowKeys,
      details: { created, updated, skipped, errors, writeBackOk, writeBackErrors },
    })
  } catch (err) {
    let msg = err.response?.data?.message || err.response?.data?.msg || err.message
    if (err.code === 'ECONNREFUSED') msg = 'Не удалось подключиться к NocoDB. Проверьте URL базы и доступность сервера.'
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') msg = 'Таймаут при обращении к NocoDB. Проверьте сеть и URL.'
    if (err.code === 'ENOTFOUND') msg = 'Домен NocoDB не найден. Проверьте URL базы.'
    if (err.response?.status === 401) msg = msg || 'Неверный API-токен. Создайте токен в NocoDB: Account → API Token.'
    if (err.response?.status === 403) msg = msg || 'Доступ запрещён. Проверьте права токена и доступ к таблице.'
    if (err.response?.status === 404) msg = msg || 'Таблица не найдена. Проверьте ID таблицы (из URL).'
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

/** Кэш документа settings (TTL 60 с). Снижает Firestore reads для getTelegramToken и loadSettings. */
let settingsCache = { data: null, expiresAt: 0 }
const SETTINGS_CACHE_TTL_MS = 60 * 1000

/** Список appId для поиска токена в Firestore, если в основном документе пусто. */
const TELEGRAM_SETTINGS_APP_IDS = [APP_ID, 'skyputh', 'skypathvpn'].filter((id, i, arr) => arr.indexOf(id) === i)

/**
 * Токен бота: приоритет 1) TELEGRAM_BOT_TOKEN или TELEGRAM_TOKEN (env), 2) кэш, 3) Firestore (artifacts/APP_ID/public/settings.telegramBotToken).
 * Если в основном документе токена нет — пробуем другие appId (skyputh, skypathvpn).
 */
async function getTelegramToken() {
  const fromEnv = (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()) ||
    (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TOKEN.trim())
  if (fromEnv) return fromEnv
  if (telegramTokenCache.token && Date.now() < telegramTokenCache.expiresAt) {
    return telegramTokenCache.token
  }
  const settings = await getSettingsCached()
  let token = (settings && settings.telegramBotToken) ? String(settings.telegramBotToken).trim() : ''
  if (!token && db) {
    for (const appId of TELEGRAM_SETTINGS_APP_IDS) {
      if (appId === APP_ID) continue
      try {
        const snap = await db.doc(`artifacts/${appId}/public/settings`).get()
        const data = snap.exists ? snap.data() : {}
        token = (data && data.telegramBotToken) ? String(data.telegramBotToken).trim() : ''
        if (token) break
      } catch (_) {}
    }
  }
  if (token) {
    telegramTokenCache = { token, expiresAt: Date.now() + TELEGRAM_CACHE_TTL_MS }
  }
  return token
}

/** Загрузить settings из Firestore с кэшированием. */
async function getSettingsCached() {
  if (settingsCache.data && Date.now() < settingsCache.expiresAt) {
    return settingsCache.data
  }
  if (!db) return {}
  try {
    const snap = await db.doc(`artifacts/${APP_ID}/public/settings`).get()
    const data = snap.exists ? snap.data() : {}
    settingsCache = { data, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS }
    return data
  } catch {
    return {}
  }
}

/** Нормализовать random path для сравнения (без ведущих/концевых слэшей). */
function normalizeRandomPath(p) {
  return (p || '').toString().trim().replace(/^\/+|\/+$/g, '') || ''
}

/** Собрать из объекта сервера baseUrl и protocol (для запросов к 3x-ui). */
function buildServerConnection(s) {
  if (!s || !s.serverIP || !s.serverPort) return null
  const protocol = (s.protocol || (s.serverPort === 443 || s.serverPort === 40919 ? 'https' : 'http')).toLowerCase().replace(/[:/]/g, '')
  const rp = (s.randompath || '').toString().trim()
  const pathSegment = rp && !rp.startsWith('/') ? `/${rp}` : rp
  const baseUrl = `${protocol === 'https' ? 'https' : 'http'}://${s.serverIP}:${s.serverPort}${pathSegment}`.replace(/\/+$/, '')
  return { ...s, protocol: protocol === 'https' ? 'https' : 'http', baseUrl }
}

/**
 * Найти сервер в настройках по Random Path (из artifacts/APP_ID/public/settings.servers).
 * @returns {Object|null} { baseUrl, serverIP, serverPort, protocol, randompath, xuiInboundId, xuiUsername?, xuiPassword?, ... } или null
 */
async function getServerByRandomPath(randomPath) {
  const settings = await getSettingsCached()
  const servers = settings?.servers || []
  const want = normalizeRandomPath(randomPath)
  if (!want) return null
  for (const s of servers) {
    const path = normalizeRandomPath(s.randompath)
    if (path === want) return buildServerConnection(s)
  }
  return null
}

/**
 * Найти сервер, привязанный к тарифу (server.tariffIds включает tariffId).
 * Данные сервера (IP, порт, random path, логин/пароль, inboundId) подставляются в запросы к 3x-ui.
 * @param {string} tariffId - ID тарифа
 * @returns {Promise<Object|null>} сервер с baseUrl, xuiInboundId, xuiUsername, xuiPassword или null
 */
async function getServerByTariffId(tariffId) {
  if (!tariffId) return null
  const settings = await getSettingsCached()
  const servers = settings?.servers || []
  const s = servers.find((server) => (server.tariffIds || []).includes(tariffId))
  return s ? buildServerConnection(s) : null
}

/**
 * Найти сервер по ID (settings.servers[].id).
 * @param {string} serverId
 * @returns {Promise<Object|null>}
 */
async function getServerByServerId(serverId) {
  if (!serverId) return null
  const settings = await getSettingsCached()
  const servers = settings?.servers || []
  const s = servers.find((server) => server.id === serverId)
  return s ? buildServerConnection(s) : null
}

/**
 * Получить xuiClient и inboundId для запроса к 3x-ui.
 * Приоритет: server по tariffId → server по serverId → глобальный getXuiForVpn() и inboundId из body/env.
 * @param {{ tariffId?: string, serverId?: string, inboundId?: string|number }} opts
 * @returns {Promise<{ xui: Object, inboundId: string|number }|{ xui: null, inboundId: string|number }>}
 */
async function getXuiAndInboundForRequest(opts = {}) {
  const { tariffId, serverId, inboundId: bodyInboundId } = opts
  let server = null
  if (tariffId) server = await getServerByTariffId(tariffId)
  if (!server && serverId) server = await getServerByServerId(serverId)
  if (server) {
    const xui = createXuiClient({
      baseUrl: server.baseUrl,
      username: server.xuiUsername ?? process.env.XUI_USERNAME,
      password: server.xuiPassword ?? process.env.XUI_PASSWORD,
    })
    const inboundId = server.xuiInboundId != null && server.xuiInboundId !== '' ? server.xuiInboundId : (bodyInboundId ?? process.env.XUI_INBOUND_ID ?? 1)
    return { xui, inboundId }
  }
  const xui = getXuiForVpn()
  const inboundId = bodyInboundId ?? process.env.XUI_INBOUND_ID ?? 1
  return { xui, inboundId }
}

/** Сценарий бота из Firestore (artifacts/APP_ID/public/settings.telegramBotScenario). Используется в sendMainMenu и buildMainKeyboard. */
async function getTelegramScenario() {
  const s = await getSettingsCached()
  const raw = s.telegramBotScenario
  if (!raw || typeof raw !== 'object') return null
  return {
    welcomeMessage: typeof raw.welcomeMessage === 'string' ? raw.welcomeMessage : '',
    menuMessage: typeof raw.menuMessage === 'string' ? raw.menuMessage : '',
    menuButtons: Array.isArray(raw.menuButtons) ? raw.menuButtons : [],
    callbackResponses: raw.callbackResponses && typeof raw.callbackResponses === 'object' ? raw.callbackResponses : {},
  }
}

/** API-ключ по провайдеру: env или Firestore. */
function getApiKeyForProvider(providerId, s) {
  const envKeys = {
    deepseek: 'DEEPSEEK_API_KEY',
    openai: 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    gemini: 'GEMINI_API_KEY',
    qwen: 'DASHSCOPE_API_KEY',
  }
  const settingKeys = {
    deepseek: 'deepseekApiKey',
    openai: 'openaiApiKey',
    openrouter: 'openrouterApiKey',
    gemini: 'geminiApiKey',
    qwen: 'qwenApiKey',
  }
  const fromEnv = process.env[envKeys[providerId]] && String(process.env[envKeys[providerId]]).trim()
  if (fromEnv) return fromEnv
  const key = settingKeys[providerId] && s[settingKeys[providerId]] != null ? String(s[settingKeys[providerId]]).trim() : ''
  return key || ''
}

/** API-ключ DeepSeek (обратная совместимость). */
async function getDeepSeekApiKey() {
  const s = await getSettingsCached()
  return getApiKeyForProvider('deepseek', s)
}

/** Активная конфигурация ИИ: провайдер, ключ, модель, параметры. */
async function getActiveAiConfig() {
  const s = await getSettingsCached()
  const provider = (s.aiProvider && PROVIDERS[s.aiProvider]) ? s.aiProvider : 'deepseek'
  const apiKey = getApiKeyForProvider(provider, s)
  const def = PROVIDERS[provider]
  let model = (s.aiModel && String(s.aiModel).trim()) || s.deepseekModel || process.env.DEEPSEEK_MODEL || def?.defaultModel || 'deepseek-chat'
  // Не подставлять модель DeepSeek, если выбран другой провайдер (иначе API вернёт "model does not exist")
  const deepseekOnlyModels = ['deepseek-chat', 'deepseek-reasoner']
  if (provider !== 'deepseek' && deepseekOnlyModels.includes(model)) {
    model = def?.defaultModel || 'gpt-4o-mini'
  }
  return {
    provider,
    apiKey,
    model,
    temperature: s.aiTemperature != null ? Number(s.aiTemperature) : (s.deepseekTemperature != null ? Number(s.deepseekTemperature) : 0.5),
    max_tokens: s.aiMaxTokens != null ? Number(s.aiMaxTokens) : (s.deepseekMaxTokens != null ? Number(s.deepseekMaxTokens) : 2048),
    timeout: s.aiTimeoutSeconds != null ? Number(s.aiTimeoutSeconds) : (s.deepseekTimeoutSeconds != null ? Number(s.deepseekTimeoutSeconds) : 50),
    systemPromptPreset: (s.aiSystemPromptPreset != null ? String(s.aiSystemPromptPreset) : '') || (s.deepseekSystemPromptPreset != null ? String(s.deepseekSystemPromptPreset) : '') || '',
  }
}

/**
 * Валидация initData с токеном из env или из настроек Telegram в админ-панели (Firestore).
 * @param {string} initData - строка query string из Telegram.WebApp.initData
 * @returns {Promise<{ ok: true, data: Object } | { ok: false, reason: string, message: string }>}
 */
const TELEGRAM_VERIFY_URL = (process.env.TELEGRAM_VERIFY_URL || '').toString().trim()
const TELEGRAM_VERIFY_SECRET = (process.env.TELEGRAM_VERIFY_SECRET || '').toString().trim()
const TELEGRAM_VERIFY_TIMEOUT_MS = Math.max(5000, parseInt(process.env.TELEGRAM_VERIFY_TIMEOUT_MS || '10000', 10))

/**
 * Запрос проверки Telegram-данных на удалённый сервер (сервер A с токеном бота).
 * Используется, когда на текущем инстансе (B) нет TELEGRAM_BOT_TOKEN, но заданы TELEGRAM_VERIFY_URL и TELEGRAM_VERIFY_SECRET.
 * @param {'initData'|'widget'} type
 * @param {string|object} data - initData string или widgetUser object
 * @returns {Promise<{ ok: boolean, tgId?: string, user?: object, reason?: string, message?: string }>}
 */
async function verifyTelegramRemotely(type, data) {
  if (!TELEGRAM_VERIFY_URL || !TELEGRAM_VERIFY_SECRET) {
    return { ok: false, reason: 'no_verify_config', message: 'Удалённая проверка Telegram не настроена (TELEGRAM_VERIFY_URL, TELEGRAM_VERIFY_SECRET).' }
  }
  const url = TELEGRAM_VERIFY_URL.includes('/verify') ? TELEGRAM_VERIFY_URL.replace(/\/+$/, '') : TELEGRAM_VERIFY_URL.replace(/\/+$/, '') + '/api/telegram/verify'
  const body = type === 'initData' ? { type: 'initData', initData: data } : { type: 'widget', widgetUser: data }
  try {
    const res = await axios.post(url, body, {
      headers: { 'X-Telegram-Verify-Secret': TELEGRAM_VERIFY_SECRET },
      timeout: TELEGRAM_VERIFY_TIMEOUT_MS,
      validateStatus: () => true,
    })
    const d = res.data || {}
    if (res.status === 401) {
      return { ok: false, reason: 'unauthorized', message: 'Неверный секрет удалённой проверки.' }
    }
    if (d.ok && d.tgId) {
      return { ok: true, tgId: d.tgId, user: d.user }
    }
    return { ok: false, reason: d.reason || 'unknown', message: d.message || 'Проверка не пройдена.' }
  } catch (e) {
    const msg = e.response?.data?.message || e.message || 'Ошибка запроса к серверу проверки.'
    return { ok: false, reason: 'remote_error', message: msg }
  }
}

/** Кэш загруженного модуля валидации initData (при отсутствии файла на сервере используется встроенная валидация). */
let telegramInitDataValidationModule = null

/**
 * Валидация initData: локально через telegramInitDataValidation (если есть токен и модуль) или встроенная / TELEGRAM_VERIFY_URL.
 */
async function validateTelegramInitDataWithReasonAsync(initData) {
  const token = await getTelegramToken()
  if (token) {
    try {
      if (!telegramInitDataValidationModule) {
        telegramInitDataValidationModule = await import('./lib/telegramInitDataValidation.js')
      }
      const result = telegramInitDataValidationModule.validateTelegramInitData(initData, token, { maxAgeMs: TELEGRAM_INIT_DATA_MAX_AGE_MS })
      return result
    } catch (err) {
      if (telegramInitDataValidationModule === null) {
        console.warn('Telegram initData: модуль telegramInitDataValidation не найден, используется встроенная валидация:', err.message)
        telegramInitDataValidationModule = false
      }
      const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest()
      const result = validateTelegramInitDataWithReason(initData, secret)
      if (!result.ok && result.reason === 'invalid_hash') return { ...result, reason: 'invalid_signature' }
      if (!result.ok && result.reason === 'expired') return { ...result, reason: 'expired_initData' }
      return result
    }
  }
  if (TELEGRAM_VERIFY_URL && TELEGRAM_VERIFY_SECRET) {
    const remote = await verifyTelegramRemotely('initData', initData)
    if (remote.ok && remote.tgId) {
      return { ok: true, data: { user: { id: remote.tgId, ...(remote.user || {}) } } }
    }
    return { ok: false, reason: remote.reason || 'unknown', message: remote.message || 'Проверка не пройдена.' }
  }
  return { ok: false, reason: 'no_token', message: 'Сервер не настроен для входа через Telegram. Задайте токен бота в .env или в настройках Telegram в админ-панели.' }
}

/**
 * Валидация данных виджета: локально (если есть токен) или через TELEGRAM_VERIFY_URL.
 * Используется в роутере как единая точка входа для auth-widget.
 */
async function validateTelegramWidgetDataOrRemote(widgetUser) {
  const token = await getTelegramToken()
  if (token) return validateTelegramWidgetData(widgetUser, token)
  if (TELEGRAM_VERIFY_URL && TELEGRAM_VERIFY_SECRET) return verifyTelegramRemotely('widget', widgetUser)
  return { ok: false, reason: 'no_token', message: 'Сервер не настроен для входа через Telegram. Задайте токен бота или TELEGRAM_VERIFY_URL.' }
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

/** Отправить главное меню (текст и кнопки из сценария или дефолт) */
async function sendMainMenu(botToken, chatId) {
  const baseUrl = getBaseUrlForTelegram()
  const appUrl = baseUrl ? `${baseUrl}/` : null
  const scenario = await getTelegramScenario()
  const text = (scenario && scenario.menuMessage && scenario.menuMessage.trim())
    ? scenario.menuMessage.trim()
    : `🚀 <b>VPN Панель</b>\n\n<b>Доступные действия:</b>\n• Создать VPN конфиг\n• Управлять подписками\n• Статистика трафика`
  const replyMarkup = buildMainKeyboard(appUrl || undefined, scenario)
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

  const xui = getXuiForVpn()

  try {
    if (action === 'create_vpn' || action === 'add_client') {
      if (!xui) {
        await sendTelegramMessage(botToken, chatId, '⚠️ 3x-ui не настроен на сервере.')
        return
      }
      const clientId = data.clientId || data.uuid
      if (!clientId) {
        await sendTelegramMessage(botToken, chatId, '⚠️ Нет данных для создания конфига (clientId).')
        return
      }
      const inboundId = data.inboundId ?? process.env.XUI_INBOUND_ID ?? 1
      await xui.addClient(inboundId, {
        email: (data.email || `tg_${fromId}@local`).toString().trim(),
        uuid: clientId,
        totalGB: data.totalGB != null ? Number(data.totalGB) : 0,
        expiryTime: data.expiryTime != null ? Number(data.expiryTime) : 0,
        limitIp: data.limitIp != null ? Number(data.limitIp) : 1,
        tgId: fromId,
        subId: (data.subId ?? '').toString(),
      })
      await sendTelegramMessage(botToken, chatId, '✅ Конфиг VPN создан.')
    } else if (action === 'delete_vpn' || action === 'delete_client') {
      if (!xui) {
        await sendTelegramMessage(botToken, chatId, '⚠️ 3x-ui не настроен на сервере.')
        return
      }
      const inboundId = data.inboundId ?? process.env.XUI_INBOUND_ID ?? 1
      if (data.clientId || data.uuid) {
        await xui.delClient(inboundId, data.clientId || data.uuid)
      } else if (data.email) {
        await xui.delClientByEmail(inboundId, data.email)
      } else {
        await sendTelegramMessage(botToken, chatId, '⚠️ Укажите clientId или email для удаления.')
        return
      }
      await sendTelegramMessage(botToken, chatId, '🗑️ Конфиг удалён.')
    } else {
      await sendTelegramMessage(botToken, chatId, '✅ Данные получены.')
    }
  } catch (err) {
    console.error('❌ handleMiniAppData:', err.message)
    await sendTelegramMessage(botToken, chatId, `Ошибка: ${err.message || 'Попробуйте позже.'}`)
  }
}

app.use('/api/telegram', createTelegramRouter({
  getDb: () => db,
  getAdmin: () => admin,
  initFirebaseAdmin,
  getTelegramToken,
  getTelegramBotInfo,
  sendTelegramMessage,
  answerCallbackQuery,
  editMessageText,
  buildMainKeyboard: async (appUrl) => buildMainKeyboard(appUrl, await getTelegramScenario()),
  getScenario: getTelegramScenario,
  findScenarioFromBotBuilder: (database, appId, triggerType, triggerValue) =>
    findScenarioBotBuilder(database, appId, triggerType, triggerValue),
  logTelegramUpdate: (update) => {
    const id = update?.update_id
    const kind = update?.callback_query ? 'callback_query' : update?.message ? 'message' : 'other'
    console.log('[Telegram] update', { update_id: id, kind })
  },
  validateTelegramInitDataWithReasonAsync,
  validateTelegramWidgetData,
  validateTelegramWidgetDataOrRemote,
  logTelegramAuth,
  verifyIdToken,
  verifyTelegramWebhookSecret,
  APP_ID,
  TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_VERIFY_SECRET,
  TELEGRAM_SESSION_TTL_MS,
  getBaseUrlForTelegram,
  sendMainMenu,
  handleMiniAppData,
  getWebhookUrl,
  callN8NWebhook,
  randomUUID,
  crypto,
}))

app.use('/api/bot-builder', createBotBuilderRouter({
  ensureAdmin,
  getDb: () => db,
  APP_ID,
}))

// Явный маршрут GET /api/analytics/funnel (на случай если роутер не матчится первым)
app.get('/api/analytics/funnel', async (req, res) => {
  req.db = db
  req.APP_ID = APP_ID
  req.redisGet = () => Promise.resolve(null)
  req.redisSet = () => Promise.resolve()
  const ok = await ensureAdmin(req, res)
  if (!ok?.ok) return
  return analyticsController.getFunnel(req, res)
})

app.post('/api/analytics/finance-analysis', express.json(), async (req, res) => {
  req.db = db
  req.APP_ID = APP_ID
  req.getActiveAiConfig = getActiveAiConfig
  req.unifiedChat = unifiedChat
  const ok = await ensureAdmin(req, res)
  if (!ok?.ok) return
  return analyticsController.financeAnalysis(req, res)
})

app.use('/api/analytics', createAnalyticsRouter({
  ensureAdmin,
  getDb: () => db,
  APP_ID,
  redisGet: () => Promise.resolve(null),
  redisSet: () => Promise.resolve(),
  getTelegramToken,
  sendTelegramMessage,
  getBaseUrlForTelegram,
  getActiveAiConfig,
  unifiedChat,
}))

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
 * Важно: маршрут с express.json() чтобы body гарантированно парсился.
 */
app.patch('/api/admin/telegram/settings', express.json(), async (req, res) => {
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
      settingsCache = { data: null, expiresAt: 0 }
    }
    if (adminChatId !== undefined) {
      update.telegramAdminChatId = adminChatId || null
      settingsCache = { data: null, expiresAt: 0 }
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, error: 'Укажите token или adminChatId в теле запроса (JSON)' })
    }
    await settingsRef.set(update, { merge: true })
    if (token !== undefined) {
      console.log('✅ Telegram: токен сохранён в Firestore (artifacts/%s/public/settings). Будет использоваться для уведомлений и привязки.', APP_ID)
    }
    if (adminChatId !== undefined) {
      console.log('✅ Telegram: adminChatId для уведомлений о тикетах сохранён в Firestore.')
    }
    const configured = Boolean(token !== undefined ? (token && token.length > 0) : (await getTelegramToken()))
    res.json({ success: true, configured, savedTo: 'firestore' })
  } catch (err) {
    console.error('❌ PATCH /api/admin/telegram/settings:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** GET /api/admin/telegram/scenario — сценарий бота (только админ). */
app.get('/api/admin/telegram/scenario', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  try {
    const scenario = await getTelegramScenario()
    res.json({
      success: true,
      scenario: scenario || {
        welcomeMessage: '',
        menuMessage: '',
        menuButtons: [],
        callbackResponses: {},
      },
    })
  } catch (err) {
    console.error('❌ GET /api/admin/telegram/scenario:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** PATCH /api/admin/telegram/scenario — сохранить сценарий бота в Firestore (только админ). */
app.patch('/api/admin/telegram/scenario', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  const body = req.body || {}
  const scenario = body.scenario != null ? body.scenario : body
  try {
    const settingsRef = db.doc(`artifacts/${APP_ID}/public/settings`)
    const rawButtons = Array.isArray(scenario.menuButtons) ? scenario.menuButtons : []
    const menuButtons = rawButtons.map((row) => {
      if (!Array.isArray(row)) return []
      return row.map((btn) => {
        if (btn == null || typeof btn !== 'object') return { type: 'callback', text: '', callback_data: '' }
        const b = {}
        if (btn.type != null) b.type = String(btn.type)
        if (btn.text != null) b.text = String(btn.text)
        if (btn.url != null) b.url = String(btn.url)
        if (btn.callback_data != null) b.callback_data = String(btn.callback_data)
        return b
      }).filter((b) => Object.keys(b).length > 0)
    }).filter((row) => row.length > 0)
    const rawResponses = scenario.callbackResponses && typeof scenario.callbackResponses === 'object' ? scenario.callbackResponses : {}
    const callbackResponses = {}
    for (const k of ['PROFILE', 'HELP', 'MENU']) {
      const v = rawResponses[k]
      if (v != null && typeof v === 'string') callbackResponses[k] = v
    }
    const normalized = {
      welcomeMessage: typeof scenario.welcomeMessage === 'string' ? scenario.welcomeMessage : '',
      menuMessage: typeof scenario.menuMessage === 'string' ? scenario.menuMessage : '',
      menuButtons,
      callbackResponses,
    }
    await settingsRef.set({ telegramBotScenario: normalized }, { merge: true })
    settingsCache = { data: null, expiresAt: 0 }
    console.log('✅ Telegram: сценарий бота сохранён в Firestore.')
    res.json({ success: true, savedTo: 'firestore' })
  } catch (err) {
    console.error('❌ PATCH /api/admin/telegram/scenario:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** GET /api/admin/ai/status — статус настройки ИИ (провайдер, модель, параметры). Токен не возвращаем. Только админ. */
app.get('/api/admin/ai/status', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const config = await getActiveAiConfig()
  const models = PROVIDER_MODELS[config.provider] || PROVIDER_MODELS.deepseek
  const providers = Object.keys(PROVIDERS).map((id) => ({ id, name: PROVIDERS[id].name }))
  res.json({
    success: true,
    configured: Boolean(config.apiKey && config.apiKey.length > 0),
    provider: config.provider,
    providers,
    model: config.model,
    models,
    temperature: config.temperature,
    maxTokens: config.max_tokens,
    timeoutSeconds: config.timeout,
    systemPromptPreset: config.systemPromptPreset || '',
  })
})

/** PATCH /api/admin/ai/settings — сохранить настройки ИИ в Firestore. Только админ. */
app.patch('/api/admin/ai/settings', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  const body = req.body || {}
  const update = {}
  const currentConfig = await getActiveAiConfig()
  if (body.provider !== undefined && PROVIDERS[body.provider]) {
    update.aiProvider = body.provider
  }
  if (body.apiKey !== undefined) {
    const key = String(body.apiKey).trim()
    const provider = (body.provider && PROVIDERS[body.provider]) ? body.provider : currentConfig.provider
    const settingKeys = { deepseek: 'deepseekApiKey', openai: 'openaiApiKey', openrouter: 'openrouterApiKey', gemini: 'geminiApiKey', qwen: 'qwenApiKey' }
    if (settingKeys[provider]) {
      // Сохраняем ключ только если передан непустой — пустой не записываем, чтобы не затирать уже сохранённый ключ при смене провайдера
      if (key) {
        update[settingKeys[provider]] = key
        update[settingKeys[provider] + 'UpdatedAt'] = new Date().toISOString()
      }
    }
  }
  if (body.model !== undefined) update.aiModel = body.model ? String(body.model).trim() || null : null
  if (body.temperature !== undefined) update.aiTemperature = body.temperature != null ? Number(body.temperature) : null
  if (body.maxTokens !== undefined) update.aiMaxTokens = body.maxTokens != null ? Number(body.maxTokens) : null
  if (body.timeoutSeconds !== undefined) update.aiTimeoutSeconds = body.timeoutSeconds != null ? Number(body.timeoutSeconds) : null
  if (body.systemPromptPreset !== undefined) update.aiSystemPromptPreset = body.systemPromptPreset != null ? String(body.systemPromptPreset) : null
  if (Object.keys(update).length === 0) {
    const cfg = await getActiveAiConfig()
    return res.json({ success: true, configured: Boolean(cfg.apiKey) })
  }
  try {
    settingsCache = { data: null, expiresAt: 0 }
    const settingsRef = db.doc(`artifacts/${APP_ID}/public/settings`)
    await settingsRef.set(update, { merge: true })
    const cfg = await getActiveAiConfig()
    console.log('✅ ИИ: настройки сохранены (провайдер %s)', cfg.provider)
    res.json({ success: true, configured: Boolean(cfg.apiKey), savedTo: 'firestore' })
  } catch (err) {
    console.error('❌ PATCH /api/admin/ai/settings:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** POST /api/admin/telegram/set-webhook — единственная точка установки webhook (polling не используется; у бота только один webhook). */
app.post('/api/admin/telegram/set-webhook', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const botToken = await getTelegramToken()
  if (!botToken) return res.status(400).json({ success: false, error: 'Сначала сохраните токен бота' })
  const baseFromEnv = (process.env.TELEGRAM_WEBHOOK_BASE_URL || process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').toString().trim().replace(/\/+$/, '')
  const baseUrl = baseFromEnv || (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
    ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
    : `${req.protocol}://${req.get('host')}`)
  const webhookUrl = `${baseUrl.replace(/\/+$/, '')}/api/telegram/webhook`
  const opts = {
    allowed_updates: ['message', 'callback_query'],
    secret_token: TELEGRAM_WEBHOOK_SECRET && TELEGRAM_WEBHOOK_SECRET.trim() ? TELEGRAM_WEBHOOK_SECRET.trim() : undefined,
  }
  try {
    const result = await setTelegramWebhook(botToken, webhookUrl, opts)
    if (!result.ok) return res.status(400).json({ success: false, error: result.error || 'Ошибка Telegram API' })
    const appBase = getBaseUrlForTelegram() || baseUrl.replace(/\/+$/, '')
    const menuUrl = appBase ? `${appBase.replace(/\/+$/, '')}/` : ''
    let menuButtonSet = false
    if (menuUrl) {
      const menuResult = await setTelegramMenuButton(botToken, menuUrl, 'Открыть приложение')
      menuButtonSet = menuResult.ok
      if (!menuResult.ok) console.warn('⚠️ Кнопка меню бота не установлена:', menuResult.error)
    }
    res.json({ success: true, webhookUrl, secretTokenSet: Boolean(opts.secret_token), menuButtonSet })
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

/** POST /api/admin/telegram/set-menu-button — установить кнопку меню бота «Открыть приложение» (только админ) */
app.post('/api/admin/telegram/set-menu-button', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const botToken = await getTelegramToken()
  if (!botToken) return res.status(400).json({ success: false, error: 'Токен бота не настроен' })
  const appBase = getBaseUrlForTelegram() || (process.env.TELEGRAM_WEBHOOK_BASE_URL || '').toString().trim().replace(/\/+$/, '')
  if (!appBase) return res.status(400).json({ success: false, error: 'Не задан PUBLIC_URL / FRONTEND_URL / TELEGRAM_WEBHOOK_BASE_URL' })
  const menuUrl = `${appBase.replace(/\/+$/, '')}/`
  try {
    const result = await setTelegramMenuButton(botToken, menuUrl, 'Открыть приложение')
    if (!result.ok) return res.status(400).json({ success: false, error: result.error })
    res.json({ success: true, menuUrl })
  } catch (err) {
    console.error('❌ POST /api/admin/telegram/set-menu-button:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** GET /api/admin/telegram/logs — последние логи TMA (авторизация Mini App) для анализа проблем (только админ). */
app.get('/api/admin/telegram/logs', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, TMA_LOG_BUFFER_MAX)
  const entries = getTmaLogBuffer(limit)
  res.json({ success: true, logs: entries })
})

/** GET /api/admin/system/logs — последние системные логи сервера (только админ). */
app.get('/api/admin/system/logs', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return

  const max = getSystemLogMax()
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, max)
  const since = req.query.since != null ? String(req.query.since) : undefined
  const level = req.query.level != null ? String(req.query.level) : undefined
  const category = req.query.category != null ? String(req.query.category) : undefined
  const search = req.query.search != null ? String(req.query.search) : undefined

  const logs = getSystemLogs({ limit, since, level, category, search })
  res.json({ success: true, logs })
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
  const settings = await getSettingsCached()
  const id = (settings.telegramAdminChatId) ? String(settings.telegramAdminChatId).trim() : ''
  return id
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
          await doc.ref.delete().catch((err) => console.warn('notifyAdminError: delete old doc failed', err?.message))
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

/** GET /api/push-vapid-public — публичный ключ VAPID для подписки на push (без авторизации). При отсутствии ключей возвращает 200 и success: false, чтобы клиент не получал 503. */
app.get('/api/push-vapid-public', (req, res) => {
  if (!VAPID_PUBLIC) return res.json({ success: false, publicKey: null, error: 'Web Push не настроен' })
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
 * POST /api/admin/auth/unlink-google — отвязать вход через Google у всех пользователей Firebase Auth (только админ).
 * Для пользователей с несколькими провайдерами отвязывается только Google.
 * Для пользователей только с Google: задаётся временный пароль, затем отвязывается Google; в ответе — ссылки для сброса пароля (отправьте пользователям).
 */
app.post('/api/admin/auth/unlink-google', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!admin) return res.status(503).json({ success: false, error: 'Firebase Admin недоступен' })

  const dryRun = req.body?.dryRun === true
  const results = { unlinked: 0, onlyGoogle: [], errors: [] }
  let pageToken = undefined

  try {
    do {
      const listResult = await admin.auth().listUsers(1000, pageToken)
      pageToken = listResult.pageToken

      for (const userRecord of listResult.users) {
        const uid = userRecord.uid
        const email = userRecord.email || ''
        const providers = (userRecord.providerData || []).map((p) => p.providerId)
        if (!providers.includes('google.com')) continue

        const onlyGoogle = providers.length === 1
        try {
          if (onlyGoogle) {
            const tempPassword = crypto.randomBytes(12).toString('hex')
            if (!dryRun) {
              await admin.auth().updateUser(uid, { password: tempPassword })
              await admin.auth().updateUser(uid, { providersToUnlink: ['google.com'] })
              const resetLink = await admin.auth().generatePasswordResetLink(email, { url: (req.body?.continueUrl || process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').trim() || undefined })
              results.onlyGoogle.push({ uid, email, temporaryPassword: tempPassword, resetLink })
            } else {
              results.onlyGoogle.push({ uid, email, dryRun: true })
            }
          } else {
            if (!dryRun) await admin.auth().updateUser(uid, { providersToUnlink: ['google.com'] })
          }
          results.unlinked++
        } catch (err) {
          results.errors.push({ uid, email, error: err.message })
        }
      }
    } while (pageToken)

    return res.json({
      success: true,
      dryRun,
      unlinked: results.unlinked,
      onlyGoogleCount: results.onlyGoogle.length,
      onlyGoogle: results.onlyGoogle,
      errors: results.errors,
    })
  } catch (err) {
    console.error('❌ POST /api/admin/auth/unlink-google:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * Внутренняя функция: уведомить пользователя об ответе поддержки (Telegram + Web Push).
 * baseUrl — корень приложения для ссылки в уведомлении (опционально).
 */
async function notifyUserAboutSupportReply(uid, ticketId, subject, text, baseUrl = null) {
  if (!db) return { telegramSent: false, webPushSent: 0 }
  const tid = (ticketId ?? '').toString().trim()
  const appRoot = (baseUrl || process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '')
  const linkPath = tid ? `/#support?ticket=${encodeURIComponent(tid)}` : '/#support'
  const linkUrl = appRoot ? `${appRoot}${linkPath}` : ''
  const msgText = (text ?? '').toString().trim().slice(0, 200)
  const pushPayload = { title: 'Ответ поддержки', body: msgText || 'Новое сообщение в обращении', url: linkUrl, ticketId: tid, type: 'support-reply' }
  let telegramSent = false
  let webPushSent = 0
  const botToken = await getTelegramToken()
  const userSnap = await db.doc(`artifacts/${APP_ID}/public/data/users_v4/${uid}`).get()
  const tgId = (userSnap.exists && userSnap.data().tgId) ? String(userSnap.data().tgId).trim() : ''
  if (botToken && tgId) {
    const safeHref = linkUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    const telegramText = `📩 <b>Ответ поддержки</b>\n\nТема: ${escapeHtml((subject ?? '').trim()) || 'Обращение'}\n\n${escapeHtml(msgText) || '—'}\n\n🔗 <a href="${safeHref}">Открыть обращение в личном кабинете</a>`
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
  return { telegramSent, webPushSent }
}

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
  const subj = (subject ?? '').toString().trim()
  const msgText = (text ?? '').toString().trim().slice(0, 200)

  try {
    const result = await notifyUserAboutSupportReply(uid, tid, subj, msgText, baseUrl)
    const sent = result.telegramSent || result.webPushSent > 0
    const userSnap = await db.doc(`artifacts/${APP_ID}/public/data/users_v4/${uid}`).get()
    const tgId = (userSnap.exists && userSnap.data().tgId) ? String(userSnap.data().tgId).trim() : ''
    return res.status(200).json({
      success: true,
      sent,
      telegram: result.telegramSent,
      webPush: result.webPushSent,
      reason: sent ? null : (tgId ? 'Ошибка Telegram' : 'Включите уведомления в браузере или привяжите Telegram'),
    })
  } catch (err) {
    console.error('❌ POST /api/notify/support-reply:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * POST /api/notify/discount-assigned — отправить клиенту в Telegram сообщение о назначенной скидке (только админ).
 * Body: { userId, percent, validFrom, validTo } — validFrom/validTo в мс или ISO-строках.
 */
app.post('/api/notify/discount-assigned', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  if (!db) return res.status(503).json({ success: false, error: 'Сервис недоступен' })
  const { userId, percent, validFrom, validTo } = req.body || {}
  const uid = (userId ?? '').toString().trim()
  if (!uid) return res.status(400).json({ success: false, error: 'Укажите userId' })
  const percentNum = Math.min(100, Math.max(0, Number(percent) || 0))
  const fromMs = validFrom != null ? (typeof validFrom === 'number' ? validFrom : new Date(validFrom).getTime()) : null
  const toMs = validTo != null ? (typeof validTo === 'number' ? validTo : new Date(validTo).getTime()) : null
  const fromStr = fromMs != null && !isNaN(fromMs) ? new Date(fromMs).toLocaleDateString('ru-RU') : ''
  const toStr = toMs != null && !isNaN(toMs) ? new Date(toMs).toLocaleDateString('ru-RU') : ''
  const botToken = await getTelegramToken()
  const userSnap = await db.doc(`artifacts/${APP_ID}/public/data/users_v4/${uid}`).get()
  const rawTgId = userSnap.exists && userSnap.data() && userSnap.data().tgId != null
    ? userSnap.data().tgId
    : null
  const tgId = rawTgId !== null && rawTgId !== undefined
    ? (typeof rawTgId === 'number' ? String(rawTgId) : String(rawTgId).trim())
    : ''
  if (!botToken || !tgId) {
    return res.status(200).json({
      success: true,
      sent: false,
      reason: !botToken ? 'Telegram бот не настроен (укажите токен в настройках или TELEGRAM_BOT_TOKEN)' : 'У пользователя не привязан Telegram',
    })
  }
  const text = `🎁 <b>Вам назначена персональная скидка ${percentNum}%</b>\n\nДействует с ${escapeHtml(fromStr) || '—'} по ${escapeHtml(toStr) || '—'}.\n\nПри оплате подписки скидка применится автоматически.`
  try {
    const result = await sendTelegramMessage(botToken, tgId, text)
    if (result.ok) {
      console.log('📨 Уведомление о скидке отправлено в Telegram', { userId: uid })
      return res.json({ success: true, sent: true })
    }
    const errMsg = result.error || 'Ошибка Telegram'
    console.warn('⚠️ POST /api/notify/discount-assigned: Telegram не отправил', { userId: uid, error: errMsg })
    return res.status(200).json({ success: true, sent: false, reason: errMsg })
  } catch (err) {
    console.error('❌ POST /api/notify/discount-assigned:', err.message)
    return res.status(200).json({ success: true, sent: false, reason: err.message || 'Ошибка отправки в Telegram' })
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

/** GET /api/admin/platega-settings — настройки Platega (legacy). Редирект на payment-settings. */
app.get('/api/admin/platega-settings', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  try {
    const data = await getPlategaSettingsFromLocal()
    res.json({
      success: true,
      plategaMerchantId: data.plategaMerchantId || '',
      plategaSecretKey: data.plategaSecretKey || '',
      hasMerchantId: !!data.plategaMerchantId,
      hasSecretKey: !!data.plategaSecretKey,
    })
  } catch (err) {
    console.error('❌ GET /api/admin/platega-settings:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** PATCH /api/admin/platega-settings — legacy. */
app.patch('/api/admin/platega-settings', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  try {
    const body = req.body || {}
    const plategaMerchantId = (body.plategaMerchantId ?? body.platega_merchant_id ?? '').toString().trim()
    const plategaSecretKey = (body.plategaSecretKey ?? body.platega_secret_key ?? '').toString().trim()
    if (plategaMerchantId && plategaMerchantId.length < 10) {
      return res.status(400).json({ success: false, error: 'ID мерчанта слишком короткий' })
    }
    if (plategaSecretKey && plategaSecretKey.length < 10) {
      return res.status(400).json({ success: false, error: 'API ключ слишком короткий' })
    }
    await setPlategaSettingsToLocal({ plategaMerchantId, plategaSecretKey })
    console.log('✅ Platega: настройки сохранены в локальный файл (server/data/platega-settings.json)')

    if (db) {
      try {
        const APP_ID = process.env.APP_ID || 'skyputh'
        await db.doc(`artifacts/${APP_ID}/public/settings`).set({ plategaMerchantId, plategaSecretKey }, { merge: true })
      } catch (_) { /* не блокируем */ }
    }

    res.json({
      success: true,
      hasMerchantId: !!plategaMerchantId,
      hasSecretKey: !!plategaSecretKey,
    })
  } catch (err) {
    console.error('❌ PATCH /api/admin/platega-settings:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/admin/payment-settings — настройки Platega из server/data/platega-settings.json.
 * Возвращает БЕЗ secretKey (только merchantId, hasMerchantId, hasSecretKey).
 * Если файл отсутствует — 200 + пустой объект.
 */
app.get('/api/admin/payment-settings', async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  try {
    const data = await getPlategaSettingsFromLocal()
    res.status(200).json({
      success: true,
      plategaMerchantId: data.plategaMerchantId || '',
      hasMerchantId: !!data.plategaMerchantId,
      hasSecretKey: !!data.plategaSecretKey,
    })
  } catch (err) {
    console.error('❌ GET /api/admin/payment-settings:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * POST /api/admin/payment-settings — сохранить настройки Platega.
 * Если plategaSecretKey пустой — сохраняем существующий (не перезаписываем).
 */
app.post('/api/admin/payment-settings', express.json(), async (req, res) => {
  const adminOk = await ensureAdmin(req, res)
  if (!adminOk?.ok) return
  try {
    const body = req.body || {}
    console.log('[Admin API] Запрос на сохранение настроек:', {
      plategaMerchantId: body.plategaMerchantId ?? body.platega_merchant_id ?? '(не указан)',
      hasSecretKey: !!((body.plategaSecretKey ?? body.platega_secret_key ?? '').toString().trim()),
    })
    const plategaMerchantId = (body.plategaMerchantId ?? body.platega_merchant_id ?? '').toString().trim()
    let plategaSecretKey = (body.plategaSecretKey ?? body.platega_secret_key ?? '').toString().trim()

    if (plategaMerchantId && plategaMerchantId.length < 10) {
      return res.status(400).json({ success: false, error: 'ID мерчанта слишком короткий' })
    }
    if (plategaSecretKey && plategaSecretKey.length < 10) {
      return res.status(400).json({ success: false, error: 'API ключ слишком короткий' })
    }

    if (!plategaSecretKey) {
      const existing = await getPlategaSettingsFromLocal()
      plategaSecretKey = existing.plategaSecretKey || ''
    }

    await setPlategaSettingsToLocal({ plategaMerchantId, plategaSecretKey })
    console.log('✅ Platega: настройки сохранены в server/data/platega-settings.json')

    if (db) {
      try {
        const APP_ID = process.env.APP_ID || 'skyputh'
        const settingsRef = db.doc(`artifacts/${APP_ID}/public/settings`)
        await settingsRef.set({ plategaMerchantId, plategaSecretKey }, { merge: true })
        console.log('✅ Platega: ключи также сохранены в Firestore (artifacts/%s/public/settings)', APP_ID)
      } catch (fsErr) {
        console.warn('⚠️ Platega: не удалось сохранить ключи в Firestore:', fsErr.message)
      }
    }

    res.status(200).json({
      success: true,
      hasMerchantId: !!plategaMerchantId,
      hasSecretKey: !!plategaSecretKey,
    })
  } catch (err) {
    console.error('❌ POST /api/admin/payment-settings:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * ВРЕМЕННЫЙ: GET /api/payment/test-platega — тест генерации ссылки Platega.
 * Сравните signatureSource (JSON payload) с документацией Platega.
 * Удалить перед продакшеном.
 */
app.get('/api/payment/test-platega', async (req, res) => {
  try {
    const { merchantId, secretKey } = await getPlategaCredentials()

    if (!merchantId || !secretKey) {
      return res.status(400).json({
        success: false,
        error: 'Platega не настроен. Задайте ключи в админке или PLATEGA_MERCHANT_ID + PLATEGA_SECRET_KEY в .env',
      })
    }

    const orderId = `test_${Date.now()}`
    const baseUrl = (process.env.PUBLIC_URL || process.env.FRONTEND_URL || 'https://www.skypath.fun')
      .toString()
      .trim()
      .replace(/\/+$/, '') || null

    const result = await generatePaymentLinkFromService(
      {
        userId: 'test-user-id',
        amount: 100,
        tariffId: 'test-tariff',
        userData: null,
        baseUrl,
        orderId,
      },
      { merchantId, secretKey }
    )

    const returnUrl = buildRedirectUrl(baseUrl, '/payment/success', orderId)
    const failedUrl = buildRedirectUrl(baseUrl, '/payment/fail', orderId)
    const signatureSource = JSON.stringify({
      paymentMethod: 2,
      paymentDetails: { amount: '100.00', currency: 'RUB' },
      description: 'VPN тариф test-tariff',
      return: returnUrl,
      failedUrl,
      payload: JSON.stringify({ userId: 'test-user-id', tariffId: 'test-tariff', uuid: null, orderId }),
    }, null, 2)

    console.log('[Test Platega] Финальный URL:', result.paymentUrl)
    console.log('[Test Platega] signatureSource (JSON payload, отправленный в Platega API):', signatureSource)

    res.status(200).json({
      success: true,
      paymentUrl: result.paymentUrl,
      orderId: result.orderId,
      transactionId: result.transactionId || null,
      signatureSource,
    })
  } catch (err) {
    console.error('❌ GET /api/payment/test-platega:', err.message, err.response?.data)
    res.status(500).json({
      success: false,
      error: err.message || 'Ошибка генерации тестовой ссылки',
      details: err.response?.data || null,
    })
  }
})

/**
 * Создание заказа на оплату (без внешней платёжной системы)
 * POST /api/payment/generate-link
 *
 * Генерирует orderId и создаёт запись в Firestore со статусом pending.
 * paymentUrl не возвращается (оплата — по реквизитам / другой интеграции).
 */
function isTimeoutError(message) {
  if (!message || typeof message !== 'string') return false
  const s = message.toLowerCase()
  return s.includes('timeout') || s.includes('etimedout') || s.includes('econnaborted')
}

app.post('/api/payment/generate-link', async (req, res) => {
  try {
    const result = await generatePaymentLinkLocal(req.body)
    res.json(result)
  } catch (error) {
    const statusCode = error.statusCode || 500
    console.error('❌ n8n-webhook-proxy: Ошибка generate-link:', { message: error.message })
    const userMessage = isTimeoutError(error.message)
      ? 'Платёжный сервис не ответил вовремя. Попробуйте позже.'
      : (error.message || 'Ошибка создания заказа')
    res.status(statusCode).json({
      success: false,
      error: userMessage,
    })
  }
})

/**
 * Создание платежа (обратная совместимость)
 * POST /api/payments/create — тот же поток, что и /api/payment/generate-link.
 */
app.post('/api/payments/create', async (req, res) => {
  try {
    const result = await generatePaymentLinkLocal(req.body)
    res.json(result)
  } catch (error) {
    const statusCode = error.statusCode || 500
    const userMessage = isTimeoutError(error.message)
      ? 'Платёжный сервис не ответил вовремя. Попробуйте позже.'
      : (error.message || 'Ошибка создания заказа')
    res.status(statusCode).json({
      success: false,
      error: userMessage,
    })
  }
})

/**
 * Загрузка настроек платежей из Firestore (для webhook и др.; без привязки к конкретному провайдеру)
 */
async function loadPaymentSettings() {
  if (!db) await initFirebaseAdmin()
  if (!db) return {}
  try {
    const data = await getSettingsCached()
    if (Object.keys(data || {}).length) return data
    return {}
  } catch (err) {
    console.error('❌ Ошибка загрузки настроек платежей:', err.message)
    return {}
  }
}

/**
 * Загрузка настроек платежей напрямую из Firestore без кэша (для генерации ссылки на оплату).
 * Сначала читает документ по APP_ID; если в нём нет ключей Platega — пробует artifacts/skyputh/public/settings (на случай старой сборки фронта).
 */
async function loadPaymentSettingsFresh() {
  if (!db) await initFirebaseAdmin()
  if (!db) return {}
  const appId = process.env.APP_ID || 'skyputh'
  const tryDoc = async (id) => {
    try {
      const snap = await db.doc(`artifacts/${id}/public/settings`).get()
      return snap.exists ? snap.data() : {}
    } catch {
      return {}
    }
  }
  const data = await tryDoc(appId)
  const hasPlatega = !!(data.plategaMerchantId || data.platega_merchant_id) && !!(data.plategaSecretKey || data.platega_secret_key)
  if (hasPlatega) return data
  if (appId !== 'skyputh') {
    const fallback = await tryDoc('skyputh')
    const fallbackHasPlatega = !!(fallback.plategaMerchantId || fallback.platega_merchant_id) && !!(fallback.plategaSecretKey || fallback.platega_secret_key)
    if (fallbackHasPlatega) {
      console.log('ℹ️ Platega: ключи взяты из artifacts/skyputh/public/settings (fallback)')
      return fallback
    }
  }
  return data
}

/**
 * Загрузить учётные данные Platega для генерации ссылки.
 * Приоритет: локальный файл (server/data/platega-settings.json, через админку) → env → Firestore (fallback).
 * @returns {Promise<{ merchantId: string|null, secretKey: string|null }>}
 */
async function getPlategaCredentials() {
  const local = await getPlategaSettingsFromLocal()
  let merchantId = local.plategaMerchantId || null
  let secretKey = local.plategaSecretKey || null
  if (merchantId && secretKey) {
    return { merchantId, secretKey }
  }
  merchantId = merchantId || process.env.PLATEGA_MERCHANT_ID || null
  secretKey = secretKey || process.env.PLATEGA_SECRET_KEY || null
  if (merchantId && secretKey) {
    return { merchantId, secretKey }
  }
  const settings = await loadPaymentSettingsFresh()
  merchantId = merchantId || settings.plategaMerchantId || settings.platega_merchant_id || null
  secretKey = secretKey || settings.plategaSecretKey || settings.platega_secret_key || null
  return { merchantId, secretKey }
}

/** Путь к локальному файлу с настройками Platega (только на сервере, никуда не передаётся). */
const PLATEGA_LOCAL_SETTINGS_PATH = path.join(__dirname, 'data', 'platega-settings.json')
const PLATEGA_DATA_DIR = path.dirname(PLATEGA_LOCAL_SETTINGS_PATH)

try {
  fs.mkdirSync(PLATEGA_DATA_DIR, { recursive: true })
} catch (err) {
  console.warn('⚠️ Не удалось создать server/data:', err.message)
}

/**
 * Прочитать настройки Platega из локального файла (server/data/platega-settings.json).
 * Файл в .gitignore, данные никуда не отправляются.
 * @returns {Promise<{ plategaMerchantId?: string, plategaSecretKey?: string }>}
 */
async function getPlategaSettingsFromLocal() {
  try {
    const raw = await readFile(PLATEGA_LOCAL_SETTINGS_PATH, 'utf8')
    const data = JSON.parse(raw || '{}')
    return {
      plategaMerchantId: (data.plategaMerchantId || data.platega_merchant_id || '').toString().trim() || null,
      plategaSecretKey: (data.plategaSecretKey || data.platega_secret_key || '').toString().trim() || null,
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('❌ Ошибка чтения локальных настроек Platega:', err.message)
    return { plategaMerchantId: null, plategaSecretKey: null }
  }
}

/**
 * Записать настройки Platega в локальный файл (только на сервере).
 * @param {{ plategaMerchantId?: string, plategaSecretKey?: string }} data
 */
async function setPlategaSettingsToLocal(data) {
  const dir = path.dirname(PLATEGA_LOCAL_SETTINGS_PATH)
  await mkdir(dir, { recursive: true })
  const payload = {
    plategaMerchantId: (data.plategaMerchantId || '').toString().trim() || '',
    plategaSecretKey: (data.plategaSecretKey || '').toString().trim() || '',
    updatedAt: new Date().toISOString(),
  }
  await writeFile(PLATEGA_LOCAL_SETTINGS_PATH, JSON.stringify(payload, null, 2), 'utf8')
}

const PLATEGA_API_BASE = 'https://app.platega.io'

/** Маппинг статусов Platega (PaymentStatus) в внутренний статус платежа */
const PLATEGA_STATUS_MAP = {
  PENDING: 'pending',
  CANCELED: 'cancelled',
  CONFIRMED: 'completed',
  CHARGEBACKED: 'chargebacked',
}

/**
 * Проверка статуса транзакции в Platega.
 * GET /transaction/{id}
 * @param {string} transactionId - UUID транзакции в Platega
 * @param {string} merchantId - ID мерчанта (X-MerchantId)
 * @param {string} secretKey - API ключ (X-Secret)
 * @returns {Promise<{ id: string, status: string, paymentDetails?: object }|null>} Данные транзакции или null при ошибке
 */
async function getPlategaTransactionStatus(transactionId, merchantId, secretKey) {
  if (!transactionId || !merchantId || !secretKey) return null
  const url = `${PLATEGA_API_BASE}/transaction/${encodeURIComponent(transactionId)}`
  try {
    const response = await axios.get(url, {
      headers: {
        'X-MerchantId': merchantId,
        'X-Secret': secretKey,
      },
      timeout: 10000,
      validateStatus: (s) => s === 200 || s === 404 || s >= 400,
    })
    if (response.status !== 200) {
      if (response.status === 404) {
        console.log('ℹ️ Platega: транзакция не найдена', { transactionId })
        return null
      }
      console.warn('⚠️ Platega GET /transaction/:id', { status: response.status, data: response.data })
      return null
    }
    const data = response.data || {}
    return {
      id: data.id,
      status: data.status,
      paymentDetails: data.paymentDetails,
    }
  } catch (err) {
    console.error('❌ Platega: ошибка запроса статуса транзакции', { transactionId, message: err.message })
    return null
  }
}

/**
 * Синхронизирует статус платежа с Platega: запрашивает статус, при необходимости обновляет Firestore и запускает активацию подписки.
 * Используется и в GET /api/payment/status, и в фоновой проверке pending-платежей.
 * @param {FirebaseFirestore.DocumentReference} paymentDocRef - ссылка на документ платежа
 * @param {Object} paymentData - данные платежа (id, orderId, userId, tariffId, status, transactionId, ...)
 * @param {string} merchantId - X-MerchantId для Platega
 * @param {string} secretKey - X-Secret для Platega
 * @returns {Promise<{ updated: boolean, newStatus?: string, plategaResult?: object }>}
 */
async function syncPaymentStatusFromPlatega(paymentDocRef, paymentData, merchantId, secretKey) {
  const transactionId = paymentData.transactionId || paymentData.transaction_id
  const orderId = paymentData.orderId
  // Для подтверждённых (completed/cancelled/chargebacked) фоновая проверка не выполняется
  if (!transactionId || !merchantId || !secretKey || paymentData.status !== 'pending') {
    return { updated: false }
  }
  const plategaResult = await getPlategaTransactionStatus(transactionId, merchantId, secretKey)
  if (!plategaResult) return { updated: false }
  const mappedStatus = PLATEGA_STATUS_MAP[plategaResult.status] || paymentData.status
  if (mappedStatus === paymentData.status) return { updated: false, newStatus: mappedStatus, plategaResult }

  if (mappedStatus === 'completed') {
    await paymentDocRef.update({
      status: 'completed',
      completedAt: new Date().toISOString(),
      plategaStatus: plategaResult.status,
    })
    const updatedData = { ...paymentData, status: 'completed', completedAt: new Date().toISOString() }
    if (updatedData.userId && updatedData.tariffId) {
      try {
        await activateSubscriptionAfterPayment(updatedData)
        console.log('✅ Фоновая проверка: подписка активирована после оплаты', { orderId, userId: updatedData.userId })
      } catch (activationErr) {
        console.error('❌ Фоновая проверка: ошибка активации подписки', { orderId, userId: updatedData.userId, error: activationErr.message })
      }
    }
    return { updated: true, newStatus: 'completed', plategaResult }
  }
  if (mappedStatus === 'cancelled' || mappedStatus === 'chargebacked') {
    await paymentDocRef.update({
      status: mappedStatus,
      plategaStatus: plategaResult.status,
    })
    return { updated: true, newStatus: mappedStatus, plategaResult }
  }
  return { updated: false, newStatus: mappedStatus, plategaResult }
}

/**
 * Фоновая проверка pending-платежей Platega. Запускается по таймеру; работает даже если пользователь закрыл страницу.
 * Опрашивает только платежи со статусом 'pending'. Когда статус становится confirmed (completed/cancelled/chargebacked),
 * платёж больше не попадает в выборку — фоновая проверка для него прекращается.
 */
async function runBackgroundPendingPaymentsCheck() {
  if (!db) return
  const APP_ID = process.env.APP_ID || 'skyputh'
  const { merchantId, secretKey } = await getPlategaCredentials()
  if (!merchantId || !secretKey) return

  const paymentsRef = db.collection(`artifacts/${APP_ID}/public/data/payments`)
  const cutoffMs = Date.now() - 48 * 60 * 60 * 1000 // 48 часов
  // Только pending — после подтверждения платёж больше не выбирается, проверка для него прекращается
  const q = paymentsRef.where('status', '==', 'pending').limit(50)
  const snapshot = await q.get().catch((err) => {
    console.warn('⚠️ Фоновая проверка платежей: ошибка запроса', err.message)
    return null
  })
  if (!snapshot || snapshot.empty) return

  let checked = 0
  let updated = 0
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data()
    if (data.status !== 'pending') continue // уже подтверждён — пропускаем, проверка для него прекращена
    const createdAtMs = data.createdAt ? new Date(data.createdAt).getTime() : 0
    if (createdAtMs < cutoffMs) continue
    const transactionId = data.transactionId || data.transaction_id
    if (!transactionId || (data.paymentProvider && data.paymentProvider !== 'platega')) continue
    checked++
    const paymentData = { id: docSnap.id, ...data }
    const result = await syncPaymentStatusFromPlatega(docSnap.ref, paymentData, merchantId, secretKey)
    if (result.updated) updated++
  }
  if (checked > 0) {
    console.log('📋 Фоновая проверка платежей: проверено', checked, 'обновлено', updated)
  }
}

/**
 * Локальное создание заказа на оплату.
 * Если настроен Platega (PLATEGA_MERCHANT_ID + PLATEGA_SECRET_KEY или настройки в Firestore) — создаёт платёж в Platega и возвращает paymentUrl.
 * Иначе создаёт только запись в Firestore и возвращает пустой paymentUrl.
 * @param {Object} body - Тело запроса (userId, amount, tariffId, userData, tariffName, devices, periodMonths, discount, promocodeId, originalAmount, email)
 * @returns {Promise<{ success: true, paymentUrl: string, orderId: string, amount: number, status: string, transactionId?: string }>}
 */
async function generatePaymentLinkLocal(body) {
  const {
    userId,
    amount,
    tariffId,
    userData: requestUserData,
    tariffName,
    devices,
    periodMonths,
    discount,
    promocodeId,
    originalAmount,
    operationType,
    newDevicesCount,
  } = body || {}

  if (!userId || !amount || amount <= 0) {
    const err = new Error('Необходимо указать userId и amount (сумма должна быть больше 0)')
    err.statusCode = 400
    throw err
  }

  const orderId = generateOrderId()
  const amountNum = Number(amount)
  const baseUrl = (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').toString().trim().replace(/\/+$/, '') || null

  let paymentUrl = ''
  let transactionId = null

  const { merchantId: effectiveMerchantId, secretKey: effectiveSecretKey } = await getPlategaCredentials()

  if (!effectiveMerchantId || !effectiveSecretKey) {
    console.log('ℹ️ Platega не настроен — создаём только заказ в Firestore. Добавьте ключи в Firestore (artifacts/APP_ID/public/settings) или в админке.')
  }

  if (effectiveMerchantId && effectiveSecretKey) {
    try {
      const result = await generatePaymentLinkFromService(
        {
          userId,
          amount: amountNum,
          tariffId: tariffId || null,
          userData: requestUserData || null,
          baseUrl,
          orderId,
        },
        { merchantId: effectiveMerchantId, secretKey: effectiveSecretKey }
      )
      paymentUrl = result.paymentUrl || ''
      transactionId = result.transactionId || null
      if (paymentUrl) {
        console.log('✅ Platega: платёж создан', { orderId, transactionId: transactionId || '—' })
      }
    } catch (apiError) {
      console.error('❌ Ошибка Platega API:', { orderId, message: apiError.message, response: apiError.response?.data })
      const err = new Error(apiError.message || apiError.response?.data?.message || apiError.response?.data?.error || 'Ошибка создания платежа в платёжной системе')
      err.statusCode = 500
      throw err
    }
  }

  if (!db) await initFirebaseAdmin()
  if (db) {
    const APP_ID = process.env.APP_ID || 'skyputh'
    const paymentsRef = db.collection(`artifacts/${APP_ID}/public/data/payments`)
    const email = requestUserData?.email ?? body?.email ?? null
    const paymentDoc = {
      userId,
      email,
      orderId,
      tariffId: tariffId || null,
      tariffName: tariffName || null,
      amount: amountNum,
      originalAmount: originalAmount != null ? Number(originalAmount) : amountNum,
      discount: discount != null ? Number(discount) : 0,
      status: 'pending',
      devices: devices != null ? Number(devices) : 1,
      periodMonths: periodMonths != null ? Number(periodMonths) : 1,
      promocodeId: promocodeId || null,
      createdAt: new Date().toISOString(),
    }
    if (operationType) paymentDoc.operationType = operationType
    if (newDevicesCount != null) paymentDoc.newDevicesCount = Number(newDevicesCount)
    if (transactionId) paymentDoc.transactionId = transactionId
    if (paymentUrl) paymentDoc.paymentProvider = 'platega'
    await paymentsRef.add(paymentDoc)
    console.log('✅ Запись платежа создана в Firestore', { orderId, userId })
  }

  return {
    success: true,
    paymentUrl,
    orderId,
    amount: amountNum,
    status: 'pending',
    ...(transactionId && { transactionId }),
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
 * Обработка webhook об оплате
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
 * 1. Получает webhook от платёжного провайдера
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

    console.log('📥 n8n-webhook-proxy: Получен webhook об оплате', {
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
        // Провайдер ожидает 200 OK для успешной обработки
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
      hasPaymentSettings: !!paymentSettings && Object.keys(paymentSettings).length > 0
    })

    // Проверка подписи YooMoney (SHA1) — если это webhook от YooMoney
    if (req.body?.notification_type && paymentSettings?.yoomoneySecretKey) {
      const { valid } = verifyYooMoneyWebhookSignature(req.body, paymentSettings.yoomoneySecretKey)
      if (!valid) {
        console.warn('⚠️ n8n-webhook-proxy: Неверная подпись webhook YooMoney', { label: req.body?.label })
        return res.status(401).json({ success: false, error: 'Invalid YooMoney webhook signature' })
      }
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
      // Оригинальные данные от платёжного провайдера
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
          // Логируем ошибку, но не прерываем ответ провайдеру
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
    
    // Провайдер ожидает ответ 200 OK для успешной обработки
    res.status(200).json(result)
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка при обработке webhook об оплате:', {
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
    
    // Провайдер может повторять запросы при ошибках, поэтому возвращаем 200
    // но с информацией об ошибке
    res.status(200).json({
      success: false,
      error: error.message || 'Ошибка обработки webhook об оплате',
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
        console.log('⚠️ GET /api/payment/status: платёж не найден', { orderId })
        return res.status(404).json({
          success: false,
          error: 'Платеж не найден',
          orderId
        })
      }

      const paymentDocRef = paymentSnapshot.docs[0].ref
      const paymentDoc = paymentSnapshot.docs[0]
      let paymentData = {
        id: paymentDoc.id,
        ...paymentDoc.data(),
      }

      let statusToReturn = paymentData.status
      let plategaTransaction = null

      // Для платежей Platega запрашиваем статус в API и при необходимости синхронизируем Firestore и активируем подписку
      const transactionId = paymentData.transactionId || paymentData.transaction_id
      if (transactionId && (paymentData.paymentProvider === 'platega' || !paymentData.paymentProvider)) {
        const { merchantId, secretKey } = await getPlategaCredentials()
        if (merchantId && secretKey) {
          console.log('📤 Отправка проверки статуса платежа в Platega', { orderId, transactionId })
          const syncResult = await syncPaymentStatusFromPlatega(paymentDocRef, paymentData, merchantId, secretKey)
          if (syncResult.plategaResult) {
            plategaTransaction = {
              id: syncResult.plategaResult.id,
              status: syncResult.plategaResult.status,
              paymentDetails: syncResult.plategaResult.paymentDetails,
            }
            statusToReturn = syncResult.newStatus || statusToReturn
            if (syncResult.updated) {
              paymentData = {
                ...paymentData,
                status: statusToReturn,
                ...(statusToReturn === 'completed' && { completedAt: new Date().toISOString() }),
              }
            }
          }
        }
      } else if ((paymentData.paymentProvider === 'platega' || !paymentData.paymentProvider) && !transactionId) {
        console.log('📤 GET /api/payment/status: у платежа нет transactionId, проверка в Platega не отправляется', { orderId })
      }

      console.log('📊 Статус платежа проверен', {
        orderId,
        status: statusToReturn,
        userId: paymentData.userId,
        fromPlatega: !!plategaTransaction,
      })

      res.json({
        success: true,
        orderId,
        status: statusToReturn,
        ...(plategaTransaction && { plategaTransaction }),
        payment: {
          id: paymentData.id,
          orderId: paymentData.orderId,
          userId: paymentData.userId,
          amount: paymentData.amount,
          tariffId: paymentData.tariffId,
          tariffName: paymentData.tariffName,
          devices: paymentData.devices,
          periodMonths: paymentData.periodMonths,
          status: statusToReturn,
          createdAt: paymentData.createdAt,
          completedAt: paymentData.completedAt,
          operationId: paymentData.operationId,
          ...(transactionId && { transactionId }),
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

/** Базовый URL приложения для ссылки «Оплатить» в напоминаниях */
function getPaymentPageUrl() {
  const base = (process.env.PUBLIC_URL || process.env.FRONTEND_URL || '').toString().trim().replace(/\/+$/, '')
  return base ? `${base}/dashboard` : ''
}

/**
 * Напоминания о конце подписки (за 2 дня, за 1 день, в день истечения) и отключение при неоплате.
 * Отправка в Telegram с инлайн-кнопкой на страницу оплаты.
 */
async function runSubscriptionRemindersAndExpiry() {
  if (!db) return
  const APP_ID = process.env.APP_ID || 'skyputh'
  const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users_v4`)
  const subscriptionsRef = db.collection(`artifacts/${APP_ID}/public/data/subscriptions`)
  const remindersRef = db.collection(`artifacts/${APP_ID}/public/data/subscription_reminders`)
  const botToken = await getTelegramToken()
  const paymentPageUrl = getPaymentPageUrl()
  const now = Date.now()
  const oneDayMs = 24 * 60 * 60 * 1000
  const in2DaysEnd = now + 2 * oneDayMs

  const replyMarkupPayment = paymentPageUrl
    ? { inline_keyboard: [[{ text: 'Оплатить / Продлить', url: paymentPageUrl }]] }
    : null

  try {
    const usersSnap = await usersRef.get()
    let remindersSent = 0
    let expiredProcessed = 0

    for (const docSnap of usersSnap.docs) {
      const user = { id: docSnap.id, ...docSnap.data() }
      const expiresAt = user.expiresAt != null ? (typeof user.expiresAt === 'number' ? user.expiresAt : new Date(user.expiresAt).getTime()) : null
      if (expiresAt == null || !user.tgId) continue

      if (expiresAt > now) {
        if (expiresAt > in2DaysEnd) continue
        const sub = await getActiveSubscription(user.id)
        if (!sub || sub.status !== 'active') continue
        const reminderDocRef = remindersRef.doc(user.id)
        const reminderSnap = await reminderDocRef.get()
        const reminderData = reminderSnap.exists ? reminderSnap.data() : {}
        const lastExp = reminderData.lastExpiresAt != null ? (typeof reminderData.lastExpiresAt === 'number' ? reminderData.lastExpiresAt : new Date(reminderData.lastExpiresAt).getTime()) : null
        if (lastExp !== null && lastExp !== expiresAt) {
          await reminderDocRef.set({
            lastExpiresAt: expiresAt,
            reminder2dSentAt: null,
            reminder1dSentAt: null,
            reminder0dSentAt: null,
          }, { merge: true })
          Object.assign(reminderData, { reminder2dSentAt: null, reminder1dSentAt: null, reminder0dSentAt: null })
        }
        const daysLeft = Math.floor((expiresAt - now) / oneDayMs)
        const expDateStr = new Date(expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
        let text = ''
        let key = null
        if (daysLeft === 2 && !reminderData.reminder2dSentAt) {
          text = `⏰ Подписка заканчивается через 2 дня (${expDateStr}). Продлите вовремя, чтобы не потерять доступ.`
          key = 'reminder2dSentAt'
        } else if (daysLeft === 1 && !reminderData.reminder1dSentAt) {
          text = `⏰ Подписка заканчивается завтра (${expDateStr}). Продлите подписку для непрерывного доступа.`
          key = 'reminder1dSentAt'
        } else if (daysLeft === 0 && !reminderData.reminder0dSentAt) {
          text = `⏰ Подписка заканчивается сегодня (${expDateStr}). Продлите подписку, чтобы продолжить пользоваться VPN.`
          key = 'reminder0dSentAt'
        }
        if (text && key && botToken) {
          const opts = replyMarkupPayment ? { reply_markup: replyMarkupPayment } : {}
          const sendRes = await sendTelegramMessage(botToken, String(user.tgId).trim(), text, opts)
          if (sendRes && sendRes.ok) {
            await reminderDocRef.set({ [key]: new Date().toISOString(), lastExpiresAt: expiresAt }, { merge: true })
            remindersSent++
          }
        }
        continue
      }

      if (expiresAt >= now - 7 * oneDayMs) {
        const sub = await getActiveSubscription(user.id)
        if (!sub || sub.status !== 'active') continue
        try {
          await subscriptionsRef.doc(sub.id).update({
            status: 'expired',
            updatedAt: new Date().toISOString(),
          })
        } catch (e) {
          console.warn('⚠️ Напоминания: не удалось обновить статус подписки', { userId: user.id, error: e.message })
        }
        const userRef = usersRef.doc(user.id)
        await userRef.update({
          paymentStatus: 'unpaid',
          unpaidStartDate: user.unpaidStartDate || new Date(expiresAt).toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch((e) => console.warn('⚠️ Напоминания: не удалось обновить user', { userId: user.id, error: e.message }))
        const uuid = user.uuid || ''
        const email = (user.email || user.name || '').toString().trim().replace(/\s+/g, '_')
        try {
          const { xui, inboundId } = await getXuiAndInboundForRequest({ tariffId: user.tariffId })
          if (xui && xui.configured && (uuid || email)) {
            if (uuid) await xui.delClient(inboundId, uuid)
            else if (email) await xui.delClientByEmail(inboundId, email)
            console.log('✅ Напоминания: клиент удалён из 3x-ui после истечения подписки', { userId: user.id })
          }
        } catch (e) {
          console.warn('⚠️ Напоминания: не удалось удалить клиента 3x-ui', { userId: user.id, error: e.message })
        }
        if (botToken && user.tgId) {
          const msg = `Подписка истекла. Доступ отключён. Продлите подписку, чтобы снова пользоваться VPN.`
          await sendTelegramMessage(botToken, String(user.tgId).trim(), msg, replyMarkupPayment ? { reply_markup: replyMarkupPayment } : {}).catch((err) => console.warn('Напоминания: отправка в Telegram:', err?.message))
        }
        expiredProcessed++
      }
    }

    if (remindersSent > 0 || expiredProcessed > 0) {
      console.log('📋 Напоминания подписок: отправлено', remindersSent, 'отключено за неоплату', expiredProcessed)
    }
  } catch (err) {
    console.warn('⚠️ Напоминания подписок:', err.message)
  }
}

/**
 * Отправка создания/обновления клиента 3x-ui через webhook n8n (как раньше).
 * n8n workflow создаёт или обновляет клиента в 3x-ui по переданным данным.
 * @param {Object} params - те же параметры, что и для activateClientIn3XUI
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function activateClientViaWebhook({
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
  const email = paymentData.email || userData.email || null
  const trafficGB = tariffData.trafficGB > 0 ? tariffData.trafficGB : 0
  const { inboundId } = await getXuiAndInboundForRequest({
    tariffId,
    serverId: tariffData.serverId,
    inboundId: tariffData.inboundId,
  })

  const webhookUrl = N8N_WEBHOOKS.addClient
  if (!webhookUrl || !webhookUrl.trim()) {
    console.warn('⚠️ n8n-webhook-proxy: Webhook addClient не настроен (N8N_WEBHOOK_ADD_CLIENT)')
    return { success: false, error: 'Webhook addClient не настроен' }
  }

  const payload = {
    mode: 'activateClient',
    operation: 'addClient',
    clientId,
    userId,
    tariffId,
    inboundId: inboundId != null ? String(inboundId) : undefined,
    email: email || `user_${userId}@local`,
    totalGB: trafficGB,
    expiryTime: expiresAt,
    limitIp: devices,
    needsClientCreation: !!needsClientCreation,
    orderId: paymentData.orderId || null,
    tgId: (userData?.tgId ?? '').toString(),
    subId: (userData?.subId ?? '').toString(),
    periodMonths: periodMonths || 1,
  }

  try {
    await callN8NWebhook(webhookUrl, payload)
    console.log('✅ n8n-webhook-proxy: Запрос на создание/обновление клиента отправлен в n8n', {
      userId,
      uuid: clientId,
      isNew: needsClientCreation,
    })
    return { success: true }
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка вызова webhook для активации клиента', {
      userId,
      uuid: clientId,
      error: error.message,
    })
    return { success: false, error: error.message || 'Ошибка вызова webhook' }
  }
}

/**
 * Активация клиента в 3x-ui через n8n с retry механизмом (прямой вызов xui — запасной вариант).
 * Сейчас по умолчанию используется activateClientViaWebhook (отправка в n8n).
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
  const email = paymentData.email || userData.email || null
  const trafficBytes = tariffData.trafficGB > 0 ? tariffData.trafficGB * 1024 * 1024 * 1024 : 0

  const { xui, inboundId } = await getXuiAndInboundForRequest({
    tariffId,
    serverId: tariffData.serverId,
    inboundId: tariffData.inboundId,
  })
  if (!xui || !xui.configured) {
    console.warn('⚠️ n8n-webhook-proxy: 3x-ui не настроен или сервер для тарифа не найден (tariffId:', tariffId, ')')
    return { success: false, error: '3x-ui не настроен или сервер для тарифа не найден' }
  }

  try {
    await retryWithBackoff(async () => {
      if (needsClientCreation) {
        await xui.addClient(inboundId, {
          email: email || `user_${userId}@local`,
          uuid: clientId,
          totalGB: trafficBytes,
          expiryTime: expiresAt,
          limitIp: devices,
          tgId: (userData?.tgId ?? '').toString(),
          subId: (userData?.subId ?? '').toString(),
        })
      } else {
        await xui.updateClient(inboundId, clientId, {
          totalGB: trafficBytes,
          expiryTime: expiresAt,
          limitIp: devices,
        })
      }
    }, 3, 2000)
    console.log('✅ n8n-webhook-proxy: Клиент успешно активирован в 3x-ui', {
      userId,
      uuid: clientId,
      isNew: needsClientCreation,
    })
    return { success: true }
  } catch (error) {
    console.error('❌ n8n-webhook-proxy: Ошибка активации клиента в 3x-ui', {
      userId,
      uuid: clientId,
      error: error.message,
    })
    return { success: false, error: error.message || 'Неизвестная ошибка активации клиента' }
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
      nextPaymentDiscountAmount: null, // Скидка за смену тарифа применяется один раз — сбрасываем после успешной оплаты
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
    
    // Отправляем создание/обновление клиента в 3x-ui через webhook n8n (как раньше)
    const activationResult = await activateClientViaWebhook({
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
    
    // Не пробрасываем ошибку, чтобы не прервать ответ провайдеру
    // Ошибка уже залогирована
  }
}

/**
 * System Monitoring Routes — реальные метрики сервера
 */
app.get('/api/system/status', async (req, res) => {
  try {
    const cpuLoad = os.loadavg()[0]
    const cpuCores = os.cpus().length
    const cpuUsagePercent = Math.min(100, Math.round((cpuLoad / Math.max(cpuCores, 1)) * 100))
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()
    const usedMemory = totalMemory - freeMemory
    const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100 * 10) / 10
    const uptimeSeconds = process.uptime()
    const uptimeFormatted = `${Math.floor(uptimeSeconds / 3600)}ч ${Math.floor((uptimeSeconds % 3600) / 60)}м`

    const processMem = process.memoryUsage()
    const metrics = getMetrics({ isWebhookPath })

    // Проверка доступности 3x-ui (XUI_HOST)
    let xuiStatus = { connected: false, responseTime: null, error: null, configured: false }
    const xuiHost = process.env.XUI_HOST
    if (xuiHost) {
      xuiStatus.configured = true
      const xuiStart = Date.now()
      try {
        const xuiUrl = `${xuiHost.replace(/\/+$/, '')}/login`
        const xuiRes = await axios.get(xuiUrl, { timeout: 3000, validateStatus: () => true })
        xuiStatus = {
          ...xuiStatus,
          connected: xuiRes.status < 500,
          responseTime: Date.now() - xuiStart,
          error: xuiRes.status >= 400 ? `HTTP ${xuiRes.status}` : null,
        }
      } catch (xuiErr) {
        xuiStatus = { ...xuiStatus, connected: false, responseTime: null, error: xuiErr.message || 'Недоступен' }
      }
    }

    // Проверка Firebase/Firestore
    let firebaseStatus = { connected: false, error: null }
    if (db) {
      const fbStart = Date.now()
      try {
        const settingsRef = db.doc(`artifacts/${APP_ID}/public/settings`)
        await settingsRef.get()
        firebaseStatus = { connected: true, responseTimeMs: Date.now() - fbStart, error: null }
      } catch (fbErr) {
        firebaseStatus = { connected: false, error: fbErr.message || 'Ошибка доступа' }
      }
    } else {
      firebaseStatus = { connected: false, error: 'Firebase не инициализирован' }
    }

    // Проверка n8n: /healthz или корень (если healthz отключён)
    let n8nStatus = { available: false, responseTimeMs: null, error: null, baseUrl: '' }
    const n8nBase = (process.env.N8N_BASE_URL || 'https://n8n.skypath.fun').replace(/\/+$/, '')
    const tryN8n = async (path) => {
      const start = Date.now()
      const res = await axios.get(`${n8nBase}${path}`, { timeout: 3000, validateStatus: () => true })
      return { status: res.status, responseTimeMs: Date.now() - start }
    }
    try {
      const r = await tryN8n('/healthz')
      if (r.status === 404) {
        const r2 = await tryN8n('/')
        n8nStatus = {
          available: r2.status < 500,
          responseTimeMs: r2.responseTimeMs,
          error: r2.status >= 400 ? `HTTP ${r2.status}` : null,
          baseUrl: n8nBase,
        }
      } else {
        n8nStatus = {
          available: r.status < 500,
          responseTimeMs: r.responseTimeMs,
          error: r.status >= 400 ? `HTTP ${r.status}` : null,
          baseUrl: n8nBase,
        }
      }
    } catch (n8nErr) {
      n8nStatus = { available: false, responseTimeMs: null, error: n8nErr.code || n8nErr.message || 'Недоступен', baseUrl: n8nBase }
    }

    const data = {
      connected: true,
      timestamp: new Date().toISOString(),
      platform: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
      },
      cpu: {
        usage: cpuUsagePercent,
        load: Math.round(cpuLoad * 100) / 100,
        cores: cpuCores,
        loadAvg: os.loadavg().map((l) => Math.round(l * 100) / 100),
      },
      ram: {
        usage: memoryUsagePercent,
        usedGB: Math.round((usedMemory / 1024 / 1024 / 1024) * 100) / 100,
        totalGB: Math.round((totalMemory / 1024 / 1024 / 1024) * 100) / 100,
        freeGB: Math.round((freeMemory / 1024 / 1024 / 1024) * 100) / 100,
      },
      processMemory: {
        heapUsedMB: Math.round(processMem.heapUsed / 1024 / 1024 * 10) / 10,
        heapTotalMB: Math.round(processMem.heapTotal / 1024 / 1024 * 10) / 10,
        rssMB: Math.round(processMem.rss / 1024 / 1024 * 10) / 10,
      },
      uptime: { seconds: Math.floor(uptimeSeconds), formatted: uptimeFormatted },
      firebase: firebaseStatus,
      xui: xuiStatus,
      n8n: n8nStatus,
      api: {
        requests: metrics.requests,
        avgResponseTimeMs: metrics.avgResponseTimeMs,
        activeRequestsCount: metrics.activeRequestsCount,
        status4xx: metrics.status4xx,
        status5xx: metrics.status5xx,
        timeoutsCount: metrics.timeoutsCount,
        metricsWebhook: metrics.metricsWebhook,
      },
    }

    res.json({ success: true, data })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/system/logs', (req, res) => {
  res.json({ logs: [], message: 'Логи доступны в n8n workflows' })
})

app.post('/api/system/restart/:moduleId', async (req, res) => {
  try {
    const moduleId = String(req.params.moduleId || '').trim().toLowerCase()
    if (!moduleId) {
      return res.status(400).json({ success: false, message: 'moduleId обязателен' })
    }

    // Безопасный "soft restart": не перезапускаем процесс Node, а сбрасываем внутренние сессии/кэши.
    if (moduleId === 'vpn' || moduleId === 'proxy' || moduleId === 'api') {
      try {
        const xui = getXuiClient()
        if (xui && typeof xui.clearSession === 'function') {
          xui.clearSession()
        }
      } catch (_) {
        // no-op
      }
    }

    return res.json({
      success: true,
      moduleId,
      message: `Модуль ${moduleId} перезапущен (soft restart)`,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Не удалось перезапустить модуль',
    })
  }
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

// ========== Favicon (избегаем 502 при запросе /favicon.ico) — дублируем для fallback, основной раздача выше (до CORS) ==========
const faviconSvg = path.join(distPath, 'favicon.svg')
if (fs.existsSync(faviconSvg)) {
  app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml')
    res.sendFile(faviconSvg, (err) => { if (err) res.status(404).end() })
  })
}

// ========== Редирект бывших путей Mini App (/t отключён) ==========
app.get(['/t', '/t/', '/telegram', '/telegram/'], (req, res) => {
  const base = (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host'])
    ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
    : (req.headers.host ? `${req.protocol}://${req.get('host')}` : 'http://localhost:3001')
  res.redirect(302, base.replace(/\/+$/, '') + '/' + (req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''))
})

// ========== SPA / Frontend ==========
// Если есть собранный frontend (dist), отдаём его; GET-запросы не к /api отдают index.html
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0' }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'), (err) => { if (err) next(err) })
  })
  console.log('📁 SPA fallback: frontend из dist')
}

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

async function startServer() {
  await initFirebaseAdmin()
  if (db) {
    initStorage(db, APP_ID)
  }
  if (!db) {
    console.warn('⚠️ Telegram Mini App и админ-API будут возвращать 503 до настройки Firebase (положите server/firebase-service-account.json или задайте FIREBASE_SERVICE_ACCOUNT_PATH).')
  }
  app.listen(PORT, HOST, () => {
    console.log('🚀 n8n Webhook Proxy Server')
    console.log(`📡 http://${HOST}:${PORT}`)
    console.log(`🔗 n8n: ${N8N_BASE_URL}`)
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)

    // Загрузка кэша сценариев bot-builder при старте (если Firebase уже инициализирован)
    setTimeout(() => {
      if (db) {
      loadScenariosIntoCache(db, APP_ID)
        .then(() => console.log('Bot-builder: кэш сценариев загружен'))
        .catch((e) => console.warn('Bot-builder: загрузка кэша', e.message))
    }
  }, 2000)

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
  
  // Фоновая проверка статуса pending-платежей Platega (работает даже если пользователь закрыл страницу)
  const PAYMENT_CHECK_INTERVAL_MS = Math.max(30 * 1000, Number(process.env.PAYMENT_BACKGROUND_CHECK_INTERVAL_MS) || 45 * 1000)
  setInterval(() => {
    runBackgroundPendingPaymentsCheck().catch((err) => {
      console.warn('⚠️ Фоновая проверка платежей:', err.message)
    })
  }, PAYMENT_CHECK_INTERVAL_MS)
  setTimeout(() => {
    runBackgroundPendingPaymentsCheck().catch((err) => console.warn('Фоновая проверка платежей (старт):', err?.message))
  }, 15 * 1000)
  console.log(`📋 Фоновая проверка pending-платежей: каждые ${PAYMENT_CHECK_INTERVAL_MS / 1000} с`)

  // Напоминания о конце подписки (за 2 дня, 1 день, в день истечения) и отключение при неоплате + удаление из 3x-ui
  const SUBSCRIPTION_REMINDERS_INTERVAL_MS = Number(process.env.SUBSCRIPTION_REMINDERS_INTERVAL_MS) || 6 * 60 * 60 * 1000
  setInterval(() => {
    runSubscriptionRemindersAndExpiry().catch((err) => console.warn('⚠️ Напоминания подписок:', err.message))
  }, SUBSCRIPTION_REMINDERS_INTERVAL_MS)
  setTimeout(() => {
    runSubscriptionRemindersAndExpiry().catch((err) => console.warn('Напоминания подписок (старт):', err?.message))
  }, 60 * 1000)
  console.log(`📋 Напоминания подписок: каждые ${SUBSCRIPTION_REMINDERS_INTERVAL_MS / (60 * 60 * 1000)} ч`)

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
}

startServer().catch((err) => {
  console.error('❌ Ошибка запуска:', err)
  process.exit(1)
})