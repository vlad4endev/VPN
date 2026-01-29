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
  // Приоритет: hash из URL (с SEO-лендинга /app/#login, /app/#register) → localStorage → landing
  const [view, setViewState] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash?.toLowerCase()
      if (hash === '#login') {
        logger.debug('useView', 'Начальный view из URL hash', { view: 'login' })
        return 'login'
      }
      if (hash === '#register') {
        logger.debug('useView', 'Начальный view из URL hash', { view: 'register' })
        return 'register'
      }
    }
    try {
      const savedView = localStorage.getItem('vpn_current_view')
      if (savedView && ['dashboard', 'admin', 'finances', 'login', 'register'].includes(savedView)) {
        logger.debug('useView', 'Восстановлен view из localStorage', { view: savedView })
        return savedView
      }
    } catch (err) {
      logger.error('useView', 'Ошибка при восстановлении view из localStorage', null, err)
    }
    return 'landing'
  })

  // Обертка для setView с сохранением в localStorage
  const setView = useCallback((newView) => {
    setViewState(newView)
    if (newView && newView !== 'landing' && newView !== 'login' && newView !== 'register') {
      try {
        localStorage.setItem('vpn_current_view', newView)
        logger.debug('useView', 'View сохранен в localStorage', { view: newView })
      } catch (err) {
        logger.error('useView', 'Ошибка при сохранении view в localStorage', { view: newView }, err)
      }
    } else {
      localStorage.removeItem('vpn_current_view')
    }
    
    // Вызываем callback, если он передан
    if (onViewChange) {
      onViewChange(newView)
    }
  }, [onViewChange])

  // Автоматическое определение view на основе текущего пользователя
  useEffect(() => {
    if (!currentUser) {
      // Если пользователь не авторизован, показываем landing
      if (view !== 'landing' && view !== 'login' && view !== 'register') {
        setView('landing')
      }
      return
    }

    // Если пользователь авторизован, определяем правильный view
    let correctView = view

    // Если текущий view - landing/login/register, переключаемся на dashboard или admin
    if (view === 'landing' || view === 'login' || view === 'register') {
      correctView = currentUser.role === 'admin' ? 'admin' : 'dashboard'
    }

    // Если админ пытается зайти в dashboard, перенаправляем в admin
    if (canAccessAdmin(currentUser.role) && view === 'dashboard') {
      correctView = 'admin'
    }

    // Доступ в admin — только у роли admin; в finances — у admin и бухгалтера
    if (view === 'admin' && !canAccessAdmin(currentUser.role)) {
      correctView = 'dashboard'
    }
    if (view === 'finances' && !canAccessFinances(currentUser.role)) {
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

