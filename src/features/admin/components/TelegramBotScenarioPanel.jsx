import { useState, useEffect, useCallback } from 'react'
import { Bot, Plus, Trash2, Save, Loader2, MessageSquare, LayoutGrid, MousePointer } from 'lucide-react'
import { getTelegramScenario, saveTelegramScenario } from '../services/telegramAdminService.js'

const BTN_TYPES = [
  { value: 'web_app', label: 'Web App (приложение)' },
  { value: 'url', label: 'Ссылка' },
  { value: 'callback', label: 'Callback (действие)' },
]

const DEFAULT_BUTTON = { type: 'web_app', text: 'Открыть приложение', url: '', callback_data: '' }

/**
 * Мини-конструктор сценария Telegram-бота: приветствие, меню, кнопки, ответы на callback.
 */
const TelegramBotScenarioPanel = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [scenario, setScenario] = useState({
    welcomeMessage: '',
    menuMessage: '',
    menuButtons: [],
    callbackResponses: {},
  })

  const loadScenario = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { scenario: data } = await getTelegramScenario()
      setScenario({
        welcomeMessage: data.welcomeMessage ?? '',
        menuMessage: data.menuMessage ?? '',
        menuButtons: Array.isArray(data.menuButtons) && data.menuButtons.length > 0
          ? data.menuButtons.map((row) => Array.isArray(row) ? row.map((b) => ({ ...DEFAULT_BUTTON, ...b })) : [{ ...DEFAULT_BUTTON }])
          : [[{ ...DEFAULT_BUTTON }]],
        callbackResponses: {
          PROFILE: (data.callbackResponses && data.callbackResponses.PROFILE) ?? '',
          HELP: (data.callbackResponses && data.callbackResponses.HELP) ?? '',
          MENU: (data.callbackResponses && data.callbackResponses.MENU) ?? '',
        },
      })
    } catch (err) {
      setError(err.message || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadScenario()
  }, [loadScenario])

  const handleSave = async () => {
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const payload = {
        welcomeMessage: scenario.welcomeMessage.trim(),
        menuMessage: scenario.menuMessage.trim(),
        menuButtons: scenario.menuButtons.map((row) =>
          row.map((btn) => ({
            type: btn.type || 'callback',
            text: (btn.text || '').trim() || 'Кнопка',
            url: (btn.url || '').trim(),
            callback_data: (btn.callback_data || '').trim(),
          }))
        ).filter((row) => row.length > 0),
        callbackResponses: {
          PROFILE: (scenario.callbackResponses.PROFILE || '').trim(),
          HELP: (scenario.callbackResponses.HELP || '').trim(),
          MENU: (scenario.callbackResponses.MENU || '').trim(),
        },
      }
      await saveTelegramScenario(payload)
      setSuccess('Сценарий сохранён. Изменения применятся к боту сразу.')
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const addRow = () => {
    setScenario((s) => ({
      ...s,
      menuButtons: [...s.menuButtons, [{ type: 'callback', text: 'Кнопка', url: '', callback_data: 'MENU' }]],
    }))
  }

  const removeRow = (rowIndex) => {
    if (scenario.menuButtons.length <= 1) return
    setScenario((s) => ({
      ...s,
      menuButtons: s.menuButtons.filter((_, i) => i !== rowIndex),
    }))
  }

  const addButton = (rowIndex) => {
    setScenario((s) => ({
      ...s,
      menuButtons: s.menuButtons.map((row, i) =>
        i === rowIndex ? [...row, { type: 'callback', text: 'Кнопка', url: '', callback_data: 'MENU' }] : row
      ),
    }))
  }

  const removeButton = (rowIndex, btnIndex) => {
    setScenario((s) => ({
      ...s,
      menuButtons: s.menuButtons
        .map((row, i) => (i === rowIndex ? row.filter((_, j) => j !== btnIndex) : row))
        .filter((row) => row.length > 0),
    }))
  }

  const updateButton = (rowIndex, btnIndex, field, value) => {
    setScenario((s) => ({
      ...s,
      menuButtons: s.menuButtons.map((row, i) =>
        i === rowIndex
          ? row.map((btn, j) => (j === btnIndex ? { ...btn, [field]: value } : btn))
          : row
      ),
    }))
  }

  const inputCls = 'w-full min-h-[38px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs text-slate-500 mb-1'
  const sectionCls = 'rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden'

  if (loading) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 flex items-center justify-center gap-2 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Загрузка сценария…</span>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden max-w-3xl">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          <Bot className="w-5 h-5" />
          Сценарий бота
        </h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>

      <div className="p-4 space-y-6">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
        )}
        {success && (
          <div className="p-3 bg-green-900/30 border border-green-800 rounded-lg text-green-300 text-sm">{success}</div>
        )}

        <section className={sectionCls}>
          <div className="p-3 border-b border-slate-700 flex items-center gap-2 text-slate-300">
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm font-medium">Приветствие (после /start)</span>
          </div>
          <div className="p-3">
            <label className={labelCls}>Второе сообщение после главного меню</label>
            <textarea
              value={scenario.welcomeMessage}
              onChange={(e) => setScenario((s) => ({ ...s, welcomeMessage: e.target.value }))}
              placeholder="Например: Чтобы привязать аккаунт: Личный кабинет → Профиль → Telegram → «Привязать»."
              rows={2}
              className={inputCls + ' resize-y'}
            />
          </div>
        </section>

        <section className={sectionCls}>
          <div className="p-3 border-b border-slate-700 flex items-center gap-2 text-slate-300">
            <LayoutGrid className="w-4 h-4" />
            <span className="text-sm font-medium">Главное меню</span>
          </div>
          <div className="p-3 space-y-3">
            <div>
              <label className={labelCls}>Текст сообщения с кнопками (/menu и при /start)</label>
              <textarea
                value={scenario.menuMessage}
                onChange={(e) => setScenario((s) => ({ ...s, menuMessage: e.target.value }))}
                placeholder="🚀 VPN Панель — создание конфигов, подписки, поддержка."
                rows={3}
                className={inputCls + ' resize-y'}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls}>Кнопки (ряд за рядом)</label>
                <button type="button" onClick={addRow} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Добавить ряд
                </button>
              </div>
              <div className="space-y-3">
                {scenario.menuButtons.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex flex-wrap items-start gap-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700">
                    <span className="text-xs text-slate-500 w-full">Ряд {rowIndex + 1}</span>
                    {row.map((btn, btnIndex) => (
                      <div key={btnIndex} className="flex flex-wrap items-center gap-2 p-2 rounded bg-slate-900 border border-slate-600 min-w-[200px]">
                        <select
                          value={btn.type}
                          onChange={(e) => updateButton(rowIndex, btnIndex, 'type', e.target.value)}
                          className="w-full max-w-[140px] h-8 px-2 bg-slate-800 border border-slate-600 rounded text-slate-200 text-xs"
                        >
                          {BTN_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={btn.text}
                          onChange={(e) => updateButton(rowIndex, btnIndex, 'text', e.target.value)}
                          placeholder="Текст кнопки"
                          className="flex-1 min-w-[80px] h-8 px-2 bg-slate-800 border border-slate-600 rounded text-slate-200 text-xs"
                        />
                        {(btn.type === 'web_app' || btn.type === 'url') && (
                          <input
                            type="text"
                            value={btn.url}
                            onChange={(e) => updateButton(rowIndex, btnIndex, 'url', e.target.value)}
                            placeholder={btn.type === 'web_app' ? 'URL или пусто' : 'URL'}
                            className="flex-1 min-w-[100px] h-8 px-2 bg-slate-800 border border-slate-600 rounded text-slate-200 text-xs"
                          />
                        )}
                        {btn.type === 'callback' && (
                          <input
                            type="text"
                            value={btn.callback_data}
                            onChange={(e) => updateButton(rowIndex, btnIndex, 'callback_data', e.target.value)}
                            placeholder="PROFILE, HELP, MENU"
                            className="w-24 h-8 px-2 bg-slate-800 border border-slate-600 rounded text-slate-200 text-xs"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeButton(rowIndex, btnIndex)}
                          className="p-1.5 rounded text-slate-400 hover:bg-red-900/30 hover:text-red-400"
                          title="Удалить кнопку"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addButton(rowIndex)}
                      className="text-xs text-slate-400 hover:text-slate-300 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Кнопку
                    </button>
                    {scenario.menuButtons.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Удалить ряд
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={sectionCls}>
          <div className="p-3 border-b border-slate-700 flex items-center gap-2 text-slate-300">
            <MousePointer className="w-4 h-4" />
            <span className="text-sm font-medium">Ответы на нажатие кнопок (HTML)</span>
          </div>
          <div className="p-3 space-y-3">
            <p className="text-xs text-slate-500">Текст, который показывается при нажатии кнопки с указанным callback_data. Оставьте пустым — будет использован стандартный.</p>
            {['PROFILE', 'HELP', 'MENU'].map((key) => (
              <div key={key}>
                <label className={labelCls}>{key}</label>
                <textarea
                  value={scenario.callbackResponses[key] ?? ''}
                  onChange={(e) =>
                    setScenario((s) => ({
                      ...s,
                      callbackResponses: { ...s.callbackResponses, [key]: e.target.value },
                    }))
                  }
                  placeholder={key === 'PROFILE' ? 'Имя и план (можно с переменными)' : key === 'HELP' ? 'Текст помощи' : 'Текст главного меню'}
                  rows={2}
                  className={inputCls + ' resize-y'}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default TelegramBotScenarioPanel
