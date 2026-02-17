import { useState, useEffect, useCallback } from 'react'
import { Bot, CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { getAiStatus, saveAiSettings, sendAiChat } from '../services/aiAdminService.js'
import logger from '../../../shared/utils/logger.js'

const AI_MODELS = [
  { value: 'deepseek-chat', label: 'deepseek-chat (обычный)' },
  { value: 'deepseek-reasoner', label: 'deepseek-reasoner (режим рассуждений, 128K)' },
]

/**
 * Панель настройки ИИ (DeepSeek): API-ключ, модель, параметры взаимодействия, тест.
 */
const AIPanel = () => {
  const [statusLoading, setStatusLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [model, setModel] = useState('deepseek-chat')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [timeoutSeconds, setTimeoutSeconds] = useState(60)
  const [systemPromptPreset, setSystemPromptPreset] = useState('')
  const [savingAdvanced, setSavingAdvanced] = useState(false)
  const [testMessage, setTestMessage] = useState('Привет, ответь одним словом.')
  const [testResponse, setTestResponse] = useState(null)
  const [testError, setTestError] = useState(null)
  const [testLoading, setTestLoading] = useState(false)

  const loadStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setStatusLoading(true)
    if (!isRefresh) setError(null)
    try {
      const data = await getAiStatus()
      setConfigured(data.configured)
      setModel(data.model || 'deepseek-chat')
      setTemperature(data.temperature != null ? data.temperature : 0.7)
      setMaxTokens(data.maxTokens != null ? data.maxTokens : 2048)
      setTimeoutSeconds(data.timeoutSeconds != null ? data.timeoutSeconds : 60)
      setSystemPromptPreset(data.systemPromptPreset != null ? data.systemPromptPreset : '')
    } catch (err) {
      logger.error('Admin', 'AI status', null, err)
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

  const handleSaveApiKey = async () => {
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      await saveAiSettings({ apiKey: apiKeyInput })
      setApiKeyInput('')
      setSuccess('API-ключ сохранён. Используется для запросов к DeepSeek.')
      setTimeout(() => setSuccess(null), 5000)
      await loadStatus(true)
    } catch (err) {
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAdvanced = async () => {
    setError(null)
    setSuccess(null)
    setSavingAdvanced(true)
    try {
      await saveAiSettings({
        model: model || undefined,
        temperature: Number(temperature),
        maxTokens: Number(maxTokens),
        timeoutSeconds: Number(timeoutSeconds),
        systemPromptPreset: systemPromptPreset || undefined,
      })
      setSuccess('Параметры взаимодействия сохранены.')
      setTimeout(() => setSuccess(null), 4000)
      await loadStatus(true)
    } catch (err) {
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setSavingAdvanced(false)
    }
  }

  const handleTest = async () => {
    setTestError(null)
    setTestResponse(null)
    setTestLoading(true)
    try {
      const messages = []
      if (systemPromptPreset.trim()) {
        messages.push({ role: 'system', content: systemPromptPreset.trim() })
      }
      messages.push({ role: 'user', content: testMessage.trim() || 'Привет' })
      const result = await sendAiChat({
        messages,
        model: model || undefined,
        temperature: Number(temperature),
        max_tokens: Number(maxTokens),
        timeout: Number(timeoutSeconds),
      })
      if (result.success && result.content != null) {
        setTestResponse(result.content)
      } else {
        setTestError(result.error || 'Нет ответа')
      }
    } catch (err) {
      setTestError(err.message || 'Ошибка запроса')
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden max-w-2xl">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          <Bot className="w-5 h-5" />
          ИИ (DeepSeek)
        </h2>
        <button
          type="button"
          onClick={() => loadStatus(true)}
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

        <section className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Текущие настройки</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500 block">API-ключ</span>
              <span className="text-slate-200 font-medium">
                {statusLoading ? '…' : configured ? 'Задан (скрыт)' : 'Не введён'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Модель</span>
              <span className="text-slate-200 font-medium">{statusLoading ? '…' : model || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Temperature</span>
              <span className="text-slate-200 font-medium">{statusLoading ? '…' : temperature}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Макс. токенов ответа</span>
              <span className="text-slate-200 font-medium">{statusLoading ? '…' : maxTokens}</span>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">API-ключ DeepSeek</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-… (platform.deepseek.com/api_keys)"
              className="w-full min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveApiKey}
            disabled={saving}
            className="h-[38px] px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            {saving ? '…' : 'Сохранить ключ'}
          </button>
        </div>

        <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${configured ? 'bg-green-900/20 text-green-300' : 'bg-amber-900/20 text-amber-300'}`}>
          {configured ? (
            <span className="flex items-center gap-2 text-green-300">
              <CheckCircle2 className="w-4 h-4" /> Сервис подключён
            </span>
          ) : (
            <span className="flex items-center gap-2 text-amber-300">
              <XCircle className="w-4 h-4" /> Введите API-ключ в поле выше или задайте DEEPSEEK_API_KEY в server/.env
            </span>
          )}
        </div>

        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 text-sm"
          >
            Детальная настройка взаимодействия с сервисом
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showAdvanced && (
            <div className="p-4 border-t border-slate-700 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Модель</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  {AI_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Temperature (0–1)</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Макс. токенов ответа</label>
                  <input
                    type="number"
                    min={1}
                    max={128000}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                    className="w-full min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Таймаут запроса (сек)</label>
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                  className="w-full min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Системный промпт по умолчанию (роль ассистента)</label>
                <textarea
                  value={systemPromptPreset}
                  onChange={(e) => setSystemPromptPreset(e.target.value)}
                  placeholder="Например: Ты помощник поддержки VPN-сервиса. Отвечай кратко и по делу."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveAdvanced}
                disabled={savingAdvanced}
                className="h-[38px] px-4 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {savingAdvanced ? '…' : 'Сохранить параметры'}
              </button>
            </div>
          )}
        </div>

        {configured && (
          <div className="rounded-lg border border-slate-700 p-3 space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Проверка запроса</h3>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Текст сообщения для теста"
                className="flex-1 min-w-[180px] min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testLoading}
                className="h-[38px] px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {testLoading ? '…' : 'Отправить тест'}
              </button>
            </div>
            {testError && <p className="text-sm text-red-400">{testError}</p>}
            {testResponse != null && (
              <div className="mt-2 p-3 bg-slate-800 rounded-lg border border-slate-700">
                <span className="text-xs text-slate-500 block mb-1">Ответ модели</span>
                <p className="text-slate-200 text-sm whitespace-pre-wrap">{testResponse}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AIPanel
