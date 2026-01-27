import React, { useState, useEffect } from 'react'
import { Shield, LogOut, Users, Menu, X, CreditCard, User, History, Server, DollarSign, Link2, MessageCircle, BarChart3 } from 'lucide-react'
import { canAccessAdmin, canAccessFinances } from '../constants/admin.js'

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

const ADMIN_NAV_ITEMS = [
  { id: 'users', label: 'Пользователи', icon: Users },
  { id: 'settings', label: 'Настройки', icon: Server },
  { id: 'tariffs', label: 'Тарифы', icon: DollarSign },
  { id: 'payments', label: 'Платежи', icon: CreditCard },
  { id: 'n8n', label: 'n8n', icon: Link2 },
]

/**
 * Боковая панель навигации.
 * Desktop: полное меню слева (разделы кабинета или админки).
 * Mobile: нижняя панель с разделами, оверлей по гамбургеру — только переключение Кабинет/Админ и Выйти (без дубля разделов).
 */
const Sidebar = ({ currentUser, view, onSetView, onLogout, dashboardTab, onSetDashboardTab, adminTab, onSetAdminTab }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)')
    const handler = () => setIsMobile(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

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
      <h1 className="text-[clamp(1.25rem,1.1rem+0.75vw,1.75rem)] sm:text-xl md:text-2xl font-black text-white mb-1.5 sm:mb-2">SKYPATH VPN</h1>
      <p className="text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm text-slate-400">
        {view === 'admin' ? 'Админ-панель' : view === 'finances' ? 'Финансы' : 'Личный кабинет'}
      </p>
    </div>
  )

  const blockSupportAndLogout = (
    <div className="border-t border-slate-800 pt-3 sm:pt-4 mt-auto flex-shrink-0 space-y-1.5">
      <a
        href={SUPPORT_TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setIsMenuOpen(false)}
        className="w-full min-h-[44px] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-sky-400 active:bg-slate-700 transition-colors touch-manipulation"
        aria-label="Тех. поддержка в Telegram"
      >
        <MessageCircle size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
        <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Тех. поддержка</span>
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
              {ADMIN_NAV_ITEMS.map(({ id, label, icon: Icon }) => (
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
          h-screen
          fixed lg:static lg:h-full
          top-0 left-0 z-40 lg:z-auto
          w-[280px] sm:w-64
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
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch bg-slate-900/95 border-t border-slate-800 backdrop-blur-md safe-area-pb overflow-x-auto scrollbar-hide"
          role="tablist"
          aria-label="Разделы админ-панели"
        >
          {ADMIN_NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = adminTab === id
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                aria-label={label}
                onClick={() => handleAdminTab(id)}
                className={`min-w-0 flex-1 min-h-[56px] flex flex-col items-center justify-center gap-0.5 py-2 px-1.5 transition-all duration-250 ease-out touch-manipulation shrink-0 ${active ? 'text-blue-400' : 'text-slate-400 active:text-slate-300'}`}
              >
                <span className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-250 ${active ? 'bg-blue-600/20 scale-110' : ''}`}>
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                </span>
                <span className="text-[10px] font-medium truncate max-w-full">{label}</span>
              </button>
            )
          })}
        </nav>
      )}
    </>
  )
}

export default Sidebar
