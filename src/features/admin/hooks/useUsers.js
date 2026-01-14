import { useState, useCallback, useEffect, useRef } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
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
  const unsubscribeRef = useRef(null)

  // Нормализация дат пользователя из Firestore
  // Firestore может возвращать даты как Timestamp объекты, ISO строки или числа
  const normalizeUserDates = (user) => {
    const normalized = { ...user }
    
    // Нормализация createdAt
    if (normalized.createdAt) {
      if (normalized.createdAt.seconds) {
        // Firestore Timestamp объект
        normalized.createdAt = normalized.createdAt.seconds * 1000
      } else if (typeof normalized.createdAt === 'string') {
        // ISO строка
        normalized.createdAt = new Date(normalized.createdAt).getTime()
      } else if (typeof normalized.createdAt === 'number') {
        // Уже timestamp
        normalized.createdAt = normalized.createdAt
      }
    }
    
    // Нормализация expiresAt
    if (normalized.expiresAt) {
      if (normalized.expiresAt.seconds) {
        // Firestore Timestamp объект
        normalized.expiresAt = normalized.expiresAt.seconds * 1000
      } else if (typeof normalized.expiresAt === 'string') {
        // ISO строка
        normalized.expiresAt = new Date(normalized.expiresAt).getTime()
      } else if (typeof normalized.expiresAt === 'number') {
        // Уже timestamp
        normalized.expiresAt = normalized.expiresAt
      }
    }
    
    return normalized
  }

  // Загрузка всех пользователей с улучшенной обработкой ошибок
  const loadUsers = useCallback(async () => {
    // Проверка прав доступа - только админы могут загружать список всех пользователей
    if (!currentUser || currentUser.role !== 'admin') {
      logger.warn('Admin', 'Попытка загрузки пользователей без прав администратора')
      return
    }

    setLoading(true)
    try {
      logger.info('Admin', '🔄 Начало загрузки пользователей (ручное обновление)')
      const usersList = await adminService.loadUsers()
      // Нормализуем даты для всех пользователей
      const normalizedUsers = usersList.map(normalizeUserDates)
      
      // ВАЖНО: При ручном обновлении ВСЕГДА возвращаем новые данные
      // Это гарантирует, что пользователь увидит актуальные данные из Firestore
      // даже если наша проверка не обнаружила изменений
      // Создаем новые объекты для каждого пользователя, чтобы React увидел изменения
      const freshUsers = normalizedUsers.map(user => ({ ...user }))
      
      setUsers(prevUsers => {
        // Сравниваем по ID и ключевым полям для логирования
        const prevUsersMap = new Map(prevUsers.map(u => [u.id, u]))
        const hasRealChanges = freshUsers.some(newUser => {
          const prevUser = prevUsersMap.get(newUser.id)
          if (!prevUser) return true // Новый пользователь
          
          // Сравниваем ключевые поля, которые могут измениться
          return (
            prevUser.paymentStatus !== newUser.paymentStatus ||
            prevUser.expiresAt !== newUser.expiresAt ||
            prevUser.tariffId !== newUser.tariffId ||
            prevUser.plan !== newUser.plan ||
            prevUser.subId !== newUser.subId ||
            prevUser.uuid !== newUser.uuid ||
            prevUser.name !== newUser.name ||
            prevUser.email !== newUser.email ||
            prevUser.devices !== newUser.devices ||
            prevUser.trafficGB !== newUser.trafficGB
          )
        })
        
        const countChanged = prevUsers.length !== freshUsers.length
        
        if (hasRealChanges || countChanged) {
          logger.info('Admin', '✅ Обнаружены изменения при ручном обновлении', { 
            count: freshUsers.length,
            prevCount: prevUsers.length,
            hasRealChanges,
            countChanged
          })
        } else {
          logger.info('Admin', 'ℹ️ Видимых изменений не обнаружено, но обновляем данные принудительно (ручное обновление)', { 
            count: freshUsers.length
          })
        }
        
        // ВСЕГДА возвращаем новые данные при ручном обновлении
        // Используем freshUsers (новые объекты) для гарантии обновления React
        return freshUsers
      })
      
      logger.info('Admin', '✅ Пользователи успешно загружены и нормализованы', { count: normalizedUsers.length })
    } catch (err) {
      const errorMessage = handleFirestoreError(err)
      logError('Admin', 'loadUsers', err, { userId: currentUser.id })
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [currentUser, setUsers, setError])

  // Real-time listener для автоматического обновления списка пользователей
  useEffect(() => {
    // Проверка прав доступа - только админы могут подписываться на изменения
    if (!currentUser || currentUser.role !== 'admin' || !db) {
      return
    }

    logger.info('Admin', 'Подписка на real-time обновления пользователей', { adminId: currentUser.id })

    try {
      const usersCollection = collection(db, `artifacts/${APP_ID}/public/data/users_v4`)
      
      // Подписываемся на изменения в коллекции пользователей
      const unsubscribe = onSnapshot(
        usersCollection,
        (snapshot) => {
          const usersList = []
          snapshot.forEach((docSnapshot) => {
            usersList.push({
              id: docSnapshot.id,
              ...docSnapshot.data(),
            })
          })
          
          // Нормализуем даты для всех пользователей
          const normalizedUsers = usersList.map(normalizeUserDates)
          
          // Обновляем состояние только если данные действительно изменились
          setUsers(prevUsers => {
            // Сравниваем по ID и ключевым полям для более точного определения изменений
            const prevUsersMap = new Map(prevUsers.map(u => [u.id, u]))
            const hasRealChanges = normalizedUsers.some(newUser => {
              const prevUser = prevUsersMap.get(newUser.id)
              if (!prevUser) return true // Новый пользователь
              
              // Сравниваем ключевые поля, которые могут измениться
              return (
                prevUser.paymentStatus !== newUser.paymentStatus ||
                prevUser.expiresAt !== newUser.expiresAt ||
                prevUser.tariffId !== newUser.tariffId ||
                prevUser.plan !== newUser.plan ||
                prevUser.subId !== newUser.subId ||
                prevUser.uuid !== newUser.uuid ||
                prevUser.name !== newUser.name ||
                prevUser.email !== newUser.email ||
                prevUser.devices !== newUser.devices ||
                prevUser.trafficGB !== newUser.trafficGB
              )
            })
            
            // Также проверяем, изменилось ли количество пользователей
            const countChanged = prevUsers.length !== normalizedUsers.length
            
            if (hasRealChanges || countChanged) {
              logger.info('Admin', '🔄 Обнаружены изменения в данных пользователей (real-time), обновление списка', { 
                count: normalizedUsers.length,
                prevCount: prevUsers.length,
                hasRealChanges,
                countChanged
              })
              return normalizedUsers
            }
            
            // Если изменений нет, возвращаем предыдущее состояние
            return prevUsers
          })
        },
        (error) => {
          logger.error('Admin', 'Ошибка real-time подписки на пользователей', { adminId: currentUser.id }, error)
          setError('Ошибка обновления списка пользователей')
        }
      )

      // Сохраняем функцию отписки
      unsubscribeRef.current = unsubscribe

      // Очистка при размонтировании или изменении пользователя
      return () => {
        if (unsubscribeRef.current) {
          logger.info('Admin', 'Отписка от real-time обновлений пользователей', { adminId: currentUser.id })
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }
      }
    } catch (err) {
      logger.error('Admin', 'Ошибка настройки real-time подписки на пользователей', { adminId: currentUser.id }, err)
      setError('Ошибка настройки обновления списка пользователей')
    }
  }, [currentUser, db, setUsers, setError])

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
      
      // Логируем subId отдельно для отладки
      const oldSubId = user.subId || (user.subid ? (Array.isArray(user.subid) ? user.subid[0] : user.subid) : '')
      const newSubId = normalizedUser.subId || ''
      const subIdChanged = String(oldSubId || '').trim() !== String(newSubId || '').trim()
      
      logger.info('Admin', 'Сохранение пользователя из карточки', { 
        userId, 
        fields: Object.keys(normalizedUser),
        subIdChanged: subIdChanged,
        oldSubId: oldSubId,
        newSubId: newSubId,
        changes: Object.keys(normalizedUser).filter(key => {
          const oldValue = user[key]
          const newValue = normalizedUser[key]
          return String(oldValue || '').trim() !== String(newValue || '').trim()
        })
      })
      
      console.log('🔍 handleSaveUserCard: Данные перед сохранением', {
        userId,
        normalizedUser,
        subId: normalizedUser.subId,
        oldSubId,
        newSubId,
        subIdChanged,
      })
      
      // Сохранение в Firestore и 3x-ui
      // Передаем старые данные пользователя и новые обновления
      await adminService.updateUser(userId, normalizedUser, user, settings)
      
      // Оптимистичное обновление локального состояния
      // Сохраняем все поля из normalizedUser, включая subid
      // Также сохраняем поля, которые не были нормализованы (например, createdAt, passwordHash и т.д.)
      setUsers(prev => {
        const updated = prev.map(u => {
          if (u.id === userId) {
            // Объединяем существующего пользователя с нормализованными данными
            // Это гарантирует, что мы не потеряем поля, которые не были обновлены
            const updatedUser = {
              ...u, // Сохраняем все существующие поля
              ...normalizedUser, // Перезаписываем нормализованными данными
            }
            console.log('✅ Обновление локального состояния пользователя', {
              userId,
              updatedUser,
              subId: updatedUser.subId,
              allFields: Object.keys(updatedUser),
            })
            return updatedUser
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

