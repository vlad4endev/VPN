/**
 * Middleware: проверка заголовка X-Telegram-Bot-Api-Secret-Token.
 * Если webhookSecret не задан в конфиге — проверка пропускается (для dev).
 */

export function createSecretTokenMiddleware(webhookSecret) {
  return function secretTokenMiddleware(req, res, next) {
    if (!webhookSecret || !webhookSecret.trim()) {
      return next()
    }
    const received = (req.headers && (req.headers['x-telegram-bot-api-secret-token'] || req.headers['X-Telegram-Bot-Api-Secret-Token'])) || ''
    if (received !== webhookSecret) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[TelegramBot] Webhook: неверный или отсутствующий secret_token')
      }
      res.status(401).send()
      return
    }
    next()
  }
}
