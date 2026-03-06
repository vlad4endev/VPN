/**
 * Безопасное формирование URL с корректным URL-encoding параметров.
 */

/**
 * Добавляет query-параметр к baseUrl с корректным encodeURIComponent.
 * @param {string} baseUrl - Базовый URL (без trailing slash)
 * @param {string} paramName - Имя параметра
 * @param {string} paramValue - Значение (будет закодировано)
 * @returns {string}
 */
export function appendQueryParam(baseUrl, paramName, paramValue) {
  if (!baseUrl || !paramName) return baseUrl
  const sep = baseUrl.includes('?') ? '&' : '?'
  const encoded = encodeURIComponent(String(paramValue))
  return `${baseUrl}${sep}${encodeURIComponent(paramName)}=${encoded}`
}

/**
 * Формирует returnUrl/failedUrl с параметром orderId.
 * @param {string} baseUrl - Базовый URL приложения (без trailing slash)
 * @param {string} path - Путь (например /payment/success)
 * @param {string} orderId - ID заказа
 * @returns {string}
 */
export function buildRedirectUrl(baseUrl, path, orderId) {
  if (!baseUrl) return null
  const cleanBase = String(baseUrl).trim().replace(/\/+$/, '')
  if (!cleanBase) return null
  const pathClean = path.startsWith('/') ? path : `/${path}`
  const fullPath = `${cleanBase}${pathClean}`
  return appendQueryParam(fullPath, 'orderId', orderId)
}
