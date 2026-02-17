# Telegram Bot — production-ready webhook модуль

Модульная интеграция Telegram Bot API через Webhook для Express.

## Возможности

- Защищённый POST webhook (secret_token, rate limit, валидация)
- Обработка: `message`, `edited_message`, `callback_query`
- Модульные handlers: команды, сообщения, callback
- State machine с хранилищем: memory / Redis / PostgreSQL
- Логирование действий пользователей (user_id, username, event_type, text, timestamp)
- Retry при отправке в Telegram API
- Конфигурация через env

## Быстрый старт

```javascript
import express from 'express'
import createTelegramBot from './telegram-bot/index.js'

const app = express()
app.use(express.json())

const bot = createTelegramBot()
app.post('/api/telegram/webhook', bot.webhookRouter)

// Установка webhook (один раз)
await bot.setWebhook()
```

## Конфиг

См. `.env.example`. Обязательные переменные: `TELEGRAM_BOT_TOKEN`, `PUBLIC_URL`. Рекомендуется: `TELEGRAM_WEBHOOK_SECRET`.

## Регистрация команд и callback

```javascript
import { registerCommand } from './telegram-bot/handlers/commandHandler.js'
import { registerCallback } from './telegram-bot/handlers/callbackHandler.js'

registerCommand('mycommand', async (ctx, { name, args }) => {
  await ctx.sendMessage(ctx.chatId, `Команда ${name}, аргументы: ${args.join(' ')}`)
})

registerCallback('btn_ok', async (ctx, data) => {
  await ctx.answerCallbackQuery(ctx.callbackQueryId, { text: 'Принято' })
  await ctx.sendMessage(ctx.chatId, 'Вы нажали ОК')
})
```

## State store

По умолчанию — memory. Для production задайте в .env:

- `TELEGRAM_STATE_STORE=redis` и `REDIS_URL=...`
- или `TELEGRAM_STATE_STORE=postgres` и `DATABASE_URL=...`

Таблицы для PostgreSQL: `schema/postgres.sql`.

## Деплой и масштабирование

См. [docs/TELEGRAM_BOT_DEPLOY.md](../../docs/TELEGRAM_BOT_DEPLOY.md).
