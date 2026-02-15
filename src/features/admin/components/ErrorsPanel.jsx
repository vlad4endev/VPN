import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RefreshCw, Send, ChevronDown, ChevronUp } from 'lucide-react'
import { getAdminErrors } from '../services/adminErrorsService.js'
import logger from '../../../shared/utils/logger.js'

const SEVERITY_LABELS = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
  critical: 'Критическая',
}

const SEVERITY_CLASS = {
  low: 'bg-slate-600/30 text-slate-400',
  medium: 'bg-amber-600/20 text-amber-400',
  high: 'bg-orange-600/20 text-orange-400',
  critical: 'bg-red-600/20 text-red-400',
}

/**
 * Панель системных ошибок для админа: список последних ошибок, отправленных с фронта или сервера.
 * При настроенном Telegram админ получает уведомления в реальном времени.
 */
const ErrorsPanel = () => {
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { errors: list } = await getAdminErrors({ limit: 100 })
      setErrors(list)
    } catch (err) {
      logger.error('Admin', 'Errors list', null, err)
      setError(err.message || 'Не удалось загрузить список ошибок')
      setErrors([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-700/50 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <AlertTriangle size={22} className="text-amber-400" />
            Ошибки системы
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Последние зафиксированные ошибки. При настроенном Telegram дубликаты приходят в чат админа.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-900/20 border border-red-800/50 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="p-4 overflow-auto max-h-[70vh]">
        {loading && errors.length === 0 ? (
          <p className="text-slate-500 text-sm">Загрузка…</p>
        ) : errors.length === 0 ? (
          <p className="text-slate-500 text-sm">Ошибок пока не было.</p>
        ) : (
          <ul className="space-y-2">
            {errors.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-slate-700/60 bg-slate-800/50 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-700/40 transition-colors"
                >
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_CLASS[e.severity] || SEVERITY_CLASS.medium}`}>
                    {SEVERITY_LABELS[e.severity] || e.severity}
                  </span>
                  <span className="flex-shrink-0 text-xs text-slate-500 font-mono">{e.source}</span>
                  {e.telegramSent && (
                    <span className="flex-shrink-0 text-emerald-500" title="Отправлено в Telegram">
                      <Send className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0 text-sm text-slate-300 truncate">{e.message}</span>
                  <span className="flex-shrink-0 text-xs text-slate-500">
                    {e.createdAt ? new Date(e.createdAt).toLocaleString('ru-RU') : '—'}
                  </span>
                  {expandedId === e.id ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {expandedId === e.id && (
                  <div className="px-3 pb-3 pt-0 border-t border-slate-700/50 space-y-2">
                    {e.context && (
                      <p className="text-xs text-slate-400"><span className="text-slate-500">Контекст:</span> {e.context}</p>
                    )}
                    {e.userId && (
                      <p className="text-xs text-slate-400"><span className="text-slate-500">userId:</span> {e.userId}</p>
                    )}
                    {e.stack && (
                      <pre className="text-xs text-slate-500 bg-slate-900/80 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                        {e.stack}
                      </pre>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ErrorsPanel
