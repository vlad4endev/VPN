import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'
import Footer from '../../../shared/components/Footer.jsx'
import TelegramLoginWidget from './TelegramLoginWidget.jsx'
import PrivacyPolicyModal from '../../../shared/components/PrivacyPolicyModal.jsx'

/** Резервные подписи для экрана входа (если i18n вернёт ключ, напр. в Telegram WebView) */
const AUTH_FALLBACKS = {
  'auth.login': 'Вход',
  'auth.register': 'Регистрация',
  'auth.loginOrEmail': 'Логин или email',
  'auth.loginOrEmailPlaceholder': 'логин, email или ID',
  'auth.loginLabel': 'Логин',
  'auth.loginPlaceholder': 'уникальный логин',
  'auth.emailOptional': 'Email (необязательно)',
  'auth.emailPlaceholder': 'можно не указывать, вход по логину',
  'auth.name': 'Имя',
  'auth.namePlaceholder': 'Ваше имя',
  'auth.password': 'Пароль',
  'auth.submitLogin': 'Войти',
  'auth.submitRegister': 'Зарегистрироваться',
  'auth.forgotPassword': 'Забыли пароль?',
  'common.or': 'или',
}

/** Нормализованный ключ для сравнения (lowercase, точки как в ключах auth.xxx / common.xxx) */
function normalizeKey (s) {
  if (typeof s !== 'string') return ''
  return s.toLowerCase().trim()
}

/** Перевод с подстраховкой: в Telegram и на мобильных всегда fallback; иначе — если t() вернул ключ, подставляем русский */
function labelT (t, key, forceFallback) {
  if (forceFallback) return AUTH_FALLBACKS[key] ?? key
  const value = t(key)
  if (value == null || value === '') return AUTH_FALLBACKS[key] ?? key
  if (value === key) return AUTH_FALLBACKS[key] ?? key
  const v = normalizeKey(value)
  const k = normalizeKey(key)
  if (v === k) return AUTH_FALLBACKS[key] ?? key
  if (typeof value === 'string' && (value.includes('.') || /^[A-Z_\.]+$/.test(value)) && value.length < 80) return AUTH_FALLBACKS[key] ?? value
  return value
}

