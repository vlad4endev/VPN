import { useState, useEffect, useCallback } from 'react'
import { 
  Server, 
  Activity, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Trash2,
  Clock,
  Globe,
  Key,
  Users as UsersIcon
} from 'lucide-react'
import axios from 'axios'

/**
 * Панель управления прокси-серверами для 3x-ui
 */
const ProxyPanel = () => {
  const [proxyUrl, setProxyUrl] = useState(
    import.meta.env.VITE_API_PROXY_URL || 'http://localhost:3001'
  )
  const [healthStatus, setHealthStatus] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  // Проверка здоровья прокси-сервера
  const checkHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${proxyUrl}/api/xui/health`, {
        timeout: 5000,
        validateStatus: () => true, // Не бросать ошибку на любой статус
      })
      
      if (response.status === 200 && response.data.status === 'ok') {
        setHealthStatus({
          status: response.data.status,
          service: response.data.service,
          uptime: response.data.uptime,
          activeSessions: response.data.activeSessions,
          timestamp: response.data.timestamp,
        })
        setLastUpdate(new Date())
        setError(null) // Очищаем ошибку при успехе
      } else {
        setHealthStatus(null)
        setError('Прокси-сервер недоступен или вернул ошибку')
      }
    } catch (err) {
      // Игнорируем ошибки сети, если сервер просто не запущен
      if (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED') {
        setHealthStatus(null)
        setError('Прокси-сервер не запущен или недоступен')
      } else if (err.response?.status === 500) {
        setHealthStatus(null)
        setError('Ошибка на прокси-сервере (500). Проверьте логи сервера.')
      } else {
        setHealthStatus(null)
        setError(err.message || 'Не удалось подключиться к прокси-серверу')
      }
    } finally {
      setLoading(false)
    }
  }, [proxyUrl])

  // Загрузка списка сессий
  const loadSessions = useCallback(async () => {
    try {
      const response = await axios.get(`${proxyUrl}/api/xui/sessions`, {
        timeout: 5000,
        validateStatus: () => true, // Не бросать ошибку на любой статус
      })
      
      if (response.status === 200 && response.data.success) {
        setSessions(response.data.sessions || [])
      } else {
        // Если сервер недоступен, просто не обновляем сессии
        setSessions([])
      }
    } catch (err) {
      // Игнорируем ошибки, если сервер не запущен
      if (err.code !== 'ERR_NETWORK' && err.code !== 'ECONNREFUSED') {
        // Логируем только неожиданные ошибки
        if (err.response?.status !== 500) {
          console.warn('Ошибка загрузки сессий:', err.message)
        }
      }
      setSessions([])
    }
  }, [proxyUrl])

  // Автоматическое обновление
  useEffect(() => {
    checkHealth()
    loadSessions()
    
    const interval = setInterval(() => {
      checkHealth()
      loadSessions()
    }, 30000) // Обновление каждые 30 секунд

    return () => clearInterval(interval)
  }, [checkHealth, loadSessions])

  // Форматирование времени работы
  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) return `${days}д ${hours}ч ${minutes}м`
    if (hours > 0) return `${hours}ч ${minutes}м`
    return `${minutes}м`
  }

  // Форматирование времени последнего обновления
  const formatLastUpdate = (date) => {
    if (!date) return '—'
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)
    
    if (diff < 60) return `${diff} сек назад`
    if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`
    return date.toLocaleTimeString()
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-200 mb-2 flex items-center gap-2">
              <Server className="w-6 h-6" />
              Прокси-серверы для 3x-ui
            </h2>
            <p className="text-slate-400 text-sm">
              Управление backend proxy для безопасной работы с 3x-ui API
            </p>
          </div>
          <button
            onClick={() => {
              checkHealth()
              loadSessions()
            }}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>

        {/* Настройка URL прокси */}
        <div className="mb-4">
          <label className="block text-slate-300 text-sm font-medium mb-2">
            URL прокси-сервера
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="http://localhost:3001"
              className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={checkHealth}
              disabled={loading}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
            >
              Проверить
            </button>
          </div>
        </div>
      </div>

      {/* Статус здоровья */}
      <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Статус прокси-сервера
        </h3>

        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded text-red-300 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            <div>
              <p className="font-medium">Ошибка подключения</p>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        )}

        {healthStatus ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Статус</span>
                {healthStatus.status === 'ok' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
              </div>
              <p className="text-slate-200 font-semibold capitalize">
                {healthStatus.status}
              </p>
            </div>

            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Время работы</span>
                <Clock className="w-4 h-4 text-slate-500" />
              </div>
              <p className="text-slate-200 font-semibold">
                {formatUptime(healthStatus.uptime)}
              </p>
            </div>

            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Активных сессий</span>
                <UsersIcon className="w-4 h-4 text-slate-500" />
              </div>
              <p className="text-slate-200 font-semibold">
                {healthStatus.activeSessions || 0}
              </p>
            </div>

            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Последнее обновление</span>
                <RefreshCw className="w-4 h-4 text-slate-500" />
              </div>
              <p className="text-slate-200 font-semibold text-sm">
                {formatLastUpdate(lastUpdate)}
              </p>
            </div>
          </div>
        ) : (
          !error && (
            <div className="text-center py-8 text-slate-400">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-500" />
              <p>Нажмите "Проверить" для получения статуса</p>
            </div>
          )
        )}
      </div>

      {/* Активные сессии */}
      <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <UsersIcon className="w-5 h-5" />
          Активные сессии ({sessions.length})
        </h3>

        {sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-3 px-4 text-slate-400 text-sm font-medium">Session ID</th>
                  <th className="text-left py-3 px-4 text-slate-400 text-sm font-medium">Сервер</th>
                  <th className="text-left py-3 px-4 text-slate-400 text-sm font-medium">Пользователь</th>
                  <th className="text-left py-3 px-4 text-slate-400 text-sm font-medium">Истекает</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session, index) => (
                  <tr
                    key={index}
                    className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <code className="text-slate-300 text-xs font-mono">
                        {session.sessionId}
                      </code>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-200">
                          {session.serverIP}:{session.serverPort}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-200">{session.username}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-slate-400 text-sm">
                        {new Date(session.expiresAt).toLocaleString('ru-RU')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <UsersIcon className="w-12 h-12 mx-auto mb-2 text-slate-500" />
            <p>Нет активных сессий</p>
          </div>
        )}
      </div>

      {/* Информация */}
      <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Информация
        </h3>
        <div className="space-y-2 text-slate-400 text-sm">
          <p>
            • Backend Proxy решает проблемы с CORS и управлением сессиями для 3x-ui API
          </p>
          <p>
            • Сессии хранятся на сервере и автоматически очищаются при истечении
          </p>
          <p>
            • Health check обновляется автоматически каждые 30 секунд
          </p>
          <p>
            • Для запуска прокси-сервера используйте: <code className="bg-slate-800 px-2 py-1 rounded">node server/xui-backend-proxy.js</code>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ProxyPanel
