/**
 * Централизованные ошибки и обработка для Telegram Bot модуля.
 */

export class TelegramBotError extends Error {
  constructor(message, code = 'TELEGRAM_BOT_ERROR') {
    super(message)
    this.name = 'TelegramBotError'
    this.code = code
  }
}

export class ValidationError extends TelegramBotError {
  constructor(message) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class RateLimitError extends TelegramBotError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT')
    this.name = 'RateLimitError'
  }
}

export class TelegramApiError extends TelegramBotError {
  constructor(message, statusCode, response) {
    super(message, 'TELEGRAM_API_ERROR')
    this.name = 'TelegramApiError'
    this.statusCode = statusCode
    this.response = response
  }
}

/**
 * Централизованный error logger (можно заменить на свой логгер).
 */
export function logError(context, err) {
  const payload = {
    message: err?.message,
    code: err?.code,
    name: err?.name,
    stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    console.error('[TelegramBot]', context, payload.message, payload.code)
  } else {
    console.error('[TelegramBot]', context, payload)
  }
}
