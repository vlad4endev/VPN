import { useState } from 'react'
import { validatePassword } from '../utils/validatePassword.js'

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ? import.meta.env.VITE_API_BASE_URL : ''

export default function SetPasswordPage({ onSetView }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const loginTrim = login.trim().toLowerCase()
    if (!loginTrim) {
      setError('Введите логин')
      return
    }
    const passwordError = validatePassword(password, false)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/set-password-by-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginTrim, newPassword: password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Ошибка установки пароля')
        return
      }
      setSuccess('Пароль успешно создан. Теперь вы можете войти.')
      setPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        onSetView('login')
      }, 2000)
    } catch (err) {
      setError(err.message || 'Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex-1 flex flex-col bg-slate-950 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950 overflow-x-hidden">
      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 lg:p-6">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800/50 rounded-2xl sm:rounded-[3rem] p-5 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-xl mx-auto">
          <div className="text-center mb-6 sm:mb-10">
            <h2 className="text-[clamp(1.75rem,5vw,2.25rem)] sm:text-4xl font-black text-white mb-2 tracking-tight italic">Создание пароля</h2>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">SKYFLOW System</p>
            <p className="text-slate-400 text-sm mt-3">Введите ваш логин и задайте пароль для входа</p>
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

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="set-password-login" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest">Логин</label>
              <input
                id="set-password-login"
                type="text"
                name="login"
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base"
                placeholder="ваш логин в системе"
                required
                disabled={!!success}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="set-password-new" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest">Новый пароль</label>
              <input
                id="set-password-new"
                type="password"
                name="newPassword"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base"
                placeholder="не менее 6 символов"
                required
                minLength={6}
                disabled={!!success}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="set-password-confirm" className="text-xs font-black text-slate-500 ml-1 sm:ml-2 uppercase tracking-widest">Повторите пароль</label>
              <input
                id="set-password-confirm"
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full min-h-[44px] bg-slate-950/50 border border-slate-800 p-4 sm:p-5 rounded-2xl sm:rounded-3xl outline-none focus:ring-2 focus:ring-blue-500/50 text-white transition-all text-base"
                placeholder="повторите пароль"
                required
                minLength={6}
                disabled={!!success}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full min-h-[48px] py-3 px-4 rounded-2xl sm:rounded-3xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base transition-all"
            >
              {loading ? 'Сохранение...' : success ? 'Переход к входу...' : 'Создать пароль'}
            </button>
          </form>

          <p className="text-center mt-6">
            <button
              type="button"
              onClick={() => onSetView('login')}
              className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
            >
              ← Вернуться к входу
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
