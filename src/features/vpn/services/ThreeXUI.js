import axios from 'axios'
import logger from '../../../shared/utils/logger.js'

/**
 * Сервис для работы с API 3x-ui панели
 * Все запросы идут через относительный путь /api/xui/* для проксирования
 */
/**
 * Circuit Breaker для защиты от каскадных сбоев
 * @private
 */
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureCount = 0
    this.threshold = threshold
    this.timeout = timeout
    this.state = 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now()
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN - API temporarily unavailable')
      }
      this.state = 'HALF_OPEN'
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  onSuccess() {
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  onFailure() {
    this.failureCount++
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN'
      this.nextAttempt = Date.now() + this.timeout
      logger.warn('ThreeXUI', 'Circuit breaker opened due to failures', {
        failureCount: this.failureCount,
        threshold: this.threshold,
        nextAttempt: new Date(this.nextAttempt).toISOString()
      })
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttempt: this.nextAttempt > Date.now() ? new Date(this.nextAttempt).toISOString() : null
    }
  }
}

/**
 * Rate Limiter для защиты от перегрузки API
 * @private
 */
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 1000) {
    this.requests = []
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    
    // Периодическая очистка старых записей для предотвращения утечки памяти
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      const before = this.requests.length
      this.requests = this.requests.filter(
        time => now - time < this.windowMs
      )
      const after = this.requests.length
      if (before !== after) {
        logger.debug('ThreeXUI', 'RateLimiter cleanup', {
          removed: before - after,
          remaining: after
        })
      }
    }, this.windowMs * 2) // Очистка каждые 2 секунды
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  async throttle() {
    const now = Date.now()
    
    // Удаляем старые записи
    this.requests = this.requests.filter(
      time => now - time < this.windowMs
    )

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0]
      const waitTime = this.windowMs - (now - oldestRequest)
      logger.debug('ThreeXUI', 'Rate limit: waiting', { waitTime, queueLength: this.requests.length })
      await new Promise(resolve => setTimeout(resolve, waitTime))
      
      // После ожидания рекурсивно проверяем снова
      return this.throttle()
    }

    this.requests.push(now)
  }
}

class ThreeXUI {
  // Singleton паттерн - защита от множественных инстансов
  static instance = null

