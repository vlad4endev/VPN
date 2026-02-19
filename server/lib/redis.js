/**
 * Общий Redis-клиент для кэширования (settings, tariffs).
 * При REDIS_URL — подключается к Redis; иначе используется только in-memory в вызывающем коде.
 * Для graceful shutdown вызывайте closeRedis().
 */

let client = null

export async function getRedis() {
  if (client) return client
  const url = (process.env.REDIS_URL || process.env.TELEGRAM_REDIS_URL || '').trim()
  if (!url) return null
  try {
    const { default: Redis } = await import('ioredis')
    client = new Redis(url, { maxRetriesPerRequest: 2 })
    client.on('error', (err) => console.warn('[redis]', err.message))
    return client
  } catch (e) {
    console.warn('[redis] недоступен:', e.message)
    return null
  }
}

export async function closeRedis() {
  if (client) {
    try {
      await client.quit()
    } catch (e) {
      console.warn('[redis] quit:', e.message)
    }
    client = null
  }
}

const CACHE_PREFIX = 'app:'
const DEFAULT_TTL = 60

/**
 * Получить значение из Redis-кэша.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function redisGet(key) {
  const redis = await getRedis()
  if (!redis) return null
  try {
    return await redis.get(CACHE_PREFIX + key)
  } catch (err) {
    console.warn('[redis] get:', err.message)
    return null
  }
}

/**
 * Записать значение в Redis-кэш с TTL (секунды).
 * @param {string} key
 * @param {string} value
 * @param {number} [ttlSeconds]
 */
export async function redisSet(key, value, ttlSeconds = DEFAULT_TTL) {
  const redis = await getRedis()
  if (!redis) return
  try {
    if (ttlSeconds > 0) {
      await redis.setex(CACHE_PREFIX + key, ttlSeconds, value)
    } else {
      await redis.set(CACHE_PREFIX + key, value)
    }
  } catch (err) {
    console.warn('[redis] set:', err.message)
  }
}
