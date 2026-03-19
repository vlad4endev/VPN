/**
 * In-memory хранилище состояний пользователей (для dev / single instance).
 */

const store = new Map()

export function getState(chatId) {
  const key = String(chatId)
  const state = store.get(key) ?? null
  if (!state) return Promise.resolve(null)
  if (state._expiresAt && state._expiresAt < Date.now()) {
    store.delete(key)
    return Promise.resolve(null)
  }
  return Promise.resolve(state)
}

export function setState(chatId, state, ttlSeconds = 3600) {
  store.set(String(chatId), {
    ...state,
    _expiresAt: Date.now() + (ttlSeconds * 1000),
  })
  return Promise.resolve()
}

export function deleteState(chatId) {
  store.delete(String(chatId))
  return Promise.resolve()
}

// Очистка просроченных (можно вызывать по таймеру)
export function cleanupExpired() {
  const now = Date.now()
  for (const [key, value] of store.entries()) {
    if (value && value._expiresAt && value._expiresAt < now) {
      store.delete(key)
    }
  }
  return Promise.resolve()
}
