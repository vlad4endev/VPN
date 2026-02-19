/**
 * Модуль для работы с Telegram Bot API
 * Отправка сообщений пользователям, привязка аккаунта по токену.
 *
 * Режим получения обновлений: только webhook. Polling (getUpdates) нигде не используется.
 * У бота может быть установлен только один webhook (ограничение Telegram API); setWebhook заменяет предыдущий URL.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

/**
 * Отправить ответ через Telegram API: POST https://api.telegram.org/bot<TOKEN>/sendMessage
 *
 * @param {string} botToken - токен бота (TELEGRAM_BOT_TOKEN)
 * @param {string} chatId - Telegram chat_id (числовой или строковый)
 * @param {string} text - текст сообщения
 * @param {{ parse_mode?: string, disable_web_page_preview?: boolean, reply_markup?: object }} [options]
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function sendTelegramMessage(botToken, chatId, text, options = {}) {
  if (!botToken || !chatId || !text) {
    return { ok: false, error: 'botToken, chatId и text обязательны' }
  }
  const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`
  const body = {
    chat_id: String(chatId).trim(),
    text: String(text),
    parse_mode: options.parse_mode || 'HTML',
    disable_web_page_preview: options.disable_web_page_preview !== false,
  }
  if (options.reply_markup) body.reply_markup = options.reply_markup
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      return { ok: false, error: data.description || res.statusText }
    }
    return { ok: true, result: data.result }
  } catch (err) {
    return { ok: false, error: err.message || 'Ошибка отправки в Telegram' }
  }
}

/**
 * Получить информацию о чате/пользователе по chat_id (getChat)
 * @param {string} botToken
 * @param {string} chatId - Telegram chat_id
 * @returns {Promise<{ ok: boolean, chat?: { id, type, title?, username?, first_name?, last_name? }, error?: string }>}
 */
export async function getTelegramChat(botToken, chatId) {
  if (!botToken || !chatId) return { ok: false, error: 'botToken и chatId обязательны' }
  const url = `${TELEGRAM_API_BASE}${botToken}/getChat`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(chatId).trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      return { ok: false, error: data.description || res.statusText }
    }
    const chat = data.result || {}
    return {
      ok: true,
      chat: {
        id: chat.id,
        type: chat.type || null,
        title: chat.title || null,
        username: chat.username || null,
        first_name: chat.first_name || null,
        last_name: chat.last_name || null,
      },
    }
  } catch (err) {
    return { ok: false, error: err.message || 'Ошибка запроса getChat' }
  }
}

/**
 * Получить информацию о боте (getMe)
 * @param {string} botToken
 * @returns {Promise<{ ok: boolean, username?: string, error?: string }>}
 */
export async function getTelegramBotInfo(botToken) {
  if (!botToken) return { ok: false, error: 'botToken обязателен' }
  const url = `${TELEGRAM_API_BASE}${botToken}/getMe`
  try {
    const res = await fetch(url)
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      return { ok: false, error: data.description || res.statusText }
    }
    return { ok: true, username: data.result?.username }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Установить webhook для бота (Telegram API setWebhook).
 * У бота может быть только один webhook; повторный вызов заменяет предыдущий URL.
 * Вызывать только из одного места (например POST /api/admin/telegram/set-webhook). Polling не используется.
 *
 * @param {string} botToken
 * @param {string} webhookUrl - полный URL, например https://your-domain.com/api/telegram/webhook
 * @param {{ secret_token?: string, allowed_updates?: string[] }} [opts]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function setTelegramWebhook(botToken, webhookUrl, opts = {}) {
  if (!botToken || !webhookUrl) {
    return { ok: false, error: 'botToken и webhookUrl обязательны' }
  }
  const url = `${TELEGRAM_API_BASE}${botToken}/setWebhook`
  const body = {
    url: webhookUrl.trim(),
    allowed_updates: opts.allowed_updates || ['message', 'callback_query'],
  }
  if (opts.secret_token) body.secret_token = opts.secret_token
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      return { ok: false, error: data.description || res.statusText }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || 'Ошибка установки webhook' }
  }
}

/**
 * Получить информацию о webhook (getWebhookInfo)
 * @param {string} botToken
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function getTelegramWebhookInfo(botToken) {
  if (!botToken) return { ok: false, error: 'botToken обязателен' }
  const url = `${TELEGRAM_API_BASE}${botToken}/getWebhookInfo`
  try {
    const res = await fetch(url)
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      return { ok: false, error: data.description || res.statusText }
    }
    return { ok: true, result: data.result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Ответ на callback_query (answerCallbackQuery) — убрать "часики" у кнопки, опционально показать уведомление.
 * @param {string} botToken
 * @param {string} callbackQueryId
 * @param {{ text?: string, show_alert?: boolean }} [opts]
 * @returns {Promise<{ ok?: boolean }>}
 */
export async function answerCallbackQuery(botToken, callbackQueryId, opts = {}) {
  if (!botToken || !callbackQueryId) return { ok: false }
  const url = `${TELEGRAM_API_BASE}${botToken}/answerCallbackQuery`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: opts.text,
        show_alert: opts.show_alert === true,
      }),
    })
    const data = await res.json().catch(() => ({}))
    return data.ok ? { ok: true } : { ok: false }
  } catch (_) {
    return { ok: false }
  }
}

/**
 * Редактировать текст сообщения (editMessageText).
 * @param {string} botToken
 * @param {string|number} chatId
 * @param {number} messageId
 * @param {string} text
 * @param {{ parse_mode?: string, reply_markup?: object }} [opts]
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function editMessageText(botToken, chatId, messageId, text, opts = {}) {
  if (!botToken || chatId == null || messageId == null || text == null) {
    return { ok: false, error: 'botToken, chatId, messageId и text обязательны' }
  }
  const url = `${TELEGRAM_API_BASE}${botToken}/editMessageText`
  const body = {
    chat_id: String(chatId),
    message_id: Number(messageId),
    text: String(text),
    parse_mode: opts.parse_mode || 'HTML',
  }
  if (opts.reply_markup) body.reply_markup = opts.reply_markup
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      return { ok: false, error: data.description || res.statusText }
    }
    return { ok: true, result: data.result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Ответ на webhook (ответ 200 OK для Telegram)
 * @param {object} res - express res
 */
export function answerWebhookOk(res) {
  res.status(200).send()
}
