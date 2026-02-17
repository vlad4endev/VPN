/**
 * Сервис отправки сообщений в Telegram API с retry и таймаутом.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {string} botToken
 * @param {string} method - sendMessage, answerCallbackQuery, etc.
 * @param {object} body - тело запроса
 * @param {{ timeoutMs?: number, retryAttempts?: number, retryDelayMs?: number }} opts
 */
export async function callTelegramApi(botToken, method, body, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10000
  const retryAttempts = opts.retryAttempts ?? 3
  const retryDelayMs = opts.retryDelayMs ?? 500

  const url = `${TELEGRAM_API_BASE}${botToken}/${method}`
  let lastError
  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const data = await res.json().catch(() => ({}))
      if (!data.ok) {
        const err = new Error(data.description || res.statusText || 'Telegram API error')
        err.statusCode = res.status
        err.response = data
        throw err
      }
      return data
    } catch (err) {
      lastError = err
      const isRetryable = err.name === 'AbortError' || (err.statusCode >= 500 && err.statusCode < 600) || err.message?.includes('ECONNRESET')
      if (attempt < retryAttempts && isRetryable) {
        await sleep(retryDelayMs * attempt)
      } else {
        throw err
      }
    }
  }
  throw lastError
}

/**
 * Отправка сообщения пользователю (abstraction layer).
 * @param {string} botToken
 * @param {string|number} chatId
 * @param {string} text
 * @param {{ parse_mode?: string, reply_markup?: object, disable_web_page_preview?: boolean }} options
 * @param {object} apiOpts - timeoutMs, retryAttempts, retryDelayMs
 */
export async function sendMessage(botToken, chatId, text, options = {}, apiOpts = {}) {
  const body = {
    chat_id: String(chatId),
    text: String(text),
    parse_mode: options.parse_mode || 'HTML',
    disable_web_page_preview: options.disable_web_page_preview !== false,
  }
  if (options.reply_markup) body.reply_markup = options.reply_markup
  const result = await callTelegramApi(botToken, 'sendMessage', body, apiOpts)
  return result
}

/**
 * Ответ на callback_query (убирает "часики" у кнопки).
 */
export async function answerCallbackQuery(botToken, callbackQueryId, options = {}) {
  return callTelegramApi(botToken, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: options.text,
    show_alert: options.show_alert === true,
  }, options.apiOpts)
}
