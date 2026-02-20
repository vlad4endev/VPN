import { MessageCircle, ChevronRight, Clock, CheckCircle, XCircle } from 'lucide-react'
import { formatDate } from '../../../shared/utils/formatDate.js'

const statusConfig = {
  open: { label: 'Открыт', color: 'text-amber-400', icon: Clock },
  answered: { label: 'Ответ дан', color: 'text-blue-400', icon: CheckCircle },
  closed: { label: 'В архиве', color: 'text-slate-400', icon: XCircle },
}

const TicketList = ({ tickets, selectedTicketId, onSelectTicket, loading, emptySubtext }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (!tickets.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <MessageCircle className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-slate-400">Нет обращений</p>
        <p className="text-slate-500 text-sm mt-1">
          {emptySubtext || 'Создайте тикет, чтобы связаться с поддержкой'}
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-700/50">
      {tickets.map((t) => {
        const status = statusConfig[t.status] || statusConfig.open
        const Icon = status.icon
        const isSelected = t.id === selectedTicketId

        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelectTicket(t.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                isSelected
                  ? 'bg-blue-600/20 border border-blue-500/50'
                  : 'hover:bg-slate-800/80 border border-transparent'
              }`}
            >
              <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                <MessageCircle size={20} className="text-slate-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white truncate">{t.subject}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatDate(t.updatedAt)}
                  <span className={`ml-2 ${status.color}`}>
                    <Icon size={12} className="inline mr-0.5 align-middle" />
                    {status.label}
                  </span>
                </p>
              </div>
              <ChevronRight
                size={18}
                className={`flex-shrink-0 text-slate-500 ${isSelected ? 'text-blue-400' : ''}`}
              />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default TicketList
