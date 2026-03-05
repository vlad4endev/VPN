/**
 * Роуты гибридной авторизации через Telegram.
 * POST /auth/telegram — логин (WebApp initData или Login Widget)
 * POST /auth/refresh — обновление access по refresh
 * POST /auth/logout — выход, инвалидация refresh в Redis
 */

import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { verifyWebAppInitData } from '../utils/verifyWebApp.js'
import { verifyLoginWidget } from '../utils/verifyLogin.js'
import { findOrCreateUserByTelegramId, findUserById } from '../services/userService.js'
import { notifyNewDeviceLogin } from '../services/telegramNotify.js'

const ACCESS_TOKEN_TTL_SEC = 15 * 60       // 15 мин
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60 // 30 дней
const REDIS_KEY_PREFIX = 'refresh:user:'

/**
 * Создать роутер авторизации.
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool - PostgreSQL pool
 * @param {import('ioredis').Redis} deps.redis - Redis client
 * @param {string} deps.botToken - токен Telegram-бота
 * @param {string} deps.jwtSecret - секрет для подписи JWT
 * @param {string} [deps.cookieDomain] - домен для cookie (например site.com)
 * @param {boolean} [deps.cookieSecure] - Secure для cookie (true в production)
 */
export function createAuthRouter(deps) {
  const { pool, redis, botToken, jwtSecret, cookieDomain, cookieSecure = false } = deps
  const router = express.Router()

  router.use(express.json({ limit: '10kb' }))

  function issueAccessToken(user) {
    return jwt.sign(
      {
        uid: user.id,
        tid: user.telegram_id,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SEC,
      },
      jwtSecret,
      { algorithm: 'HS256' }
    )
  }

  function issueRefreshToken(user) {
    const refreshId = crypto.randomUUID()
    const token = jwt.sign(
      {
        uid: user.id,
        tid: user.telegram_id,
        role: user.role,
        refreshId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SEC,
      },
      jwtSecret,
      { algorithm: 'HS256' }
    )
    return { token, refreshId }
  }

  async function setRefreshInRedis(userId, refreshId) {
    const key = `${REDIS_KEY_PREFIX}${userId}`
    await redis.setex(key, REFRESH_TOKEN_TTL_SEC, refreshId)
  }

  async function getRefreshIdFromRedis(userId) {
    const key = `${REDIS_KEY_PREFIX}${userId}`
    return redis.get(key)
  }

  async function deleteRefreshFromRedis(userId) {
    const key = `${REDIS_KEY_PREFIX}${userId}`
    await redis.del(key)
  }

  function setRefreshCookie(res, refreshToken) {
    const opts = {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_TTL_SEC * 1000,
      path: '/',
    }
    if (cookieDomain) opts.domain = cookieDomain
    if (cookieSecure) opts.secure = true
    res.cookie('refreshToken', refreshToken, opts)
  }

  function clearRefreshCookie(res) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      ...(cookieDomain && { domain: cookieDomain }),
    })
  }

  // --- POST /auth/telegram ---
  router.post('/telegram', async (req, res) => {
    try {
      const body = req.body || {}
      const userAgent = req.headers['user-agent'] || ''
      const fingerprint = body.fingerprint || req.headers['x-fingerprint'] || ''

      let telegramId
      let profile = {}

      if (body.initData && typeof body.initData === 'string') {
        const result = verifyWebAppInitData(body.initData, botToken)
        if (!result.ok) {
          return res.status(401).json({ success: false, error: result.message, reason: result.reason })
        }
        const user = result.data?.user
        if (!user || user.id == null) {
          return res.status(401).json({ success: false, error: 'Нет данных пользователя в initData' })
        }
        telegramId = String(user.id)
        profile = {
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
        }
      } else if (body.hash != null && body.auth_date != null && body.id != null) {
        const result = verifyLoginWidget(body, botToken)
        if (!result.ok) {
          return res.status(401).json({ success: false, error: result.message, reason: result.reason })
        }
        telegramId = result.data.id
        profile = {
          first_name: result.data.first_name,
          last_name: result.data.last_name,
          username: result.data.username,
        }
      } else {
        return res.status(400).json({
          success: false,
          error: 'Передайте initData (WebApp) или id, hash, auth_date (Login Widget)',
        })
      }

      const user = await findOrCreateUserByTelegramId(pool, telegramId, profile)

      const previousRefreshId = await getRefreshIdFromRedis(user.id)
      if (previousRefreshId) {
        await deleteRefreshFromRedis(user.id)
        await notifyNewDeviceLogin(botToken, telegramId, userAgent, fingerprint).catch((err) => console.warn('notifyNewDeviceLogin:', err?.message))
      }

      const { token: refreshToken, refreshId } = issueRefreshToken(user)
      await setRefreshInRedis(user.id, refreshId)

      const accessToken = issueAccessToken(user)
      setRefreshCookie(res, refreshToken)

      res.json({
        success: true,
        accessToken,
        expiresIn: ACCESS_TOKEN_TTL_SEC,
        user: { id: user.id, telegram_id: user.telegram_id, role: user.role },
      })
    } catch (err) {
      console.error('POST /auth/telegram:', err.message)
      res.status(500).json({ success: false, error: 'Ошибка авторизации' })
    }
  })

  // --- POST /auth/refresh ---
  router.post('/refresh', async (req, res) => {
    try {
      const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken
      if (!refreshToken) {
        return res.status(401).json({ success: false, error: 'Нет refresh token' })
      }
      let payload
      try {
        payload = jwt.verify(refreshToken, jwtSecret, { algorithms: ['HS256'] })
      } catch {
        clearRefreshCookie(res)
        return res.status(401).json({ success: false, error: 'Недействительный refresh token' })
      }
      const refreshId = payload.refreshId
      const uid = payload.uid
      if (!refreshId || !uid) {
        clearRefreshCookie(res)
        return res.status(401).json({ success: false, error: 'Неверный формат refresh token' })
      }
      const storedRefreshId = await getRefreshIdFromRedis(uid)
      if (storedRefreshId !== refreshId) {
        clearRefreshCookie(res)
        return res.status(401).json({ success: false, error: 'Сессия завершена (вход с другого устройства)' })
      }
      const user = await findUserById(pool, uid)
      if (!user) {
        await deleteRefreshFromRedis(uid)
        clearRefreshCookie(res)
        return res.status(401).json({ success: false, error: 'Пользователь не найден' })
      }
      const accessToken = issueAccessToken(user)
      res.json({
        success: true,
        accessToken,
        expiresIn: ACCESS_TOKEN_TTL_SEC,
        user: { id: user.id, telegram_id: user.telegram_id, role: user.role },
      })
    } catch (err) {
      console.error('POST /auth/refresh:', err.message)
      res.status(500).json({ success: false, error: 'Ошибка обновления токена' })
    }
  })

  // --- POST /auth/logout ---
  router.post('/logout', async (req, res) => {
    try {
      const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken
      if (refreshToken) {
        try {
          const payload = jwt.decode(refreshToken)
          if (payload?.uid) await deleteRefreshFromRedis(payload.uid)
        } catch (_) {}
      }
      clearRefreshCookie(res)
      res.json({ success: true })
    } catch (err) {
      console.error('POST /auth/logout:', err.message)
      res.status(500).json({ success: false, error: 'Ошибка выхода' })
    }
  })

  return router
}
