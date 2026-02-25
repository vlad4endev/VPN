/**
 * Rate limit для auth-эндпоинтов (защита от брутфорса и replay).
 * In-memory хранилище; для нескольких инстансов использовать Redis-based лимитер.
 */

const store = new Map()
const WINDOW_MS = 60 * 1000   // 1 минута
const MAX_REQUESTS = 20       // макс запросов с одного IP за окно

function getClientKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
}

function cleanup() {
  const now = Date.now()
  for (const [key, data] of store.entries()) {
    if (data.resetAt < now) store.delete(key)
  }
}
setInterval(cleanup, 60000)

/**
 * Middleware rate limit для /auth/*.
 */
export function authRateLimit(req, res, next) {
  const key = getClientKey(req)
  const now = Date.now()
  let data = store.get(key)
  if (!data) {
    data = { count: 0, resetAt: now + WINDOW_MS }
    store.set(key, data)
  }
  if (now >= data.resetAt) {
    data.count = 0
    data.resetAt = now + WINDOW_MS
  }
  data.count++
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS)
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - data.count))
  if (data.count > MAX_REQUESTS) {
    return res.status(429).json({ success: false, error: 'Слишком много запросов. Попробуйте позже.' })
  }
  next()
}
