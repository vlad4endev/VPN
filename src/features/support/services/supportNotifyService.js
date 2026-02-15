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
}
