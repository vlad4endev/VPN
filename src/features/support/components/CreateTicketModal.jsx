import { useState } from 'react'
import { X, Send } from 'lucide-react'

const CreateTicketModal = ({ onClose, onSubmit, sending }) => {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const s = subject.trim()
    const m = message.trim()
    if (s && m) {
      onSubmit(s, m).then((id) => {
        if (id) onClose()
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md bg-slate-800 rounded-xl border border-slate-700 shadow-xl my-4 sm:my-0">
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-700">
          <h2 className="text-base sm:text-lg font-semibold text-white">Новое обращение</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors flex items-center justify-center touch-manipulation"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Тема
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Кратко опишите вопрос"
              className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={200}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Сообщение
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Опишите проблему или вопрос подробнее"
              rows={4}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              maxLength={2000}
              required
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 sm:py-2 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors min-h-[44px] touch-manipulation"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={sending || !subject.trim() || !message.trim()}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] touch-manipulation"
            >
              {sending ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <Send size={18} />
              )}
              Создать обращение
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateTicketModal
