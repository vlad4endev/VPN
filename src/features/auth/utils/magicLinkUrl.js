/**
 * Одноразовая ссылка: ?token=... и опционально &flow=setup-account|bind-telegram
 * Используется для синхронного выбора view (до useEffect), чтобы не показывать Welcome поверх магик-линка.
 */

export function getMagicLinkViewFromSearch(search) {
  if (typeof search !== 'string') return null
  try {
    const params = new URLSearchParams(search)
    const token = params.get('token')
    if (!token || !String(token).trim()) return null
    const flow = (params.get('flow') || '').trim().toLowerCase()
    if (flow === 'setup-account') return 'setup-account'
    return 'bind-telegram'
  } catch {
    return null
  }
}

/** Поддержка деплоя в подпапку: .../bind-telegram */
export function pathnameIsBindTelegram(pathname) {
  const p = (pathname || '').toLowerCase().replace(/\/+$/, '')
  return p === '/bind-telegram' || p.endsWith('/bind-telegram')
}
