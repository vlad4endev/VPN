/**
 * Единая проверка пути Telegram Mini App (/t, /telegram, /t/...).
 * Используйте эту функцию везде, чтобы не дублировать условия и не путать с другими путями.
 */

/**
 * Нормализованный путь без завершающих слэшей (для сравнения).
 * @param {string} path - например window.location.pathname
 * @returns {string}
 */
export function normalizePath(path) {
  return (path || '').replace(/\/+$/, '')
}

/**
 * Является ли путь точкой входа Mini App.
 * Единый источник истины для набора путей — index.html (window.__IS_TMA_PATH__).
 * Здесь дублируем ту же логику для SPA; при текущем pathname используем __IS_TMA_PATH__ если задан.
 * @param {string} path - путь (например window.location.pathname или уже нормализованный)
 * @returns {boolean}
 */
export function isTmaPath(path) {
  const p = normalizePath(path)
  if (typeof window !== 'undefined' && window.__IS_TMA_PATH__ !== undefined) {
    const current = normalizePath(window.location.pathname)
    if (p === current) return !!window.__IS_TMA_PATH__
  }
  return p === '/t' || p === '/telegram' || p === 't' || (p.startsWith('/t/') && p.length > 3)
}

/**
 * Открыто ли приложение внутри Telegram WebView (Mini App), а не в обычном браузере.
 * Единый источник истины: устанавливается в index.html до загрузки React (applyTmaInit).
 * Используйте для: не пытаться делать Telegram auth в браузере; показывать «Open from Telegram» + ссылку на бота.
 * @returns {boolean}
 */
export function isOpenedInTelegramWebView() {
  if (typeof window === 'undefined') return false
  if (window.__TMA_OPENED_IN_TELEGRAM__ === true) return true
  if (window.__TMA_OPENED_IN_TELEGRAM__ === false) return false
  // Fallback если флаг не задан (тесты / SSR): iframe или наличие initData
  if (window.self !== window.top) return true
  const fromWebApp = window.Telegram?.WebApp?.initData
  const fromGlobal = window.__TELEGRAM_INIT_DATA
  if (typeof fromWebApp === 'string' && fromWebApp.trim()) return true
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) return true
  return false
}

/**
 * Есть ли признаки того, что страница открыта внутри Telegram (Mini App / WebView).
 * Совпадает с isOpenedInTelegramWebView (читает тот же флаг или ту же логику).
 * @returns {boolean}
 */
export function isLikelyInTelegramContext() {
  return isOpenedInTelegramWebView()
}

export default { isTmaPath, isOpenedInTelegramWebView, isLikelyInTelegramContext, normalizePath }
