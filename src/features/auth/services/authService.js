import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Генерация уникального subId с проверкой в базе данных
 * @param {Firestore} db - Экземпляр Firestore
 * @param {string} appId - ID приложения
 * @param {number} maxAttempts - Максимальное количество попыток генерации
 * @returns {Promise<string>} Уникальный subId
 */
async function generateUniqueSubId(db, appIdValue = APP_ID, maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const subId = ThreeXUI.generateSubId()
    
    try {
      // Проверяем, существует ли уже такой subId в базе данных
      const usersCollection = collection(db, `artifacts/${appIdValue}/public/data/users_v4`)
      const q = query(usersCollection, where('subId', '==', subId))
      const querySnapshot = await getDocs(q)
      
      if (querySnapshot.empty) {
        // subId уникален
        logger.info('Auth', `Уникальный subId сгенерирован с попытки ${attempt}`, { subId, appId: appIdValue })
        return subId
      } else {
        // subId уже существует, генерируем новый
        logger.warn('Auth', `subId ${subId} уже существует, генерируем новый (попытка ${attempt}/${maxAttempts})`)
        if (attempt === maxAttempts) {
          // Если достигли максимума попыток, добавляем дополнительную случайность
          const timestamp = Date.now()
          const extraRandom = Math.floor(Math.random() * 10000000000)
          const uniqueSubId = `${timestamp}${extraRandom.toString().padStart(10, '0')}`
          logger.warn('Auth', `Достигнут максимум попыток, используем subId с дополнительной случайностью`, { uniqueSubId, attempts: maxAttempts })
          return uniqueSubId
        }
      }
    } catch (error) {
      logger.error('Auth', 'Ошибка при проверке уникальности subId', { subId, attempt, appId: appIdValue }, error)
      // В случае ошибки проверки, возвращаем сгенерированный subId
      // (лучше иметь потенциально дублирующийся subId, чем блокировать регистрацию)
      if (attempt === maxAttempts) {
        logger.warn('Auth', 'Возвращаем subId без проверки уникальности из-за ошибки проверки', { subId })
        return subId
      }
    }
  }
  
  // Если все попытки не удались, возвращаем последний сгенерированный
  logger.warn('Auth', 'Все попытки генерации уникального subId исчерпаны, возвращаем последний сгенерированный')
  return ThreeXUI.generateSubId()
}

/**
 * Сервис для работы с Firebase Authentication
 */
