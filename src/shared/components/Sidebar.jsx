import React, { useState } from 'react'
import { Shield, LogOut, Settings, Users, Server, DollarSign, Menu, X } from 'lucide-react'

/**
 * Боковая панель навигации (Responsive with Hamburger Menu)
 * Mobile: Hamburger menu button that toggles overlay sidebar
 * Desktop (>= 1024px): Fixed sidebar
 */
const Sidebar = ({ currentUser, view, onSetView, onLogout }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleNavClick = (newView) => {
    onSetView(newView)
    // Close menu on mobile after navigation
    setIsMenuOpen(false)
  }

  const handleLogout = () => {
    onLogout()
    setIsMenuOpen(false)
  }

  const sidebarContent = (
    <>
      <div className="mb-4 sm:mb-6 md:mb-8">
        <h1 className="text-[clamp(1.25rem,1.1rem+0.75vw,1.75rem)] sm:text-xl md:text-2xl font-black text-white mb-1.5 sm:mb-2">SKYPATH VPN</h1>
        <p className="text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] sm:text-sm text-slate-400">
          {view === 'admin' ? 'Админ-панель' : 'Личный кабинет'}
        </p>
      </div>

      <nav className="flex-1 space-y-1.5 sm:space-y-2 overflow-y-auto min-h-0">
        {currentUser?.role === 'admin' && (
          <button
            onClick={() => handleNavClick('admin')}
            className={`w-full min-h-[44px] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-colors touch-manipulation ${
              view === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 active:bg-slate-700'
            }`}
            aria-label="Админ-панель"
            aria-selected={view === 'admin'}
          >
            <Users size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Админ-панель</span>
          </button>
        )}
        
        <button
          onClick={() => handleNavClick('dashboard')}
          className={`w-full min-h-[44px] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-colors touch-manipulation ${
            view === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 active:bg-slate-700'
          }`}
          aria-label="Личный кабинет"
          aria-selected={view === 'dashboard'}
        >
          <Shield size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Личный кабинет</span>
        </button>
      </nav>

      <div className="border-t border-slate-800 pt-3 sm:pt-4 mt-auto flex-shrink-0">
        <button
          onClick={handleLogout}
          className="w-full min-h-[44px] flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-slate-300 hover:bg-slate-800 active:bg-slate-700 transition-colors touch-manipulation"
          aria-label="Выйти из аккаунта"
        >
          <LogOut size={18} className="sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="font-bold text-[clamp(0.875rem,0.8rem+0.375vw,1rem)] sm:text-base">Выйти</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Hamburger Menu Button - Mobile Only */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="lg:hidden fixed top-3 sm:top-4 left-3 sm:left-4 z-50 p-2 sm:p-2.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 rounded-lg text-white border border-slate-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
        aria-label="Toggle menu"
        aria-expanded={isMenuOpen}
      >
        {isMenuOpen ? <X size={20} className="sm:w-6 sm:h-6" /> : <Menu size={20} className="sm:w-6 sm:h-6" />}
      </button>

      {/* Mobile Overlay */}
      {isMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - Mobile (Overlay) / Desktop (Static) */}
      <div
        className={`
          bg-slate-900 border-r border-slate-800 
          p-3 sm:p-4 md:p-6 
          flex flex-col
          h-screen
          fixed lg:static lg:h-full
          top-0 left-0 z-40
          w-[280px] sm:w-64
          transform transition-transform duration-300 ease-in-out
          overflow-y-auto overflow-x-hidden
          ${isMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {sidebarContent}
      </div>
    </>
  )
}

export default Sidebar
