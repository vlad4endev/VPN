/**
 * Модуль кэширования в памяти с поддержкой TTL
 * 
 * Использование:
 *   import { cache } from './cache.js'
 *   
 *   // Сохранить значение с TTL (в секундах)
 *   cache.set('key', { data: 'value' }, 60) // Кэш на 60 секунд
 *   
 *   // Получить значение
 *   const value = cache.get('key')
 *   
 *   // Удалить значение
 *   cache.delete('key')
 *   
 *   // Очистить весь кэш
 *   cache.clear()
 */

class MemoryCache {
  constructor() {
    this.store = new Map()
    this.timers = new Map() // Таймеры для автоматической очистки
  }

  /**
   * Сохранить значение в кэш с TTL
   * @param {string} key - Ключ
   * @param {any} value - Значение для кэширования
   * @param {number} ttlSeconds - Время жизни в секундах (по умолчанию 300 = 5 минут)
   */
  set(key, value, ttlSeconds = 300) {
    // Удаляем существующий таймер если есть
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
      this.timers.delete(key)
    }

    // Сохраняем значение с метаданными
    const expiresAt = Date.now() + (ttlSeconds * 1000)
    this.store.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    })

    // Устанавливаем таймер для автоматической очистки
    const timer = setTimeout(() => {
      this.delete(key)
    }, ttlSeconds * 1000)

    this.timers.set(key, timer)
  }

  /**
   * Получить значение из кэша
   * @param {string} key - Ключ
   * @returns {any|null} Значение или null если не найдено или истекло
   */
  get(key) {
    const item = this.store.get(key)

    if (!item) {
      return null
    }

    // Проверяем срок действия
    if (Date.now() > item.expiresAt) {
      this.delete(key)
      return null
    }

    return item.value
  }

  /**
   * Проверить наличие ключа в кэше (без получения значения)
   * @param {string} key - Ключ
   * @returns {boolean}
   */
  has(key) {
    const item = this.store.get(key)
    if (!item) {
      return false
    }
    if (Date.now() > item.expiresAt) {
      this.delete(key)
      return false
    }
    return true
  }

  /**
   * Удалить значение из кэша
   * @param {string} key - Ключ
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
      this.timers.delete(key)
    }
    this.store.delete(key)
  }

  /**
   * Очистить весь кэш
   */
  clear() {
    // Очищаем все таймеры
    this.timers.forEach(timer => clearTimeout(timer))
    this.timers.clear()
    this.store.clear()
  }

  /**
   * Получить статистику кэша
   * @returns {Object} Статистика
   */
  getStats() {
    const now = Date.now()
    let valid = 0
    let expired = 0

    this.store.forEach(item => {
      if (now > item.expiresAt) {
        expired++
      } else {
        valid++
      }
    })

    return {
      total: this.store.size,
      valid,
      expired,
      keys: Array.from(this.store.keys())
    }
  }

  /**
   * Очистить истекшие записи (можно вызывать периодически)
   */
  cleanup() {
    const now = Date.now()
    const keysToDelete = []

    this.store.forEach((item, key) => {
      if (now > item.expiresAt) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.delete(key))

    return keysToDelete.length
  }
}

// Создаем singleton экземпляр
export const cache = new MemoryCache()

// Периодическая очистка истекших записей (каждые 5 минут)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cleaned = cache.cleanup()
    if (cleaned > 0) {
      console.log(`🧹 Cache cleanup: removed ${cleaned} expired entries`)
    }
  }, 5 * 60 * 1000) // 5 минут
}

export default cache
