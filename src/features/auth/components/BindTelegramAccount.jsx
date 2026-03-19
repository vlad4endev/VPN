import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { Mail, Lock, RotateCcw, ShieldCheck, KeyRound, Send } from 'lucide-react'
import logger from '../../../shared/utils/logger.js'
import { validateEmail } from '../utils/validateEmail.js'
import { validatePassword } from '../utils/validatePassword.js'
import { authService } from '../services/authService.js'

const WEBHOOK_URL = 'https://n8n.your-server.com/webhook/registration-confirm'

function tokenFromUrl() {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    return token ? String(token) : null
  } catch {
    return null
  }
}

function toExpiryMillis(value) {
  if (value === null || value === undefined) return null
  try {
    if (typeof value?.toMillis === 'function') return value.toMillis()
  } catch (_) {}

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    const asNum = Number(trimmed)
    if (!Number.isNaN(asNum) && Number.isFinite(asNum)) {
      return asNum < 1e12 ? asNum * 1000 : asNum
    }
    const d = new Date(trimmed)
    const ms = d.getTime()
    return Number.isNaN(ms) ? null : ms
  }

  if (typeof value === 'object') {
    const seconds = typeof value?._seconds === 'number' ? value._seconds : typeof value?.seconds === 'number' ? value.seconds : null
    const nanoseconds =
      typeof value?._nanoseconds === 'number'
        ? value._nanoseconds
        : typeof value?.nanoseconds === 'number'
          ? value.nanoseconds
          : 0
    if (typeof seconds === 'number') return seconds * 1000 + Math.floor(nanoseconds / 1e6)
  }

  return null
}

