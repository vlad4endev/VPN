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
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
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
  const [recipientFilter, setRecipientFilter] = useState('all')
  const [broadcastPlan, setBroadcastPlan] = useState('')
  const [broadcastTariffId, setBroadcastTariffId] = useState('')
  const [broadcastButtons, setBroadcastButtons] = useState([{ label: '', url: '' }])
  const [broadcastSending, setBroadcastSending] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [scheduledList, setScheduledList] = useState([])
  const [scheduledLoading, setScheduledLoading] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    scheduledDate: '',
    scheduledTime: '12:00',
    templateId: '',
    type: NOTIFICATION_TYPES.admin_broadcast,
    title: '',
    body: '',
    overview: '',
    recipientFilter: 'all',
    plan: '',
    tariffId: '',
    buttons: [{ label: '', url: '' }],
  })

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
    loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    const y = calendarMonth.getFullYear()
    const m = calendarMonth.getMonth()
    const from = new Date(y, m, 1).toISOString()
    const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString()
    notificationsService.getScheduled({ from, to }).then(setScheduledList).catch((err) => console.warn('MailingsSection: getScheduled failed', err?.message))
  }, [])

  const loadScheduled = useCallback(async () => {
    setScheduledLoading(true)
    try {
      const y = calendarMonth.getFullYear()
      const m = calendarMonth.getMonth()
      const from = new Date(y, m, 1).toISOString()
      const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString()
      const list = await notificationsService.getScheduled({ from, to })
      setScheduledList(list)
    } catch (err) {
      onError?.(err.message)
    } finally {
      setScheduledLoading(false)
    }
  }, [calendarMonth, onError])

  useEffect(() => {
    if (activeTab === 'calendar') loadScheduled()
  }, [activeTab, loadScheduled])

  useEffect(() => {
    if (scheduleModalOpen && !scheduleForm.scheduledDate) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setScheduleForm((f) => ({ ...f, scheduledDate: tomorrow.toISOString().slice(0, 10) }))
    }
  }, [scheduleModalOpen])

  const handleCreateScheduled = async (e) => {
    e.preventDefault()
    const { scheduledDate, scheduledTime, name, templateId, type, title, body, overview, recipientFilter, plan, tariffId, buttons } = scheduleForm
    if (!scheduledDate || !scheduledTime) {
      onError?.('Укажите дату и время')
      return
    }
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      onError?.('Дата и время должны быть в будущем')
      return
    }
    const useTemplate = templateId && templates.find((t) => t.id === templateId)
    const titleVal = useTemplate ? useTemplate.titleTemplate : title.trim()
    const bodyVal = useTemplate ? useTemplate.bodyTemplate : body.trim()
    if (!titleVal || !bodyVal) {
      onError?.('Заполните заголовок и текст или выберите шаблон')
      return
    }
    if (recipientFilter === 'userIds' && userIds.length === 0) {
      onError?.('Выберите получателей или фильтр Всем/По плану/По тарифу')
      return
    }
    setScheduleSaving(true)
    try {
      await notificationsService.createScheduled({
        name: name.trim() || titleVal.slice(0, 100),
        scheduledAt,
        templateId: useTemplate ? useTemplate.id : undefined,
        type,
        title: useTemplate ? undefined : titleVal,
        body: useTemplate ? undefined : bodyVal,
        overview: overview.trim() || null,
        recipientFilter: recipientFilter === 'userIds' && userIds.length > 0 ? 'userIds' : recipientFilter,
        plan: recipientFilter === 'plan' ? plan || undefined : undefined,
        tariffId: recipientFilter === 'tariff' ? tariffId || undefined : undefined,
        userIds: recipientFilter === 'userIds' ? userIds : undefined,
        buttons: buttons.filter((b) => b.label?.trim() || b.url?.trim()).map((b) => ({ label: b.label?.trim(), url: b.url?.trim() })) || undefined,
      })
      onSuccess?.('Рассылка запланирована')
      setScheduleModalOpen(false)
      setScheduleForm({ name: '', scheduledDate: '', scheduledTime: '12:00', templateId: '', type: NOTIFICATION_TYPES.admin_broadcast, title: '', body: '', overview: '', recipientFilter: 'all', plan: '', tariffId: '', buttons: [{ label: '', url: '' }] })
      loadScheduled()
    } catch (err) {
      onError?.(err.message)
    } finally {
      setScheduleSaving(false)
    }
  }

  const handleCancelScheduled = async (id) => {
    if (!window.confirm('Отменить запланированную рассылку?')) return
    try {
      await notificationsService.deleteScheduled(id)
      onSuccess?.('Рассылка отменена')
      setScheduledList((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      onError?.(err.message)
    }
  }

  const userIds = users.map((u) => u.id).filter(Boolean)
  const plans = [...new Set(users.map((u) => u.plan).filter(Boolean))].sort()
  const countByPlan = plans.reduce((acc, p) => ({ ...acc, [p]: users.filter((u) => u.plan === p).length }), {})
  const countByTariff = tariffs.reduce((acc, t) => ({ ...acc, [t.id]: users.filter((u) => u.tariffId === t.id).length }), {})

  const getRecipientSummary = () => {
    if (recipientFilter === 'userIds') return { label: 'Выбранные в таблице', count: userIds.length }
    if (recipientFilter === 'all') return { label: 'Всем пользователям', count: users.length }
    if (recipientFilter === 'plan') return { label: `План «${broadcastPlan || '…'}»`, count: broadcastPlan ? (countByPlan[broadcastPlan] ?? 0) : 0 }
    if (recipientFilter === 'tariff') {
      const name = tariffs.find((t) => t.id === broadcastTariffId)?.name || broadcastTariffId || '…'
      return { label: `Тариф «${name}»`, count: broadcastTariffId ? (countByTariff[broadcastTariffId] ?? 0) : 0 }
    }
    return { label: '', count: 0 }
  }
  const recipientSummary = getRecipientSummary()

  const getScheduledRecipientLabel = (s) => {
    if (s.recipientFilter === 'all') return 'Всем'
    if (s.recipientFilter === 'plan' && s.plan) return `План «${s.plan}»`
    if (s.recipientFilter === 'tariff' && s.tariffId) {
      const t = tariffs.find((tr) => tr.id === s.tariffId)
      return `Тариф «${t?.name || s.tariffId}»`
    }
    if (s.recipientFilter === 'userIds' && Array.isArray(s.userIds)) return `Выбранные (${s.userIds.length})`
    return s.recipientFilter || '—'
  }
  const pendingCount = scheduledList.filter((s) => s.status === 'pending').length

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
      <div className="border-b border-slate-800 flex flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab('broadcast')}
          className={`px-4 py-3 text-sm font-medium flex items-center gap-2 ${activeTab === 'broadcast' ? 'bg-slate-800 text-sky-400 border-b-2 border-sky-500' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Send className="w-4 h-4" />
          Отправить сейчас
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-3 text-sm font-medium flex items-center gap-2 ${activeTab === 'calendar' ? 'bg-slate-800 text-sky-400 border-b-2 border-sky-500' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Calendar className="w-4 h-4" />
          Календарь
          {pendingCount > 0 && (
            <span className="ml-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500/80 text-slate-900 text-xs font-bold">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-3 text-sm font-medium flex items-center gap-2 ${activeTab === 'templates' ? 'bg-slate-800 text-sky-400 border-b-2 border-sky-500' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <FileText className="w-4 h-4" />
          Шаблоны
          {templates.length > 0 && (
            <span className="text-slate-500 text-xs font-normal">({templates.length})</span>
          )}
        </button>
      </div>

      {/* Сводка: шаблоны, запланировано, последняя отправка */}
      <div className="px-4 py-2 sm:px-6 bg-slate-800/50 border-b border-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>Шаблонов: {templatesLoading ? '…' : templates.length}</span>
        <span>Запланировано: {pendingCount}</span>
        {lastResult != null && (
          <span className="text-green-400/90">
            Последняя отправка: {lastResult.sent} доставлено{lastResult.failed > 0 ? `, ${lastResult.failed} ошибок` : ''}
          </span>
        )}
      </div>

      <div className="p-4 sm:p-6">
        {activeTab === 'templates' && (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="text-slate-400 text-sm">
                Шаблоны с переменными (имя, тариф, ссылка на оплату и т.д.) для рассылок и напоминаний. Выберите шаблон во вкладке «Отправить сейчас» или при планировании.
              </p>
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
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center">
                <p className="text-slate-400 mb-2">Шаблонов пока нет</p>
                <p className="text-slate-500 text-sm mb-4">Создайте шаблон, чтобы использовать одни и те же тексты с подстановкой имени, тарифа и ссылки на оплату в рассылках и календаре.</p>
                <button
                  type="button"
                  onClick={() => setTemplateModal({})}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium"
                >
                  <Plus className="w-4 h-4" /> Создать первый шаблон
                </button>
              </div>
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
                        <td className="py-2 flex gap-1 items-center">
                          <button
                            type="button"
                            onClick={() => { setBroadcastTemplateId(t.id); setActiveTab('broadcast') }}
                            className="text-xs px-2 py-1 rounded bg-sky-600/80 hover:bg-sky-600 text-white"
                            title="Использовать в рассылке"
                          >
                            Использовать
                          </button>
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
          <form onSubmit={handleBroadcast} className="space-y-6">
            <p className="text-slate-400 text-sm">
              Отправка уведомлений в центр уведомлений (колокольчик) и при необходимости Web Push. Выберите шаблон или введите текст, укажите получателей и нажмите «Отправить».
            </p>

            <section className="space-y-4">
              <h3 className="text-slate-200 font-medium flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                1. Содержание
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-slate-300 text-sm">
                  Шаблон:
                </label>
                <select
                  value={broadcastTemplateId}
                  onChange={(e) => setBroadcastTemplateId(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 min-w-[200px]"
                >
                  <option value="">Свой текст</option>
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
            </section>

            <section className="space-y-4 border-t border-slate-700 pt-4">
              <h3 className="text-slate-200 font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                2. Получатели
              </h3>
              <div className="rounded-lg bg-slate-800/70 border border-slate-700 px-4 py-3 flex flex-wrap items-center gap-2">
                <span className="text-slate-400 text-sm">Будет отправлено:</span>
                <span className="text-sky-300 font-medium">
                  {recipientSummary.label}
                  {recipientSummary.count >= 0 && (
                    <span className="text-slate-400 font-normal ml-1">({recipientSummary.count})</span>
                  )}
                </span>
                {(recipientFilter === 'plan' && !broadcastPlan) && (
                  <span className="text-amber-400 text-xs">— выберите план</span>
                )}
                {(recipientFilter === 'tariff' && !broadcastTariffId) && (
                  <span className="text-amber-400 text-xs">— выберите тариф</span>
                )}
              </div>
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
            </section>

            <section className="space-y-3 border-t border-slate-700 pt-4">
              <h3 className="text-slate-200 font-medium flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-sky-400" />
                3. Кнопки в уведомлении
              </h3>
              <p className="text-slate-500 text-xs">Добавьте кнопки со ссылками (например, «Оплатить» с URL {'{{paymentLink}}'}). Необязательно.</p>
              <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-300">Кнопки</label>
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
            </section>

            <details className="group border-t border-slate-700 pt-3 mt-3">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 list-none">
                Переменные для подстановки в текст
              </summary>
              <p className="text-xs text-slate-500 mt-1 pl-0">{VARIABLE_HINT}</p>
            </details>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-700">
              <button
                type="submit"
                disabled={broadcastSending || (recipientFilter === 'userIds' && userIds.length === 0) || (!selectedTemplate && (!broadcastTitle.trim() || !broadcastBody.trim())) || (recipientFilter === 'plan' && !broadcastPlan) || (recipientFilter === 'tariff' && !broadcastTariffId)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
              >
                {broadcastSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {broadcastSending ? 'Отправка…' : `Отправить ${recipientSummary.count} получателям`}
              </button>
              {lastResult != null && (
                <span className="text-sm text-green-400">
                  Отправлено: {lastResult.sent}, ошибок: {lastResult.failed ?? 0}
                </span>
              )}
            </div>
          </form>
        )}

        {activeTab === 'calendar' && (
          <>
            <p className="text-slate-400 text-sm mb-4">
              Запланированные рассылки отправляются автоматически в указанное время (проверка каждую минуту). Отменить можно до наступления времени.
            </p>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
                  className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  aria-label="Предыдущий месяц"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-slate-200 font-medium min-w-[160px] text-center">
                  {calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
                  className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  aria-label="Следующий месяц"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Запланировать рассылку
              </button>
            </div>
            {scheduledLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Загрузка…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1 mb-4 text-center text-xs text-slate-500">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 mb-6">
                  {(() => {
                    const y = calendarMonth.getFullYear()
                    const m = calendarMonth.getMonth()
                    const first = new Date(y, m, 1)
                    const last = new Date(y, m + 1, 0)
                    const startOffset = (first.getDay() + 6) % 7
                    const daysInMonth = last.getDate()
                    const cells = []
                    for (let i = 0; i < startOffset; i++) cells.push(<div key={`empty-${i}`} className="aspect-square" />)
                    for (let d = 1; d <= daysInMonth; d++) {
                      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                      const dayStart = `${dateStr}T00:00:00.000Z`
                      const dayEnd = `${dateStr}T23:59:59.999Z`
                      const count = scheduledList.filter((s) => s.status === 'pending' && s.scheduledAt >= dayStart && s.scheduledAt <= dayEnd).length
                      const isPast = new Date(dateStr).setHours(23, 59, 59) < Date.now()
                      cells.push(
                        <div
                          key={d}
                          className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm ${isPast ? 'text-slate-600' : 'text-slate-300'} ${count > 0 ? 'bg-sky-500/20' : 'bg-slate-800/50'}`}
                        >
                          <span>{d}</span>
                          {count > 0 && <span className="text-xs text-sky-400">{count}</span>}
                        </div>
                      )
                    }
                    return cells
                  })()}
                </div>
                <h3 className="text-slate-300 font-medium mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Запланированные и выполненные
                </h3>
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {scheduledList.length === 0 ? (
                    <li className="text-slate-500 text-sm py-2">Нет запланированных рассылок на этот месяц.</li>
                  ) : (
                    scheduledList.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-slate-800 border border-slate-700">
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-200 font-medium truncate">{s.name || s.title || 'Рассылка'}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString('ru-RU') : ''}
                            {' · '}
                            {getScheduledRecipientLabel(s)}
                            {s.status === 'sent' && s.sent != null ? ` · Отправлено: ${s.sent}` : ''}
                            {s.status === 'failed' ? ' · Ошибка' : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${s.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : s.status === 'sent' ? 'bg-green-500/20 text-green-400' : s.status === 'cancelled' ? 'bg-slate-600 text-slate-400' : 'bg-red-500/20 text-red-400'}`}>
                          {s.status === 'pending' ? 'Запланирована' : s.status === 'sent' ? 'Отправлена' : s.status === 'cancelled' ? 'Отменена' : 'Ошибка'}
                        </span>
                        {s.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => handleCancelScheduled(s.id)}
                            className="shrink-0 p-1.5 rounded text-slate-400 hover:bg-red-900/30 hover:text-red-400"
                            title="Отменить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {scheduleModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setScheduleModalOpen(false)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-full max-w-lg my-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5" /> Запланировать рассылку
              </h3>
              <button type="button" onClick={() => setScheduleModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateScheduled} className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Дата</label>
                  <input
                    type="date"
                    value={scheduleForm.scheduledDate}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                    min={new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Время</label>
                  <input
                    type="time"
                    value={scheduleForm.scheduledTime}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Название (для календаря)</label>
                <input
                  type="text"
                  value={scheduleForm.name}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Например: Напоминание об оплате"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Шаблон (опционально)</label>
                <select
                  value={scheduleForm.templateId}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, templateId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                >
                  <option value="">— Свой текст —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {!scheduleForm.templateId && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Заголовок</label>
                    <input
                      type="text"
                      value={scheduleForm.title}
                      onChange={(e) => setScheduleForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Текст</label>
                    <textarea
                      value={scheduleForm.body}
                      onChange={(e) => setScheduleForm((f) => ({ ...f, body: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 resize-y"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Кому</label>
                <select
                  value={scheduleForm.recipientFilter}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, recipientFilter: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                >
                  <option value="all">Всем</option>
                  <option value="userIds">Выбранные в таблице</option>
                  <option value="plan">По плану</option>
                  <option value="tariff">По тарифу</option>
                </select>
                {scheduleForm.recipientFilter === 'plan' && (
                  <select
                    value={scheduleForm.plan}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, plan: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                  >
                    <option value="">— План —</option>
                    {plans.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                )}
                {scheduleForm.recipientFilter === 'tariff' && (
                  <select
                    value={scheduleForm.tariffId}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, tariffId: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                  >
                    <option value="">— Тариф —</option>
                    {tariffs.map((t) => (
                      <option key={t.id} value={t.id}>{t.name || t.id}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setScheduleModalOpen(false)} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">
                  Отмена
                </button>
                <button type="submit" disabled={scheduleSaving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50">
                  {scheduleSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Запланировать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
