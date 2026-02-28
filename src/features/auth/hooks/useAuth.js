import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthState } from './useAuthState.js'
import { authService } from '../services/authService.js'
import { validateEmail } from '../utils/validateEmail.js'
import { validatePassword } from '../utils/validatePassword.js'
import { validateName } from '../../../shared/utils/validateName.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Custom hook для управления аутентификацией
 * 
 * @param {Function} onSuccess - Callback при успешной авторизации
 * @param {Function} setCurrentUser - Функция для установки текущего пользователя
 * @param {Function} setView - Функция для установки view
 * @returns {Object} Объект с состоянием и методами авторизации
 */
export function useAuth({ onSuccess, setCurrentUser, setView }) {
  const { t } = useTranslation()
  const {
    authMode,
    loginData,
    error,
    success,
    setAuthMode,
    setLoginData,
    setError,
    setSuccess,
  } = useAuthState()

  const getAuthErrorMsg = useCallback((err) => {
    if (!err) return null
    const key = authService.getErrorMessageI18nKey(err)
    const translated = key ? t(key) : null
    return (translated && translated !== key ? translated : null) || authService.getErrorMessage(err)
  }, [t])

  // Обработчик логина
  const handleLogin = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Извлекаем значения напрямую из формы
    const formData = new FormData(e.target)
    const email = formData.get('email') || e.target.querySelector('input[type="email"]')?.value || ''
    const password = formData.get('password') || e.target.querySelector('input[type="password"]')?.value || ''
    
    // Валидация
    const emailError = validateEmail(email)
    if (emailError) {
      setError(emailError)
      return
    }
    
    const passwordError = validatePassword(password, false)
    if (passwordError) {
      setError(passwordError)
      return
    }

    try {
      const result = await authService.signInWithEmail(email, password)
      
      setCurrentUser(result.userData)
      setSuccess('Вход выполнен успешно')
      setLoginData({ email: '', password: '' })
      setView(result.userData.role === 'admin' ? 'admin' : 'dashboard')
      
      // Запрашиваем разрешение на уведомления для существующих пользователей
      try {
        const notificationService = (await import('../../../shared/services/notificationService.js')).default
        const notificationInstance = notificationService.getInstance()
        // Запрашиваем только если разрешения еще нет
        if (!notificationInstance.hasPermission()) {
          await notificationInstance.requestPermission()
          logger.info('Auth', 'Запрос разрешения на уведомления выполнен после входа')
        }
      } catch (notificationError) {
        logger.warn('Auth', 'Ошибка при запросе разрешения на уведомления', null, notificationError)
        // Не блокируем вход из-за ошибки уведомлений
      }
      
      if (onSuccess) {
        onSuccess(result.userData)
      }
    } catch (err) {
      logger.error('Auth', 'Ошибка входа', { email }, err)
      const msg = getAuthErrorMsg(err)
      if (msg) setError(msg)
    }
  }, [setError, setSuccess, setCurrentUser, setLoginData, setView, onSuccess, getAuthErrorMsg])

  // Обработчик регистрации
  const handleRegister = useCallback(async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Извлекаем значения напрямую из формы
    const formData = new FormData(e.target)
    const email = formData.get('email') || e.target.querySelector('input[type="email"]')?.value || ''
    const password = formData.get('password') || e.target.querySelector('input[type="password"]')?.value || ''
    const name = formData.get('name') || e.target.querySelector('input[name="name"]')?.value || ''
    
    // Валидация
    const emailError = validateEmail(email)
    if (emailError) {
      setError(emailError)
      return
    }
    
    const nameError = validateName(name)
    if (nameError) {
      setError(nameError)
      return
    }
    
    const passwordError = validatePassword(password, true)
    if (passwordError) {
      setError(passwordError)
      return
    }

    try {
      const result = await authService.createUserWithEmail(email, password, name)
      
      setCurrentUser(result.userData)
      setSuccess('Регистрация выполнена успешно! Теперь вы можете получить ключ в личном кабинете.')
      setLoginData({ email: '', password: '', name: '' })
      setView('dashboard')
      
      // Запрашиваем разрешение на уведомления после успешной регистрации
      try {
        const notificationService = (await import('../../../shared/services/notificationService.js')).default
        const notificationInstance = notificationService.getInstance()
        await notificationInstance.requestPermission()
        logger.info('Auth', 'Запрос разрешения на уведомления выполнен после регистрации')
      } catch (notificationError) {
        logger.warn('Auth', 'Ошибка при запросе разрешения на уведомления', null, notificationError)
        // Не блокируем регистрацию из-за ошибки уведомлений
      }
      
      if (onSuccess) {
        onSuccess(result.userData)
      }
    } catch (err) {
      logger.error('Auth', 'Ошибка регистрации', { email }, err)
      
      // Если пользователь был создан в Firebase Auth, но ошибка при создании в Firestore - удаляем из Auth
      if (err.firebaseUser) {
        try {
          await err.firebaseUser.delete()
        } catch (deleteError) {
          logger.error('Auth', 'Ошибка удаления пользователя из Firebase Auth после ошибки', { uid: err.firebaseUser.uid }, deleteError)
        }
      }
      
      const msg = getAuthErrorMsg(err)
      if (msg) setError(msg)
    }
  }, [setError, setSuccess, setCurrentUser, setLoginData, setView, onSuccess, getAuthErrorMsg])

  // Обработчик выхода
  const handleLogout = useCallback(async () => {
    try {
      await authService.signOut()
      setCurrentUser(null)
    } catch (err) {
      logger.error('Auth', 'Ошибка выхода', null, err)
      // Все равно очищаем пользователя
      setCurrentUser(null)
    }
  }, [setCurrentUser])

  // Обработчики изменения полей
  const handleEmailChange = useCallback((e) => {
    setLoginData({ email: e.target.value })
  }, [setLoginData])

  const handlePasswordChange = useCallback((e) => {
    setLoginData({ password: e.target.value })
  }, [setLoginData])

  const handleNameChange = useCallback((e) => {
    setLoginData({ name: e.target.value })
  }, [setLoginData])

  const handleAuthModeLogin = useCallback(() => {
    setAuthMode('login')
    setError('')
    setSuccess('')
  }, [setAuthMode, setError, setSuccess])

  const handleAuthModeRegister = useCallback(() => {
    setAuthMode('register')
    setError('')
    setSuccess('')
  }, [setAuthMode, setError, setSuccess])

  return {
    // State
    authMode,
    loginData,
    error,
    success,
    
    // Actions
    handleLogin,
    handleRegister,
    handleLogout,
    handleEmailChange,
    handlePasswordChange,
    handleNameChange,
    handleAuthModeLogin,
    handleAuthModeRegister,
    
    // Setters (для внешнего управления)
    setError,
    setSuccess,
  }
}

