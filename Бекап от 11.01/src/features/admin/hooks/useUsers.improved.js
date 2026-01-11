import { useState, useCallback } from 'react'
import { adminService } from '../services/adminService.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import logger from '../../../shared/utils/logger.js'
import { validateUser, normalizeUser } from '../utils/userValidation.js'
import { handleFirestoreError, logError, withErrorHandling } from '../utils/errorHandler.js'

/**
 * Улучшенный custom hook для управления пользователями (только для админа)
 * 
 * Улучшения:
 * - Валидация данных перед сохранением
 * - Улучшенная обработка ошибок Firestore
 * - Нормализация данных
 * - Оптимистичные обновления
 * - Лучшее логирование
 * 
 * @param {Object} currentUser - Текущий пользователь (должен быть админом)
 * @param {Array} users - Список пользователей
 * @param {Function} setUsers - Функция для обновления списка пользователей
 * @param {Function} setCurrentUser - Функция для обновления текущего пользователя
 * @param {Object} settings - Настройки (для обновления в 3x-ui)
 * @param {Function} setError - Функция для установки ошибки
 * @param {Function} setSuccess - Функция для установки сообщения об успехе
 * @returns {Object} Объект с состоянием и методами для работы с пользователями
 */
export function useUsers(currentUser, users, setUsers, setCurrentUser, settings, setError, setSuccess) {
  const [editingUser, setEditingUser] = useState(null)
  const [loading, setLoading] = useState(false)

  // Загрузка всех пользователей с улучшенной обработкой ошибок
  const loadUsers = useCallback(async () => {
    // Проверка прав доступа - только админы могут загружать список всех пользователей
    if (!currentUser || currentUser.role !== 'admin') {
      logger.warn('Admin', 'Попытка загрузки пользователей без прав администратора')
      return
    }

    setLoading(true)
    try {
      const usersList = await adminService.loadUsers()
      setUsers(usersList)
      logger.info('Admin', 'Пользователи успешно загружены', { count: usersList.length })
    } catch (err) {
      const errorMessage = handleFirestoreError(err)
      logError('Admin', 'loadUsers', err, { userId: currentUser.id })
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [currentUser, setUsers, setError])

  // Обновление пользователя с валидацией
  const handleUpdateUser = useCallback(async (userId, updates) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав')
      return
    }

    try {
      const user = users.find(u => u.id === userId)
      if (!user) {
        setError('Пользователь не найден')
        return
      }

      // Валидация обновлений
      const updatedUser = { ...user, ...updates }
      const validation = validateUser(updatedUser)
      if (!validation.isValid) {
        setError(validation.errors.join(', '))
        return
      }

      // Нормализация данных
      const normalizedUpdates = normalizeUser(updatedUser)
      
      await adminService.updateUser(userId, normalizedUpdates, normalizedUpdates, settings)
      
      // Оптимистичное обновление локального состояния
      setUsers(prev => prev.map(u => u.id === userId ? normalizedUpdates : u))
      
      // Если обновляем текущего пользователя
      if (currentUser.id === userId) {
        setCurrentUser(normalizedUpdates)
      }

      setSuccess('Пользователь обновлен')
      setEditingUser(null)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      const errorMessage = handleFirestoreError(err)
      logError('Admin', 'handleUpdateUser', err, { userId })
      setError(errorMessage)
    }
  }, [currentUser, users, setUsers, setCurrentUser, settings, setError, setSuccess])

  // Улучшенное сохранение пользователя из карточки
  const handleSaveUserCard = useCallback(async (updatedUser) => {
    if (!currentUser || currentUser.role !== 'admin') {
      const error = new Error('Недостаточно прав')
      logError('Admin', 'handleSaveUserCard', error, { userId: currentUser?.id })
      setError('Недостаточно прав')
      throw error
    }

    // Валидация данных перед сохранением
    const validation = validateUser(updatedUser)
    if (!validation.isValid) {
      const error = new Error(validation.errors.join(', '))
      logError('Admin', 'handleSaveUserCard', error, { 
        userId: updatedUser.id, 
        errors: validation.errors 
      })
      setError(validation.errors.join(', '))
      throw error
    }

    try {
      const userId = updatedUser.id
      const user = users.find(u => u.id === userId)
      if (!user) {
        const error = new Error('Пользователь не найден')
        logError('Admin', 'handleSaveUserCard', error, { userId })
        setError('Пользователь не найден')
        throw error
      }

      // Нормализация данных перед сохранением
      const normalizedUser = normalizeUser(updatedUser)
      
      logger.info('Admin', 'Сохранение пользователя из карточки', { 
        userId, 
        fields: Object.keys(normalizedUser),
        changes: Object.keys(normalizedUser).filter(key => 
          normalizedUser[key] !== user[key]
        )
      })
      
      // Сохранение в Firestore и 3x-ui
      await adminService.updateUser(userId, normalizedUser, normalizedUser, settings)
      
      // Оптимистичное обновление локального состояния
      setUsers(prev => {
        const updated = prev.map(u => {
          if (u.id === userId) {
            return normalizedUser
          }
          return u
        })
        return updated
      })
      
      // Если обновляем текущего пользователя
      if (currentUser.id === userId) {
        setCurrentUser(normalizedUser)
      }

      setSuccess('Данные пользователя обновлены')
      setTimeout(() => setSuccess(''), 3000)
      
      logger.info('Admin', 'Пользователь успешно сохранен', { userId })
    } catch (err) {
      const errorMessage = handleFirestoreError(err)
      logError('Admin', 'handleSaveUserCard', err, { userId: updatedUser.id })
      setError(errorMessage)
      throw err // Пробрасываем для обработки в компоненте
    }
  }, [currentUser, users, setUsers, setCurrentUser, settings, setError, setSuccess])

  // Генерация UUID
  const generateUUID = useCallback(() => {
    try {
      const uuid = ThreeXUI.generateUUID()
      if (import.meta.env.DEV) {
        logger.debug('Admin', 'UUID сгенерирован', { uuid })
      }
      return uuid
    } catch (err) {
      logError('Admin', 'generateUUID', err)
      setError('Ошибка генерации UUID')
      return ''
    }
  }, [setError])

  // Удаление пользователя с улучшенной обработкой ошибок
  const handleDeleteUser = useCallback(async (userId) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав')
      return
    }

    if (!window.confirm('Вы уверены, что хотите удалить этого пользователя?')) {
      return
    }

    // Находим пользователя для удаления
    const userToDelete = users.find((u) => u.id === userId)
    if (!userToDelete) {
      setError('Пользователь не найден')
      return
    }

    try {
      await adminService.deleteUser(userId, userToDelete)
      
      // Оптимистичное обновление локального состояния
      setUsers(prev => prev.filter((u) => u.id !== userId))
      setSuccess('Пользователь удален из системы и VPN панели')
      setTimeout(() => setSuccess(''), 3000)
      
      logger.info('Admin', 'Пользователь успешно удален', { userId })
    } catch (err) {
      const errorMessage = handleFirestoreError(err)
      logError('Admin', 'handleDeleteUser', err, { userId })
      setError(errorMessage)
    }
  }, [currentUser, users, setUsers, setError, setSuccess])

  return {
    editingUser,
    loading,
    setEditingUser,
    loadUsers,
    handleUpdateUser,
    handleDeleteUser,
    handleSaveUserCard,
    generateUUID,
  }
}

