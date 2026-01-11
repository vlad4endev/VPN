import { useState, useCallback, useRef } from 'react'
import { adminService } from '../services/adminService.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Custom hook для управления настройками (только для админа)
 * 
 * @param {Object} currentUser - Текущий пользователь (должен быть админом)
 * @param {Array} servers - Список серверов
 * @param {Function} setServers - Функция для обновления списка серверов
 * @param {Function} setError - Функция для установки ошибки
 * @param {Function} setSuccess - Функция для установки сообщения об успехе
 * @returns {Object} Объект с состоянием и методами для работы с настройками
 */
export function useSettings(currentUser, setError, setSuccess) {
  const [settings, setSettings] = useState(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [servers, setServers] = useState([])
  const settingsLoadInProgressRef = useRef(false)

  // Загрузка настроек
  const loadSettings = useCallback(async () => {
    // Проверка прав доступа - только админы могут загружать и изменять настройки
    if (!currentUser || currentUser.role !== 'admin') {
      logger.warn('Admin', 'Попытка загрузки настроек без прав администратора')
      return
    }

    // Предотвращаем параллельные загрузки
    if (settingsLoadInProgressRef.current) {
      logger.debug('Admin', 'Загрузка настроек уже выполняется, пропускаем')
      return
    }

    settingsLoadInProgressRef.current = true
    try {
      const data = await adminService.loadSettings()
      setSettings(data)
      
      // Объединяем серверы из Firestore с текущими локальными серверами
      const firestoreServers = data.servers || []
      setServers(prevServers => {
        if (!prevServers) prevServers = []
        // Если локальных серверов нет - используем из Firestore
        if (!prevServers || prevServers.length === 0) {
          return firestoreServers
        }
        
        // Объединяем: серверы из Firestore + локальные серверы, которых нет в Firestore
        const mergedServers = [...firestoreServers]
        let addedCount = 0
        let updatedCount = 0
        
        prevServers.forEach(localServer => {
          const existsInFirestore = firestoreServers.some(fs => fs.id === localServer.id)
          if (!existsInFirestore) {
            mergedServers.push(localServer)
            addedCount++
          } else {
            // Сервер есть в обоих - приоритет локальным данным
            const firestoreIndex = mergedServers.findIndex(fs => fs.id === localServer.id)
            if (firestoreIndex !== -1) {
              const hasLocalTestInfo = localServer.sessionTestedAt || localServer.sessionError !== undefined
              const hasFirestoreTestInfo = mergedServers[firestoreIndex].sessionTestedAt || mergedServers[firestoreIndex].sessionError !== undefined
              
              if (hasLocalTestInfo && (!hasFirestoreTestInfo || new Date(localServer.sessionTestedAt || 0) > new Date(mergedServers[firestoreIndex].sessionTestedAt || 0))) {
                mergedServers[firestoreIndex] = {
                  ...mergedServers[firestoreIndex],
                  ...localServer,
                }
                updatedCount++
              } else {
                mergedServers[firestoreIndex] = {
                  ...mergedServers[firestoreIndex],
                  ...localServer,
                  sessionTested: localServer.sessionTested ?? mergedServers[firestoreIndex].sessionTested,
                  sessionTestedAt: localServer.sessionTestedAt ?? mergedServers[firestoreIndex].sessionTestedAt,
                  sessionError: localServer.sessionError ?? mergedServers[firestoreIndex].sessionError,
                }
                updatedCount++
              }
            }
          }
        })
        
        logger.info('Admin', 'Объединены серверы из Firestore и локальные', { 
          firestoreCount: firestoreServers.length,
          localCount: prevServers.length,
          mergedCount: mergedServers.length,
          addedCount,
          updatedCount
        })
        
        return mergedServers
      })
    } catch (err) {
      logger.error('Admin', 'Ошибка загрузки настроек', null, err)
      // Не показываем ошибку пользователю, так как это не критично для старта приложения
    } finally {
      setSettingsLoading(false)
      settingsLoadInProgressRef.current = false
    }
  }, [currentUser, setServers])

  // Сохранение настроек
  const handleSaveSettings = useCallback(async () => {
    // Проверка прав доступа
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав для сохранения настроек')
      logger.warn('Admin', 'Попытка сохранения настроек без прав администратора', { userId: currentUser?.id })
      return
    }

    if (!settings) return

    try {
      await adminService.saveSettings(settings, servers, currentUser.id)
      setSuccess('Глобальные настройки сохранены и применены ко всем пользователям')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения настроек', { adminId: currentUser.id }, err)
      setError('Ошибка сохранения настроек')
    }
  }, [currentUser, settings, servers, setError, setSuccess])

  return {
    settings,
    settingsLoading,
    servers,
    setSettings,
    setServers,
    loadSettings,
    handleSaveSettings,
  }
}

