import { useState, useCallback } from 'react'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { adminService } from '../services/adminService.js'
import { usersApiService } from '../services/usersApiService.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import logger from '../../../shared/utils/logger.js'
import { validateUser, normalizeUser } from '../utils/userValidation.js'
import { handleFirestoreError, logError, withErrorHandling } from '../utils/errorHandler.js'
import { canAccessFinances } from '../../../shared/constants/admin.js'

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
    // Админ и бухгалтер (доступ к финансам) могут загружать список для раздела «Финансы»; для админ-панели — только админ
    if (!currentUser || !canAccessFinances(currentUser.role)) {
      logger.warn('Admin', 'Попытка загрузки пользователей без прав', { role: currentUser?.role })
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

  // Список пользователей загружается через loadUsers() (getDocs) при открытии админки и после действий (создание, импорт, обновление, удаление).
  // onSnapshot для этой коллекции отключён из-за бага Firestore SDK 12.x: "INTERNAL ASSERTION FAILED: Unexpected state" в watch stream
  // (см. https://github.com/firebase/firebase-js-sdk/issues/9267). Для обновления списка используйте кнопку обновления или повторное открытие вкладки.

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
      // Не сбрасываем uuid при частичном обновлении (например, только роли): если в updates нет своего uuid — оставляем из user
      if ((updates.uuid === undefined || updates.uuid === '') && user.uuid) {
        updatedUser.uuid = user.uuid
      }
      const validation = validateUser(updatedUser)
      if (!validation.isValid) {
        setError(validation.errors.join(', '))
        return
      }

      // Нормализация данных
      const normalizedUpdates = normalizeUser(updatedUser)
      
      await adminService.updateUser(userId, normalizedUpdates, user, settings)
      
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

      // Мержим с текущим user из state, чтобы не сбрасывать uuid и другие поля при частичном обновлении (например, только роли)
      const toSave = { ...user, ...updatedUser }
      // Нормализация данных перед сохранением
      const normalizedUser = normalizeUser(toSave)
      
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

  // Генерация subId для 3x-ui
  const generateSubId = useCallback(() => {
    try {
      const subId = ThreeXUI.generateSubId()
      if (import.meta.env.DEV) {
        logger.debug('Admin', 'subId сгенерирован', { subId })
      }
      return subId
    } catch (err) {
      logError('Admin', 'generateSubId', err)
      setError('Ошибка генерации subId')
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

  // Создание пользователя администратором через backend (Firebase Admin + Firestore)
  const createUser = useCallback(async (newUserData) => {
    if (!currentUser || currentUser.role !== 'admin') {
      const err = new Error('Недостаточно прав')
      logError('Admin', 'createUser', err, { currentUserId: currentUser?.id })
      setError('Недостаточно прав')
      throw err
    }

    try {
      const payload = {
        email: (newUserData.email || '').trim(),
        password: newUserData.password || '',
        name: (newUserData.name || '').trim(),
        phone: newUserData.phone || '',
        role: newUserData.role || 'user',
        plan: newUserData.plan || 'free',
        tgId: newUserData.tgId || '',
        tariffId: newUserData.tariffId || '',
        tariffName: newUserData.tariffName || '',
        expiresAt: newUserData.expiresAt ?? null,
      }

      if (!payload.email || !payload.password || !payload.name) {
        const err = new Error('Email, имя и пароль обязательны')
        logError('Admin', 'createUser', err, { payloadKeys: Object.keys(payload) })
        setError(err.message)
        throw err
      }

      const createdUser = await usersApiService.createUser(payload)

      // Обновляем локальное состояние
      setUsers((prev) => [...prev, createdUser])

      setSuccess('Пользователь создан')
      setTimeout(() => setSuccess(''), 3000)

      logger.info('Admin', 'Пользователь создан администратором через backend', {
        userId: createdUser.id,
        email: createdUser.email,
      })

      return createdUser
    } catch (err) {
      const errorMessage = handleFirestoreError(err)
      logError('Admin', 'createUser', err)
      setError(errorMessage)
      throw err
    }
  }, [currentUser, setUsers, setError, setSuccess])

  // Загрузка данных из NocoDB для окна сопоставления (только админ)
  const fetchNocoDBPreview = useCallback(async (params) => {
    if (!currentUser || currentUser.role !== 'admin') {
      const err = new Error('Недостаточно прав')
      logError('Admin', 'fetchNocoDBPreview', err, { currentUserId: currentUser?.id })
      setError('Недостаточно прав')
      throw err
    }
    try {
      return await usersApiService.fetchNocoDBPreview(params)
    } catch (err) {
      const errorMessage = handleFirestoreError(err)
      const msg = err?.message || ''
      const isExpected =
        msg.includes('Сервис недоступен') ||
        msg.includes('404')
      if (!isExpected) logError('Admin', 'fetchNocoDBPreview', err)
      setError(errorMessage)
      throw err
    }
  }, [currentUser, setError])

  // Импорт пользователей из NocoDB (только админ)
  const importFromNocoDB = useCallback(async (params) => {
    if (!currentUser || currentUser.role !== 'admin') {
      const err = new Error('Недостаточно прав')
      logError('Admin', 'importFromNocoDB', err, { currentUserId: currentUser?.id })
      setError('Недостаточно прав')
      throw err
    }
    try {
      const result = await usersApiService.importFromNocoDB(params)
      await loadUsers()
      setSuccess(
        `Импорт: создано ${result.created}${(result.updated ?? 0) > 0 ? `, обновлено ${result.updated}` : ''}, пропущено ${result.skipped}, ошибок ${result.errors}`,
      )
      setTimeout(() => setSuccess(''), 5000)
      logger.info('Admin', 'Импорт из NocoDB выполнен', result)
      return result
    } catch (err) {
      const errorMessage = handleFirestoreError(err)
      logError('Admin', 'importFromNocoDB', err)
      setError(errorMessage)
      throw err
    }
  }, [currentUser, loadUsers, setError, setSuccess])

  const getSavedNocoDBImportConfig = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'admin') return { config: null }
    try {
      return await usersApiService.getSavedNocoDBImportConfig()
    } catch (err) {
      const msg = err?.message || ''
      const isExpected =
        msg.includes('Сервис недоступен') ||
        msg.includes('Сервис временно недоступен') ||
        msg.includes('network') ||
        msg.includes('Failed to fetch')
      if (isExpected) {
        if (import.meta.env.DEV) {
          console.warn('[Admin] getSavedNocoDBImportConfig:', msg)
        }
      } else {
        logError('Admin', 'getSavedNocoDBImportConfig', err)
      }
      return { config: null }
    }
  }, [currentUser])

  const saveNocoDBImportConfig = useCallback(async (params) => {
    if (!currentUser || currentUser.role !== 'admin') {
      const err = new Error('Недостаточно прав')
      logError('Admin', 'saveNocoDBImportConfig', err)
      throw err
    }
    try {
      const result = await usersApiService.saveNocoDBImportConfig(params)
      setSuccess('Настройки импорта сохранены для автозагрузки')
      setTimeout(() => setSuccess(''), 4000)
      return result
    } catch (err) {
      const errorMessage = handleFirestoreError(err)
      logError('Admin', 'saveNocoDBImportConfig', err)
      setError(errorMessage)
      throw err
    }
  }, [currentUser, setError, setSuccess])

  return {
    editingUser,
    loading,
    setEditingUser,
    loadUsers,
    handleUpdateUser,
    handleDeleteUser,
    handleSaveUserCard,
    generateUUID,
    generateSubId,
    createUser,
    fetchNocoDBPreview,
    importFromNocoDB,
    getSavedNocoDBImportConfig,
    saveNocoDBImportConfig,
  }
}

