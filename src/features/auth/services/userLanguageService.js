/**
 * Сохранение и применение языка пользователя.
 * Язык хранится в карточке пользователя (Firestore).
 */

import { doc, updateDoc } from 'firebase/firestore'
import logger from '../../../shared/utils/logger.js'

const SUPPORTED_LANGS = ['ru', 'en', 'hi', 'ar', 'tg', 'uz', 'kk', 'ky', 'zh']

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

export function applyUserLanguageToUi(userData, changeLanguage) {
  const lang = userData?.language
  if (lang && SUPPORTED_LANGS.includes(lang) && typeof changeLanguage === 'function') {
    changeLanguage(lang)
  }
}

export { SUPPORTED_LANGS }
