/**
 * Сервис реферальной системы: генерация кода, разрешение кода в inviterId, выдача бонуса через API.
 */
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { APP_ID } from '../../../shared/constants/app.js'
import { REFERRAL_CODE_LENGTH, REFERRAL_CODE_CHARS, REFERRAL_CODE_STORAGE_KEY } from '../../../shared/constants/referral.js'
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
 * Находит userId пригласителя по реферальному коду
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
 * Сохраняет реферальный код в sessionStorage (до регистрации/входа)
 * @param {string} code
 */
export function saveReferralCodePending(code) {
  if (typeof code !== 'string' || !code.trim()) return
  try {
    sessionStorage.setItem(REFERRAL_CODE_STORAGE_KEY, code.trim())
  } catch (e) {
    logger.warn('Referral', 'saveReferralCodePending: sessionStorage недоступен', null, e)
  }
}

/**
 * Читает сохранённый реферальный код и при необходимости удаляет из storage
 * @param {boolean} clear — удалить после чтения
 * @returns {string|null}
 */
export function getReferralCodePending(clear = false) {
  try {
    const code = sessionStorage.getItem(REFERRAL_CODE_STORAGE_KEY)
    if (clear && code) sessionStorage.removeItem(REFERRAL_CODE_STORAGE_KEY)
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
export async function processReferralBonus(idToken, referredUserId, inviterId) {
  if (!idToken || !referredUserId || !inviterId) {
    return { success: false, error: 'Не указаны idToken, referredUserId или inviterId' }
  }
  const baseUrl = typeof window !== 'undefined' && window.location?.origin ? '' : (process.env.VITE_API_BASE_URL || '')
  const url = `${baseUrl}/api/referral/process`
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
    if (!res.ok) {
      logger.warn('Referral', 'processReferralBonus: ошибка API', { status: res.status, data })
      return { success: false, error: data.error || res.statusText }
    }
    return { success: true }
  } catch (err) {
    logger.error('Referral', 'processReferralBonus: сеть или ошибка', { referredUserId, inviterId }, err)
    return { success: false, error: err.message }
  }
}
