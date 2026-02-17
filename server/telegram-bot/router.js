/**
 * Роутер webhook: объединяет middleware и обработчики обновлений.
 */

import { handleMessage } from './handlers/messageHandler.js'
import { handleCallback } from './handlers/callbackHandler.js'
import { registerDefaultCommands } from './handlers/commandHandler.js'
import { sendMessage, answerCallbackQuery } from './services/telegramApi.js'
import { logError } from './errors.js'

export function createWebhookRouter(deps) {
  const {
    config,
    stateStore,
    userLogger,
    middleware: {
      secretToken,
      rateLimit,
      requestLogger,
      validateUpdate,
    },
    onMessage = null,
    onStateMessage = null,
  } = deps

  registerDefaultCommands()

  const botToken = config.botToken
  const apiOpts = {
    timeoutMs: config.apiTimeoutMs,
    retryAttempts: config.sendRetryAttempts,
    retryDelayMs: config.sendRetryDelayMs,
  }

  const sendMessageBound = (chatId, text, options = {}) =>
    sendMessage(botToken, chatId, text, options, apiOpts)

  async function processUpdate(update, res) {
    res.status(200).send()
    if (!botToken) {
      console.warn('[TelegramBot] Токен бота не задан')
      return
    }

    userLogger.log(update)

    const ctx = {
      update,
      message: update.message || update.edited_message,
      botToken,
      stateStore,
      sendMessage: sendMessageBound,
      answerCallbackQuery: (cqId, opts) => answerCallbackQuery(botToken, cqId, opts, { apiOpts }),
      onMessage: onMessage ?? null,
      onStateMessage: onStateMessage ?? null,
    }

    try {
      if (update.callback_query) {
        await handleCallback(ctx)
        return
      }
      if (update.message || update.edited_message) {
        await handleMessage(ctx)
        return
      }
    } catch (err) {
      logError('processUpdate', err)
      try {
        const chatId = update.message?.chat?.id || update.edited_message?.chat?.id || update.callback_query?.message?.chat?.id
        if (chatId) await sendMessageBound(chatId, 'Произошла ошибка. Попробуйте позже.')
      } catch (_) {}
    }
  }

  const stack = [secretToken, rateLimit, requestLogger, validateUpdate]

  return function webhookRouter(req, res, next) {
    let i = 0
    function run(err) {
      if (err) {
        logError('webhook middleware', err)
        if (res.headersSent) return
        res.status(err.code === 'VALIDATION_ERROR' ? 400 : err.code === 'RATE_LIMIT' ? 429 : 500).json({ ok: false, error: err.message })
        return
      }
      if (i < stack.length) {
        const mw = stack[i++]
        mw(req, res, run)
        return
      }
      processUpdate(req.body, res).catch((e) => logError('processUpdate', e))
    }
    run()
  }
}
