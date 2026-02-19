import React, { useState, useEffect, useCallback } from 'react'
import {
  Megaphone,
  Send,
  Loader2,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Users,
  Filter,
  ChevronDown,
  X,
  ExternalLink,
} from 'lucide-react'
import { notificationsService } from '../services/notificationsService.js'
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from '../constants.js'

const VARIABLE_HINT = 'Переменные: {{user.name}}, {{user.email}}, {{user.login}}, {{user.tariffName}}, {{user.plan}}, {{user.expiresAt}}, {{paymentLink}}'

/** Модалка создания/редактирования шаблона */
function TemplateModal({ template, onClose, onSave, saving }) {
  const [name, setName] = useState(template?.name ?? '')
  const [type, setType] = useState(template?.type ?? NOTIFICATION_TYPES.admin_broadcast)
  const [titleTemplate, setTitleTemplate] = useState(template?.titleTemplate ?? '')
  const [bodyTemplate, setBodyTemplate] = useState(template?.bodyTemplate ?? '')
  const [overviewTemplate, setOverviewTemplate] = useState(template?.overviewTemplate ?? '')
  const [buttons, setButtons] = useState(
    Array.isArray(template?.buttons) && template.buttons.length > 0
      ? template.buttons.map((b) => ({ label: b.label || '', url: b.url || '' }))
      : [{ label: '', url: '' }]
  )

  useEffect(() => {
    if (template) {
      setName(template.name ?? '')
      setType(template.type ?? NOTIFICATION_TYPES.admin_broadcast)
      setTitleTemplate(template.titleTemplate ?? '')
      setBodyTemplate(template.bodyTemplate ?? '')
      setOverviewTemplate(template.overviewTemplate ?? '')
      setButtons(
        Array.isArray(template.buttons) && template.buttons.length > 0
          ? template.buttons.map((b) => ({ label: b.label || '', url: b.url || '' }))
          : [{ label: '', url: '' }]
      )
    }
  }, [template])

  const addButton = () => setButtons((prev) => [...prev, { label: '', url: '' }])
  const removeButton = (i) => setButtons((prev) => prev.filter((_, idx) => idx !== i))
  const setButton = (i, field, value) =>
    setButtons((prev) => prev.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)))

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = {
      name: name.trim(),
      type: type.trim(),
      titleTemplate: titleTemplate.trim(),
      bodyTemplate: bodyTemplate.trim(),
      overviewTemplate: overviewTemplate.trim() || null,
      buttons: buttons.filter((b) => b.label.trim() || b.url.trim()).map((b) => ({ label: b.label.trim(), url: b.url.trim() })),
    }
    onSave(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {template?.id ? 'Редактировать шаблон' : 'Новый шаблон'}
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Название шаблона</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
              placeholder="Например: Напоминание об оплате"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Тип уведомления</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
            >
              {Object.entries(NOTIFICATION_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Заголовок (шаблон)</label>
            <input
              type="text"
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
              placeholder="Пора оплатить подписку, {{user.name}}!"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Текст (шаблон)</label>
            <textarea
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 resize-y"
              placeholder="Ваша подписка {{user.tariffName}} истекает {{user.expiresAt}}. Оплатите: {{paymentLink}}"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Обзор (опционально)</label>
            <textarea
              value={overviewTemplate}
              onChange={(e) => setOverviewTemplate(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 resize-y"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-300">Кнопки (опционально)</label>
              <button type="button" onClick={addButton} className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1">
                <Plus className="w-4 h-4" /> Добавить
              </button>
            </div>
            {buttons.map((b, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={b.label}
                  onChange={(e) => setButton(i, 'label', e.target.value)}
                  placeholder="Текст кнопки"
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm"
                />
                <input
                  type="text"
                  value={b.url}
                  onChange={(e) => setButton(i, 'url', e.target.value)}
                  placeholder="URL (можно {{paymentLink}})"
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm"
                />
                <button type="button" onClick={() => removeButton(i)} className="p-2 text-red-400 hover:bg-slate-800 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">{VARIABLE_HINT}</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">
              Отмена
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {template?.id ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function MailingsSection({ users = [], tariffs = [], onSuccess, onError }) {
  const [activeTab, setActiveTab] = useState('broadcast')
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateModal, setTemplateModal] = useState(null)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [broadcastTemplateId, setBroadcastTemplateId] = useState('')
  const [broadcastType, setBroadcastType] = useState(NOTIFICATION_TYPES.admin_broadcast)
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastBody, setBroadcastBody] = useState('')
  const [broadcastOverview, setBroadcastOverview] = useState('')
  const [recipientFilter, setRecipientFilter] = useState('userIds')
  const [broadcastPlan, setBroadcastPlan] = useState('')
  const [broadcastTariffId, setBroadcastTariffId] = useState('')
  const [broadcastButtons, setBroadcastButtons] = useState([{ label: '', url: '' }])
  const [broadcastSending, setBroadcastSending] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const list = await notificationsService.getTemplates()
      setTemplates(list)
    } catch (err) {
      onError?.(err.message)
    } finally {
      setTemplatesLoading(false)
    }
  }, [onError])

  useEffect(() => {
    if (activeTab === 'templates') loadTemplates()
  }, [activeTab, loadTemplates])

  const userIds = users.map((u) => u.id).filter(Boolean)
  const plans = [...new Set(users.map((u) => u.plan).filter(Boolean))].sort()

  const handleSaveTemplate = async (payload) => {
    setTemplateSaving(true)
    try {
      if (templateModal?.id) {
        await notificationsService.updateTemplate(templateModal.id, payload)
        onSuccess?.('Шаблон обновлён')
      } else {
        await notificationsService.createTemplate(payload)
        onSuccess?.('Шаблон создан')
      }
      setTemplateModal(null)
      loadTemplates()
    } catch (err) {
      onError?.(err.message)
    } finally {
      setTemplateSaving(false)
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Удалить этот шаблон?')) return
    try {
      await notificationsService.deleteTemplate(id)
      onSuccess?.('Шаблон удалён')
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      if (broadcastTemplateId === id) setBroadcastTemplateId('')
    } catch (err) {
      onError?.(err.message)
    }
  }

  const addBroadcastButton = () => setBroadcastButtons((prev) => [...prev, { label: '', url: '' }])
  const removeBroadcastButton = (i) => setBroadcastButtons((prev) => prev.filter((_, idx) => idx !== i))
  const setBroadcastButton = (i, field, value) =>
    setBroadcastButtons((prev) => prev.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)))

  const handleBroadcast = async (e) => {
    e.preventDefault()
    const useTemplate = broadcastTemplateId && templates.find((t) => t.id === broadcastTemplateId)
    const title = useTemplate ? useTemplate.titleTemplate : broadcastTitle.trim()
    const body = useTemplate ? useTemplate.bodyTemplate : broadcastBody.trim()
    if (!title || !body) {
      onError?.('Заполните заголовок и текст или выберите шаблон')
      return
    }
    if (recipientFilter === 'userIds' && userIds.length === 0) {
      onError?.('Выберите пользователей в таблице или используйте фильтр «Всем» / «По тарифу» / «По плану»')
      return
    }
    setBroadcastSending(true)
    setLastResult(null)
    try {
      const result = await notificationsService.broadcastViaApi(
        recipientFilter === 'userIds' ? userIds : [],
        {
          templateId: useTemplate ? useTemplate.id : undefined,
          type: broadcastType,
          title: useTemplate ? undefined : title,
          body: useTemplate ? undefined : body,
          overview: useTemplate ? undefined : (broadcastOverview.trim() || null),
          recipientFilter: recipientFilter === 'userIds' && userIds.length > 0 ? 'userIds' : recipientFilter === 'all' ? 'all' : recipientFilter === 'plan' ? 'plan' : 'tariff',
          plan: recipientFilter === 'plan' ? broadcastPlan || undefined : undefined,
          tariffId: recipientFilter === 'tariff' ? broadcastTariffId || undefined : undefined,
          buttons: broadcastButtons.filter((b) => b.label.trim() || b.url.trim()).length > 0
            ? broadcastButtons.filter((b) => b.label.trim() || b.url.trim()).map((b) => ({ label: b.label.trim(), url: b.url.trim() }))
            : undefined,
        }
      )
      setLastResult(result)
      onSuccess?.(`Отправлено: ${result.sent ?? 0}${result.failed > 0 ? `, ошибок: ${result.failed}` : ''}`)
    } catch (err) {
      onError?.(err.message)
    } finally {
      setBroadcastSending(false)
    }
  }

  const selectedTemplate = broadcastTemplateId ? templates.find((t) => t.id === broadcastTemplateId) : null

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      <div className="border-b border-slate-800 flex">
        <button
          type="button"
          onClick={() => setActiveTab('broadcast')}
          className={`px-4 py-3 text-sm font-medium flex items-center gap-2 ${activeTab === 'broadcast' ? 'bg-slate-800 text-sky-400 border-b-2 border-sky-500' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Send className="w-4 h-4" />
          Рассылка
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-3 text-sm font-medium flex items-center gap-2 ${activeTab === 'templates' ? 'bg-slate-800 text-sky-400 border-b-2 border-sky-500' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <FileText className="w-4 h-4" />
          Шаблоны
        </button>
      </div>

      <div className="p-4 sm:p-6">
        {activeTab === 'templates' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-400 text-sm">Шаблоны с переменными для рассылок и напоминаний.</p>
              <button
                type="button"
                onClick={() => setTemplateModal({})}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Создать шаблон
              </button>
            </div>
            {templatesLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Загрузка…
              </div>
            ) : templates.length === 0 ? (
              <p className="text-slate-500 py-4">Нет шаблонов. Создайте шаблон для рассылок с подстановкой имени, тарифа, ссылки на оплату и т.д.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 pr-4">Название</th>
                      <th className="pb-2 pr-4">Тип</th>
                      <th className="pb-2 pr-4">Заголовок</th>
                      <th className="pb-2 pr-4 w-24">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((t) => (
                      <tr key={t.id} className="border-b border-slate-800">
                        <td className="py-2 pr-4 text-slate-200 font-medium">{t.name}</td>
                        <td className="py-2 pr-4 text-slate-400">{NOTIFICATION_TYPE_LABELS[t.type] || t.type}</td>
                        <td className="py-2 pr-4 text-slate-400 truncate max-w-xs">{t.titleTemplate}</td>
                        <td className="py-2 flex gap-1">
                          <button type="button" onClick={() => setTemplateModal(t)} className="p-1.5 rounded text-slate-400 hover:bg-slate-700 hover:text-white" title="Редактировать">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => handleDeleteTemplate(t.id)} className="p-1.5 rounded text-slate-400 hover:bg-red-900/50 hover:text-red-400" title="Удалить">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === 'broadcast' && (
          <form onSubmit={handleBroadcast} className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <label className="flex items-center gap-2 text-slate-300">
                <FileText className="w-4 h-4" />
                Шаблон (опционально):
              </label>
              <select
                value={broadcastTemplateId}
                onChange={(e) => setBroadcastTemplateId(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 min-w-[200px]"
              >
                <option value="">— Свой текст —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {!selectedTemplate && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Тип</label>
                  <select
                    value={broadcastType}
                    onChange={(e) => setBroadcastType(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                  >
                    {Object.entries(NOTIFICATION_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Заголовок</label>
                  <input
                    type="text"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="Заголовок уведомления"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Текст</label>
                  <textarea
                    value={broadcastBody}
                    onChange={(e) => setBroadcastBody(e.target.value)}
                    rows={3}
                    placeholder="Текст (можно использовать переменные)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 resize-y"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Обзор (опционально)</label>
                  <textarea
                    value={broadcastOverview}
                    onChange={(e) => setBroadcastOverview(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 resize-y"
                  />
                </div>
              </>
            )}

            <div className="border-t border-slate-700 pt-4">
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <Filter className="w-4 h-4" /> Кому отправить
              </label>
              <div className="flex flex-wrap gap-3 items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientFilter"
                    checked={recipientFilter === 'userIds'}
                    onChange={() => setRecipientFilter('userIds')}
                    className="rounded border-slate-600 text-sky-500"
                  />
                  <span className="text-slate-300">Выбранные в таблице</span>
                  <span className="text-slate-500 text-sm">({userIds.length})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientFilter"
                    checked={recipientFilter === 'all'}
                    onChange={() => setRecipientFilter('all')}
                    className="rounded border-slate-600 text-sky-500"
                  />
                  <span className="text-slate-300">Всем</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientFilter"
                    checked={recipientFilter === 'plan'}
                    onChange={() => setRecipientFilter('plan')}
                    className="rounded border-slate-600 text-sky-500"
                  />
                  <span className="text-slate-300">По плану</span>
                </label>
                {recipientFilter === 'plan' && (
                  <select
                    value={broadcastPlan}
                    onChange={(e) => setBroadcastPlan(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm"
                  >
                    <option value="">— Выберите план —</option>
                    {plans.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientFilter"
                    checked={recipientFilter === 'tariff'}
                    onChange={() => setRecipientFilter('tariff')}
                    className="rounded border-slate-600 text-sky-500"
                  />
                  <span className="text-slate-300">По тарифу</span>
                </label>
                {recipientFilter === 'tariff' && (
                  <select
                    value={broadcastTariffId}
                    onChange={(e) => setBroadcastTariffId(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm min-w-[160px]"
                  >
                    <option value="">— Выберите тариф —</option>
                    {tariffs.map((t) => (
                      <option key={t.id} value={t.id}>{t.name || t.id}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-300">Кнопки в уведомлении (опционально)</label>
                <button type="button" onClick={addBroadcastButton} className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Добавить
                </button>
              </div>
              {broadcastButtons.map((b, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={b.label}
                    onChange={(e) => setBroadcastButton(i, 'label', e.target.value)}
                    placeholder="Текст кнопки"
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm"
                  />
                  <input
                    type="text"
                    value={b.url}
                    onChange={(e) => setBroadcastButton(i, 'url', e.target.value)}
                    placeholder="URL или {{paymentLink}}"
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm"
                  />
                  <button type="button" onClick={() => removeBroadcastButton(i)} className="p-2 text-red-400 hover:bg-slate-800 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500">{VARIABLE_HINT}</p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={broadcastSending || (recipientFilter === 'userIds' && userIds.length === 0) || (!selectedTemplate && (!broadcastTitle.trim() || !broadcastBody.trim()))}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
              >
                {broadcastSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {broadcastSending ? 'Отправка…' : `Отправить ${recipientFilter === 'userIds' ? `(${userIds.length})` : recipientFilter === 'all' ? '(всем)' : recipientFilter === 'plan' ? `(план ${broadcastPlan || '?'})` : `(тариф)`}`}
              </button>
              {lastResult != null && (
                <span className="text-sm text-green-400">
                  Отправлено: {lastResult.sent}, ошибок: {lastResult.failed ?? 0}
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {templateModal != null && (
        <TemplateModal
          template={templateModal.id ? templateModal : null}
          onClose={() => setTemplateModal(null)}
          onSave={handleSaveTemplate}
          saving={templateSaving}
        />
      )}
    </div>
  )
}
