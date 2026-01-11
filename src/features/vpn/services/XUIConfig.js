/**
 * Конфигурация для работы с 3x-ui API
 * Настраивается админом через Firestore
 * Поддерживает глобальные настройки и настройки для каждого сервера
 */

import { doc, getDoc, setDoc } from 'firebase/firestore'
import logger from '../../../shared/utils/logger.js'
import { APP_ID } from '../../../shared/constants/app.js'

class XUIConfig {
  constructor(db) {
    this.db = db
    this.config = null
    this.configPath = `artifacts/${APP_ID}/public/xui_config`
    this.defaultConfig = {
      // Глобальные настройки
      global: {
        // Retry настройки
        retry: {
          enabled: true,
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 10000,
        },
        // Circuit Breaker настройки
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          timeout: 60000,
        },
        // Rate Limiter настройки
        rateLimiter: {
          enabled: true,
          maxRequests: 10,
          windowMs: 1000,
        },
        // Кеширование
        cache: {
          enabled: true,
          expiry: 5 * 60 * 1000, // 5 минут
        },
        // Логирование
        logging: {
          enabled: true,
          level: 'info', // debug, info, warn, error
          logRequests: true,
          logResponses: true,
          logErrors: true,
          maxHistory: 500,
        },
        // Timeout настройки
        timeout: {
          default: 30000, // 30 секунд
          login: 10000, // 10 секунд
          healthCheck: 5000, // 5 секунд
        },
      },
      // Настройки для каждого сервера (по serverId)
      servers: {},
      // Метаданные
      metadata: {
        updatedAt: new Date().toISOString(),
        updatedBy: null,
        version: '1.0.0',
      },
    }
  }

  /**
   * Загрузка конфигурации из Firestore
   * @param {string} userId - ID пользователя (для логирования)
   */
  async load(userId = null) {
    if (!this.db) {
      logger.warn('XUIConfig', 'Firestore недоступен, используем конфигурацию по умолчанию')
      this.config = { ...this.defaultConfig }
      return this.config
    }

    try {
      const configDoc = doc(this.db, this.configPath)
      const configSnapshot = await getDoc(configDoc)

      if (configSnapshot.exists()) {
        this.config = {
          ...this.defaultConfig,
          ...configSnapshot.data(),
        }
        logger.info('XUIConfig', 'Конфигурация загружена из Firestore', {
          updatedAt: this.config.metadata?.updatedAt,
          updatedBy: this.config.metadata?.updatedBy,
        })
      } else {
        // Создаем конфигурацию по умолчанию
        this.config = { ...this.defaultConfig }
        await this.save(userId)
        logger.info('XUIConfig', 'Создана конфигурация по умолчанию')
      }

      return this.config
    } catch (error) {
      logger.error('XUIConfig', 'Ошибка загрузки конфигурации', null, error)
      this.config = { ...this.defaultConfig }
      return this.config
    }
  }

  /**
   * Сохранение конфигурации в Firestore
   * @param {string} userId - ID пользователя
   */
  async save(userId = null) {
    if (!this.db) {
      logger.warn('XUIConfig', 'Firestore недоступен, конфигурация не сохранена')
      return false
    }

    if (!this.config) {
      this.config = { ...this.defaultConfig }
    }

    try {
      this.config.metadata = {
        ...this.config.metadata,
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
      }

      const configDoc = doc(this.db, this.configPath)
      await setDoc(configDoc, this.config, { merge: true })

      logger.info('XUIConfig', 'Конфигурация сохранена в Firestore', {
        updatedBy: userId,
      })

      return true
    } catch (error) {
      logger.error('XUIConfig', 'Ошибка сохранения конфигурации', null, error)
      return false
    }
  }

  /**
   * Получение глобальной настройки
   * @param {string} path - Путь к настройке (например, 'retry.maxRetries')
   * @param {any} defaultValue - Значение по умолчанию
   * @returns {any} Значение настройки
   */
  getGlobal(path, defaultValue = null) {
    if (!this.config) {
      return defaultValue
    }

    const keys = path.split('.')
    let value = this.config.global

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]
      } else {
        return defaultValue
      }
    }

    return value !== undefined ? value : defaultValue
  }

  /**
   * Установка глобальной настройки
   * @param {string} path - Путь к настройке
   * @param {any} value - Значение
   */
  setGlobal(path, value) {
    if (!this.config) {
      this.config = { ...this.defaultConfig }
    }

    const keys = path.split('.')
    let target = this.config.global

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {}
      }
      target = target[key]
    }

    target[keys[keys.length - 1]] = value
  }

  /**
   * Получение настройки для сервера
   * @param {string} serverId - ID сервера
   * @param {string} path - Путь к настройке
   * @param {any} defaultValue - Значение по умолчанию
   * @returns {any} Значение настройки
   */
  getServer(serverId, path, defaultValue = null) {
    if (!this.config || !this.config.servers || !this.config.servers[serverId]) {
      // Если настройки для сервера нет, возвращаем глобальную
      return this.getGlobal(path, defaultValue)
    }

    const keys = path.split('.')
    let value = this.config.servers[serverId]

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]
      } else {
        // Если настройка не найдена для сервера, возвращаем глобальную
        return this.getGlobal(path, defaultValue)
      }
    }

    return value !== undefined ? value : this.getGlobal(path, defaultValue)
  }

  /**
   * Установка настройки для сервера
   * @param {string} serverId - ID сервера
   * @param {string} path - Путь к настройке
   * @param {any} value - Значение
   */
  setServer(serverId, path, value) {
    if (!this.config) {
      this.config = { ...this.defaultConfig }
    }

    if (!this.config.servers) {
      this.config.servers = {}
    }

    if (!this.config.servers[serverId]) {
      this.config.servers[serverId] = {}
    }

    const keys = path.split('.')
    let target = this.config.servers[serverId]

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {}
      }
      target = target[key]
    }

    target[keys[keys.length - 1]] = value
  }

  /**
   * Получение всей конфигурации
   * @returns {Object} Конфигурация
   */
  getAll() {
    return this.config || { ...this.defaultConfig }
  }

  /**
   * Сброс конфигурации к значениям по умолчанию
   */
  reset() {
    this.config = { ...this.defaultConfig }
    logger.info('XUIConfig', 'Конфигурация сброшена к значениям по умолчанию')
  }
}

export default XUIConfig

