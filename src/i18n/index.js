import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { applySystemLanguageIfNeeded, getTelegramLanguageCode } from './detectSystemLanguage.js'
import ru from './locales/ru.json'
import en from './locales/en.json'
import hi from './locales/hi.json'
import ar from './locales/ar.json'
import tg from './locales/tg.json'
import uz from './locales/uz.json'
import kk from './locales/kk.json'
import ky from './locales/ky.json'
import zh from './locales/zh.json'

const resources = {
  ru: { translation: ru },
  en: { translation: en },
  hi: { translation: hi },
  ar: { translation: ar },
  tg: { translation: tg },
  uz: { translation: uz },
  kk: { translation: kk },
  ky: { translation: ky },
  zh: { translation: zh },
}

const STORAGE_KEY = 'vpn-ui-lang'

/** Детектор языка из Telegram WebApp (при первом заходе в Mini App) */
const telegramDetector = {
  name: 'telegram',
  lookup() {
    return getTelegramLanguageCode() || undefined
  },
}
LanguageDetector.addDetector(telegramDetector)

function runInit() {
  return i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: ['ru', 'en'],
      supportedLngs: ['ru', 'en', 'hi', 'ar', 'tg', 'uz', 'kk', 'ky', 'zh'],
      load: 'currentOnly',
      nonExplicitSupportedLngs: true,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      detection: {
        order: ['localStorage', 'telegram', 'navigator'],
        lookupLocalStorage: STORAGE_KEY,
        lookupNavigator: 'languages',
        caches: ['localStorage'],
      },
    })
    .then(() => {
      try {
        const applied = applySystemLanguageIfNeeded(STORAGE_KEY)
        if (applied && applied !== i18n.language) {
          i18n.changeLanguage(applied)
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[i18n] applySystemLanguageIfNeeded failed', e)
        }
      }
    })
}

/** Промис готовности i18n — использовать в точке входа, чтобы не рендерить приложение до загрузки переводов. Не отклоняется при ошибке: приложение всегда рендерится с рабочим i18n. */
export const i18nReady = runInit().catch((err) => {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[i18n] Init failed, using fallback', err)
  }
  try {
    if (!i18n.isInitialized) {
      i18n.changeLanguage('ru')
    }
  } catch (_) {}
  return Promise.resolve()
})

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lng
    document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr'
  }
})
if (typeof document !== 'undefined' && document.documentElement) {
  document.documentElement.lang = i18n.language
  document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr'
}

export default i18n
