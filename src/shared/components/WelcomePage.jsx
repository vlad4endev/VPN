import { useState, useRef } from 'react'
import { Shield, Globe, Check, Zap, Star, Quote, ChevronLeft, ChevronRight, Send, LayoutDashboard, Building2, BookOpen, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Footer from './Footer.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import TelegramLoginWidget from '../../features/auth/components/TelegramLoginWidget.jsx'
import { getWelcomeAudience } from '../utils/welcomeAudience.js'

/** Порог символов: показывать «Читать далее» для длинных отзывов */
const REVIEW_EXPAND_THRESHOLD = 150

/** Цены по срокам: только 12 мес со скидкой 20%. devices — ключ перевода. */
const TARIFFS = {
  Super: { pricePerMonth: 150, name: 'Super', devicesKey: 'welcome.devicesSuper' },
  MULTI: { pricePerMonth: 250, name: 'MULTI', devicesKey: 'welcome.devicesMulti' }
}

function getPrices(pricePerMonth) {
  return {
    1: { total: pricePerMonth * 1, perMonth: pricePerMonth },
    3: { total: pricePerMonth * 3, perMonth: pricePerMonth },
    6: { total: pricePerMonth * 6, perMonth: pricePerMonth },
    12: { total: Math.round(pricePerMonth * 12 * 0.8), perMonth: Math.round(pricePerMonth * 12 * 0.8 / 12) }
  }
}

/**
 * Экран приветствия (Welcome) — единственная стартовая страница для неавторизованных пользователей.
 * Разметка соответствует SEO: один h1, семантические main/header/section, aria-метки.
 *
 * @param {Object} props
 * @param {Function} props.onSetView - Переключение view ('login', 'register')
 * @param {Array<{ id: string, author: string, rating: number, text: string, date?: string }>} [props.reviews] - Одобренные отзывы
 * @param {Function} [props.onTelegramSignIn] - Вход через Telegram Mini App (кнопка в TMA)
 * @param {Function} [props.onTelegramWidgetAuth] - Вход через Login Widget (с обычного сайта)
 * @param {boolean} [props.telegramSignInLoading] - Загрузка при входе через Telegram
 * @param {object|null} [props.currentUser] — если пользователь вошёл, показываем вариант «новый / активный»
 * @param {Function} [props.onGoToDashboard] — переход в личный кабинет (для вошедших)
 * @param {boolean} [props.isTelegramApp] - Открыто в Telegram Mini App
 */
export default function WelcomePage({
  onSetView,
  reviews = [],
  currentUser = null,
  onGoToDashboard,
  onTelegramSignIn,
  onTelegramWidgetAuth,
  onTelegramWidgetError,
  telegramSignInLoading = false,
  isTelegramApp = false,
}) {
  const { t } = useTranslation()
  const audience = getWelcomeAudience(currentUser)
  const [activeTariff, setActiveTariff] = useState('Super')
  const [expandedReviewIds, setExpandedReviewIds] = useState(() => new Set())
  const reviewsScrollRef = useRef(null)
  const prices = getPrices(TARIFFS[activeTariff].pricePerMonth)

  const goCabinet = () => {
    if (typeof onGoToDashboard === 'function') onGoToDashboard()
    else onSetView('login')
  }

  const scrollToSection = (id) => {
    if (typeof document === 'undefined') return
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const toggleReviewExpanded = (id) => {
    setExpandedReviewIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const scrollReviews = (direction) => {
    const el = reviewsScrollRef.current
    if (!el) return
    const cardWidth = el.querySelector('article')?.offsetWidth ?? 320
    const gap = 32
    const step = (cardWidth + gap) * (direction === 'left' ? -1 : 1)
    el.scrollBy({ left: step, behavior: 'smooth' })
  }
  const durations = [
    { key: 1, labelKey: 'welcome.duration1' },
    { key: 3, labelKey: 'welcome.duration3' },
    { key: 6, labelKey: 'welcome.duration6' },
    { key: 12, labelKey: 'welcome.duration12' }
  ]

  const guestHero = audience === 'guest'
  const newHero = audience === 'new'
  const activeHero = audience === 'active'

  return (
    <div className="min-h-screen min-h-[100dvh] flex-1 flex flex-col bg-slate-950 text-slate-200 overflow-x-hidden selection:bg-blue-500/30 w-full max-w-[100vw]">
      <main id="main" role="main" className="min-w-0 w-full max-w-full overflow-x-hidden flex flex-col">
        {currentUser && (
          <div className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur-md px-4 py-3 sm:px-6">
            <div className="max-w-[80rem] mx-auto flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400 truncate max-w-[min(100%,14rem)] sm:max-w-md">
                <span className="text-slate-200 font-semibold">{currentUser.name || currentUser.login || currentUser.email || '—'}</span>
              </p>
              <button
                type="button"
                onClick={goCabinet}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors touch-manipulation"
              >
                <LayoutDashboard size={18} className="flex-shrink-0" />
                {t('welcome.backToCabinet')}
              </button>
            </div>
          </div>
        )}

        {/* Hero — гость / новый пользователь / активная подписка */}
        <header
          className={`relative px-4 sm:px-6 md:px-8 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 overflow-hidden ${currentUser ? 'pt-8 sm:pt-10 pb-10 sm:pb-12' : 'pt-14 sm:pt-16 md:pt-20 pb-12 sm:pb-14 md:pb-16'}`}
          role="banner"
          aria-label={t('welcome.mainScreen')}
        >
          <div className="max-w-[80rem] mx-auto text-center w-full px-4 sm:px-6 md:px-8">
            <div className={`absolute top-3 right-3 sm:top-4 sm:right-4 md:top-5 md:right-5 z-10 ${currentUser ? 'top-14 sm:top-16' : ''}`}>
              <LanguageSwitcher />
            </div>

            {guestHero && (
              <>
                <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs sm:text-sm font-bold mb-6 sm:mb-8 animate-bounce" aria-hidden="true">
                  <Zap size={14} className="flex-shrink-0" /> {t('welcome.badge')}
                </div>
                <h1 className="text-[clamp(2.5rem,8vw,4.5rem)] font-black text-white mb-4 sm:mb-6 tracking-tighter italic leading-tight">
                  <span className="text-blue-600">SKY</span>FLOW
                </h1>
                <p className="text-[clamp(1.125rem,2.5vw,1.5rem)] text-white/90 max-w-2xl mx-auto mb-2 sm:mb-3 font-semibold leading-relaxed break-words">
                  {t('welcome.tagline')}
                </p>
                <p className="text-[clamp(0.9375rem,1.5vw,1.125rem)] text-slate-400 max-w-2xl mx-auto mb-2 leading-relaxed break-words">
                  {t('welcome.subtitle')}
                </p>
                <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed break-words">
                  {t('welcome.cta')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center max-w-sm sm:max-w-none mx-auto">
                  {isTelegramApp && onTelegramSignIn && (
                    <button
                      type="button"
                      onClick={onTelegramSignIn}
                      disabled={telegramSignInLoading}
                      className="w-full sm:w-64 min-h-[48px] sm:min-h-[52px] bg-[#0088cc] hover:bg-[#0077b5] active:bg-[#0088cc] disabled:opacity-60 py-4 sm:py-5 rounded-2xl sm:rounded-3xl font-black text-white text-lg sm:text-xl transition-all shadow-2xl shadow-[#0088cc]/30 active:scale-[0.98] touch-manipulation inline-flex items-center justify-center gap-2"
                    >
                      {telegramSignInLoading ? (
                        <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send size={20} className="flex-shrink-0" />
                      )}
                      {t('welcome.signInTelegram')}
                    </button>
                  )}
                  {!isTelegramApp && onTelegramWidgetAuth && (import.meta.env?.VITE_TELEGRAM_BOT_USERNAME || '').trim() && (
                    <div className="flex flex-col items-center gap-2">
                      <TelegramLoginWidget onAuth={onTelegramWidgetAuth} onError={onTelegramWidgetError} />
                      <span className="text-xs text-slate-500">{t('welcome.signInOrRegisterTelegram')}</span>
                    </div>
                  )}
                  <button onClick={() => onSetView('register')} className="w-full sm:w-64 min-h-[48px] sm:min-h-[52px] bg-blue-600 hover:bg-blue-500 active:bg-blue-600 py-4 sm:py-5 rounded-2xl sm:rounded-3xl font-black text-white text-lg sm:text-xl transition-all shadow-2xl shadow-blue-600/30 active:scale-[0.98] touch-manipulation">
                    {t('welcome.getStarted')}
                  </button>
                  <button onClick={() => onSetView('login')} className="w-full sm:w-64 min-h-[48px] sm:min-h-[52px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 py-4 sm:py-5 rounded-2xl sm:rounded-3xl font-black text-white text-lg sm:text-xl border border-slate-800 transition-all active:scale-[0.98] touch-manipulation">
                    {t('welcome.enterCabinet')}
                  </button>
                </div>
              </>
            )}

            {newHero && (
              <>
                <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-bold mb-6 sm:mb-8">
                  <Zap size={14} className="flex-shrink-0" /> SKYFLOW
                </div>
                <h1 className="text-[clamp(1.75rem,5vw,2.75rem)] font-black text-white mb-4 sm:mb-5 tracking-tight leading-tight max-w-3xl mx-auto">
                  {t('welcome.audienceNewTitle')}
                </h1>
                <p className="text-[clamp(0.9375rem,1.5vw,1.125rem)] text-slate-400 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
                  {t('welcome.audienceNewSubtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center max-w-md sm:max-w-none mx-auto">
                  <button
                    type="button"
                    onClick={goCabinet}
                    className="w-full sm:w-72 min-h-[52px] bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-black text-white text-lg shadow-xl shadow-blue-600/25 active:scale-[0.98] touch-manipulation inline-flex items-center justify-center gap-2"
                  >
                    <LayoutDashboard size={22} />
                    {t('welcome.backToCabinet')}
                  </button>
                </div>
              </>
            )}

            {activeHero && (
              <>
                <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs sm:text-sm font-bold mb-6 sm:mb-8">
                  <Check size={14} className="flex-shrink-0" /> SKYFLOW
                </div>
                <h1 className="text-[clamp(1.75rem,5vw,2.75rem)] font-black text-white mb-4 sm:mb-5 tracking-tight leading-tight max-w-3xl mx-auto">
                  {t('welcome.audienceActiveTitle')}
                </h1>
                <p className="text-[clamp(0.9375rem,1.5vw,1.125rem)] text-slate-400 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
                  {t('welcome.audienceActiveSubtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center max-w-md sm:max-w-none mx-auto">
                  <button
                    type="button"
                    onClick={goCabinet}
                    className="w-full sm:w-72 min-h-[52px] bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-black text-white text-lg shadow-xl shadow-emerald-600/25 active:scale-[0.98] touch-manipulation inline-flex items-center justify-center gap-2"
                  >
                    <LayoutDashboard size={22} />
                    {t('welcome.audienceActiveCta')}
                  </button>
                </div>
              </>
            )}

            <nav className="flex flex-wrap justify-center gap-2 mt-10 sm:mt-12 pt-6 border-t border-slate-800/60" aria-label={t('welcome.servicePage')}>
              <button
                type="button"
                onClick={() => scrollToSection('welcome-seller')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-xs sm:text-sm font-semibold hover:border-blue-500/50 hover:text-white transition-colors touch-manipulation min-h-[44px]"
              >
                <Building2 size={16} className="text-blue-400 flex-shrink-0" />
                {t('welcome.navSeller')}
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('welcome-info')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-xs sm:text-sm font-semibold hover:border-blue-500/50 hover:text-white transition-colors touch-manipulation min-h-[44px]"
              >
                <Info size={16} className="text-sky-400 flex-shrink-0" />
                {t('welcome.navInfo')}
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('welcome-reviews')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-xs sm:text-sm font-semibold hover:border-blue-500/50 hover:text-white transition-colors touch-manipulation min-h-[44px]"
              >
                <Star size={16} className="text-amber-400 flex-shrink-0" />
                {t('welcome.navReviews')}
              </button>
            </nav>
          </div>
        </header>

        {/* О сервисе (продукт) */}
        <section
          id="welcome-seller"
          className="container-responsive py-12 sm:py-16 md:py-20 border-t border-slate-900 scroll-mt-24"
          aria-labelledby="welcome-seller-heading"
        >
          <div className="max-w-[48rem] mx-auto">
            <div className="flex items-center gap-3 mb-4 justify-center sm:justify-start">
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                <Building2 className="w-7 h-7 text-blue-400" aria-hidden="true" />
              </div>
              <div className="text-left">
                <h2 id="welcome-seller-heading" className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {t('welcome.sellerSection')}
                </h2>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">{t('welcome.sellerSubtitle')}</p>
              </div>
            </div>
            <p className="text-slate-300 leading-relaxed mb-6 text-center sm:text-left">{t('welcome.sellerLead')}</p>
            <ul className="space-y-3 text-slate-400 text-sm sm:text-base">
              <li className="flex gap-3">
                <Check className="text-blue-500 shrink-0 mt-0.5" size={18} />
                <span>{t('welcome.sellerPoint1')}</span>
              </li>
              <li className="flex gap-3">
                <Check className="text-blue-500 shrink-0 mt-0.5" size={18} />
                <span>{t('welcome.sellerPoint2')}</span>
              </li>
              <li className="flex gap-3">
                <Check className="text-blue-500 shrink-0 mt-0.5" size={18} />
                <span>{t('welcome.sellerPoint3')}</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Информация: как подключиться */}
        <section
          id="welcome-info"
          className="container-responsive py-12 sm:py-16 md:py-20 bg-slate-900/25 border-y border-slate-900 scroll-mt-24"
          aria-labelledby="welcome-info-heading"
        >
          <div className="max-w-[48rem] mx-auto">
            <div className="flex items-center gap-3 mb-6 justify-center sm:justify-start">
              <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20">
                <BookOpen className="w-7 h-7 text-sky-400" aria-hidden="true" />
              </div>
              <div className="text-left">
                <h2 id="welcome-info-heading" className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {t('welcome.infoSection')}
                </h2>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">{t('welcome.infoSubtitle')}</p>
              </div>
            </div>
            <ol className="list-decimal list-inside space-y-4 text-slate-300 leading-relaxed marker:text-blue-500 marker:font-black pl-1">
              <li>{t('welcome.infoStep1')}</li>
              <li>{t('welcome.infoStep2')}</li>
              <li>{t('welcome.infoStep3')}</li>
              <li>{t('welcome.infoStep4')}</li>
            </ol>
          </div>
        </section>

        {/* Преимущества — Mobile-First: 1 col → 2 cols (768px) → 3 cols (1024px) */}
        <section className="container-responsive py-12 sm:py-16 md:py-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 w-full" aria-label={t('welcome.benefits')}>
          <div className="bg-slate-900/50 border border-slate-800 p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] group hover:border-blue-500/40 transition-all min-w-0 overflow-hidden">
            <div className="bg-blue-500/10 w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center text-blue-500 mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
              <Shield size={24} className="sm:w-7 sm:h-7" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2 sm:mb-3 uppercase tracking-tight">{t('welcome.benefitCabinetTitle')}</h3>
            <p className="text-slate-500 font-medium text-sm sm:text-base leading-relaxed break-words">{t('welcome.benefitCabinetDesc')}</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] group hover:border-blue-500/40 transition-all min-w-0 overflow-hidden">
            <div className="bg-blue-500/10 w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center text-blue-500 mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
              <Check size={24} className="sm:w-7 sm:h-7" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2 sm:mb-3 uppercase tracking-tight">{t('welcome.benefitSupportTitle')}</h3>
            <p className="text-slate-500 font-medium text-sm sm:text-base leading-relaxed break-words">{t('welcome.benefitSupportDesc')}</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] group hover:border-blue-500/40 transition-all min-w-0 sm:col-span-2 lg:col-span-1 overflow-hidden">
            <div className="bg-blue-500/10 w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center text-blue-500 mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
              <Globe size={24} className="sm:w-7 sm:h-7" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mb-2 sm:mb-3 uppercase tracking-tight">{t('welcome.benefitLocationsTitle')}</h3>
            <p className="text-slate-500 font-medium text-sm sm:text-base leading-relaxed break-words">{t('welcome.benefitLocationsDesc')}</p>
          </div>
        </section>

        {/* Тарифы: для активной подписки — компактный блок; иначе полная сетка */}
        <section className="container-responsive py-10 sm:py-14 md:py-16" aria-labelledby="welcome-tariffs-heading">
          <div className="max-w-[80rem] mx-auto rounded-2xl sm:rounded-[2.5rem] bg-slate-900/60 border border-slate-700/80 shadow-2xl shadow-blue-900/10 px-4 sm:px-6 md:px-8 py-8 sm:py-12 md:py-16">
            {activeHero ? (
              <div className="text-center max-w-xl mx-auto">
                <h2 id="welcome-tariffs-heading" className="text-2xl sm:text-3xl font-black text-white mb-3 sm:mb-4 tracking-tight">
                  {t('welcome.tariffs')}
                </h2>
                <p className="text-slate-400 mb-6 sm:mb-8 leading-relaxed">{t('welcome.audienceActiveSubtitle')}</p>
                <button
                  type="button"
                  onClick={goCabinet}
                  className="inline-flex items-center justify-center gap-2 min-h-[48px] px-8 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-lg shadow-lg shadow-blue-600/20 active:scale-[0.98] touch-manipulation w-full sm:w-auto"
                >
                  <LayoutDashboard size={20} />
                  {t('welcome.audienceActiveCta')}
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-8 sm:mb-12">
                  <h2 id="welcome-tariffs-heading" className="text-[clamp(1.75rem,5vw,3rem)] lg:text-5xl font-black text-white mb-3 sm:mb-4 tracking-tighter">{t('welcome.tariffs')}</h2>
                  <div className="inline-flex p-1 rounded-xl bg-slate-800/80 border border-slate-700" role="tablist" aria-label={t('welcome.tariffChoice')}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTariff === 'Super'}
                      onClick={() => setActiveTariff('Super')}
                      className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-black text-xs sm:text-sm uppercase tracking-wide transition-all min-h-[44px] touch-manipulation ${activeTariff === 'Super' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                      Super
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTariff === 'MULTI'}
                      onClick={() => setActiveTariff('MULTI')}
                      className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-black text-xs sm:text-sm uppercase tracking-wide transition-all min-h-[44px] touch-manipulation ${activeTariff === 'MULTI' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                      MULTI
                    </button>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-3 sm:gap-6 lg:gap-8 mb-8 sm:mb-12 text-slate-300 text-sm sm:text-base">
                  <span className="flex items-center gap-2 font-bold">
                    <Check className="text-blue-500 shrink-0" size={20} /> {t(TARIFFS[activeTariff].devicesKey)}
                  </span>
                  {activeTariff === 'Super' && (
                    <span className="flex items-center gap-2 font-bold">
                      <Check className="text-blue-500 shrink-0" size={20} /> {t('welcome.encryption')}
                    </span>
                  )}
                  <span className="flex items-center gap-2 font-bold text-center sm:text-left">
                    <Check className="text-blue-500 shrink-0" size={20} /> {t('welcome.locationsList')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 md:gap-6 max-w-[64rem] mx-auto mb-8 sm:mb-10">
                  {durations.map(({ key, labelKey }) => {
                    const { total, perMonth } = prices[key]
                    const is12 = key === 12
                    const pickTariff = () => {
                      if (newHero) goCabinet()
                      else onSetView('register')
                    }
                    return (
                      <div
                        key={key}
                        className={`relative bg-slate-900 p-4 sm:p-5 lg:p-6 rounded-xl sm:rounded-2xl shadow-xl transition-transform hover:scale-[1.02] flex flex-col min-w-0 ${is12 ? 'border-2 border-blue-500' : 'border border-slate-800'}`}
                      >
                        {is12 && (
                          <div className="absolute -top-2.5 sm:-top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-[10px] font-black px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full uppercase text-white tracking-widest shadow-lg" aria-hidden="true">
                            {t('welcome.discountBadge')}
                          </div>
                        )}
                        <h3 className="text-base sm:text-lg font-black text-white mb-2 mt-2">{t(labelKey)}</h3>
                        <div className="flex items-baseline gap-1 mb-3 sm:mb-4">
                          <span className="text-2xl sm:text-3xl font-black text-blue-500">{total}</span>
                          <span className="text-slate-500 font-bold">₽</span>
                        </div>
                        <p className="text-slate-400 text-sm font-medium mb-4 sm:mb-6">{t('welcome.perMonth', { value: perMonth })}</p>
                        <button
                          type="button"
                          onClick={pickTariff}
                          className={`mt-auto w-full min-h-[44px] py-3 sm:py-4 rounded-xl font-black text-white transition-all active:scale-[0.98] touch-manipulation ${is12 ? 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20' : 'bg-slate-800 hover:bg-slate-700'}`}
                        >
                          {t('common.select')}
                        </button>
                      </div>
                    )
                  })}
                </div>
                <p className="flex flex-wrap items-center justify-center gap-2 text-slate-400 font-bold text-center max-w-xl mx-auto text-sm sm:text-base px-2">
                  <Check className="text-blue-500 shrink-0" size={20} />
                  {t('welcome.discountNote')}
                </p>
              </>
            )}
          </div>
        </section>

        {/* Статистика: отзывы и пользователи */}
        <section className="container-responsive py-10 sm:py-14 md:py-16" aria-label={t('welcome.statsUsers')}>
          <div className="max-w-[64rem] mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-6 lg:p-8 text-center hover:border-blue-500/40 transition-all min-w-0">
                <div className="text-3xl sm:text-4xl lg:text-5xl font-black text-blue-500 mb-1 sm:mb-2">200+</div>
                <div className="text-slate-400 font-bold uppercase tracking-wider text-xs sm:text-sm">{t('welcome.statsUsers')}</div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-6 lg:p-8 text-center hover:border-blue-500/40 transition-all min-w-0">
                <div className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-1 sm:mb-2">{reviews.length}</div>
                <div className="text-slate-400 font-bold uppercase tracking-wider text-xs sm:text-sm">{t('welcome.statsReviews')}</div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-6 lg:p-8 text-center hover:border-blue-500/40 transition-all min-w-0">
                <div className="flex items-center justify-center gap-2 mb-1 sm:mb-2">
                  <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-amber-400">
                    {reviews.length > 0
                      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
                      : '5.0'}
                  </span>
                  <Star size={24} className="sm:w-8 sm:h-8 lg:w-[32px] lg:h-[32px] text-amber-400 fill-amber-400 flex-shrink-0" />
                </div>
                <div className="text-slate-400 font-bold uppercase tracking-wider text-xs sm:text-sm">{t('welcome.statsRating')}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Локации */}
        <section className="container-responsive bg-slate-900/30 py-12 sm:py-16 md:py-20 border-y border-slate-900" aria-label={t('welcome.presencePoints')}>
          <div className="max-w-[80rem] mx-auto text-center">
            <h2 className="text-[clamp(1.5rem,4vw,2.25rem)] lg:text-4xl font-black text-white mb-3 sm:mb-4 leading-none italic">{t('welcome.presencePoints')}</h2>
            <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto mb-8 sm:mb-12 font-medium leading-relaxed px-2">{t('welcome.presenceDesc')}</p>
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto list-none p-0 m-0">
              {['app.netherlands', 'app.russia', 'app.usa', 'app.sweden'].map((key) => (
                <li key={key} className="flex items-center justify-center min-h-[3.5rem] sm:min-h-[4.5rem] bg-slate-900/80 border border-slate-700/60 rounded-xl sm:rounded-2xl py-3 sm:py-4 px-3 sm:px-5 font-bold text-white text-sm sm:text-base shadow-sm hover:border-blue-500/30 transition-colors">
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Отзывы — карусель влево/вправо */}
        <section id="welcome-reviews" className="container-responsive py-12 sm:py-16 md:py-20 scroll-mt-24" aria-labelledby="welcome-reviews-heading">
          <div className="text-center mb-8 sm:mb-12">
            <h2 id="welcome-reviews-heading" className="text-[clamp(1.75rem,4vw,3rem)] lg:text-5xl font-black text-white mb-3 sm:mb-4 tracking-tighter">{t('welcome.reviewsSection')}</h2>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs sm:text-sm">{t('welcome.reviewsSubtitle')}</p>
          </div>
          {reviews.length > 0 ? (
            <div className="relative pl-2 sm:pl-0 pr-2 sm:pr-0">
              <button
                type="button"
                onClick={() => scrollReviews('left')}
                aria-label={t('welcome.reviewPrev')}
                className="absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-slate-800/90 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-700 hover:border-blue-500/50 active:scale-95 transition-all shadow-xl min-w-[2.75rem] min-h-[2.75rem] touch-manipulation"
              >
                <ChevronLeft size={22} className="sm:w-6 sm:h-6" />
              </button>
              <button
                type="button"
                onClick={() => scrollReviews('right')}
                aria-label={t('welcome.reviewNext')}
                className="absolute right-0 sm:right-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-slate-800/90 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-700 hover:border-blue-500/50 active:scale-95 transition-all shadow-xl min-w-[2.75rem] min-h-[2.75rem] touch-manipulation"
              >
                <ChevronRight size={22} className="sm:w-6 sm:h-6" />
              </button>
              <div
                ref={reviewsScrollRef}
                className="flex gap-4 sm:gap-6 lg:gap-8 overflow-x-auto overflow-y-hidden pb-4 scroll-smooth snap-x snap-mandatory scrollbar-hide -mx-2 sm:mx-0 px-2 sm:px-0"
                style={{ WebkitOverflowScrolling: 'touch' }}
                role="list"
              >
                {reviews.map((review) => {
                  const isExpanded = expandedReviewIds.has(review.id)
                  const isLong = review.text.length > REVIEW_EXPAND_THRESHOLD
                  return (
                    <article
                      key={review.id}
                      className="flex-shrink-0 w-[min(85vw,320px)] sm:w-[360px] lg:w-[380px] snap-start bg-slate-900/50 border border-slate-800 p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] flex flex-col hover:border-blue-500/40 transition-all min-w-0"
                      role="listitem"
                    >
                      <div className="flex items-center gap-1 mb-3 sm:mb-4" aria-label={t('welcome.ratingLabel', { rating: review.rating })}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} size={18} className={`sm:w-5 sm:h-5 flex-shrink-0 ${star <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />
                        ))}
                      </div>
                      <Quote size={20} className="text-blue-500/50 mb-2 sm:mb-3 flex-shrink-0 sm:w-6 sm:h-6" aria-hidden="true" />
                      <p
                        className={`text-slate-300 font-medium flex-1 leading-relaxed ${!isExpanded && isLong ? 'line-clamp-3' : ''}`}
                      >
                        {review.text}
                      </p>
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => toggleReviewExpanded(review.id)}
                          className="mt-2 text-left text-blue-400 hover:text-blue-300 text-sm font-semibold transition-colors py-1 -mb-1 touch-manipulation min-h-[44px] flex items-center"
                        >
                          {isExpanded ? t('common.collapse') : t('common.readMore')}
                        </button>
                      )}
                      <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pt-3 sm:pt-4 mt-auto border-t border-slate-800">
                        <span className="font-bold text-white">{review.author}</span>
                        {review.date && (
                          <time className="text-slate-500 text-sm font-medium" dateTime={new Date(review.date).toISOString().slice(0, 10)}>
                            {new Date(review.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </time>
                        )}
                      </footer>
                    </article>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-center py-16 text-slate-500 font-medium">{t('welcome.reviewsEmpty')}</p>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}
