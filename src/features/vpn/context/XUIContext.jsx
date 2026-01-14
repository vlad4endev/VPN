/**
 * Context и Provider для глобального доступа к XUIService
 * Упрощенная версия - работает через Backend Proxy
 */

import { createContext, useEffect, useState, useCallback } from 'react'
import XUIService from '../services/XUIService.js'
import xuiLogger from '../services/XUILogger.js'
import logger from '../../../shared/utils/logger.js'

export const XUIContext = createContext(null)

/**
 * Provider для XUIService
 * Инициализирует сервис через healthCheck к Proxy
 */
export function XUIProvider({ children }) {
  const [service, setService] = useState(null)
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState(null)

  // Инициализация сервиса через healthCheck
  useEffect(() => {
    const initService = async () => {
      try {
        const xuiService = XUIService.getInstance()
        
        // Простой healthCheck вместо полной инициализации
        const health = await xuiService.healthCheck()
        
        if (health.status === 'ok' && health.proxy) {
          setService(xuiService)
          setInitialized(true)
          setError(null)
          logger.info('XUIProvider', 'XUIService инициализирован через Proxy', {
            proxyUrl: xuiService.baseURL,
          })
        } else {
          throw new Error(health.error || 'Proxy недоступен')
        }
      } catch (err) {
        logger.error('XUIProvider', 'Ошибка инициализации XUIService', null, err)
        setError(err.message)
        setInitialized(false)
        // Не устанавливаем service, чтобы компоненты могли обработать ошибку
      }
    }

    initService()
  }, [])

  // Методы для работы с сервисом
  const addClient = useCallback(async (data) => {
    if (!service) throw new Error('XUIService не инициализирован')
    return service.addClient(data)
  }, [service])

  const deleteClient = useCallback(async (data) => {
    if (!service) throw new Error('XUIService не инициализирован')
    return service.deleteClient(data)
  }, [service])

  const getInbounds = useCallback(async () => {
    if (!service) throw new Error('XUIService не инициализирован')
    return service.getInbounds()
  }, [service])

  const getInbound = useCallback(async (inboundId) => {
    if (!service) throw new Error('XUIService не инициализирован')
    return service.getInbound(inboundId)
  }, [service])

  const getClientStats = useCallback(async (data) => {
    if (!service) throw new Error('XUIService не инициализирован')
    return service.getClientStats(data)
  }, [service])

  const healthCheck = useCallback(async () => {
    if (!service) throw new Error('XUIService не инициализирован')
    return service.healthCheck()
  }, [service])

  const getHistory = useCallback((filters = {}) => {
    return xuiLogger.getHistory(filters)
  }, [])

  const getMetrics = useCallback(() => {
    return xuiLogger.getMetrics()
  }, [])

  const generateUUID = useCallback(() => {
    if (!service) throw new Error('XUIService не инициализирован')
    return service.generateUUID()
  }, [service])

  const value = {
    service,
    initialized,
    error,
    // API методы (упрощенные - работают через Proxy)
    addClient,
    deleteClient,
    getInbounds,
    getInbound,
    getClientStats,
    healthCheck,
    // Логирование и метрики
    getHistory,
    getMetrics,
    // Утилиты
    generateUUID,
  }

  return (
    <XUIContext.Provider value={value}>
      {children}
    </XUIContext.Provider>
  )
}

export default XUIProvider
