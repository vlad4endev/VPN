import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, BookOpen, FileText, FileCheck, Shield, ChevronUp, ChevronDown } from 'lucide-react'
import PrivacyPolicyModal from './PrivacyPolicyModal.jsx'
import UserAgreementModal from './UserAgreementModal.jsx'

const TELEGRAM_URL = 'https://t.me/+M3Wd-rkrqytmMTg6'
const KNOWLEDGE_BASE_URL = '#'
const PERSONAL_DATA_URL = '#'

const linkClass =
  'text-slate-500 hover:text-slate-300 transition-colors text-xs flex items-center gap-1 touch-manipulation'

/**
 * Общий подвал приложения: по умолчанию скрыт, раскрывается по клику на кнопку.
 * Название, год, Telegram, база знаний, политики.
 */
export default function Footer() {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showAgreementModal, setShowAgreementModal] = useState(false)

  return (
    <>
      <div className="max-sm:hidden flex-shrink-0 border-t border-slate-800/50 bg-slate-950/30">
        {!isExpanded ? (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="w-full py-2 flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-400 text-xs font-medium transition-colors touch-manipulation"
            aria-expanded="false"
            aria-label={t('footer.showFooter', 'Показать подвал')}
          >
            <ChevronDown className="w-3.5 h-3.5" aria-hidden />
            <span>{t('footer.showFooter', 'Подвал')}</span>
          </button>
        ) : (
          <footer>
            <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
              <div className="flex flex-col items-center gap-2 sm:gap-3 text-center">
                <div className="flex items-center justify-center gap-2 w-full">
                  <p className="text-slate-600 text-xs font-medium tracking-wide">
                    SKYFLOW | 2026
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="p-1 rounded text-slate-500 hover:text-slate-400 hover:bg-slate-800/50 transition-colors"
                    aria-label={t('footer.hideFooter', 'Свернуть подвал')}
                    title={t('footer.hideFooter', 'Свернуть')}
                  >
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
                <nav className="flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-4 gap-y-1.5 sm:gap-y-1" aria-label={t('footer.navLabel')}>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                aria-label={t('footer.telegramAria')}
              >
                <Send className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                <span>{t('footer.telegramChannel')}</span>
              </a>
              <a href={KNOWLEDGE_BASE_URL} className={linkClass} aria-label={t('footer.knowledgeBaseAria')}>
                <BookOpen className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                <span>{t('footer.knowledgeBase')}</span>
              </a>
              <button
                type="button"
                onClick={() => setShowAgreementModal(true)}
                className={linkClass + ' bg-transparent border-none cursor-pointer'}
                aria-label={t('footer.userAgreementAria')}
              >
                <FileCheck className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                <span>{t('footer.userAgreement')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(true)}
                className={linkClass + ' bg-transparent border-none cursor-pointer'}
                aria-label={t('footer.privacyPolicyAria')}
              >
                <FileText className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                <span>{t('footer.privacyPolicy')}</span>
              </button>
              <a href={PERSONAL_DATA_URL} className={linkClass} aria-label={t('footer.personalDataAria')}>
                <Shield className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                <span>{t('footer.personalData')}</span>
              </a>
            </nav>
                {/* Счётчик Метрики скрыт; учёт идёт через скрипт на странице */}
              </div>
            </div>
          </footer>
        )}
      </div>

      <PrivacyPolicyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />
      <UserAgreementModal isOpen={showAgreementModal} onClose={() => setShowAgreementModal(false)} />
    </>
  )
}
