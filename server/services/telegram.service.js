/**
 * Сервис Telegram: валидация update, получение пользователя через userService, передача в businessService.
 * Перед businessService проверяется конструктор сценариев (bot-builder): при совпадении триггера отправляется ответ из сценария.
 */

import { findOrCreateByTelegramId } from './userService.js'
import { handleUpdate } from './telegramBusinessService.js'

function buildReplyMarkup(keyboardJson) {
  if (keyboardJson == null) return undefined
  if (Array.isArray(keyboardJson)) return { inline_keyboard: keyboardJson }
  if (keyboardJson.inline_keyboard && Array.isArray(keyboardJson.inline_keyboard)) return keyboardJson
  return undefined
}

/**
 * Обработать обновление от Telegram Bot API.
 * 1) Логирование входящего update (опционально).
 * 2) Проверка bot-builder: при совпадении trigger_type/trigger_value — ответ из сценария и return.
 * 3) Иначе: userService, businessService.handleUpdate().
 *
 * @param {Object} update — тело webhook от Telegram (update_id, message?, callback_query?, edited_message?)
 * @param {Object} deps — getDb, getTelegramToken, APP_ID, sendTelegramMessage, sendMainMenu, handleMiniAppData, answerCallbackQuery, editMessageText, buildMainKeyboard, getBaseUrlForTelegram?, randomUUID?, findScenarioFromBotBuilder?
 */
export async function processUpdate(update, deps) {
  if (!update) return
  if (!update.message && !update.callback_query) return

  if (deps.logTelegramUpdate) {
    try { deps.logTelegramUpdate(update) } catch (_) {}
  }

  const {
    getDb,
    getTelegramToken,
    APP_ID,
    sendTelegramMessage,
    sendMainMenu,
    handleMiniAppData,
    randomUUID,
  } = deps

  const botToken = await getTelegramToken()
  if (!botToken) {
    console.warn('⚠️ Telegram webhook: обновление пропущено (токен бота не настроен). Настройте токен в админке или TELEGRAM_BOT_TOKEN.')
    return
  }

  const db = getDb()
  if (!db) {
    console.warn('⚠️ Telegram webhook: обновление пропущено (Firestore недоступен). Настройте Firebase в server/.env.')
    return
  }

  const appId = deps.APP_ID || process.env.APP_ID || 'skyputh'
  const findScenarioFromBotBuilder = deps.findScenarioFromBotBuilder || (() => Promise.resolve(null))

  let telegramId = null
  let text = null
  let from = null

  if (update.callback_query) {
    telegramId = update.callback_query.from?.id != null ? String(update.callback_query.from.id) : null
    const callbackData = (update.callback_query.data || '').trim()
    if (callbackData) {
      try {
        const scenario = await findScenarioFromBotBuilder(db, appId, 'callback', callbackData)
        if (scenario && scenario.response_text != null) {
          const chatId = update.callback_query.message?.chat?.id
          const messageId = update.callback_query.message?.message_id
          const callbackQueryId = update.callback_query.id
          await deps.answerCallbackQuery(botToken, callbackQueryId, { text: 'Ок' })
          const reply_markup = buildReplyMarkup(scenario.keyboard_json)
          await deps.editMessageText(botToken, chatId, messageId, scenario.response_text, { reply_markup })
          return
        }
      } catch (err) {
        console.error('❌ Telegram webhook (bot-builder callback):', err.message)
      }
    }
  }

  const message = update.message || update.edited_message
  if (message?.from) {
    telegramId = message.from.id != null ? String(message.from.id) : telegramId
    text = typeof message.text === 'string' ? message.text.trim() : ''
    from = message.from
  }

  const userResult = telegramId
    ? await findOrCreateByTelegramId(db, appId, telegramId, { from, randomUUID })
    : { user: null, created: false }
  const user = userResult.user

  if (message && text !== '' && !update.callback_query) {
    const isStartWithToken = /^\/start\s+\S+/.test(text)
    if (!isStartWithToken) {
      const trigger_type = text.startsWith('/') ? 'command' : 'text'
      try {
        const scenario = await findScenarioFromBotBuilder(db, appId, trigger_type, text)
        if (scenario && scenario.response_text != null) {
          const chatId = message.chat?.id
          if (chatId != null) {
            const reply_markup = buildReplyMarkup(scenario.keyboard_json)
            await sendTelegramMessage(botToken, chatId, scenario.response_text, { reply_markup })
          }
          return
        }
      } catch (err) {
        console.error('❌ Telegram webhook (bot-builder message):', err.message)
      }
    }
  }

  const context = {
    botToken,
    db,
    APP_ID: appId,
    sendTelegramMessage,
    sendMainMenu,
    handleMiniAppData,
    answerCallbackQuery: deps.answerCallbackQuery,
    editMessageText: deps.editMessageText,
    buildMainKeyboard: deps.buildMainKeyboard,
    getScenario: deps.getScenario || (() => Promise.resolve(null)),
    getBaseUrlForTelegram: deps.getBaseUrlForTelegram,
  }

  await handleUpdate(update, user, context)
}