  constructor() {
    // Защита от множественных инстансов
    if (ThreeXUI.instance) {
      logger.debug('ThreeXUI', 'Использование существующего экземпляра (Singleton)')
      return ThreeXUI.instance
    }

    // Базовый URL для всех запросов к 3x-ui API
    // БЕЗОПАСНОСТЬ: Все запросы идут через backend proxy, который хранит пароли на сервере
    this.baseURL = '/api/xui'
    
    // Создаем экземпляр axios с настройками для работы с cookies
    this.api = axios.create({
      baseURL: this.baseURL,
      withCredentials: true, // Важно для сохранения cookie сессии
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // БЕЗОПАСНОСТЬ: Пароли больше не используются в клиентском коде
    // Backend proxy автоматически выполняет авторизацию при необходимости
    // Эти переменные оставлены только для обратной совместимости и fallback
    // В production они должны быть пустыми или не использоваться
    this.username = null // Не используется - авторизация на backend
    this.password = null // Не используется - авторизация на backend

    // Кеширование клиентов для оптимизации поиска
    this.clientsCache = new Map() // email -> {clientData, inboundId, inboundTag}
    this.cacheExpiry = 5 * 60 * 1000 // 5 минут
    this.lastCacheUpdate = 0
    this.cacheRefreshing = false // Флаг обновления кеша (защита от race condition)
    this.cacheRefreshPromise = null // Promise текущего обновления

    // Circuit Breaker для защиты от каскадных сбоев
    this.circuitBreaker = new CircuitBreaker(5, 60000) // 5 ошибок, 60 сек таймаут

    // Rate Limiter для защиты от перегрузки API
    this.rateLimiter = new RateLimiter(10, 1000) // 10 запросов в секунду

    // Версия API (определяется автоматически)
    this.apiVersion = null
    this.useNewClientAPI = true // По умолчанию используем новый API

    // Настраиваем перехватчики для логирования всех запросов и ответов
    this.setupInterceptors()

    // Сохраняем инстанс
    ThreeXUI.instance = this
  }

  /**
   * Явный метод получения singleton инстанса
   * @returns {ThreeXUI}
   */
  static getInstance() {
    if (!ThreeXUI.instance) {
      ThreeXUI.instance = new ThreeXUI()
    }
    return ThreeXUI.instance
  }

  /**
   * Настройка перехватчиков axios для логирования всех запросов и ответов
   * @private
   */
  setupInterceptors() {
    // Перехватчик запросов - логируем все исходящие запросы
    this.api.interceptors.request.use(
      (config) => {
        const logData = {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          fullURL: `${config.baseURL}${config.url}`,
          headers: this.sanitizeHeaders(config.headers),
          params: config.params,
        }

        // Логируем тело запроса, если оно есть (но очищаем чувствительные данные)
        if (config.data) {
          logData.data = this.sanitizeRequestData(config.data)
        }

        logger.info('ThreeXUI', `→ API Request: ${config.method?.toUpperCase()} ${config.url}`, logData)
        
        return config
      },
      (error) => {
        logger.error('ThreeXUI', 'Ошибка при формировании запроса', {
          message: error.message,
          config: error.config ? {
            method: error.config.method,
            url: error.config.url,
            baseURL: error.config.baseURL,
          } : null,
        }, error)
        return Promise.reject(error)
      }
    )

    // Перехватчик ответов - логируем все успешные ответы
    this.api.interceptors.response.use(
      (response) => {
        const logData = {
          status: response.status,
          statusText: response.statusText,
          url: response.config?.url,
          method: response.config?.method?.toUpperCase(),
        }

        // Логируем данные ответа (но ограничиваем размер для больших ответов)
        if (response.data) {
          const dataStr = JSON.stringify(response.data)
          if (dataStr.length > 1000) {
            logData.data = `[Большой ответ: ${dataStr.length} символов] ${dataStr.substring(0, 500)}...`
          } else {
            logData.data = response.data
          }
        }

        logger.info('ThreeXUI', `← API Response: ${response.status} ${response.config?.method?.toUpperCase()} ${response.config?.url}`, logData)
        
        return response
      },
      (error) => {
        // Логируем все ошибки ответов
        const errorData = {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
          baseURL: error.config?.baseURL,
          requestData: error.config?.data ? this.sanitizeRequestData(error.config.data) : null,
        }

        // Логируем данные ответа об ошибке
        if (error.response?.data) {
          const errorResponseStr = JSON.stringify(error.response.data)
          if (errorResponseStr.length > 500) {
            errorData.responseData = `[Большой ответ: ${errorResponseStr.length} символов] ${errorResponseStr.substring(0, 300)}...`
          } else {
            errorData.responseData = error.response.data
          }
        }

        // Логируем в зависимости от типа ошибки
        if (error.response) {
          // Сервер ответил с кодом ошибки
          logger.error('ThreeXUI', `← API Error Response: ${error.response.status} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, errorData, error)
        } else if (error.request) {
          // Запрос был отправлен, но ответа не получено
          logger.error('ThreeXUI', `← API Network Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
            ...errorData,
            message: 'Нет ответа от сервера',
            timeout: error.code === 'ECONNABORTED',
          }, error)
        } else {
          // Ошибка при настройке запроса
          logger.error('ThreeXUI', `← API Request Setup Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
            ...errorData,
            message: error.message,
          }, error)
        }

        return Promise.reject(error)
      }
    )
  }

  /**
   * Очищает чувствительные данные из заголовков
   * @private
   */
  sanitizeHeaders(headers) {
    if (!headers) return null
    
    const sanitized = { ...headers }
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key']
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveHeaders.some(sh => key.toLowerCase().includes(sh.toLowerCase()))) {
        sanitized[key] = '***REDACTED***'
      }
    })
    
    return sanitized
  }

  /**
   * Очищает чувствительные данные из тела запроса
   * @private
   */
  sanitizeRequestData(data) {
    if (!data) return null
    
    // Если это строка, пытаемся распарсить
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data)
        return this.sanitizeObject(parsed)
      } catch {
        // Если не JSON, возвращаем как есть (но обрезаем длинные строки)
        return data.length > 200 ? data.substring(0, 200) + '...' : data
      }
    }
    
    // Если это объект
    if (typeof data === 'object') {
      return this.sanitizeObject(data)
    }
    
    return data
  }

  /**
   * Рекурсивно очищает чувствительные данные из объекта
   * @private
   */
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item))
    }
    
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'key', 'auth', 'credentials']
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

  /**
   * Retry механизм с exponential backoff
   * @param {Function} fn - Функция для выполнения
   * @param {number} maxRetries - Максимальное количество попыток
   * @param {number} delay - Начальная задержка в миллисекундах
   * @param {Function} shouldRetry - Функция для определения, нужно ли повторять попытку
   * @returns {Promise<any>} Результат выполнения функции
   * @private
   */
  async retryRequest(fn, maxRetries = 3, delay = 1000, shouldRetry = null) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn()
      } catch (error) {
        // Если это последняя попытка - пробрасываем ошибку
        if (i === maxRetries - 1) {
          throw error
        }

        // Проверяем, нужно ли повторять попытку
        if (shouldRetry && !shouldRetry(error)) {
          throw error
        }

        // Не повторяем для ошибок авторизации и валидации
        if (error.response?.status === 401 || 
            error.response?.status === 403 || 
            error.response?.status === 400 ||
            error.message?.includes('уже существует')) {
          throw error
        }

        // Exponential backoff
        const waitTime = delay * Math.pow(2, i)
        logger.warn('ThreeXUI', `Retry ${i + 1}/${maxRetries} after error`, {
          attempt: i + 1,
          maxRetries,
          waitTime,
          error: error.message
        })
        
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  /**
   * Обновление кеша клиентов
   * Защита от race condition - если уже обновляется, ждем завершения
   * @private
   */
  async refreshClientCache() {
    const now = Date.now()
    
    // Кеш еще валидный
    if (now - this.lastCacheUpdate < this.cacheExpiry) {
      logger.debug('ThreeXUI', 'Кеш клиентов еще валиден', {
        age: now - this.lastCacheUpdate,
        expiry: this.cacheExpiry
      })
      return
    }

    // Уже обновляется - ждем завершения (защита от race condition)
    if (this.cacheRefreshing) {
      logger.debug('ThreeXUI', 'Кеш уже обновляется, ожидание завершения')
      return this.cacheRefreshPromise
    }

    // Начинаем обновление
    this.cacheRefreshing = true
    this.cacheRefreshPromise = (async () => {
      try {
        logger.debug('ThreeXUI', 'Обновление кеша клиентов')
        const inbounds = await this.getInbounds()
        this.clientsCache.clear()

        for (const inbound of inbounds) {
          // Парсим settings если это строка
          let clients = []
          if (inbound.settings) {
            try {
              const settings = typeof inbound.settings === 'string' 
                ? JSON.parse(inbound.settings) 
                : inbound.settings
              clients = settings.clients || []
            } catch (parseError) {
              logger.warn('ThreeXUI', 'Ошибка парсинга settings инбаунда', {
                inboundId: inbound.id,
                error: parseError.message
              })
              // Используем clients напрямую, если settings не парсится
              clients = inbound.clients || []
            }
          } else {
            clients = inbound.clients || []
          }

          clients.forEach(client => {
            if (client.email) {
              this.clientsCache.set(client.email, {
                ...client,
                inboundId: inbound.id,
                inboundTag: inbound.tag,
                inbound: inbound
              })
            }
          })
        }

        this.lastCacheUpdate = Date.now()
        logger.info('ThreeXUI', 'Кеш клиентов обновлен', {
          clientsCount: this.clientsCache.size,
          inboundsCount: inbounds.length
        })
      } catch (error) {
        logger.error('ThreeXUI', 'Ошибка обновления кеша клиентов', null, error)
        // Не пробрасываем ошибку - используем старый кеш или пустой
      } finally {
        this.cacheRefreshing = false
        this.cacheRefreshPromise = null
      }
    })()

    return this.cacheRefreshPromise
  }

  /**
   * Инвалидация кеша клиентов
   * Вызывается после изменений (добавление, удаление, обновление)
   * @private
   */
  invalidateCache() {
    this.lastCacheUpdate = 0
    logger.debug('ThreeXUI', 'Кеш клиентов инвалидирован')
  }

  /**
   * Health check для проверки состояния API
   * @returns {Promise<Object>} Объект с результатами проверки
   */
  async healthCheck() {
    const checks = {
      api_reachable: false,
      authenticated: false,
      inbound_accessible: false,
      response_time: null,
      circuit_breaker_state: this.circuitBreaker.getState(),
      cache_status: {
        clients_cached: this.clientsCache.size,
        cache_age: this.lastCacheUpdate ? Date.now() - this.lastCacheUpdate : null
      },
      error: null
    }

    const start = Date.now()

    try {
      // Проверяем доступность API
      const response = await this.api.get('/panel/api/inbounds', {
        timeout: 5000 // 5 секунд таймаут для health check
      })
      
      checks.api_reachable = true
      checks.response_time = Date.now() - start

      const data = response.data || {}
      if (data.success !== false && data.success !== 0) {
        checks.authenticated = true
      }

      // Проверяем доступность инбаунда
      const inboundId = import.meta.env.VITE_XUI_INBOUND_ID
      if (inboundId) {
        try {
          const inbound = await this.getInbound(inboundId)
          checks.inbound_accessible = !!inbound
        } catch (inboundError) {
          checks.inbound_accessible = false
          checks.error = `Inbound check failed: ${inboundError.message}`
        }
      }

    } catch (error) {
      checks.error = error.message
      checks.response_time = Date.now() - start
      
      if (error.response) {
        // API доступен, но есть ошибка
        checks.api_reachable = true
        if (error.response.status === 401 || error.response.status === 403) {
          checks.authenticated = false
        }
      } else {
        // API недоступен
        checks.api_reachable = false
      }
    }

    return checks
  }

  /**
   * Авторизация в панели 3x-ui
   * БЕЗОПАСНОСТЬ: Авторизация выполняется автоматически на backend proxy
   * Этот метод проверяет доступность API и инициирует авторизацию через backend
   * Пароли не передаются из клиентского кода
   * @returns {Promise<Object>} Ответ от сервера
   */
  async login() {
    try {
      logger.debug('ThreeXUI', 'Проверка авторизации через backend proxy', { 
        baseURL: this.baseURL,
        note: 'Авторизация выполняется автоматически на backend сервере'
      })
      
      // БЕЗОПАСНОСТЬ: Не используем пароли из клиентского кода
      // Backend proxy автоматически выполняет авторизацию при необходимости
      // Просто проверяем доступность API - если требуется авторизация,
      // backend выполнит её автоматически
      
      // Пытаемся выполнить простой запрос - backend автоматически авторизуется если нужно
      const response = await this.api.get('/panel/api/inbounds', {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        validateStatus: () => true, // Не бросать ошибку на любой статус
      })

      // Проверяем успешность
      const data = response.data || {}
      if (data.success === false || data.success === 0) {
        // Если это ошибка авторизации, backend должен был автоматически авторизоваться
        // Если всё равно ошибка - значит проблема с настройками backend
        if (response.status === 401 || response.status === 403) {
          const error = new Error(
            `Ошибка авторизации в 3x-ui (${response.status}).\n` +
            `Проверьте настройки backend proxy:\n` +
            `- XUI_HOST должен указывать на панель 3x-ui\n` +
            `- XUI_USERNAME и XUI_PASSWORD должны быть настроены в переменных окружения backend сервера\n` +
            `- Убедитесь, что backend proxy запущен и доступен`
          )
          logger.error('ThreeXUI', 'Ошибка авторизации через backend', { 
            status: response.status,
            response: data 
          }, error)
          throw error
        }
        
        const error = new Error(data.msg || 'Ошибка доступа к API 3x-ui')
        logger.error('ThreeXUI', 'Ошибка доступа к API', { response: data }, error)
        throw error
      }

      logger.info('ThreeXUI', 'Успешная проверка авторизации через backend proxy')
      return data
    } catch (error) {
      logger.error('ThreeXUI', 'Ошибка проверки авторизации', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        baseURL: this.baseURL
      }, error)
      
      let errorMessage = error.response?.data?.msg || 
        error.response?.data?.message ||
        error.message || 
        'Не удалось подключиться к панели 3x-ui через backend proxy'
      
      // Добавляем полезную информацию для диагностики
      if (error.response?.status === 404) {
        errorMessage = `Панель 3x-ui недоступна (404). ` +
          `Проверьте настройки:\n` +
          `- XUI_HOST в переменных окружения backend сервера\n` +
          `- Убедитесь, что панель 3x-ui запущена и доступна\n` +
          `- Проверьте, что backend proxy запущен и доступен\n` +
          `- Проверьте настройки прокси в vite.config.js (для dev режима)\n\n` +
          `Текущий baseURL: ${this.baseURL}\n` +
          `Запрос: ${error.config?.method?.toUpperCase()} ${error.config?.url}`
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = `Ошибка авторизации (${error.response?.status}). ` +
          `Проверьте настройки backend proxy:\n` +
          `- XUI_USERNAME и XUI_PASSWORD должны быть настроены в переменных окружения backend сервера\n` +
          `- Убедитесь, что backend proxy запущен`
      } else if (error.code === 'ERR_NETWORK' || error.code === 'ERR_FAILED') {
        errorMessage = `Не удалось подключиться к backend proxy.\n` +
          `Проверьте:\n` +
          `- Backend proxy запущен и доступен\n` +
          `- Настройки прокси в vite.config.js (для dev режима)\n` +
          `- CORS настройки на backend сервере`
      }
      
      throw new Error(errorMessage)
    }
  }

  /**
   * Добавление клиента в указанный инбаунд
  * Использует эндпоинт /panel/api/inbounds/addClient согласно документации 3x-ui
   * @param {string|number} inboundId - ID инбаунда
   * @param {string} email - Email клиента (используется как идентификатор)
   * @param {string} uuid - UUID для VLESS протокола
   * @param {Object} options - Дополнительные опции клиента
   * @param {number} options.totalGB - Лимит трафика в GB (0 = безлимит)
   * @param {number} options.expiryTime - Дата истечения в миллисекундах (0 = без ограничений)
   * @param {number} options.limitIp - Лимит IP адресов (0 = без ограничений)
   * @param {boolean} options.enable - Включен ли клиент
   * @returns {Promise<Object>} Ответ от сервера с данными созданного клиента
   */
  async addClient(inboundId, email, uuid, options = {}) {
    return this.circuitBreaker.execute(async () => {
      await this.rateLimiter.throttle()
      
      return this.retryRequest(async () => {
        try {
          logger.info('ThreeXUI', 'Добавление клиента', { inboundId, email, uuid, options })
          
          // Сначала убеждаемся, что мы авторизованы
          await this.ensureAuthenticated()

      // Получаем информацию об инбаунде для проверки
      logger.debug('ThreeXUI', 'Получение информации об инбаунде', { inboundId })
      let inbound
      try {
        const inboundResponse = await this.api.get(`/panel/api/inbounds/get/${inboundId}`)
        inbound = inboundResponse.data?.obj || inboundResponse.data
      } catch (inboundError) {
        // Если не удалось получить инбаунд, пробуем получить список всех инбаундов
        if (inboundError.response?.status === 404) {
          logger.warn('ThreeXUI', 'Эндпоинт get/{id} не найден, пробуем получить список инбаундов', { inboundId })
          try {
            const inboundsResponse = await this.api.get('/panel/api/inbounds')
            const inbounds = inboundsResponse.data?.obj || inboundsResponse.data
            if (Array.isArray(inbounds)) {
              inbound = inbounds.find(ib => ib.id === Number(inboundId) || ib.id === String(inboundId))
            }
          } catch (listError) {
            logger.error('ThreeXUI', 'Не удалось получить список инбаундов', { inboundId }, listError)
            throw new Error(`Не удалось получить информацию об инбаунде ${inboundId}. Проверьте настройки прокси и XUI_HOST.`)
          }
        } else {
          throw inboundError
        }
      }

      if (!inbound) {
        const error = new Error(`Инбаунд с ID ${inboundId} не найден. Проверьте правильность VITE_XUI_INBOUND_ID`)
        logger.error('ThreeXUI', 'Инбаунд не найден', { inboundId }, error)
        throw error
      }

      // Проверяем, существует ли уже клиент с таким email
      const existingClient = inbound.clients?.find((client) => client.email === email)
      if (existingClient) {
        const error = new Error(`Клиент с email ${email} уже существует в этом инбаунде`)
        logger.warn('ThreeXUI', 'Попытка добавить существующего клиента', { email, inboundId }, error)
        throw error
      }

      // Формируем структуру клиента согласно реальному API 3x-ui (как в n8n)
      const newClient = {
        id: uuid,
        email: email,
        flow: options.flow || 'xtls-rprx-vision',
        limitIp: options.limitIp !== undefined ? options.limitIp : 1,
        totalGB: options.totalGB !== undefined ? options.totalGB : 0,
        expiryTime: options.expiryTime !== undefined ? options.expiryTime : 0,
        enable: options.enable !== undefined ? options.enable : true,
        tgId: options.tgId || '',
        subId: options.subId || '',
        reset: 0,
      }

      // Формируем тело запроса, как в рабочем примере n8n:
      // {
      //   "id": 3,
      //   "settings": "{\"clients\": [{...}]}"
      // }
      const requestBody = {
        id: Number(inboundId),
        settings: JSON.stringify({
          clients: [newClient],
        }),
      }

      logger.debug('ThreeXUI', 'Отправка запроса на добавление клиента', { 
        inboundId, 
        email,
        requestBody: { ...requestBody, settings: '[JSON string]' },
      })

      const addResponse = await this.api.post(
        '/panel/api/inbounds/addClient',
        requestBody
      )

          logger.info('ThreeXUI', 'Клиент успешно добавлен', { inboundId, email, uuid })
          
          // Инвалидируем кеш после успешного добавления
          this.invalidateCache()
          
          return addResponse.data
        } catch (error) {
          logger.error('ThreeXUI', 'Ошибка добавления клиента', {
            inboundId,
            email,
            status: error.response?.status,
          }, error)
          
          throw new Error(
            error.response?.data?.msg || 
            error.response?.data?.message ||
            error.message || 
            'Не удалось добавить клиента в 3x-ui'
          )
        }
      })
    })
  }

  /**
   * Fallback метод добавления клиента через обновление инбаунда
   * Используется если эндпоинт addClient не поддерживается
   * @private
   */
  async addClientFallback(inboundId, email, uuid, options = {}) {
    // Fallback больше не нужен, так как используем официальный эндпоинт addClient
    // Оставляем метод для совместимости, но просто прокидываем на основной addClient
    return this.addClient(inboundId, email, uuid, options)
  }

  /**
   * Удаление клиента из инбаунда
  * Использует официальный эндпоинт /panel/api/inbounds/{id}/delClient/{clientId} согласно документации 3x-ui
   * @param {string|number} inboundId - ID инбаунда
   * @param {string} email - Email клиента для удаления
   * @returns {Promise<Object>} Ответ от сервера
   */
  async deleteClient(inboundId, email) {
    return this.circuitBreaker.execute(async () => {
      await this.rateLimiter.throttle()
      
      return this.retryRequest(async () => {
        try {
          logger.info('ThreeXUI', 'Удаление клиента', { inboundId, email })
          
          // Сначала убеждаемся, что мы авторизованы
          await this.ensureAuthenticated()

          // Получаем информацию об инбаунде для поиска клиента
          const inboundResponse = await this.api.get(`/panel/api/inbounds/get/${inboundId}`)
          const inboundPayload = inboundResponse.data
          const inbound = inboundPayload?.obj || inboundPayload

          if (!inbound) {
            const error = new Error(`Инбаунд с ID ${inboundId} не найден`)
            logger.error('ThreeXUI', 'Инбаунд не найден при удалении', { inboundId }, error)
            throw error
          }

          // Находим клиента по email
          const client = inbound.clients?.find((c) => c.email === email)
          if (!client) {
            const error = new Error(`Клиент с email ${email} не найден в этом инбаунде`)
            logger.warn('ThreeXUI', 'Клиент не найден при удалении', { email, inboundId }, error)
            throw error
          }

          // Используем официальный эндпоинт для удаления клиента
          // Согласно актуальной реализации 3x-ui, используется UUID клиента в URL:
          // POST /panel/api/inbounds/{inboundId}/delClient/{clientId}
          const deleteResponse = await this.api.post(
            `/panel/api/inbounds/${inboundId}/delClient/${client.id}`
          )

          logger.info('ThreeXUI', 'Клиент успешно удален', { inboundId, email })
          
          // Инвалидируем кеш после успешного удаления
          this.invalidateCache()
          
          return deleteResponse.data
        } catch (error) {
          logger.error('ThreeXUI', 'Ошибка удаления клиента', {
            inboundId,
            email,
            status: error.response?.status,
          }, error)
          
          // Если эндпоинт delClient не поддерживается, используем fallback метод через update
          if (error.response?.status === 404 || error.response?.status === 405) {
            logger.warn('ThreeXUI', 'Использование fallback метода для удаления клиента', { inboundId, email })
            const result = await this.deleteClientFallback(inboundId, email)
            this.invalidateCache()
            return result
          }
          
          throw new Error(
            error.response?.data?.msg || 
            error.response?.data?.message ||
            error.message || 
            'Не удалось удалить клиента из 3x-ui'
          )
        }
      })
    })
  }

  /**
   * Fallback метод удаления клиента через обновление инбаунда
   * Используется если эндпоинт delClient не поддерживается
   * @private
   */
  async deleteClientFallback(inboundId, email) {
    // Получаем информацию об инбаунде
    const inboundResponse = await this.api.get(`/panel/api/inbounds/get/${inboundId}`)
    const inboundPayload = inboundResponse.data
    const inbound = inboundPayload?.obj || inboundPayload

    if (!inbound) {
      throw new Error(`Инбаунд с ID ${inboundId} не найден`)
    }

    // Проверяем, существует ли клиент с таким email
    const clientIndex = inbound.clients?.findIndex((client) => client.email === email)
    if (clientIndex === -1 || clientIndex === undefined) {
      throw new Error(`Клиент с email ${email} не найден в этом инбаунде`)
    }

    // Удаляем клиента из списка
    const updatedClients = inbound.clients.filter((client) => client.email !== email)

    // Отправляем обновленный инбаунд
    const updateResponse = await this.api.post(`/panel/api/inbounds/update/${inboundId}`, {
      ...inbound,
      clients: updatedClients,
    })

    return updateResponse.data
  }

  /**
   * Получение статистики клиента (трафик и дата истечения)
   * Использует официальный эндпоинт /panel/api/clients/{id}/stats согласно документации 3x-ui
   * @param {string} email - Email клиента
   * @returns {Promise<Object>} Объект с данными о трафике и дате истечения
   */
  async getClientStats(email) {
    try {
      logger.debug('ThreeXUI', 'Получение статистики клиента', { email })
      
      // Сначала убеждаемся, что мы авторизованы
      await this.ensureAuthenticated()

      // Обновляем кеш если нужно
      await this.refreshClientCache()

      // Ищем клиента в кеше
      let foundClient = null
      let foundInbound = null

      const cachedClient = this.clientsCache.get(email)
      if (cachedClient) {
        foundClient = cachedClient
        foundInbound = cachedClient.inbound
      } else {
        // Fallback: поиск напрямую
        const inbounds = await this.getInbounds()
        if (!inbounds || inbounds.length === 0) {
          const error = new Error('Инбаунды не найдены')
          logger.warn('ThreeXUI', 'Инбаунды не найдены при получении статистики', null, error)
          throw error
        }

        for (const inbound of inbounds) {
          if (inbound.clients && inbound.clients.length > 0) {
            const client = inbound.clients.find((c) => c.email === email)
            if (client) {
              foundClient = client
              foundInbound = inbound
              break
            }
          }
        }
      }

      if (!foundClient) {
        const error = new Error(`Клиент с email ${email} не найден`)
        logger.warn('ThreeXUI', 'Клиент не найден при получении статистики', { email }, error)
        throw error
      }

      // Получаем статистику клиента через официальный эндпоинт
      // Согласно документации 3x-ui, используется UUID клиента (id)
      logger.debug('ThreeXUI', 'Запрос статистики клиента', { clientId: foundClient.id, email })
      const statsResponse = await this.api.get(
        `/panel/api/clients/${foundClient.id}/stats`
      )

      const stats = statsResponse.data.obj || {}
      logger.debug('ThreeXUI', 'Статистика клиента получена', { email, stats })

      // Обрабатываем данные статистики согласно формату ответа 3x-ui
      // Трафик может быть в байтах или уже обработан
      const trafficUp = typeof stats.up === 'number' ? stats.up : (stats.up || 0)
      const trafficDown = typeof stats.down === 'number' ? stats.down : (stats.down || 0)

      return {
        email: email,
        uuid: foundClient.id,
        inboundId: foundInbound.id,
        inboundTag: foundInbound.tag,
        // Трафик в байтах (up + down)
        trafficUp: trafficUp,
        trafficDown: trafficDown,
        trafficTotal: trafficUp + trafficDown,
        // Дата истечения (timestamp в миллисекундах)
        // В 3x-ui expiryTime может быть в секундах или миллисекундах
        expiryTime: foundClient.expiryTime 
          ? (foundClient.expiryTime > 1000000000000 
              ? foundClient.expiryTime 
              : foundClient.expiryTime * 1000)
          : 0,
        // Лимит трафика в GB (0 = безлимит)
        totalGB: foundClient.totalGB || 0,
        // Статус активности
        enable: foundClient.enable !== false,
        // Дополнительные данные из статистики
        limitIp: foundClient.limitIp || 0,
      }
    } catch (error) {
      logger.error('ThreeXUI', 'Ошибка получения статистики клиента', {
        email,
        status: error.response?.status,
      }, error)
      throw new Error(
        error.response?.data?.msg || 
        error.response?.data?.message ||
        error.message || 
        'Не удалось получить статистику клиента'
      )
    }
  }

  /**
   * Вспомогательный метод для проверки авторизации
   * Если не авторизованы - выполняет login
   * Согласно документации 3x-ui, проверка авторизации выполняется через запрос к защищенному эндпоинту
   * @private
   */
  async ensureAuthenticated() {
    try {
      // Пытаемся выполнить запрос, который требует авторизации
      // Если получим 401/403 - значит нужно авторизоваться
      logger.debug('ThreeXUI', 'Проверка авторизации')
      try {
        const response = await this.api.get('/panel/api/inbounds')
        const data = response.data || {}
        // Если бэкенд вернул success === false, считаем, что нужна авторизация
        if (data.success === false || data.success === 0) {
          throw Object.assign(new Error('Не авторизован'), { response: { status: 401 } })
        }
        logger.debug('ThreeXUI', 'Авторизация подтверждена')
        return
      } catch (checkError) {
        // Если получили 401 или 403 - нужно авторизоваться
        if (checkError.response?.status === 401 || checkError.response?.status === 403) {
          logger.info('ThreeXUI', 'Требуется авторизация, выполняю login')
          await this.login()
          // После авторизации повторяем запрос для проверки
          try {
            await this.api.get('/panel/api/inbounds')
            logger.debug('ThreeXUI', 'Авторизация успешна после login')
            return
          } catch (retryError) {
            logger.error('ThreeXUI', 'Ошибка после повторной авторизации', {
              status: retryError.response?.status,
              url: retryError.config?.url
            }, retryError)
            throw retryError
          }
        } else if (checkError.response?.status === 404) {
          // 404 может означать проблему с прокси или неправильный URL
          // Пробуем авторизоваться на всякий случай
          logger.warn('ThreeXUI', 'Эндпоинт не найден (404), пробуем авторизацию', {
            url: checkError.config?.url,
            baseURL: this.baseURL
          })
          try {
            await this.login()
            logger.debug('ThreeXUI', 'Авторизация выполнена после 404')
            return
          } catch (loginError) {
            logger.error('ThreeXUI', 'Ошибка авторизации после 404', null, loginError)
            const xuiHost = import.meta.env.VITE_XUI_HOST || import.meta.env.XUI_HOST || 'не установлен'
            const xuiUsername = this.username ? 'установлен' : 'не установлен'
            const xuiPassword = this.password ? 'установлен' : 'не установлен'
            throw new Error(
              `Не удалось подключиться к панели 3x-ui (404). ` +
              `Проверьте настройки в .env файле:\n` +
              `- XUI_HOST (для vite.config.js): ${xuiHost}\n` +
              `- VITE_XUI_USERNAME: ${xuiUsername}\n` +
              `- VITE_XUI_PASSWORD: ${xuiPassword}\n` +
              `- VITE_XUI_INBOUND_ID: ${import.meta.env.VITE_XUI_INBOUND_ID || 'не установлен'}\n\n` +
              `Ошибка: ${loginError.message || checkError.message}\n\n` +
              `Убедитесь, что:\n` +
              `1. XUI_HOST в .env указывает на панель 3x-ui (например: http://localhost:2053 или http://your-server:2053/path)\n` +
              `2. Перезапустили dev-сервер после изменения .env\n` +
              `3. Прокси в vite.config.js правильно настроен`
            )
          }
        } else {
          // Другая ошибка - логируем и пробрасываем
          logger.error('ThreeXUI', 'Ошибка при проверке авторизации', {
            status: checkError.response?.status,
            url: checkError.config?.url,
            baseURL: this.baseURL
          }, checkError)
          throw checkError
        }
      }
    } catch (error) {
      logger.error('ThreeXUI', 'Критическая ошибка при проверке авторизации', {
        status: error.response?.status,
        url: error.config?.url,
        message: error.message
      }, error)
      throw error
    }
  }

  /**
   * Обновление клиента в инбаунде
   * Использует официальный эндпоинт /panel/api/inbounds/{id}/updateClient/{clientId} согласно документации 3x-ui
   * @param {string|number} inboundId - ID инбаунда
   * @param {string} email - Email клиента для обновления
   * @param {Object} updates - Обновляемые поля клиента
   * @returns {Promise<Object>} Ответ от сервера
   */
  async updateClient(inboundId, email, updates = {}) {
    try {
      logger.info('ThreeXUI', 'Обновление клиента', { inboundId, email, updates })
      
      await this.ensureAuthenticated()

      // Получаем информацию об инбаунде для поиска клиента
      const inboundResponse = await this.api.get(`/panel/api/inbounds/get/${inboundId}`)
      const inboundPayload = inboundResponse.data
      const inbound = inboundPayload?.obj || inboundPayload

      if (!inbound) {
        const error = new Error(`Инбаунд с ID ${inboundId} не найден`)
        logger.error('ThreeXUI', 'Инбаунд не найден при обновлении', { inboundId }, error)
        throw error
      }

      // Находим клиента по email
      const client = inbound.clients?.find((c) => c.email === email)
      if (!client) {
        const error = new Error(`Клиент с email ${email} не найден в этом инбаунде`)
        logger.warn('ThreeXUI', 'Клиент не найден при обновлении', { email, inboundId }, error)
        throw error
      }

      // Формируем обновленные данные клиента
      const updatedClient = {
        ...client,
        ...updates,
        // Сохраняем обязательные поля
        id: client.id,
        email: email,
      }

      // Используем официальный эндпоинт для обновления клиента
      const updateResponse = await this.api.post(
        `/panel/api/inbounds/${inboundId}/updateClient/${client.id}`,
        updatedClient
      )

      logger.info('ThreeXUI', 'Клиент успешно обновлен', { inboundId, email })
      
      // Инвалидируем кеш после успешного обновления
      this.invalidateCache()
      
      return updateResponse.data
    } catch (error) {
      logger.error('ThreeXUI', 'Ошибка обновления клиента', {
        inboundId,
        email,
        status: error.response?.status,
      }, error)
      
      // Если эндпоинт updateClient не поддерживается, используем fallback метод через update
      if (error.response?.status === 404 || error.response?.status === 405) {
        logger.warn('ThreeXUI', 'Использование fallback метода для обновления клиента', { inboundId, email })
        return this.updateClientFallback(inboundId, email, updates)
      }
      
      throw new Error(
        error.response?.data?.msg || 
        error.response?.data?.message ||
        error.message || 
        'Не удалось обновить клиента в 3x-ui'
      )
    }
  }

  /**
   * Fallback метод обновления клиента через обновление инбаунда
   * @private
   */
  async updateClientFallback(inboundId, email, updates = {}) {
    const inboundResponse = await this.api.get(`/panel/api/inbounds/get/${inboundId}`)
    const inboundPayload = inboundResponse.data
    const inbound = inboundPayload?.obj || inboundPayload

    if (!inbound) {
      throw new Error(`Инбаунд с ID ${inboundId} не найден`)
    }

    const clientIndex = inbound.clients?.findIndex((c) => c.email === email)
    if (clientIndex === -1 || clientIndex === undefined) {
      throw new Error(`Клиент с email ${email} не найден в этом инбаунде`)
    }

    // Обновляем клиента
    const updatedClients = [...inbound.clients]
    updatedClients[clientIndex] = {
      ...updatedClients[clientIndex],
      ...updates,
      id: updatedClients[clientIndex].id,
      email: email,
    }

    const updateResponse = await this.api.post(`/panel/api/inbounds/update/${inboundId}`, {
      ...inbound,
      clients: updatedClients,
    })

    return updateResponse.data
  }

  /**
   * Получение списка всех инбаундов
   * Использует официальный эндпоинт /panel/api/inbounds согласно документации 3x-ui
   * @returns {Promise<Array>} Массив инбаундов
   */
  async getInbounds() {
    try {
      await this.ensureAuthenticated()

      const response = await this.api.get('/panel/api/inbounds')
      const payload = response.data
      const inbounds = payload?.obj || payload || []
      return Array.isArray(inbounds) ? inbounds : []
    } catch (error) {
      logger.error('ThreeXUI', 'Ошибка получения списка инбаундов', null, error)
      throw new Error(
        error.response?.data?.msg || 
        error.response?.data?.message ||
        error.message || 
        'Не удалось получить список инбаундов'
      )
    }
  }

  /**
   * Получение информации об инбаунде по ID
   * Использует официальный эндпоинт /panel/api/inbounds/get/{id} согласно документации 3x-ui
   * @param {string|number} inboundId - ID инбаунда
   * @returns {Promise<Object>} Данные инбаунда
   */
  async getInbound(inboundId) {
    try {
      await this.ensureAuthenticated()

      const response = await this.api.get(`/panel/api/inbounds/get/${inboundId}`)
      const payload = response.data
      return payload?.obj || payload
    } catch (error) {
      logger.error('ThreeXUI', 'Ошибка получения инбаунда', { inboundId }, error)
      throw new Error(
        error.response?.data?.msg || 
        error.response?.data?.message ||
        error.message || 
        `Не удалось получить инбаунд с ID ${inboundId}`
      )
    }
  }

  /**
   * Получение клиента по email
   * Использует кеш для оптимизации поиска
   * @param {string} email - Email клиента
   * @returns {Promise<Object>} Объект с данными клиента и инбаунда
   */
  async getClientByEmail(email) {
    try {
      await this.ensureAuthenticated()

      // Обновляем кеш если нужно
      await this.refreshClientCache()

      // Ищем в кеше
      const cachedClient = this.clientsCache.get(email)
      if (cachedClient) {
        logger.debug('ThreeXUI', 'Клиент найден в кеше', { email })
        return {
          client: cachedClient,
          inbound: cachedClient.inbound
        }
      }

      // Если не найден в кеше, ищем напрямую (fallback)
      logger.debug('ThreeXUI', 'Клиент не найден в кеше, поиск напрямую', { email })
      const inbounds = await this.getInbounds()

      for (const inbound of inbounds) {
        if (inbound.clients && inbound.clients.length > 0) {
          const client = inbound.clients.find((c) => c.email === email)
          if (client) {
            // Обновляем кеш
            this.clientsCache.set(email, {
              ...client,
              inboundId: inbound.id,
              inboundTag: inbound.tag,
              inbound: inbound
            })
            return {
              client,
              inbound,
            }
          }
        }
      }

      throw new Error(`Клиент с email ${email} не найден`)
    } catch (error) {
      logger.error('ThreeXUI', 'Ошибка поиска клиента', { email }, error)
      throw new Error(
        error.response?.data?.msg || 
        error.response?.data?.message ||
        error.message || 
        'Не удалось найти клиента'
      )
    }
  }

  /**
   * Генерация UUID для VLESS ключа
   * @returns {string} UUID в формате xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  /**
   * Генерация уникального subId для 3x-ui
   * Формат: случайная буквенно-цифровая строка (base36: 0-9, a-z)
   * @returns {string} Уникальный subId (буквенно-цифровая строка, ~16 символов)
   */
  generateSubId() {
    // Формат 3x-ui: случайная строка из символов base36 (0-9, a-z)
    // Длина: ~16 символов (как в примере: "7vyrlrvx1aiwylh1")
    const length = 16
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
    let result = ''
    
    // Используем crypto.getRandomValues для криптографически стойкого генератора случайных чисел
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const randomValues = new Uint32Array(length)
      crypto.getRandomValues(randomValues)
      
      for (let i = 0; i < length; i++) {
        result += chars[randomValues[i] % chars.length]
      }
    } else {
      // Fallback для окружений без crypto API
      for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)]
      }
    }
    
    return result
  }

  /**
   * Создание VLESS конфигурации
   * @param {string} uuid - UUID клиента
   * @param {string} server - Адрес сервера (по умолчанию из переменных окружения или nl.skyputh.com)
   * @param {number} port - Порт (по умолчанию из переменных окружения или 443)
   * @param {Object} options - Дополнительные параметры VLESS
   * @param {string} options.sni - SNI (по умолчанию из переменных окружения)
   * @param {string} options.fingerprint - Fingerprint (по умолчанию из переменных окружения)
   * @param {string} options.publicKey - Public Key (по умолчанию из переменных окружения)
   * @param {string} options.shortId - Short ID (по умолчанию из переменных окружения)
   * @returns {string} VLESS конфигурация в формате URI
   */
  createVLESSConfig(uuid, server = null, port = null, options = {}) {
    // Получаем значения из параметров, затем из переменных окружения, затем значения по умолчанию
    const vlessServer = server || import.meta.env.VITE_VLESS_SERVER || 'nl.skyputh.com'
    const vlessPort = port || Number(import.meta.env.VITE_VLESS_PORT) || 443
    const vlessSNI = options.sni || import.meta.env.VITE_VLESS_SNI || 'www.microsoft.com'
    const vlessFingerprint = options.fingerprint || import.meta.env.VITE_VLESS_FINGERPRINT || 'chrome'
    const vlessPublicKey = options.publicKey || import.meta.env.VITE_VLESS_PUBLIC_KEY || 'your-public-key'
    const vlessShortId = options.shortId || import.meta.env.VITE_VLESS_SHORT_ID || 'your-short-id'
    
    return `vless://${uuid}@${vlessServer}:${vlessPort}?type=tcp&security=reality&sni=${vlessSNI}&fp=${vlessFingerprint}&pbk=${vlessPublicKey}&sid=${vlessShortId}#SkyPuth-VPN`
  }

  /**
   * Определение версии API автоматически
   * @private
   */
  async detectAPIVersion() {
    try {
      // Пробуем получить информацию о сервере (новый API)
      const response = await this.api.get('/server/status', {
        timeout: 5000
      })
      
      this.apiVersion = response.data?.obj?.xray?.version || 
                       response.data?.obj?.version || 
                       'unknown'
      this.useNewClientAPI = true
      
      logger.info('ThreeXUI', 'Версия API определена', {
        version: this.apiVersion,
        useNewAPI: this.useNewClientAPI
      })
    } catch (error) {
      if (error.response?.status === 404) {
        // Старая версия API - endpoint не существует
        this.apiVersion = 'legacy'
        this.useNewClientAPI = false
        logger.info('ThreeXUI', 'Используется legacy API (fallback методы)', {
          version: this.apiVersion
        })
      } else {
        // Другая ошибка - предполагаем новый API, но будем использовать fallback при необходимости
        this.apiVersion = 'unknown'
        this.useNewClientAPI = true
        logger.warn('ThreeXUI', 'Не удалось определить версию API, используем новый API', {
          error: error.message
        })
      }
    }
  }

  /**
   * Инициализация сервиса
   * Определяет версию API и проверяет авторизацию
   */
  async initialize() {
    try {
      await this.detectAPIVersion()
      await this.ensureAuthenticated()
      logger.info('ThreeXUI', 'Сервис инициализирован', {
        apiVersion: this.apiVersion,
        useNewAPI: this.useNewClientAPI
      })
    } catch (error) {
      logger.error('ThreeXUI', 'Ошибка инициализации сервиса', null, error)
      throw error
    }
  }
}

// Экспортируем singleton экземпляр через getInstance
const instance = ThreeXUI.getInstance()


export default instance

