/**
 * Обработчик команд (например /start, /help).
 * Можно расширять регистрацией command -> handler.
 */

const commands = new Map()

export function registerCommand(command, handler) {
  const key = (command || '').toLowerCase().replace(/^\//, '')
  if (key) commands.set(key, handler)
}

export async function handleCommand(ctx) {
  const text = (ctx.message?.text || '').trim()
  if (!text || !text.startsWith('/')) return false
  const parts = text.split(/\s+/)
  const name = (parts[0] || '').toLowerCase().replace(/^\//, '')
  const handler = commands.get(name)
  if (!handler) return false
  await handler(ctx, { name, args: parts.slice(1), raw: text })
  return true
}

// Встроенные команды по умолчанию
export function registerDefaultCommands() {
  registerCommand('start', async (ctx) => {
    const chatId = ctx.chatId ?? ctx.message?.chat?.id
    if (chatId && ctx.sendMessage) await ctx.sendMessage(chatId, '👋 Добро пожаловать. Отправьте /help для списка команд.')
  })
  registerCommand('help', async (ctx) => {
    const chatId = ctx.chatId ?? ctx.message?.chat?.id
    if (chatId && ctx.sendMessage) await ctx.sendMessage(chatId, '📋 Доступные команды:\n/start — приветствие\n/help — эта справка')
  })
}
