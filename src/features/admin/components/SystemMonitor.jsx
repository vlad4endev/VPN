/**
 * System Monitor Component
 * Displays system metrics, response time chart, logs terminal, and module restart functionality
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Activity, Cpu, HardDrive, Wifi, AlertCircle, CheckCircle2, XCircle, Trash2, Filter, RefreshCw, Server, Database, Zap, Loader2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import axios from 'axios'
import logger from '../../../shared/utils/logger.js'

const SystemMonitor = () => {
  const [status, setStatus] = useState(null)
  const [logs, setLogs] = useState([])
  const [logFilter, setLogFilter] = useState('all') // 'all' | 'info' | 'warn' | 'error'
  const [responseTimeHistory, setResponseTimeHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [restartingModule, setRestartingModule] = useState(null) // ID модуля, который перезапускается
  const [clientStatus, setClientStatus] = useState(null) // Статус клиента (браузер)
  const [success, setSuccess] = useState(null) // Сообщение об успехе
  const logsEndRef = useRef(null)
  const maxHistoryPoints = 30 // Последние 30 точек для графика

  // API URL для мониторинга (можно использовать переменную окружения)
  const apiUrl = import.meta.env.VITE_MONITORING_API_URL || import.meta.env.VITE_PROXY_URL || window.location.origin
  const monitoringEnabled = import.meta.env.VITE_ENABLE_MONITORING !== 'false'

  // Получение статуса клиента (браузер)
  const getClientStatus = useCallback(() => {
    try {
      const perfData = performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      } : null

      return {
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        language: navigator.language,
        onLine: navigator.onLine,
        cookieEnabled: navigator.cookieEnabled,
        memory: perfData,
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          availWidth: window.screen.availWidth,
          availHeight: window.screen.availHeight,
        },
        connection: navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt,
          saveData: navigator.connection.saveData,
        } : null,
        timestamp: Date.now(),
      }
    } catch (err) {
      logger.error('SystemMonitor', 'Ошибка получения статуса клиента', null, err)
      return null
    }
  }, [])

  // Fetch system status from server API
  const fetchStatus = useCallback(async () => {
    if (!monitoringEnabled) {
      // Если мониторинг отключен, используем только статус клиента
      setClientStatus(getClientStatus())
      setLoading(false)
      return
    }

    try {
      const response = await axios.get(`${apiUrl}/api/system/status`, {
        timeout: 5000,
        validateStatus: () => true, // Не бросать ошибку на любой статус
      })

      if (response.status === 200 && response.data.success) {
        const data = response.data.data

        // Update response time history
        if (data.xui?.responseTime) {
          setResponseTimeHistory((prev) => {
            const newHistory = [
              ...prev,
              {
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                latency: data.xui.responseTime,
                timestamp: Date.now(),
              },
            ]
            // Keep only last maxHistoryPoints
            return newHistory.slice(-maxHistoryPoints)
          })
        }

        setStatus(data)
        setError(null)
      } else {
        // Если API недоступен, используем статус клиента
        setClientStatus(getClientStatus())
        setStatus(null)
      }
    } catch (err) {
      // Если ошибка - используем статус клиента
      logger.warn('SystemMonitor', 'API недоступен, используем статус клиента', null, err)
      setClientStatus(getClientStatus())
      setStatus(null)
      // Не показываем ошибку, так как используем клиентский статус
      if (!error) {
        setError(null) // Очищаем ошибку, если используем клиентский статус
      }
    } finally {
      setLoading(false)
    }
  }, [apiUrl, monitoringEnabled, getClientStatus, error])

  // Fetch logs from server API
  const fetchLogs = useCallback(async () => {
    if (!monitoringEnabled) {
      // Если мониторинг отключен, не загружаем логи
      return
    }

    try {
      const response = await axios.get(`${apiUrl}/api/system/logs`, {
        params: {
          limit: 100,
          level: logFilter === 'all' ? 'all' : logFilter,
          since: 60 * 60 * 1000, // 1 hour
        },
        timeout: 5000,
        validateStatus: () => true, // Не бросать ошибку на любой статус
      })

      if (response.status === 200 && response.data.success) {
        setLogs(response.data.data.logs || [])
      }
    } catch (err) {
      logger.warn('SystemMonitor', 'Ошибка получения логов', null, err)
      // Не показываем ошибку, просто не обновляем логи
    }
  }, [apiUrl, logFilter, monitoringEnabled])

  // Restart module
  const restartModule = useCallback(async (moduleId) => {
    if (!monitoringEnabled) {
      setError('Мониторинг отключен. Перезагрузка модулей недоступна.')
      return
    }

    setRestartingModule(moduleId)
    setError(null)

    try {
      const response = await axios.post(`${apiUrl}/api/system/restart/${moduleId}`, {}, {
        timeout: 10000,
        validateStatus: () => true,
      })

      if (response.status === 200 && response.data.success) {
        logger.info('SystemMonitor', `Модуль ${moduleId} перезапущен`, { moduleId })
        setSuccess(`Модуль ${moduleId} успешно перезапущен`)
        setTimeout(() => setSuccess(null), 3000)
        // Обновляем статус после перезагрузки
        setTimeout(() => {
          fetchStatus()
        }, 2000)
      } else {
        throw new Error(response.data.message || 'Не удалось перезапустить модуль')
      }
    } catch (err) {
      logger.error('SystemMonitor', `Ошибка перезагрузки модуля ${moduleId}`, { moduleId }, err)
      setError(`Ошибка перезагрузки модуля ${moduleId}: ${err.message || 'Неизвестная ошибка'}`)
    } finally {
      setRestartingModule(null)
    }
  }, [apiUrl, monitoringEnabled, fetchStatus])

  // Initial load
  useEffect(() => {
    fetchStatus()
    fetchLogs()
    setClientStatus(getClientStatus())
  }, [fetchStatus, fetchLogs, getClientStatus])

  // Polling every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus()
      fetchLogs()
      setClientStatus(getClientStatus()) // Обновляем статус клиента
    }, 5000)

    return () => clearInterval(interval)
  }, [fetchStatus, fetchLogs, getClientStatus])

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Clear logs
  const handleClearLogs = useCallback(() => {
    setLogs([])
    logger.info('SystemMonitor', 'Логи очищены')
  }, [])

  // Get status color
  const getStatusColor = (connected) => {
    return connected ? 'text-green-400' : 'text-red-400'
  }

  // Get status icon
  const getStatusIcon = (connected) => {
    return connected ? CheckCircle2 : XCircle
  }

  // Format log level color
  const getLogLevelColor = (level) => {
    switch (level) {
      case 'error':
        return 'text-red-400'
      case 'warn':
        return 'text-yellow-400'
      case 'info':
        return 'text-blue-400'
      default:
        return 'text-slate-400'
    }
  }

  // Format log level badge
  const getLogLevelBadge = (level) => {
    const colors = {
      error: 'bg-red-900/30 text-red-400 border-red-800',
      warn: 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
      info: 'bg-blue-900/30 text-blue-400 border-blue-800',
      pending: 'bg-slate-800 text-slate-400 border-slate-700',
    }
    return colors[level] || colors.pending
  }

  // Format bytes
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  // Modules list (можно расширить)
  const modules = [
    { id: 'app', name: 'Приложение', icon: Server, description: 'Основное приложение' },
    { id: 'api', name: 'API', icon: Database, description: 'API сервер' },
    { id: 'vpn', name: 'VPN Сервис', icon: Zap, description: 'VPN сервис и интеграция с 3x-ui' },
    { id: 'proxy', name: 'Прокси', icon: Wifi, description: 'Прокси сервер' },
  ]

  if (loading && !status && !clientStatus) {
    return (
      <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl section-spacing-sm border border-slate-800">
        <div className="flex items-center justify-center h-48 sm:h-64">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <div className="text-slate-400 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">Загрузка метрик системы...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5 md:space-y-6">
      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-900/30 border border-green-800 rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
          <div className="text-green-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{success}</div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="text-red-300 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{error}</div>
        </div>
      )}

      {/* Server Status Card - Mobile First */}
      <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl section-spacing-sm border border-slate-800">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 flex-shrink-0" />
            <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200">Состояние сервера</h3>
          </div>
          {status && (() => {
            const Icon = getStatusIcon(status.connected !== false)
            return <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${getStatusColor(status.connected !== false)} flex-shrink-0`} />
          })()}
        </div>
        <div className="space-y-2">
          {status ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Статус API</span>
                <span className={`font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] ${getStatusColor(status.connected !== false)}`}>
                  {status.connected !== false ? 'Доступен' : 'Недоступен'}
                </span>
              </div>
              {status.uptime && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Uptime</span>
                  <span className="text-slate-200 font-mono text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">
                    {status.uptime.formatted || status.uptime}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">
              {monitoringEnabled ? 'API сервера недоступен. Показывается статус клиента.' : 'Мониторинг сервера отключен.'}
            </div>
          )}
          {clientStatus && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Клиент (браузер)</span>
                <span className={`font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] ${getStatusColor(clientStatus.onLine)}`}>
                  {clientStatus.onLine ? 'Онлайн' : 'Офлайн'}
                </span>
              </div>
              {clientStatus.memory && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Память браузера</span>
                  <span className="text-slate-200 font-mono text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">
                    {formatBytes(clientStatus.memory.usedJSHeapSize)} / {formatBytes(clientStatus.memory.totalJSHeapSize)}
                  </span>
                </div>
              )}
              {clientStatus.connection && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Соединение</span>
                  <span className="text-slate-200 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">
                    {clientStatus.connection.effectiveType} ({clientStatus.connection.downlink} Mbps)
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Info Cards Grid - Mobile First */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Status Card - Mobile First */}
        <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl section-spacing-sm border border-slate-800">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 flex-shrink-0" />
              <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200">3x-ui</h3>
            </div>
            {status?.xui && (() => {
              const Icon = getStatusIcon(status.xui.connected)
              return <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${getStatusColor(status.xui.connected)} flex-shrink-0`} />
            })()}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Подключение</span>
              <span className={`font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] ${getStatusColor(status?.xui?.connected)}`}>
                {status?.xui?.connected ? 'Подключено' : status?.xui ? 'Отключено' : 'Н/Д'}
              </span>
            </div>
            {status?.xui?.responseTime && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Время ответа</span>
                <span className="text-slate-200 font-mono text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">{status.xui.responseTime}ms</span>
              </div>
            )}
            {status?.xui?.error && (
              <div className="text-red-400 text-xs mt-2">{status.xui.error}</div>
            )}
          </div>
        </div>

        {/* CPU Card - Mobile First */}
        <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl section-spacing-sm border border-slate-800">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 flex-shrink-0" />
              <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200">CPU</h3>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Использование</span>
              <span className="text-slate-200 font-semibold text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg">
                {status?.cpu?.usage?.toFixed(1) || 'N/A'}%
              </span>
            </div>
            {status?.cpu?.usage !== undefined ? (
              <>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                      status.cpu.usage > 80 ? 'bg-red-500' : status.cpu.usage > 50 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                    style={{ width: `${Math.min(status.cpu.usage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs text-slate-500">
                  <span>Ядер: {status.cpu.cores || 'N/A'}</span>
                  <span>Load: {status.cpu.load?.toFixed(2) || 'N/A'}</span>
            </div>
              </>
            ) : (
              <div className="text-slate-500 text-xs">Метрики недоступны</div>
            )}
          </div>
        </div>

        {/* RAM Card - Mobile First */}
        <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl section-spacing-sm border border-slate-800">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 flex-shrink-0" />
              <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200">RAM</h3>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Использование</span>
              <span className="text-slate-200 font-semibold text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg">
                {status?.ram?.usage?.toFixed(1) || clientStatus?.memory ? 
                  (clientStatus.memory ? 
                    ((clientStatus.memory.usedJSHeapSize / clientStatus.memory.totalJSHeapSize * 100).toFixed(1)) : 
                    'N/A'
                  ) : 'N/A'}%
              </span>
            </div>
            {status?.ram?.usage !== undefined ? (
              <>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      status.ram.usage > 80 ? 'bg-red-500' : status.ram.usage > 50 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(status.ram.usage, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs text-slate-500">
                  <span>{status.ram.usedGB?.toFixed(2) || 'N/A'} GB</span>
                  <span>из {status.ram.totalGB?.toFixed(2) || 'N/A'} GB</span>
                </div>
              </>
            ) : clientStatus?.memory ? (
              <>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                      (clientStatus.memory.usedJSHeapSize / clientStatus.memory.totalJSHeapSize * 100) > 80 ? 'bg-red-500' :
                      (clientStatus.memory.usedJSHeapSize / clientStatus.memory.totalJSHeapSize * 100) > 50 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                    style={{ width: `${Math.min((clientStatus.memory.usedJSHeapSize / clientStatus.memory.totalJSHeapSize * 100), 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs text-slate-500">
                  <span>{formatBytes(clientStatus.memory.usedJSHeapSize)}</span>
                  <span>из {formatBytes(clientStatus.memory.totalJSHeapSize)}</span>
            </div>
              </>
            ) : (
              <div className="text-slate-500 text-xs">Метрики недоступны</div>
            )}
          </div>
        </div>

        {/* Active Connections Card - Mobile First */}
        <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl section-spacing-sm border border-slate-800">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 flex-shrink-0" />
              <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200">Подключения</h3>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm">Активные</span>
              <span className="text-slate-200 font-semibold text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg">
                {status?.activeConnections || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Module Restart Section - Mobile First */}
      {monitoringEnabled && (
        <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl section-spacing-sm border border-slate-800">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 flex-shrink-0" />
              <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200">Перезагрузка модулей</h3>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {modules.map((module) => {
              const Icon = module.icon
              const isRestarting = restartingModule === module.id
              return (
                <div
                  key={module.id}
                  className="p-3 sm:p-4 bg-slate-800 rounded-lg sm:rounded-xl border border-slate-700 flex flex-col items-center gap-2 sm:gap-3"
                >
                  <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400 flex-shrink-0" />
                  <div className="text-center">
                    <div className="text-slate-200 font-semibold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">{module.name}</div>
                    <div className="text-slate-500 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs mt-1">
                      {module.description}
                    </div>
                  </div>
                  <button
                    onClick={() => restartModule(module.id)}
                    disabled={isRestarting}
                    className="w-full min-h-[44px] px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm sm:text-base touch-manipulation"
                    title={`Перезагрузить ${module.name}`}
                  >
                    {isRestarting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Перезагрузка...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>Перезагрузить</span>
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
          <p className="text-slate-500 text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-xs mt-3 sm:mt-4">
            Перезагрузка модулей выполняется через API сервера. Убедитесь, что API доступен.
          </p>
        </div>
      )}

      {/* Response Time Chart - Mobile First */}
      {responseTimeHistory.length > 0 && (
      <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl section-spacing-sm border border-slate-800">
        <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200 mb-3 sm:mb-4">Время ответа API (мс)</h3>
          <div className="w-full h-[200px] sm:h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
            <LineChart data={responseTimeHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="time"
                stroke="#94a3b8"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#94a3b8"
                style={{ fontSize: '12px' }}
                label={{ value: 'мс', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="latency"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                name="Время ответа (мс)"
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
          </div>
        )}

      {/* Logs Terminal - Mobile First */}
      {monitoringEnabled && (
      <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800">
        <div className="p-3 sm:p-4 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-4 flex-1">
            <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] sm:text-lg font-semibold text-slate-200">Логи системы</h3>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="min-h-[44px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
              >
                <option value="all">Все</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleClearLogs}
            className="btn-icon-only-mobile min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded-lg text-slate-200 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] transition-all touch-manipulation"
            aria-label="Очистить логи"
          >
            <Trash2 className="w-4 h-4 flex-shrink-0" />
            <span className="btn-text">Очистить</span>
          </button>
        </div>
        <div className="p-3 sm:p-4 h-64 sm:h-96 overflow-y-auto bg-slate-950 font-mono text-[clamp(0.7rem,0.65rem+0.25vw,0.75rem)] sm:text-sm">
          {logs.length > 0 ? (
              logs.map((log, index) => (
              <div
                  key={log.id || index}
                className="mb-2 pb-2 border-b border-slate-800 last:border-0"
              >
                  <div className="flex items-start gap-3 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs border ${getLogLevelBadge(log.level)}`}>
                      {log.level?.toUpperCase() || 'LOG'}
                  </span>
                  <span className="text-slate-500 text-xs">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      }) : '--:--:--'}
                  </span>
                  {log.method && (
                    <span className="text-slate-400 text-xs font-semibold">{log.method}</span>
                  )}
                  {log.endpoint && (
                    <span className="text-slate-300 text-xs">{log.endpoint}</span>
                  )}
                  {log.statusCode && (
                    <span className={`text-xs ${
                      log.statusCode >= 400 ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {log.statusCode}
                    </span>
                  )}
                  {log.responseTime && (
                    <span className="text-slate-500 text-xs">
                      {log.responseTime.toFixed(2)}ms
                    </span>
                  )}
                </div>
                <div className={`mt-1 ${getLogLevelColor(log.level)}`}>
                  {log.message}
                </div>
                {log.error?.stack && (
                  <div className="mt-1 text-xs text-slate-600 font-mono">
                    {log.error.stack.split('\n').slice(0, 3).join('\n')}
                  </div>
                )}
              </div>
            ))
          ) : (
              <div className="text-slate-500 text-center py-8">Нет логов. API сервера может быть недоступен.</div>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
      )}

      {!monitoringEnabled && (
        <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg sm:rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-yellow-200 text-[clamp(0.875rem,0.8rem+0.375vw,1rem)]">
            <p className="font-semibold mb-1">Мониторинг отключен</p>
            <p className="text-yellow-300/90 text-sm">
              Для включения мониторинга сервера установите переменную окружения VITE_ENABLE_MONITORING=true
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default SystemMonitor
