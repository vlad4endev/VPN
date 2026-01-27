import { Send, BookOpen, FileText, Shield } from 'lucide-react'

const TELEGRAM_URL = 'https://t.me/+M3Wd-rkrqytmMTg6'
const KNOWLEDGE_BASE_URL = '#'
const PRIVACY_URL = '#'
const PERSONAL_DATA_URL = '#'

const linkClass =
  'text-slate-400 hover:text-blue-400 transition-colors text-[clamp(0.75rem,0.7rem+0.2vw,0.875rem)] flex items-center gap-1.5 touch-manipulation'

/**
 * Общий подвал приложения: название, год, Telegram, база знаний, политики.
 * Стиль согласован с тёмной темой (slate-950 / slate-800).
 */
export default function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-800 bg-slate-950/50">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col items-center gap-4 sm:gap-5 text-center">
          <p className="text-slate-500 font-bold text-[clamp(0.8rem,0.75rem+0.25vw,0.95rem)] tracking-wide">
            SKYPATH VPN | 2026
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2" aria-label="Подвал">
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
              aria-label="Telegram-канал SKYPATH VPN — Лучший в России"
            >
              <Send className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span>SKYPATH VPN | Лучший в России</span>
            </a>
            <a href={KNOWLEDGE_BASE_URL} className={linkClass} aria-label="База знаний">
              <BookOpen className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span>База знаний</span>
            </a>
            <a href={PRIVACY_URL} className={linkClass} aria-label="Политика конфиденциальности">
              <FileText className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span>Политика конфиденциальности</span>
            </a>
            <a href={PERSONAL_DATA_URL} className={linkClass} aria-label="Обработка персональных данных">
              <Shield className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span>Обработка персональных данных</span>
            </a>
          </nav>
        </div>
      </div>
    </footer>
  )
}
