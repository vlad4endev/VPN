/**
 * Server-side validation of Telegram Mini App initData.
 * Follows Telegram official rules: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Rules:
 * - Use only the raw initData string (do not trust initDataUnsafe on client).
 * - Parse into key=value pairs (raw, no URL-decode of values for hash verification).
 * - data_check_string = sorted keys (alphabetically), join key=value with \n.
 * - secret_key = HMAC-SHA256(key="WebAppData", message=botToken).
 * - computed_hash = HMAC-SHA256(secret_key, data_check_string), hex.
 * - Valid if computed_hash === hash from initData.
 */

import crypto from 'crypto'

const HMAC_KEY_WEB_APP_DATA = 'WebAppData'

/** Default max age for auth_date (ms). Telegram recommends checking; 24h. */
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Validates Telegram Web App initData server-side.
 *
 * @param {string} initData - Raw query string from request (header or body), e.g. Telegram.WebApp.initData
 * @param {string} botToken - Bot token from BotFather (TELEGRAM_BOT_TOKEN)
 * @param {{ maxAgeMs?: number }} [options] - Optional. maxAgeMs: max age of auth_date in ms (default 24h)
 * @returns {{ ok: true, data: { user, auth_date, ... } } | { ok: false, reason: string, message: string }}
 *   reason one of: empty, no_hash, invalid_signature, expired_initData, parse_error, no_user, no_token
 */
export function validateTelegramInitData(initData, botToken, options = {}) {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS

  if (!botToken || typeof botToken !== 'string' || !botToken.trim()) {
    return { ok: false, reason: 'no_token', message: 'Сервер не настроен для входа через Telegram. Задайте токен бота.' }
  }

  if (!initData || typeof initData !== 'string') {
    return { ok: false, reason: 'empty', message: 'initData не передан или пустой' }
  }

  const trimmed = initData.trim()
  if (!trimmed) {
    return { ok: false, reason: 'empty', message: 'initData пустой' }
  }

  try {
    // 1) Parse raw initData into key=value pairs (do not URL-decode values; Telegram signs the raw string)
    const pairs = trimmed.split('&').map((s) => {
      const idx = s.indexOf('=')
      if (idx < 0) return [s, '']
      return [s.slice(0, idx), s.slice(idx + 1)]
    })

    const hashParam = pairs.find(([k]) => k === 'hash')
    const hash = hashParam ? hashParam[1] : ''
    if (!hash) {
      return { ok: false, reason: 'no_hash', message: 'В данных Telegram отсутствует подпись (hash). Откройте приложение заново из меню бота.' }
    }

    // 2) Remove hash from list, sort remaining by key alphabetically
    const withoutHash = pairs.filter(([k]) => k !== 'hash')
    withoutHash.sort(([a], [b]) => a.localeCompare(b))

    // 3) Build data_check_string: key=value joined by \n
    const dataCheckString = withoutHash.map(([k, v]) => `${k}=${v}`).join('\n')

    // 4) secret_key = HMAC-SHA256(key="WebAppData", message=botToken)
    const secretKey = crypto.createHmac('sha256', HMAC_KEY_WEB_APP_DATA).update(botToken).digest()

    // 5) computed_hash = HMAC-SHA256(secret_key, data_check_string), lowercase hex
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    // 6) Compare
    if (computedHash !== hash) {
      return { ok: false, reason: 'invalid_signature', message: 'Неверная подпись данных. Убедитесь, что открываете приложение из того же бота.' }
    }

    // 7) Parse payload for user and auth_date (use URLSearchParams for decoded user object)
    const params = new URLSearchParams(trimmed)
    const authDateStr = params.get('auth_date')
    const authDate = authDateStr ? parseInt(authDateStr, 10) : 0

    if (maxAgeMs > 0 && authDate) {
      const age = Date.now() - authDate * 1000
      if (age > maxAgeMs || age < 0) {
        return { ok: false, reason: 'expired_initData', message: 'Сессия Telegram истекла. Откройте приложение заново из меню бота.' }
      }
    }

    let user = null
    const userStr = params.get('user')
    if (userStr) {
      try {
        user = JSON.parse(userStr)
      } catch {
        user = null
      }
    }

    if (!user || !user.id) {
      return { ok: false, reason: 'no_user', message: 'В данных Telegram нет пользователя' }
    }

    return {
      ok: true,
      data: {
        user,
        auth_date: authDateStr ? parseInt(authDateStr, 10) : null,
      },
    }
  } catch (e) {
    return { ok: false, reason: 'parse_error', message: 'Ошибка проверки данных Telegram. Попробуйте открыть приложение заново.' }
  }
}

export default validateTelegramInitData
