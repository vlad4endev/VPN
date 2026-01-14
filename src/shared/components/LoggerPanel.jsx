import { useState, useEffect, useRef } from 'react'
import { X, Search, Filter, Download, Trash2, AlertCircle, Info, AlertTriangle, Bug, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import logger from '../utils/logger.js'

/**
 * Панель логирования для просмотра и анализа логов приложения
 */
export default function LoggerPanel({ onClose }) {
  const [logs, setLogs] = useState([])
  const [filters, setFilters] = useState({
    level: '',
    category: '',
    search: '',
  })
  const [autoScroll, setAutoScroll] = useState(true)
  const [expandedLogs, setExpandedLogs] = useState(new Set())
  const [stats, setStats] = useState(null)
  const logsEndRef = useRef(null)
  const logsContainerRef = useRef(null)

  // Загрузка логов и подписка на новые
  useEffect(() => {
    // Загружаем начальные логи
    updateLogs()
    updateStats()

    // Подписываемся на новые логи
    const unsubscribe = logger.subscribe(() => {
      updateLogs()
      updateStats()
    })

    return unsubscribe
  }, [])

  // Обновление логов при изменении фильтров
  useEffect(() => {
    updateLogs()
  }, [filters])

  // Автопрокрутка к новым логам
  useEffect(() => {
    if (autoScroll && logs.length > 0) {
      scrollToBottom()
    }
  }, [logs, autoScroll])

  const updateLogs = () => {
    const filteredLogs = logger.getLogs(filters)
    setLogs(filteredLogs)
  }

  const updateStats = () => {
    setStats(logger.getStats())
  }

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const toggleLogExpansion = (logId) => {
    const newExpanded = new Set(expandedLogs)
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId)
    } else {
      newExpanded.add(logId)
    }
    setExpandedLogs(newExpanded)
  }

  const handleClear = () => {
    if (window.confirm('Вы уверены, что хотите очистить все логи?')) {
      logger.clear()
      updateLogs()
      updateStats()
      setExpandedLogs(new Set())
    }
  }

  const handleExport = (format = 'json') => {
    const content = format === 'json' 
      ? logger.exportJSON(filters)
      : logger.exportText(filters)
    
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs-${new Date().toISOString().split('T')[0]}.${format === 'json' ? 'json' : 'txt'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCopyLog = (log) => {
    const text = `${log.timestamp} [${log.level.toUpperCase()}] [${log.category}] ${log.message}${log.data ? '\n' + JSON.stringify(log.data, null, 2) : ''}${log.error ? '\n' + JSON.stringify(log.error, null, 2) : ''}${log.stack ? '\n' + log.stack : ''}`
    
    navigator.clipboard.writeText(text).then(() => {
      // Можно добавить уведомление об успешном копировании
    }).catch(err => {
      console.error('Ошибка копирования:', err)
    })
  }

  const getLevelIcon = (level) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />
      case 'info':
        return <Info className="w-4 h-4 text-blue-400" />
      case 'debug':
        return <Bug className="w-4 h-4 text-slate-400" />
      default:
        return <Info className="w-4 h-4 text-slate-400" />
    }
  }

  const getLevelColor = (level) => {
    switch (level) {
      case 'error':
        return 'bg-red-900/20 border-red-800 text-red-300'
      case 'warn':
        return 'bg-yellow-900/20 border-yellow-800 text-yellow-300'
      case 'info':
        return 'bg-blue-900/20 border-blue-800 text-blue-300'
      case 'debug':
        return 'bg-slate-800 border-slate-700 text-slate-400'
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300'
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    })
  }

  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const categories = [...new Set(logs.map(log => log.category))].sort()

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col border border-slate-800">
        {/* Заголовок */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
              <Bug className="w-5 h-5" />
              Система логирования
            </h2>
            {stats && (
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span>Всего: {stats.total}</span>
                <span className="text-red-400">Ошибок: {stats.byLevel.error}</span>
                <span className="text-yellow-400">Предупреждений: {stats.byLevel.warn}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                autoScroll
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Автопрокрутка
            </button>
            <button
              onClick={handleClear}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" />
              Очистить
            </button>
            <div className="relative">
              <button
                onClick={() => handleExport('json')}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors flex items-center gap-1"
              >
                <Download className="w-4 h-4" />
                Экспорт
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="p-4 border-b border-slate-800 bg-slate-800/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск по логам..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filters.level}
              onChange={(e) => setFilters({ ...filters, level: e.target.value })}
              className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Все уровни</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Все категории</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Список логов */}
        <div 
          ref={logsContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-2"
        >
          {logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Info className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Логи не найдены</p>
              {Object.values(filters).some(f => f) && (
                <p className="text-sm mt-2">Попробуйте изменить фильтры</p>
              )}
            </div>
          ) : (
            logs.map((log) => {
              const isExpanded = expandedLogs.has(log.id)
              const isToday = formatDate(log.timestamp) === formatDate(new Date().toISOString())
              
              return (
                <div
                  key={log.id}
                  className={`border rounded-lg p-3 transition-all ${getLevelColor(log.level)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getLevelIcon(log.level)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-slate-400">
                              {isToday ? formatTime(log.timestamp) : `${formatDate(log.timestamp)} ${formatTime(log.timestamp)}`}
                            </span>
                            <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-slate-900/50">
                              {log.level}
                            </span>
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-900/50">
                              {log.category}
                            </span>
                          </div>
                          <p className="mt-1 text-sm break-words">{log.message}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleCopyLog(log)}
                            className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                            title="Копировать"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {(log.data || log.error || log.stack) && (
                            <button
                              onClick={() => toggleLogExpansion(log.id)}
                              className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                              title={isExpanded ? "Свернуть" : "Развернуть"}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                          {log.data && (
                            <div>
                              <p className="text-xs font-semibold mb-1 text-slate-400">Данные:</p>
                              <pre className="text-xs bg-slate-950 p-2 rounded overflow-x-auto font-mono">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.error && (
                            <div>
                              <p className="text-xs font-semibold mb-1 text-slate-400">Ошибка:</p>
                              <pre className="text-xs bg-slate-950 p-2 rounded overflow-x-auto font-mono">
                                {JSON.stringify(log.error, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.stack && (
                            <div>
                              <p className="text-xs font-semibold mb-1 text-slate-400">Stack trace:</p>
                              <pre className="text-xs bg-slate-950 p-2 rounded overflow-x-auto font-mono text-red-300">
                                {log.stack}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  )
}

