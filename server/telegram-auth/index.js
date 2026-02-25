/**
 * Модуль гибридной Telegram-авторизации.
 * Подключение в основной Express-проект:
 *
 *   import { createAuthRouter, authMiddleware, authRateLimit } from './telegram-auth/index.js'
 *   import pg from 'pg'
 *   import Redis from 'ioredis'
 *   import cookieParser from 'cookie-parser'
 *
 *   const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
 *   const redis = new Redis(process.env.REDIS_URL)
 *   app.use(cookieParser())
 *   app.use('/auth', authRateLimit, createAuthRouter({
 *     pool, redis,
 *     botToken: process.env.TELEGRAM_BOT_TOKEN,
 *     jwtSecret: process.env.JWT_SECRET,
 *     cookieDomain: process.env.COOKIE_DOMAIN,
 *     cookieSecure: process.env.NODE_ENV === 'production',
 *   }))
 *   app.use('/api', authMiddleware(process.env.JWT_SECRET), yourApiRoutes)
 */

export { createAuthRouter } from './routes/auth.js'
export { authMiddleware, optionalAuthMiddleware } from './middleware/authMiddleware.js'
export { authRateLimit } from './middleware/rateLimit.js'
export { verifyWebAppInitData } from './utils/verifyWebApp.js'
export { verifyLoginWidget } from './utils/verifyLogin.js'
export { sendTelegramNotification, notifyNewDeviceLogin } from './services/telegramNotify.js'
export { findOrCreateUserByTelegramId, findUserById } from './services/userService.js'
