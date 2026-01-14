/**
 * Специализированный логгер для взаимодействий с 3x-ui API
 * Детально логирует все запросы, ответы, ошибки и метрики
 */

import logger from '../../../shared/utils/logger.js'

class XUILogger {
  constructor() {
    this.interactions = [] // История всех взаимодействий
    this.maxInteractions = 500 // Максимальное количество записей
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      errorsByType: {},
      requestsByEndpoint: {},
    }
  }

  /**
   * Логирование начала запроса
   * @param {string} method - HTTP метод
   * @param {string} endpoint - Endpoint
   * @param {Object} config - Конфигурация запроса
   * @returns {string} ID взаимодействия
   */
  logRequest(method, endpoint, config = {}) {
    const interactionId = `xui_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const timestamp = Date.now()
    
    const interaction = {
      id: interactionId,
      timestamp,
      method: method.toUpperCase(),
      endpoint,
      url: config.url || endpoint,
      baseURL: config.baseURL,
      fullURL: config.fullURL || `${config.baseURL || ''}${endpoint}`,
      headers: this.sanitizeHeaders(config.headers || {}),
      params: config.params || {},
      data: this.sanitizeData(config.data),
      status: 'pending',
      startTime: performance.now(),
    }

    this.interactions.push(interaction)
    this.trimInteractions()
    
    this.metrics.totalRequests++
    this.metrics.requestsByEndpoint[endpoint] = (this.metrics.requestsByEndpoint[endpoint] || 0) + 1

    logger.info('XUI', `→ ${method.toUpperCase()} ${endpoint}`, {
      interactionId,
      endpoint,
      method: method.toUpperCase(),
      headers: interaction.headers,
      params: interaction.params,
      data: interaction.data,
    })

    return interactionId
  }

  /**
   * Логирование успешного ответа
   * @param {string} interactionId - ID взаимодействия
   * @param {Object} response - Ответ от сервера
   */
  logResponse(interactionId, response) {
    const interaction = this.findInteraction(interactionId)
    if (!interaction) return

    const endTime = performance.now()
    const responseTime = endTime - interaction.startTime

    interaction.status = 'success'
    interaction.responseTime = responseTime
    interaction.statusCode = response.status
    interaction.statusText = response.statusText
    interaction.data = this.sanitizeData(response.data)
    interaction.headers = this.sanitizeHeaders(response.headers || {})
    interaction.endTime = endTime

    // Обновляем метрики
    this.metrics.successfulRequests++
    this.metrics.totalResponseTime += responseTime
    this.metrics.averageResponseTime = 
      this.metrics.totalResponseTime / this.metrics.successfulRequests

    logger.info('XUI', `← ${response.status} ${interaction.method} ${interaction.endpoint}`, {
      interactionId,
      status: response.status,
      statusText: response.statusText,
      responseTime: `${responseTime.toFixed(2)}ms`,
      data: interaction.data,
      headers: interaction.headers,
    })
  }

  /**
   * Логирование ошибки
   * @param {string} interactionId - ID взаимодействия
   * @param {Error} error - Ошибка
   */
  logError(interactionId, error) {
    const interaction = this.findInteraction(interactionId)
    if (!interaction) {
      // Если interactionId не найден, создаем новую запись
      const newInteractionId = this.logRequest('ERROR', 'unknown', {})
      this.logError(newInteractionId, error)
      return
    }

    const endTime = performance.now()
    const responseTime = endTime - interaction.startTime

    interaction.status = 'error'
    interaction.responseTime = responseTime
    interaction.error = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: this.sanitizeData(error.response?.data),
      stack: error.stack,
    }
    interaction.endTime = endTime

    // Обновляем метрики
    this.metrics.failedRequests++
    const errorType = error.response?.status 
      ? `HTTP_${error.response.status}` 
      : error.code || 'UNKNOWN'
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1

    logger.error('XUI', `✗ ${interaction.method} ${interaction.endpoint}`, {
      interactionId,
      error: interaction.error,
      responseTime: `${responseTime.toFixed(2)}ms`,
      url: interaction.fullURL,
    }, error)
  }

  /**
   * Логирование события (не запрос/ответ)
   * @param {string} event - Название события
   * @param {Object} data - Данные события
   */
  logEvent(event, data = {}) {
    const interaction = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: 'event',
      event,
      data: this.sanitizeData(data),
      status: 'success',
    }

    this.interactions.push(interaction)
    this.trimInteractions()

    logger.info('XUI', `📌 ${event}`, data)
  }

  /**
   * Получение истории взаимодействий
   * @param {Object} filters - Фильтры
   * @returns {Array} Массив взаимодействий
   */
  getHistory(filters = {}) {
    let history = [...this.interactions]

    if (filters.status) {
      history = history.filter(i => i.status === filters.status)
    }

    if (filters.endpoint) {
      history = history.filter(i => i.endpoint?.includes(filters.endpoint))
    }

    if (filters.method) {
      history = history.filter(i => i.method === filters.method.toUpperCase())
    }

    if (filters.since) {
      const sinceTime = Date.now() - filters.since
      history = history.filter(i => i.timestamp >= sinceTime)
    }

    if (filters.limit) {
      history = history.slice(-filters.limit)
    }

    return history.reverse() // Новые первыми
  }

  /**
   * Получение метрик
   * @returns {Object} Метрики
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalRequests > 0
        ? ((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      errorRate: this.metrics.totalRequests > 0
        ? ((this.metrics.failedRequests / this.metrics.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
    }
  }

  /**
   * Очистка истории
   */
  clearHistory() {
    this.interactions = []
    logger.info('XUI', 'История взаимодействий очищена')
  }

  /**
   * Сброс метрик
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      errorsByType: {},
      requestsByEndpoint: {},
    }
    logger.info('XUI', 'Метрики сброшены')
  }

  /**
   * Поиск взаимодействия по ID
   * @private
   */
  findInteraction(interactionId) {
    return this.interactions.find(i => i.id === interactionId)
  }

  /**
   * Обрезка истории до максимального размера
   * @private
   */
  trimInteractions() {
    if (this.interactions.length > this.maxInteractions) {
      const removed = this.interactions.length - this.maxInteractions
      this.interactions = this.interactions.slice(-this.maxInteractions)
      logger.debug('XUI', `История обрезана, удалено ${removed} записей`)
    }
  }

  /**
   * Очистка чувствительных данных из заголовков
   * @private
   */
  sanitizeHeaders(headers) {
    if (!headers || typeof headers !== 'object') return {}
    
    const sanitized = { ...headers }
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'set-cookie']
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveHeaders.some(sh => key.toLowerCase().includes(sh.toLowerCase()))) {
        sanitized[key] = '***REDACTED***'
      }
    })
    
    return sanitized
  }

  /**
   * Очистка чувствительных данных из тела запроса/ответа
   * @private
   */
  sanitizeData(data) {
    if (!data) return null
    
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data)
        return this.sanitizeObject(parsed)
      } catch {
        return data.length > 200 ? data.substring(0, 200) + '...' : data
      }
    }
    
    if (typeof data === 'object') {
      return this.sanitizeObject(data)
    }
    
    return data
  }

  /**
   * Рекурсивная очистка чувствительных данных из объекта
   * @private
   */
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item))
    }
    
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'key', 'auth', 'credentials', 'cookie']
    const sanitized = { ...obj }
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = '***REDACTED***'
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeObject(sanitized[key])
      }
    })
    
    return sanitized
  }
}

// Singleton экземпляр
const xuiLogger = new XUILogger()

export default xuiLogger

