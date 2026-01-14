import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Save, 
  Copy, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Link2,
  RefreshCw,
  ExternalLink,
  Activity,
  Zap
} from 'lucide-react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import logger from '../../../shared/utils/logger.js'
import { useAdminContext } from '../context/AdminContext.jsx'

/**
 * Панель управления n8n webhook
 */
const N8nPanel = ({ onSaveSettings }) => {
  const { settings } = useAdminContext()
  const [webhookUrl, setWebhookUrl] = useState('')
  const [activeWebhookUrl, setActiveWebhookUrl] = useState('') // Действующий webhook из Firestore
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [copied, setCopied] = useState(false)
  // Флаг для предотвращения перезаписи URL после сохранения
  const justSavedRef = useRef(false)

  // Загрузка webhook URL при монтировании
  const loadWebhookUrl = useCallback(async (isRefresh = false) => {
    if (justSavedRef.current && !isRefresh) {
      logger.debug('Admin', 'Пропуск загрузки URL - только что сохранен')
      if (!isRefresh) setLoading(false)
      return
    }

    if (!db) {
      setError('База данных недоступна')
      if (!isRefresh) setLoading(false)
      return
    }

    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      
      logger.info('Admin', 'Загрузка webhook URL из Firestore', { isRefresh })
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      const settingsSnapshot = await getDoc(settingsDoc)
      
      if (settingsSnapshot.exists()) {
        const data = settingsSnapshot.data()
        const url = data.n8nWebhookUrl || data.webhookUrl || ''
        logger.info('Admin', 'Webhook URL загружен из Firestore', { 
          n8nWebhookUrl: data.n8nWebhookUrl,
          webhookUrl: data.webhookUrl,
          loadedUrl: url
        })
        setWebhookUrl(url)
        setActiveWebhookUrl(url) // Сохраняем действующий webhook
      } else {
        logger.debug('Admin', 'Документ настроек не существует в Firestore')
        setWebhookUrl('')
        setActiveWebhookUrl('')
      }
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки настроек n8n', null, err)
      setError('Ошибка загрузки настроек')
    } finally {
      if (isRefresh) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadWebhookUrl(false)
  }, [loadWebhookUrl]) // Загружаем только при монтировании

  // Обновление из контекста settings (если они изменились)
  useEffect(() => {
    if (justSavedRef.current || !settings) {
      return
    }

    const url = settings.n8nWebhookUrl || settings.webhookUrl || ''
    
    // Обновляем только если URL отличается и не пустой
    if (url && url !== webhookUrl) {
      logger.info('Admin', 'Обновление webhook URL из контекста settings', { 
        newUrl: url,
        currentUrl: webhookUrl
      })
      setWebhookUrl(url)
      setActiveWebhookUrl(url)
    }
  }, [settings, webhookUrl])

  // Обработчик обновления webhook из Firestore
  const handleRefresh = useCallback(async () => {
    await loadWebhookUrl(true)
    setSuccess('Webhook URL обновлен из базы данных')
    setTimeout(() => setSuccess(null), 2000)
  }, [loadWebhookUrl])

  // Сохранение webhook URL
  const handleSave = useCallback(async () => {
    if (!db) {
      setError('База данных недоступна')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Валидация URL
      if (webhookUrl.trim() && !isValidUrl(webhookUrl.trim())) {
        setError('Неверный формат URL. Используйте полный URL (например: https://example.com/webhook)')
        setSaving(false)
        return
      }

      // Сохраняем в Firestore
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      const currentSettings = await getDoc(settingsDoc)
      const currentData = currentSettings.exists() ? currentSettings.data() : {}

      const updatedSettings = {
        ...currentData,
        n8nWebhookUrl: webhookUrl.trim() || '',
        webhookUrl: webhookUrl.trim() || '', // Для обратной совместимости
        updatedAt: new Date().toISOString(),
      }

      await setDoc(settingsDoc, updatedSettings, { merge: true })

      logger.info('Admin', 'Webhook URL сохранен в Firestore', { 
        webhookUrl: webhookUrl.trim(),
        savedFields: {
          n8nWebhookUrl: updatedSettings.n8nWebhookUrl,
          webhookUrl: updatedSettings.webhookUrl
        }
      })

      // ВАЖНО: Сохраняем значение URL до вызова callback, чтобы оно не потерялось
      const savedUrl = webhookUrl.trim()
      
      // Устанавливаем флаг, чтобы предотвратить перезагрузку URL из settings
      justSavedRef.current = true
      
      // ВАЖНО: Явно обновляем локальное состояние СРАЗУ после сохранения, чтобы URL отображался в поле
      setWebhookUrl(savedUrl)
      setActiveWebhookUrl(savedUrl) // Обновляем действующий webhook
      
      // Вызываем callback для обновления локального состояния в родительском компоненте
      if (onSaveSettings) {
        try {
          logger.info('Admin', 'Вызов onSaveSettings callback для обновления настроек')
          await onSaveSettings()
          logger.info('Admin', 'onSaveSettings callback успешно выполнен')
        } catch (callbackErr) {
          logger.warn('Admin', 'Ошибка вызова onSaveSettings callback', null, callbackErr)
          // Не блокируем успешное сохранение, если callback не удался
        }
      } else {
        logger.warn('Admin', 'onSaveSettings callback не передан в N8nPanel')
      }
      
      setSuccess('Webhook URL успешно сохранен и будет использоваться везде')
      setTimeout(() => setSuccess(null), 3000)
      
      // Сбрасываем флаг через небольшую задержку, чтобы settings успели обновиться
      setTimeout(() => {
        justSavedRef.current = false
        logger.debug('Admin', 'Флаг justSaved сброшен, загрузка из settings разрешена')
      }, 1000)
      
      logger.info('Admin', 'Webhook URL сохранен и локальное состояние обновлено', { 
        savedUrl,
        currentWebhookUrlState: savedUrl,
        webhookUrlInState: webhookUrl
      })
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения webhook URL', null, err)
      setError('Ошибка сохранения: ' + (err.message || 'Неизвестная ошибка'))
    } finally {
      setSaving(false)
    }
  }, [webhookUrl, onSaveSettings])

  // Копирование URL в буфер обмена
  const handleCopy = useCallback(async () => {
    if (!webhookUrl.trim()) return

    try {
      await navigator.clipboard.writeText(webhookUrl.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      logger.error('Admin', 'Ошибка копирования URL', null, err)
      setError('Не удалось скопировать URL')
    }
  }, [webhookUrl])

  // Валидация URL
  const isValidUrl = (url) => {
    try {
      const urlObj = new URL(url)
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
    } catch {
      return false
    }
  }

  if (loading) {
    return (
      <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-800">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-200 flex items-center gap-2 sm:gap-3">
          <Link2 className="w-5 h-5 sm:w-6 sm:h-6" />
          n8n Webhook
        </h2>
        <p className="text-slate-400 text-sm sm:text-base mt-1">
          Управление webhook URL для интеграции с n8n. Изменения применяются ко всем операциям.
        </p>
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {error && (
          <div className="p-3 sm:p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm sm:text-base">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 sm:p-4 bg-green-900/30 border border-green-800 rounded-lg text-green-300 text-sm sm:text-base">
            {success}
          </div>
        )}

        {/* Блок с действующим webhook */}
        {activeWebhookUrl && (
          <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-2 border-green-700/50 rounded-lg p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 bg-green-600/20 rounded-lg">
                  <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-green-300 flex items-center gap-2">
                    Действующий Webhook
                    <span className="px-2 py-0.5 bg-green-600/30 border border-green-500/50 rounded text-xs font-semibold text-green-200">
                      Активен
                    </span>
                  </h3>
                  <p className="text-xs sm:text-sm text-green-400/80 mt-0.5">
                    Этот webhook используется системой для всех операций с n8n
                  </p>
                </div>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 bg-slate-700/50 hover:bg-slate-600/50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                title="Обновить из базы данных"
              >
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 text-slate-300 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-wide">
                  Текущий URL
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm sm:text-base font-mono text-green-200 break-all pr-2">
                  {activeWebhookUrl}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activeWebhookUrl)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors flex-shrink-0"
                  title="Копировать URL"
                >
                  <Copy className={`w-4 h-4 ${copied ? 'text-green-400' : 'text-slate-300'}`} />
                </button>
                <a
                  href={activeWebhookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-blue-600/50 hover:bg-blue-600/70 rounded-lg transition-colors flex-shrink-0"
                  title="Открыть в новой вкладке"
                >
                  <ExternalLink className="w-4 h-4 text-white" />
                </a>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-700/50">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400" />
                  <span>Используется для:</span>
                </div>
                <span className="px-2 py-1 bg-slate-800/50 rounded text-slate-300">Создание подписок</span>
                <span className="px-2 py-1 bg-slate-800/50 rounded text-slate-300">Удаление клиентов</span>
                <span className="px-2 py-1 bg-slate-800/50 rounded text-slate-300">Статистика</span>
                <span className="px-2 py-1 bg-slate-800/50 rounded text-slate-300">Платежи</span>
              </div>
            </div>
          </div>
        )}

        {/* Блок настройки webhook */}
        <div className="space-y-4">
          <div>
            <label className="block text-slate-300 text-sm sm:text-base font-medium mb-2">
              {activeWebhookUrl ? 'Изменить Webhook URL' : 'Настроить Webhook URL'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-n8n-instance.com/webhook/..."
                className="flex-1 px-4 py-2 sm:py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm sm:text-base"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!webhookUrl.trim()}
                  className="px-4 py-2 sm:py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2 min-h-[44px] touch-manipulation"
                  title="Копировать URL"
                >
                  <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>
                {webhookUrl.trim() && (
                  <a
                    href={webhookUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 min-h-[44px] touch-manipulation"
                    title="Открыть в новой вкладке"
                  >
                    <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
                    Открыть
                  </a>
                )}
              </div>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-2">
              {activeWebhookUrl 
                ? 'Введите новый URL webhook для замены текущего. После сохранения он станет действующим.'
                : 'Введите полный URL webhook из вашего n8n инстанса. Этот URL будет использоваться для всех интеграций с n8n.'
              }
            </p>
          </div>

          {!activeWebhookUrl && (
            <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm sm:text-base text-yellow-300">
                  <p className="font-semibold mb-1">Webhook не настроен</p>
                  <p className="text-yellow-200/90">
                    Настройте webhook URL для работы интеграции с n8n. Без него операции с n8n не будут выполняться.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm sm:text-base text-blue-300">
                <p className="font-semibold mb-1">Важно:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-200/90">
                  <li>Изменение webhook URL применяется ко всем операциям, использующим n8n</li>
                  <li>Убедитесь, что URL корректный и доступен</li>
                  <li>Сохраните изменения для применения настроек</li>
                  {activeWebhookUrl && (
                    <li>Текущий действующий webhook отображается выше</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 sm:py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2 min-h-[44px] touch-manipulation"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                Сохранение...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                Сохранить webhook URL
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default N8nPanel
