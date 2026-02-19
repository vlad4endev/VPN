import { useState, useEffect, useCallback } from 'react'
import { TrendingDown, RefreshCw, Loader2, AlertCircle, Users, Target, Zap, UserX, Send, Sparkles, X, Copy, Percent, Gift } from 'lucide-react'
import { getFunnel, refreshMetrics, sendChurnOffer, getAiStrategy, assignDiscount, sendUserTelegram } from '../services/analyticsFunnelService.js'
import { notificationsService } from '../../notifications/services/notificationsService.js'
import { NOTIFICATION_TYPES } from '../../notifications/constants.js'
import UserCard from './UserCard.jsx'

const SEGMENT_LABELS = {
  new: 'Новые',
  active: 'Активные',
  risk: 'В зоне риска',
  churning: 'Уходящие',
  lost: 'Потерянные',
}

const SEGMENT_COLORS = {
  new: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  risk: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  churning: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  lost: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
}

function displayName(row, users = []) {
  const fromRow = (row.name && row.name.trim()) || (row.email && row.email.trim())
  if (fromRow) return fromRow
  const user = users.find((u) => u.id === row.userId)
  const fromUser = (user?.name && String(user.name).trim()) || (user?.email && String(user.email).trim())
  if (fromUser) return fromUser
  return row.userId || '—'
}

