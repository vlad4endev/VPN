import { ADMIN_NAV_SECTIONS } from '../constants/navSections.js'
import { Users, Server, DollarSign, Zap, ChevronRight, Clock, UserX } from 'lucide-react'

const now = () => Date.now()
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Секции для быстрых переходов (без «Главная») */
const LINK_SECTIONS = ADMIN_NAV_SECTIONS.filter((s) => s.title !== 'Главная')

/**
 * Дашборд админ-панели: метрики и быстрые переходы по разделам.
 * Информативно, удобно, лёгкий визуальный стиль.
 */
const AdminDashboard = ({
  users = [],
  servers = [],
  tariffs = [],
  onSetAdminTab,
}) => {
  const total = users.length
  const activeSubsCount = users.filter(
    (u) => u.expiresAt != null && Number(u.expiresAt) > now()
  ).length
  const expiringSoonCount = users.filter((u) => {
    const exp = u.expiresAt != null ? Number(u.expiresAt) : 0
    return exp > now() && exp <= now() + 7 * ONE_DAY_MS
  }).length
  const expiredCount = users.filter(
    (u) => u.expiresAt != null && Number(u.expiresAt) <= now()
  ).length

  const activePercent = total > 0 ? Math.round((activeSubsCount / total) * 100) : 0

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Метрики — компактная строка */}
      <section className="rounded-2xl bg-slate-800/40 border border-slate-700/50 p-4 sm:p-5">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
          Сводка
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400">
              <Users className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold text-slate-100 tabular-nums">{total}</p>
              <p className="text-xs text-slate-500 mt-0.5">пользователей</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold text-slate-100 tabular-nums">{activeSubsCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                активных {total > 0 && <span className="text-slate-400">({activePercent}%)</span>}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold text-slate-100 tabular-nums">{expiringSoonCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">истекают в течение 7 дн.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-600/30 flex items-center justify-center text-slate-400">
              <Server className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold text-slate-100 tabular-nums">{servers.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">серверов · {tariffs.length} тарифов</p>
            </div>
          </div>
        </div>
        {expiredCount > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-2 text-xs text-slate-500">
            <UserX className="w-3.5 h-3.5" />
            <span>Без активной подписки: {expiredCount}</span>
          </div>
        )}
      </section>

      {/* Разделы по группам */}
      <section>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
          Разделы
        </p>
        <div className="space-y-4 sm:space-y-5">
          {LINK_SECTIONS.map((section) => (
            <div key={section.title} className="rounded-xl bg-slate-800/30 border border-slate-700/40 overflow-hidden">
              <p className="px-3 sm:px-4 py-2 text-xs font-medium text-slate-500 bg-slate-800/50">
                {section.title}
              </p>
              <div className="p-2 sm:p-3 flex flex-wrap gap-2">
                {section.items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSetAdminTab(id)}
                    className="group flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/70 border border-slate-700/50 hover:border-slate-600 text-slate-300 hover:text-slate-100 text-sm font-medium transition-all duration-150 active:scale-[0.98]"
                  >
                    <Icon className="w-4 h-4 text-slate-500 group-hover:text-blue-400 flex-shrink-0" strokeWidth={2} />
                    <span className="truncate">{label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default AdminDashboard
