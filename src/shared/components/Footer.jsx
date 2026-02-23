import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, BookOpen, FileText, FileCheck, Shield } from 'lucide-react'
import PrivacyPolicyModal from './PrivacyPolicyModal.jsx'
import UserAgreementModal from './UserAgreementModal.jsx'

const TELEGRAM_URL = 'https://t.me/+M3Wd-rkrqytmMTg6'
const KNOWLEDGE_BASE_URL = '#'
const PERSONAL_DATA_URL = '#'

const linkClass =
  'text-slate-400 hover:text-blue-400 transition-colors text-[clamp(0.75rem,0.7rem+0.2vw,0.875rem)] flex items-center gap-1.5 touch-manipulation'

/**
 * Общий подвал приложения: название, год, Telegram, база знаний, политики.
 * Стиль согласован с тёмной темой (slate-950 / slate-800).
 */
export default function Footer() {
  const { t } = useTranslation()
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showAgreementModal, setShowAgreementModal] = useState(false)

  return (
    <>
      <footer className="mt-auto border-t border-slate-800 bg-slate-950/50">
        <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col items-center gap-4 sm:gap-5 text-center">
            <p className="text-slate-500 font-bold text-[clamp(0.8rem,0.75rem+0.25vw,0.95rem)] tracking-wide">
              SKYFLOW | 2026
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-6 gap-y-3 sm:gap-y-2" aria-label={t('footer.navLabel')}>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                aria-label={t('footer.telegramAria')}
              >
                <Send className="w-4 h-4 flex-shrink-0" aria-hidden />
                <span>{t('footer.telegramChannel')}</span>
              </a>
              <a href={KNOWLEDGE_BASE_URL} className={linkClass} aria-label={t('footer.knowledgeBaseAria')}>
                <BookOpen className="w-4 h-4 flex-shrink-0" aria-hidden />
                <span>{t('footer.knowledgeBase')}</span>
              </a>
              <button
                type="button"
                onClick={() => setShowAgreementModal(true)}
                className={linkClass + ' bg-transparent border-none cursor-pointer'}
                aria-label={t('footer.userAgreementAria')}
              >
                <FileCheck className="w-4 h-4 flex-shrink-0" aria-hidden />
                <span>{t('footer.userAgreement')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(true)}
                className={linkClass + ' bg-transparent border-none cursor-pointer'}
                aria-label={t('footer.privacyPolicyAria')}
              >
                <FileText className="w-4 h-4 flex-shrink-0" aria-hidden />
                <span>{t('footer.privacyPolicy')}</span>
              </button>
              <a href={PERSONAL_DATA_URL} className={linkClass} aria-label={t('footer.personalDataAria')}>
                <Shield className="w-4 h-4 flex-shrink-0" aria-hidden />
                <span>{t('footer.personalData')}</span>
              </a>
            </nav>
            <a
              href="https://metrika.yandex.ru/stat/?id=106652816&from=informer"
              target="_blank"
              rel="nofollow noreferrer"
              aria-label={t('footer.yandexAria')}
              className="mt-1"
            >
              <img
                src="https://informer.yandex.ru/informer/106652816/3_0_535353FF_333333FF_1_uniques"
                style={{ width: 88, height: 31, border: 0 }}
                alt={t('footer.yandexImgAlt')}
                className="ym-advanced-informer"
                data-cid="106652816"
                data-lang="ru"
              />
            </a>
          </div>
        </div>
      </footer>

      <PrivacyPolicyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />
      <UserAgreementModal isOpen={showAgreementModal} onClose={() => setShowAgreementModal(false)} />
    </>
  )
}
