import { useState } from 'react'
import { MessageCircle, PlusCircle } from 'lucide-react'
import Sidebar from '../../../shared/components/Sidebar.jsx'
import Footer from '../../../shared/components/Footer.jsx'
import { useSupport } from '../hooks/useSupport.js'
import TicketList from './TicketList.jsx'
import TicketChat from './TicketChat.jsx'
import CreateTicketModal from './CreateTicketModal.jsx'

const SupportView = ({
  currentUser,
  onSetView,
  onLogout,
  dashboardTab,
  onSetDashboardTab,
  adminTab,
  onSetAdminTab,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false)

  const {
    tickets,
    ticket,
    messages,
    selectedTicketId,
    loading,
    sending,
    error,
    isAdmin,
    loadTickets,
    createTicket,
    sendMessage,
    updateStatus,
    selectTicket,
    setError,
  } = useSupport(currentUser)

  const handleCreateTicket = async (subject, message) => {
    const id = await createTicket(subject, message)
    if (id) {
      setShowCreateModal(false)
      selectTicket(id)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col lg:flex-row">
      <Sidebar
        currentUser={currentUser}
        view="support"
        onSetView={onSetView}
        onLogout={onLogout}
        dashboardTab={dashboardTab}
        onSetDashboardTab={onSetDashboardTab}
        adminTab={adminTab}
        onSetAdminTab={onSetAdminTab}
      />

      <main className="flex-1 flex flex-col min-h-0 lg:min-h-screen pb-20 lg:pb-0 lg:pl-0">
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 p-4 lg:p-6 gap-4">
          {/* Список тикетов */}
          <section className="lg:w-80 xl:w-96 flex-shrink-0 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
              <h1 className="text-lg font-semibold text-white flex items-center gap-2">
                <MessageCircle size={22} />
                Тех. поддержка
              </h1>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm font-medium"
              >
                <PlusCircle size={18} />
                Новое обращение
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 min-h-0">
              <TicketList
                tickets={tickets}
                selectedTicketId={selectedTicketId}
                onSelectTicket={selectTicket}
                loading={loading}
              />
            </div>
          </section>

          {/* Чат или заглушка */}
          <section className="flex-1 flex flex-col min-h-0 bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            {error && (
              <div className="p-3 bg-red-900/20 border-b border-red-800/50 text-red-300 text-sm flex items-center justify-between">
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
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <MessageCircle className="w-16 h-16 text-slate-600 mb-4" />
                <h2 className="text-lg font-medium text-slate-400 mb-2">
                  Выберите обращение или создайте новое
                </h2>
                <p className="text-slate-500 text-sm max-w-sm">
                  Здесь отображается переписка с технической поддержкой. Ответы приходят в этот же тикет.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                >
                  <PlusCircle size={20} />
                  Создать обращение
                </button>
              </div>
            )}
          </section>
        </div>

        <Footer />
      </main>

      {showCreateModal && (
        <CreateTicketModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTicket}
          sending={sending}
        />
      )}
    </div>
  )
}

export default SupportView
