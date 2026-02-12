# Модуль Telegram

Привязка аккаунта к Telegram-боту, уведомления об оплате и напоминания о продлении подписки.

## Возможности

- **Привязка аккаунта** — пользователь в профиле (Личный кабинет → Профиль) нажимает «Привязать Telegram», получает ссылку на бота с одноразовым токеном. После нажатия Start в боте аккаунт привязывается (в профиле сохраняется `tgId`).
- **Уведомление об оплате** — после успешной оплаты и активации подписки пользователю с привязанным Telegram отправляется сообщение: «Оплата принята. Подписка … активирована до …».
- **Напоминания об истечении** — endpoint для cron: отправка сообщений пользователям, у которых подписка истекает в ближайшие 7 дней (или уже истекла).

## Настройка

### 1. Создание бота

1. В Telegram откройте [@BotFather](https://t.me/BotFather).
2. Создайте бота: `/newbot`, укажите имя и username.
3. Скопируйте выданный **токен** (например, `123456:ABC-DEF...`).

### 2. Переменные окружения (сервер)

В `.env` или окружении сервера:

```env
# Токен бота (обязательно для привязки и уведомлений)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# Секрет для вызова отправки напоминаний (cron) — опционально
TELEGRAM_WEBHOOK_SECRET=your-secret
```

### 3. Webhook бота (для привязки по ссылке)

Чтобы бот обрабатывал команду `/start <token>` и привязывал аккаунт, Telegram должен слать обновления на ваш сервер:

1. Убедитесь, что прокси (n8n-webhook-proxy) доступен по HTTPS.
2. Установите webhook (один раз), подставив свой URL и токен:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-domain.com/api/telegram/webhook"
```

После этого все обновления (сообщения пользователей) будут приходить на `POST /api/telegram/webhook`.

## API (сервер)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/telegram/webhook` | Webhook от Telegram (обновления бота). Обрабатывает `/start` и `/start <token>`. |
| GET | `/api/telegram/bind-link` | Выдать ссылку для привязки. Требуется `Authorization: Bearer <Firebase ID token>`. |
| POST | `/api/telegram/unbind` | Отвязать Telegram от текущего пользователя. Требуется авторизация. |
| POST | `/api/telegram/send-reminders` | Отправить напоминания об истечении подписки (для вызова из cron). Заголовок `X-Telegram-Secret` или тело `{ "secret": "…" }` должен совпадать с `TELEGRAM_WEBHOOK_SECRET`. |

## Напоминания (cron)

Чтобы раз в день (или по расписанию) отправлять напоминания в Telegram:

```bash
curl -X POST "https://your-domain.com/api/telegram/send-reminders" \
  -H "X-Telegram-Secret: your-secret" \
  -H "Content-Type: application/json"
```

Сервер найдёт пользователей с заполненным `tgId` и датой окончания подписки в ближайшие 7 дней (или уже истёкшей) и отправит им сообщение с предложением продлить подписку.

## Структура (фронтенд)

- `src/features/telegram/services/telegramService.js` — запросы к API (bind-link, unbind).
- `src/features/telegram/hooks/useTelegram.js` — хук: статус привязки, получение ссылки, отвязка.
- `src/features/telegram/components/TelegramBindCard.jsx` — блок в профиле: «Привязать Telegram», ссылка, отвязка.

Блок Telegram выводится на вкладке «Профиль» в личном кабинете.

## Firestore

- В документе пользователя (`users_v4/{userId}`) поле **tgId** хранит Telegram `chat_id` после привязки.
- Коллекция **telegram_binds** (документы с одноразовым токеном и `userId`) используется только сервером для привязки по ссылке; срок жизни записи — 15 минут.

---

## Telegram Mini App (TMA)

Интеграция Mini App позволяет открывать личный кабинет из бота (меню или прямая ссылка `t.me/bot/app`) и сохранять данные с привязкой к Telegram `user.id`.

### Как это устроено

- В **index.html** подключён `telegram-web-app.js` и скрипт, который при наличии `Telegram.WebApp.initData` сохраняет его в `window.__TELEGRAM_INIT_DATA` и перехватывает `fetch`/добавляет заголовок в axios, чтобы каждый запрос к API нёс заголовок **X-Telegram-InitData**.
- **Backend** (middleware в n8n-webhook-proxy): при наличии заголовка валидирует initData через HMAC-SHA256 (секрет из `TELEGRAM_BOT_TOKEN`) и выставляет `req.telegramUser`. Для роутов `/api/vpn/add-client`, `/api/vpn/delete-client`, `/api/vpn/sync-user` в тело запроса к n8n добавляется **telegramUserId** (если валидация прошла), чтобы n8n/3x-ui могли привязать конфиг к пользователю Telegram.

### Требования

- В `.env` должен быть задан **TELEGRAM_BOT_TOKEN** (тот же, что для бота). Без него валидация initData не выполняется, запросы работают как раньше (fallback по Firebase/session).
- CORS: заголовок `X-Telegram-InitData` разрешён в `allowedHeaders`.

### Тестовый план (3 сценария)

1. **Обычный браузер**: открыть `https://your-service.com` — всё работает как раньше, без initData.
2. **Бот → Mini App**: открыть приложение из меню бота (@yourbot → кнопка приложения) — в консоли браузера «TMA detected», в логах backend «Telegram user: 123456789», данные сохраняются с `telegramUserId`.
3. **Прямая ссылка**: открыть `t.me/yourbot/app` — то же поведение: initData передаётся, данные сохраняются с Telegram user.id.

Проверить логи: Frontend console — `TMA detected`; Backend — `Telegram user: <id>`.
