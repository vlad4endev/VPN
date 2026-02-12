import { useState, useEffect, useCallback } from 'react'
import { Send, CheckCircle2, XCircle, Copy, ExternalLink, RefreshCw, ChevronDown, ChevronUp, MessageSquare, Info } from 'lucide-react'
import { getTelegramStatus, saveTelegramToken, setTelegramWebhook, sendTestMessage } from '../services/telegramAdminService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Панель настроек Telegram: быстрая настройка в 3 шага (токен → сохранить → webhook).
 */
const TelegramPanel = () => {
  const [statusLoading, setStatusLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [tokenInput, setTokenInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [settingWebhook, setSettingWebhook] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testChatId, setTestChatId] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testError, setTestError] = useState(null)
  const [testSuccess, setTestSuccess] = useState(null)

  const loadStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setStatusLoading(true)
    if (!isRefresh) setError(null)
    try {
      const { configured: ok } = await getTelegramStatus()
      setConfigured(ok)
      if (isRefresh) setError(null)
    } catch (err) {
      logger.error('Admin', 'Telegram status', null, err)
      setError(err.message || 'Ошибка загрузки статуса')
      setConfigured(false)
    } finally {
      setStatusLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleSaveToken = async () => {
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const { configured: ok } = await saveTelegramToken(tokenInput)
      setConfigured(ok)
      setTokenInput('') // не оставляем токен в поле после сохранения
      setSuccess('Токен сохранён в базу (Firestore). Он будет использоваться для привязки аккаунта, уведомлений об оплате и напоминаний о продлении. Теперь нажмите «Установить webhook».')
      setTimeout(() => setSuccess(null), 6000)
    } catch (err) {
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleSetWebhook = async () => {
    setError(null)
    setSuccess(null)
    setSettingWebhook(true)
    try {
      await setTelegramWebhook()
      setSuccess('Webhook установлен. Интеграция готова.')
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err.message || 'Ошибка установки webhook')
    } finally {
      setSettingWebhook(false)
    }
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace(/\/$/, '')}/api/telegram/webhook`
    : ''

  const handleCopyWebhook = () => {
    if (webhookUrl && navigator.clipboard) {
      navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSendTest = async () => {
    setTestError(null)
    setTestSuccess(null)
    setSendingTest(true)
    try {
      await sendTestMessage(testChatId)
      setTestSuccess('Тестовое сообщение отправлено. Проверьте Telegram.')
      setTimeout(() => setTestSuccess(null), 5000)
    } catch (err) {
      setTestError(err.message || 'Ошибка отправки')
    } finally {
      setSendingTest(false)
    }
  }

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-800">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-200 flex items-center gap-2 sm:gap-3">
          <Send className="w-5 h-5 sm:w-6 sm:h-6" />
          Telegram
        </h2>
        <p className="text-slate-400 text-sm sm:text-base mt-1">
          Уведомления об оплате, напоминания о продлении и привязка аккаунта. Настройка за 3 шага.
        </p>
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {error && (
          <div className="p-3 sm:p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm space-y-1">
            <p>{error}</p>
            {error.includes('404') && (
              <p className="text-red-400/90 text-xs mt-2">
                Запрос идёт на backend (порт 3001). Запустите: <code className="bg-slate-800 px-1 rounded">node server/n8n-webhook-proxy.js</code>
              </p>
            )}
          </div>
        )}
        {success && (
          <div className="p-3 sm:p-4 bg-green-900/30 border border-green-800 rounded-lg text-green-300 text-sm">
            {success}
          </div>
        )}

        {/* 3 шага */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-slate-200 mb-3">Быстрая настройка</h4>
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 text-blue-300 flex items-center justify-center font-bold">1</span>
              Создайте бота в Telegram: @BotFather → /newbot → скопируйте токен.
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 text-blue-300 flex items-center justify-center font-bold">2</span>
              Вставьте токен ниже и нажмите «Сохранить токен».
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 text-blue-300 flex items-center justify-center font-bold">3</span>
              Нажмите «Установить webhook» — готово.
            </li>
          </ol>
        </div>

        {/* Токен + кнопки */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">Токен бота (от @BotFather)</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="123456789:ABCdef..."
              className="flex-1 min-h-[44px] px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleSaveToken}
              disabled={saving}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm whitespace-nowrap"
            >
              {saving ? 'Сохранение…' : 'Сохранить токен'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSetWebhook}
            disabled={!configured || settingWebhook}
            className="px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm"
          >
            {settingWebhook ? 'Установка…' : 'Установить webhook'}
          </button>
          <button
            type="button"
            onClick={() => loadStatus(true)}
            disabled={refreshing || statusLoading}
            className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            title="Обновить статус"
          >
            <RefreshCw className={`w-4 h-4 text-slate-300 ${(refreshing || statusLoading) ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Статус */}
        <div className={`rounded-lg p-4 border-2 ${configured ? 'bg-green-900/20 border-green-700/50' : 'bg-amber-900/20 border-amber-700/50'}`}>
          <div className="flex items-center gap-2">
            {configured ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            )}
            <span className={configured ? 'text-green-300 font-medium' : 'text-amber-300 font-medium'}>
              {configured ? 'Интеграция включена' : 'Сохраните токен, чтобы включить интеграцию'}
            </span>
          </div>
        </div>

        {/* Уведомления и Telegram ID */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 sm:p-5 space-y-4">
          <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Уведомления и получение Telegram ID
          </h4>
          <div className="text-sm text-slate-300 space-y-2">
            <p>
              <strong>Уведомления:</strong> при успешной оплате подписки пользователю с привязанным Telegram отправляется сообщение.
              Напоминания об истечении подписки (за 7 дней / 1 день / в день истечения) отправляются по cron на <code className="text-slate-400 bg-slate-900/50 px-1 rounded">POST /api/telegram/send-reminders</code> (с заголовком <code className="text-slate-400 bg-slate-900/50 px-1 rounded">X-Telegram-Secret</code>).
            </p>
            <p className="flex items-start gap-2 mt-2">
              <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Как получить Telegram ID:</strong> пользователь в личном кабинете открывает Профиль → раздел «Telegram» → «Привязать» и переходит по ссылке в бота — ID сохранится автоматически. Либо пользователь может написать боту <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@userinfobot</a> в Telegram, получить свой ID и сообщить его вам для ручного ввода в карточке пользователя или при создании.
              </span>
            </p>
          </div>
          {configured && (
            <div className="pt-2 border-t border-slate-700">
              <label className="block text-sm font-medium text-slate-300 mb-2">Тестовое уведомление</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={testChatId}
                  onChange={(e) => { setTestChatId(e.target.value); setTestError(null); setTestSuccess(null); }}
                  placeholder="Ваш Telegram ID (chat_id)"
                  className="flex-1 min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={sendingTest || !testChatId.trim()}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm whitespace-nowrap"
                >
                  {sendingTest ? 'Отправка…' : 'Отправить тест'}
                </button>
              </div>
              {testError && <p className="mt-2 text-sm text-red-400">{testError}</p>}
              {testSuccess && <p className="mt-2 text-sm text-green-400">{testSuccess}</p>}
            </div>
          )}
        </div>

        {/* Подробнее (сворачиваемо) */}
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-3 sm:p-4 bg-slate-800/50 hover:bg-slate-800 text-slate-300 text-sm font-medium"
          >
            Подробнее (webhook URL, переменные окружения)
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showAdvanced && (
            <div className="p-4 space-y-4 border-t border-slate-700">
              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-2">URL webhook</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="flex-1 min-w-0 text-sm font-mono text-slate-200 break-all bg-slate-900/50 px-3 py-2 rounded border border-slate-700">
                    {webhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyWebhook}
                    className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
                    title="Копировать"
                  >
                    <Copy className={`w-4 h-4 ${copied ? 'text-green-400' : 'text-slate-300'}`} />
                  </button>
                  {webhookUrl && (
                    <a href={webhookUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
                      <ExternalLink className="w-4 h-4 text-white" />
                    </a>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-1">Переменные окружения (альтернатива)</h4>
                <p className="text-xs text-slate-500">
                  Вместо сохранения токена в панели можно задать <code className="text-slate-400">TELEGRAM_BOT_TOKEN</code> на сервере.
                  Для cron-напоминаний: <code className="text-slate-400">TELEGRAM_WEBHOOK_SECRET</code>, POST /api/telegram/send-reminders.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TelegramPanel
