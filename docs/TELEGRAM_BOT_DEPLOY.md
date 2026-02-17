# Telegram Bot (Webhook) — деплой и масштабирование

## Структура проекта модуля

```
server/telegram-bot/
├── index.js              # Точка входа: createTelegramBot(), setWebhook(), getWebhookInfo()
├── config.js             # Конфигурация из env
├── router.js             # Роутер webhook (middleware + обработка update)
├── errors.js             # Ошибки и логгер
├── middleware/
│   ├── index.js
│   ├── secretToken.js    # X-Telegram-Bot-Api-Secret-Token
│   ├── rateLimit.js      # Rate limiting по IP
│   ├── requestLogger.js  # Лог update_id, тип
│   └── validateUpdate.js # Валидация body
├── handlers/
│   ├── index.js
│   ├── commandHandler.js   # /start, /help, регистрация команд
│   ├── messageHandler.js  # Текст, медиа, state
│   └── callbackHandler.js  # Inline-кнопки
├── services/
│   ├── telegramApi.js   # sendMessage, answerCallbackQuery, retry
│   ├── stateStore.js    # Фабрика store (memory/redis/postgres)
│   └── userLogger.js    # Логирование действий пользователей
├── stores/
│   ├── MemoryStore.js
│   ├── RedisStore.js
│   └── PostgresStore.js
├── schema/
│   └── postgres.sql     # Таблицы telegram_bot_state, telegram_user_events
├── .env.example
└── README.md (опционально)
```

## Интеграция в существующий Express

```javascript
import express from 'express'
import createTelegramBot from './telegram-bot/index.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

const bot = createTelegramBot(
  {}, // переопределения config из process.env
  {
    onMessage(ctx) {
      // Кастомный обработчик обычных сообщений (если не команда и не state)
      return ctx.sendMessage(ctx.chatId, 'Получено.')
    },
    onStateMessage(ctx, state) {
      // Обработчик при активном состоянии пользователя
      return ctx.sendMessage(ctx.chatId, `State: ${state.step}`)
    },
  }
)

app.post('/api/telegram/webhook', bot.webhookRouter)
```

## Регистрация webhook (setWebhook с secret_token)

Один раз после деплоя или по кнопке в админке:

```javascript
import { setWebhook } from './telegram-bot/index.js'

const result = await setWebhook({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  publicUrl: process.env.PUBLIC_URL,
})
if (result.ok) {
  console.log('Webhook установлен:', result.url)
} else {
  console.error('Ошибка:', result.error)
}
```

Или через curl (замените BOT_TOKEN и PUBLIC_URL):

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/api/telegram/webhook",
    "secret_token": "your-webhook-secret",
    "allowed_updates": ["message", "edited_message", "callback_query"]
  }'
```

## Конфигурация (.env)

См. `server/telegram-bot/.env.example`. Минимум для production:

- `TELEGRAM_BOT_TOKEN` — токен от @BotFather
- `TELEGRAM_WEBHOOK_SECRET` — случайная строка (проверяется в заголовке)
- `PUBLIC_URL` — https://your-domain.com (без слэша в конце)

## Деплой на VPS (HTTPS + reverse proxy)

### 1. Сервер (Node)

- Запуск: `node server/n8n-webhook-proxy.js` или через pm2/systemd.
- Порт приложения: например 3001 (не обязательно 443).

### 2. Nginx (reverse proxy + HTTPS)

Пример конфига (замените `your-domain.com` и путь к сертификатам):

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;

  ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

  location /api/telegram/webhook {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Telegram-Bot-Api-Secret-Token $http_x_telegram_bot_api_secret_token;
    client_max_body_size 1m;
  }

  # остальные location для приложения...
}
```

После правок: `sudo nginx -t && sudo systemctl reload nginx`.

### 3. Certbot (HTTPS)

```bash
sudo certbot --nginx -d your-domain.com
```

### 4. Проверка

- Вызвать `getWebhookInfo` — в ответе должен быть `url: https://your-domain.com/api/telegram/webhook`.
- Отправить боту сообщение — в логах сервера должно появиться обновление.

## Масштабирование (очередь / Redis)

### Проблема

При нескольких инстансах приложения in-memory state и in-memory rate limit не разделяются между процессами.

### Решение 1: Redis для state и rate limit

- В .env: `TELEGRAM_STATE_STORE=redis`, `REDIS_URL=redis://...`.
- Модуль уже поддерживает RedisStore для состояний.
- Rate limit: заменить middleware в `server/telegram-bot/middleware/rateLimit.js` на Redis-based (ключ по IP, инкремент с TTL).

Пример идеи для rate limit в Redis:

```javascript
// Псевдокод: ключ rate_limit:{ip}, инкремент, TTL = windowMs
const key = `rate_limit:${ip}`
const count = await redis.incr(key)
if (count === 1) await redis.pexpire(key, windowMs)
if (count > maxPerWindow) return res.status(429)...
```

### Решение 2: Очередь обновлений

- Webhook endpoint только принимает update и кладёт в очередь (Redis Queue, Bull, RabbitMQ).
- Воркеры (один или несколько процессов) забирают из очереди и вызывают `processUpdate(update)`.
- Так можно масштабировать обработку по горизонтали и не отвечать Telegram дольше 60 секунд.

Пример (концепт):

```javascript
// Webhook только ставит в очередь и сразу отвечает 200
app.post('/api/telegram/webhook', async (req, res) => {
  res.status(200).send()
  await redisQueue.add('telegram:update', req.body)
})

// Воркер
queue.process('telegram:update', async (job) => {
  await processUpdate(job.data, { status: () => ({ send: () => {} }) })
})
```

### Решение 3: Один инстанс для webhook

- Оставить один процесс, который принимает webhook и обрабатывает синхронно.
- Остальная часть приложения (API, админка) может масштабироваться за load balancer; webhook направлять только на этот инстанс (например, отдельный subdomain или path с отдельным upstream в nginx).

## SQL-схема (PostgreSQL)

См. `server/telegram-bot/schema/postgres.sql`:

- `telegram_bot_state` — состояния пользователей (chat_id, payload, expires_at).
- `telegram_user_events` — опционально логи событий (user_id, username, event_type, text, created_at).

Перед использованием PostgresStore выполните скрипт на целевой БД и задайте `TELEGRAM_STATE_STORE=postgres`, `DATABASE_URL=...`.

## Зависимости

- Для Redis store: `npm i ioredis`
- Для Postgres store: `npm i pg`
- Базовый модуль работает без них (state = memory).
