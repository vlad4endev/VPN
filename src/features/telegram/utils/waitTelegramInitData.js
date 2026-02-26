/**
 * Ожидание появления initData от Telegram WebApp с таймаутом.
 * Возвращаем только строку, в которой есть параметр hash= (иначе сервер вернёт no_hash).
 * @param {number} timeoutMs - таймаут в миллисекундах (например 7000)
 * @returns {Promise<string>} - initData строка при успехе
 * @throws {Error} - при таймауте с message 'initData_timeout'
 */
const HAS_HASH = /hash=/

/** Извлечь initData из location.hash (#tgWebAppData=<url-encoded query>). */
function getInitDataFromHash() {
  if (typeof window === 'undefined' || !window.location.hash) return ''
  const hash = window.location.hash
  const idx = hash.indexOf('tgWebAppData=')
  if (idx === -1) return ''
  const start = idx + 13
  let end = hash.indexOf('&tgWebAppVersion')
  if (end === -1) end = hash.indexOf('&eventId')
  if (end === -1) end = hash.length
  const encoded = hash.substring(start, end)
  if (!encoded) return ''
  try {
    const raw = decodeURIComponent(encoded)
    return raw && HAS_HASH.test(raw) ? raw : ''
  } catch (_) {
    return HAS_HASH.test(encoded) ? encoded : ''
  }
}

export function waitTelegramInitData(timeoutMs = 7000) {
  const intervalMs = 80
  const getData = () => {
    if (typeof window === 'undefined') return ''
    const fromWebApp = window.Telegram?.WebApp?.initData
    const fromGlobal = window.__TELEGRAM_INIT_DATA
    let raw = (typeof fromWebApp === 'string' && fromWebApp.trim()) ? fromWebApp : (typeof fromGlobal === 'string' ? fromGlobal : '')
    if (!raw && typeof sessionStorage !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('tg_init_data')
        if (typeof stored === 'string' && stored.trim()) raw = stored
      } catch (_) {}
    }
    if (!raw) raw = getInitDataFromHash()
    raw = String(raw || '').trim()
    return raw && HAS_HASH.test(raw) ? raw : ''
  }

  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const data = getData()
      if (data) {
        resolve(data)
        return
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('initData_timeout'))
        return
      }
      setTimeout(check, intervalMs)
    }
    check()
  })
}

export default waitTelegramInitData
