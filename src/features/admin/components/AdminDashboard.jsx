import { useTranslation } from 'react-i18next'
import { ADMIN_NAV_SECTIONS } from '../constants/navSections.js'
import { Users, Server, DollarSign, Zap, Clock, UserX } from 'lucide-react'

const now = () => Date.now()
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Секции для быстрых переходов (без «Главная») */
const LINK_SECTIONS = ADMIN_NAV_SECTIONS.filter((s) => s.titleKey !== 'admin.sectionHome')

/**
 * Дашборд админ-панели: метрики и быстрые переходы по разделам.
 * Компактный вид: одна карточка «Разделы» с сеткой ссылок.
 */
const AdminDashboard = ({
  users = [],
  servers = [],
  tariffs = [],
  onSetAdminTab,
}) => {
  const { t } = useTranslation()
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
    <div className="space-y-4 sm:space-y-6">
      {/* Сводка — компактная */}
      <section className="rounded-xl sm:rounded-2xl bg-slate-800/40 border border-slate-700/50 p-3 sm:p-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 sm:mb-3">
          Сводка
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400">
              <Users className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-semibold text-slate-100 tabular-nums">{total}</p>
              <p className="text-xs text-slate-500">пользователей</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-semibold text-slate-100 tabular-nums">{activeSubsCount}</p>
              <p className="text-xs text-slate-500">
                активных {total > 0 && <span className="text-slate-400">({activePercent}%)</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-semibold text-slate-100 tabular-nums">{expiringSoonCount}</p>
              <p className="text-xs text-slate-500">истекают в 7 дн.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-slate-600/30 flex items-center justify-center text-slate-400">
              <Server className="w-4 h-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-semibold text-slate-100 tabular-nums">{servers.length}</p>
              <p className="text-xs text-slate-500">{servers.length} серв. · {tariffs.length} тариф.</p>
            </div>
          </div>
        </div>
        {expiredCount > 0 && (
          <div className="mt-2 pt-2 sm:mt-3 sm:pt-3 border-t border-slate-700/50 flex items-center gap-2 text-xs text-slate-500">
            <UserX className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Без активной подписки: {expiredCount}</span>
          </div>
        )}
      </section>

      {/* Разделы — одна карточка, сетка ссылок (без отдельных блоков на каждую группу) */}
      <section className="rounded-xl sm:rounded-2xl bg-slate-800/40 border border-slate-700/50 p-3 sm:p-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 sm:mb-3">
          Разделы
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
          {LINK_SECTIONS.map((section) => (
            section.items.map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onSetAdminTab(id)}
                className="group flex items-center gap-2 min-h-[44px] px-2.5 sm:px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 hover:border-slate-600 text-slate-300 hover:text-slate-100 text-sm font-medium transition-all duration-150 active:scale-[0.98] touch-manipulation text-left"
              >
                <Icon className="w-4 h-4 text-slate-500 group-hover:text-blue-400 flex-shrink-0" strokeWidth={2} />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            ))
          ))}
        </div>
      </section>
    </div>
  )
}

export default AdminDashboard
