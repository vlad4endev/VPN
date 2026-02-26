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

export default { isTmaPath, normalizePath }
