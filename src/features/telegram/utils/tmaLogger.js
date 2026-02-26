/**
 * Логирование работы Telegram Mini App (TMA) для анализа и отладки.
 * Хранит кольцевой буфер событий, не сохраняет чувствительные данные (токены, initData).
 * Используется на экранах /t для просмотра и копирования логов.
 */

import logger from '../../../shared/utils/logger.js'

const MAX_ENTRIES = 150
const CATEGORY = 'TelegramAuth'

/** Чувствительные ключи — в данных подменяем на метку */
const SENSITIVE_KEYS = [
  'initData', 'sessionToken', 'customToken', 'token', 'hash', 'password',
  'telegramSessionToken', 'X-Telegram-InitData', 'X-Telegram-Session-Token',
]

function sanitize(data) {
  if (data == null || typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map(sanitize)
  const out = {}
  for (const key of Object.keys(data)) {
    const lower = key.toLowerCase()
    if (SENSITIVE_KEYS.some(sk => lower.includes(sk.toLowerCase()))) {
      out[key] = '(скрыто)'
    } else {
      out[key] = sanitize(data[key])
    }
  }
  return out
}

const buffer = []
let enabled = true

/**
 * Добавить запись в буфер TMA и в основной логгер.
 * @param {string} level - 'debug' | 'info' | 'warn' | 'error'
 * @param {string} event - короткий код события (например 'auth_start', 'auth_ok')
 * @param {string} message - человекочитаемое сообщение
 * @param {Object} [data] - доп. данные (будут очищены от токенов)
 */
export function tmaLog(level, event, message, data = null) {
  if (!enabled) return
  const payload = data ? sanitize(data) : null
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    message,
    data: payload,
  }
  buffer.unshift(entry)
  if (buffer.length > MAX_ENTRIES) buffer.length = MAX_ENTRIES

  const logMessage = message + (payload ? ` ${JSON.stringify(payload)}` : '')
  if (logger[level]) logger[level](CATEGORY, logMessage, payload)
}

/** Получить последние N записей (новые сверху). */
export function getTmaLogs(limit = 80) {
  return buffer.slice(0, limit)
}

/** Текст для копирования: по одной строке на запись. */
export function getTmaLogsAsText(limit = 80) {
  return getTmaLogs(limit)
    .map(e => {
      const dataStr = e.data && Object.keys(e.data).length ? ` ${JSON.stringify(e.data)}` : ''
      return `${e.ts} [${e.level}] ${e.event} ${e.message}${dataStr}`
    })
    .join('\n')
}

/** Очистить буфер. */
export function clearTmaLogs() {
  buffer.length = 0
}

/** Включить/выключить запись (буфер не очищается). */
export function setTmaLoggingEnabled(value) {
  enabled = !!value
}

export default {
  log: tmaLog,
  getLogs: getTmaLogs,
  getLogsAsText: getTmaLogsAsText,
  clear: clearTmaLogs,
  setEnabled: setTmaLoggingEnabled,
}
