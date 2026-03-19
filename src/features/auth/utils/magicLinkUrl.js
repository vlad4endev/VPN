/**
 * Одноразовая ссылка: ?token=... и опционально &flow=setup-account|bind-telegram
 * Используется для синхронного выбора view (до useEffect), чтобы не показывать Welcome поверх магик-линка.
 */

export function getMagicLinkViewFromSearch(search) {
  if (typeof search !== 'string') return null
  try {
    const s = search.trim()
    const q = s.startsWith('?') ? s : `?${s}`
    const params = new URLSearchParams(q)
    const token = params.get('token')
    if (!token || !String(token).trim()) return null
    const flow = (params.get('flow') || '').trim().toLowerCase()
    if (flow === 'setup-account') return 'setup-account'
    return 'bind-telegram'
  } catch {
    return null
  }
}

/**
 * Query (?token=) или фрагмент (#token= / #...?token=)
 */
export function getMagicLinkViewFromWindow() {
  if (typeof window === 'undefined') return null
  const fromSearch = getMagicLinkViewFromSearch(window.location.search || '')
  if (fromSearch) return fromSearch
  try {
    const raw = window.location.hash || ''
    if (!raw) return null
    const withoutHash = raw.replace(/^#/, '')
    const queryPart = withoutHash.includes('?') ? withoutHash.split('?').slice(1).join('?') : withoutHash
    if (!queryPart || !queryPart.includes('token=')) return null
    return getMagicLinkViewFromSearch(`?${queryPart}`)
  } catch {
    return null
  }
}

/** Сырой token из ?token= или из hash */
export function getMagicTokenFromWindow() {
  if (typeof window === 'undefined') return null
  try {
    const fromQs = new URLSearchParams(window.location.search || '').get('token')
    if (fromQs && String(fromQs).trim()) return String(fromQs).trim()
    const raw = window.location.hash || ''
    if (!raw) return null
    const withoutHash = raw.replace(/^#/, '')
    const queryPart = withoutHash.includes('?') ? withoutHash.split('?').slice(1).join('?') : withoutHash
    if (!queryPart || !queryPart.includes('token=')) return null
    const q = queryPart.startsWith('?') ? queryPart.slice(1) : queryPart
    const t = new URLSearchParams(q).get('token')
    return t && String(t).trim() ? String(t).trim() : null
  } catch {
    return null
  }
}

/** Поддержка деплоя в подпапку: .../bind-telegram */
export function pathnameIsBindTelegram(pathname) {
  const p = (pathname || '').toLowerCase().replace(/\/+$/, '')
  return p === '/bind-telegram' || p.endsWith('/bind-telegram')
}
