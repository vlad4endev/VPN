import { useState, useEffect, useCallback, useRef } from 'react'
import { supportService } from '../services/supportService.js'
import { supportNotifyService } from '../services/supportNotifyService.js'
import { registerAndSubscribe } from '../services/pushSubscribeService.js'
import notificationService from '../../../shared/services/notificationService.js'
import { auth } from '../../../lib/firebase/config.js'
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
  const [ticketFilter, setTicketFilter] = useState('active') // 'all' | 'active' | 'archived'
  const lastNotifiedCountRef = useRef(0)
  const pushSubscribedRef = useRef(false)

  const isAdmin = canAccessAdmin(currentUser?.role)

  // Подписка на Web Push для уведомлений в фоне (вкладка закрыта). Один раз при открытии поддержки.
  useEffect(() => {
    if (!currentUser?.id || isAdmin || pushSubscribedRef.current) return
    if (typeof window === 'undefined' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const getToken = () => (auth?.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null))
    registerAndSubscribe(getToken).then((ok) => {
      if (ok) pushSubscribedRef.current = true
    })
  }, [currentUser?.id, isAdmin])

  const loadTickets = useCallback(async () => {
    if (!currentUser?.id) return
    setLoading(true)
    setError(null)
    try {
      const list = isAdmin
        ? await supportService.getAllTickets(ticketFilter)
        : await supportService.getTicketsByUser(currentUser.id, ticketFilter)
      setTickets(list)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить тикеты')
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id, isAdmin, ticketFilter])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  // Открыть тикет из URL ?ticket=ID или #support?ticket=ID (ссылка из Telegram или push)
  useEffect(() => {
    if (tickets.length === 0 || !currentUser?.id || typeof window === 'undefined') return
    let ticketId = new URLSearchParams(window.location.search).get('ticket')
    if (!ticketId && window.location.hash) {
      const hashPart = window.location.hash.split('?')[1]
      if (hashPart) ticketId = new URLSearchParams(hashPart).get('ticket')
    }
    if (ticketId && tickets.some((t) => t.id === ticketId)) {
      setSelectedTicketId(ticketId)
    }
  }, [tickets, currentUser?.id])

  // Сброс счётчика уведомлений при смене тикета
  useEffect(() => {
    lastNotifiedCountRef.current = 0
  }, [selectedTicketId])

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

  // Браузерный push при новом ответе поддержки; по клику открывается этот тикет
  useEffect(() => {
    if (isAdmin || !messages.length) return
    const last = messages[messages.length - 1]
    if (last.from !== 'support') return
    if (messages.length <= lastNotifiedCountRef.current) return
    lastNotifiedCountRef.current = messages.length
    const ns = notificationService.getInstance()
    if (ns.hasPermission()) {
      const ticketParam = selectedTicketId ? `?ticket=${encodeURIComponent(selectedTicketId)}` : ''
      ns.showNotification('Ответ поддержки', {
        body: (last.text || '').slice(0, 100) + (last.text && last.text.length > 100 ? '…' : ''),
        tag: 'support-reply-' + selectedTicketId,
        data: { url: `/#support${ticketParam}`, type: 'support-reply', ticketId: selectedTicketId },
      })
    }
  }, [messages, isAdmin, selectedTicketId])

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
        supportNotifyService.notifyNewTicket(
          id,
          currentUser.email,
          currentUser.name,
          subject,
          message
        )
        // Автоответ ИИ по первому сообщению в новом тикете
        supportNotifyService
          .triggerAutoReply(id, () =>
            auth?.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null)
          )
          .catch((err) => console.warn('useSupport:', err?.message))
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

  const createTicketAsAdmin = useCallback(
    async (targetUser, subject, message) => {
      if (!isAdmin || !currentUser?.id || !targetUser?.id) return null
      setSending(true)
      setError(null)
      try {
        const { id } = await supportService.createTicketAsAdmin(
          currentUser,
          targetUser,
          subject,
          message
        )
        supportNotifyService.notifySupportReply(
          targetUser.id,
          id,
          (subject || '').trim(),
          (message || '').trim()
        )
        await loadTickets()
        setSelectedTicketId(id)
        return id
      } catch (err) {
        setError(err.message || 'Не удалось открыть тикет')
        return null
      } finally {
        setSending(false)
      }
    },
    [currentUser, isAdmin, loadTickets]
  )

  const sendMessage = useCallback(
    async (text, ticketSnapshot) => {
      if (!selectedTicketId || !currentUser?.id) return
      setSending(true)
      setError(null)
      const fromSupport = isAdmin
      try {
        await supportService.addMessage(
          selectedTicketId,
          currentUser,
          text,
          fromSupport ? 'support' : 'user'
        )
        const t = ticketSnapshot || ticket
        if (t) {
          if (fromSupport) {
            supportNotifyService.notifySupportReply(
              t.userId,
              selectedTicketId,
              t.subject,
              text
            )
          } else {
            supportNotifyService.notifyNewMessageToAdmin(
              selectedTicketId,
              currentUser.email,
              currentUser.name,
              t.subject,
              text
            )
            // Автоответ ИИ: ИИ сам ответит в тикете или отправит админу уведомление о живой консультации
            supportNotifyService
              .triggerAutoReply(selectedTicketId, () =>
                auth?.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null)
              )
              .catch((err) => console.warn('useSupport:', err?.message))
          }
        }
      } catch (err) {
        setError(err.message || 'Не удалось отправить сообщение')
      } finally {
        setSending(false)
      }
    },
    [selectedTicketId, currentUser, isAdmin, ticket]
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
    ticketFilter,
    setTicketFilter,
    loadTickets,
    createTicket,
    createTicketAsAdmin,
    sendMessage,
    updateStatus,
    selectTicket,
    setError,
  }
}
