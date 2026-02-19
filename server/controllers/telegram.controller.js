/**
 * Контроллер Telegram: обработка обновлений webhook.
 * Передаёт управление в telegram.service (проверка update, userService, businessService).
 */

import { processUpdate } from '../services/telegram.service.js'

/**
 * Обработать обновление от Telegram Bot API (вызывается из POST /api/telegram/webhook).
 * Webhook-маршрут должен ответить 200 OK до или сразу после вызова этой функции.
 *
 * @param {Object} update — тело запроса от Telegram (update_id, message?, callback_query?, edited_message?)
 * @param {Object} deps — зависимости для telegram.service: getTelegramToken, getDb, APP_ID, sendTelegramMessage, sendMainMenu, handleCallbackQuery, handleMiniAppData, randomUUID?
 */
export async function handleWebhook(update, deps) {
  try {
    await processUpdate(update, deps)
  } catch (err) {
    console.error('❌ Telegram webhook:', err.message)
    throw err
  }
}
