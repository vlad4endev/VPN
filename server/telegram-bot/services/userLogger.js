/**
 * Логирование действий пользователей (user_id, username, тип события, текст, timestamp).
 * По умолчанию — в консоль. Опционально — в БД (реализацию можно добавить через адаптер).
 */

export function createUserLogger(options = {}) {
  const { enabled = true, persist = null } = options

  function normalizePayload(update) {
    const msg = update.message || update.edited_message
    const from = msg?.from || update.callback_query?.from
    const chatId = msg?.chat?.id ?? update.callback_query?.message?.chat?.id
    let eventType = 'unknown'
    let text = ''
    if (update.callback_query) {
      eventType = 'callback_query'
      text = update.callback_query.data || ''
    } else if (update.edited_message) {
      eventType = 'edited_message'
      text = (update.edited_message.text || update.edited_message.caption || '').trim()
    } else if (update.message) {
      eventType = 'message'
      text = (update.message.text || update.message.caption || '').trim()
      if (update.message.photo?.length) eventType = 'message_photo'
      if (update.message.document) eventType = 'message_document'
    }
    return {
      update_id: update.update_id,
      user_id: from?.id ?? null,
      username: from?.username ?? null,
      first_name: from?.first_name ?? null,
      chat_id: chatId ?? null,
      event_type: eventType,
      text: text.slice(0, 500),
      timestamp: new Date().toISOString(),
    }
  }

  return {
    log(update) {
      if (!enabled || !update) return
      const payload = normalizePayload(update)
      if (process.env.NODE_ENV !== 'production') {
        console.log('[TelegramBot] User event', payload)
      }
      if (typeof persist === 'function') {
        persist(payload).catch((err) => console.error('[TelegramBot] User log persist error', err.message))
      }
    },
  }
}
