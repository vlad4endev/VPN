import { useEffect, useRef } from 'react'

/**
 * Telegram Login Widget — для входа с обычного сайта (не Mini App).
 * Кнопка «Log in with Telegram» открывает OAuth в Telegram.
 * Требует VITE_TELEGRAM_BOT_USERNAME (например skypathvpn_bot).
 */
export default function TelegramLoginWidget({ onAuth, onError }) {
  const containerRef = useRef(null)
  const callbackRef = useRef(null)

  useEffect(() => {
    const botUsername = (import.meta.env?.VITE_TELEGRAM_BOT_USERNAME || '')
      .toString()
      .trim()
      .replace(/^@/, '')
    if (!botUsername) return

    const callbackName = 'onTelegramWidgetAuth'
    callbackRef.current = (user) => {
      if (!user || !user.id) {
        onError?.('Нет данных от Telegram')
        return
      }
      onAuth?.(user)
    }
    window[callbackName] = (user) => callbackRef.current?.(user)

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'medium')
    script.setAttribute('data-onauth', callbackName)
    script.setAttribute('data-request-access', 'write')
    // Редирект обратно на наш сайт после авторизации в Telegram (на мобильных часто идёт редирект, а не popup)
    try {
      const authUrl = typeof window !== 'undefined' && window.location.origin ? `${window.location.origin}${window.location.pathname || '/'}${window.location.hash || ''}` : ''
      if (authUrl) script.setAttribute('data-auth-url', authUrl)
    } catch (_) {}
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(script)
    }

    return () => {
      delete window[callbackName]
    }
  }, [onAuth, onError])

  return <div ref={containerRef} className="telegram-login-widget flex justify-center" />
}
