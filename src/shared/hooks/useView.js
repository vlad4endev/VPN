import { useState, useCallback, useEffect } from 'react'
import logger from '../utils/logger.js'
import { canAccessAdmin, canAccessFinances } from '../constants/admin.js'

/**
 * Custom hook для управления view (страницами приложения)
 * Сохраняет текущий view в localStorage для восстановления при перезагрузке
 * 
 * @param {Object} options - Опции
 * @param {Object} options.currentUser - Текущий пользователь
 * @param {Function} options.onViewChange - Callback при изменении view
 * @returns {Object} Объект с view и функцией setView
 */
export function useView({ currentUser, onViewChange } = {}) {
  // Приоритет: hash из URL (/#login, /#register) → localStorage → welcome
  const [view, setViewState] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash?.toLowerCase().replace(/\?.*$/, '')
      if (hash === '#login') {
        logger.debug('useView', 'Начальный view из URL hash', { view: 'login' })
        return 'login'
      }
      if (hash === '#register') {
        logger.debug('useView', 'Начальный view из URL hash', { view: 'register' })
        return 'register'
      }
      if (hash === '#cabinet' || hash === '#dashboard') {
        logger.debug('useView', 'Начальный view из URL hash', { view: 'dashboard' })
        return 'dashboard'
      }
      if (hash === '#support') {
        logger.debug('useView', 'Начальный view из URL hash', { view: 'support' })
        return 'support'
      }
    }
    try {
      const savedView = localStorage.getItem('vpn_current_view')
      const restorableViews = ['dashboard', 'admin', 'finances', 'analytics', 'login', 'register']
      if (savedView && restorableViews.includes(savedView)) {
        logger.debug('useView', 'Восстановлен view из localStorage', { view: savedView })
        return savedView
      }
      // Очистить устаревшие TMA view'ы, которые не восстанавливаются (избегаем мусора в localStorage)
      if (savedView && ['tma', 'open_from_bot_instructions', 'open_in_browser_fallback'].includes(savedView)) {
        localStorage.removeItem('vpn_current_view')
      }
    } catch (err) {
      logger.error('useView', 'Ошибка при восстановлении view из localStorage', null, err)
    }
    return 'welcome'
  })

  // Не сохраняем в localStorage эфемерные view'ы: welcome/login/register и TMA-специфичные (определяются заново при загрузке /t)
  const PERSIST_VIEWS = ['dashboard', 'admin', 'finances', 'analytics']
  const shouldPersistView = (v) => v && PERSIST_VIEWS.includes(v)

  // Обертка для setView с сохранением в localStorage
  const setView = useCallback((newView) => {
    setViewState(newView)
    if (shouldPersistView(newView)) {
      try {
        localStorage.setItem('vpn_current_view', newView)
        logger.debug('useView', 'View сохранен в localStorage', { view: newView })
      } catch (err) {
        logger.error('useView', 'Ошибка при сохранении view в localStorage', { view: newView }, err)
      }
    } else {
      try {
        localStorage.removeItem('vpn_current_view')
      } catch (_) {}
    }
    
    // Вызываем callback, если он передан
    if (onViewChange) {
      onViewChange(newView)
    }
  }, [onViewChange])

  // Автоматическое определение view на основе текущего пользователя
  useEffect(() => {
    if (!currentUser) {
      // Не переключать на welcome, если показан экран TMA (иначе бесконечные переключения view на /t)
      const tmaViews = ['tma', 'open_from_bot_instructions', 'open_in_browser_fallback']
      if (tmaViews.includes(view)) return
      if (view !== 'welcome' && view !== 'login' && view !== 'register') {
        setView('welcome')
      }
      return
    }

    // Если пользователь авторизован, определяем правильный view
    let correctView = view

    // Если текущий view - welcome/login/register, переключаемся на dashboard или admin
    if (view === 'welcome' || view === 'login' || view === 'register') {
      correctView = canAccessAdmin(currentUser.role, currentUser) ? 'admin' : 'dashboard'
    }

    // Если админ пытается зайти в dashboard, перенаправляем в admin
    if (canAccessAdmin(currentUser.role, currentUser) && view === 'dashboard') {
      correctView = 'admin'
    }

    // Доступ в admin — только у роли admin или email в VITE_ADMIN_EMAILS; в finances — у admin и бухгалтера; analytics — как admin
    if (view === 'admin' && !canAccessAdmin(currentUser.role, currentUser)) {
      correctView = 'dashboard'
    }
    if (view === 'finances' && !canAccessFinances(currentUser.role)) {
      correctView = 'dashboard'
    }
    if (view === 'analytics' && !canAccessAdmin(currentUser.role, currentUser)) {
      correctView = 'dashboard'
    }

    // Обновляем view только если он изменился
    if (correctView !== view) {
      logger.debug('useView', 'Автоматическое определение view', { 
        oldView: view, 
        newView: correctView, 
        role: currentUser.role 
      })
      setView(correctView)
    }
  }, [currentUser?.id, currentUser?.role, view, setView])

  return { view, setView }
}

