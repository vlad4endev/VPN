import { useState, useCallback } from 'react'
import { dashboardService } from '../services/dashboardService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Custom hook для управления подписками
 * 
 * @param {Object} currentUser - Текущий пользователь
 * @param {Function} setCurrentUser - Функция для обновления текущего пользователя
 * @param {Function} setUsers - Функция для обновления списка пользователей (для админа)
 * @param {Array} tariffs - Список тарифов
 * @param {Function} setError - Функция для установки ошибки
 * @param {Function} setSuccess - Функция для установки сообщения об успехе
 * @returns {Object} Объект с состоянием и методами для работы с подписками
 */
export function useSubscription(currentUser, setCurrentUser, setUsers, tariffs, setError, setSuccess) {
  const [selectedTariff, setSelectedTariff] = useState(null)
  const [creatingSubscription, setCreatingSubscription] = useState(false)

  // Создание подписки
  const handleCreateSubscription = useCallback(async (tariff) => {
    if (!currentUser || !tariff) {
      setError('Недостаточно данных для создания подписки')
      return
    }

    try {
      setCreatingSubscription(true)
      setError('')
      setSuccess('')

      const updatedData = await dashboardService.createSubscription(currentUser, tariff)

      // Обновляем локальное состояние
      const updatedUser = {
        ...currentUser,
        ...updatedData,
      }
      setCurrentUser(updatedUser)
      
      // Обновляем в списке пользователей (если есть)
      if (setUsers) {
        setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u))
      }

      setSelectedTariff(null)
      setSuccess('Подписка успешно оформлена!')
      setTimeout(() => setSuccess(''), 5000)
      logger.info('Dashboard', 'Подписка оформлена', { 
        email: currentUser.email, 
        tariffId: tariff.id,
        uuid: updatedData.uuid 
      })
    } catch (err) {
      logger.error('Dashboard', 'Ошибка оформления подписки', { 
        email: currentUser.email,
        tariffId: tariff.id
      }, err)
      
      const errorMessage = dashboardService.getErrorMessage(err)
      setError(errorMessage)
    } finally {
      setCreatingSubscription(false)
    }
  }, [currentUser, setCurrentUser, setUsers, setError, setSuccess])

  // Продление подписки
  const handleRenewSubscription = useCallback(async () => {
    if (!currentUser || !currentUser.tariffId) {
      setError('Не найдена информация о текущем тарифе')
      return
    }

    // Находим тариф
    const tariff = tariffs.find(t => t.id === currentUser.tariffId)
    if (!tariff) {
      setError('Тариф не найден')
      return
    }

    await handleCreateSubscription(tariff)
  }, [currentUser, tariffs, handleCreateSubscription])

  // Получение ключа
  const handleGetKey = useCallback(async () => {
    if (!currentUser) {
      setError('Необходимо войти в систему для получения ключа.')
      return
    }

    try {
      setError('')
      setSuccess('')
      
      const generatedUUID = await dashboardService.getKey(currentUser)

      // Обновляем локальное состояние
      const updatedUser = { ...currentUser, uuid: generatedUUID }
      setCurrentUser(updatedUser)
      
      // Обновляем в списке пользователей (если есть)
      if (setUsers) {
        setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u))
      }
      
      logger.info('Dashboard', 'Ключ успешно получен', { email: currentUser.email, uuid: generatedUUID })
      setSuccess('Ключ успешно получен! Теперь вы можете использовать VPN.')
    } catch (err) {
      logger.error('Dashboard', 'Ошибка получения ключа', { email: currentUser.email }, err)
      
      const errorMessage = dashboardService.getErrorMessage(err)
      setError(errorMessage)
    }
  }, [currentUser, setCurrentUser, setUsers, setError, setSuccess])

  return {
    selectedTariff,
    creatingSubscription,
    setSelectedTariff,
    handleCreateSubscription,
    handleRenewSubscription,
    handleGetKey,
  }
}

