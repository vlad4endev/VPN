import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingDown, Loader2, AlertCircle, Users, Target, Zap, UserX, Send, Sparkles, X, Copy, Percent, Gift } from 'lucide-react'
import { getFunnel, refreshMetrics, sendChurnOffer, getAiStrategy, assignDiscount, sendUserTelegram, runAiFunnelAnalysis } from '../services/analyticsFunnelService.js'
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

/** Человекочитаемые подписи для индекса сложности возврата (1–5) */
const COMPLEXITY_LABELS = {
  1: 'Очень легко',
  2: 'Легко',
  3: 'Средне',
  4: 'Сложно',
  5: 'Очень сложно',
}

function displayName(row, usersById = {}) {
  const fromRow = (row.name && row.name.trim()) || (row.email && row.email.trim())
  if (fromRow) return fromRow
  const user = row.userId ? usersById[row.userId] : null
  const fromUser = (user?.name && String(user.name).trim()) || (user?.email && String(user.email).trim())
  if (fromUser) return fromUser
  return row.userId || '—'
}

/** Текст подписки: нет / истекла N дн. назад */
function subscriptionStatus(row, t) {
  const exp = row.subscriptionExpiresAt
  if (!exp) return { text: t('status.noSubscription'), type: 'none' }
  const ms = new Date(exp).getTime()
  if (Number.isNaN(ms)) return { text: '—', type: 'unknown' }
  const now = Date.now()
  if (ms >= now) return { text: t('status.active'), type: 'active' }
  const days = Math.floor((now - ms) / (24 * 60 * 60 * 1000))
  return { text: t('admin.expiredDaysAgo', { count: days }), type: 'expired' }
}

/** Цвет churn по значению: высокий риск / средний / низкий */
function churnLevel(score) {
  if (score == null) return 'text-slate-500'
  if (score >= 80) return 'text-red-400 font-medium'
  if (score >= 50) return 'text-amber-400'
  return 'text-slate-400'
}

function formatLTV(value) {
  if (value == null || value === 0) return '0'
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
}

