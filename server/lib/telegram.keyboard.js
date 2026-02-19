/**
 * Построение reply_markup для Telegram Bot API (inline_keyboard).
 * Поддерживает кастомный сценарий из Firestore (telegramBotScenario).
 */

const DEFAULT_KEYBOARD_BASE_URL = () =>
  (process.env.PUBLIC_URL || process.env.FRONTEND_URL || 'https://yourdomain.com').toString().trim().replace(/\/+$/, '') || 'https://yourdomain.com'

/**
 * Построить одну кнопку для Telegram API.
 * @param {{ type: 'web_app'|'url'|'callback', text: string, url?: string, callback_data?: string }} btn
 * @param {string} baseUrl — базовый URL для web_app, если url пустой
 */
function buildButton(btn, baseUrl) {
  const text = (btn.text && String(btn.text).trim()) || 'Кнопка'
  const type = (btn.type && String(btn.type).toLowerCase()) || 'callback'
  if (type === 'web_app') {
    const url = (btn.url && String(btn.url).trim()) || baseUrl || DEFAULT_KEYBOARD_BASE_URL()
    return { text, web_app: { url: url.replace(/\/+$/, '') || url } }
  }
  if (type === 'url') {
    const url = (btn.url && String(btn.url).trim()) || baseUrl
    return url ? { text, url } : { text, callback_data: btn.callback_data || 'menu' }
  }
  return { text, callback_data: (btn.callback_data && String(btn.callback_data).trim()) || 'MENU' }
}

/**
 * Собрать inline_keyboard из сценария или дефолтный.
 *
 * @param {string} [appUrl] — URL приложения для web_app
 * @param {Object} [scenario] — сценарий из Firestore: { menuButtons?: Array<Array<{ type, text, url?, callback_data? }>> }
 * @returns {{ inline_keyboard: Array<Array<{ text: string, web_app?: { url: string }, callback_data?: string, url?: string }>> }}
 */
export function buildMainKeyboard(appUrl, scenario) {
  const baseUrl = (appUrl || DEFAULT_KEYBOARD_BASE_URL()).toString().trim().replace(/\/+$/, '') || DEFAULT_KEYBOARD_BASE_URL()

  if (scenario && Array.isArray(scenario.menuButtons) && scenario.menuButtons.length > 0) {
    const inline_keyboard = scenario.menuButtons.map((row) => {
      if (!Array.isArray(row)) return []
      return row.map((btn) => buildButton(btn, baseUrl)).filter((b) => b)
    }).filter((row) => row.length > 0)
    if (inline_keyboard.length > 0) {
      return { inline_keyboard }
    }
  }

  return {
    inline_keyboard: [
      [{ text: 'Открыть приложение', web_app: { url: baseUrl } }],
      [
        { text: 'Мой профиль', callback_data: 'PROFILE' },
        { text: 'Помощь', callback_data: 'HELP' },
      ],
    ],
  }
}
