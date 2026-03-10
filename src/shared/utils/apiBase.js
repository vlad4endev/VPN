/**
 * Базовый URL для API-запросов.
 * Приоритет:
 * 1. VITE_API_BASE_URL из .env (если задан)
 * 2. window.location.origin (в браузере — тот же домен, proxy работает)
 * 3. '' (относительный путь)
 *
 * Таким образом, без настройки .env данные берутся из интерфейса (текущий origin).
 */
export function getApiBaseUrl() {
  const fromEnv =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '')
      : null
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }
  return ''
}
