# Анализ модуля Telegram в проекте

## 1. Общая картина

В проекте есть **две параллельные реализации** работы с Telegram:

| Компонент | Где | Назначение |
|-----------|-----|------------|
| **Текущий webhook и API** | `server/n8n-webhook-proxy.js` + `server/lib/telegram.js` | Реальный продакшен: привязка аккаунта, уведомления, Mini App, админка, тикеты |
| **Модуль telegram-bot** | `server/telegram-bot/` | Отдельный production-ready модуль (router, handlers, state, rate limit): **пока не подключён к приложению** |

---

## 2. Текущая реализация (n8n-webhook-proxy + lib/telegram.js)

### 2.1 Конфигурация и токен

- **Источник токена:** `TELEGRAM_BOT_TOKEN` (env) → кэш 1 мин → Firestore `artifacts/{APP_ID}/public/settings.telegramBotToken`.
- **Кэш:** in-memory (`telegramTokenCache`), сброс при сохранении настроек в админке.
- **Валидация Mini App:** `validateTelegramInitData(initData)` по HMAC-SHA256 (ключ из `TELEGRAM_BOT_TOKEN`). Результат в `req.telegramUser`.

### 2.2 API endpoints

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/telegram/webhook` | Единая точка входа: привязка по токену, /start, /menu, Mini App data, callback_query |
| GET | `/api/telegram/bind-link` | Ссылка для привязки (JWT + Firestore `telegram_binds`) |
| POST | `/api/telegram/unbind` | Отвязать Telegram (JWT, сброс tgId в users_v4) |
| POST | `/api/telegram/send-reminders` | Cron: напоминания об истечении подписки (заголовок X-Telegram-Secret) |
| GET | `/api/admin/telegram/status` | Статус бота + username + adminChatId (админ) |
| PATCH | `/api/admin/telegram/settings` | Сохранение токена и adminChatId в Firestore (админ) |
| POST | `/api/admin/telegram/set-webhook` | setWebhook с secret_token и allowed_updates (админ) |
| GET | `/api/admin/telegram/webhook-status` | getWebhookInfo (админ) |
| GET | `/api/admin/telegram/chat-info` | getChat по adminChatId (админ) |
| POST | `/api/admin/telegram/send-test` | Тестовое сообщение на указанный chatId (админ) |
| POST | `/api/notify/support-ticket` | Уведомление админу о тикете (adminChatId) |
| POST | `/api/notify/support-reply` | Уведомление пользователю об ответе поддержки (tgId) |
| POST | `/api/report-error` | Запись ошибки + уведомление админу в Telegram |

### 2.3 Обработка webhook (логика в одном месте)

- **Ответ:** сразу `res.status(200).send()`, затем асинхронная обработка.
- **Порядок:** `callback_query` → `message.web_app_data` → `message.text` (/start с токеном → привязка; /start → меню + подсказка; /menu → меню).
- **Привязка:** документ в `telegram_binds/{token}` (userId, expiresAt), при /start &lt;token&gt; — обновление `users_v4/{userId}.tgId`, удаление bind.
- **Mini App:** разбор `web_app_data.data` (JSON), поиск пользователя по tgId в users_v4, вызов n8n (addClient/deleteClient) с payload + telegramUserId.
- **Защита:** middleware `verifyTelegramWebhookSecret` (X-Telegram-Bot-Api-Secret-Token), если задан `TELEGRAM_WEBHOOK_SECRET`.

### 2.4 Где используется отправка сообщений

- Уведомление об оплате (после активации подписки) — в `userData.tgId`.
- Напоминания (send-reminders) — по списку users_v4 с tgId и expiresAt в окне 7 дней.
- Ошибки и тикеты — в adminChatId (env или Firestore).
- Ответ поддержки — в tgId пользователя.

### 2.5 Фронтенд (Telegram)

- **Сервис:** `src/features/telegram/services/telegramService.js` — getBindLink (GET с JWT), unbindTelegram (POST с JWT).
- **Хук:** `useTelegram.js` — состояние (bindLink, loading, error), getLink, unbind, clearLink.
- **UI:** `TelegramBindCard.jsx` — блок в профиле: «Привязать», ссылка, «Обновить статус», отвязка.
- **Админка:** `TelegramPanel.jsx` — токен, webhook, тестовое сообщение, подсказки по Telegram ID.

### 2.6 lib/telegram.js

- `sendTelegramMessage(botToken, chatId, text, options)` — без retry, без таймаута.
- `getTelegramBotInfo`, `getTelegramChat`, `setTelegramWebhook`, `getTelegramWebhookInfo`, `answerCallbackQuery`.

---

## 3. Модуль telegram-bot (отдельный)

### 3.1 Назначение

Универсальный webhook-модуль: middleware (secret, rate limit, валидация), handlers (команды, сообщения, callback), state store (memory/redis/postgres), логирование событий, retry при отправке.

### 3.2 Структура

- **config.js** — всё из env (токен, секрет, rate limit, таймауты, retry, state store, redis/pg).
- **middleware:** secretToken, rateLimit (in-memory по IP), requestLogger, validateUpdate.
- **handlers:** commandHandler (registerCommand, /start, /help), messageHandler (команды → state → onMessage), callbackHandler (registerCallback).
- **services:** telegramApi (callTelegramApi с retry + timeout), stateStore (фабрика memory/redis/postgres), userLogger (нормализация payload, опционально persist).
- **stores:** MemoryStore, RedisStore (ioredis), PostgresStore (pg).
- **router:** цепочка middleware → processUpdate (callback_query / message / edited_message), единый ctx (sendMessage, stateStore, onMessage, onStateMessage).

### 3.3 Текущее состояние интеграции

- **Не подключён:** в `n8n-webhook-proxy.js` используется своя реализация webhook, а не `createTelegramBot().webhookRouter`.
- **Дублирование:** отправка в API — в `lib/telegram.js` без retry; в `telegram-bot/services/telegramApi.js` — с retry и таймаутом.
- **Токен:** в прокси — getTelegramToken() (env + Firestore); в модуле — только config.botToken (env). Модуль не знает про Firestore.

---

## 4. Сводка по компонентам

| Аспект | Прокси (текущий) | Модуль telegram-bot |
|--------|-------------------|----------------------|
| Токен | env + Firestore + кэш | Только env (config) |
| Webhook | Один большой обработчик | Роутер + handlers (модульно) |
| Secret token | Да (middleware) | Да (middleware) |
| Rate limit | Нет | Да (in-memory по IP) |
| Валидация update | Фактически по наличию полей | Явная (message/edited_message/callback_query, update_id) |
| Retry отправки | Нет | Да (telegramApi.js) |
| State / сессии | Нет (только привязка через telegram_binds) | Да (memory/redis/postgres) |
| Логирование событий | Точечно (привязка, Mini App) | userLogger (user_id, username, event_type, text) |
| Команды | /start, /menu жёстко в коде | registerCommand, дефолтные /start, /help |
| Callback | handleCallbackQuery → меню | registerCallback по data/префиксу |
| Интеграция с продуктом | Привязка, n8n, тикеты, оплата, админка | Нет (standalone) |

---

## 5. Проблемы и риски

1. **Два подхода к одному боту:** логика в прокси полная и завязана на Firestore/n8n; модуль telegram-bot не используется и не получает токен из Firestore.
2. **Нет retry в lib/telegram.js:** при временных сбоях Telegram API уведомления (оплата, напоминания) могут теряться.
3. **Нет rate limit на webhook в прокси:** при всплеске запросов от Telegram или злоупотреблении возможна перегрузка.
4. **Разная валидация:** в модуле — строгая проверка типа update; в прокси — проверки по ходу (можно принять лишнее и не залогировать).
5. **Модуль не интегрирован:** чтобы его использовать, нужно либо перевести весь webhook на него (и подставить getTelegramToken из Firestore в config), либо не использовать и не поддерживать.

---

## 6. Рекомендации по улучшению

### 6.1 Быстрые улучшения (без смены архитектуры)

- **Добавить retry в lib/telegram.js** для `sendTelegramMessage`: 2–3 попытки с экспоненциальной задержкой при 5xx/таймауте — снизит потерю уведомлений.
- **Добавить rate limit на POST /api/telegram/webhook** в прокси (по IP или по update_id окно), чтобы защититься от всплесков и злоупотреблений.
- **Валидация body в webhook:** проверять наличие `update_id` и одного из `message` / `edited_message` / `callback_query`, при несоответствии — 400 и лог.

### 6.2 Интеграция модуля telegram-bot (если нужна модульность)

- **Вариант A — подмешивать только сервисы модуля:** использовать в прокси `telegram-bot/services/telegramApi.js` (sendMessage с retry) вместо прямых вызовов `lib/telegram.js` для отправки, оставив всю текущую логику webhook и привязки в прокси.
- **Вариант B — webhook через модуль:** передавать в createTelegramBot токен из getTelegramToken (прокси как фасад: читает Firestore, отдаёт конфиг модулю). Роутер модуля обрабатывает только «общие» команды и callback; привязку и Mini App по-прежнему обрабатывать в прокси (например, отдельным middleware перед роутером модуля или делегированием из onMessage/onStateMessage в логику прокси). Так появится единая точка входа с rate limit и валидацией, без переноса всей бизнес-логики.

### 6.3 Унификация конфигурации

- Вынести список env-переменных Telegram в один файл (например, расширить `server/telegram-bot/.env.example` или общий `server/.env.example`) с комментариями: что используется прокси, что — модулем, если он будет подключён.

### 6.4 Логирование и мониторинг

- В прокси: единый формат лога для webhook (update_id, тип, chat_id, user_id, длительность обработки). Опционально — запись событий в Firestore/таблицу (аналог userLogger в модуле) для аудита и отладки.

### 6.5 Документация

- В README или в `docs/TELEGRAM_BOT_DEPLOY.md` явно описать: какой код обрабатывает webhook (прокси), какой модуль есть и что он даёт (state, rate limit, retry), и при каком сценарии его подключать. Так проще поддерживать и улучшать.

---

## 7. Готовность к улучшениям

- **Уже есть:** защищённый webhook (secret_token), привязка, уведомления, админка, Mini App, тикеты.
- **Улучшаем без смены стека:** retry в lib/telegram, rate limit и валидация body в прокси.
- **При желании модульности:** поэтапная интеграция telegram-bot (сначала retry/сервисы, при необходимости — общий роутер с делегированием в текущую логику).

Итог: текущая реализация в прокси — рабочая и полная для продукта; модуль telegram-bot — отдельный, готовый к подключению слой. Отчёт можно использовать как основу для плана улучшений и рефакторинга.
