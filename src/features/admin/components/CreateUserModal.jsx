import React, { useState, useCallback } from 'react'
import { X, Save, Mail, User, Phone, Shield, Send, AtSign } from 'lucide-react'
import { useAdminContext } from '../context/AdminContext.jsx'
import { USER_ROLE_OPTIONS } from '../../../shared/constants/admin.js'

const DEFAULT_ROLE = 'user'

const CreateUserModal = ({ onClose }) => {
  const { createUser } = useAdminContext()

  const [form, setForm] = useState({
    email: '',
    login: '',
    password: '',
    name: '',
    phone: '',
    role: DEFAULT_ROLE,
    tgId: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleChange = useCallback((e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (error) setError('')
  }, [error])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    setError('')

    const email = form.email.trim()
    const login = form.login.trim() || (email ? email.split('@')[0] : '')
    const name = form.name.trim()
    const password = form.password

    if (!login || !name || !password) {
      setError('Логин, имя и пароль обязательны. Email можно не указывать.')
      return
    }

    setIsSubmitting(true)
    try {
      await createUser({
        email: email || undefined,
        login,
        password,
        name,
        phone: form.phone.trim(),
        role: form.role || DEFAULT_ROLE,
        tgId: form.tgId.trim(),
      })
      if (onClose) onClose()
    } catch (err) {
      setError(err.message || 'Ошибка создания пользователя')
    } finally {
      setIsSubmitting(false)
    }
  }, [form, createUser, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-lg bg-slate-900 rounded-xl shadow-2xl border border-slate-800">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-200 flex items-center gap-2">
              <User className="w-5 h-5" />
              Создать пользователя
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Аккаунт будет создан в Firebase Auth и Firestore
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 bg-red-900/30 border border-red-800 rounded text-xs sm:text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <AtSign className="w-4 h-4" />
                Логин (обязателен, для входа)
              </label>
              <input
                type="text"
                name="login"
                value={form.login}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="уникальный логин"
                required
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <Mail className="w-4 h-4" />
                Email (необязательно)
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="если пусто — вход только по логину"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <User className="w-4 h-4" />
                Имя
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Имя пользователя"
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <Shield className="w-4 h-4" />
                Пароль
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Минимум 6 символов"
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <Phone className="w-4 h-4" />
                Телефон (опционально)
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+7..."
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <Shield className="w-4 h-4" />
                Роль
              </label>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {USER_ROLE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                <Send className="w-4 h-4" />
                Telegram ID (опционально)
              </label>
              <input
                type="text"
                name="tgId"
                value={form.tgId}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Числовой ID пользователя Telegram"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Используется для связи аккаунта с пользователем Telegram-бота.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-sm text-white rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-sm text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Создание...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Создать пользователя
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateUserModal

