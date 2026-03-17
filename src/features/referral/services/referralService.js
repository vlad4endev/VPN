import { supabase } from '../../../lib/supabase/client.js'
import { APP_ID } from '../../../shared/constants/app.js'
import { REFERRAL_CODE_LENGTH, REFERRAL_CODE_CHARS, REFERRAL_CODE_STORAGE_KEY, REFERRAL_CODE_LOCAL_KEY } from '../../../shared/constants/referral.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'
import logger from '../../../shared/utils/logger.js'

function generateCode() {
  let code = ''
  const chars = REFERRAL_CODE_CHARS
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function getOrCreateReferralCode(db, userId, maxAttempts = 10) {
  if (!supabase || !userId) {
    logger.warn('Referral', 'getOrCreateReferralCode: нет supabase или userId')
    return ''
  }

  const { data: user, error: userErr } = await supabase
    .from('vpn_users')
    .select('raw')
    .eq('uid', userId)
    .eq('app_id', APP_ID)
    .single()

  if (userErr || !user) {
    logger.warn('Referral', 'getOrCreateReferralCode: пользователь не найден', { userId })
    return ''
  }

  const existingCode = user.raw?.referralCode
  if (existingCode && String(existingCode).trim().length >= REFERRAL_CODE_LENGTH) {
    return String(existingCode).trim()
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = generateCode()
    const { data: existing } = await supabase
      .from('vpn_users')
      .select('uid')
      .eq('app_id', APP_ID)
      .contains('raw', { referralCode: code })
      .limit(1)

    if (!existing || existing.length === 0) {
      const updatedRaw = { ...(user.raw || {}), referralCode: code }
      await supabase
        .from('vpn_users')
        .update({ raw: updatedRaw, source_updated_at: new Date().toISOString() })
        .eq('uid', userId)
        .eq('app_id', APP_ID)

      logger.info('Referral', 'Создан реферальный код', { userId, code })
      return code
    }

    if (attempt === maxAttempts) {
      const fallback = code + String(Date.now()).slice(-4)
      const updatedRaw = { ...(user.raw || {}), referralCode: fallback }
      await supabase
        .from('vpn_users')
        .update({ raw: updatedRaw, source_updated_at: new Date().toISOString() })
        .eq('uid', userId)
        .eq('app_id', APP_ID)
      return fallback
    }
  }
  return ''
}

export async function resolveReferralCodeViaApi(code) {
  if (!code || typeof code !== 'string') return null
  const trimmed = String(code).trim()
  if (trimmed.length < 6) return null
  const baseUrl = getApiBaseUrl()
  try {
    const res = await fetch(`${baseUrl}/api/referral/resolve?code=${encodeURIComponent(trimmed)}`)
    if (!res.ok) {
      if (res.status === 404) return null
      logger.warn('Referral', 'resolveReferralCodeViaApi: ошибка API', { status: res.status })
      return null
    }
    const data = await res.json().catch(() => ({}))
    return data.inviterId && typeof data.inviterId === 'string' ? data.inviterId : null
  } catch (err) {
    logger.error('Referral', 'resolveReferralCodeViaApi: сеть или ошибка', { code: trimmed }, err)
    return null
  }
}

export async function resolveReferralCode(db, code) {
  if (!supabase || !code || typeof code !== 'string') return null
  const trimmed = String(code).trim()
  if (trimmed.length < REFERRAL_CODE_LENGTH) return null

  const { data } = await supabase
    .from('vpn_users')
    .select('uid')
    .eq('app_id', APP_ID)
    .contains('raw', { referralCode: trimmed })
    .limit(1)

  if (!data || data.length === 0) return null
  return data[0].uid
}

export function saveReferralCodePending(code) {
  if (typeof code !== 'string' || !code.trim()) return
  const trimmed = code.trim()
  try {
    sessionStorage.setItem(REFERRAL_CODE_STORAGE_KEY, trimmed)
    if (typeof localStorage !== 'undefined') localStorage.setItem(REFERRAL_CODE_LOCAL_KEY, trimmed)
  } catch (e) {
    logger.warn('Referral', 'saveReferralCodePending: storage недоступен', null, e)
  }
}

export function getReferralCodePending(clear = false) {
  try {
    let code = sessionStorage.getItem(REFERRAL_CODE_STORAGE_KEY)
    if (!code && typeof localStorage !== 'undefined') code = localStorage.getItem(REFERRAL_CODE_LOCAL_KEY)
    if (clear && code) {
      sessionStorage.removeItem(REFERRAL_CODE_STORAGE_KEY)
      if (typeof localStorage !== 'undefined') localStorage.removeItem(REFERRAL_CODE_LOCAL_KEY)
    }
    return code && code.trim() ? code.trim() : null
  } catch (e) {
    return null
  }
}

const PROCESS_BONUS_MAX_RETRIES = 3
const PROCESS_BONUS_RETRY_DELAY_MS = 800

export async function processReferralBonus(idToken, referredUserId, inviterId) {
  if (!idToken || !referredUserId || !inviterId) {
    return { success: false, error: 'Не указаны idToken, referredUserId или inviterId' }
  }
  const baseUrl = getApiBaseUrl()
  const url = `${baseUrl}/api/referral/process`
  let lastError = null
  for (let attempt = 1; attempt <= PROCESS_BONUS_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ referredUserId, inviterId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) return { success: true }
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { success: false, error: data.error || res.statusText }
      }
      lastError = data.error || res.statusText
    } catch (err) {
      lastError = err.message
    }
    if (attempt < PROCESS_BONUS_MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, PROCESS_BONUS_RETRY_DELAY_MS * Math.pow(2, attempt - 1)))
    }
  }
  return { success: false, error: lastError || 'Ошибка сервера' }
}