const LoginForm = ({
  authMode,
  loginData,
  error,
  success,
  onEmailChange,
  onLoginChange,
  onPasswordChange,
  onNameChange,
  onAuthModeLogin,
  onAuthModeRegister,
  onLogin,
  onRegister,
  onSetView,
  onForgotPassword,
  onTelegramSignIn,
  onTelegramWidgetAuth,
  onTelegramWidgetError,
  onGoogleSignIn,
  onGoogleSignInRedirect,
  googleSecondaryLabelKey = 'auth.googleRedirect',
  googleSignInLoading = false,
  telegramSignInLoading = false,
  isTelegramApp = false,
}) => {
  const { t } = useTranslation()
  const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768
  const forceFallbackLabels = isTelegramApp || isMobileView
  const [consentChecked, setConsentChecked] = useState(false)
  const [consentError, setConsentError] = useState('')
  const [consentExpanded, setConsentExpanded] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)

  const handleSubmit = (e) => {
    if (authMode === 'login') {
      onLogin(e)
      return
    }
    // Регистрация: проверяем согласие на обработку персональных данных
    if (!consentChecked) {
      e.preventDefault()
      setConsentError(t('auth.consentError'))
      return
    }
    setConsentError('')
    onRegister(e)
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex-1 flex flex-col bg-slate-950 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950 bg-responsive overflow-x-hidden" style={{ backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 lg:p-6">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800/50 rounded-2xl sm:rounded-[3rem] p-5 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-xl mx-auto">
      <div className="text-center mb-6 sm:mb-10">
        <h2 className="text-[clamp(1.75rem,5vw,2.25rem)] sm:text-4xl font-black text-white mb-2 tracking-tight italic">{authMode === 'login' ? labelT(t, 'auth.login', forceFallbackLabels) : labelT(t, 'auth.register', forceFallbackLabels)}</h2>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">SKYFLOW System</p>
        </div>

        {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-2xl text-red-300 text-sm font-medium">
            {error}
          </div>
        )}

        {success && (
        <div className="mb-4 p-4 bg-green-900/30 border border-green-800 rounded-2xl text-green-300 text-sm font-medium">
            {success}
          </div>
        )}

        <div className="flex gap-2 mb-5 sm:mb-6">
          <button
          onClick={onAuthModeLogin}
          className={`flex-1 min-h-[44px] py-3 px-3 sm:px-4 rounded-xl sm:rounded-2xl transition-all font-bold touch-manipulation ${
              authMode === 'login'
              ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('auth.login')}
          </button>
          <button
          onClick={onAuthModeRegister}
          className={`flex-1 min-h-[44px] py-3 px-3 sm:px-4 rounded-xl sm:rounded-2xl transition-all font-bold touch-manipulation ${
              authMode === 'register'
              ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {labelT(t, 'auth.register', forceFallbackLabels)}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          {authMode === 'login' ? (
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest">{labelT(t, 'auth.loginOrEmail', forceFallbackLabels)}</label>
              <input
                id="login-email"
                type="text"
                name="email"
                autoComplete="username"
                value={loginData.email}
                onChange={onEmailChange}
                className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base touch-manipulation"
                placeholder={labelT(t, 'auth.loginOrEmailPlaceholder', forceFallbackLabels)}
                required
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="register-login" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest">{labelT(t, 'auth.loginLabel', forceFallbackLabels)}</label>
                <input
                  id="register-login"
                  type="text"
                  name="login"
                  autoComplete="username"
                  value={loginData.login || ''}
                  onChange={onLoginChange}
                  className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base touch-manipulation"
                  placeholder={labelT(t, 'auth.loginPlaceholder', forceFallbackLabels)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="register-email" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest">{labelT(t, 'auth.emailOptional', forceFallbackLabels)}</label>
                <input
                  id="register-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={loginData.email}
                  onChange={onEmailChange}
                  className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base touch-manipulation"
                  placeholder={labelT(t, 'auth.emailPlaceholder', forceFallbackLabels)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="register-name" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest">{labelT(t, 'auth.name', forceFallbackLabels)}</label>
              <input
                key="register-name-input"
                id="register-name"
                type="text"
                name="name"
                autoComplete="name"
                value={loginData.name || ''}
                onChange={onNameChange}
                className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base touch-manipulation"
                placeholder={labelT(t, 'auth.namePlaceholder', forceFallbackLabels)}
                required
              />
              </div>
            </>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${authMode}-password`} className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest">{labelT(t, 'auth.password', forceFallbackLabels)}</label>
              {authMode === 'login' && onForgotPassword && (
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-xs font-semibold text-slate-400 hover:text-blue-400 transition-colors bg-transparent border-0 cursor-pointer p-0"
                >
                  {labelT(t, 'auth.forgotPassword', forceFallbackLabels)}
                </button>
              )}
            </div>
            <input
              id={`${authMode}-password`}
              type="password"
              name="password"
              autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
              value={loginData.password}
              onChange={onPasswordChange}
              className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base touch-manipulation"
              placeholder="••••••••"
              required
            />
          </div>

          {authMode === 'register' && (
            <div className="rounded-2xl bg-slate-950/50 border border-slate-800 text-left overflow-hidden">
              <button
                type="button"
                onClick={() => setConsentExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-slate-800/50 transition-colors min-h-[44px] touch-manipulation"
                aria-expanded={consentExpanded}
                aria-controls="consent-content"
                id="consent-toggle"
              >
                <span className="text-slate-200 font-semibold text-sm">{t('auth.consentTitle')}</span>
                {consentExpanded ? (
                  <ChevronUp className="w-5 h-5 flex-shrink-0 text-slate-400" aria-hidden />
                ) : (
                  <ChevronDown className="w-5 h-5 flex-shrink-0 text-slate-400" aria-hidden />
                )}
              </button>
              <div
                id="consent-content"
                role="region"
                aria-labelledby="consent-toggle"
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${consentExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="space-y-3 p-4 pt-0 border-t border-slate-800">
                    <p className="text-slate-400 text-[13px] leading-relaxed">
                      {t('auth.consentText')}{' '}
                      <strong className="text-slate-300">SKYFLOW</strong>
                    </p>
                    <ul className="list-disc list-inside text-slate-500 text-[13px] space-y-0.5 ml-1">
                      <li>{t('auth.consentList1')}</li>
                      <li>{t('auth.consentList2')}</li>
                      <li>{t('auth.consentList3')}</li>
                      <li>{t('auth.consentList4')}</li>
                    </ul>
                    <p className="text-slate-400 text-[13px] leading-relaxed mt-2">{t('auth.consentGoals')}</p>
                    <ul className="list-disc list-inside text-slate-500 text-[13px] space-y-0.5 ml-1">
                      <li>{t('auth.consentGoal1')}</li>
                      <li>{t('auth.consentGoal2')}</li>
                      <li>{t('auth.consentGoal3')}</li>
                      <li>{t('auth.consentGoal4')}</li>
                      <li>{t('auth.consentGoal5')}</li>
                    </ul>
                    <p className="text-slate-400 text-[13px] leading-relaxed mt-2">
                      {t('auth.consentConfirmIntro')}
                      <button
                        type="button"
                        onClick={() => setShowPrivacyModal(true)}
                        className="text-blue-400 hover:text-blue-300 underline focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded"
                      >
                        {t('auth.consentPrivacyLink')}
                      </button>
                      {' '}{t('auth.consentConfirm')}
                    </p>
                  </div>
                </div>
              </div>
              {consentError && (
                <p id="consent-error" className="px-4 pb-2 text-red-400 text-sm font-medium" role="alert">
                  {consentError}
                </p>
              )}
              <label className="flex items-start gap-3 p-4 pt-2 cursor-pointer group border-t border-slate-800">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => {
                    setConsentChecked(e.target.checked)
                    setConsentError('')
                  }}
                  className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500/50 focus:ring-2"
                  required={authMode === 'register'}
                  aria-describedby={consentError ? 'consent-error' : undefined}
                />
                <span className="text-slate-300 text-sm group-hover:text-slate-200">
                  {t('auth.consentCheckbox')}
                </span>
              </label>
            </div>
          )}

          <button
            type="submit"
            className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-500 py-4 sm:py-5 rounded-2xl sm:rounded-3xl font-black text-white text-lg sm:text-xl transition-all shadow-2xl shadow-blue-600/30 active:scale-[0.98] touch-manipulation"
          >
            {authMode === 'login' ? labelT(t, 'auth.submitLogin', forceFallbackLabels) : labelT(t, 'auth.submitRegister', forceFallbackLabels)}
          </button>
          </div>
        </form>

      {(onGoogleSignIn || onTelegramSignIn || onTelegramWidgetAuth) && (
      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-slate-900/80 text-slate-500 font-bold uppercase text-xs tracking-widest">{labelT(t, 'common.or', forceFallbackLabels)}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 sm:gap-3 items-center justify-center">
          {onGoogleSignIn && (
            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={googleSignInLoading}
              className="flex-1 min-h-[44px] py-2.5 px-3 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed text-gray-900 rounded-xl sm:rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 touch-manipulation"
              title={t('auth.signInGoogle')}
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="truncate">{googleSignInLoading ? (t('auth.googleSigningIn') || 'Вход…') : 'Google'}</span>
            </button>
          )}
          {onTelegramSignIn && (!(import.meta.env?.VITE_TELEGRAM_BOT_USERNAME || '').trim() || isTelegramApp) && (
            <button
              type="button"
              onClick={onTelegramSignIn}
              disabled={telegramSignInLoading}
              className="flex-1 min-h-[44px] py-2.5 px-3 bg-[#0088cc] hover:bg-[#0077b5] disabled:opacity-60 text-white rounded-xl sm:rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 touch-manipulation"
              title={authMode === 'login' ? t('auth.signInTelegram') : t('auth.registerTelegram')}
            >
              {telegramSignInLoading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Send size={18} className="flex-shrink-0" />
              )}
              <span className="truncate">{authMode === 'login' ? t('auth.signInTelegram') : t('auth.registerTelegram')}</span>
            </button>
          )}
          {!isTelegramApp && onTelegramWidgetAuth && (import.meta.env?.VITE_TELEGRAM_BOT_USERNAME || '').trim() && (
            <div className="flex flex-col items-center gap-1.5 w-full min-w-[180px]">
              <span className="text-xs text-slate-500">
                {authMode === 'login' ? t('auth.signInTelegram') : t('auth.registerTelegram')}
              </span>
              <TelegramLoginWidget onAuth={onTelegramWidgetAuth} onError={onTelegramWidgetError} />
            </div>
          )}
        </div>
        {onGoogleSignInRedirect && (
          <button
            type="button"
            onClick={onGoogleSignInRedirect}
            disabled={googleSignInLoading}
            className="w-full mt-2 text-slate-500 hover:text-sky-400 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {t(googleSecondaryLabelKey)}
          </button>
        )}
      </div>
      )}
        <button
          type="button"
          onClick={() => {
            if (typeof onSetView === 'function') {
              onSetView('welcome')
            }
            if (typeof window !== 'undefined' && (window.location.hash === '#login' || window.location.hash === '#register')) {
              window.history.replaceState(null, '', window.location.pathname || '/')
            }
          }}
          className="block w-full mt-8 text-slate-600 text-xs font-bold hover:text-blue-400 transition-colors hover:underline text-center bg-transparent border-0 cursor-pointer p-0"
        >
          {t('auth.backToHome')}
        </button>
        </div>
      </div>
      <div className="max-sm:hidden">
        <Footer />
      </div>
      <PrivacyPolicyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />
    </div>
  )
}

export default LoginForm
