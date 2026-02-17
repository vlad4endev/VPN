/**
 * Фабрика state store в зависимости от конфига (memory / redis / postgres).
 */

import * as MemoryStore from '../stores/MemoryStore.js'
import { createRedisStore } from '../stores/RedisStore.js'
import { createPostgresStore } from '../stores/PostgresStore.js'

export function createStateStore(config) {
  const { stateStore, redisUrl, redisKeyPrefix, stateTtlSeconds, pgConnectionString } = config

  if (stateStore === 'redis') {
    return createRedisStore(redisUrl, redisKeyPrefix, stateTtlSeconds)
  }

  if (stateStore === 'postgres' && pgConnectionString) {
    return createPostgresStore(pgConnectionString, 'telegram_bot_state', stateTtlSeconds)
  }

  // default: memory
  return {
    getState: (chatId) => MemoryStore.getState(chatId),
    setState: (chatId, state, ttl) => MemoryStore.setState(chatId, state, ttl || stateTtlSeconds),
    deleteState: (chatId) => MemoryStore.deleteState(chatId),
  }
}
