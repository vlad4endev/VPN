import { ADMIN_NAV_ITEMS } from '../constants/navSections.js'
import { Users, Server, DollarSign, Zap, ChevronRight } from 'lucide-react'

const now = () => Date.now()

/**
 * Дашборд админ-панели: метрики и быстрые переходы по разделам.
 */
const AdminDashboard = ({
  users = [],
  servers = [],
  tariffs = [],
  onSetAdminTab,
}) => {
  const activeSubsCount = users.filter(
    (u) => u.expiresAt != null && Number(u.expiresAt) > now()
  ).length

  const quickLinks = ADMIN_NAV_ITEMS.filter((item) => item.id !== 'dashboard')

  const stats = [
    {
      label: 'Пользователи',
      value: users.length,
      icon: Users,
      color: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
    },
    {
      label: 'Активных подписок',
      value: activeSubsCount,
      icon: Zap,
      color: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
    },
    {
      label: 'Серверы',
      value: servers.length,
      icon: Server,
      color: 'bg-violet-600/20 text-violet-400 border-violet-500/30',
    },
    {
      label: 'Тарифы',
      value: tariffs.length,
      icon: DollarSign,
      color: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
    },
  ]

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Метрики */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 sm:mb-4">
          Обзор
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className={`rounded-xl border p-4 sm:p-5 bg-slate-900/80 backdrop-blur-sm ${color}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs sm:text-sm font-medium opacity-90">{label}</p>
                  <p className="text-2xl sm:text-3xl font-bold mt-1 tabular-nums">{value}</p>
                </div>
                <span className="p-2 rounded-lg bg-white/10">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Быстрые переходы */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 sm:mb-4">
          Разделы
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {quickLinks.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSetAdminTab(id)}
              className="group flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 hover:border-slate-600 text-left transition-all duration-200 active:scale-[0.98]"
            >
              <span className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-blue-400 group-hover:bg-slate-700/80 transition-colors">
                <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2} />
              </span>
              <span className="flex-1 min-w-0 font-medium text-slate-200 truncate">
                {label}
              </span>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400 flex-shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default AdminDashboard
