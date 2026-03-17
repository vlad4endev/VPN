/**
 * Сервис реферальной системы: генерация кода, разрешение кода в inviterId, выдача бонуса через API.
 */
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { APP_ID } from '../../../shared/constants/app.js'
import { REFERRAL_CODE_LENGTH, REFERRAL_CODE_CHARS, REFERRAL_CODE_STORAGE_KEY, REFERRAL_CODE_LOCAL_KEY } from '../../../shared/constants/referral.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'
import logger from '../../../shared/utils/logger.js'

/**
 * Генерирует случайный реферальный код заданной длины
 * @returns {string}
 */
function generateCode() {
  let code = ''
  const chars = REFERRAL_CODE_CHARS
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Возвращает или создаёт уникальный реферальный код пользователя и сохраняет в Firestore
 * @param {Firestore} db
 * @param {string} userId
 * @param {number} maxAttempts
 * @returns {Promise<string>} реферальный код
 */
export async function getOrCreateReferralCode(db, userId, maxAttempts = 10) {
  if (!db || !userId) {
    logger.warn('Referral', 'getOrCreateReferralCode: нет db или userId')
    return ''
  }
  const userRef = doc(db, `artifacts/${APP_ID}/public/data/users_v4`, userId)
  const snap = await getDoc(userRef)
  if (!snap.exists()) {
    logger.warn('Referral', 'getOrCreateReferralCode: пользователь не найден', { userId })
    return ''
  }
  const data = snap.data()
  if (data.referralCode && String(data.referralCode).trim().length >= REFERRAL_CODE_LENGTH) {
    return String(data.referralCode).trim()
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = generateCode()
    const usersRef = collection(db, `artifacts/${APP_ID}/public/data/users_v4`)
    const q = query(usersRef, where('referralCode', '==', code))
    const existing = await getDocs(q)
    if (existing.empty) {
      await updateDoc(userRef, {
        referralCode: code,
        updatedAt: new Date().toISOString(),
      })
      logger.info('Referral', 'Создан реферальный код', { userId, code })
      return code
    }
    if (attempt === maxAttempts) {
      const fallback = code + String(Date.now()).slice(-4)
      await updateDoc(userRef, {
        referralCode: fallback,
        updatedAt: new Date().toISOString(),
      })
      return fallback
    }
  }
  return ''
}

/**
 * Находит userId пригласителя по реферальному коду через API (работает без аутентификации — для регистрации).
 * При регистрации пользователь ещё не аутентифицирован, поэтому Firestore query даёт permission-denied.
 * @param {string} code — реферальный код (без ?ref=)
 * @returns {Promise<string|null>} uid пригласителя или null
 */
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

/**
 * Находит userId пригласителя по реферальному коду (через Firestore — только для аутентифицированных).
 * @deprecated Для регистрации используйте resolveReferralCodeViaApi — до создания пользователя нет auth.
 * @param {Firestore} db
 * @param {string} code — реферальный код или ссылка вида ?ref=CODE
 * @returns {Promise<string|null>} uid пригласителя или null
 */
export async function resolveReferralCode(db, code) {
  if (!db || !code || typeof code !== 'string') return null
  const trimmed = String(code).trim()
  if (trimmed.length < REFERRAL_CODE_LENGTH) return null
  const usersRef = collection(db, `artifacts/${APP_ID}/public/data/users_v4`)
  const q = query(usersRef, where('referralCode', '==', trimmed))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const docSnap = snap.docs[0]
  return docSnap.id
}

/**
 * Сохраняет реферальный код в sessionStorage и localStorage (до регистрации/входа).
 * localStorage сохраняет ref при закрытии вкладки — пользователь может вернуться позже.
 * @param {string} code
 */
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

/**
 * Читает сохранённый реферальный код (sessionStorage → localStorage) и при необходимости удаляет из storage.
 * @param {boolean} clear — удалить после чтения
 * @returns {string|null}
 */
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

/**
 * Вызывает бэкенд для начисления бонуса пригласителю (один раз на одного приглашённого)
 * @param {string} idToken — Firebase ID token только что зарегистрированного пользователя
 * @param {string} referredUserId — uid приглашённого
 * @param {string} inviterId — uid пригласителя
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
/** Количество повторов при сбое сети/сервера */
const PROCESS_BONUS_MAX_RETRIES = 3
/** Задержка между повторами (мс), экспоненциальный backoff */
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
        logger.warn('Referral', 'processReferralBonus: клиентская ошибка, не повторяем', { status: res.status, data })
        return { success: false, error: data.error || res.statusText }
      }
      lastError = data.error || res.statusText
      logger.warn('Referral', `processReferralBonus: попытка ${attempt}/${PROCESS_BONUS_MAX_RETRIES}`, { status: res.status, data })
    } catch (err) {
      lastError = err.message
      logger.warn('Referral', `processReferralBonus: попытка ${attempt}/${PROCESS_BONUS_MAX_RETRIES}`, { err: err.message })
    }
    if (attempt < PROCESS_BONUS_MAX_RETRIES) {
      const delay = PROCESS_BONUS_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  logger.error('Referral', 'processReferralBonus: все попытки исчерпаны', { referredUserId, inviterId })
  return { success: false, error: lastError || 'Ошибка сервера' }
}
