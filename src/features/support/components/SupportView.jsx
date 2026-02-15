import { useState } from 'react'
import { MessageCircle, PlusCircle } from 'lucide-react'
import Sidebar from '../../../shared/components/Sidebar.jsx'
import Footer from '../../../shared/components/Footer.jsx'
import { useSupport } from '../hooks/useSupport.js'
import TicketList from './TicketList.jsx'
import TicketChat from './TicketChat.jsx'
import CreateTicketModal from './CreateTicketModal.jsx'
import notificationService from '../../../shared/services/notificationService.js'
import { registerAndSubscribe } from '../services/pushSubscribeService.js'
import { auth } from '../../../lib/firebase/config.js'

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
  const [pushPromptDismissed, setPushPromptDismissed] = useState(false)
  const [pushEnabling, setPushEnabling] = useState(false)

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

  const showPushPrompt = !isAdmin && currentUser?.id && typeof window !== 'undefined' &&
    Notification?.permission === 'default' && !pushPromptDismissed

  const handleEnablePush = async () => {
    setPushEnabling(true)
    try {
      const perm = await notificationService.requestPermission()
      if (perm === 'granted') {
        const getToken = () => (auth?.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null))
        await registerAndSubscribe(getToken)
      }
      setPushPromptDismissed(true)
    } finally {
      setPushEnabling(false)
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col lg:flex-row overflow-x-hidden">
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
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 p-3 sm:p-4 lg:p-6 gap-3 sm:gap-4 min-w-0">
          {/* Список тикетов */}
          <section className="lg:w-80 xl:w-96 flex-shrink-0 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden min-w-0">
            {showPushPrompt && (
              <div className="p-3 border-b border-slate-700/50 bg-blue-900/20 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-slate-300 text-xs flex-1 min-w-0">Уведомления о ответах даже при закрытой вкладке</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={handleEnablePush} disabled={pushEnabling} className="px-2 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50">
                    {pushEnabling ? '…' : 'Включить'}
                  </button>
                  <button type="button" onClick={() => setPushPromptDismissed(true)} className="p-1 rounded text-slate-500 hover:bg-slate-700" aria-label="Закрыть">×</button>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-4 border-b border-slate-700/50">
              <h1 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                <MessageCircle size={20} className="sm:w-[22px] sm:h-[22px] flex-shrink-0" />
                Тех. поддержка
              </h1>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-600 transition-colors text-sm font-medium min-h-[44px] touch-manipulation w-full sm:w-auto"
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
                onSendMessage={(text) => sendMessage(text, ticket)}
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
