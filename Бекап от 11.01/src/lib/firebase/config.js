import { initializeApp, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'
import { validateEnvVars, getEnvErrorMessage } from '../../shared/utils/envValidation.js'
import logger from '../../shared/utils/logger.js'

// Валидация переменных окружения при старте
logger.info('Firebase', '🔍 Проверка конфигурации переменных окружения...')
const envValidation = validateEnvVars()
if (!envValidation.isValid) {
  const errorMsg = getEnvErrorMessage(envValidation)
  console.error('Ошибка конфигурации:\n', errorMsg)
  logger.error('Firebase', '❌ Ошибка конфигурации переменных окружения', { validation: envValidation })
} else {
  logger.info('Firebase', '✅ Конфигурация переменных окружения проверена успешно')
}

// Конфигурация Firebase (будет загружаться из переменных окружения)
// ВАЖНО: Vite загружает переменные окружения только при старте сервера!
// Если вы изменили .env - обязательно перезапустите dev сервер!

// Диагностика: проверяем, загружены ли переменные окружения
const envVars = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Логируем загруженные переменные (для диагностики)
console.log('🔍 Диагностика переменных окружения Firebase:')
console.log('  VITE_FIREBASE_API_KEY:', envVars.apiKey ? `${envVars.apiKey.substring(0, 10)}...` : '❌ НЕ ЗАГРУЖЕНО')
console.log('  VITE_FIREBASE_AUTH_DOMAIN:', envVars.authDomain || '❌ НЕ ЗАГРУЖЕНО')
console.log('  VITE_FIREBASE_PROJECT_ID:', envVars.projectId || '❌ НЕ ЗАГРУЖЕНО')
console.log('  VITE_FIREBASE_STORAGE_BUCKET:', envVars.storageBucket || '❌ НЕ ЗАГРУЖЕНО')
console.log('  VITE_FIREBASE_MESSAGING_SENDER_ID:', envVars.messagingSenderId || '❌ НЕ ЗАГРУЖЕНО')
console.log('  VITE_FIREBASE_APP_ID:', envVars.appId || '❌ НЕ ЗАГРУЖЕНО')

const firebaseConfig = {
  apiKey: envVars.apiKey,
  authDomain: envVars.authDomain,
  projectId: envVars.projectId,
  storageBucket: envVars.storageBucket,
  messagingSenderId: envVars.messagingSenderId,
  appId: envVars.appId,
}

// Проверка конфигурации Firebase перед инициализацией
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  const missing = []
  if (!firebaseConfig.apiKey) missing.push('VITE_FIREBASE_API_KEY')
  if (!firebaseConfig.authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN')
  if (!firebaseConfig.projectId) missing.push('VITE_FIREBASE_PROJECT_ID')
  if (!firebaseConfig.storageBucket) missing.push('VITE_FIREBASE_STORAGE_BUCKET')
  if (!firebaseConfig.messagingSenderId) missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID')
  if (!firebaseConfig.appId) missing.push('VITE_FIREBASE_APP_ID')
  
  console.error('❌ Firebase конфигурация неполная!')
  console.error('Отсутствуют переменные:', missing.join(', '))
  console.error('')
  console.error('🔧 РЕШЕНИЕ:')
  console.error('1. Убедитесь, что файл .env существует в корне проекта')
  console.error('2. Проверьте, что все переменные заполнены (не содержат "your_" или "here")')
  console.error('3. ОСТАНОВИТЕ dev сервер (Ctrl+C)')
  console.error('4. ЗАПУСТИТЕ dev сервер ЗАНОВО: npm run dev')
  console.error('5. Обновите страницу в браузере')
  console.error('')
  console.error('⚠️  ВАЖНО: Vite загружает переменные окружения ТОЛЬКО при старте сервера!')
  console.error('   Если вы изменили .env без перезапуска - переменные НЕ загрузятся!')
  
  logger.error('Firebase', 'Конфигурация Firebase неполная', { 
    missing,
    config: { 
      ...firebaseConfig, 
      apiKey: firebaseConfig.apiKey ? '***' : null 
    } 
  })
}

// Инициализация Firebase
let app = null
let auth = null
let db = null
let googleProvider = null
let firebaseInitError = null

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    logger.info('Firebase', '🔥 Инициализация Firebase...')
    
    // Проверяем, не была ли уже инициализирована Firebase (защита от hot reload)
    try {
      app = initializeApp(firebaseConfig)
    } catch (initError) {
      // Если приложение уже инициализировано, получаем существующий экземпляр
      if (initError.code === 'app/duplicate-app') {
        app = getApp()
        logger.debug('Firebase', 'Используется существующий экземпляр Firebase (hot reload)', null)
      } else {
        throw initError
      }
    }
    
    auth = getAuth(app)
    db = getFirestore(app)
    
    // Включаем офлайн-персистентность для кеширования данных
    // ВАЖНО: Ошибка 'failed-precondition' - это нормальная ситуация при hot reload или нескольких вкладках
    // Не логируем её как ошибку, так как persistence уже работает
    try {
      enableIndexedDbPersistence(db).catch((err) => {
        // Игнорируем ошибку 'failed-precondition' - это нормально при hot reload или нескольких вкладках
        if (err.code === 'failed-precondition') {
          // Persistence уже включен - это нормально, не логируем как ошибку
          // Просто молча игнорируем
          return
        } else if (err.code === 'unimplemented') {
          logger.warn('Firebase', 'Офлайн-персистентность недоступна: браузер не поддерживает', null)
        } else {
          // Другие ошибки логируем на уровне debug, не error
          logger.debug('Firebase', 'Ошибка включения офлайн-персистентности', null, err)
        }
      })
    } catch (persistenceError) {
      // Игнорируем синхронные ошибки persistence (не должны возникать, но на всякий случай)
      if (persistenceError.code === 'failed-precondition') {
        // Молча игнорируем - просто продолжаем выполнение
      } else {
        // Другие синхронные ошибки логируем на уровне debug
        logger.debug('Firebase', 'Синхронная ошибка при включении persistence', null, persistenceError)
      }
    }
    
    googleProvider = new GoogleAuthProvider()
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    })
    logger.info('Firebase', '✅ Firebase успешно инициализирован', {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
    })
  } else {
    const missing = []
    if (!firebaseConfig.apiKey) missing.push('apiKey')
    if (!firebaseConfig.projectId) missing.push('projectId')
    firebaseInitError = `Отсутствуют обязательные поля конфигурации: ${missing.join(', ')}`
    logger.warn('Firebase', '⚠️ Firebase не может быть инициализирован', {
      missing,
      hasApiKey: !!firebaseConfig.apiKey,
      hasProjectId: !!firebaseConfig.projectId,
    })
  }
} catch (error) {
  // Игнорируем ошибки persistence - они обрабатываются отдельно
  if (error.code === 'failed-precondition' && error.message?.includes('persistence')) {
    // Это ошибка persistence при hot reload - не критично, просто игнорируем
    logger.debug('Firebase', 'Ошибка persistence при инициализации (hot reload)', null)
    // Не устанавливаем firebaseInitError, так как это не критичная ошибка
  } else {
    // Другие ошибки логируем как критические
    firebaseInitError = error.message || 'Неизвестная ошибка'
    logger.error('Firebase', '❌ Ошибка инициализации Firebase', null, error)
    console.error('Детали ошибки:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    })
  }
}

// Экспортируем инициализированные объекты
export { app, auth, db, googleProvider, firebaseInitError, envValidation }
