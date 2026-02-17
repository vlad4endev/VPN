/**
 * Обработчик обычных сообщений (текст, медиа).
 * Сначала проверяется команда, затем состояние (state), затем общий обработчик.
 */

import { handleCommand } from './commandHandler.js'

export async function handleMessage(ctx) {
  const message = ctx.message || ctx.edited_message
  if (!message) return

  ctx.chatId = message.chat?.id
  ctx.from = message.from
  ctx.text = (message.text || message.caption || '').trim()
  ctx.hasPhoto = !!(message.photo && message.photo.length)
  ctx.hasDocument = !!message.document

  // 1. Команды
  if (ctx.text && ctx.text.startsWith('/')) {
    const handled = await handleCommand(ctx)
    if (handled) return
  }

  // 2. Состояние (state machine): если у пользователя есть state — передаём в state handler
  const state = ctx.stateStore && ctx.chatId ? await ctx.stateStore.getState(ctx.chatId) : null
  if (state && typeof ctx.onStateMessage === 'function') {
    await ctx.onStateMessage(ctx, state)
    return
  }

  // 3. Общий обработчик текста/медиа
  if (typeof ctx.onMessage === 'function') {
    await ctx.onMessage(ctx)
    return
  }

  // Fallback
  if (ctx.text && ctx.sendMessage) {
    await ctx.sendMessage(ctx.chatId, `Вы написали: ${ctx.text.slice(0, 100)}`)
  }
}
