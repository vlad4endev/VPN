/**
 * Сервис пользователей: поиск/создание по Telegram ID для бота.
 * Использует коллекцию users_v4 (Firestore).
 */

import { randomUUID } from 'crypto'

const SUB_ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'
const SUB_ID_LENGTH = 16

/**
 * Найти пользователя по tgId или создать запись в users_v4 (без Firebase Auth).
 * Подходит для сценариев бота: по telegramId возвращаем или создаём документ tg_<telegramId>.
 *
 * @param {object} db — экземпляр Firestore
 * @param {string} appId — APP_ID (artifacts/{appId}/public/data/users_v4)
 * @param {string} telegramId — Telegram user id (message.from.id)
 * @param {{ from?: { first_name?: string, last_name?: string, username?: string }, randomUUID?: () => string }} [options]
 * @returns {Promise<{ user: { id: string, ...object }, created: boolean }>}
 */
export async function findOrCreateByTelegramId(db, appId, telegramId, options = {}) {
  const tgId = String(telegramId || '').trim()
  if (!tgId) {
    return { user: null, created: false }
  }

  const usersRef = db.collection(`artifacts/${appId}/public/data/users_v4`)
  const byTgId = await usersRef.where('tgId', '==', tgId).limit(1).get()

  if (!byTgId.empty) {
    const doc = byTgId.docs[0]
    return { user: { id: doc.id, ...doc.data() }, created: false }
  }

  const uid = `tg_${tgId}`
  const userRef = db.doc(`artifacts/${appId}/public/data/users_v4/${uid}`)
  const existing = await userRef.get()
  if (existing.exists) {
    const data = existing.data()
    return { user: { id: existing.id, ...data }, created: false }
  }

  const from = options.from || {}
  const firstName = (from.first_name || '').trim()
  const lastName = (from.last_name || '').trim()
  const username = (from.username || '').trim()
  const name = [firstName, lastName].filter(Boolean).join(' ') || username || `Telegram ${tgId}`

  const genUuid = options.randomUUID || randomUUID
  let subId = ''
  for (let i = 0; i < SUB_ID_LENGTH; i++) {
    subId += SUB_ID_CHARS[Math.floor(Math.random() * SUB_ID_CHARS.length)]
  }

  const nowIso = new Date().toISOString()
  const userData = {
    email: `tg_${tgId}@telegram.placeholder`,
    login: `tg_${tgId}`,
    name,
    phone: '',
    role: 'user',
    plan: 'free',
    uuid: genUuid(),
    subId,
    tgId,
    expiresAt: null,
    tariffName: '',
    tariffId: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  }

  await userRef.set(userData)
  return { user: { id: uid, ...userData }, created: true }
}
