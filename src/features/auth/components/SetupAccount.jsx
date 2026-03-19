import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, query, updateDoc, where, deleteField } from 'firebase/firestore'
import logger from '../../../shared/utils/logger.js'
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'
import { authService } from '../services/authService.js'
import { validateEmail } from '../utils/validateEmail.js'
import { validatePassword } from '../utils/validatePassword.js'

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
    const seconds =
      typeof value?._seconds === 'number' ? value._seconds : typeof value?.seconds === 'number' ? value.seconds : null
    const nanoseconds =
      typeof value?._nanoseconds === 'number'
        ? value._nanoseconds
        : typeof value?.nanoseconds === 'number'
          ? value.nanoseconds
          : 0

    if (typeof seconds === 'number') {
      return seconds * 1000 + Math.floor(nanoseconds / 1e6)
    }
  }

  return null
}

function redirectToCabinet({ role }) {
  const targetPath = role === 'admin' ? '/admin' : '/dashboard'
  try {
    const url = new URL(window.location.href)
    url.pathname = targetPath
    url.searchParams.delete('token')
    const search = url.searchParams.toString()
    window.history.replaceState(null, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash || ''}`)
  } catch (_) {
    window.location.pathname = targetPath
  }
}

export default function SetupAccount({
  auth,
  db,
  appId,
  setCurrentUser,
  setView,
  setError
}) {
  const [token, setToken] = useState(null)
  const [tokenDoc, setTokenDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [error, setLocalError] = useState('')

  const [loginEmail, setLoginEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const safeError = useMemo(() => error || '', [error])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!auth || !db || !appId) return

      const t = tokenFromUrl()
      if (!t) {
        setLocalError('Ссылка недействительна')
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
          setLocalError('Ссылка недействительна')
          setLoading(false)
          return
        }

        // Берем первого совпавшего. (Если токены уникальны — это единственный результат.)
        const d = usersSnapshot.docs[0]
        const data = d.data() || {}
        const expiryMillis = toExpiryMillis(data.token_expiry)
        if (!expiryMillis || expiryMillis <= Date.now()) {
          setLocalError('Срок действия ссылки истек')
          setLoading(false)
          return
        }

        const matched = { id: d.id, ...data }
        setTokenDoc(matched)
        setLoginEmail(matched.email || '')
        setLoading(false)
      } catch (err) {
        logger.error('MagicLinkSetup', 'Ошибка загрузки token в SetupAccount', null, err)
        setLocalError('Ссылка недействительна')
        setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [auth, db, appId])

  useEffect(() => {
    if (!setError) return
    setError(error)
  }, [error, setError])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError('')

    if (!tokenDoc?.id || !token) {
      setLocalError('Ссылка недействительна')
      return
    }

    const tokenEmail = String(tokenDoc?.email || '').trim().toLowerCase()
    const emailTrim = tokenEmail || String(loginEmail || '').trim().toLowerCase()
    if (!emailTrim) {
      setLocalError('Введите email')
      return
    }

    const emailErr = validateEmail(emailTrim)
    if (emailErr) {
      setLocalError(emailErr)
      return
    }

    const pwErr = validatePassword(password, false)
    if (pwErr) {
      setLocalError(pwErr)
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Пароли не совпадают')
      return
    }

    setSubmitLoading(true)
    try {
      // В текущей системе пароль должен быть установлен в Firebase Auth на сервере.
      // Поэтому отправляем в API endpoint set-password-by-login (login берём из user doc).
      const login = String(tokenDoc.login || '').trim()
      if (!login) {
        throw new Error('В документе пользователя отсутствует поле login для установки пароля')
      }

      const res = await fetch(`${getApiBaseUrl()}/api/auth/set-password-by-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, newPassword: password })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка установки пароля')
      }

      // Обновляем документ в Firestore и делаем ссылку одноразовой.
      const userDocRef = doc(db, `artifacts/${appId}/public/data/users_v4`, tokenDoc.id)
      await updateDoc(userDocRef, {
        email: emailTrim,
        isRegistered: true,
        auth_token: deleteField(),
        token_expiry: deleteField(),
        updatedAt: new Date().toISOString()
      })

      // Авторизация после сохранения.
      const signInResult = await authService.signInWithEmail(emailTrim, password)
      if (signInResult?.userData) {
        setCurrentUser(signInResult.userData)
        setView(signInResult.userData.role === 'admin' ? 'admin' : 'dashboard')
        redirectToCabinet({ role: signInResult.userData.role })
      } else {
        setLocalError('Не удалось авторизовать пользователя после сохранения')
      }
    } catch (err) {
      logger.error('MagicLinkSetup', 'Ошибка сабмита SetupAccount', null, err)
      setLocalError(err?.message || 'Ошибка сохранения')
    } finally {
      setSubmitLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4" />
          <p className="text-slate-400 text-sm">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!tokenDoc) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex-1 flex flex-col bg-slate-950 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950 overflow-x-hidden">
        <div className="flex-1 flex items-center justify-center p-3 sm:p-4 lg:p-6">
          <div className="w-full max-w-md bg-slate-900/80 border border-slate-800/50 rounded-2xl sm:rounded-[3rem] p-5 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-xl mx-auto">
            <h2 className="text-[clamp(1.75rem,5vw,2.25rem)] sm:text-3xl font-black text-white mb-2 tracking-tight italic">
              Настройка аккаунта
            </h2>
            <p className="text-red-300 mt-4 font-medium">{safeError || 'Ссылка недействительна'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex-1 flex flex-col bg-slate-950 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950 overflow-x-hidden">
      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 lg:p-6">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800/50 rounded-2xl sm:rounded-[3rem] p-5 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-xl mx-auto">
          <div className="text-center mb-6 sm:mb-10">
            <h2 className="text-[clamp(1.75rem,5vw,2.25rem)] sm:text-3xl font-black text-white mb-2 tracking-tight italic">
              Настройка аккаунта
            </h2>
            <p className="text-slate-400 text-sm mt-3">Создайте пароль и завершите регистрацию</p>
          </div>

          {safeError ? (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-2xl text-red-300 text-sm font-medium">
              {safeError}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="setup-email"
                className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest"
              >
                Логин (Email)
              </label>
              <input
                id="setup-email"
                type="email"
                name="email"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base"
                placeholder="you@example.com"
                required
                disabled={submitLoading || !!tokenDoc?.email}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="setup-password"
                className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest"
              >
                Пароль
              </label>
              <input
                id="setup-password"
                type="password"
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base"
                placeholder="минимум 6 символов"
                required
                minLength={6}
                disabled={submitLoading}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="setup-password-confirm"
                className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest"
              >
                Подтверждение пароля
              </label>
              <input
                id="setup-password-confirm"
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base"
                placeholder="повторите пароль"
                required
                minLength={6}
                disabled={submitLoading}
              />
            </div>

            <button
              type="submit"
              disabled={submitLoading}
              className="w-full min-h-[48px] py-3 px-4 rounded-2xl sm:rounded-3xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base transition-all"
            >
              {submitLoading ? 'Сохранение...' : 'Завершить регистрацию'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

