import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore'

import { supabase } from '../../../lib/supabase/client.js'
import { APP_ID } from '../../../shared/constants/app.js'
import {
  REFERRAL_CODE_LENGTH,
  REFERRAL_CODE_CHARS,
  REFERRAL_CODE_STORAGE_KEY,
  REFERRAL_CODE_LOCAL_KEY,
} from '../../../shared/constants/referral.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'
import logger from '../../../shared/utils/logger.js'

const USERS_PATH = `artifacts/${APP_ID}/public/data/users_v4`

/** Минимальная длина кода, совпадающая с /api/referral/resolve */
const MIN_REF_CODE_LEN = 6

function generateCode() {
  let code = ''
  const chars = REFERRAL_CODE_CHARS
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function userDocRef(db, uid) {
  return doc(db, USERS_PATH, uid)
}

/**
 * Поле referralCode в Firestore нужно для GET /api/referral/resolve (иначе приглашения не работают).
 */
async function syncReferralCodeToFirestore(db, userId, code) {
  if (!db || !userId || !code) return
  try {
    await setDoc(
      userDocRef(db, userId),
      { referralCode: String(code).trim(), updatedAt: new Date().toISOString() },
      { merge: true },
    )
  } catch (e) {
    logger.warn('Referral', 'syncReferralCodeToFirestore', { userId }, e)
  }
}

async function backfillSupabaseReferralCode(userId, code) {
  if (!supabase || !userId || !code) return
  try {
    const { data: row, error: selErr } = await supabase
      .from('vpn_users')
      .select('raw')
      .eq('uid', userId)
      .eq('app_id', APP_ID)
      .maybeSingle()

    if (selErr || !row) return
    const existing = row.raw?.referralCode
    if (existing && String(existing).trim() === String(code).trim()) return

    await supabase
      .from('vpn_users')
      .update({
        raw: { ...(row.raw || {}), referralCode: String(code).trim() },
        source_updated_at: new Date().toISOString(),
      })
      .eq('uid', userId)
      .eq('app_id', APP_ID)
  } catch (e) {
    logger.warn('Referral', 'backfillSupabaseReferralCode', { userId }, e)
  }
}

async function readReferralCodeFromFirestore(db, userId) {
  if (!db || !userId) return null
  try {
    const snap = await getDoc(userDocRef(db, userId))
    if (!snap.exists()) return null
    const c = snap.data()?.referralCode
    if (c == null) return null
    const s = String(c).trim()
    return s.length >= MIN_REF_CODE_LEN ? s : null
  } catch (e) {
    logger.warn('Referral', 'readReferralCodeFromFirestore', { userId }, e)
    return null
  }
}

async function createReferralCodeFirestoreOnly(db, userId, maxAttempts) {
  const colRef = collection(db, USERS_PATH)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = generateCode()
    const snap = await getDocs(
      query(colRef, where('referralCode', '==', code), limit(1)),
    )
    if (snap.empty) {
      await syncReferralCodeToFirestore(db, userId, code)
      logger.info('Referral', 'Создан код (Firestore)', { userId, code })
      return code
    }
  }
  const fallback = `${generateCode()}${String(Date.now()).slice(-4)}`
  await syncReferralCodeToFirestore(db, userId, fallback)
  return fallback
}

