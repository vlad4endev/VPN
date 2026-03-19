import { useEffect, useRef } from 'react'
import logger from '../../shared/utils/logger.js'

function tokenParamFromUrl() {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    return token ? String(token) : null
  } catch {
    return null
  }
}

function flowParamFromUrl() {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const flow = params.get('flow')
    return flow ? String(flow).trim().toLowerCase() : null
  } catch {
    return null
  }
}

export function useMagicLinkInit({
  currentUser,
  firebaseUser,
  authChecking,
  setView,
}) {
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    // Если auth ещё не проверен — не трогаем view (чтобы не спорить с bootstrap'ом auth'а)
    if (authChecking) return

    // Если пользователь уже авторизован — не показываем setup.
    if (currentUser || firebaseUser) return

    // Если это страница привязки Telegram — не перехватываем токен магик-линка
    if (typeof window !== 'undefined') {
      const path = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '')
      if (path === '/bind-telegram') return
    }

    const token = tokenParamFromUrl()
    if (!token) return

    const flow = flowParamFromUrl()
    startedRef.current = true
    if (flow === 'bind-telegram') {
      logger.info('MagicLink', 'Magic token detected -> bind-telegram view')
      setView?.('bind-telegram')
      return
    }

    if (flow === 'setup-account') {
      logger.info('MagicLink', 'Magic token detected -> setup-account view (explicit flow)')
      setView?.('setup-account')
      return
    }

    // Fallback для старых ссылок без flow:
    // раньше магические ссылки могли приходить только с token, поэтому
    // направляем в bind-telegram по умолчанию.
    logger.info('MagicLink', 'Magic token detected without flow -> bind-telegram fallback')
    setView?.('bind-telegram')
    return

  }, [currentUser, firebaseUser, authChecking, setView])
}

