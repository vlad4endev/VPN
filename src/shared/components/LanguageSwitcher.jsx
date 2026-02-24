import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import i18n from '../../i18n'
import { getSystemLanguage } from '../../i18n/detectSystemLanguage.js'

const LANGS = [
  { code: 'ru', labelKey: 'lang.ru', flag: '🇷🇺' },
  { code: 'en', labelKey: 'lang.en', flag: '🇺🇸' },
  { code: 'zh', labelKey: 'lang.zh', flag: '🇨🇳' },
  { code: 'hi', labelKey: 'lang.hi', flag: '🇮🇳' },
  { code: 'ar', labelKey: 'lang.ar', flag: '🇸🇦' },
  { code: 'tg', labelKey: 'lang.tg', flag: '🇹🇯' },
  { code: 'uz', labelKey: 'lang.uz', flag: '🇺🇿' },
  { code: 'kk', labelKey: 'lang.kk', flag: '🇰🇿' },
  { code: 'ky', labelKey: 'lang.ky', flag: '🇰🇬' },
]

/**
 * Переключатель языка: RU | EN | हि.
 * Сохраняет выбор в localStorage (i18n detector).
 */
export default function LanguageSwitcher({ className = '', variant = 'default' }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const current = LANGS.find((l) => l.code === i18n.language) || LANGS[0]

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [open])

  const handleSelect = (code) => {
    const lang = code === 'system' ? getSystemLanguage('ru') : code
    i18n.changeLanguage(lang)
    setOpen(false)
  }

  const buttonClass =
    variant === 'compact'
      ? 'p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors touch-manipulation'
      : 'flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium transition-colors touch-manipulation min-h-[44px]'

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lang.label')}
        title={t('lang.label')}
      >
        <Globe className="w-4 h-4 flex-shrink-0" aria-hidden />
        {variant !== 'compact' && (
          <span className="flex items-center gap-1.5 truncate max-w-[6rem]">
            <span className="text-base leading-none" aria-hidden>{current.flag}</span>
            <span>{current.code.toUpperCase()}</span>
          </span>
        )}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute top-full right-0 left-auto mt-1 py-1 min-w-[160px] max-h-[min(70vh,320px)] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50"
          aria-label={t('lang.label')}
        >
          <li role="option" aria-selected={false}>
            <button
              type="button"
              onClick={() => handleSelect('system')}
              className="w-full text-left px-4 py-2.5 text-sm transition-colors touch-manipulation text-slate-400 hover:bg-slate-800 hover:text-white border-b border-slate-700/80 flex items-center gap-2"
            >
              <span className="text-base" aria-hidden>🌐</span>
              {t('lang.system')}
            </button>
          </li>
          {LANGS.map((lang) => (
            <li key={lang.code} role="option" aria-selected={i18n.language === lang.code}>
              <button
                type="button"
                onClick={() => handleSelect(lang.code)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors touch-manipulation flex items-center gap-2 ${
                  i18n.language === lang.code
                    ? 'bg-blue-600/20 text-blue-400 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="text-base leading-none" aria-hidden>{lang.flag}</span>
                {t(lang.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
