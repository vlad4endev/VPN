/**
 * Отправка уведомлений пользователю через Telegram Bot API (например о входе с нового устройства).
 * Использует только fetch, без node-telegram-bot-api.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

/**
 * Отправить сообщение в чат по chat_id (telegram_id пользователя).
 * @param {string} botToken - токен бота
 * @param {string|number} chatId - telegram_id получателя
 * @param {string} text - текст сообщения (поддерживается HTML при parse_mode)
 * @param {{ parse_mode?: string }} [opts]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function sendTelegramNotification(botToken, chatId, text, opts = {}) {
  if (!botToken || !chatId) {
    return { ok: false, error: 'botToken и chatId обязательны' }
  }
  const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`
  const body = {
    chat_id: chatId,
    text: String(text).slice(0, 4096),
    disable_web_page_preview: true,
    ...(opts.parse_mode && { parse_mode: opts.parse_mode }),
  }
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
    return { ok: false, error: err.message }
  }
}

/**
 * Отправить уведомление о входе с нового устройства.
 * @param {string} botToken
 * @param {string|number} telegramId
 * @param {string} [userAgent] - User-Agent нового устройства
 * @param {string} [fingerprint] - опциональный fingerprint
 */
export async function notifyNewDeviceLogin(botToken, telegramId, userAgent = '', fingerprint = '') {
  const lines = ['🔐 Выполнен вход в аккаунт с нового устройства.']
  if (userAgent) lines.push(`\n📱 Устройство: ${escapeHtml(userAgent.slice(0, 200))}`)
  if (fingerprint) lines.push(`\n🆔 Fingerprint: ${escapeHtml(fingerprint.slice(0, 64))}`)
  const text = lines.join('')
  return sendTelegramNotification(botToken, telegramId, text)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
