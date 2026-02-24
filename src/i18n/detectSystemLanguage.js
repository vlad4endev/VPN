/**
 * Определение языка системы/устройства и сопоставление с поддерживаемыми локалями приложения.
 * Используется при первой загрузке (когда пользователь ещё не выбрал язык вручную).
 */

const SUPPORTED_LANGS = ['ru', 'en', 'hi', 'ar', 'tg', 'uz', 'kk', 'ky', 'zh']

/** Соответствие кодов браузера/ОС нашим кодам (если отличаются) */
const LANGUAGE_MAP = {
  'ru-ru': 'ru',
  'ru-ua': 'ru',
  'ru-kz': 'ru',
  'en-us': 'en',
  'en-gb': 'en',
  'en-au': 'en',
  'hi-in': 'hi',
  'ar-sa': 'ar',
  'ar-eg': 'ar',
  'ar-ae': 'ar',
  'tg-tj': 'tg',
  'uz-uz': 'uz',
  'kk-kz': 'kk',
  'ky-kg': 'ky',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hans': 'zh',
  'zh-hant': 'zh',
}

/**
 * Возвращает язык системы/браузера.
 * Проверяет navigator.languages, затем navigator.language, затем navigator.userLanguage (IE).
 * @returns {string} Код языка из SUPPORTED_LANGS или fallback
 */
export function getSystemLanguage(fallback = 'ru') {
  if (typeof navigator === 'undefined') return fallback

  const sources = [
    ...(navigator.languages || []),
    navigator.language,
    navigator.userLanguage,
  ].filter(Boolean)

  for (const raw of sources) {
    const normalized = String(raw).toLowerCase().trim()
    const withDash = normalized.replace('_', '-')
    // Точное совпадение (en, ru, ar, ...)
    if (SUPPORTED_LANGS.includes(normalized.split(/[-_]/)[0])) {
      const code = normalized.split(/[-_]/)[0]
      if (SUPPORTED_LANGS.includes(code)) return code
    }
    // Полный код en-US, ru-RU и т.д.
    if (LANGUAGE_MAP[withDash]) return LANGUAGE_MAP[withDash]
    const onlyLang = withDash.split('-')[0]
    if (SUPPORTED_LANGS.includes(onlyLang)) return onlyLang
  }

  return fallback
}

/**
 * Устанавливает язык приложения по языку системы, если пользователь ещё не сохранял выбор.
 * @param {string} storageKey — ключ в localStorage, где хранится выбранный язык
 * @returns {string} Установленный код языка
 */
export function applySystemLanguageIfNeeded(storageKey = 'vpn-ui-lang') {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
  if (stored && SUPPORTED_LANGS.includes(stored)) {
    return stored
  }
  const systemLang = getSystemLanguage('ru')
  return systemLang
}

export default getSystemLanguage
