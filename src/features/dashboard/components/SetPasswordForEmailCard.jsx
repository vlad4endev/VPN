import React, { useState } from 'react'
import { Lock, Loader2 } from 'lucide-react'

function SetPasswordForEmailCard({ onSetPassword, t }) {
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState(null)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setMessage(null)
        if (newPassword.length < 6) {
            setMessage({ type: 'error', text: t('dashboard.setPasswordMinLength', 'Пароль не короче 6 символов') })
            return
        }
        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: t('dashboard.setPasswordMismatch', 'Пароли не совпадают') })
            return
        }
        setLoading(true)
        try {
            const result = await onSetPassword(newPassword)
            if (result?.success) {
                setMessage({ type: 'success', text: t('dashboard.setPasswordSuccess', 'Пароль установлен. Теперь вы можете входить по email и паролю.') })
                setNewPassword('')
                setConfirmPassword('')
            } else {
                setMessage({ type: 'error', text: result?.error || t('dashboard.setPasswordError', 'Ошибка установки пароля') })
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-slate-800/50 rounded-lg sm:rounded-xl border border-slate-700 p-4 sm:p-5">
            <h3 className="text-slate-200 font-bold flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4" />
                {t('dashboard.setPasswordForEmailTitle', 'Вход по email и паролю')}
            </h3>
            <p className="text-slate-400 text-sm mb-4">
                {t('dashboard.setPasswordForEmailDesc', 'Установите пароль, чтобы входить по email и паролю (не только через Google).')}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                    <label htmlFor="set-password-new" className="block text-slate-300 text-sm font-bold mb-1">
                        {t('dashboard.setPasswordNew', 'Новый пароль')}
                    </label>
                    <input
                        id="set-password-new"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        minLength={6}
                        className="w-full min-h-[44px] px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={loading}
                    />
                </div>
                <div>
                    <label htmlFor="set-password-confirm" className="block text-slate-300 text-sm font-bold mb-1">
                        {t('dashboard.setPasswordConfirm', 'Повторите пароль')}
                    </label>
                    <input
                        id="set-password-confirm"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        minLength={6}
                        className="w-full min-h-[44px] px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={loading}
                    />
                </div>
                {message && (
                    <p className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                        {message.text}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={loading}
                    className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {t('dashboard.setPasswordSubmit', 'Установить пароль')}
                </button>
            </form>
        </div>
    )
}

export default SetPasswordForEmailCard
