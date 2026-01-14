import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db, googleProvider } from '../../../lib/firebase/config.js'
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
   * @returns {Promise<Object|null>} Данные пользователя или null
   */
  async loadUserData(uid) {
    if (!db || !uid) return null
    
    try {
      const userDoc = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, uid)
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
            const generatedSubId = await generateUniqueSubId(db, APP_ID)
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
   * Регистрация с email и паролем
   * @param {string} email - Email пользователя
   * @param {string} password - Пароль
   * @param {string} name - Имя пользователя
   * @returns {Promise<Object>} Данные пользователя
   */
  async createUserWithEmail(email, password, name) {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    const userData = await this.loadUserData(firebaseUser.uid)
    
    if (!userData) {
      logger.warn('Auth', 'Данные пользователя не найдены в Firestore', { uid: firebaseUser.uid })
      await signOut(auth)
      throw new Error('Данные пользователя не найдены. Обратитесь к администратору.')
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
   * Вход через Google
   * @returns {Promise<Object>} Данные пользователя
   */
  async signInWithGoogle() {
    if (!auth || !db || !googleProvider) {
      throw new Error('Система авторизации недоступна. Проверьте конфигурацию Firebase.')
    }

    logger.info('Auth', 'Попытка входа через Google')
    
    // Вход через Google
    const result = await signInWithPopup(auth, googleProvider)
    const firebaseUser = result.user
    
    // Проверяем, есть ли данные пользователя в Firestore по uid
    let userData = await this.loadUserData(firebaseUser.uid)
    
    // Если данных нет - создаем нового пользователя
    if (!userData) {
      logger.info('Auth', 'Создание нового пользователя в Firestore после Google Sign-In', { 
        uid: firebaseUser.uid, 
        email: firebaseUser.email 
      })
      
      // Генерируем UUID для нового пользователя
      const generatedUUID = ThreeXUI.generateUUID()
      logger.info('Auth', 'UUID сгенерирован для нового пользователя (Google)', { email: firebaseUser.email, uuid: generatedUUID })
      
      // Генерируем уникальный subId для нового пользователя
      const generatedSubId = await generateUniqueSubId(db, APP_ID)
      logger.info('Auth', 'Уникальный subId сгенерирован для нового пользователя (Google)', { email: firebaseUser.email, subId: generatedSubId })
      
      const userDocRef = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, firebaseUser.uid)
      const newUserData = {
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || '',
        phone: '',
        role: 'user',
        plan: 'free',
        uuid: generatedUUID,
        subId: generatedSubId, // Уникальный subId для 3x-ui
        expiresAt: null,
        tariffName: '',
        tariffId: '',
        photoURL: firebaseUser.photoURL || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      
      await setDoc(userDocRef, newUserData)
      userData = { id: firebaseUser.uid, ...newUserData }
      logger.info('Firestore', 'Данные пользователя созданы в Firestore', { 
        uid: firebaseUser.uid, 
        email: firebaseUser.email
      })
    } else {
      // Обновляем photoURL если изменился
      if (firebaseUser.photoURL && userData.photoURL !== firebaseUser.photoURL) {
        const userDocRef = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, firebaseUser.uid)
        await updateDoc(userDocRef, {
          photoURL: firebaseUser.photoURL,
          updatedAt: new Date().toISOString(),
        })
        userData.photoURL = firebaseUser.photoURL
      }
    }

    // Объединяем данные Firebase Auth и Firestore
    const currentUserData = {
      ...userData,
      email: firebaseUser.email || userData.email,
      photoURL: firebaseUser.photoURL || userData.photoURL || null,
      name: firebaseUser.displayName || userData.name || '',
    }
    
    logger.info('Auth', 'Успешный вход через Google', { email: firebaseUser.email, uid: firebaseUser.uid, role: userData.role })
    
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
   * Преобразование ошибки Firebase в понятное сообщение
   * @param {Error} error - Ошибка Firebase
   * @returns {string} Сообщение об ошибке
   */
  getErrorMessage(error) {
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
      'auth/cancelled-popup-request': null, // Не показываем ошибку, пользователь отменил
      'auth/popup-closed-by-user': null, // Не показываем ошибку, пользователь закрыл
      'permission-denied': 'Нет доступа к базе данных. Проверьте правила безопасности Firestore.',
      'unavailable': 'Сервис временно недоступен. Попробуйте позже.',
    }
    
    // Специальная обработка для отмененных операций
    if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
      return null // Возвращаем null, чтобы не показывать ошибку
    }
    
    return errorMessages[error.code] || error.message || 'Произошла ошибка. Попробуйте еще раз.'
  },
}

