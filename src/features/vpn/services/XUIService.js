/**
 * Упрощенный клиентский сервис для взаимодействия с Backend Proxy
 * Все сложные операции (Circuit Breaker, Rate Limiter, Login, Transactions)
 * теперь выполняются на Backend
 */

import axios from 'axios'
import xuiLogger from './XUILogger.js'
import logger from '../../../shared/utils/logger.js'

class XUIService {
  static instance = null

  constructor() {
    if (XUIService.instance) {
      return XUIService.instance
    }

    // Base URL для Backend Proxy
    // Используем относительный путь, чтобы Vite проксировал запросы
    // В vite.config.js настроен прокси /api/vpn → http://localhost:3001/api/vpn
    this.baseURL = '/api/vpn'
    
    // Упрощенный Axios instance - просто HTTP клиент
    this.api = axios.create({
      baseURL: this.baseURL,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 секунд
    })

    // Настройка перехватчиков для логирования
    this.setupInterceptors()

    XUIService.instance = this
  }

  static getInstance() {
    if (!XUIService.instance) {
      XUIService.instance = new XUIService()
    }
    return XUIService.instance
  }

  /**
   * Настройка перехватчиков axios для логирования
   * @private
   */
  setupInterceptors() {
    this.api.interceptors.request.use(
      (config) => {
        const interactionId = xuiLogger.logRequest(
          config.method || 'GET',
          config.url || '',
          {
            url: config.url,
            baseURL: config.baseURL,
            fullURL: `${config.baseURL}${config.url}`,
            headers: config.headers,
            params: config.params,
            data: config.data,
          }
        )
        
        config.metadata = config.metadata || {}
        config.metadata.interactionId = interactionId
        
        return config
      },
      (error) => {
        xuiLogger.logError(null, error)
        return Promise.reject(error)
      }
    )

    this.api.interceptors.response.use(
      (response) => {
        const interactionId = response.config?.metadata?.interactionId
        if (interactionId) {
          xuiLogger.logResponse(interactionId, response)
        }
        return response
      },
      (error) => {
        const interactionId = error.config?.metadata?.interactionId
        if (interactionId) {
          xuiLogger.logError(interactionId, error)
        } else {
          xuiLogger.logError(null, error)
        }
        return Promise.reject(error)
      }
    )
  }

