import { useState, useEffect, useRef } from 'react'
import { X, Search, Filter, Download, Trash2, AlertCircle, Info, AlertTriangle, Bug, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import logger from '../utils/logger.js'

/**
 * Панель логирования для просмотра и анализа логов приложения.
 * Адаптирована под мобильные: компактный заголовок, сворачиваемые фильтры, удобные зоны нажатия.
 */
export default function LoggerPanel({ onClose }) {
  const [logs, setLogs] = useState([])
  const [filters, setFilters] = useState({
    level: '',
    category: '',
    search: '',
  })
  const [filtersOpen, setFiltersOpen] = useState(false)
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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 safe-area-insets">
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-6xl max-h-[95dvh] sm:max-h-[90vh] h-[95dvh] sm:h-[90vh] flex flex-col border border-slate-800 border-b-0 sm:border-b">
        {/* Заголовок — компактно на мобильных */}
        <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Bug className="w-5 h-5 flex-shrink-0 text-slate-400" />
              <h2 className="text-base sm:text-xl font-bold text-slate-200 truncate">
                Система логирования
              </h2>
            </div>
            {stats && (
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-400 flex-shrink-0 tabular-nums">
                <span>Всего: {stats.total}</span>
                <span className="text-red-400">Ошибок: {stats.byLevel.error}</span>
                <span className="text-amber-400">Пред: {stats.byLevel.warn}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`min-h-[44px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-colors touch-manipulation flex items-center justify-center ${
                autoScroll
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="Автопрокрутка"
              aria-label="Автопрокрутка"
            >
              <span className="hidden sm:inline">Автопрокрутка</span>
              <span className="sm:hidden">Авто</span>
            </button>
            <button
              onClick={handleClear}
              className="min-h-[44px] sm:min-h-[36px] min-w-[44px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs sm:text-sm transition-colors flex items-center justify-center gap-1 touch-manipulation"
              title="Очистить логи"
              aria-label="Очистить"
            >
              <Trash2 className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Очистить</span>
            </button>
            <button
              onClick={() => handleExport('json')}
              className="min-h-[44px] sm:min-h-[36px] min-w-[44px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs sm:text-sm transition-colors flex items-center justify-center gap-1 touch-manipulation"
              title="Экспорт логов"
              aria-label="Экспорт"
            >
              <Download className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Экспорт</span>
            </button>
            <button
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors touch-manipulation"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Фильтры — на мобильных сворачиваемые */}
        <div className="flex-shrink-0 border-b border-slate-800 bg-slate-800/50">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="w-full sm:hidden flex items-center justify-between gap-2 min-h-[44px] px-3 py-2.5 text-slate-300 hover:bg-slate-700/50 text-sm font-medium touch-manipulation"
            aria-expanded={filtersOpen}
          >
            <span className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Фильтры
            </span>
            {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <div className={`p-3 sm:p-4 ${filtersOpen ? 'block' : 'hidden sm:block'}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
              <div className="relative md:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Поиск по логам..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full pl-9 pr-3 min-h-[44px] py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 touch-manipulation"
                  aria-label="Поиск по логам"
                />
              </div>
              <select
                value={filters.level}
                onChange={(e) => setFilters({ ...filters, level: e.target.value })}
                className="min-h-[44px] px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 touch-manipulation"
                aria-label="Уровень"
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
                className="min-h-[44px] px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 touch-manipulation"
                aria-label="Категория"
              >
                <option value="">Все категории</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Список логов */}
        <div
          ref={logsContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-2 overscroll-contain touch-manipulation"
        >
          {logs.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-slate-400">
              <Info className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
              <p className="text-sm sm:text-base">Логи не найдены</p>
              {Object.values(filters).some(f => f) && (
                <p className="text-xs sm:text-sm mt-2">Попробуйте изменить фильтры</p>
              )}
            </div>
          ) : (
            logs.map((log) => {
              const isExpanded = expandedLogs.has(log.id)
              const isToday = formatDate(log.timestamp) === formatDate(new Date().toISOString())

              return (
                <div
                  key={log.id}
                  className={`border rounded-xl sm:rounded-lg p-2.5 sm:p-3 transition-all ${getLevelColor(log.level)}`}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="mt-0.5 flex-shrink-0">
                      {getLevelIcon(log.level)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="text-[11px] sm:text-xs font-mono text-slate-400 whitespace-nowrap">
                              {isToday ? formatTime(log.timestamp) : `${formatDate(log.timestamp)} ${formatTime(log.timestamp)}`}
                            </span>
                            <span className="text-[11px] sm:text-xs font-semibold uppercase px-1.5 sm:px-2 py-0.5 rounded bg-slate-900/50">
                              {log.level}
                            </span>
                            <span className="text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded bg-slate-900/50 truncate max-w-[120px] sm:max-w-none">
                              {log.category}
                            </span>
                          </div>
                          <p className="mt-1 text-xs sm:text-sm break-words leading-snug sm:leading-normal">{log.message}</p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => handleCopyLog(log)}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center hover:bg-slate-700/50 rounded-lg transition-colors touch-manipulation"
                            title="Копировать"
                            aria-label="Копировать"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {(log.data || log.error || log.stack) && (
                            <button
                              onClick={() => toggleLogExpansion(log.id)}
                              className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center hover:bg-slate-700/50 rounded-lg transition-colors touch-manipulation"
                              title={isExpanded ? 'Свернуть' : 'Развернуть'}
                              aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
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
                        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-slate-700 space-y-2">
                          {log.data && (
                            <div>
                              <p className="text-[11px] sm:text-xs font-semibold mb-1 text-slate-400">Данные:</p>
                              <pre className="text-[11px] sm:text-xs bg-slate-950 p-2 rounded-lg overflow-x-auto font-mono break-all whitespace-pre-wrap">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.error && (
                            <div>
                              <p className="text-[11px] sm:text-xs font-semibold mb-1 text-slate-400">Ошибка:</p>
                              <pre className="text-[11px] sm:text-xs bg-slate-950 p-2 rounded-lg overflow-x-auto font-mono break-all whitespace-pre-wrap">
                                {JSON.stringify(log.error, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.stack && (
                            <div>
                              <p className="text-[11px] sm:text-xs font-semibold mb-1 text-slate-400">Stack trace:</p>
                              <pre className="text-[11px] sm:text-xs bg-slate-950 p-2 rounded-lg overflow-x-auto font-mono text-red-300 break-all whitespace-pre-wrap">
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

