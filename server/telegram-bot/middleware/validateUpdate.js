/**
 * Middleware: базовая валидация входящего update (структура, тип).
 */

import { ValidationError } from '../errors.js'

function validateUpdate(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Body must be a non-empty object')
  }
  const hasMessage = body.message && typeof body.message === 'object'
  const hasEditedMessage = body.edited_message && typeof body.edited_message === 'object'
  const hasCallbackQuery = body.callback_query && typeof body.callback_query === 'object'
  if (!hasMessage && !hasEditedMessage && !hasCallbackQuery) {
    throw new ValidationError('Update must contain message, edited_message or callback_query')
  }
  if (body.update_id == null || (typeof body.update_id !== 'number' && typeof body.update_id !== 'string')) {
    throw new ValidationError('Update must contain update_id')
  }
  return true
}

export function createValidateUpdateMiddleware() {
  return function validateUpdateMiddleware(req, res, next) {
    try {
      validateUpdate(req.body)
      next()
    } catch (err) {
      next(err)
    }
  }
}
