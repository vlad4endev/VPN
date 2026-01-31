import { useState, useEffect, useCallback } from 'react'
import { supportService } from '../services/supportService.js'
import { canAccessAdmin } from '../../../shared/constants/admin.js'

/**
 * Хук для работы с тикетами техподдержки.
 * @param {Object} currentUser - текущий пользователь { id, email, name, role }
 * @returns {Object} тикеты, выбранный тикет, сообщения, действия, загрузка, ошибки
 */
export function useSupport(currentUser) {
  const [tickets, setTickets] = useState([])
  const [selectedTicketId, setSelectedTicketId] = useState(null)
  const [ticket, setTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const isAdmin = canAccessAdmin(currentUser?.role)

  const loadTickets = useCallback(async () => {
    if (!currentUser?.id) return
    setLoading(true)
    setError(null)
    try {
      const list = isAdmin
        ? await supportService.getAllTickets()
        : await supportService.getTicketsByUser(currentUser.id)
      setTickets(list)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить тикеты')
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id, isAdmin])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  // Подписка на выбранный тикет в реальном времени
  useEffect(() => {
    if (!selectedTicketId || !currentUser?.id) {
      setTicket(null)
      setMessages([])
      return
    }

    const unsub = supportService.subscribeTicket(
      selectedTicketId,
      currentUser.id,
      isAdmin,
      (t, msgs) => {
        setTicket(t)
        setMessages(msgs || [])
      }
    )
    return () => unsub()
  }, [selectedTicketId, currentUser?.id, isAdmin])

  const createTicket = useCallback(
    async (subject, message) => {
      if (!currentUser?.id) return null
      setSending(true)
      setError(null)
      try {
        const { id } = await supportService.createTicket(
          currentUser,
          subject,
          message
        )
        await loadTickets()
        setSelectedTicketId(id)
        return id
      } catch (err) {
        setError(err.message || 'Не удалось создать тикет')
        return null
      } finally {
        setSending(false)
      }
    },
    [currentUser, loadTickets]
  )

  const sendMessage = useCallback(
    async (text) => {
      if (!selectedTicketId || !currentUser?.id) return
      setSending(true)
      setError(null)
      try {
        await supportService.addMessage(
          selectedTicketId,
          currentUser,
          text,
          isAdmin ? 'support' : 'user'
        )
      } catch (err) {
        setError(err.message || 'Не удалось отправить сообщение')
      } finally {
        setSending(false)
      }
    },
    [selectedTicketId, currentUser, isAdmin]
  )

  const updateStatus = useCallback(
    async (ticketId, status) => {
      if (!isAdmin || !ticketId) return
      setError(null)
      try {
        await supportService.updateTicketStatus(ticketId, status)
        await loadTickets()
        if (selectedTicketId === ticketId) {
          setTicket((prev) => (prev ? { ...prev, status } : null))
        }
      } catch (err) {
        setError(err.message || 'Не удалось обновить статус')
      }
    },
    [isAdmin, selectedTicketId, loadTickets]
  )

  const selectTicket = useCallback((id) => {
    setSelectedTicketId(id || null)
  }, [])

  return {
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
  }
}
