/**
 * Redis хранилище состояний (production, масштабирование).
 * Зависимость: npm i ioredis (или redis)
 */

let redisClient = null

function getClient(redisUrl) {
  if (redisClient) return redisClient
  try {
    // eslint-disable-next-line global-require
    const Redis = require('ioredis')
    redisClient = new Redis(redisUrl, { maxRetriesPerRequest: 3 })
    return redisClient
  } catch (e) {
    throw new Error('Redis store requires ioredis: npm i ioredis')
  }
}

export function createRedisStore(redisUrl, keyPrefix = 'tg_bot:', ttlSeconds = 3600) {
  return {
    async getState(chatId) {
      const client = getClient(redisUrl)
      const key = `${keyPrefix}state:${chatId}`
      const raw = await client.get(key)
      if (!raw) return null
      try {
        const data = JSON.parse(raw)
        if (data._expiresAt && Date.now() > data._expiresAt) {
          await client.del(key)
          return null
        }
        return data
      } catch {
        return null
      }
    },

    async setState(chatId, state, ttl = ttlSeconds) {
      const client = getClient(redisUrl)
      const key = `${keyPrefix}state:${chatId}`
      const value = JSON.stringify({
        ...state,
        _expiresAt: Date.now() + (ttl * 1000),
      })
      await client.setex(key, ttl, value)
    },

    async deleteState(chatId) {
      const client = getClient(redisUrl)
      await client.del(`${keyPrefix}state:${chatId}`)
    },
  }
}
