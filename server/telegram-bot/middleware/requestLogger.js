/**
 * Middleware: логирование входящего webhook (update_id, тип).
 */

export function createRequestLoggerMiddleware() {
  return function requestLoggerMiddleware(req, res, next) {
    const update = req.body
    if (update && typeof update === 'object') {
      const updateId = update.update_id
      const type = update.message ? 'message' : update.edited_message ? 'edited_message' : update.callback_query ? 'callback_query' : 'unknown'
      if (process.env.NODE_ENV !== 'production') {
        console.log('[TelegramBot] Webhook update', { updateId, type })
      }
    }
    next()
  }
}
