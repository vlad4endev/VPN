import React, { useState, useEffect } from 'react'
import { Shield, LogOut, Users, Menu, X, CreditCard, User, History, BarChart3, MessageCircle, ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react'
import { canAccessAdmin, canAccessFinances } from '../constants/admin.js'
import { ADMIN_NAV_SECTIONS, ADMIN_NAV_ITEMS, ADMIN_MOBILE_PRIMARY_IDS, ADMIN_MOBILE_OTHER_ITEMS } from '../../features/admin/constants/navSections.js'
import NotificationsCenter from '../../features/notifications/components/NotificationsCenter.jsx'

const SUPPORT_TELEGRAM_URL = 'https://t.me/SkyPathsupport'

const navItemClass = (active) =>
  `w-full min-h-[44px] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-200 touch-manipulation ${
    active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'text-slate-300 hover:bg-slate-800 active:bg-slate-700'
  }`

const navSubItemClass = (active) =>
  `w-full min-h-[40px] flex items-center gap-2 sm:gap-3 pl-6 sm:pl-7 pr-3 sm:pr-4 py-2 sm:py-2.5 rounded-lg transition-all duration-200 touch-manipulation text-[0.9em] ${
    active ? 'bg-blue-600/90 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:bg-slate-700'
  }`

const DASHBOARD_NAV_ITEMS = [
  { id: 'subscription', label: 'Подписка', icon: CreditCard },
  { id: 'profile', label: 'Профиль', icon: User },
  { id: 'payments', label: 'Платежи', icon: History },
]


/**
 * Боковая панель навигации.
 * Desktop: полное меню слева (разделы кабинета или админки).
 * Mobile: нижняя панель с разделами, оверлей по гамбургеру — только переключение Кабинет/Админ и Выйти (без дубля разделов).
 */
/** Возвращает ключ раздела, в котором находится таб */
const getSectionKeyByTabId = (tabId) => {
  const section = ADMIN_NAV_SECTIONS.find((s) => s.items.some((i) => i.id === tabId))
  return section ? section.title : null
}

const Sidebar = ({ currentUser, view, onSetView, onLogout, dashboardTab, onSetDashboardTab, adminTab, onSetAdminTab }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showAdminMore, setShowAdminMore] = useState(false)
  const [expandedAdminSections, setExpandedAdminSections] = useState(() => {
    const openKey = getSectionKeyByTabId(adminTab)
    return openKey ? { [openKey]: true } : { [ADMIN_NAV_SECTIONS[0]?.title]: true }
  })

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1024px)')
    const handler = () => setIsMobile(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // При смене таба админки раскрывать раздел, в котором он находится
  useEffect(() => {
    if (view !== 'admin' || !adminTab) return
    const sectionKey = getSectionKeyByTabId(adminTab)
    if (sectionKey && !expandedAdminSections[sectionKey]) {
      setExpandedAdminSections((prev) => ({ ...prev, [sectionKey]: true }))
    }
  }, [view, adminTab])

  const toggleAdminSection = (sectionTitle) => {
    setExpandedAdminSections((prev) => ({ ...prev, [sectionTitle]: !prev[sectionTitle] }))
  }

  const hasDashboardTabs = view === 'dashboard' && typeof onSetDashboardTab === 'function' && dashboardTab != null
  const hasAdminTabs = view === 'admin' && typeof onSetAdminTab === 'function' && adminTab != null
  const hasBottomBar = hasDashboardTabs || hasAdminTabs
  const mobileCompact = isMobile && hasBottomBar

  const handleNavClick = (newView) => {
    onSetView(newView)
    setIsMenuOpen(false)
  }

  const handleDashboardTab = (tab) => {
    onSetDashboardTab?.(tab)
    setIsMenuOpen(false)
  }

  const handleAdminTab = (tab) => {
    onSetAdminTab?.(tab)
    setIsMenuOpen(false)
  }

  const handleLogout = () => {
    onLogout()
    setIsMenuOpen(false)
  }

  const blockHeader = (
    <div className="mb-4 sm:mb-6 md:mb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-[clamp(1.25rem,1.1rem+0.75vw,1.75rem)] sm:text-xl md:text-2xl font-black text-white mb-1.5 sm:mb-2">SKYFLOW</h1>
          <p className="text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm text-slate-400">
            {view === 'admin' ? 'Админ-панель' : view === 'finances' ? 'Финансы' : 'Личный кабинет'}
          </p>
        </div>
        {currentUser?.id && (
          <div className="flex-shrink-0">
            <NotificationsCenter userId={currentUser.id} />
          </div>
        )}
      </div>
    </div>
  )

  const blockSupportAndLogout = (
    <div className="border-t border-slate-800 pt-3 sm:pt-4 mt-auto flex-shrink-0 space-y-1.5">
      <button
        type="button"
        onClick={() => {
          onSetView('support')
          setIsMenuOpen(false)
        }}
        className={`w-full min-h-[44px] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-colors touch-manipulation ${view === 'support' ? navItemClass(true) : 'text-slate-300 hover:bg-slate-800 hover:text-sky-400 active:bg-slate-700'}`}
        aria-label="Тех. поддержка"
        aria-selected={view === 'support'}
      >
        <MessageCircle size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
        <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Тех. поддержка</span>
      </button>
      <a
        href={SUPPORT_TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIsMenuOpen(false)}
        className="w-full min-h-[40px] flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-sky-400 text-sm transition-colors"
        aria-label="Telegram"
      >
        <span className="font-medium">Telegram</span>
      </a>
      <button
        onClick={handleLogout}
        className="w-full min-h-[44px] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-slate-300 hover:bg-slate-800 active:bg-slate-700 transition-colors touch-manipulation"
        aria-label="Выйти из аккаунта"
      >
        <LogOut size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
        <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Выйти</span>
      </button>
    </div>
  )

  /** На мобильных при нижней панели — только переключатель раздела (Кабинет/Админ/Финансы) и Выйти, без подразделов */
  const compactNav = (
    <nav className="flex-1 space-y-1.5 sm:space-y-2 overflow-y-auto min-h-0">
      {canAccessAdmin(currentUser?.role) && (
        <button
          onClick={() => handleNavClick('admin')}
          className={navItemClass(view === 'admin')}
          aria-label="Админ-панель"
          aria-selected={view === 'admin'}
        >
          <Users size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Админ-панель</span>
        </button>
      )}
      {canAccessFinances(currentUser?.role) && (
        <button
          onClick={() => handleNavClick('finances')}
          className={navItemClass(view === 'finances')}
          aria-label="Финансы"
          aria-selected={view === 'finances'}
        >
          <BarChart3 size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Финансы</span>
        </button>
      )}
      <button
        onClick={() => handleNavClick('dashboard')}
        className={navItemClass(view === 'dashboard')}
        aria-label="Личный кабинет"
        aria-selected={view === 'dashboard'}
      >
        <Shield size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
        <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Личный кабинет</span>
      </button>
    </nav>
  )

  const fullNav = (
    <nav className="flex-1 space-y-1.5 sm:space-y-2 overflow-y-auto min-h-0">
      {/* Админ-панель и её подразделы — только для роли admin */}
      {canAccessAdmin(currentUser?.role) && (
        <div className="space-y-1 sm:space-y-1.5">
          <button
            onClick={() => handleNavClick('admin')}
            className={navItemClass(view === 'admin')}
            aria-label="Админ-панель"
            aria-selected={view === 'admin'}
          >
            <Users size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Админ-панель</span>
          </button>
          {hasAdminTabs && (
            <div className="space-y-0.5 sm:space-y-1">
              {ADMIN_NAV_SECTIONS.map((section) => {
                const isExpanded = expandedAdminSections[section.title] === true
                return (
                  <div key={section.title} className="space-y-0.5 sm:space-y-0.5">
                    <button
                      type="button"
                      onClick={() => toggleAdminSection(section.title)}
                      className="w-full min-h-[36px] flex items-center gap-2 pl-6 sm:pl-7 pr-3 sm:pr-4 py-1.5 sm:py-2 rounded-lg text-left text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors touch-manipulation"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Свернуть ${section.title}` : `Развернуть ${section.title}`}
                    >
                      <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                        {isExpanded ? (
                          <ChevronDown size={14} className="text-slate-500" />
                        ) : (
                          <ChevronRight size={14} className="text-slate-500" />
                        )}
                      </span>
                      <span className="truncate">{section.title}</span>
                    </button>
                    {isExpanded && (
                      <div className="space-y-0.5 sm:space-y-0.5">
                        {section.items.map(({ id, label, icon: Icon }) => (
                          <button
                            key={id}
                            onClick={() => handleAdminTab(id)}
                            className={navSubItemClass(adminTab === id)}
                            aria-label={label}
                            aria-selected={adminTab === id}
                          >
                            <Icon size={16} className="sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="font-medium">{label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Финансы — для ролей Админ и Бухгалтер */}
      {canAccessFinances(currentUser?.role) && (
        <button
          onClick={() => handleNavClick('finances')}
          className={navItemClass(view === 'finances')}
          aria-label="Финансы"
          aria-selected={view === 'finances'}
        >
          <BarChart3 size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Финансы</span>
        </button>
      )}

      {/* Личный кабинет и его подразделы — одной группой, подразделы сразу под пунктом */}
      <div className="space-y-1 sm:space-y-1.5">
        <button
          onClick={() => handleNavClick('dashboard')}
          className={navItemClass(view === 'dashboard')}
          aria-label="Личный кабинет"
          aria-selected={view === 'dashboard'}
        >
          <Shield size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Личный кабинет</span>
        </button>
        {hasDashboardTabs && (
          <div className="space-y-0.5 sm:space-y-1">
            {DASHBOARD_NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleDashboardTab(id)}
                className={navSubItemClass(dashboardTab === id)}
                aria-label={label}
                aria-selected={dashboardTab === id}
              >
                <Icon size={16} className="sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  )

  const sidebarContent = (
    <>
      {blockHeader}
      {mobileCompact ? compactNav : fullNav}
      {blockSupportAndLogout}
    </>
  )

  return (
    <>
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="lg:hidden fixed top-3 sm:top-4 left-3 sm:left-4 z-50 p-2 sm:p-2.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 rounded-lg text-white border border-slate-800 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
        aria-label="Меню"
        aria-expanded={isMenuOpen}
      >
        {isMenuOpen ? <X size={20} className="sm:w-6 sm:h-6" /> : <Menu size={20} className="sm:w-6 sm:h-6" />}
      </button>

      {isMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 sidebar-overlay"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`
          bg-slate-900 border-r border-slate-800
          p-3 sm:p-4 md:p-6
          flex flex-col
          h-screen max-h-[100dvh]
          fixed lg:static lg:h-full
          top-0 left-0 z-40 lg:z-auto
          w-[min(280px,85vw)] sm:w-64
          transform transition-transform duration-300 ease-out
          overflow-y-auto overflow-x-hidden
          ${isMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {sidebarContent}
      </div>

      {/* Нижняя панель на мобильных: разделы кабинета или админки, без дубля в боковой */}
      {hasDashboardTabs && (
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch bg-slate-900/95 border-t border-slate-800 backdrop-blur-md safe-area-pb"
          role="tablist"
          aria-label="Разделы личного кабинета"
        >
          {DASHBOARD_NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = dashboardTab === id
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                aria-label={label}
                onClick={() => handleDashboardTab(id)}
                className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 py-2 px-2 transition-all duration-250 ease-out touch-manipulation ${active ? 'text-blue-400' : 'text-slate-400 active:text-slate-300'}`}
              >
                <span className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-250 ${active ? 'bg-blue-600/20 scale-110' : ''}`}>
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                </span>
                <span className="text-[11px] font-medium truncate max-w-full px-1">{label}</span>
              </button>
            )
          })}
        </nav>
      )}

      {hasAdminTabs && (
        <>
          {/* Компактная нижняя панель: Дашборд, Пользователи, Отзывы, Прочее */}
          <nav
            className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch bg-slate-900/95 border-t border-slate-800 backdrop-blur-md safe-area-pb"
            role="tablist"
            aria-label="Разделы админ-панели"
          >
            {ADMIN_NAV_ITEMS.filter((item) => ADMIN_MOBILE_PRIMARY_IDS.includes(item.id)).map(({ id, label, icon: Icon }) => {
              const active = adminTab === id
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  aria-label={label}
                  onClick={() => handleAdminTab(id)}
                  className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 py-2 px-2 transition-all duration-250 ease-out touch-manipulation ${active ? 'text-blue-400' : 'text-slate-400 active:text-slate-300'}`}
                >
                  <span className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-250 ${active ? 'bg-blue-600/20 scale-110' : ''}`}>
                    <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                  </span>
                  <span className="text-[11px] font-medium truncate max-w-full px-0.5">{label}</span>
                </button>
              )
            })}
            <button
              type="button"
              role="tab"
              aria-selected={showAdminMore || ADMIN_MOBILE_OTHER_ITEMS.some((i) => i.id === adminTab)}
              aria-expanded={showAdminMore}
              aria-label="Прочее"
              onClick={() => setShowAdminMore((v) => !v)}
              className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 py-2 px-2 transition-all duration-250 ease-out touch-manipulation ${showAdminMore || ADMIN_MOBILE_OTHER_ITEMS.some((i) => i.id === adminTab) ? 'text-blue-400' : 'text-slate-400 active:text-slate-300'}`}
            >
              <span className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-250 ${showAdminMore || ADMIN_MOBILE_OTHER_ITEMS.some((i) => i.id === adminTab) ? 'bg-blue-600/20 scale-110' : ''}`}>
                <MoreHorizontal size={22} strokeWidth={2} />
              </span>
              <span className="text-[11px] font-medium">Прочее</span>
            </button>
          </nav>

          {/* Панель «Прочее»: остальные разделы */}
          {showAdminMore && (
            <>
              <div
                className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                aria-hidden="true"
                onClick={() => setShowAdminMore(false)}
              />
              <div
                className="lg:hidden fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl bg-slate-900 border-t border-slate-700 shadow-2xl safe-area-pb max-h-[70vh] overflow-hidden flex flex-col"
                role="dialog"
                aria-label="Остальные разделы"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                  <span className="text-sm font-semibold text-slate-300">Разделы</span>
                  <button
                    type="button"
                    onClick={() => setShowAdminMore(false)}
                    className="p-2 -m-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    aria-label="Закрыть"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="overflow-y-auto p-3 pb-8 grid grid-cols-2 gap-2">
                  {ADMIN_MOBILE_OTHER_ITEMS.map(({ id, label, icon: Icon }) => {
                    const active = adminTab === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          onSetAdminTab(id)
                          setShowAdminMore(false)
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl text-left transition-colors touch-manipulation ${active ? 'bg-blue-600/30 text-blue-300' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 active:bg-slate-600'}`}
                      >
                        <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-700/80 flex items-center justify-center">
                          <Icon size={18} strokeWidth={2} />
                        </span>
                        <span className="text-sm font-medium truncate">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

export default Sidebar
