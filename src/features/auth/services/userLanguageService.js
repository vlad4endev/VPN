import { supabase } from '../../../lib/supabase/client.js'
import logger from '../../../shared/utils/logger.js'

const SUPPORTED_LANGS = ['ru', 'en', 'hi', 'ar', 'tg', 'uz', 'kk', 'ky', 'zh']

export async function saveUserLanguage(db, appId, userId, language) {
  if (!supabase || !appId || !userId || !language) return
  if (!SUPPORTED_LANGS.includes(language)) return
  try {
    const { error } = await supabase
      .from('vpn_users')
      .update({
        language,
        source_updated_at: new Date().toISOString(),
      })
      .eq('uid', userId)
      .eq('app_id', appId)

    if (error) throw error
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