  /**
   * Health check для проверки доступности Proxy
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    try {
      const response = await this.api.get('/health', { timeout: 5000 })
      return {
        status: 'ok',
        proxy: true,
        data: response.data,
      }
    } catch (error) {
      logger.error('XUIService', 'Health check failed', null, error)
      return {
        status: 'error',
        proxy: false,
        error: error.message,
      }
    }
  }

  /**
   * Добавление клиента через Proxy
   * Backend выполняет транзакцию: Firestore → 3x-ui → Firestore (с rollback)
   * 
   * @param {Object} data - Данные клиента
   * @param {string} data.userId - ID пользователя в Firestore
   * @param {string} data.email - Email клиента
   * @param {string|number} data.inboundId - ID инбаунда
   * @param {number} data.totalGB - Лимит трафика в GB (0 = безлимит)
   * @param {number} data.expiryTime - Дата истечения в миллисекундах (0 = без ограничений)
   * @param {number} data.limitIp - Лимит IP адресов (0 = без ограничений)
   * @param {string} data.webhookUrl - Webhook URL из Firestore настроек (опционально)
   * @returns {Promise<Object>} Ответ от Proxy с vpnUuid и inboundId
   */
  async addClient(data) {
    try {
      // КРИТИЧНО: Проверка наличия clientId
      if (!data.clientId || data.clientId.trim() === '') {
        console.error('❌ XUIService.addClient: Отсутствует clientId!')
        console.error('📋 Полученные данные (userData):', JSON.stringify(data, null, 2))
        console.error('📋 Детальная информация о данных:', {
          hasClientId: !!data.clientId,
          clientId: data.clientId,
          clientIdType: typeof data.clientId,
          clientIdLength: data.clientId ? data.clientId.length : 0,
          allKeys: Object.keys(data),
          userId: data.userId,
          email: data.email,
          inboundId: data.inboundId,
        })
        throw new Error('Отсутствует clientId. Проверьте, что user.uuid передается в запрос.')
      }

      logger.info('XUIService', 'Добавление клиента через Proxy', {
        userId: data.userId,
        email: data.email,
        inboundId: data.inboundId,
        clientId: data.clientId,
        hasWebhookUrl: !!data.webhookUrl,
      })

      // Настраиваем заголовки для передачи webhook URL из Firestore
      const config = {
        headers: {},
      }
      if (data.webhookUrl && data.webhookUrl.trim()) {
        config.headers['X-N8N-Webhook-Url'] = data.webhookUrl.trim()
        logger.info('XUIService', 'Передача webhook URL из Firestore', { webhookUrl: data.webhookUrl.trim() })
      }

      const response = await this.api.post('/add-client', data, config)
      
      logger.info('XUIService', 'Клиент успешно добавлен', {
        userId: data.userId,
        email: data.email,
        vpnUuid: response.data.vpnUuid,
      })

      return response.data
    } catch (error) {
      logger.error('XUIService', 'Ошибка добавления клиента', {
        userId: data.userId,
        email: data.email,
        errorStatus: error.response?.status,
        errorData: error.response?.data,
      }, error)
      
      // Улучшенная обработка ошибок с понятными сообщениями
      let errorMessage = error.message || 'Не удалось добавить клиента'
      
      if (error.response?.status === 500 || error.response?.status === 400) {
        const errorData = error.response?.data
        
        // Сначала проверяем errorMessage (новый формат от n8n)
        if (errorData?.errorMessage) {
          errorMessage = errorData.errorMessage
          
          // Если это ошибка конфигурации workflow, добавляем инструкции
          if (errorMessage.includes('Unused Respond to Webhook')) {
            errorMessage = errorMessage + '\n\n' +
              '📖 Подробная инструкция по исправлению: см. файл N8N_WORKFLOW_SETUP.md в корне проекта'
          }
        } else if (errorData?.error || errorData?.msg) {
          const n8nError = errorData.error || errorData.msg
          
          // Проверяем, является ли это ошибкой незарегистрированного webhook
          if (n8nError.includes('not registered') || n8nError.includes('not found')) {
            errorMessage = `Webhook не зарегистрирован в n8n. Проверьте, что workflow активен и webhook настроен правильно. Детали: ${n8nError}`
          } else {
            errorMessage = `Ошибка на стороне n8n: ${n8nError}`
          }
        } else {
          errorMessage = 'Внутренняя ошибка сервера (500). Проверьте логи n8n и backend proxy.'
        }
      } else if (error.response?.status === 404) {
        errorMessage = 'Webhook не найден. Проверьте правильность N8N_WEBHOOK_ID и что workflow активен в n8n.'
      } else if (error.response?.data?.errorMessage) {
        // Ошибка от n8n с детальным сообщением
        errorMessage = error.response.data.errorMessage
        
        // Если это ошибка конфигурации workflow, добавляем инструкции
        if (errorMessage.includes('Unused Respond to Webhook')) {
          errorMessage = errorMessage + '\n\n' +
            '📖 Подробная инструкция по исправлению: см. файл N8N_WORKFLOW_SETUP.md в корне проекта'
        }
        
        // Если есть детали, добавляем их
        if (error.response.data.errorDetails) {
          errorMessage += `\n\nДетали: ${JSON.stringify(error.response.data.errorDetails, null, 2)}`
        }
      } else if (error.response?.data?.error || error.response?.data?.msg) {
        errorMessage = error.response.data.error || error.response.data.msg
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Не удалось подключиться к backend proxy. Убедитесь, что сервер запущен на http://localhost:3001'
      }
      
      throw new Error(errorMessage)
    }
  }

