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
 * Есть ли признаки того, что страница открыта внутри Telegram (Mini App / WebView),
 * а не в обычном браузере по прямой ссылке. Используется, чтобы не запускать авто-вход TMA
 * и не крутить «ожидание initData», когда пользователь зашёл на /t из Chrome/Safari.
 * @returns {boolean}
 */
export function isLikelyInTelegramContext() {
  if (typeof window === 'undefined') return false
  // Страница в iframe — типично для Mini App внутри клиента Telegram
  if (window.self !== window.top) return true
  // Переход с t.me или telegram.org — открыли из бота/клиента
  const ref = (typeof document !== 'undefined' && document.referrer) ? document.referrer : ''
  if (/^https?:\/\/(.*\.)?(t\.me|telegram\.org)(\?|\/|$)/i.test(ref)) return true
  // initData уже есть — точно из Telegram
  const fromWebApp = window.Telegram?.WebApp?.initData
  const fromGlobal = window.__TELEGRAM_INIT_DATA
  if (typeof fromWebApp === 'string' && fromWebApp.trim()) return true
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) return true
  return false
}

export default { isTmaPath, isLikelyInTelegramContext, normalizePath }
