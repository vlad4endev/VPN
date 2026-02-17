/**
 * Уведомления по тикетам поддержки:
 * - админу в Telegram (новый тикет, новое сообщение от пользователя);
 * - пользователю в Telegram и браузерный push (ответ поддержки).
 */
function getApiBase() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
    ? import.meta.env.VITE_API_BASE_URL
    : ''
}

async function postNotifySupportTicket(payload) {
  const base = getApiBase()
  try {
    const res = await fetch(`${base}/api/notify/support-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.warn('[SupportNotify] support-ticket:', data.error || res.statusText)
    }
    return { ok: res.ok, data }
  } catch (err) {
    console.warn('[SupportNotify] support-ticket:', err.message)
    return { ok: false, error: err.message }
  }
}

async function postNotifySupportReply(payload) {
  const base = getApiBase()
  try {
    const res = await fetch(`${base}/api/notify/support-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.warn('[SupportNotify] support-reply:', data.error || res.statusText)
    }
    return { ok: res.ok, data: data || {} }
  } catch (err) {
    console.warn('[SupportNotify] support-reply:', err.message)
    return { ok: false, error: err.message }
  }
}

export const supportNotifyService = {
  /** Уведомить админа о новом тикете (вызывать после успешного createTicket). */
  notifyNewTicket(ticketId, userEmail, userName, subject, text) {
    return postNotifySupportTicket({
      type: 'new_ticket',
      ticketId,
      userEmail: userEmail || '',
      userName: userName || '',
      subject: subject || '',
      text: (text || '').slice(0, 300),
    })
  },

  /** Уведомить админа о новом сообщении от пользователя в тикете. */
  notifyNewMessageToAdmin(ticketId, userEmail, userName, subject, text) {
    return postNotifySupportTicket({
      type: 'new_message_user',
      ticketId,
      userEmail: userEmail || '',
      userName: userName || '',
      subject: subject || '',
      text: (text || '').slice(0, 300),
    })
  },

  /** Уведомить пользователя об ответе поддержки (Telegram по tgId). Возвращает Promise<{ ok, data?: { sent?, reason? } }>. */
  notifySupportReply(userId, ticketId, subject, text) {
    return postNotifySupportReply({
      userId,
      ticketId: ticketId || '',
      subject: subject || '',
      text: (text || '').slice(0, 500),
    })
  },

  /**
   * Запустить автоматический ответ ИИ по тикету (после нового сообщения пользователя).
   * Вызывается без await — ответ ИИ придёт в тикет по подписке в реальном времени.
   * @param {string} ticketId
   * @param {() => Promise<string|null>} getToken — например () => auth.currentUser?.getIdToken() ?? Promise.resolve(null)
   * @returns {Promise<{ ok: boolean, replied?: boolean, reason?: string }>}
   */
  async triggerAutoReply(ticketId, getToken) {
    const base = getApiBase()
    if (!ticketId) return { ok: false }
    const token = typeof getToken === 'function' ? await getToken() : null
    if (!token) return { ok: false }
    try {
      const res = await fetch(`${base}/api/ai/support-auto-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.warn('[SupportNotify] support-auto-reply:', data.error || res.statusText)
        return { ok: false }
      }
      return { ok: true, replied: data.replied, reason: data.reason }
    } catch (err) {
      console.warn('[SupportNotify] support-auto-reply:', err.message)
      return { ok: false }
    }
  },
}
