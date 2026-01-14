import { useState, useCallback, useEffect } from 'react'
import { dashboardService } from '../services/dashboardService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Custom hook для управления профилем пользователя
 * 
 * @param {Object} currentUser - Текущий пользователь
 * @param {Function} setCurrentUser - Функция для обновления текущего пользователя
 * @param {Function} setUsers - Функция для обновления списка пользователей (для админа)
 * @param {Function} setError - Функция для установки ошибки
 * @param {Function} setSuccess - Функция для установки сообщения об успехе
 * @returns {Object} Объект с состоянием и методами для работы с профилем
 */
export function useProfile(currentUser, setCurrentUser, setUsers, setError, setSuccess) {
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileData, setProfileData] = useState({ name: '', phone: '' })

  // Инициализация данных профиля
  useEffect(() => {
    if (currentUser && !editingProfile) {
      setProfileData({
        name: currentUser.name || '',
        phone: currentUser.phone || '',
      })
    }
  }, [currentUser?.id, currentUser?.name, currentUser?.phone, editingProfile])

  // Обработчики изменения полей профиля
  const handleProfileNameChange = useCallback((e) => {
    const newValue = e.target.value
    setProfileData(prev => ({ ...prev, name: newValue }))
  }, [])

  const handleProfilePhoneChange = useCallback((e) => {
    const newValue = e.target.value
    setProfileData(prev => ({ ...prev, phone: newValue }))
  }, [])

  // Обновление профиля
  const handleUpdateProfile = useCallback(async () => {
    if (!currentUser?.id) {
      setError('Ошибка: не указан ID пользователя')
      return
    }

    try {
      setError('')
      const updatedData = await dashboardService.updateProfile(currentUser.id, profileData)

      // Обновляем локальное состояние
      const updatedUser = { ...currentUser, ...updatedData }
      setCurrentUser(updatedUser)
      
      // Обновляем в списке пользователей (если есть)
      if (setUsers) {
        setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u))
      }
      
      setEditingProfile(false)
      setSuccess('Профиль успешно обновлен')
      setTimeout(() => setSuccess(''), 3000)
      logger.info('Dashboard', 'Профиль обновлен', { userId: currentUser.id })
    } catch (err) {
      logger.error('Dashboard', 'Ошибка обновления профиля', { userId: currentUser.id }, err)
      setError('Ошибка обновления профиля')
    }
  }, [currentUser, profileData, setCurrentUser, setUsers, setError, setSuccess])

  // Удаление аккаунта
  const handleDeleteAccount = useCallback(async (onLogout) => {
    if (!currentUser?.id) {
      setError('Ошибка: не указан ID пользователя')
      return
    }

    const confirmText = 'УДАЛИТЬ'
    const userInput = window.prompt(
      `Вы уверены, что хотите удалить свой аккаунт? Это действие необратимо.\n\n` +
      `Все ваши данные будут удалены, включая подписку и историю платежей.\n\n` +
      `Введите "${confirmText}" для подтверждения:`
    )

    if (userInput !== confirmText) {
      return
    }

    try {
      setError('')
      await dashboardService.deleteAccount(currentUser)
      
      setSuccess('Аккаунт успешно удален')
      if (onLogout) {
        await onLogout()
      }
    } catch (err) {
      logger.error('Dashboard', 'Ошибка удаления аккаунта', { userId: currentUser.id }, err)
      setError('Ошибка удаления аккаунта')
    }
  }, [currentUser, setError, setSuccess])

  return {
    editingProfile,
    profileData,
    setEditingProfile,
    handleProfileNameChange,
    handleProfilePhoneChange,
    handleUpdateProfile,
    handleDeleteAccount,
  }
}

