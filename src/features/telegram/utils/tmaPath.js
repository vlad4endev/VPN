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
 * @param {string} path - путь (например window.location.pathname или уже нормализованный)
 * @returns {boolean}
 */
export function isTmaPath(path) {
  const p = normalizePath(path)
  return p === '/t' || p === '/telegram' || p === 't' || (p.startsWith('/t/') && p.length > 3)
}

export default { isTmaPath, normalizePath }
