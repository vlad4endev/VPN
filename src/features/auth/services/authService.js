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
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'
import ThreeXUI from '../../vpn/services/ThreeXUI.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Генерация уникального subId с проверкой в базе данных
 */
async function generateUniqueSubId(db, appIdValue = APP_ID, maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const subId = ThreeXUI.generateSubId()

    try {
      const usersCollection = collection(db, `artifacts/${appIdValue}/public/data/users_v4`)
      const q = query(usersCollection, where('subId', '==', subId))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        logger.info('Auth', `Уникальный subId сгенерирован с попытки ${attempt}`, { subId, appId: appIdValue })
        return subId
      } else {
        logger.warn('Auth', `subId ${subId} уже существует, генерируем новый (попытка ${attempt}/${maxAttempts})`)
        if (attempt === maxAttempts) {
          const timestamp = Date.now()
          const extraRandom = Math.floor(Math.random() * 10000000000)
          return `${timestamp}${extraRandom.toString().padStart(10, '0')}`
        }
      }
    } catch (error) {
      logger.error('Auth', 'Ошибка при проверке уникальности subId', { subId, attempt, appId: appIdValue }, error)
      if (attempt === maxAttempts) return subId
    }
  }
  return ThreeXUI.generateSubId()
}

export const authService = {
  async loadUserData(uid, dbOverride = null) {
    const dbInstance = dbOverride ?? db
    if (!dbInstance || !uid) return null

    try {
      const userDoc = doc(dbInstance, `artifacts/${APP_ID}/public/data/users_v4`, uid)
      const userSnapshot = await getDoc(userDoc)

      if (userSnapshot.exists()) {
        let userData = { id: userSnapshot.id, ...userSnapshot.data() }

        if (!userData.subId) {
          logger.info('Auth', 'У существующего пользователя нет subId, генерируем уникальный (loadUserData)', { uid, email: userData.email })
          try {
            const generatedSubId = await generateUniqueSubId(dbInstance, APP_ID)
            await updateDoc(userDoc, { subId: generatedSubId, updatedAt: new Date().toISOString() })
            userData = { ...userData, subId: generatedSubId }
          } catch (subIdErr) {
            logger.error('Auth', 'Ошибка при генерации subId для существующего пользователя', { uid }, subIdErr)
          }
        }

        return userData
      }
      return null
    } catch (err) {
      if (err.code === 'permission-denied') {
        logger.error('Auth', 'Нет доступа к данным пользователя (permission-denied)', { uid }, err)
        throw err
      }
      if (err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document because the client is offline')) {
        try {
          const savedUserStr = localStorage.getItem('vpn_current_user')
          if (savedUserStr) {
            const { parseUserSafely } = await import('../../../shared/utils/sanitizeUser.js')
            const savedUser = parseUserSafely(savedUserStr)
            if (savedUser && savedUser.id === uid) return savedUser
          }
        } catch (localErr) {}
        return null
      }
      logger.error('Auth', 'Ошибка загрузки данных пользователя', { uid }, err)
      return null
    }
  },

  async ensureFirestoreUserIfMissing(firebaseUser, dbOverride = null) {
    if (!firebaseUser?.uid) return null
    const baseUrl = getApiBaseUrl()
    try {
      const idToken = await firebaseUser.getIdToken()
      const res = await fetch(`${baseUrl}/api/auth/ensure-firestore-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.user) return { id: data.user.id, ...data.user }
        return await this.loadUserData(firebaseUser.uid, dbOverride)
      }
    } catch (err) {
      logger.warn('Auth', 'ensure-firestore-user не удался', { uid: firebaseUser.uid }, err)
    }
    return null
  },

  async createUserWithEmail(email, password, name, referredBy = null) {
    if (!auth || !db) throw new Error('Система авторизации недоступна. Проверьте конфигурацию Firebase.')

    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const firebaseUser = userCredential.user

    if (name.trim()) {
      await updateProfile(firebaseUser, { displayName: name.trim() })
    }

    const generatedUUID = ThreeXUI.generateUUID()
    const generatedSubId = await generateUniqueSubId(db, APP_ID)

    const userDocRef = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, firebaseUser.uid)
    const uiLang = (typeof localStorage !== 'undefined' && localStorage.getItem('vpn-ui-lang')) || 'ru'
    const newUserData = {
      email,
      name: name.trim(),
      phone: '',
      role: 'user',
      plan: 'free',
      uuid: generatedUUID,
      subId: generatedSubId,
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

    return {
      firebaseUser,
      userData: { id: firebaseUser.uid, ...newUserData },
    }
  },

  async signInWithEmail(email, password) {
    if (!auth || !db) throw new Error('Система авторизации недоступна. Проверьте конфигурацию Firebase.')

    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    const firebaseUser = userCredential.user

    let userData = await this.loadUserData(firebaseUser.uid)
    if (!userData) {
      userData = await this.ensureFirestoreUserIfMissing(firebaseUser)
      if (!userData) {
        await signOut(auth)
        throw new Error('Данные пользователя не найдены. Обратитесь к администратору.')
      }
    }

    return {
      firebaseUser,
      userData: {
        ...userData,
        email: firebaseUser.email || userData.email,
        photoURL: firebaseUser.photoURL || userData.photoURL || null,
      },
    }
  },

  async signOut() {
    if (!auth) throw new Error('Система авторизации недоступна.')
    await signOut(auth)
  },

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

  getErrorMessage(error) {
    if (!error) return null
    if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') return null
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

  async sendPasswordResetEmail(email) {
    if (!auth || !email || typeof email !== 'string') throw new Error('Email обязателен для сброса пароля')
    const trimmed = email.trim()
    if (!trimmed) throw new Error('Email обязателен для сброса пароля')
    await firebaseSendPasswordResetEmail(auth, trimmed)
  },
}
