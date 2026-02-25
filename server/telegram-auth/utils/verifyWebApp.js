/**
 * Проверка подписи Telegram WebApp initData (Mini App).
 * Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Алгоритм: data_check_string = sorted key=value через \n, secret_key = HMAC_SHA256("WebAppData", bot_token), hash = HMAC_SHA256(data_check_string, secret_key).
 */

import crypto from 'crypto'

const HMAC_WEB_APP_DATA = 'WebAppData'

/**
 * Парсит query string initData и строит data_check_string (пары key=value, исключая hash, в алфавитном порядке по ключу).
 * @param {string} initData - строка вида "query_id=...&user=...&auth_date=...&hash=..."
 * @returns {{ dataCheckString: string, hash: string } | null}
 */
function parseInitData(initData) {
  if (!initData || typeof initData !== 'string') return null
  const params = new URLSearchParams(initData.trim())
  const hash = params.get('hash')
  if (!hash) return null
  const pairs = []
  for (const [key, value] of params) {
    if (key === 'hash') continue
    pairs.push(`${key}=${value}`)
  }
  pairs.sort()
  const dataCheckString = pairs.join('\n')
  return { dataCheckString, hash }
}

/**
 * Проверяет подпись initData от Telegram WebApp.
 * @param {string} initData - initData из Telegram.WebApp.initData
 * @param {string} botToken - токен бота от BotFather
 * @returns {{ ok: true, data: object } | { ok: false, reason: string, message: string }}
 */
export function verifyWebAppInitData(initData, botToken) {
  if (!botToken || !botToken.trim()) {
    return { ok: false, reason: 'no_token', message: 'Токен бота не настроен' }
  }
  const parsed = parseInitData(initData)
  if (!parsed) {
    return { ok: false, reason: 'invalid_format', message: 'Неверный формат initData' }
  }
  const secretKey = crypto.createHmac('sha256', HMAC_WEB_APP_DATA).update(botToken).digest()
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(parsed.dataCheckString).digest('hex')
  if (calculatedHash !== parsed.hash) {
    return { ok: false, reason: 'invalid_signature', message: 'Неверная подпись initData' }
  }
  const params = new URLSearchParams(initData.trim())
  const authDate = params.get('auth_date')
  if (authDate) {
    const ts = parseInt(authDate, 10)
    if (!Number.isFinite(ts)) {
      return { ok: false, reason: 'invalid_auth_date', message: 'Неверный auth_date' }
    }
    const maxAge = 24 * 60 * 60 // 24 часа
    if (Math.abs(Date.now() / 1000 - ts) > maxAge) {
      return { ok: false, reason: 'auth_date_expired', message: 'Данные авторизации устарели (макс. 24ч)' }
    }
  }
  let user = null
  const userStr = params.get('user')
  if (userStr) {
    try {
      user = JSON.parse(decodeURIComponent(userStr))
    } catch {
      user = null
    }
  }
  return {
    ok: true,
    data: {
      user,
      auth_date: authDate ? parseInt(authDate, 10) : null,
      hash: parsed.hash,
    },
  }
}
