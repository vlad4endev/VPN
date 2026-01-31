import { useState, useRef, useEffect } from 'react'
import { Send, ArrowLeft, Loader2, User, Headphones } from 'lucide-react'
import { formatDate } from '../../../shared/utils/formatDate.js'

const TicketChat = ({
  ticket,
  messages,
  onBack,
  onSendMessage,
  onUpdateStatus,
  sending,
  isAdmin,
}) => {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    onSendMessage(text)
    setInput('')
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <p>Тикет не найден</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 inline-flex items-center gap-2 text-blue-400 hover:text-blue-300"
        >
          <ArrowLeft size={18} /> Назад к списку
        </button>
      </div>
    )
  }

  const statusLabels = { open: 'Открыт', answered: 'Ответ дан', closed: 'Закрыт' }
  const canReply = ticket.status !== 'closed'

  return (
    <div className="flex flex-col h-full">
      {/* Шапка */}
      <div className="flex items-center gap-3 p-3 border-b border-slate-700/50 flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-white truncate">{ticket.subject}</h2>
          <p className="text-xs text-slate-400">
            {ticket.userName || ticket.userEmail}
            {isAdmin && ticket.userEmail && ` · ${ticket.userEmail}`}
            {' · '}
            {statusLabels[ticket.status] || ticket.status}
          </p>
        </div>
        {isAdmin && canReply && (
          <select
            value={ticket.status}
            onChange={(e) => onUpdateStatus(ticket.id, e.target.value)}
            className="text-sm rounded-lg bg-slate-700 border border-slate-600 text-slate-200 px-2 py-1.5"
          >
            <option value="open">Открыт</option>
            <option value="answered">Ответ дан</option>
            <option value="closed">Закрыт</option>
          </select>
        )}
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((msg) => {
          const isSupport = msg.from === 'support'
          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isSupport ? 'flex-row-reverse' : ''}`}
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                {isSupport ? (
                  <Headphones size={16} className="text-blue-400" />
                ) : (
                  <User size={16} className="text-slate-400" />
                )}
              </span>
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2 ${
                  isSupport
                    ? 'bg-blue-600/30 text-white'
                    : 'bg-slate-700 text-slate-200'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                <p className="text-xs opacity-70 mt-1">
                  {formatDate(msg.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      {canReply && (
        <form
          onSubmit={handleSubmit}
          className="p-3 border-t border-slate-700/50 flex-shrink-0 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Написать сообщение..."
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="p-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Отправить"
          >
            {sending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </form>
      )}

      {ticket.status === 'closed' && (
        <div className="p-3 border-t border-slate-700/50 text-center text-slate-500 text-sm">
          Обращение закрыто. Создайте новое, если вопрос остался.
        </div>
      )}
    </div>
  )
}

export default TicketChat
