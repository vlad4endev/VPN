/**
 * Роуты /api/telegram: авторизация (auth, auth-widget), webhook бота, привязка, напоминания.
 * Подключается в основном сервере: app.use("/api/telegram", createTelegramRouter(deps))
 */

import express from 'express'
import { handleWebhook } from '../controllers/telegram.controller.js'

/**
 * @param {Object} deps — зависимости из основного сервера
 * @param {() => *} deps.getDb
 * @param {() => *} deps.getAdmin
 * @param {() => Promise<void>} deps.initFirebaseAdmin
 * @param {() => Promise<string>} deps.getTelegramToken
 * @param {typeof import('../lib/telegram.js').getTelegramBotInfo} deps.getTelegramBotInfo
 * @param {typeof import('../lib/telegram.js').sendTelegramMessage} deps.sendTelegramMessage
 * @param {typeof import('../lib/telegram.js').answerCallbackQuery} deps.answerCallbackQuery
 * @param {(initData: string) => Promise<{ok: boolean, data?: object, reason?: string, message?: string}>} deps.validateTelegramInitDataWithReasonAsync
 * @param {(widgetUser: object, botToken: string) => Promise<{ok: boolean, tgId?: string, user?: object, reason?: string, message?: string}>} deps.validateTelegramWidgetData
 * @param {(event: string, data?: object) => void} deps.logTelegramAuth
 * @param {(req: object, res: object) => Promise<{ok: boolean, uid?: string}>} deps.verifyIdToken
 * @param {(req: object, res: object, next: function) => void} deps.verifyTelegramWebhookSecret
 * @param {string} deps.APP_ID
 * @param {string} deps.TELEGRAM_WEBHOOK_SECRET
 * @param {number} deps.TELEGRAM_SESSION_TTL_MS
 * @param {() => string|null} deps.getBaseUrlForTelegram
 * @param {(botToken: string, chatId: string|number) => Promise<void>} deps.sendMainMenu
 * @param {(botToken: string, callbackQuery: object) => Promise<void>} deps.handleCallbackQuery
 * @param {(botToken: string, message: object) => Promise<void>} deps.handleMiniAppData
 * @param {(operation: string, req: object) => string} deps.getWebhookUrl
 * @param {(url: string, data: object, method?: string) => Promise<*>} deps.callN8NWebhook
 * @param {() => string} deps.randomUUID
 * @param {typeof import('crypto')} deps.crypto
 * @param {() => Promise<Object|null>} [deps.getScenario] — сценарий бота для кастомных текстов/кнопок
 * @param {(db: *, appId: string, triggerType: string, triggerValue: string) => Promise<Object|null>} [deps.findScenarioFromBotBuilder]
 * @param {(widgetUser: object) => Promise<{ok: boolean, tgId?: string, user?: object, reason?: string, message?: string}>} [deps.validateTelegramWidgetDataOrRemote]
 * @param {string} [deps.TELEGRAM_VERIFY_SECRET] — секрет для защиты POST /verify (сервер A с токеном бота)
 */
