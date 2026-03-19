import { useState, useEffect, useCallback } from 'react'
import { Send, CheckCircle2, XCircle, Copy, RefreshCw, ChevronDown, ChevronUp, Bell, Link2, ScrollText } from 'lucide-react'
import { getTelegramStatus, getTelegramChatInfo, saveTelegramToken, saveTelegramSettings, setTelegramWebhook, getWebhookStatus, sendTestMessage, getTelegramLogs } from '../services/telegramAdminService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Компактная панель Telegram: текущие настройки, токен, webhook, Chat ID админа, тест.
 */
const TelegramPanel = () => {
  const [statusLoading, setStatusLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [adminChatIdSet, setAdminChatIdSet] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [tokenInput, setTokenInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [settingWebhook, setSettingWebhook] = useState(false)
  const [copied, setCopied] = useState(false)
  const [miniAppCopied, setMiniAppCopied] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testChatId, setTestChatId] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testError, setTestError] = useState(null)
  const [testSuccess, setTestSuccess] = useState(null)
  const [adminChatIdInput, setAdminChatIdInput] = useState('')
  const [savingAdminChatId, setSavingAdminChatId] = useState(false)
  const [webhookInfo, setWebhookInfo] = useState(null)
  const [botUsername, setBotUsername] = useState(null)
  const [currentAdminChatId, setCurrentAdminChatId] = useState(null)
  const [chatInfo, setChatInfo] = useState(null)
  const [chatInfoError, setChatInfoError] = useState(null)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState(null)
  const [logsCopied, setLogsCopied] = useState(false)

  const loadStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setStatusLoading(true)
    if (!isRefresh) setError(null)
    try {
      const data = await getTelegramStatus()
      setConfigured(data.configured)
      setAdminChatIdSet(data.adminChatIdSet ?? false)
      setBotUsername(data.botUsername != null ? data.botUsername : null)
      setCurrentAdminChatId(data.adminChatId != null && String(data.adminChatId).trim() ? String(data.adminChatId).trim() : null)
      setAdminChatIdInput(data.adminChatId != null && String(data.adminChatId).trim() ? String(data.adminChatId).trim() : '')
      if (isRefresh) setError(null)
    } catch (err) {
      logger.error('Admin', 'Telegram status', null, err)
      setError(err.message || 'Ошибка загрузки статуса')
      setConfigured(false)
      setAdminChatIdSet(false)
      setBotUsername(null)
      setCurrentAdminChatId(null)
      setAdminChatIdInput('')
    } finally {
      setStatusLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadChatInfo = useCallback(async () => {
    setChatInfoError(null)
    setChatInfo(null)
    try {
      const { chat, error: err } = await getTelegramChatInfo()
      if (err) {
        setChatInfoError(err)
        return
      }
      setChatInfo(chat || null)
    } catch (err) {
      setChatInfoError(err.message || 'Ошибка загрузки данных аккаунта')
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (currentAdminChatId) loadChatInfo()
    else {
      setChatInfo(null)
      setChatInfoError(null)
    }
  }, [currentAdminChatId, loadChatInfo])

  const loadWebhookStatus = useCallback(async () => {
    if (!configured) return
    try {
      const { webhookInfo: info } = await getWebhookStatus()
      setWebhookInfo(info || null)
    } catch {
      setWebhookInfo(null)
    }
  }, [configured])

  useEffect(() => {
    if (configured) loadWebhookStatus()
    else setWebhookInfo(null)
  }, [configured, loadWebhookStatus])

  const handleSaveToken = async () => {
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      await saveTelegramToken(tokenInput)
      setTokenInput('')
      setSuccess('Токен сохранён. Нажмите «Установить webhook».')
      setTimeout(() => setSuccess(null), 5000)
      await loadStatus(true)
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
      setSuccess('Webhook установлен.')
      setTimeout(() => setSuccess(null), 4000)
      loadWebhookStatus()
    } catch (err) {
      setError(err.message || 'Ошибка установки webhook')
    } finally {
      setSettingWebhook(false)
    }
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : ''
  const webhookUrl = baseUrl ? `${baseUrl}/api/telegram/webhook` : ''
  const miniAppUrl = baseUrl ? `${baseUrl}/` : ''

  const handleCopyWebhook = () => {
    if (webhookUrl && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(webhookUrl)
        .then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
        .catch((err) => console.warn('TelegramPanel: copy webhook failed', err?.message))
    }
  }

  const handleCopyMiniAppUrl = () => {
    if (miniAppUrl && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(miniAppUrl)
        .then(() => {
          setMiniAppCopied(true)
          setTimeout(() => setMiniAppCopied(false), 2000)
        })
        .catch((err) => console.warn('TelegramPanel: copy mini app URL failed', err?.message))
    }
  }

  const loadLogs = useCallback(async () => {
    setLogsError(null)
    setLogsLoading(true)
    try {
      const { logs: list } = await getTelegramLogs(150)
      setLogs(Array.isArray(list) ? list : [])
    } catch (err) {
      const msg = err?.message || 'Ошибка загрузки логов'
      setLogsError(
        msg.includes('404') || msg.includes('не найден')
          ? 'API логов недоступен. Убедитесь, что backend (n8n-webhook-proxy) запущен и перезапустите фронтенд.'
          : msg,
      )
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const openLogsModal = useCallback(() => {
    setShowLogsModal(true)
    loadLogs()
  }, [loadLogs])

  const copyLogsToClipboard = useCallback(() => {
    const text = logs
      .map((e) => {
        const { ts, event, ...rest } = e
        const restStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''
        return `${ts} [${event}]${restStr}`
      })
      .join('\n')
    if (text && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          setLogsCopied(true)
          setTimeout(() => setLogsCopied(false), 2000)
        })
        .catch((err) => console.warn('TelegramPanel: copy logs failed', err?.message))
    }
  }, [logs])

  const handleSendTest = async () => {
    setTestError(null)
    setTestSuccess(null)
    setSendingTest(true)
    try {
      await sendTestMessage(testChatId)
      setTestSuccess('Отправлено. Проверьте Telegram.')
      setTimeout(() => setTestSuccess(null), 4000)
    } catch (err) {
      setTestError(err.message || 'Ошибка отправки')
    } finally {
      setSendingTest(false)
    }
  }

  const handleSaveAdminChatId = async () => {
    setError(null)
    setSuccess(null)
    setSavingAdminChatId(true)
    try {
      await saveTelegramSettings({ adminChatId: adminChatIdInput })
      setSuccess('Chat ID админа сохранён.')
      setTimeout(() => setSuccess(null), 4000)
      await loadStatus(true)
      await loadChatInfo()
    } catch (err) {
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setSavingAdminChatId(false)
    }
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden max-w-2xl">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          <Send className="w-5 h-5" />
          Telegram
        </h2>
        <button
          type="button"
          onClick={async () => { await loadStatus(true); if (currentAdminChatId) loadChatInfo(); }}
          disabled={refreshing || statusLoading}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          title="Обновить данные"
        >
          <RefreshCw className={`w-4 h-4 ${(refreshing || statusLoading) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
        )}
        {success && (
          <div className="p-3 bg-green-900/30 border border-green-800 rounded-lg text-green-300 text-sm">{success}</div>
        )}

        {/* Текущие настройки — сохранённые данные с сервера */}
        <section className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Сохранённые данные</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-slate-500 block">Токен бота</span>
              <span className="text-slate-200 font-medium">
                {statusLoading ? '…' : configured ? 'Задан (скрыт)' : 'Не введён'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Бот</span>
              <span className="text-slate-200 font-medium">
                {statusLoading ? '…' : botUsername ? `@${botUsername}` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Chat ID — сюда приходят уведомления</span>
              <span className="text-slate-200 font-medium">
                {statusLoading ? '…' : currentAdminChatId ? currentAdminChatId : 'Не задан'}
              </span>
            </div>
          </div>
          {currentAdminChatId && (chatInfo || chatInfoError) && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <span className="text-slate-500 block text-xs mb-1">Данные аккаунта Telegram (getChat)</span>
              {chatInfoError && (
                <span className="text-amber-400 text-sm">{chatInfoError}</span>
              )}
              {chatInfo && !chatInfoError && (
                <div className="text-slate-200 text-sm space-y-0.5">
                  {chatInfo.type && <span className="text-slate-400">Тип: {chatInfo.type}</span>}
                  {(chatInfo.first_name || chatInfo.last_name) && (
                    <div>Имя: {[chatInfo.first_name, chatInfo.last_name].filter(Boolean).join(' ')}</div>
                  )}
                  {chatInfo.username && <div>@{chatInfo.username}</div>}
                  {chatInfo.title && <div>Название: {chatInfo.title}</div>}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Токен + Webhook в одну строку */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">Токен бота</label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Токен от @BotFather"
              className="w-full min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveToken}
            disabled={saving}
            className="h-[38px] px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {saving ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            onClick={handleSetWebhook}
            disabled={!configured || settingWebhook}
            className="h-[38px] px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
          >
            {settingWebhook ? '…' : 'Webhook'}
          </button>
        </div>

        {/* Chat ID админа — сюда поступают уведомления о тикетах */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-slate-500 mb-1">Chat ID — куда приходят уведомления о тикетах</label>
            <input
              type="text"
              value={adminChatIdInput}
              onChange={(e) => setAdminChatIdInput(e.target.value)}
              placeholder="Ваш Telegram ID (из @userinfobot)"
              className="w-full min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveAdminChatId}
            disabled={savingAdminChatId || !adminChatIdInput.trim()}
            className="h-[38px] px-4 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {savingAdminChatId ? '…' : 'Сохранить'}
          </button>
          <div className="flex items-end gap-2 flex-1 min-w-[140px]">
            <input
              type="text"
              value={testChatId}
              onChange={(e) => { setTestChatId(e.target.value); setTestError(null); setTestSuccess(null); }}
              placeholder="Тест: Chat ID"
              className="flex-1 min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleSendTest}
              disabled={sendingTest || !testChatId.trim()}
              className="h-[38px] px-4 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium whitespace-nowrap"
            >
              {sendingTest ? '…' : 'Тест'}
            </button>
          </div>
        </div>
        {(testError || testSuccess) && (
          <p className={`text-sm ${testError ? 'text-red-400' : 'text-green-400'}`}>{testError || testSuccess}</p>
        )}

        {/* Статус одной строкой */}
        <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${configured ? 'bg-green-900/20 text-green-300' : 'bg-amber-900/20 text-amber-300'}`}>
          {configured ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span>{configured ? 'Бот подключён' : 'Сохраните токен'}</span>
          {configured && (
            <span className="text-slate-400">•</span>
          )}
          {configured && (
            <span>{adminChatIdSet ? 'Уведомления о тикетах: да' : 'Уведомления о тикетах: укажите Chat ID'}</span>
          )}
        </div>

        {/* Webhook URL — компактно */}
        {configured && webhookInfo?.url && (
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <code className="flex-1 min-w-0 text-xs text-slate-400 truncate">{webhookInfo.url}</code>
            <button type="button" onClick={handleCopyWebhook} className="p-1.5 rounded text-slate-400 hover:bg-slate-700" title="Копировать">
              <Copy className={`w-4 h-4 ${copied ? 'text-green-400' : ''}`} />
            </button>
          </div>
        )}

        {/* Mini App — ссылка для бота (BotFather → Menu Button / Mini App) */}
        {miniAppUrl && (
          <section className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Mini App (личный кабинет в боте)</h3>
            <p className="text-slate-500 text-xs mb-2">
              Вставьте ссылку в настройках бота: BotFather → ваш бот → Menu Button или в кнопку/команду, открывающую Mini App.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 text-sm text-slate-200 break-all bg-slate-900 px-2 py-1.5 rounded border border-slate-700">
                {miniAppUrl}
              </code>
              <button
                type="button"
                onClick={handleCopyMiniAppUrl}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
                title="Копировать ссылку"
              >
                <Copy className={`w-4 h-4 ${miniAppCopied ? 'text-green-400' : ''}`} />
                {miniAppCopied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </section>
        )}

        {/* Логи Mini App — для анализа проблем авторизации в /t */}
        <section className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Логи Mini App</h3>
          <p className="text-slate-500 text-xs mb-2">
            Последние события авторизации в Mini App (сессия, initData, ошибки). Помогает разбирать проблемы входа в /t.
          </p>
          <button
            type="button"
            onClick={openLogsModal}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
          >
            <ScrollText className="w-4 h-4" />
            Просмотреть логи
          </button>
        </section>

        {/* Подробнее */}
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 text-sm"
          >
            Подробнее (webhook URL, .env)
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showAdvanced && (
            <div className="p-3 border-t border-slate-700 space-y-2 text-xs text-slate-500">
              <p>Webhook: <code className="text-slate-400 break-all">{webhookUrl}</code></p>
              <p>Env: TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, TELEGRAM_WEBHOOK_SECRET</p>
            </div>
          )}
        </div>

        {/* Модальное окно логов TMA */}
        {showLogsModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowLogsModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="logs-modal-title"
          >
            <div
              className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-slate-900 border border-slate-700 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <h2 id="logs-modal-title" className="text-lg font-semibold text-white">Логи Mini App (TMA)</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadLogs}
                    disabled={logsLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm"
                  >
                    <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                    Обновить
                  </button>
                  <button
                    type="button"
                    onClick={copyLogsToClipboard}
                    disabled={!logs.length}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm"
                  >
                    <Copy className="w-4 h-4" />
                    {logsCopied ? 'Скопировано' : 'Копировать'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogsModal(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
                    aria-label="Закрыть"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                {logsError && (
                  <div className="mb-3 space-y-1">
                    <p className="text-amber-400 text-sm">{logsError}</p>
                    <p className="text-slate-500 text-xs">Убедитесь, что backend (n8n-webhook-proxy или основной сервер) запущен. Обновите страницу или перезапустите dev-сервер.</p>
                  </div>
                )}
                {logsLoading && logs.length === 0 ? (
                  <p className="text-slate-500 text-sm">Загрузка…</p>
                ) : logs.length === 0 ? (
                  <div className="text-slate-500 text-sm space-y-2">
                    <p>Записей пока нет.</p>
                    <p className="text-slate-600 text-xs">
                      Это <strong>серверные</strong> логи: они появляются, когда запрос доходит до сервера (<code className="bg-slate-800 px-1 rounded">POST /api/telegram/auth</code>). Откройте Mini App (/t) из бота в Telegram или нажмите «Войти через Telegram» на сайте — тогда здесь появятся записи.
                    </p>
                    <p className="text-slate-600 text-xs">
                      Если в Mini App ничего не грузится — смотрите <strong>клиентские</strong> логи на самом экране /t (кнопка «Логи TMA» внизу справа). Они пишутся до отправки запроса и помогут понять, на каком шаге застревает загрузка.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 font-mono text-xs">
                    {[...logs].reverse().map((e, i) => {
                      const { ts, event, ...rest } = e
                      const isError = event === 'error' || event === 'initData_fail' || event === 'session_fail'
                      return (
                        <div
                          key={`${ts}-${i}`}
                          className={`break-words rounded px-2 py-1.5 ${isError ? 'bg-red-900/20 text-red-300' : 'bg-slate-800/60 text-slate-300'}`}
                        >
                          <span className="text-slate-500">{ts}</span>
                          {' '}
                          <span className="font-semibold text-sky-400">[{event}]</span>
                          {Object.keys(rest).length > 0 && (
                            <pre className="mt-1 text-slate-500 whitespace-pre-wrap">{JSON.stringify(rest)}</pre>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TelegramPanel
