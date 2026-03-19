/**
 * Базовый URL для API-запросов из браузера.
 *
 * Приоритет:
 * 1. В браузере на localhost/127.0.0.1: если задан VITE_API_BASE_URL на **другой** хост
 *    (например продакшен), возвращаем `window.location.origin`, чтобы запросы шли на Vite
 *    и проксировались на локальный backend (:3001). Иначе браузер блокирует CORS.
 *    Отключить это: `VITE_ALLOW_CROSS_ORIGIN_API=true` (осознанные запросы с dev на прод-API).
 * 2. VITE_API_BASE_URL — если задан и не перекрыт п.1.
 * 3. window.location.origin в браузере.
 * 4. '' (относительный путь) вне браузера без env.
 */

function isLocalDevHostname(hostname) {
  if (!hostname) return false
  const h = String(hostname).toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

function apiHostMatchesPageHost(apiHostname, pageHostname) {
  if (!apiHostname || !pageHostname) return false
  if (apiHostname === pageHostname) return true
  if (isLocalDevHostname(apiHostname) && isLocalDevHostname(pageHostname)) return true
  return false
}

export function getApiBaseUrl() {
  const fromEnv =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '')
      : null

  const allowCrossOrigin =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_ALLOW_CROSS_ORIGIN_API === 'true'

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '')
    const pageHost = window.location.hostname

    if (fromEnv && isLocalDevHostname(pageHost) && !allowCrossOrigin) {
      try {
        const normalized = fromEnv.startsWith('http://') || fromEnv.startsWith('https://')
          ? fromEnv
          : `https://${fromEnv}`
        const apiHost = new URL(normalized).hostname
        if (!apiHostMatchesPageHost(apiHost, pageHost)) {
          return origin
        }
      } catch {
        // если URL из .env битый — падаем ниже на fromEnv
      }
    }

    if (fromEnv) return fromEnv
    return origin
  }

  if (fromEnv) return fromEnv
  return ''
}