export function createTelegramRouter(deps) {
  const router = express.Router()
  const {
    getDb,
    getAdmin,
    initFirebaseAdmin,
    getTelegramToken,
    getTelegramBotInfo,
    sendTelegramMessage,
    answerCallbackQuery,
    editMessageText,
    buildMainKeyboard,
    getScenario,
    findScenarioFromBotBuilder,
    logTelegramUpdate,
    validateTelegramInitDataWithReasonAsync,
    validateTelegramWidgetData,
    validateTelegramWidgetDataOrRemote,
    logTelegramAuth,
    verifyIdToken,
    verifyTelegramWebhookSecret,
    APP_ID,
    TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_VERIFY_SECRET = '',
    TELEGRAM_SESSION_TTL_MS,
    getBaseUrlForTelegram,
    sendMainMenu,
    handleMiniAppData,
    getWebhookUrl,
    callN8NWebhook,
    randomUUID,
    crypto,
  } = deps

  // ——— POST /verify (для удалённой проверки: B запрашивает у A) ———
  router.post('/verify', express.json(), async (req, res) => {
    const secret = (req.headers['x-telegram-verify-secret'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')).trim()
    if (!TELEGRAM_VERIFY_SECRET || secret !== TELEGRAM_VERIFY_SECRET) {
      return res.status(401).json({ ok: false, reason: 'unauthorized', message: 'Invalid or missing verify secret' })
    }
    const { type, initData, widgetUser } = req.body || {}
    if (type === 'initData') {
      const result = await validateTelegramInitDataWithReasonAsync(initData)
      if (!result.ok) {
        return res.json({ ok: false, reason: result.reason || 'unknown', message: result.message || 'Validation failed' })
      }
      const tgId = result.data?.user?.id
      return res.json({ ok: true, tgId, user: result.data?.user })
    }
    if (type === 'widget') {
      const token = await getTelegramToken()
      const result = await validateTelegramWidgetData(widgetUser, token)
      if (!result.ok) {
        return res.json({ ok: false, reason: result.reason || 'unknown', message: result.message || 'Validation failed' })
      }
      return res.json({ ok: true, tgId: result.tgId, user: result.user })
    }
    return res.status(400).json({ ok: false, reason: 'invalid_type', message: 'Body must have type "initData" or "widget" and corresponding data' })
  })

  // ——— POST /auth (Mini App: session token или initData) ———
  router.post('/auth', express.json(), async (req, res) => {
    const hasSessionToken = !!(req.headers['x-telegram-session-token'] || (req.body && req.body.sessionToken))
    const hasInitData = !!(req.headers['x-telegram-initdata'] || (req.body && req.body.initData))
    logTelegramAuth('request', { hasSessionToken, hasInitData })

    let db = getDb()
    let admin = getAdmin()
    if (!admin || !db) {
      try { await initFirebaseAdmin() } catch (_) {}
      db = getDb()
      admin = getAdmin()
      if (!admin || !db) {
        logTelegramAuth('error', { step: 'init', message: 'Сервис недоступен (нет Firebase)' })
        return res.status(503).json({ success: false, error: 'Сервис недоступен' })
      }
    }
    const appId = process.env.APP_ID || 'skyputh'
    const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)

    const sessionToken = (req.headers['x-telegram-session-token'] || (req.body && req.body.sessionToken) || '').toString().trim()
    if (sessionToken) {
      try {
        const bySession = await usersRef.where('telegramSessionToken', '==', sessionToken).limit(1).get()
        if (!bySession.empty) {
          const doc = bySession.docs[0]
          const data = doc.data()
          const expiresAt = data.telegramSessionTokenExpiresAt
          const expiresMs = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : (typeof expiresAt === 'number' ? expiresAt : 0)
          if (expiresMs > Date.now()) {
            const uid = doc.id
            const customToken = await admin.auth().createCustomToken(uid)
            logTelegramAuth('session_ok', { uid })
            return res.json({ success: true, customToken })
          }
          logTelegramAuth('session_fail', { reason: 'expired', uid: doc.id })
        } else {
          logTelegramAuth('session_fail', { reason: 'token_not_found' })
        }
      } catch (err) {
        logTelegramAuth('error', { step: 'session', message: err.message })
      }
    }

    const rawInitData = req.headers['x-telegram-initdata'] || (req.body && req.body.initData) || ''
    const initData = typeof rawInitData === 'string' ? rawInitData : (req.body && typeof req.body.initData === 'string' ? req.body.initData : '')
    const result = await validateTelegramInitDataWithReasonAsync(initData)
    if (!result.ok) {
      logTelegramAuth('initData_fail', { reason: result.reason || 'unknown', message: result.message })
      const message = result.message || 'Данные Telegram не прошли проверку. Откройте приложение заново из меню бота; убедитесь, что токен бота на сервере соответствует этому боту и сессия не старше 24 ч.'
      return res.status(400).json({ success: false, error: message, reason: result.reason || 'unknown' })
    }
    const validated = result.data
    const tgId = String(validated.user.id)
    const nowIso = new Date().toISOString()
    const sessionTokenNew = crypto.randomBytes(32).toString('hex')
    const sessionExpiresAt = new Date(Date.now() + TELEGRAM_SESSION_TTL_MS).toISOString()

    try {
      const byTgId = await usersRef.where('tgId', '==', tgId).limit(1).get()
      let uid
      let userRef
      if (!byTgId.empty) {
        const doc = byTgId.docs[0]
        uid = doc.id
        userRef = doc.ref
        await userRef.update({
          telegramSessionToken: sessionTokenNew,
          telegramSessionTokenExpiresAt: sessionExpiresAt,
          updatedAt: nowIso,
        })
        const customToken = await admin.auth().createCustomToken(uid)
        logTelegramAuth('initData_ok', { uid, tgId, created: false })
        return res.json({ success: true, customToken, sessionToken: sessionTokenNew, sessionTokenExpiresAt: sessionExpiresAt })
      }
      uid = `tg_${tgId}`
      userRef = db.doc(`artifacts/${appId}/public/data/users_v4/${uid}`)
      const existing = await userRef.get()
      if (existing.exists) {
        await userRef.update({
          telegramSessionToken: sessionTokenNew,
          telegramSessionTokenExpiresAt: sessionExpiresAt,
          updatedAt: nowIso,
        })
        const customToken = await admin.auth().createCustomToken(uid)
        logTelegramAuth('initData_ok', { uid, tgId, created: false })
        return res.json({ success: true, customToken, sessionToken: sessionTokenNew, sessionTokenExpiresAt: sessionExpiresAt })
      }
      const firstName = validated.user.first_name || ''
      const lastName = validated.user.last_name || ''
      const name = [firstName, lastName].filter(Boolean).join(' ') || validated.user.username || `Telegram ${tgId}`
      const subIdChars = '0123456789abcdefghijklmnopqrstuvwxyz'
      let subId = ''
      for (let i = 0; i < 16; i++) subId += subIdChars[Math.floor(Math.random() * subIdChars.length)]
      await userRef.set({
        email: `tg_${tgId}@telegram.placeholder`,
        login: `tg_${tgId}`,
        name,
        phone: '',
        role: 'user',
        plan: 'free',
        uuid: randomUUID(),
        subId,
        tgId,
        telegramSessionToken: sessionTokenNew,
        telegramSessionTokenExpiresAt: sessionExpiresAt,
        expiresAt: null,
        tariffName: '',
        tariffId: '',
        photoURL: validated.user.photo_url || null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      const customToken = await admin.auth().createCustomToken(uid)
      logTelegramAuth('initData_ok', { uid, tgId, created: true, name })
      return res.json({ success: true, customToken, sessionToken: sessionTokenNew, sessionTokenExpiresAt: sessionExpiresAt })
    } catch (err) {
      logTelegramAuth('error', { step: 'create_or_update', message: err.message })
      return res.status(500).json({ success: false, error: err.message || 'Ошибка авторизации' })
    }
  })

  // ——— POST /auth-widget (Login Widget для браузера) ———
  router.post('/auth-widget', express.json(), async (req, res) => {
    const widgetUser = req.body
    logTelegramAuth('widget_request', { hasId: !!widgetUser?.id, hasHash: !!widgetUser?.hash })
    let db = getDb()
    let admin = getAdmin()
    if (!admin || !db) {
      try { await initFirebaseAdmin() } catch (_) {}
      db = getDb()
      admin = getAdmin()
      if (!admin || !db) {
        logTelegramAuth('error', { step: 'widget_init', message: 'Сервис недоступен' })
        return res.status(503).json({ success: false, error: 'Сервис недоступен' })
      }
    }
    const result = validateTelegramWidgetDataOrRemote
      ? await validateTelegramWidgetDataOrRemote(widgetUser)
      : await validateTelegramWidgetData(widgetUser, await getTelegramToken())
    if (!result.ok) {
      logTelegramAuth('initData_fail', { reason: result.reason, source: 'widget' })
      return res.status(400).json({ success: false, error: result.message, reason: result.reason })
    }
    const tgId = result.tgId
    const appId = process.env.APP_ID || 'skyputh'
    const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
    const nowIso = new Date().toISOString()
    const sessionTokenNew = crypto.randomBytes(32).toString('hex')
    const sessionExpiresAt = new Date(Date.now() + TELEGRAM_SESSION_TTL_MS).toISOString()
    const w = result.user || {}
    const firstName = w.first_name || ''
    const lastName = w.last_name || ''
    const name = [firstName, lastName].filter(Boolean).join(' ') || w.username || `Telegram ${tgId}`

    try {
      const byTgId = await usersRef.where('tgId', '==', tgId).limit(1).get()
      let uid
      let userRef
      if (!byTgId.empty) {
        const doc = byTgId.docs[0]
        uid = doc.id
        userRef = doc.ref
        await userRef.update({
          telegramSessionToken: sessionTokenNew,
          telegramSessionTokenExpiresAt: sessionExpiresAt,
          updatedAt: nowIso,
        })
        const customToken = await admin.auth().createCustomToken(uid)
        logTelegramAuth('initData_ok', { uid, tgId, created: false, source: 'widget' })
        return res.json({ success: true, customToken, sessionToken: sessionTokenNew, sessionTokenExpiresAt: sessionExpiresAt })
      }
      uid = `tg_${tgId}`
      userRef = db.doc(`artifacts/${appId}/public/data/users_v4/${uid}`)
      const existing = await userRef.get()
      if (existing.exists) {
        await userRef.update({
          telegramSessionToken: sessionTokenNew,
          telegramSessionTokenExpiresAt: sessionExpiresAt,
          updatedAt: nowIso,
        })
        const customToken = await admin.auth().createCustomToken(uid)
        logTelegramAuth('initData_ok', { uid, tgId, created: false, source: 'widget' })
        return res.json({ success: true, customToken, sessionToken: sessionTokenNew, sessionTokenExpiresAt: sessionExpiresAt })
      }
      const subIdChars = '0123456789abcdefghijklmnopqrstuvwxyz'
      let subId = ''
      for (let i = 0; i < 16; i++) subId += subIdChars[Math.floor(Math.random() * subIdChars.length)]
      await userRef.set({
        email: `tg_${tgId}@telegram.placeholder`,
        login: `tg_${tgId}`,
        name,
        phone: '',
        role: 'user',
        plan: 'free',
        uuid: randomUUID(),
        subId,
        tgId,
        telegramSessionToken: sessionTokenNew,
        telegramSessionTokenExpiresAt: sessionExpiresAt,
        expiresAt: null,
        tariffName: '',
        tariffId: '',
        photoURL: w.photo_url || null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      const customToken = await admin.auth().createCustomToken(uid)
      logTelegramAuth('initData_ok', { uid, tgId, created: true, name, source: 'widget' })
      return res.json({ success: true, customToken, sessionToken: sessionTokenNew, sessionTokenExpiresAt: sessionExpiresAt })
    } catch (err) {
      logTelegramAuth('error', { step: 'widget_create', message: err.message })
      return res.status(500).json({ success: false, error: err.message || 'Ошибка авторизации' })
    }
  })

  // ——— POST /webhook (Telegram Bot API updates). Ответ 200 OK сразу, обработка в telegram.service → userService, businessService. ———
  router.post('/webhook', verifyTelegramWebhookSecret, express.json(), (req, res) => {
    const update = req.body
    res.status(200).send()
    const webhookDeps = {
      getTelegramToken,
      getDb,
      sendTelegramMessage,
      sendMainMenu,
      handleMiniAppData,
      answerCallbackQuery,
      editMessageText,
      buildMainKeyboard,
      getScenario: getScenario || (() => Promise.resolve(null)),
      findScenarioFromBotBuilder: findScenarioFromBotBuilder || (() => Promise.resolve(null)),
      logTelegramUpdate: logTelegramUpdate || (() => {}),
      getBaseUrlForTelegram,
      APP_ID,
      randomUUID,
    }
    handleWebhook(update, webhookDeps).catch((err) => console.error('❌ Telegram webhook:', err.message))
  })

  // ——— GET /bind-link ———
  router.get('/bind-link', async (req, res) => {
    const authResult = await verifyIdToken(req, res)
    if (!authResult?.ok) return
    const db = getDb()
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

  // ——— POST /unbind ———
  router.post('/unbind', async (req, res) => {
    const authResult = await verifyIdToken(req, res)
    if (!authResult?.ok) return
    const db = getDb()
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

  // ——— POST /send-reminders ———
  router.post('/send-reminders', express.json(), async (req, res) => {
    const secret = req.headers['x-telegram-secret'] || req.body?.secret || ''
    if (TELEGRAM_WEBHOOK_SECRET && secret !== TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).json({ success: false, error: 'Неверный секрет' })
    }
    const botToken = await getTelegramToken()
    const db = getDb()
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

  return router
}
