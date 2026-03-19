import { REFERRAL_URL_QUERY_KEY } from '../constants/referral.js'

/**
 * Публичная ссылка «Пригласи друга».
 * Всегда указывает на корень приложения с ?ref=..., чтобы:
 * - приглашённый не получал 404 на вложенных path SPA;
 * - ref стабильно читался из search при первой загрузке (см. App.jsx).
 *
 * При необходимости задайте VITE_APP_PUBLIC_URL (канонический URL фронта, например https://skypath.fun),
 * если страница открыта с другого origin (предпросмотр, зеркало, Capacitor).
 */
export function getReferralInviteUrl(referralCode) {
  if (typeof window === 'undefined') {
    return ''
  }
  const code = String(referralCode ?? '').trim()
  if (!code) {
    return ''
  }

  let origin = ''
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_PUBLIC_URL) {
    origin = String(import.meta.env.VITE_APP_PUBLIC_URL).trim().replace(/\/+$/, '')
  }
  if (!origin) {
    origin = window.location.origin.replace(/\/+$/, '')
  }

  try {
    const url = new URL('/', `${origin}/`)
    url.searchParams.set(REFERRAL_URL_QUERY_KEY, code)
    return url.href
  } catch {
    const q = `${REFERRAL_URL_QUERY_KEY}=${encodeURIComponent(code)}`
    return `${origin}/?${q}`
  }
}
