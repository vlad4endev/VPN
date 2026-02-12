/**
 * Модуль для работы с Telegram Bot API
 * Отправка сообщений пользователям, привязка аккаунта по токену
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

/**
 * Отправить сообщение пользователю по Telegram ID
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
 * Установить webhook для бота (Telegram API setWebhook)
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
 * Ответ на callback_query (answerCallbackQuery) — чтобы убрать "часики" у кнопки
 * @param {string} botToken
 * @param {string} callbackQueryId
 * @param {{ text?: string, show_alert?: boolean }} [opts]
 */
export async function answerCallbackQuery(botToken, callbackQueryId, opts = {}) {
  if (!botToken || !callbackQueryId) return
  const url = `${TELEGRAM_API_BASE}${botToken}/answerCallbackQuery`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: opts.text,
        show_alert: opts.show_alert === true,
      }),
    })
  } catch (_) {}
}

/**
 * Ответ на webhook (ответ 200 OK для Telegram)
 * @param {object} res - express res
 */
export function answerWebhookOk(res) {
  res.status(200).send()
}
