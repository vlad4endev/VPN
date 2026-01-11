import { useState, useEffect } from 'react'
import { app, auth, db, googleProvider, firebaseInitError, envValidation } from '../../lib/firebase/config.js'
import { getEnvErrorMessage } from '../utils/envValidation.js'
import logger from '../utils/logger.js'

/**
 * Custom hook для работы с Firebase
 * Предоставляет доступ к инициализированным объектам Firebase и состоянию загрузки
 * 
 * @returns {Object} Объект с Firebase объектами и состоянием
 */
export function useFirebase() {
  const [loading, setLoading] = useState(true)
  const [configError, setConfigError] = useState(null)

  // Проверка конфигурации при монтировании
  useEffect(() => {
    logger.info('App', 'Инициализация приложения')
    if (!envValidation.isValid) {
      const errorMsg = getEnvErrorMessage(envValidation)
      setConfigError(errorMsg)
      setLoading(false)
      logger.error('App', 'Приложение не может быть запущено из-за ошибок конфигурации')
    } else {
      logger.info('App', 'Конфигурация проверена успешно')
    }
  }, [])

  // Проверка доступности Firebase
  useEffect(() => {
    if (!app || !auth || !db) {
      let errorMsg = 'Firebase не инициализирован.\n\n'
      
      if (firebaseInitError) {
        errorMsg += `Ошибка: ${firebaseInitError}\n\n`
      }
      
      errorMsg += 'Возможные причины:\n'
      errorMsg += '1. Переменные окружения не загружены (проверьте консоль браузера)\n'
      errorMsg += '2. Dev сервер не был перезапущен после изменения .env\n'
      errorMsg += '3. Неправильные значения в .env файле\n\n'
      errorMsg += 'Проверьте консоль браузера для детальной диагностики.'
      
      console.error('❌ Firebase не инициализирован!')
      console.error('app:', app)
      console.error('auth:', auth)
      console.error('db:', db)
      console.error('firebaseInitError:', firebaseInitError)
      
      // Устанавливаем configError только если это критично
      // Если view === 'landing', не блокируем показ страницы (это будет обработано в компоненте)
      setConfigError(errorMsg)
      setLoading(false)
    } else {
      console.log('✅ Firebase компоненты инициализированы:', { app: !!app, auth: !!auth, db: !!db })
      setLoading(false)
    }
  }, [])

  return {
    app,
    auth,
    db,
    googleProvider,
    firebaseInitError,
    configError,
    loading,
  }
}

