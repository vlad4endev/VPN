/**
 * Сохранение и применение языка пользователя.
 * Язык хранится в карточке пользователя (Firestore), чтобы ИИ и рассылки могли формировать сообщения на языке пользователя.
 */

import { doc, updateDoc } from 'firebase/firestore'
import logger from '../../../shared/utils/logger.js'

const SUPPORTED_LANGS = ['ru', 'en', 'hi', 'ar', 'tg', 'uz', 'kk', 'ky', 'zh']

/**
 * Сохраняет выбранный язык в документ пользователя в Firestore.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} appId
 * @param {string} userId
 * @param {string} language — код языка (ru, en, zh, ...)
 * @returns {Promise<void>}
 */
export async function saveUserLanguage(db, appId, userId, language) {
  if (!db || !appId || !userId || !language) return
  if (!SUPPORTED_LANGS.includes(language)) return
  try {
    const userRef = doc(db, `artifacts/${appId}/public/data/users_v4`, userId)
    await updateDoc(userRef, {
      language,
      updatedAt: new Date().toISOString(),
    })
    logger.debug('User', 'Язык сохранён в карточку пользователя', { userId, language })
  } catch (err) {
    logger.warn('User', 'Не удалось сохранить язык в профиль', { userId }, err)
  }
}

/**
 * Применяет язык из карточки пользователя к интерфейсу (i18n), если он поддерживается.
 * @param {Object} userData — данные пользователя из Firestore (должны содержать language)
 * @param {Function} changeLanguage — i18n.changeLanguage
 */
export function applyUserLanguageToUi(userData, changeLanguage) {
  const lang = userData?.language
  if (lang && SUPPORTED_LANGS.includes(lang) && typeof changeLanguage === 'function') {
    changeLanguage(lang)
  }
}

export { SUPPORTED_LANGS }
