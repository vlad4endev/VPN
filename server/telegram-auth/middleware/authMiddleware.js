/**
 * Middleware защиты API: проверка JWT access-token.
 * Токен может передаваться в заголовке Authorization: Bearer <token> или в cookie accessToken (опционально).
 */

import jwt from 'jsonwebtoken'

/**
 * Создаёт middleware проверки access token.
 * @param {string} jwtSecret - секрет для верификации JWT
 * @param {{ cookieName?: string }} [opts] - опции (имя cookie для access, по умолчанию не читаем из cookie)
 * @returns {express.RequestHandler}
 */
export function authMiddleware(jwtSecret, opts = {}) {
  const { cookieName } = opts
  return (req, res, next) => {
    let token = null
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim()
    } else if (cookieName && req.cookies && req.cookies[cookieName]) {
      token = req.cookies[cookieName].trim()
    }
    if (!token) {
      return res.status(401).json({ success: false, error: 'Требуется авторизация' })
    }
    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
      if (!payload.uid || payload.refreshId) {
        return res.status(401).json({ success: false, error: 'Неверный тип токена' })
      }
      req.user = {
        id: payload.uid,
        telegram_id: payload.tid,
        role: payload.role || 'user',
      }
      req.authPayload = payload
      next()
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, error: 'Токен истёк', code: 'TOKEN_EXPIRED' })
      }
      return res.status(401).json({ success: false, error: 'Недействительный токен' })
    }
  }
}

/**
 * Опциональная проверка: если токен передан — верифицируем и ставим req.user, иначе next() без ошибки.
 * @param {string} jwtSecret
 * @returns {express.RequestHandler}
 */
export function optionalAuthMiddleware(jwtSecret) {
  return (req, res, next) => {
    let token = null
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim()
    }
    if (!token) return next()
    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
      if (payload.uid && !payload.refreshId) {
        req.user = { id: payload.uid, telegram_id: payload.tid, role: payload.role || 'user' }
        req.authPayload = payload
      }
    } catch (_) {}
    next()
  }
}
