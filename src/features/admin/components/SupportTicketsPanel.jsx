import { MessageCircle } from 'lucide-react'
import { useSupport } from '../../support/hooks/useSupport.js'
import TicketList from '../../support/components/TicketList.jsx'
import TicketChat from '../../support/components/TicketChat.jsx'

/**
 * Панель тикетов поддержки в админ-панели.
 * Показывает все тикеты пользователей и позволяет отвечать от имени поддержки.
 */
const SupportTicketsPanel = ({ currentUser }) => {
  const {
    tickets,
    ticket,
    messages,
    selectedTicketId,
    loading,
    sending,
    error,
    isAdmin,
    sendMessage,
    updateStatus,
    selectTicket,
    setError,
  } = useSupport(currentUser)

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-700/50">
        <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
          <MessageCircle size={22} />
          Обращения пользователей
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Выберите тикет, чтобы ответить пользователю. Ответы отправляются от имени поддержки.
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-900/20 border border-red-800/50 rounded-lg text-red-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row min-h-[400px] lg:min-h-[500px]">
        {/* Список тикетов */}
        <div className="lg:w-80 xl:w-96 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-slate-700/50 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3 min-h-[200px] lg:min-h-0">
            <TicketList
              tickets={tickets}
              selectedTicketId={selectedTicketId}
              onSelectTicket={selectTicket}
              loading={loading}
              emptySubtext="Пока нет обращений от пользователей"
            />
          </div>
        </div>

        {/* Чат */}
        <div className="flex-1 flex flex-col min-h-[300px] lg:min-h-0">
          {selectedTicketId ? (
            <TicketChat
              ticket={ticket}
              messages={messages}
              onBack={() => selectTicket(null)}
              onSendMessage={sendMessage}
              onUpdateStatus={updateStatus}
              sending={sending}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <MessageCircle className="w-14 h-14 text-slate-600 mb-3" />
              <p className="text-slate-400">Выберите обращение слева</p>
              <p className="text-sm mt-1">Здесь отобразится переписка с пользователем</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SupportTicketsPanel