export default function AnalyticsFunnelPanel({ users = [], tariffs = [], formatDate, onCopy }) {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
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
  const [aiTableRows, setAiTableRows] = useState(null)
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false)
  const usersById = useMemo(() => {
    const map = {}
    for (const u of users) {
      if (u?.id) map[u.id] = u
    }
    return map
  }, [users])
  const [aiAnalysisProgressStep, setAiAnalysisProgressStep] = useState(null)

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

  /** Обновить метрики и запустить ИИ-анализ воронки. Данные в таблице заменяются результатом ИИ. */
  const handleRunAiFunnelAnalysis = async () => {
    setAiAnalysisLoading(true)
    setAiAnalysisProgressStep('Обновление метрик...')
    setError(null)
    try {
      await refreshMetrics({ limit: 2000 })
      setAiAnalysisProgressStep('ИИ анализирует воронку (подписка, оплаты, тикеты)...')
      const res = await runAiFunnelAnalysis({ limit: 30 })
      if (res.rows && Array.isArray(res.rows)) setAiTableRows(res.rows)
      setAiAnalysisProgressStep('Загрузка воронки...')
      await load()
    } catch (e) {
      setError(e.message || 'Ошибка ИИ-анализа воронки')
    } finally {
      setAiAnalysisLoading(false)
      setAiAnalysisProgressStep(null)
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
      const res = await sendUserTelegram(aiModal.userId, text, { buttonText: 'Воспользоваться предложением' })
      setOfferStatus(res.sent ? { success: true } : { success: false, error: res.reason || 'Не отправлено' })
    } catch (e) {
      setOfferStatus({ error: e.message || 'Ошибка отправки в Telegram' })
    } finally {
      setOfferSending(false)
    }
  }, [aiModal?.userId, offerMessage, aiResult?.suggestedOfferMessage])

  const handleCopyMessage = useCallback(() => {
    const text = offerMessage || aiResult?.suggestedOfferMessage || aiResult?.message
    if (text && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch((err) => console.warn('AnalyticsFunnelPanel: clipboard failed', err?.message))
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
    const user = usersById[row.userId]
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

  const topByPriority = data?.topByPriority || []
  // Таблица строится только по результатам ИИ (старые данные воронки не показываем)
  const tableRowsBase = aiTableRows || []
  const filteredByRole = tableRowsBase.filter((row) => {
    const u = usersById[row.userId]
    if (!u) return true
    const r = (u.role || '').toString().toLowerCase()
    return r === 'user' || r === ''
  })
  const seenIds = new Set()
  const tableRows = filteredByRole.filter((row) => {
    const rowKey = row.userId || row.email || row.id || `${row.name || ''}:${row.priority || ''}:${row.reason || ''}`
    if (seenIds.has(rowKey)) return false
    seenIds.add(rowKey)
    return true
  })
  const showAiColumns = tableRows.length > 0
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
            Сегменты, приоритет удержания и прогноз оттока. Нажмите «Обновить с ИИ-анализом» — данные в таблице обновятся и заменят предыдущие.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRunAiFunnelAnalysis}
            disabled={aiAnalysisLoading || loading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm"
            title="Обновить метрики и запустить ИИ-анализ. Результат заменит данные в таблице."
          >
            {aiAnalysisLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Обновить с ИИ-анализом
          </button>
        </div>
      </div>

      {error && data && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-amber-200 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Сводка — компактная строка */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-2 text-slate-400">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="tabular-nums font-medium text-slate-200">{totalUsers}</span>
            <span>в воронке</span>
          </span>
          <span className="flex items-center gap-2 text-slate-400">
            <TrendingDown className="w-4 h-4 text-amber-500/80" />
            <span className="tabular-nums font-medium text-slate-200">{avgChurn}</span>
            <span>ср. churn</span>
          </span>
          <span className="flex items-center gap-2 text-slate-400">
            <Target className="w-4 h-4 text-orange-500/80" />
            <span className="tabular-nums font-medium text-slate-200">{forecast.atRiskUsers ?? 0}</span>
            <span>в зоне риска</span>
          </span>
          <span className="flex items-center gap-2 text-slate-400">
            <Zap className="w-4 h-4 text-slate-500" />
            <span className="tabular-nums font-medium text-slate-200">{forecast.estimatedChurnRate ?? 0}%</span>
            <span>прогноз оттока</span>
          </span>
        </div>
      </section>

      {/* Таблица: только данные от ИИ (сложность, причина). Без ИИ — пустое состояние. */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-800 bg-slate-800/50">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Анализ клиентов: насколько легко вернуть
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Для каждого клиента — оценка «насколько легко вернуть» (1–5) и короткий вывод простыми словами. Клик по строке — карточка. Данные появятся после нажатия «Обновить с ИИ-анализом».
          </p>
        </div>
        {tableRows.length === 0 ? (
          <div className="px-4 py-12 text-center text-slate-500">
            <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="font-medium text-slate-400">Нет данных</p>
            <p className="text-sm mt-1">Нажмите «Обновить с ИИ-анализом», чтобы загрузить таблицу.</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[32rem]">
            <table className="w-full text-xs min-w-[40rem]">
              <thead className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700">
                <tr className="text-slate-400">
                  <th className="text-left py-1.5 pl-3 pr-2 font-medium w-[1%] whitespace-nowrap">#</th>
                  <th className="text-left py-1.5 pr-2 font-medium min-w-[120px]" title="Имя или email">Клиент</th>
                  <th className="text-left py-1.5 pr-2 font-medium w-[1%] whitespace-nowrap" title="Статус подписки">Подписка</th>
                  <th className="text-left py-1.5 pr-2 font-medium w-[1%] whitespace-nowrap">Сегмент</th>
                  {showAiColumns && (
                    <>
                      <th className="text-center py-1.5 pr-2 font-medium w-[1%] whitespace-nowrap" title="1 = вернуть очень легко, 5 = очень сложно">Насколько легко вернуть</th>
                      <th className="text-left py-1.5 pr-2 font-medium max-w-[180px]" title="Короткий вывод простыми словами">Вывод</th>
                    </>
                  )}
                  <th className="text-right py-1.5 pr-2 font-medium w-[1%] tabular-nums" title="Вероятность, что клиент уйдёт (0–100)">Риск ухода</th>
                  <th className="text-right py-1.5 pr-2 font-medium w-[1%] tabular-nums" title="Кого вернуть в первую очередь">Приоритет</th>
                  <th className="text-right py-1.5 pr-2 font-medium w-[1%] tabular-nums" title="Сколько клиент уже принёс (выручка)">Выручка</th>
                  <th className="text-center py-1.5 pr-2 font-medium w-[1%] whitespace-nowrap" title="Обращения в поддержку с признаками проблемы">Тикеты</th>
                  <th className="text-right py-1.5 pr-3 font-medium w-[1%] whitespace-nowrap">Действия</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, idx) => {
                  const sub = subscriptionStatus(row, t)
                  const segment = showAiColumns ? (row.aiSegment ?? row.segment) : row.segment
                  const priorityScore = showAiColumns ? (row.aiPriorityScore ?? row.priorityScore) : row.priorityScore
                  const complexityIndex = row.complexityIndex
                  const complexityClass =
                    complexityIndex === 1 ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' :
                    complexityIndex === 2 ? 'bg-emerald-600/20 border-emerald-600/50 text-emerald-400' :
                    complexityIndex === 3 ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' :
                    complexityIndex === 4 ? 'bg-orange-500/20 border-orange-500/50 text-orange-300' :
                    'bg-red-500/20 border-red-500/50 text-red-300'
                  return (
                    <tr
                      key={row.userId}
                      className="border-b border-slate-800/80 hover:bg-slate-800/60 cursor-pointer transition-colors"
                      onClick={(e) => handleRowClick(row, e)}
                    >
                      <td className="py-1 pl-3 pr-2 text-slate-500 tabular-nums">{idx + 1}</td>
                      <td className="py-1 pr-2 text-slate-200 truncate max-w-[140px]" title={row.email || row.userId}>
                        {displayName(row, usersById)}
                      </td>
                      <td className="py-1 pr-2 whitespace-nowrap">
                        <span
                          className={
                            sub.type === 'none' ? 'text-slate-500' :
                            sub.type === 'expired' ? 'text-amber-400/90' : 'text-slate-400'
                          }
                          title={row.subscriptionExpiresAt || ''}
                        >
                          {sub.text}
                        </span>
                      </td>
                      <td className="py-1 pr-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded border text-xs ${SEGMENT_COLORS[segment] || 'bg-slate-700/50 text-slate-400 border-slate-600'}`}>
                          {SEGMENT_LABELS[segment] || segment}
                        </span>
                      </td>
                      {showAiColumns && (
                        <>
                          <td className="py-1 pr-2 text-center">
                            {complexityIndex != null ? (
                              <span className={`inline-flex px-1.5 py-0.5 rounded border text-xs font-medium ${complexityClass}`} title={`${complexityIndex} — ${COMPLEXITY_LABELS[complexityIndex] || 'сложность'}`}>
                                {complexityIndex} · {COMPLEXITY_LABELS[complexityIndex] || complexityIndex}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-1 pr-2 text-slate-400 max-w-[180px] truncate" title={row.shortReason || ''}>
                            {row.shortReason || '—'}
                          </td>
                        </>
                      )}
                      <td className={`py-1 pr-2 text-right tabular-nums ${churnLevel(row.churnScore)}`}>
                        {row.churnScore ?? '—'}
                      </td>
                      <td className="py-1 pr-2 text-right text-slate-300 tabular-nums">{priorityScore ?? '—'}</td>
                      <td className="py-1 pr-2 text-right text-slate-300 tabular-nums">{formatLTV(row.lifetimeValue)}</td>
                      <td className="py-1 pr-2 text-center">
                        {row.hasProblemTickets ? (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs"
                            title={Array.isArray(row.problemTicketSubjects) && row.problemTicketSubjects.length ? row.problemTicketSubjects.join(' · ') : ''}
                          >
                            {row.problemTicketsCount ?? 0}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-1 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleOpenAiStrategy(row)}
                            className="p-1.5 rounded bg-violet-600/80 hover:bg-violet-600 text-white"
                            title="Анализ ИИ"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                          {row.churnScore > 80 && (
                            <button
                              type="button"
                              onClick={() => handleSendOffer(row.userId)}
                              disabled={sendingOffer === row.userId}
                              className="p-1.5 rounded bg-sky-600/80 hover:bg-sky-600 disabled:opacity-50 text-white"
                              title="Оффер в Telegram"
                            >
                              {sendingOffer === row.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Попап процесса ИИ-анализа воронки */}
      {aiAnalysisLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-sm w-full p-6 flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Loader2 className="w-12 h-12 text-violet-400 animate-spin flex-shrink-0" />
            <p className="text-slate-200 font-medium text-center">
              {aiAnalysisProgressStep || 'Подготовка...'}
            </p>
            <p className="text-slate-500 text-sm text-center">
              Подождите, это может занять до минуты.
            </p>
          </div>
        </div>
      )}

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
                Анализ клиента
              </h3>
              <button type="button" onClick={closeAiModal} className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <p className="text-sm text-slate-500">
                Клиент: <span className="font-mono text-slate-400">{aiModal.userId}</span>
                {aiModal.segment != null && (
                  <> · Статус: <span className={`inline-flex px-2 py-0.5 rounded border text-xs ${SEGMENT_COLORS[aiModal.segment] || ''}`}>{SEGMENT_LABELS[aiModal.segment] || aiModal.segment}</span></>
                )}
                {aiModal.churnScore != null && <> · Риск ухода: {aiModal.churnScore}%</>}
              </p>
              {aiError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-red-300 text-sm">{aiError}</div>
              )}
              {!aiResult && !aiLoading && (
                <p className="text-slate-400 text-sm">Нажмите «Запустить анализ» — ИИ опишет ситуацию с клиентом простыми словами и подскажет, что сделать по шагам и какой текст предложения отправить.</p>
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
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">В чём ситуация с клиентом</p>
                      <p className="text-slate-300 text-sm whitespace-pre-wrap">{aiResult.strategy}</p>
                    </div>
                  )}
                  {Array.isArray(aiResult.steps) && aiResult.steps.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Что сделать по шагам</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-300 text-sm">
                        {aiResult.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {aiResult.offerType && (
                    <p className="text-sm text-slate-400">Какой тип предложения подойдёт: {aiResult.offerType}</p>
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