export default function AnalyticsFunnelPanel({ users = [], tariffs = [], formatDate, onCopy }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshingMetrics, setRefreshingMetrics] = useState(false)
  const [sendingOffer, setSendingOffer] = useState(null)
  const [aiModal, setAiModal] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [aiError, setAiError] = useState(null)
  const [includeMetricsSummary, setIncludeMetricsSummary] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [discountPercent, setDiscountPercent] = useState(15)
  const [discountFrom, setDiscountFrom] = useState('')
  const [discountTo, setDiscountTo] = useState('')
  const [discountSaving, setDiscountSaving] = useState(false)
  const [discountStatus, setDiscountStatus] = useState(null)
  const [offerMessage, setOfferMessage] = useState('')
  const [offerSending, setOfferSending] = useState(false)
  const [offerStatus, setOfferStatus] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getFunnel()
      setData(res)
    } catch (e) {
      setError(e.message || 'Ошибка загрузки воронки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleRefreshMetrics = async () => {
    setRefreshingMetrics(true)
    setError(null)
    try {
      await refreshMetrics({ limit: 2000 })
      await load()
    } catch (e) {
      setError(e.message || 'Ошибка обновления метрик')
    } finally {
      setRefreshingMetrics(false)
    }
  }

  const handleSendOffer = async (userId) => {
    setSendingOffer(userId)
    setError(null)
    try {
      await sendChurnOffer(userId)
      await load()
    } catch (e) {
      setError(e.message || 'Ошибка отправки оффера')
    } finally {
      setSendingOffer(null)
    }
  }

  const handleOpenAiStrategy = (row) => {
    setAiModal({ userId: row.userId, segment: row.segment, churnScore: row.churnScore })
    setAiResult(null)
    setAiError(null)
    setDiscountStatus(null)
    setOfferStatus(null)
    setOfferMessage('')
    const now = new Date()
    const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    setDiscountFrom(now.toISOString().slice(0, 16))
    setDiscountTo(in14.toISOString().slice(0, 16))
  }

  const handleRunAiStrategy = useCallback(async () => {
    if (!aiModal?.userId) return
    setAiLoading(true)
    setAiError(null)
    try {
      const result = await getAiStrategy(aiModal.userId, { includeMetricsSummary })
      setAiResult(result)
      setOfferMessage(result.suggestedOfferMessage || '')
    } catch (e) {
      setAiError(e.message || 'Ошибка анализа ИИ')
    } finally {
      setAiLoading(false)
    }
  }, [aiModal?.userId, includeMetricsSummary])

  const handleSendOfferToTelegram = useCallback(async () => {
    if (!aiModal?.userId) return
    const text = (offerMessage || aiResult?.suggestedOfferMessage || '').trim()
    if (!text) {
      setOfferStatus({ error: 'Введите текст предложения или запустите анализ ИИ' })
      return
    }
    setOfferSending(true)
    setOfferStatus(null)
    try {
      const res = await sendUserTelegram(aiModal.userId, text)
      setOfferStatus(res.sent ? { success: true } : { success: false, error: res.reason || 'Не отправлено' })
    } catch (e) {
      setOfferStatus({ error: e.message || 'Ошибка отправки в Telegram' })
    } finally {
      setOfferSending(false)
    }
  }, [aiModal?.userId, offerMessage, aiResult?.suggestedOfferMessage])

  const handleCopyMessage = useCallback(() => {
    const text = offerMessage || aiResult?.suggestedOfferMessage || aiResult?.message
    if (text) {
      navigator.clipboard.writeText(text).catch(() => {})
    }
  }, [offerMessage, aiResult?.suggestedOfferMessage, aiResult?.message])

  const handleAssignDiscount = useCallback(async () => {
    if (!aiModal?.userId) return
    const fromMs = new Date(discountFrom).getTime()
    const toMs = new Date(discountTo).getTime()
    if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) {
      setDiscountStatus({ error: 'Укажите корректный период действия скидки' })
      return
    }
    setDiscountSaving(true)
    setDiscountStatus(null)
    try {
      const res = await assignDiscount(aiModal.userId, {
        percent: discountPercent,
        validFrom: new Date(discountFrom).toISOString(),
        validTo: new Date(discountTo).toISOString(),
      })
      setDiscountStatus({
        success: true,
        telegramSent: res.telegramSent,
        reason: res.reason,
      })
    } catch (e) {
      setDiscountStatus({ error: e.message || 'Ошибка назначения скидки' })
    } finally {
      setDiscountSaving(false)
    }
  }, [aiModal?.userId, discountPercent, discountFrom, discountTo])

  const handleSendOfferNotification = useCallback(async () => {
    if (!aiModal?.userId) return
    const text = (offerMessage || '').trim()
    if (!text) {
      setOfferStatus({ error: 'Введите текст предложения или запустите анализ ИИ' })
      return
    }
    setOfferSending(true)
    setOfferStatus(null)
    try {
      await notificationsService.sendToOne(aiModal.userId, {
        type: NOTIFICATION_TYPES.admin_broadcast,
        title: 'Специальное предложение для вас',
        body: text,
        overview: 'Предложение от сервиса',
      })
      setOfferStatus({ success: true })
    } catch (e) {
      setOfferStatus({ error: e.message || 'Ошибка отправки' })
    } finally {
      setOfferSending(false)
    }
  }, [aiModal?.userId, offerMessage])

  const closeAiModal = () => {
    setAiModal(null)
    setAiResult(null)
    setAiError(null)
  }

  const handleRowClick = (row, e) => {
    if (e.target.closest('button')) return
    const user = users.find((u) => u.id === row.userId)
    if (user) setSelectedUser(user)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 flex flex-col items-center gap-3">
        <AlertCircle className="w-10 h-10 text-amber-400" />
        <p className="text-slate-300 text-center">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
        >
          Повторить
        </button>
      </div>
    )
  }

  const segments = data?.segments || {}
  const topByPriority = data?.topByPriority || []
  const noSubscriptionOrExpired = data?.noSubscriptionOrExpired || []
  const avgChurn = data?.avgChurnScore ?? 0
  const forecast = data?.churnForecast || {}
  const totalUsers = data?.totalUsers ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-sky-400" />
            AI-Воронка
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Сегменты, приоритет удержания и прогноз оттока. Сначала обновите метрики, если данных нет.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshMetrics}
            disabled={refreshingMetrics}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm"
          >
            {refreshingMetrics ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Обновить метрики
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Обновить воронку
          </button>
        </div>
      </div>

      {error && data && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-amber-200 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Сводка */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 sm:p-5">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Сводка</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex items-start gap-2">
            <span className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-slate-400" />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-semibold text-slate-100 tabular-nums">{totalUsers}</p>
              <p className="text-xs text-slate-500">пользователей в воронке</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="w-4 h-4 text-amber-400" />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-semibold text-slate-100 tabular-nums">{avgChurn}</p>
              <p className="text-xs text-slate-500">средний churn score</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 text-orange-400" />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-semibold text-slate-100 tabular-nums">{forecast.atRiskUsers ?? 0}</p>
              <p className="text-xs text-slate-500">в зоне риска / уходящие</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-slate-400" />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-semibold text-slate-100 tabular-nums">{forecast.estimatedChurnRate ?? 0}%</p>
              <p className="text-xs text-slate-500">прогноз оттока</p>
            </div>
          </div>
        </div>
      </section>

      {/* Пользователи без подписки / давно не продлевали */}
      {noSubscriptionOrExpired.length > 0 && (
        <section className="rounded-xl bg-slate-900 border border-orange-800/50 p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
            Без подписки или давно не продлевали (топ 50) — приоритет тем, у кого были тикеты «не работало / не смогли воспользоваться»
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-700">
                  <th className="pb-2 pr-3 font-medium">Клиент</th>
                  <th className="pb-2 pr-3 font-medium">Сегмент</th>
                  <th className="pb-2 pr-3 font-medium">Churn</th>
                  <th className="pb-2 pr-3 font-medium">Приоритет</th>
                  <th className="pb-2 pr-3 font-medium">LTV</th>
                  <th className="pb-2 pr-3 font-medium">Тикеты / поощрения</th>
                  <th className="pb-2 pr-3 font-medium">Действие</th>
                </tr>
              </thead>
              <tbody>
                {noSubscriptionOrExpired.map((row) => (
                  <tr
                    key={row.userId}
                    className="border-b border-slate-800/80 hover:bg-slate-800/50 cursor-pointer transition-colors"
                    onClick={(e) => handleRowClick(row, e)}
                  >
                    <td className="py-2 pr-3 text-slate-200 truncate max-w-[180px]" title={row.email || row.userId}>
                      {displayName(row, users)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex px-2 py-0.5 rounded border text-xs ${SEGMENT_COLORS[row.segment] || ''}`}>
                        {SEGMENT_LABELS[row.segment] || row.segment}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-300 tabular-nums">{row.churnScore ?? '-'}</td>
                    <td className="py-2 pr-3 text-slate-300 tabular-nums">{row.priorityScore ?? '-'}</td>
                    <td className="py-2 pr-3 text-slate-300 tabular-nums">{row.lifetimeValue ?? 0}</td>
                    <td className="py-2 pr-3">
                      {row.hasProblemTickets ? (
                        <span className="inline-flex flex-col gap-0.5" title={Array.isArray(row.problemTicketSubjects) && row.problemTicketSubjects.length ? row.problemTicketSubjects.join(' • ') : ''}>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs">
                            Нужны поощрения
                          </span>
                          <span className="text-slate-500 text-xs">тикетов: {row.problemTicketsCount ?? 0}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenAiStrategy(row)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs"
                        title="Запустить анализ ИИ"
                      >
                        <Sparkles className="w-3 h-3" />
                        Анализ ИИ
                      </button>
                      {row.churnScore > 80 && (
                        <button
                          type="button"
                          onClick={() => handleSendOffer(row.userId)}
                          disabled={sendingOffer === row.userId}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded text-xs"
                          title="Отправить оффер в Telegram"
                        >
                          {sendingOffer === row.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Оффер в TG
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Сегменты */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 p-4 sm:p-5">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Сегменты</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(segments).map(([key, count]) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${SEGMENT_COLORS[key] || 'bg-slate-700 text-slate-300 border-slate-600'}`}
            >
              {SEGMENT_LABELS[key] || key}: {count}
            </span>
          ))}
          {Object.keys(segments).length === 0 && (
            <p className="text-slate-500 text-sm">Нет данных. Нажмите «Обновить метрики».</p>
          )}
        </div>
      </section>

      {/* Модалка: анализ ИИ — стратегия и сообщение */}
      {aiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeAiModal}>
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                Анализ ИИ
              </h3>
              <button type="button" onClick={closeAiModal} className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <p className="text-sm text-slate-500">
                userId: <span className="font-mono text-slate-400">{aiModal.userId}</span>
                {aiModal.segment != null && (
                  <> · Сегмент: <span className={`inline-flex px-2 py-0.5 rounded border text-xs ${SEGMENT_COLORS[aiModal.segment] || ''}`}>{SEGMENT_LABELS[aiModal.segment] || aiModal.segment}</span></>
                )}
                {aiModal.churnScore != null && <> · Churn: {aiModal.churnScore}</>}
              </p>
              {aiError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-red-300 text-sm">{aiError}</div>
              )}
              {!aiResult && !aiLoading && (
                <p className="text-slate-400 text-sm">Нажмите «Запустить анализ», чтобы ИИ проанализировал клиента и дал шаги действий для вас и вариант текста предложения.</p>
              )}
              {aiLoading && (
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Анализ...
                </div>
              )}
              {aiResult && (
                <>
                  {aiResult.strategy && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Обоснование</p>
                      <p className="text-slate-300 text-sm whitespace-pre-wrap">{aiResult.strategy}</p>
                    </div>
                  )}
                  {Array.isArray(aiResult.steps) && aiResult.steps.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Шаги для вас</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-300 text-sm">
                        {aiResult.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {aiResult.offerType && (
                    <p className="text-sm text-slate-400">Тип оффера: {aiResult.offerType}</p>
                  )}

                  {/* Создать скидку */}
                  <div className="rounded-lg border border-slate-700 p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Gift className="w-4 h-4" />
                      Назначить скидку и уведомить
                    </p>
                    <div className="grid grid-cols-[auto_1fr] gap-2 items-center text-sm">
                      <label className="text-slate-400">Скидка %</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={discountPercent}
                          onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)}
                          className="w-20 rounded-lg bg-slate-800 border border-slate-600 px-2 py-1.5 text-slate-200"
                        />
                        <span className="text-slate-500">%</span>
                      </div>
                      <label className="text-slate-400">С</label>
                      <input
                        type="datetime-local"
                        value={discountFrom}
                        onChange={(e) => setDiscountFrom(e.target.value)}
                        className="rounded-lg bg-slate-800 border border-slate-600 px-2 py-1.5 text-slate-200 text-sm"
                      />
                      <label className="text-slate-400">По</label>
                      <input
                        type="datetime-local"
                        value={discountTo}
                        onChange={(e) => setDiscountTo(e.target.value)}
                        className="rounded-lg bg-slate-800 border border-slate-600 px-2 py-1.5 text-slate-200 text-sm"
                      />
                    </div>
                    {discountStatus?.error && <p className="text-red-400 text-sm">{discountStatus.error}</p>}
                    {discountStatus?.success && (
                      <p className="text-emerald-400 text-sm">
                        Скидка назначена.{discountStatus.telegramSent ? ' Уведомление отправлено в Telegram.' : discountStatus.reason ? ` ${discountStatus.reason}` : ''}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleAssignDiscount}
                      disabled={discountSaving}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm"
                    >
                      {discountSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Percent className="w-4 h-4" />}
                      Назначить скидку
                    </button>
                  </div>

                  {/* Отправить предложение (уведомление) */}
                  <div className="rounded-lg border border-slate-700 p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Send className="w-4 h-4" />
                      Отправить предложение в приложение
                    </p>
                    <textarea
                      value={offerMessage}
                      onChange={(e) => setOfferMessage(e.target.value)}
                      placeholder="Текст предложения для клиента (можно отредактировать)"
                      rows={3}
                      className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-slate-200 text-sm placeholder-slate-500 resize-none"
                    />
                    {offerStatus?.error && <p className="text-red-400 text-sm">{offerStatus.error}</p>}
                    {offerStatus?.success && <p className="text-emerald-400 text-sm">Уведомление отправлено.</p>}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSendOfferNotification}
                        disabled={offerSending}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm"
                      >
                        {offerSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Отправить уведомление
                      </button>
                      <button type="button" onClick={handleCopyMessage} className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
                        <Copy className="w-4 h-4" />
                        Скопировать текст
                      </button>
                      <button
                        type="button"
                        onClick={handleSendOfferToTelegram}
                        disabled={offerSending}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-sm"
                      >
                        {offerSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        В Telegram
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-700 flex flex-wrap items-center gap-3">
              {!aiResult ? (
                <>
                  <label className="inline-flex items-center gap-2 text-slate-400 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeMetricsSummary}
                      onChange={(e) => setIncludeMetricsSummary(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-800 text-violet-500"
                    />
                    Включить сводку метрик и логов для отчётности
                  </label>
                  <button
                    type="button"
                    onClick={handleRunAiStrategy}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm"
                  >
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Запустить анализ
                  </button>
                </>
              ) : null}
              <button type="button" onClick={closeAiModal} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedUser && (
        <UserCard
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onCopy={onCopy}
          tariffs={tariffs}
          formatDate={formatDate}
        />
      )}
    </div>
  )
}
