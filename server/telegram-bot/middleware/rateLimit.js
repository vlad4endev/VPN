/**
 * Middleware: rate limiting по IP (in-memory store).
 * Для масштабирования заменить на Redis-based (см. docs).
 */

const store = new Map() // ip -> { count, resetAt }

function getClientIp(req) {
  const forwarded = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])
  if (forwarded) {
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0]
    return (first || '').trim() || req.socket?.remoteAddress || 'unknown'
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'
}

/**
 * @param {number} windowMs - окно в мс
 * @param {number} maxPerWindow - макс. запросов за окно
 */
export function createRateLimitMiddleware(windowMs, maxPerWindow) {
  return function rateLimitMiddleware(req, res, next) {
    const ip = getClientIp(req)
    const now = Date.now()
    let entry = store.get(ip)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(ip, entry)
    }
    entry.count += 1
    if (entry.count > maxPerWindow) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
      res.status(429).json({ ok: false, error: 'Too Many Requests' })
      return
    }
    next()
  }
}