export async function getOrCreateReferralCode(db, userId, maxAttempts = 10) {
  if (!userId) {
    logger.warn('Referral', 'getOrCreateReferralCode: нет userId')
    return ''
  }

  const fromFs = await readReferralCodeFromFirestore(db, userId)
  if (fromFs) {
    void backfillSupabaseReferralCode(userId, fromFs)
    return fromFs
  }

  if (!supabase) {
    if (!db) {
      logger.warn('Referral', 'getOrCreateReferralCode: нет supabase и db')
      return ''
    }
    return createReferralCodeFirestoreOnly(db, userId, maxAttempts)
  }

  const { data: user, error: userErr } = await supabase
    .from('vpn_users')
    .select('raw')
    .eq('uid', userId)
    .eq('app_id', APP_ID)
    .maybeSingle()

  if (userErr || !user) {
    if (db) {
      return createReferralCodeFirestoreOnly(db, userId, maxAttempts)
    }
    logger.warn('Referral', 'getOrCreateReferralCode: пользователь не найден в Supabase', {
      userId,
    })
    return ''
  }

  const existingCode = user.raw?.referralCode
  if (
    existingCode &&
    String(existingCode).trim().length >= MIN_REF_CODE_LEN
  ) {
    const code = String(existingCode).trim()
    await syncReferralCodeToFirestore(db, userId, code)
    return code
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = generateCode()
    const supPromise = supabase
      .from('vpn_users')
      .select('uid')
      .eq('app_id', APP_ID)
      .contains('raw', { referralCode: code })
      .limit(1)
    const fsPromise = db
      ? getDocs(
          query(
            collection(db, USERS_PATH),
            where('referralCode', '==', code),
            limit(1),
          ),
        )
      : Promise.resolve(null)

    const [{ data: existing }, fsDup] = await Promise.all([supPromise, fsPromise])
    const colBusy = db && fsDup ? !fsDup.empty : false

    if ((!existing || existing.length === 0) && !colBusy) {
      const updatedRaw = { ...(user.raw || {}), referralCode: code }
      await supabase
        .from('vpn_users')
        .update({ raw: updatedRaw, source_updated_at: new Date().toISOString() })
        .eq('uid', userId)
        .eq('app_id', APP_ID)

      await syncReferralCodeToFirestore(db, userId, code)
      logger.info('Referral', 'Создан реферальный код (Supabase + Firestore)', {
        userId,
        code,
      })
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
      await syncReferralCodeToFirestore(db, userId, fallback)
      return fallback
    }
  }
  return ''
}

export async function resolveReferralCodeViaApi(code) {
  if (!code || typeof code !== 'string') return null
  const trimmed = String(code).trim()
  if (trimmed.length < MIN_REF_CODE_LEN) return null
  const baseUrl = getApiBaseUrl()
  try {
    const res = await fetch(
      `${baseUrl}/api/referral/resolve?code=${encodeURIComponent(trimmed)}`,
    )
    if (!res.ok) {
      if (res.status === 404) return null
      logger.warn('Referral', 'resolveReferralCodeViaApi: ошибка API', {
        status: res.status,
      })
      return null
    }
    const data = await res.json().catch(() => ({}))
    return data.inviterId && typeof data.inviterId === 'string'
      ? data.inviterId
      : null
  } catch (err) {
    logger.error(
      'Referral',
      'resolveReferralCodeViaApi: сеть или ошибка',
      { code: trimmed },
      err,
    )
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
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(REFERRAL_CODE_LOCAL_KEY, trimmed)
    }
  } catch (e) {
    logger.warn('Referral', 'saveReferralCodePending: storage недоступен', null, e)
  }
}

export function getReferralCodePending(clear = false) {
  try {
    let code = sessionStorage.getItem(REFERRAL_CODE_STORAGE_KEY)
    if (!code && typeof localStorage !== 'undefined') {
      code = localStorage.getItem(REFERRAL_CODE_LOCAL_KEY)
    }
    if (clear && code) {
      sessionStorage.removeItem(REFERRAL_CODE_STORAGE_KEY)
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(REFERRAL_CODE_LOCAL_KEY)
      }
    }
    return code && code.trim() ? code.trim() : null
  } catch (e) {
    return null
  }
}

const PROCESS_BONUS_MAX_RETRIES = 4
const PROCESS_BONUS_RETRY_DELAY_MS = 600

export async function processReferralBonus(idToken, referredUserId, inviterId) {
  if (!idToken || !referredUserId || !inviterId) {
    return {
      success: false,
      error: 'Не указаны idToken, referredUserId или inviterId',
    }
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
      if (res.ok) return { success: true, ...data }
      if (res.status === 503 && attempt < PROCESS_BONUS_MAX_RETRIES) {
        lastError = data.error || res.statusText
        await new Promise((r) =>
          setTimeout(r, PROCESS_BONUS_RETRY_DELAY_MS * attempt),
        )
        continue
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { success: false, error: data.error || res.statusText }
      }
      lastError = data.error || res.statusText
    } catch (err) {
      lastError = err.message
    }
    if (attempt < PROCESS_BONUS_MAX_RETRIES) {
      await new Promise((r) =>
        setTimeout(
          r,
          PROCESS_BONUS_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
        ),
      )
    }
  }
  return { success: false, error: lastError || 'Ошибка сервера' }
}
