/**
 * Обработчик callback_query (inline-кнопки).
 * Поддержка: data -> handler по префиксу или полному совпадению.
 */

const callbacks = new Map()

export function registerCallback(dataPrefixOrExact, handler) {
  callbacks.set(dataPrefixOrExact, handler)
}

export async function handleCallback(ctx) {
  const cq = ctx.update.callback_query
  if (!cq) return
  const data = (cq.data || '').trim()
  const chatId = cq.message?.chat?.id
  const messageId = cq.message?.message_id

  ctx.chatId = chatId
  ctx.from = cq.from
  ctx.callbackQueryId = cq.id
  ctx.callbackData = data
  ctx.messageId = messageId

  // Точное совпадение
  let handler = callbacks.get(data)
  // По префиксу (например "order:123" -> handler "order:")
  if (!handler && data) {
    for (const [key, h] of callbacks.entries()) {
      if (key.endsWith(':') && data.startsWith(key)) {
        handler = h
        break
      }
    }
  }
  if (handler) {
    await handler(ctx, data)
    return
  }

  // Fallback
  if (ctx.answerCallbackQuery && ctx.callbackQueryId) {
    await ctx.answerCallbackQuery(ctx.callbackQueryId, { text: 'Ок' })
  }
}
