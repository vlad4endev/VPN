/**
 * Redis хранилище состояний (production, масштабирование).
 * Зависимость: npm i ioredis (или redis)
 */

const redisClients = new Map()

async function getClient(redisUrl) {
  const key = String(redisUrl || '')
  if (redisClients.has(key)) return redisClients.get(key)
  try {
    const { default: Redis } = await import('ioredis')
    const client = new Redis(redisUrl, { maxRetriesPerRequest: 3 })
    redisClients.set(key, client)
    return client
  } catch (e) {
    throw new Error('Redis store requires ioredis: npm i ioredis')
  }
}

export function createRedisStore(redisUrl, keyPrefix = 'tg_bot:', ttlSeconds = 3600) {
  return {
    async getState(chatId) {
      const client = await getClient(redisUrl)
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
      const client = await getClient(redisUrl)
      const key = `${keyPrefix}state:${chatId}`
      const value = JSON.stringify({
        ...state,
        _expiresAt: Date.now() + (ttl * 1000),
      })
      await client.setex(key, ttl, value)
    },

    async deleteState(chatId) {
      const client = await getClient(redisUrl)
      await client.del(`${keyPrefix}state:${chatId}`)
    },
  }
}