export const authService = {
  /**
   * Загрузка данных пользователя из Firestore по UID
   * @param {string} uid - UID пользователя
   * @param {Firestore|null} [dbOverride] - опциональный экземпляр Firestore (для onAuthStateChanged с getDb())
   * @returns {Promise<Object|null>} Данные пользователя или null
   * @throws {Error} при permission-denied (чтобы вызывающий код мог показать setError)
   */
  async loadUserData(uid, dbOverride = null) {
    const dbInstance = dbOverride ?? db
    if (!dbInstance || !uid) return null

    try {
      const userDoc = doc(dbInstance, `artifacts/${APP_ID}/public/data/users_v4`, uid)
      const userSnapshot = await getDoc(userDoc)
      
      if (userSnapshot.exists()) {
        let userData = { id: userSnapshot.id, ...userSnapshot.data() }
        
        // Миграция: если у существующего пользователя нет subId, генерируем его
        if (!userData.subId) {
          logger.info('Auth', 'У существующего пользователя нет subId, генерируем уникальный (loadUserData)', {
            uid,
            email: userData.email
          })
          try {
            const generatedSubId = await generateUniqueSubId(dbInstance, APP_ID)
            await updateDoc(userDoc, {
              subId: generatedSubId,
              updatedAt: new Date().toISOString(),
            })
            userData = { ...userData, subId: generatedSubId }
            logger.info('Auth', 'subId добавлен существующему пользователю (loadUserData)', { uid, subId: generatedSubId })
          } catch (subIdErr) {
            logger.error('Auth', 'Ошибка при генерации subId для существующего пользователя', { uid }, subIdErr)
            // Продолжаем без subId, но логируем ошибку
          }
        }
        
        logger.debug('Auth', 'Данные пользователя загружены (изолированы по uid)', { uid, email: userData.email, hasSubId: !!userData.subId })
        return userData
      }
      return null
    } catch (err) {
      // permission-denied пробрасываем, чтобы App мог показать setError
      if (err.code === 'permission-denied') {
        logger.error('Auth', 'Нет доступа к данным пользователя (permission-denied)', { uid }, err)
        throw err
      }
      // Обработка офлайн-режима Firebase
      if (err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document because the client is offline')) {
        logger.warn('Auth', 'Firebase офлайн, пытаемся загрузить из кеша localStorage', { uid })
        
        // Пытаемся загрузить из localStorage
        try {
          const savedUserStr = localStorage.getItem('vpn_current_user')
          if (savedUserStr) {
            const { parseUserSafely } = await import('../../../shared/utils/sanitizeUser.js')
            const savedUser = parseUserSafely(savedUserStr)
            if (savedUser && savedUser.id === uid) {
              logger.info('Auth', 'Данные пользователя загружены из localStorage (офлайн-режим)', { uid, email: savedUser.email })
              return savedUser
            }
          }
        } catch (localErr) {
          logger.warn('Auth', 'Ошибка загрузки из localStorage', { uid }, localErr)
        }
        
        return null
      }
      
      logger.error('Auth', 'Ошибка загрузки данных пользователя', { uid }, err)
      return null
    }
  },

  /**
   * Если документ в Firestore отсутствует — создаёт его через API, затем загружает данные.
   * Используется при onAuthStateChanged и signInWithEmail, когда loadUserData вернул null.
   * @param {import('firebase/auth').User} firebaseUser - Текущий пользователь Firebase Auth
   * @param {Firestore|null} [dbOverride] - опциональный экземпляр Firestore
   * @returns {Promise<Object|null>} Данные пользователя или null
   */
  async ensureFirestoreUserIfMissing(firebaseUser, dbOverride = null) {
    if (!firebaseUser?.uid) return null
    const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
      ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '')
      : (typeof window !== 'undefined' && window.location?.origin) || ''
    try {
      const idToken = await firebaseUser.getIdToken()
      const res = await fetch(`${baseUrl}/api/auth/ensure-firestore-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          return { id: data.user.id, ...data.user }
        }
        return await this.loadUserData(firebaseUser.uid, dbOverride)
      }
    } catch (err) {
      logger.warn('Auth', 'ensure-firestore-user не удался', { uid: firebaseUser.uid }, err)
    }
    return null
  },

  /**
   * Регистрация с email и паролем
   * @param {string} email - Email пользователя
   * @param {string} password - Пароль
   * @param {string} name - Имя пользователя
   * @param {string|null} [referredBy] - UID пригласителя (реферальная система)
   * @returns {Promise<Object>} Данные пользователя
   */
  async createUserWithEmail(email, password, name, referredBy = null) {
    if (!auth || !db) {
      throw new Error('Система авторизации недоступна. Проверьте конфигурацию Firebase.')
    }

    logger.info('Auth', 'Начало регистрации нового пользователя через Firebase Auth', { email })

    // 1. Создаем пользователя в Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const firebaseUser = userCredential.user

    // 2. Обновляем профиль с именем
    if (name.trim()) {
      await updateProfile(firebaseUser, {
        displayName: name.trim()
      })
    }

    // 3. Генерируем UUID для нового пользователя
    const generatedUUID = ThreeXUI.generateUUID()
    logger.info('Auth', 'UUID сгенерирован для нового пользователя', { email, uuid: generatedUUID })

    // 4. Генерируем уникальный subId для нового пользователя
    const generatedSubId = await generateUniqueSubId(db, APP_ID)
    logger.info('Auth', 'Уникальный subId сгенерирован для нового пользователя', { email, subId: generatedSubId })

    // 5. Создаем документ в Firestore с дополнительными данными
    const userDocRef = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, firebaseUser.uid)
    const uiLang = (typeof localStorage !== 'undefined' && localStorage.getItem('vpn-ui-lang')) || 'ru'
    const newUserData = {
      email: email,
      name: name.trim(),
      phone: '',
      role: 'user',
      plan: 'free',
      uuid: generatedUUID,
      subId: generatedSubId, // Уникальный subId для 3x-ui
      expiresAt: null,
      tariffName: '',
      tariffId: '',
      photoURL: firebaseUser.photoURL || null,
      language: uiLang,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(referredBy && referredBy.trim() ? { referredBy: referredBy.trim() } : {}),
    }
    
    await setDoc(userDocRef, newUserData)
    logger.info('Firestore', 'Данные пользователя созданы в Firestore', { uid: firebaseUser.uid, email })

    return {
      firebaseUser,
      userData: {
        id: firebaseUser.uid,
        ...newUserData,
      }
    }
  },

  /**
   * Вход с email и паролем
   * @param {string} email - Email пользователя
   * @param {string} password - Пароль
   * @returns {Promise<Object>} Данные пользователя
   */
  async signInWithEmail(email, password) {
    if (!auth || !db) {
      throw new Error('Система авторизации недоступна. Проверьте конфигурацию Firebase.')
    }

    logger.info('Auth', 'Попытка входа через Firebase Auth', { email })
    
    // Вход через Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    const firebaseUser = userCredential.user
    
    // Загружаем дополнительные данные пользователя из Firestore
    let userData = await this.loadUserData(firebaseUser.uid)

    if (!userData) {
      userData = await this.ensureFirestoreUserIfMissing(firebaseUser)
      if (!userData) {
        logger.warn('Auth', 'Данные пользователя не найдены в Firestore', { uid: firebaseUser.uid })
        await signOut(auth)
        throw new Error('Данные пользователя не найдены. Обратитесь к администратору.')
      }
    }

    // Объединяем данные Firebase Auth и Firestore
    const currentUserData = {
      ...userData,
      email: firebaseUser.email || userData.email,
      photoURL: firebaseUser.photoURL || userData.photoURL || null,
    }
    
    logger.info('Auth', 'Успешный вход', { email, uid: firebaseUser.uid, role: userData.role })
    
    return {
      firebaseUser,
      userData: currentUserData
    }
  },

  /**
   * Выход
   */
  async signOut() {
    if (!auth) {
      throw new Error('Система авторизации недоступна.')
    }
    
    await signOut(auth)
    logger.info('Auth', 'Выход выполнен')
  },

  /**
   * Ключ i18n для ошибки (app.*), если есть — для использования в UI
   * @param {Error} error - Ошибка Firebase
   * @returns {string|null} Ключ типа 'app.userNotFound' или null
   */
  getErrorMessageI18nKey(error) {
    if (!error?.code) return null
    const codeToKey = {
      'auth/user-not-found': 'app.userNotFound',
      'auth/wrong-password': 'app.wrongPassword',
      'auth/invalid-email': 'app.invalidEmailFormat',
      'auth/user-disabled': 'app.accountBlocked',
      'auth/too-many-requests': 'app.tooManyAttempts',
      'auth/network-request-failed': 'app.networkError',
      'auth/email-already-in-use': 'app.emailExists',
      'auth/operation-not-allowed': 'app.serviceUnavailable',
      'auth/weak-password': 'validation.passwordMinLength',
      'auth/popup-blocked': 'app.redirectSignInStateLost',
      'auth/account-exists-with-different-credential': 'app.emailExists',
      'auth/invalid-credential': 'app.telegramInvalidCredential',
      'permission-denied': 'app.noAccessDb',
      'unavailable': 'app.serviceUnavailable',
    }
    return codeToKey[error.code] ?? null
  },

  /**
   * Преобразование ошибки Firebase в понятное сообщение (fallback без i18n)
   * @param {Error} error - Ошибка Firebase
   * @returns {string|null} Сообщение об ошибке или null (отмена пользователем)
   */
  getErrorMessage(error) {
    if (!error) return null
    // Отменённые операции — не показываем ошибку
    if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
      return null
    }
    const errorMessages = {
      'auth/user-not-found': 'Пользователь с таким email не найден.',
      'auth/wrong-password': 'Неверный пароль.',
      'auth/invalid-email': 'Неверный формат email.',
      'auth/user-disabled': 'Аккаунт заблокирован. Обратитесь к администратору.',
      'auth/too-many-requests': 'Слишком много попыток входа. Попробуйте позже.',
      'auth/network-request-failed': 'Ошибка сети. Проверьте подключение к интернету.',
      'auth/email-already-in-use': 'Пользователь с таким email уже существует.',
      'auth/operation-not-allowed': 'Операция не разрешена. Обратитесь к администратору.',
      'auth/weak-password': 'Пароль слишком слабый. Используйте более сложный пароль.',
      'auth/popup-blocked': 'Всплывающее окно заблокировано. Разрешите всплывающие окна и попробуйте еще раз.',
      'auth/account-exists-with-different-credential': 'Аккаунт с таким email уже существует. Используйте другой способ входа.',
      'auth/invalid-credential': 'Не удалось войти. На сервере должен быть настроен тот же проект Firebase (projectId), что и у приложения.',
      'permission-denied': 'Нет доступа к базе данных. Обратитесь к администратору системы.',
      'unavailable': 'Сервис временно недоступен. Попробуйте позже.',
    }
    return errorMessages[error.code] || error.message || 'Произошла ошибка. Попробуйте еще раз.'
  },

  /**
   * Отправить письмо для сброса пароля на указанный email (Firebase Auth).
   * @param {string} email - Email пользователя
   * @returns {Promise<void>}
   */
  async sendPasswordResetEmail(email) {
    if (!auth || !email || typeof email !== 'string') {
      throw new Error('Email обязателен для сброса пароля')
    }
    const trimmed = email.trim()
    if (!trimmed) throw new Error('Email обязателен для сброса пароля')
    await firebaseSendPasswordResetEmail(auth, trimmed)
    logger.info('Auth', 'Письмо для сброса пароля отправлено', { email: trimmed })
  },
}

