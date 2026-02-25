# Гибридная авторизация через Telegram

Identity provider: Telegram WebApp (initData) и Login Widget (id, hash, auth_date). Одна активная сессия на пользователя (refresh в Redis).

## Требования

- Node.js 18+
- PostgreSQL (таблица `users` с `telegram_id`)
- Redis (ключ `refresh:user:{userId}` → refreshId)

## Установка

```bash
cd server
npm install pg ioredis jsonwebtoken cookie-parser dotenv
```

## База данных

Создать таблицу (один раз):

```bash
psql $DATABASE_URL -f telegram-auth/schema/postgres.sql
```

## Запуск отдельным сервером

```bash
cp telegram-auth/.env.example .env
# отредактировать .env
node telegram-auth/server.js
```

API будет доступен на `http://localhost:3002` (или PORT из .env).

## Подключение в существующий Express-проект

```js
import { createAuthRouter, authMiddleware, authRateLimit } from './telegram-auth/index.js'
import pg from 'pg'
import Redis from 'ioredis'
import cookieParser from 'cookie-parser'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const redis = new Redis(process.env.REDIS_URL)

app.use(cookieParser())
app.use('/auth', authRateLimit, createAuthRouter({
  pool,
  redis,
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  jwtSecret: process.env.JWT_SECRET,
  cookieDomain: process.env.COOKIE_DOMAIN,
  cookieSecure: process.env.NODE_ENV === 'production',
}))

// Защищённые маршруты
app.use('/api', authMiddleware(process.env.JWT_SECRET), yourApiRoutes)
```

## Эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | /auth/telegram | Логин: body `initData` (WebApp) или `id`, `hash`, `auth_date` (Widget). Опционально `fingerprint`. |
| POST | /auth/refresh | Обновление access: body `refreshToken` или cookie `refreshToken`. |
| POST | /auth/logout | Выход: инвалидация refresh в Redis, очистка cookie. |

## Токены

- **Access** — JWT, 15 мин, payload: `{ uid, tid, role, iat, exp }`. Передаётся в `Authorization: Bearer <token>`.
- **Refresh** — JWT, 30 дней, хранится в Redis по ключу `refresh:user:{uid}`. Один на пользователя; при входе с нового устройства старый инвалидируется, в Telegram отправляется уведомление с user-agent.

## Защита

- Проверка подписи Telegram (WebApp и Widget по официальной документации).
- auth_date не старше 24 ч.
- Rate limit на /auth/* (20 запросов/мин с IP).
- Replay защита за счёт одноразового auth_date в подписи.

## Структура

- `utils/verifyWebApp.js` — проверка initData (Mini App)
- `utils/verifyLogin.js` — проверка Login Widget
- `services/telegramNotify.js` — уведомление о входе с нового устройства
- `services/userService.js` — findOrCreate по telegram_id в PostgreSQL
- `routes/auth.js` — POST /telegram, /refresh, /logout
- `middleware/authMiddleware.js` — проверка access token
- `middleware/rateLimit.js` — лимит запросов на /auth
- `server.js` — standalone запуск
- `index.js` — экспорт для подключения в основной проект
