import { useState, useCallback } from 'react'
import { adminService } from '../services/adminService.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Custom hook для управления пользователями (только для админа)
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

  // Загрузка всех пользователей
  const loadUsers = useCallback(async () => {
    // Проверка прав доступа - только админы могут загружать список всех пользователей
    if (!currentUser || currentUser.role !== 'admin') {
      logger.warn('Admin', 'Попытка загрузки пользователей без прав администратора')
      return
    }

    try {
      setLoading(true)
      const usersList = await adminService.loadUsers()
      setUsers(usersList)
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки пользователей', { code: err.code }, err)
      // Более детальная обработка ошибок
      if (err.code === 'permission-denied') {
        setError('Нет доступа к базе данных. Проверьте правила безопасности Firestore.')
      } else if (err.code === 'unavailable') {
        setError('Сервис временно недоступен. Попробуйте позже.')
      } else {
        setError('Ошибка загрузки данных: ' + (err.message || 'Неизвестная ошибка'))
      }
    } finally {
      setLoading(false)
    }
  }, [currentUser, setUsers, setError])

  // Обновление пользователя
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
      
      await adminService.updateUser(userId, updates, user, settings)
      
      // Обновляем локальное состояние
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u))
      
      // Если обновляем текущего пользователя
      if (currentUser.id === userId) {
        setCurrentUser({ ...currentUser, ...updates })
      }

      setSuccess('Пользователь обновлен')
      setEditingUser(null)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', 'Ошибка обновления пользователя', { userId }, err)
      setError('Ошибка обновления пользователя')
    }
  }, [currentUser, users, setUsers, setCurrentUser, settings, setError, setSuccess])

  // Сохранение пользователя из карточки (сохраняет все поля, включая name и phone)
  const handleSaveUserCard = useCallback(async (updatedUser) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав')
      return
    }

    try {
      const userId = updatedUser.id
      const user = users.find(u => u.id === userId)
      if (!user) {
        setError('Пользователь не найден')
        return
      }

      // Подготавливаем обновления: берем все редактируемые поля из updatedUser
      // updatedUser уже содержит все актуальные данные из формы редактирования
      // ВАЖНО: Берем значения напрямую из updatedUser, так как он содержит все актуальные данные
      // Используем значения из updatedUser, если они есть, иначе берем из user
      const updates = {
        uuid: updatedUser.uuid != null ? String(updatedUser.uuid) : (user.uuid || ''),
        name: updatedUser.name != null ? String(updatedUser.name) : (user.name || ''),
        phone: updatedUser.phone != null ? String(updatedUser.phone) : (user.phone || ''),
        expiresAt: updatedUser.expiresAt != null ? Number(updatedUser.expiresAt) : (user.expiresAt || null),
        trafficGB: updatedUser.trafficGB != null ? Number(updatedUser.trafficGB) || 0 : (Number(user.trafficGB) || 0),
        devices: updatedUser.devices != null ? Number(updatedUser.devices) || 1 : (Number(user.devices) || 1),
        tariffId: updatedUser.tariffId != null ? String(updatedUser.tariffId) : (user.tariffId || null),
        plan: updatedUser.plan != null ? String(updatedUser.plan) : (user.plan || 'free'),
      }
      
      logger.info('Admin', 'Сохранение пользователя из карточки', { 
        userId, 
        updates,
        updatesKeys: Object.keys(updates),
        updatedUserKeys: Object.keys(updatedUser),
        updatedUserValues: {
          uuid: updatedUser.uuid,
          name: updatedUser.name,
          phone: updatedUser.phone,
          expiresAt: updatedUser.expiresAt,
          trafficGB: updatedUser.trafficGB,
          devices: updatedUser.devices,
          tariffId: updatedUser.tariffId,
          plan: updatedUser.plan,
        },
        originalUser: {
          uuid: user.uuid,
          name: user.name,
          phone: user.phone,
          expiresAt: user.expiresAt,
          trafficGB: user.trafficGB,
          devices: user.devices,
          tariffId: user.tariffId,
          plan: user.plan,
        }
      })
      
      console.log('📤 Отправка обновлений в adminService:', updates)
      const result = await adminService.updateUser(userId, updates, { ...user, ...updates }, settings)
      console.log('✅ Результат обновления из adminService:', result)
      
      // Обновляем локальное состояние - ВАЖНО: используем функциональное обновление
      setUsers(prev => {
        const updated = prev.map(u => {
          if (u.id === userId) {
            const merged = { ...u, ...updates }
            console.log('🔄 Обновление пользователя в локальном состоянии:', { 
              userId, 
              old: u, 
              new: merged,
              updates 
            })
            return merged
          }
          return u
        })
        console.log('📊 Обновленный список пользователей:', updated.length)
        return updated
      })
      
      // Если обновляем текущего пользователя
      if (currentUser.id === userId) {
        const updatedCurrentUser = { ...currentUser, ...updates }
        console.log('👤 Обновление текущего пользователя:', updatedCurrentUser)
        setCurrentUser(updatedCurrentUser)
      }

      console.log('✅ Локальное состояние обновлено')
      setSuccess('Данные пользователя обновлены')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения пользователя', { userId: updatedUser.id }, err)
      setError('Ошибка сохранения данных пользователя')
      throw err
    }
  }, [currentUser, users, setUsers, setCurrentUser, settings, setError, setSuccess])

  // Генерация UUID
  const generateUUID = useCallback(() => {
    console.log('🔑 generateUUID вызван')
    const uuid = ThreeXUI.generateUUID()
    console.log('🔑 Сгенерирован UUID:', uuid)
    return uuid
  }, [])

  // Удаление пользователя
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
      
      // Обновление локального состояния
      setUsers(prev => prev.filter((u) => u.id !== userId))
      setSuccess('Пользователь удален из системы и VPN панели')
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления пользователя', { userId }, err)
      // Более детальная обработка ошибок
      let errorMessage = 'Ошибка удаления пользователя'
      if (err.code === 'permission-denied') {
        errorMessage = 'Нет доступа к базе данных. Проверьте правила безопасности Firestore.'
      } else if (err.code === 'unavailable') {
        errorMessage = 'Сервис временно недоступен. Попробуйте позже.'
      } else if (err.message) {
        errorMessage = 'Ошибка удаления: ' + err.message
      }
      setError(errorMessage)
    }
  }, [currentUser, users, setUsers, setError, setSuccess])

  // Проверяем, что функции определены перед возвратом
  const returnValue = {
    editingUser,
    loading,
    setEditingUser,
    loadUsers,
    handleUpdateUser,
    handleDeleteUser,
    handleSaveUserCard,
    generateUUID,
  }
  
  // Отладочное логирование перед возвратом
  console.log('🔍 useUsers: Возвращаемые значения', {
    hasHandleSaveUserCard: !!returnValue.handleSaveUserCard,
    hasGenerateUUID: !!returnValue.generateUUID,
    handleSaveUserCardType: typeof returnValue.handleSaveUserCard,
    generateUUIDType: typeof returnValue.generateUUID,
    allKeys: Object.keys(returnValue),
  })
  
  // Убеждаемся, что функции всегда определены
  if (!returnValue.handleSaveUserCard) {
    console.error('❌ useUsers: handleSaveUserCard не определен перед возвратом!')
  }
  if (!returnValue.generateUUID) {
    console.error('❌ useUsers: generateUUID не определен перед возвратом!')
  }
  
  return returnValue
}