function cleanTokenFromUrlOnly() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    const search = url.searchParams.toString()
    const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash || ''}`
    window.history.replaceState(null, '', next)
  } catch (e) {
    logger.warn('BindTelegramAccount', 'Не удалось почистить URL от token', { message: e?.message })
  }
}

function redirectToAdmin() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    url.pathname = '/admin'
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  } catch (_) {
    window.location.pathname = '/admin'
  }
}

export default function BindTelegramAccount({ db, appId, setCurrentUser, setView, setError }) {
  const [loading, setLoading] = useState(true)
  const [submitLoading, setSubmitLoading] = useState(false)

  const [token, setToken] = useState(null)
  const [tokenDocId, setTokenDocId] = useState(null)
  const [profile, setProfile] = useState(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [localError, setLocalError] = useState('')

  const [toast, setToast] = useState(null)
  const toastApi = useMemo(
    () => ({
      show: ({ type, message }) => {
        const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`
        setToast({ id, type, message })
      },
      clear: () => setToast(null),
    }),
    []
  )

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!db || !appId) return
      const t = tokenFromUrl()
      if (!t) {
        setLocalError('Ссылка недействительна или срок действия истек')
        setLoading(false)
        return
      }

      setToken(t)
      try {
        const usersCollection = collection(db, `artifacts/${appId}/public/data/users_v4`)
        const q = query(usersCollection, where('auth_token', '==', t))
        const usersSnapshot = await getDocs(q)

        if (cancelled) return

        if (usersSnapshot.empty) {
          setLocalError('Ссылка недействительна или срок действия истек')
          setLoading(false)
          return
        }

        // По ТЗ предполагаем upsert по найденной записи.
        const d = usersSnapshot.docs[0]
        const data = d.data() || {}
        const expiryMillis = toExpiryMillis(data.token_expiry)
        if (!expiryMillis || expiryMillis <= Date.now()) {
          setLocalError('Ссылка недействительна или срок действия истек')
          setLoading(false)
          return
        }

        const tgId = data.tgId ?? data.telegramId ?? null
        setTokenDocId(d.id)
        setProfile({
          ...data,
          tgId,
          subscriptions: {
            // Сохраняем наиболее типовые поля подписок (если их нет — всё равно ок)
            subscriptionId: data.subscriptionId ?? null,
            plan: data.plan ?? null,
            paymentStatus: data.paymentStatus ?? null,
            tariffId: data.tariffId ?? null,
            tariffName: data.tariffName ?? null,
            expiresAt: data.expiresAt ?? null,
            uuid: data.uuid ?? null,
          },
        })
        setLoading(false)
      } catch (err) {
        logger.error('BindTelegramAccount', 'Ошибка поиска token в Firestore', null, err)
        setLocalError('Ссылка недействительна или срок действия истек')
        setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [db, appId])

  useEffect(() => {
    if (!setError) return
    if (localError) setError(localError)
  }, [localError, setError])

  const pwError = useMemo(() => {
    if (!password) return null
    if (password.length < 8) return 'Пароль должен быть не менее 8 символов'
    const baseError = validatePassword(password, false)
    return baseError
  }, [password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitLoading) return

    setToast(null)
    setLocalError('')

    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) {
      setLocalError('Введите email')
      return
    }
    const emailErr = validateEmail(normalizedEmail)
    if (emailErr) {
      setLocalError(emailErr)
      return
    }

    if (!password) {
      setLocalError('Введите пароль')
      return
    }
    if (pwError) {
      setLocalError(pwError)
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Пароли не совпадают')
      return
    }

    if (!tokenDocId || !profile) {
      setLocalError('Ссылка недействительна или срок действия истек')
      return
    }

    setSubmitLoading(true)
    try {
      // Проверка уникальности email (во избежание дублей)
      const usersCollection = collection(db, `artifacts/${appId}/public/data/users_v4`)
      const qEmail = query(usersCollection, where('email', '==', normalizedEmail))
      const emailSnap = await getDocs(qEmail)

      const conflict = emailSnap.docs.find((d) => d.id !== tokenDocId)
      if (conflict) {
        throw new Error('Этот email уже используется')
      }

      // Update existing doc (upsert без создания нового)
      const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, tokenDocId)

      // Важно: по ТЗ нужно сохранить serverId/expiryTime/tgId, поэтому обновляем только необходимые поля.
      await updateDoc(userDocRef, {
        email: normalizedEmail,
        isRegistered: true,
        auth_token: null,
        token_expiry: null,
        updatedAt: new Date().toISOString(),
      })

      // Оповещение n8n после успешной привязки
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tgId: profile.tgId ?? null,
          login: normalizedEmail,
          password,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Webhook error: ${res.status}`)
      }

      // Авторизация в системе после того, как сервер/н8n готовит пароль в auth-провайдере
      const signInResult = await authService.signInWithEmail(normalizedEmail, password)
      const userData = signInResult?.userData
      if (!userData) throw new Error('Не удалось авторизовать пользователя после привязки')

      setCurrentUser?.(userData)
      setView?.('admin')
      cleanTokenFromUrlOnly()
      redirectToAdmin()
    } catch (err) {
      const msg = err?.message || 'Ошибка привязки Telegram'
      toastApi.show({ type: 'error', message: msg })
      setLocalError(msg)
      setError?.(msg)
    } finally {
      setSubmitLoading(false)
    }
  }

  const errorText = localError || ''

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <motion.div
            className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"
            aria-label="Loading"
          />
          <p className="text-slate-400 text-sm">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex-1 flex flex-col bg-slate-950 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950 overflow-x-hidden">
      <AnimatePresence mode="wait">
        {toast ? (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22 }}
            className="fixed top-4 right-4 z-[9999] max-w-[420px]"
          >
            <div className="bg-red-900/70 border border-red-800 rounded-2xl px-4 py-3 text-red-100 text-sm font-medium shadow-lg backdrop-blur-xl">
              {toast.message}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 lg:p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full max-w-md bg-slate-900/80 border border-slate-800/50 rounded-[3rem] p-5 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-xl mx-auto"
        >
          <div className="text-center mb-6 sm:mb-10">
            <h2 className="text-[clamp(1.7rem,5vw,2.2rem)] sm:text-3xl font-black text-white mb-2 tracking-tight italic">
              Привязка Telegram
            </h2>
            <p className="text-slate-400 text-sm mt-3">Мы нашли вашу подписку! Придумайте логин и пароль для доступа через браузер</p>
          </div>

          {errorText ? (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-2xl text-red-300 text-sm font-medium">
              {errorText}
            </div>
          ) : null}

          {!profile ? (
            <div className="text-center text-slate-400 text-sm">
              <ShieldCheck className="w-6 h-6 mx-auto mb-3 text-slate-600" />
              {localError || 'Ссылка недействительна или срок действия истек'}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="bind-email" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Email (Логин)
                </label>
                <input
                  id="bind-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base"
                  placeholder="you@example.com"
                  required
                  disabled={submitLoading}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="bind-password" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Пароль
                </label>
                <input
                  id="bind-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base"
                  placeholder="минимум 8 символов"
                  required
                  minLength={8}
                  disabled={submitLoading}
                />
                {pwError ? <div className="text-red-300 text-xs mt-1">{pwError}</div> : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="bind-password-confirm" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest flex items-center gap-2">
                  <KeyRound className="w-4 h-4" /> Подтверждение пароля
                </label>
                <input
                  id="bind-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base"
                  placeholder="повторите пароль"
                  required
                  minLength={8}
                  disabled={submitLoading}
                />
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full min-h-[48px] py-3 px-4 rounded-2xl sm:rounded-3xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base transition-all shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {submitLoading ? (
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitLoading ? 'Привязываем...' : 'Привязать и войти'}
              </button>

              <div className="text-center text-slate-500 text-xs mt-1">
                Мы обновим профиль и сделаем ссылку недействительной.
              </div>
            </form>
          )}

          <div className="text-center mt-6">
            <button
              type="button"
              disabled={submitLoading}
              onClick={() => {
                setLocalError('')
                setError?.('')
                setView?.('login')
              }}
              className="text-slate-400 hover:text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Назад
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

