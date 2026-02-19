/**
 * Кэш сценариев: при наличии REDIS_URL — Redis, иначе in-memory.
 * Ключ: botbuilder:scenarios:{appId}
 * Значение: JSON-массив сценариев (BotScenario[]).
 */

let redisClient = null

async function getRedisClient() {
  if (redisClient) return redisClient
  const url = (process.env.REDIS_URL || process.env.TELEGRAM_REDIS_URL || '').trim()
  if (!url) return null
  try {
    const { default: Redis } = await import('ioredis')
    redisClient = new Redis(url, { maxRetriesPerRequest: 2 })
    redisClient.on('error', (err) => console.warn('Bot-builder Redis:', err.message))
    return redisClient
  } catch (e) {
    console.warn('Bot-builder: Redis недоступен (ioredis не установлен или ошибка). Используется in-memory кэш.', e.message)
    return null
  }
}

const memoryStore = new Map()
const KEY_PREFIX = 'botbuilder:scenarios:'

/**
 * Получить список сценариев из кэша.
 * @param {string} appId
 * @returns {Promise<Array<Object>|null>} — массив BotScenario или null (кэш пуст)
 */
export async function getCachedScenarios(appId) {
  const key = KEY_PREFIX + appId
  const redis = await getRedisClient()
  if (redis) {
    try {
      const raw = await redis.get(key)
      if (raw == null) return null
      return JSON.parse(raw)
    } catch (err) {
      console.error('Bot-builder cache get:', err.message)
      return null
    }
  }
  const val = memoryStore.get(key)
  return val ?? null
}

/**
 * Записать список сценариев в кэш.
 * @param {string} appId
 * @param {Array<Object>} scenarios
 * @param {number} [ttlSeconds] — TTL для Redis (по умолчанию 3600)
 */
export async function setCachedScenarios(appId, scenarios, ttlSeconds = 3600) {
  const key = KEY_PREFIX + appId
  const redis = await getRedisClient()
  if (redis) {
    try {
      const str = JSON.stringify(scenarios)
      await redis.setex(key, ttlSeconds, str)
    } catch (err) {
      console.error('Bot-builder cache set:', err.message)
    }
    return
  }
  memoryStore.set(key, scenarios)
}

/**
 * Сбросить кэш для appId (после create/update/delete).
 * @param {string} appId
 */
export async function invalidateCachedScenarios(appId) {
  const key = KEY_PREFIX + appId
  const redis = await getRedisClient()
  if (redis) {
    try {
      await redis.del(key)
    } catch (err) {
      console.error('Bot-builder cache invalidate:', err.message)
    }
    return
  }
  memoryStore.delete(key)
}
