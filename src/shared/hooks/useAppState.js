import { useState, useCallback, useEffect } from 'react'
import logger from '../utils/logger.js'
import { parseUserSafely } from '../utils/sanitizeUser.js'

/**
 * Custom hook для управления глобальным состоянием приложения
 * Управляет users, currentUser, error, success, loading
 * 
 * @param {Object} options - Опции
 * @returns {Object} Объект с состоянием и функциями для его обновления
 */
export function useAppState() {
  // Список всех пользователей (для админа)
  const [users, setUsers] = useState([])

  // Текущий пользователь
  const [currentUser, setCurrentUserState] = useState(() => {
    try {
      const savedUser = localStorage.getItem('vpn_current_user')
      if (savedUser) {
        const sanitized = parseUserSafely(savedUser)
        if (sanitized) {
          logger.debug('useAppState', 'Восстановлен пользователь из localStorage', { email: sanitized.email })
          return sanitized
        } else {
          logger.warn('useAppState', 'Данные пользователя из localStorage не прошли валидацию, удаляем')
          localStorage.removeItem('vpn_current_user')
        }
      }
    } catch (err) {
      logger.error('useAppState', 'Ошибка при восстановлении пользователя из localStorage', null, err)
      localStorage.removeItem('vpn_current_user')
    }
    return null
  })

  // Сообщения об ошибках и успехе
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)

  // Обертка для setCurrentUser с сохранением в localStorage
  const setCurrentUser = useCallback((user) => {
    setCurrentUserState(user)
    if (user) {
      try {
        localStorage.setItem('vpn_current_user', JSON.stringify(user))
        logger.debug('useAppState', 'Пользователь сохранен в localStorage', { email: user.email })
      } catch (err) {
        logger.error('useAppState', 'Ошибка при сохранении пользователя в localStorage', { email: user?.email }, err)
      }
    } else {
      localStorage.removeItem('vpn_current_user')
      localStorage.removeItem('vpn_current_view')
      logger.debug('useAppState', 'Пользователь удален из localStorage')
    }
  }, [])

  // Автоматическая очистка сообщений через 5 секунд
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  return {
    // Состояние
    users,
    currentUser,
    error,
    success,
    loading,
    
    // Функции для обновления состояния
    setUsers,
    setCurrentUser,
    setError,
    setSuccess,
    setLoading,
  }
}

