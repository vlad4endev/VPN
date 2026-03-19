/**
 * Система логирования для VPN приложения
 * Поддерживает уровни: debug, info, warn, error
 * Сохраняет логи в памяти и предоставляет API для их просмотра
 */

class Logger {
  constructor() {
    this.logs = []
    this.maxLogs = 1000 // Максимальное количество логов в памяти
    this.listeners = new Set()
    // По умолчанию используем 'debug' для разработки, чтобы видеть все логи
    // В продакшене можно установить через VITE_LOG_LEVEL=info или VITE_LOG_LEVEL=warn
    this.logLevel = import.meta.env.VITE_LOG_LEVEL || 'debug' // debug, info, warn, error
    
    // Уровни логирования (от меньшего к большему)
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    }

    // Выводим тестовый лог при инициализации
    console.log('%c📝 Система логирования инициализирована', 'color: #10b981; font-weight: bold; font-size: 14px', {
      logLevel: this.logLevel,
      maxLogs: this.maxLogs,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Проверяет, нужно ли логировать сообщение данного уровня
   * @param {string} level - Уровень логирования
   * @returns {boolean}
   */
  shouldLog(level) {
    const currentLevel = this.levels[this.logLevel] || 1
    const messageLevel = this.levels[level] || 1
    return messageLevel >= currentLevel
  }

  /**
   * Добавляет лог в хранилище
   * @param {string} level - Уровень логирования
   * @param {string} category - Категория (например, 'ThreeXUI', 'Firebase', 'Auth')
   * @param {string} message - Сообщение
   * @param {Object} data - Дополнительные данные
   * @param {Error} error - Объект ошибки (если есть)
   */
  addLog(level, category, message, data = null, error = null) {
    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data ? this.sanitizeData(data) : null,
      error: error ? this.formatError(error) : null,
      stack: error?.stack || null,
    }

    // Ключевое: консольный вывод делаем всегда (даже если в хранилище не попадает),
    // чтобы "всё видеть" при отладке.
    this.logToConsole(level, category, message, data, error)

    if (this.shouldLog(level)) {
      // Добавляем в начало массива (новые логи сверху)
      this.logs.unshift(logEntry)

      // Ограничиваем количество логов
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(0, this.maxLogs)
      }

      // Уведомляем подписчиков только если лог действительно попал в хранилище
      this.notifyListeners(logEntry)
    }
  }