  /**
   * Удаление клиента через Proxy
   * 
   * @param {Object} data - Данные для удаления
   * @param {string|number} data.inboundId - ID инбаунда
   * @param {string} data.email - Email клиента
   * @param {string} data.webhookUrl - Webhook URL из Firestore настроек (опционально)
   * @returns {Promise<Object>} Ответ от Proxy
   */
  async deleteClient(data) {
    try {
      logger.info('XUIService', 'Удаление клиента через Proxy', {
        email: data.email,
        inboundId: data.inboundId,
        hasWebhookUrl: !!data.webhookUrl,
      })

      // Настраиваем заголовки для передачи webhook URL из Firestore
      const config = {
        headers: {},
      }
      if (data.webhookUrl && data.webhookUrl.trim()) {
        config.headers['X-N8N-Webhook-Url'] = data.webhookUrl.trim()
        logger.info('XUIService', 'Передача webhook URL из Firestore', { webhookUrl: data.webhookUrl.trim() })
      }

      const response = await this.api.post('/delete-client', data, config)
      
      logger.info('XUIService', 'Клиент успешно удален', {
        email: data.email,
      })

      return response.data
    } catch (error) {
      logger.error('XUIService', 'Ошибка удаления клиента', {
        email: data.email,
        inboundId: data.inboundId,
        errorStatus: error.response?.status,
        errorData: error.response?.data,
      }, error)
      
      // Улучшенная обработка ошибок с понятными сообщениями
      let errorMessage = error.message || 'Не удалось удалить клиента'
      
      if (error.response?.status === 500) {
        const errorData = error.response?.data
        if (errorData?.error || errorData?.msg) {
          const n8nError = errorData.error || errorData.msg
          
          // Проверяем специфические ошибки n8n
          if (n8nError.includes('Unused Respond to Webhook')) {
            errorMessage = 'Ошибка настройки workflow в n8n: обнаружен неиспользуемый узел "Respond to Webhook". Проверьте настройку workflow для удаления клиента.'
          } else if (n8nError.includes('not registered') || n8nError.includes('not found')) {
            errorMessage = `Webhook не зарегистрирован в n8n. Проверьте, что workflow для удаления клиента активен и webhook настроен правильно. Детали: ${n8nError}`
          } else {
            errorMessage = `Ошибка на стороне n8n: ${n8nError}`
          }
        } else {
          errorMessage = 'Внутренняя ошибка сервера (500). Проверьте логи n8n и backend proxy.'
        }
      } else if (error.response?.status === 404) {
        errorMessage = 'Webhook для удаления клиента не найден. Проверьте правильность N8N_WEBHOOK_DELETE_CLIENT и что workflow активен в n8n.'
      } else if (error.response?.data?.error || error.response?.data?.msg) {
        errorMessage = error.response.data.error || error.response.data.msg
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Не удалось подключиться к backend proxy. Убедитесь, что сервер запущен на http://localhost:3001'
      }
      
      throw new Error(errorMessage)
    }
  }

  /**
   * Получение статистики клиента через Proxy
   * 
   * @param {Object} data - Данные для запроса
   * @param {string} data.email - Email клиента
   * @param {string} data.userId - ID пользователя (опционально)
   * @param {string} data.userUuid - UUID профиля (опционально)
   * @returns {Promise<Object>} Статистика клиента
   */
  async getClientStats(data) {
    try {
      // Добавляем маркировку операции, если не указана
      const requestData = {
        ...data,
        ...(data.operation ? {} : {
          operation: 'get_client_stats',
          category: 'get_user_data',
          timestamp: new Date().toISOString(),
        }),
      }
      
      const response = await this.api.post('/client-stats', requestData)
      return response.data
    } catch (error) {
      logger.error('XUIService', 'Ошибка получения статистики клиента', {
        email: data.email,
      }, error)
      
      throw new Error(
        error.response?.data?.msg || 
        error.response?.data?.error ||
        error.message || 
        'Не удалось получить статистику клиента'
      )
    }
  }

  /**
   * Получение списка инбаундов через Proxy
   * 
   * @returns {Promise<Array>} Массив инбаундов
   */
  async getInbounds() {
    try {
      // Добавляем маркировку операции в query параметры
      const response = await this.api.get('/inbounds', {
        params: {
          operation: 'get_inbounds',
          category: 'get_server_data',
          timestamp: new Date().toISOString(),
        }
      })
      return response.data.inbounds || []
    } catch (error) {
      logger.error('XUIService', 'Ошибка получения списка инбаундов', null, error)
      
      throw new Error(
        error.response?.data?.msg || 
        error.response?.data?.error ||
        error.message || 
        'Не удалось получить список инбаундов'
      )
    }
  }

  /**
   * Получение инбаунда по ID через Proxy
   * 
   * @param {string|number} inboundId - ID инбаунда
   * @returns {Promise<Object>} Данные инбаунда
   */
  async getInbound(inboundId) {
    try {
      // Добавляем маркировку операции в query параметры
      const response = await this.api.get(`/inbounds/${inboundId}`, {
        params: {
          operation: 'get_inbound',
          category: 'get_server_data',
          timestamp: new Date().toISOString(),
        }
      })
      return response.data.inbound
    } catch (error) {
      logger.error('XUIService', 'Ошибка получения инбаунда', { inboundId }, error)
      
      throw new Error(
        error.response?.data?.msg || 
        error.response?.data?.error ||
        error.message || 
        `Не удалось получить инбаунд с ID ${inboundId}`
      )
    }
  }

  /**
   * Получение истории взаимодействий (из XUILogger)
   * @param {Object} filters - Фильтры
   * @returns {Array}
   */
  getHistory(filters = {}) {
    return xuiLogger.getHistory(filters)
  }

  /**
   * Получение метрик (из XUILogger)
   * @returns {Object}
   */
  getMetrics() {
    return xuiLogger.getMetrics()
  }

  /**
   * Генерация UUID (утилита, не требует backend)
   * @returns {string}
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }
}

export default XUIService
