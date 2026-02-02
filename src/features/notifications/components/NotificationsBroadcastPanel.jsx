import React, { useState } from 'react'
import { Megaphone, Sparkles, Loader2, Send } from 'lucide-react'
import { notificationsService } from '../services/notificationsService.js'
import { NOTIFICATION_TYPES } from '../constants.js'

/**
 * Панель админа: рассылка уведомлений (всем или выбранным) и уведомление о новой функции с обзором.
 */
export default function NotificationsBroadcastPanel({ users = [], onSuccess, onError }) {
  const [type, setType] = useState(NOTIFICATION_TYPES.admin_broadcast)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [overview, setOverview] = useState('')
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState(null)

  const userIds = users.map((u) => u.id).filter(Boolean)
  const canSend = title.trim() && body.trim() && userIds.length > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSend || sending) return
    setSending(true)
    setSentCount(null)
    try {
      await notificationsService.broadcastViaApi(userIds, {
        type,
        title: title.trim(),
        body: body.trim(),
        overview: overview.trim() || null,
      })
      setSentCount(userIds.length)
      onSuccess?.(`Отправлено ${userIds.length} уведомлений`)
      setTitle('')
      setBody('')
      setOverview('')
    } catch (err) {
      onError?.(err.message || 'Ошибка рассылки')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 p-4 sm:p-6">
      <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
        <Megaphone size={20} />
        Рассылка уведомлений
      </h2>
      <p className="text-sm text-slate-400 mb-4">
        Уведомление будет отправлено всем пользователям ({userIds.length}).
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Тип</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value={NOTIFICATION_TYPES.admin_broadcast}
                checked={type === NOTIFICATION_TYPES.admin_broadcast}
                onChange={() => setType(NOTIFICATION_TYPES.admin_broadcast)}
                className="rounded border-slate-600 text-sky-500"
              />
              <Megaphone size={16} className="text-slate-400" />
              <span className="text-slate-300">Рассылка</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value={NOTIFICATION_TYPES.feature}
                checked={type === NOTIFICATION_TYPES.feature}
                onChange={() => setType(NOTIFICATION_TYPES.feature)}
                className="rounded border-slate-600 text-sky-500"
              />
              <Sparkles size={16} className="text-slate-400" />
              <span className="text-slate-300">Новая функция</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Заголовок</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Краткий заголовок"
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Текст</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Основной текст уведомления"
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-y"
          />
        </div>

        {type === NOTIFICATION_TYPES.feature && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Обзор (опционально)
            </label>
            <textarea
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Подробное описание новой функции. Поддерживается текст и переносы строк."
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-y"
            />
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!canSend || sending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {sending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Отправка…
              </>
            ) : (
              <>
                <Send size={18} />
                Отправить всем ({userIds.length})
              </>
            )}
          </button>
          {sentCount != null && (
            <span className="text-sm text-green-400">Отправлено: {sentCount}</span>
          )}
        </div>
      </form>
    </div>
  )
}
