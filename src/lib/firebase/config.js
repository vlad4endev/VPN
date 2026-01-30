import { initializeApp, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

/**
 * Возвращает актуальный экземпляр Firestore (из текущего app).
 * Используйте в колбэках (onAuthStateChanged и т.д.), чтобы избежать FirebaseError
 * "Expected first argument to doc() to be a CollectionReference..." при дублировании модуля или порядке загрузки.
 */
function getDb() {
  try {
    const appInstance = getApp()
    return getFirestore(appInstance)
  } catch {
    return db
  }
}
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { validateEnvVars, getEnvErrorMessage } from '../../shared/utils/envValidation.js'
import logger from '../../shared/utils/logger.js'

// Валидация переменных окружения при старте (логируем один раз)
logger.debug('Firebase', 'Проверка конфигурации переменных окружения...')
const envValidation = validateEnvVars()
if (!envValidation.isValid) {
  const errorMsg = getEnvErrorMessage(envValidation)
  console.error('Ошибка конфигурации:\n', errorMsg)
  logger.error('Firebase', '❌ Ошибка конфигурации переменных окружения', { validation: envValidation })
} else {
  logger.debug('Firebase', 'Конфигурация переменных окружения проверена успешно')
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
logger.debug('Firebase', 'Диагностика переменных окружения', {
  hasApiKey: !!envVars.apiKey,
  hasAuthDomain: !!envVars.authDomain,
  hasProjectId: !!envVars.projectId,
  hasStorageBucket: !!envVars.storageBucket,
  hasMessagingSenderId: !!envVars.messagingSenderId,
  hasAppId: !!envVars.appId,
})

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
let appCheck = null
let firebaseInitError = null

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    logger.debug('Firebase', 'Инициализация Firebase...')
    
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
    // Явно включаем сохранение сессии в браузере (один аккаунт на браузер, сессия переживает перезагрузку)
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      logger.warn('Firebase', 'Не удалось установить persistence (сессия может не сохраняться)', null, err)
    })
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      })
    } catch (e) {
      if (e.code === 'failed-precondition') {
        db = getFirestore(app)
      } else {
        throw e
      }
    }
    
    // Инициализация Firebase App Check для защиты от ботов и злоупотреблений
    // ВАЖНО: App Check работает только в production или с настроенным reCAPTCHA
    try {
      const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
      
      if (recaptchaSiteKey && recaptchaSiteKey !== 'your_recaptcha_site_key_here') {
        // Используем reCAPTCHA v3 для App Check
        const recaptchaProvider = new ReCaptchaV3Provider(recaptchaSiteKey)
        appCheck = initializeAppCheck(app, {
          provider: recaptchaProvider,
          isTokenAutoRefreshEnabled: true
        })
        logger.info('Firebase', '✅ Firebase App Check инициализирован (reCAPTCHA v3)', {
          hasSiteKey: !!recaptchaSiteKey
        })
      } else {
        // В development режиме используем debug token (только для разработки)
        if (import.meta.env.DEV) {
          // В development можно использовать debug token
          logger.debug('Firebase', 'App Check не настроен (добавьте VITE_RECAPTCHA_SITE_KEY для production)', null)
        } else {
          logger.warn('Firebase', '⚠️ App Check не настроен в production - рекомендуется настроить reCAPTCHA', {
            note: 'Добавьте VITE_RECAPTCHA_SITE_KEY в .env'
          })
        }
      }
    } catch (appCheckError) {
      // App Check не критичен для работы приложения, логируем предупреждение
      logger.warn('Firebase', '⚠️ Ошибка инициализации App Check', null, appCheckError)
      // Не устанавливаем firebaseInitError, так как это не критично
    }
    
    googleProvider = new GoogleAuthProvider()
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    })
    logger.info('Firebase', 'Firebase инициализирован', {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
    })

    // Не вызываем deleteApp(app) на beforeunload: после уничтожения приложения
    // ссылка db остаётся в модуле, но экземпляр недействителен — вызовы doc(db, ...)
    // и collection(db, ...) приводят к FirebaseError "Expected first argument to doc()...".
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
export { app, auth, db, getDb, googleProvider, appCheck, firebaseInitError, envValidation }
