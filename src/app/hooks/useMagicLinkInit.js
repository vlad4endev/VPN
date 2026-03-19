import { useEffect, useRef } from 'react'
import logger from '../../shared/utils/logger.js'
import { getMagicLinkViewFromWindow, pathnameIsBindTelegram } from '../../features/auth/utils/magicLinkUrl.js'

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
      const path = window.location.pathname || ''
      if (pathnameIsBindTelegram(path)) return
    }

    const token = tokenParamFromUrl()
    if (!token) return

    const target = typeof window !== 'undefined' ? getMagicLinkViewFromWindow() : null
    startedRef.current = true
    const resolved = target || 'bind-telegram'
    logger.info('MagicLink', `Magic token detected -> ${resolved} view`, { explicit: !!target })
    setView?.(resolved)
    return

  }, [currentUser, firebaseUser, authChecking, setView])
}

