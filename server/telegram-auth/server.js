/**
 * Точка входа: Express-приложение с гибридной Telegram-авторизацией.
 * Запуск: node server/telegram-auth/server.js
 * Подключение в основной проект — см. index.js (экспорт createAuthRouter, authMiddleware и т.д.).
 */

import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import pg from 'pg'
import Redis from 'ioredis'
import { createAuthRouter } from './routes/auth.js'
import { authMiddleware } from './middleware/authMiddleware.js'
import { authRateLimit } from './middleware/rateLimit.js'

const {
  PORT = 3002,
  DATABASE_URL,
  REDIS_URL = 'redis://localhost:6379',
  TELEGRAM_BOT_TOKEN,
  JWT_SECRET,
  COOKIE_DOMAIN,
  COOKIE_SECURE = 'false',
} = process.env

if (!JWT_SECRET || !TELEGRAM_BOT_TOKEN) {
  console.error('Задайте JWT_SECRET и TELEGRAM_BOT_TOKEN в .env')
  process.exit(1)
}

if (!DATABASE_URL) {
  console.error('Задайте DATABASE_URL для PostgreSQL')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL })
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 })

const app = express()
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

app.use('/auth', authRateLimit, createAuthRouter({
  pool,
  redis,
  botToken: TELEGRAM_BOT_TOKEN,
  jwtSecret: JWT_SECRET,
  cookieDomain: COOKIE_DOMAIN || undefined,
  cookieSecure: COOKIE_SECURE === 'true',
}))

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'telegram-auth' })
})

app.get('/api/me', authMiddleware(JWT_SECRET), (req, res) => {
  res.json({ success: true, user: req.user })
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ success: false, error: 'Внутренняя ошибка' })
})

const server = app.listen(PORT, () => {
  console.log(`Telegram Auth API: http://localhost:${PORT}`)
})

process.on('SIGTERM', () => {
  server.close()
  pool.end()
  redis.quit()
})
