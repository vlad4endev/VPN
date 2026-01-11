import { useState, useCallback } from 'react'

/**
 * Custom hook для управления состоянием авторизации
 * Разделяет состояние и логику для лучшей тестируемости
 */
export function useAuthState() {
  const [authMode, setAuthModeState] = useState('login') // 'login' | 'register'
  const [loginData, setLoginDataState] = useState({ 
    email: '', 
    password: '', 
    name: '' 
  })
  const [googleSignInLoading, setGoogleSignInLoadingState] = useState(false)
  const [error, setErrorState] = useState('')
  const [success, setSuccessState] = useState('')

  const setAuthMode = useCallback((mode) => {
    setAuthModeState(mode)
  }, [])

  const setLoginData = useCallback((data) => {
    if (typeof data === 'function') {
      setLoginDataState(data)
    } else {
      setLoginDataState(prev => ({ ...prev, ...data }))
    }
  }, [])

  const setGoogleSignInLoading = useCallback((loading) => {
    setGoogleSignInLoadingState(loading)
  }, [])

  const setError = useCallback((error) => {
    setErrorState(error)
  }, [])

  const setSuccess = useCallback((success) => {
    setSuccessState(success)
  }, [])

  return {
    // State
    authMode,
    loginData,
    googleSignInLoading,
    error,
    success,
    
    // Setters
    setAuthMode,
    setLoginData,
    setGoogleSignInLoading,
    setError,
    setSuccess,
  }
}

