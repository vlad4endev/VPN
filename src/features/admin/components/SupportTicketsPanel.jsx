import { useState, useCallback } from 'react'
import { MessageCircle, PlusCircle, X, Bot, Loader2 } from 'lucide-react'
import { useSupport } from '../../support/hooks/useSupport.js'
import TicketList from '../../support/components/TicketList.jsx'
import TicketChat from '../../support/components/TicketChat.jsx'
import { getSupportSuggestReply } from '../services/aiAdminService.js'

/**
 * Панель тикетов поддержки в админ-панели.
 * Показывает все тикеты пользователей, позволяет отвечать и открывать тикет пользователю.
 */
const SupportTicketsPanel = ({ currentUser, users = [], loadUsers }) => {
  const {
    tickets,
    ticket,
    messages,
    selectedTicketId,
    loading,
    sending,
    error,
    isAdmin,
    ticketFilter,
    setTicketFilter,
    sendMessage,
    updateStatus,
    selectTicket,
    setError,
    createTicketAsAdmin,
  } = useSupport(currentUser)

  const [showOpenTicketModal, setShowOpenTicketModal] = useState(false)
  const [openTicketUserId, setOpenTicketUserId] = useState('')
  const [openTicketSubject, setOpenTicketSubject] = useState('')
  const [openTicketMessage, setOpenTicketMessage] = useState('')
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)
  const [aiSuggestError, setAiSuggestError] = useState(null)
  const [suggestedReply, setSuggestedReply] = useState(null)
  const [suggestedUserWarning, setSuggestedUserWarning] = useState(null)

  const handleOpenTicketModalOpen = () => {
    if (users.length === 0 && typeof loadUsers === 'function') loadUsers()
    setShowOpenTicketModal(true)
  }

  const handleOpenTicketSubmit = async (e) => {
    e.preventDefault()
    const targetUser = users.find((u) => u.id === openTicketUserId)
    if (!targetUser) {
      setError('Выберите пользователя')
      return
    }
    const id = await createTicketAsAdmin(targetUser, openTicketSubject.trim(), openTicketMessage.trim())
    if (id) {
      setShowOpenTicketModal(false)
      setOpenTicketUserId('')
      setOpenTicketSubject('')
      setOpenTicketMessage('')
    }
  }

  const handleCloseOpenTicketModal = () => {
    setShowOpenTicketModal(false)
    setOpenTicketUserId('')
    setOpenTicketSubject('')
    setOpenTicketMessage('')
    setError(null)
  }

  const handleAiSuggest = useCallback(async () => {
    if (!ticket?.id) return
    setAiSuggestError(null)
    setSuggestedReply(null)
    setSuggestedUserWarning(null)
    setAiSuggestLoading(true)
    try {
      const result = await getSupportSuggestReply(ticket.id)
      if (result.success && result.reply != null) {
        setSuggestedReply(result.reply)
        if (result.escalate && result.userWarning) {
          setSuggestedUserWarning(result.userWarning)
        }
        if (result.escalate) {
          setError(null)
        }
      } else {
        setAiSuggestError(result.error || 'Не удалось получить ответ ИИ')
      }
    } catch (err) {
      setAiSuggestError(err.message || 'Ошибка запроса к ИИ')
    } finally {
      setAiSuggestLoading(false)
    }
  }, [ticket?.id])

  const clearSuggestedReply = useCallback(() => {
    setSuggestedReply(null)
    setSuggestedUserWarning(null)
  }, [])

  return (
    <div className="bg-slate-900 rounded-lg sm:rounded-xl shadow-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-700/50 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <MessageCircle size={22} />
            Обращения пользователей
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Выберите тикет или откройте новый для отправки сообщения пользователю.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleOpenTicketModalOpen}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            <PlusCircle className="w-4 h-4" />
            Открыть тикет пользователю
          </button>
        )}
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
          <div className="flex items-center gap-1 p-2 border-b border-slate-700/50 flex-shrink-0">
            {[
              { value: 'active', label: 'Активные' },
              { value: 'archived', label: 'Архив' },
              { value: 'all', label: 'Все' },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTicketFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  ticketFilter === value ? 'bg-blue-600 text-white' : 'bg-slate-700/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3 min-h-[200px] lg:min-h-0">
            <TicketList
              tickets={tickets}
              selectedTicketId={selectedTicketId}
              onSelectTicket={selectTicket}
              loading={loading}
              emptySubtext={ticketFilter === 'archived' ? 'Нет тикетов в архиве' : ticketFilter === 'active' ? 'Нет активных обращений' : 'Пока нет обращений'}
            />
          </div>
        </div>

        {/* Чат */}
        <div className="flex-1 flex flex-col min-h-[300px] lg:min-h-0">
          {selectedTicketId ? (
            <>
              {aiSuggestError && (
                <div className="mx-4 mt-2 p-2 bg-red-900/20 border border-red-800/50 rounded-lg text-red-300 text-sm flex items-center justify-between">
                  <span>{aiSuggestError}</span>
                  <button type="button" onClick={() => setAiSuggestError(null)} className="text-red-400 hover:text-red-300" aria-label="Закрыть">×</button>
                </div>
              )}
              <TicketChat
                ticket={ticket}
                messages={messages}
                onBack={() => selectTicket(null)}
                onSendMessage={(text) => sendMessage(text, ticket)}
                onUpdateStatus={updateStatus}
                sending={sending}
                isAdmin={isAdmin}
                suggestedReply={suggestedReply}
                suggestedUserWarning={suggestedUserWarning}
                onSuggestedReplyApplied={clearSuggestedReply}
              />
              {isAdmin && ticket?.status !== 'closed' && (
                <div className="px-3 pb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAiSuggest}
                    disabled={aiSuggestLoading}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium disabled:opacity-50"
                    title="ИИ проанализирует вопрос и данные пользователя, предложит ответ. При признаках проблемы — передаст обращение специалисту."
                  >
                    {aiSuggestLoading ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
                    Ответ ИИ
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <MessageCircle className="w-14 h-14 text-slate-600 mb-3" />
              <p className="text-slate-400">Выберите обращение слева</p>
              <p className="text-sm mt-1">Здесь отобразится переписка с пользователем</p>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно: открыть тикет пользователю */}
      {showOpenTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => handleCloseOpenTicketModal()}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-200">Открыть тикет пользователю</h3>
              <button type="button" onClick={handleCloseOpenTicketModal} className="p-1 rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200" aria-label="Закрыть">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleOpenTicketSubmit} className="p-4 space-y-4">
              {users.length === 0 ? (
                <p className="text-slate-400 text-sm py-2">Загрузка списка пользователей… Откройте вкладку «Пользователи» и нажмите «Обновить», если список пуст.</p>
              ) : null}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Пользователь</label>
                <select
                  value={openTicketUserId}
                  onChange={(e) => setOpenTicketUserId(e.target.value)}
                  required
                  disabled={users.length === 0}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">— Выберите —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email || u.name || u.id} {u.name && u.email ? `(${u.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Тема</label>
                <input
                  type="text"
                  value={openTicketSubject}
                  onChange={(e) => setOpenTicketSubject(e.target.value)}
                  placeholder="Тема обращения"
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Сообщение</label>
                <textarea
                  value={openTicketMessage}
                  onChange={(e) => setOpenTicketMessage(e.target.value)}
                  placeholder="Текст сообщения пользователю"
                  required
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={handleCloseOpenTicketModal} className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm">
                  Отмена
                </button>
                <button type="submit" disabled={sending} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium">
                  {sending ? '…' : 'Открыть тикет и отправить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default SupportTicketsPanel