  /**
   * Очищает чувствительные данные из объекта
   * @param {Object} data - Данные для очистки
   * @returns {Object} Очищенные данные
   */
  sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data
    }

    const sensitiveKeys = ['password', 'passwordHash', 'token', 'apiKey', 'secret', 'key']
    const sanitized = { ...data }

    for (const key in sanitized) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = '***REDACTED***'
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeData(sanitized[key])
      }
    }

    return sanitized
  }

  /**
   * Форматирует объект ошибки для логирования
   * @param {Error} error - Объект ошибки
   * @returns {Object} Форматированная ошибка
   */
  formatError(error) {
    if (!error) return null

    return {
      name: error.name,
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: this.sanitizeData(error.response.data),
      } : null,
    }
  }

  /**
   * Выводит лог в консоль браузера
   * ВАЖНО: Этот метод всегда вызывается, даже если shouldLog вернул false
   * Это позволяет видеть все логи в консоли для отладки
   */
  logToConsole(level, category, message, data, error) {
    const prefix = `[${category}]`
    const fullMessage = `${prefix} ${message}`

    // Форматируем данные для консоли
    let consoleData = null
    if (data) {
      if (typeof data === 'object') {
        try {
          consoleData = JSON.stringify(data, null, 2)
        } catch (e) {
          consoleData = String(data)
        }
      } else {
        consoleData = data
      }
    }
    
    const consoleError = error ? (error.stack || error.message || error) : null

    // Всегда выводим логи в консоль для отладки
    switch (level) {
      case 'debug':
        if (consoleData || consoleError) {
          console.debug(`%c${fullMessage}`, 'color: #6b7280; font-style: italic', consoleData || '', consoleError || '')
        } else {
          console.debug(`%c${fullMessage}`, 'color: #6b7280; font-style: italic')
        }
        break
      case 'info':
        // Для info используем обычный console.log с цветом
        if (consoleData || consoleError) {
          console.log(`%c${fullMessage}`, 'color: #3b82f6; font-weight: bold', consoleData || '', consoleError || '')
        } else {
          console.log(`%c${fullMessage}`, 'color: #3b82f6; font-weight: bold')
        }
        break
      case 'warn':
        if (consoleData || consoleError) {
          console.warn(fullMessage, consoleData || '', consoleError || '')
        } else {
          console.warn(fullMessage)
        }
        break
      case 'error':
        // Для ошибок всегда выводим полную информацию
        console.group(`%c${fullMessage}`, 'color: red; font-weight: bold')
        if (consoleData) {
          console.log('%cData:', 'color: orange; font-weight: bold', consoleData)
        }
        if (consoleError) {
          console.error('%cError:', 'color: red; font-weight: bold', consoleError)
        }
        if (error && error.stack) {
          console.log('%cStack:', 'color: gray; font-weight: bold', error.stack)
        }
        console.groupEnd()
        break
      default:
        if (consoleData || consoleError) {
          console.log(fullMessage, consoleData || '', consoleError || '')
        } else {
          console.log(fullMessage)
        }
    }
  }

  /**
   * Уведомляет всех подписчиков о новом логе
   * @param {Object} logEntry - Запись лога
   */
  notifyListeners(logEntry) {
    this.listeners.forEach(listener => {
      try {
        listener(logEntry)
      } catch (err) {
        console.error('Ошибка в слушателе логов:', err)
      }
    })
  }

  /**
   * Подписывается на новые логи
   * @param {Function} callback - Функция обратного вызова
   * @returns {Function} Функция для отписки
   */
  subscribe(callback) {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  /**
   * Логирование уровня DEBUG
   */
  debug(category, message, data = null) {
    this.addLog('debug', category, message, data)
  }

  /**
   * Логирование уровня INFO
   */
  info(category, message, data = null) {
    this.addLog('info', category, message, data)
  }

  /**
   * Логирование уровня WARN
   */
  warn(category, message, data = null, error = null) {
    this.addLog('warn', category, message, data, error)
  }

  /**
   * Логирование уровня ERROR
   */
  error(category, message, data = null, error = null) {
    this.addLog('error', category, message, data, error)
  }

  /**
   * Получает все логи
   * @param {Object} filters - Фильтры для логов
   * @param {string} filters.level - Фильтр по уровню
   * @param {string} filters.category - Фильтр по категории
   * @param {string} filters.search - Поиск по тексту
   * @returns {Array} Массив логов
   */
  getLogs(filters = {}) {
    let filtered = [...this.logs]

    if (filters.level) {
      filtered = filtered.filter(log => log.level === filters.level)
    }

    if (filters.category) {
      filtered = filtered.filter(log => log.category === filters.category)
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower)) ||
        (log.error && JSON.stringify(log.error).toLowerCase().includes(searchLower))
      )
    }

    return filtered
  }

  /**
   * Получает статистику логов
   * @returns {Object} Статистика
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      },
      byCategory: {},
      latestError: null,
    }

    this.logs.forEach(log => {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1
      
      if (log.level === 'error' && !stats.latestError) {
        stats.latestError = log
      }
    })

    return stats
  }

  /**
   * Очищает все логи
   */
  clear() {
    this.logs = []
    this.notifyListeners({ type: 'clear' })
  }

  /**
   * Вставка внешних логов (например, серверных) в текущее хранилище логов.
   * Не применяет shouldLog(level): если админ запросил "детально", считаем что
   * эти логи надо показывать.
   *
   * @param {Array<{id?: any, timestamp?: string, level?: string, category?: string, message?: string, data?: any, error?: any, stack?: string}>} entries
   */
  ingestLogs(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return

    // entries возвращаются сервером как oldest->newest, чтобы корректно сформировать "новые сверху".
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i] || {}
      this.logs.unshift({
        id: e.id != null ? String(e.id) : (Date.now() + Math.random()).toString(),
        timestamp: e.timestamp ? String(e.timestamp) : new Date().toISOString(),
        level: e.level ? String(e.level).toLowerCase() : 'info',
        category: e.category ? String(e.category).slice(0, 64) : 'system',
        message: e.message ? String(e.message) : '',
        data: e.data !== undefined ? this.sanitizeData(e.data) : null,
        error: e.error !== undefined ? this.sanitizeData(e.error) : null,
        stack: e.stack ? String(e.stack) : null,
      })
    }

    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs)
    }

    this.notifyListeners({ type: 'ingested', count: entries.length })
  }

  /**
   * Экспортирует логи в JSON
   * @param {Object} filters - Фильтры для экспорта
   * @returns {string} JSON строка
   */
  exportJSON(filters = {}) {
    const logs = this.getLogs(filters)
    return JSON.stringify(logs, null, 2)
  }

  /**
   * Экспортирует логи в текстовый формат
   * @param {Object} filters - Фильтры для экспорта
   * @returns {string} Текстовая строка
   */
  exportText(filters = {}) {
    const logs = this.getLogs(filters)
    return logs.map(log => {
      const time = new Date(log.timestamp).toLocaleString('ru-RU')
      let line = `[${time}] [${log.level.toUpperCase()}] [${log.category}] ${log.message}`
      
      if (log.data) {
        line += `\n  Data: ${JSON.stringify(log.data, null, 2)}`
      }
      
      if (log.error) {
        line += `\n  Error: ${JSON.stringify(log.error, null, 2)}`
      }
      
      if (log.stack) {
        line += `\n  Stack: ${log.stack}`
      }
      
      return line
    }).join('\n\n')
  }

  /**
   * Устанавливает уровень логирования
   * @param {string} level - Новый уровень (debug, info, warn, error)
   */
  setLogLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.logLevel = level
      this.info('Logger', `Уровень логирования изменен на: ${level}`)
    }
  }

  /**
   * Получает текущий уровень логирования
   * @returns {string}
   */
  getLogLevel() {
    return this.logLevel
  }
}

// Экспортируем singleton экземпляр
export default new Logger()

