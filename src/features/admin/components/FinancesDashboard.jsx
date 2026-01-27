import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart3,
  TrendingUp,
  Users,
  CreditCard,
  Calendar,
  Filter,
  RefreshCw,
  Loader2,
  Wallet,
  Target,
  Trash2,
} from 'lucide-react'
import { adminService } from '../services/adminService.js'

/** Роли, которые не считаем в статистике «пользователей» (только обычные клиенты) */
const STAFF_ROLES = ['admin', 'accountant', 'бухгалтер']

const PERIODS = [
  { id: '7d', label: '7 дней', days: 7 },
  { id: '30d', label: '30 дней', days: 30 },
  { id: '90d', label: '90 дней', days: 90 },
  { id: 'all', label: 'Всё время', days: null },
]

/** Число миллисекунд (timestamp). Поддерживает Firestore Timestamp, числа, ISO-строки. */
function toStamp(val) {
  if (val == null) return 0
  if (typeof val === 'number') return val
  // Firestore Timestamp
  if (typeof val === 'object' && typeof val.seconds === 'number') return val.seconds * 1000
  if (typeof val === 'object' && typeof val.toMillis === 'function') return val.toMillis()
  const d = new Date(val)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

function startOfDay(t) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function getRange(periodId) {
  const now = Date.now()
  const todayStart = startOfDay(now)
  const p = PERIODS.find((x) => x.id === periodId)
  if (!p || p.days == null) return { from: 0, to: now + 86400000 }
  const from = todayStart - p.days * 86400000
  return { from, to: now + 86400000 }
}

/**
 * Дашборд «Финансы» для админа: доходы, успешные оплаты, рост подписчиков, фильтры по периоду и тарифу.
 */
const FinancesDashboard = ({ users = [], tariffs = [], formatDate = (x) => (x != null ? String(x) : '—'), currentUser = null }) => {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [clearing, setClearing] = useState(false)
  const isAdmin = currentUser?.role === 'admin'
  const [periodId, setPeriodId] = useState('30d')
  const [tariffId, setTariffId] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const loadPayments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await adminService.loadAllPayments()
      setPayments(list)
    } catch (err) {
      setError(err?.message || 'Ошибка загрузки платежей')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleClearAllPayments = useCallback(async () => {
    if (!isAdmin) return
    const msg =
      'Очистить всю историю платежей?\n\nБудут удалены только записи о платежах (включая у админов и бухгалтеров).\nРоли и данные пользователей не изменяются.\n\nСтатистика по платежам обнулится. Действие необратимо.'
    if (!window.confirm(msg)) return
    setClearing(true)
    setError(null)
    try {
      const deleted = await adminService.deleteAllPayments()
      await loadPayments()
      alert(`Удалено платежей: ${deleted}`)
    } catch (err) {
      setError(err?.message || 'Ошибка очистки платежей')
    } finally {
      setClearing(false)
    }
  }, [isAdmin, loadPayments])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  const resolvedRange = useMemo(() => {
    if (useCustom && customFrom && customTo) {
      const from = startOfDay(new Date(customFrom).getTime())
      const to = new Date(customTo).setHours(23, 59, 59, 999)
      return { from, to }
    }
    return getRange(periodId)
  }, [useCustom, customFrom, customTo, periodId])

  const { filteredPayments, completedPayments, totalRevenue } = useMemo(() => {
    const from = resolvedRange.from
    const to = resolvedRange.to
    let list = payments.filter((p) => {
      const t = toStamp(p.createdAt) || toStamp(p.completedAt)
      if (t < from || t > to) return false
      if (tariffId && p.tariffId !== tariffId) return false
      return true
    })
    const completed = list.filter((p) => (p.status || '').toLowerCase() === 'completed')
    const revenue = completed.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    return {
      filteredPayments: list,
      completedPayments: completed,
      totalRevenue: revenue,
    }
  }, [payments, resolvedRange, tariffId])

  const previousRange = useMemo(() => {
    const len = resolvedRange.to - resolvedRange.from
    return {
      from: resolvedRange.from - len,
      to: resolvedRange.from - 1,
    }
  }, [resolvedRange])

  const { totalRevenuePrev, completedCountPrev } = useMemo(() => {
    const { from, to } = previousRange
    let list = payments.filter((p) => {
      const t = toStamp(p.createdAt) || toStamp(p.completedAt)
      return t >= from && t <= to && (!tariffId || p.tariffId === tariffId)
    })
    const completed = list.filter((p) => (p.status || '').toLowerCase() === 'completed')
    const rev = completed.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    return { totalRevenuePrev: rev, completedCountPrev: completed.length }
  }, [payments, previousRange, tariffId])

  const revenueGrowth = useMemo(() => {
    if (totalRevenuePrev <= 0) return totalRevenue > 0 ? 100 : 0
    return Math.round(((totalRevenue - totalRevenuePrev) / totalRevenuePrev) * 100)
  }, [totalRevenue, totalRevenuePrev])

  const payersGrowth = useMemo(() => {
    if (completedCountPrev <= 0) return completedPayments.length > 0 ? 100 : 0
    return Math.round(((completedPayments.length - completedCountPrev) / completedCountPrev) * 100)
  }, [completedPayments.length, completedCountPrev])

  const byTariff = useMemo(() => {
    const map = new Map()
    for (const p of completedPayments) {
      const tid = p.tariffId || '_без_тарифа'
      const cur = map.get(tid) || { count: 0, amount: 0 }
      cur.count += 1
      cur.amount += Number(p.amount) || 0
      map.set(tid, cur)
    }
    return Array.from(map.entries()).map(([id, v]) => ({
      tariffId: id === '_без_тарифа' ? null : id,
      ...v,
      name: id === '_без_тарифа' ? 'Без тарифа' : (tariffs.find((t) => t.id === id)?.name || id),
    }))
  }, [completedPayments, tariffs])

  /** Только обычные пользователи (без админов и бухгалтеров) для статистики */
  const regularUsers = useMemo(
    () => users.filter((u) => !STAFF_ROLES.includes(String(u?.role ?? '').toLowerCase())),
    [users]
  )

  const activeSubscribersNow = useMemo(() => {
    const now = Date.now()
    return regularUsers.filter((u) => {
      const hasKey = !!(u.uuid && String(u.uuid).trim())
      const exp = toStamp(u.expiresAt)
      const testEnd = toStamp(u.testPeriodEndDate)
      const subscriptionActive = exp > 0 && exp > now
      const testActive = testEnd > 0 && testEnd > now && (u.paymentStatus || '').toLowerCase() === 'test_period'
      return hasKey && (subscriptionActive || testActive)
    }).length
  }, [regularUsers])

  const newSubscribersInPeriod = useMemo(() => {
    const { from, to } = resolvedRange
    return regularUsers.filter((u) => {
      const t = toStamp(u.createdAt) || toStamp(u.firstKeyDate)
      return t >= from && t <= to
    }).length
  }, [regularUsers, resolvedRange])

  /** Пользователи, у которых подписка или тестовый период заканчивается в выбранном периоде (ожидаемые продления/оплаты) */
  const expiringInPeriod = useMemo(() => {
    const { from, to } = resolvedRange
    return regularUsers.filter((u) => {
      if (tariffId && u.tariffId !== tariffId) return false
      const exp = toStamp(u.expiresAt)
      const testEnd = toStamp(u.testPeriodEndDate)
      const subscriptionEndsInRange = exp > 0 && exp >= from && exp <= to
      const testEndsInRange = testEnd > 0 && testEnd >= from && testEnd <= to
      return subscriptionEndsInRange || testEndsInRange
    })
  }, [regularUsers, resolvedRange, tariffId])

  /** По каждому пользователю — сумма последней успешной оплаты (из карточки платежей), для прогноза при продлении */
  const lastPaidAmountByUserId = useMemo(() => {
    const completed = payments.filter((p) => (p.status || '').toLowerCase() === 'completed' && (p.userId || p.user_id))
    const byUser = new Map()
    for (const p of completed) {
      const uid = p.userId || p.user_id
      const t = toStamp(p.completedAt) || toStamp(p.createdAt)
      const prev = byUser.get(uid)
      if (!prev || t > prev.date) {
        byUser.set(uid, { date: t, amount: Number(p.amount) || 0 })
      }
    }
    return new Map(Array.from(byUser.entries()).map(([id, v]) => [id, v.amount]))
  }, [payments])

  /** Ожидаемая прибыль: сумма, которую заплатили при последней оплате (из платежей) — прогноз при истечении периода */
  const expectedProfit = useMemo(() => {
    return expiringInPeriod.reduce((sum, u) => {
      const amount = lastPaidAmountByUserId.get(u.id) ?? 0
      return sum + amount
    }, 0)
  }, [expiringInPeriod, lastPaidAmountByUserId])

  const formatMoney = (v) => {
    const n = Number(v)
    if (Number.isNaN(n)) return '0 ₽'
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n)
  }

  if (loading && payments.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 flex flex-col items-center justify-center min-h-[320px]">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Загрузка финансовых данных…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-200 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-emerald-500" />
              Финансы
            </h2>
            <p className="text-slate-400 mt-1">Доходы и статистика пользователей</p>
          </div>
          <button
            onClick={loadPayments}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            aria-label="Обновить данные"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Обновить
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Фильтры */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-slate-400 text-sm font-medium">Период:</span>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => { setUseCustom(false); setPeriodId(p.id) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  !useCustom && periodId === p.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
            <label className="inline-flex items-center gap-2 text-slate-400 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useCustom}
                onChange={(e) => setUseCustom(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 text-blue-500"
              />
              Свой период
            </label>
          </div>
          {useCustom && (
            <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm"
              />
              <span className="text-slate-500">—</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm"
              />
            </div>
          )}
          <span className="text-slate-500 text-sm hidden sm:inline">|</span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-slate-400 text-sm font-medium flex-shrink-0">Тариф:</span>
            <select
              value={tariffId}
              onChange={(e) => setTariffId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 text-sm flex-1 sm:flex-initial min-w-0"
            >
              <option value="">Все тарифы</option>
              {tariffs.map((t) => (
                <option key={t.id} value={t.id}>{t.name || t.plan || t.id}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Карточки KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Wallet className="w-4 h-4" />
              Доход за период
            </div>
            <div className="text-2xl font-bold text-emerald-400">{formatMoney(totalRevenue)}</div>
            {revenueGrowth !== 0 && (
              <div className={`text-sm mt-1 flex items-center gap-1 ${revenueGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                <TrendingUp className={`w-3.5 h-3.5 ${revenueGrowth < 0 ? 'rotate-180' : ''}`} />
                {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth}% к пред. периоду
              </div>
            )}
          </div>
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <CreditCard className="w-4 h-4" />
              Успешных оплат
            </div>
            <div className="text-2xl font-bold text-slate-200">{completedPayments.length}</div>
            {payersGrowth !== 0 && (
              <div className={`text-sm mt-1 flex items-center gap-1 ${payersGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                <TrendingUp className={`w-3.5 h-3.5 ${payersGrowth < 0 ? 'rotate-180' : ''}`} />
                {payersGrowth >= 0 ? '+' : ''}{payersGrowth}% к пред. периоду
              </div>
            )}
          </div>
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Target className="w-4 h-4" />
              Ожидаемая прибыль
            </div>
            <div className="text-2xl font-bold text-amber-400">{formatMoney(expectedProfit)}</div>
          </div>
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Users className="w-4 h-4" />
              Активных подписчиков
            </div>
            <div className="text-2xl font-bold text-blue-400">{activeSubscribersNow}</div>
          </div>
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Новых за период
            </div>
            <div className="text-2xl font-bold text-slate-200">{newSubscribersInPeriod}</div>
          </div>
        </div>

        {/* Доход по тарифам */}
        {byTariff.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-slate-400" />
              Доход по тарифам
            </h3>
            <div className="space-y-3">
              {byTariff
                .sort((a, b) => b.amount - a.amount)
                .map(({ tariffId: tid, name, count, amount }) => {
                  const pct = totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0
                  return (
                    <div key={tid ?? '_'} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-300 font-medium truncate">{name}</span>
                          <span className="text-slate-200 flex-shrink-0 ml-2">
                            {formatMoney(amount)} ({count})
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/80"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Таблица последних успешных оплат в периоде */}
        <div>
          <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-400" />
            Успешные оплаты в периоде ({completedPayments.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            {completedPayments.length === 0 ? (
              <div className="p-6 text-center text-slate-500">Нет успешных оплат за выбранный период</div>
            ) : (
              <table className="min-w-full divide-y divide-slate-700">
                <thead className="bg-slate-800/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Дата</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Сумма</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Тариф</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Имя пользователя</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {completedPayments.slice(0, 50).map((p) => {
                    const user = users.find((u) => u.id === p.userId)
                    const displayName = user ? (user.name && user.name.trim() ? user.name.trim() : user.email || '—') : '—'
                    return (
                      <tr key={p.id} className="bg-slate-800/30 hover:bg-slate-800/50">
                        <td className="px-4 py-2 text-sm text-slate-300 whitespace-nowrap">
                          {formatDate(p.completedAt || p.createdAt)}
                        </td>
                        <td className="px-4 py-2 text-sm font-medium text-emerald-400">{formatMoney(p.amount)}</td>
                        <td className="px-4 py-2 text-sm text-slate-300">
                          {p.tariffId ? (tariffs.find((t) => t.id === p.tariffId)?.name || p.tariffId) : '—'}
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-300 truncate max-w-[180px]" title={displayName}>
                          {displayName}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          {completedPayments.length > 50 && (
            <p className="text-slate-500 text-sm mt-2">Показаны первые 50 из {completedPayments.length}</p>
          )}
        </div>

        {isAdmin && (
          <div className="mt-8 pt-6 border-t border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={handleClearAllPayments}
              disabled={clearing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-red-400 hover:bg-red-950/30 border border-slate-700 hover:border-red-900/50 rounded-lg transition-colors"
              title="Очистить только историю платежей. Роли не затрагиваются."
              aria-label="Очистить историю платежей"
            >
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Очистить историю платежей
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default FinancesDashboard
