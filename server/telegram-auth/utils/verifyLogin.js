/**
 * Проверка данных Telegram Login Widget (id, hash, auth_date, first_name, last_name, username, photo_url).
 * Документация: https://core.telegram.org/widgets/login#checking-authorization
 *
 * Алгоритм: data_check_string = sorted key=value через \n (кроме hash), secret_key = SHA256(bot_token), hash = HMAC_SHA256(data_check_string, secret_key).
 */

import crypto from 'crypto'

const AUTH_DATE_MAX_AGE_SEC = 24 * 60 * 60 // 24 часа

/**
 * Проверяет подпись данных от Telegram Login Widget.
 * @param {object} payload - объект с полями id, hash, auth_date и опционально first_name, last_name, username, photo_url
 * @param {string} botToken - токен бота от BotFather
 * @returns {{ ok: true, data: object } | { ok: false, reason: string, message: string }}
 */
export function verifyLoginWidget(payload, botToken) {
  if (!botToken || !botToken.trim()) {
    return { ok: false, reason: 'no_token', message: 'Токен бота не настроен' }
  }
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'invalid_payload', message: 'Неверный формат данных' }
  }
  const hash = payload.hash
  const authDate = payload.auth_date
  if (!hash || !authDate) {
    return { ok: false, reason: 'missing_fields', message: 'Отсутствуют hash или auth_date' }
  }
  const dataCheckParts = []
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'hash') continue
    if (value !== undefined && value !== null) {
      dataCheckParts.push(`${key}=${value}`)
    }
  }
  dataCheckParts.sort()
  const dataCheckString = dataCheckParts.join('\n')
  const secretKey = crypto.createHash('sha256').update(botToken).digest()
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  if (calculatedHash !== hash) {
    return { ok: false, reason: 'invalid_signature', message: 'Неверная подпись данных виджета' }
  }
  const ts = typeof authDate === 'number' ? authDate : parseInt(authDate, 10)
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'invalid_auth_date', message: 'Неверный auth_date' }
  }
  if (Math.abs(Date.now() / 1000 - ts) > AUTH_DATE_MAX_AGE_SEC) {
    return { ok: false, reason: 'auth_date_expired', message: 'Данные авторизации устарели (макс. 24ч)' }
  }
  const telegramId = payload.id != null ? String(payload.id) : null
  if (!telegramId) {
    return { ok: false, reason: 'missing_user_id', message: 'Отсутствует id пользователя' }
  }
  return {
    ok: true,
    data: {
      id: telegramId,
      first_name: payload.first_name,
      last_name: payload.last_name,
      username: payload.username,
      photo_url: payload.photo_url,
      auth_date: ts,
    },
  }
}
