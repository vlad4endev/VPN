# Модуль Telegram

Привязка аккаунта к Telegram-боту, уведомления об оплате и напоминания о продлении подписки.

## Ожидаемая архитектура

```
Telegram  ──────────────────►  POST /api/telegram/webhook
                                      │
Web (браузер, SPA)  ─────────►  /api/…  (auth, vpn, payment, admin, …)
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │  Один backend (Express, один процесс) │
                    │  • Один userService (users_v4, tgId)  │
                    │  • Одна бизнес-логика (сервисы, n8n)  │
                    │  • Одна база данных (Firestore)        │
                    └─────────────────────────────────────┘
```

**Оба канала (Telegram и Web) используют:**

| Компонент | Реализация |
|-----------|------------|
| Один backend | Один процесс Node.js (`n8n-webhook-proxy.js`), один Express `app`. |
| Один userService | Поиск/создание пользователей по `tgId` и работа с `users_v4` — `server/services/userService.js` (используется и в web-авторизации по Telegram, и в обработке webhook). |
| Одна бизнес-логика | Команды бота, привязка, платежи, VPN — общие сервисы и вызовы n8n; Telegram-ветка: `telegramBusinessService`, web-ветка: те же Firestore, те же workflow. |
| Одна база данных | Firestore: коллекции `users_v4`, `telegram_binds`, платежи, тикеты и т.д. — общие для веб и бота. |

**Результат:** Telegram-бот и веб-сервис работают параллельно в одном проекте и используют одинаковые данные (один пользователь — один профиль и в боте, и в личном кабинете).

---

## Архитектура после реализации (production-ready)

Целевая схема с защищённым webhook, очередью и общей бизнес-логикой:

```
Telegram
    ↓
Webhook (с secret проверкой + rate limit)
    ↓
Queue (BullMQ)
    ↓
Worker
    ↓
telegram.service
    ↓
businessService
    ↓
База (Firestore)

Web API
    ↓
businessService
    ↓
Та же база
```

| Этап | Назначение |
|------|------------|
| **Webhook** | Единственная точка входа от Telegram. Проверка `X-Telegram-Bot-Api-Secret-Token` (secret). Ответ 200 OK сразу. |
| **Rate limit** | Ограничение запросов на webhook (по IP или по chat_id), защита от спама и DDoS. |
| **Queue (BullMQ)** | Постановка update в очередь (Redis). Webhook не блокируется, обработка асинхронная. |
| **Worker** | Consumer очереди: забирает задачу, вызывает telegram.service → businessService. Масштабируется отдельно (несколько воркеров). |
| **telegram.service** | Валидация update, userService.findOrCreateByTelegramId, вызов businessService.processUserAction / handleUpdate. |
| **businessService** | Общая логика: команды, привязка, PROFILE/HELP, платежи, VPN. Одна и та же для Telegram и Web API. |
| **База** | Firestore (users_v4, telegram_binds, платежи и т.д.) — одна для всего backend. |

**Результат:**

- **Production-ready Telegram интеграция** — webhook + очередь + воркер.
- **Безопасный webhook** — проверка secret_token, быстрый 200 OK.
- **Защита от спама** — rate limit на endpoint webhook.
- **Масштабируемость** — несколько воркеров, Redis-очередь.
- **Общая логика** — businessService для Telegram и Web.
- **Одна БД** — Firestore для всех каналов.
- **Один backend** — один Express-сервер; воркер может быть в том же процессе (in-process) или отдельным.

**Текущее состояние:** реализованы webhook с проверкой secret, telegram.service, businessService, одна БД. Для полной схемы добавить: rate limit на маршрут webhook, BullMQ + Redis, воркер (вызов telegram.service из job).

---

## Архитектура бота (требования)

Telegram-бот встроен в **тот же Node.js/Express-сервер** (n8n-webhook-proxy), без отдельного сервиса:

| Требование | Реализация |
|------------|------------|
| Один сервер | Все маршруты в `server/n8n-webhook-proxy.js` (Express). Telegram-роуты вынесены в `server/routes/telegram.routes.js` и подключаются как `app.use("/api/telegram", telegramRoutes)`. |
| Без polling | Используется только **webhook**: Telegram шлёт обновления на `POST /api/telegram/webhook`. |
| Общая бизнес-логика | Привязка аккаунта, Mini App (создание/удаление VPN) вызывают те же функции и n8n webhooks, что и Web API. |
| Общая база | Пользователи и привязки — Firestore (`users_v4`, `telegram_binds`). |
| Существующие маршруты | Маршруты не меняются; бот добавляет только `/api/telegram/*` и админские `/api/admin/telegram/*`. |

Установка webhook в Telegram выполняется через админ-API: `POST /api/admin/telegram/set-webhook` (см. ниже).

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

### 3. Webhook бота (обязательно для привязки и команд)

Бот работает **только по webhook** (polling не используется). Чтобы Telegram слал обновления на ваш сервер:

1. Убедитесь, что сервер доступен по **HTTPS** по публичному URL.
2. Установите webhook одним из способов:

**Вариант A — через админ-API (рекомендуется):** авторизуйтесь как админ и выполните:

```bash
curl -X POST "https://your-domain.com/api/admin/telegram/set-webhook" \
  -H "Authorization: Bearer <Firebase_ID_token>"
```

Сервер сам подставит `PUBLIC_URL`/`FRONTEND_URL` и вызовет Telegram `setWebhook`. Если задан `TELEGRAM_WEBHOOK_SECRET`, он будет передан как `secret_token` (Telegram будет присылать заголовок `X-Telegram-Bot-Api-Secret-Token` для проверки).

**Вариант B — вручную через Telegram API:**

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-domain.com/api/telegram/webhook"}'
```

После этого обновления (сообщения, callback_query) приходят на `POST /api/telegram/webhook`. Проверить статус: `GET /api/admin/telegram/webhook-status`.

**Гарантии:**

- **Polling нигде не используется** — в коде нет вызовов `getUpdates`; бот получает обновления только через webhook (`POST /api/telegram/webhook`).
- **Webhook установлен только один** — у бота может быть ровно один URL (ограничение Telegram API). Установка выполняется в одном месте: `POST /api/admin/telegram/set-webhook` (или вручную через Telegram API). Повторный вызов `setWebhook` просто заменяет предыдущий URL на новый.

### 4. Настройка Telegram-бота через интерфейс

Всю настройку бота можно выполнить из админ-панели, без правки `.env` и без вызова API вручную.

**Где находится:** **Админ-панель** → раздел **Интеграции** → **Telegram** (вкладка «Telegram»).

**Что доступно в панели:**

| Элемент | Описание |
|--------|----------|
| **Сохранённые данные** | Текущее состояние: задан ли токен бота, username бота (@…), Chat ID для уведомлений админа. |
| **Токен бота** | Поле для ввода токена от [@BotFather](https://t.me/BotFather). Кнопка **Сохранить** — токен записывается в Firestore (без необходимости прописывать его в `server/.env`). |
| **Webhook** | Кнопка **Webhook** — установка webhook в Telegram одним нажатием. URL берётся с сервера (`PUBLIC_URL` / `FRONTEND_URL` или заголовки запроса). Доступна после сохранения токена. |
| **Chat ID админа** | Поле для Telegram ID чата/пользователя, куда приходят уведомления о новых тикетах поддержки. Кнопка **Сохранить** — сохраняет в настройках. |
| **Тест** | Поле «Тест: Chat ID» и кнопка **Тест** — отправка тестового сообщения на указанный Telegram ID (проверка работы бота). |
| **Подробнее** | Раскрывающийся блок: текущий URL webhook (с кнопкой копирования), подсказки по переменным окружения. |

**Порядок настройки через интерфейс:**

1. Создайте бота в [@BotFather](https://t.me/BotFather) и скопируйте токен.
2. Войдите в админ-панель под учётной записью с правами администратора.
3. Откройте **Интеграции** → **Telegram**.
4. Вставьте токен в поле «Токен бота» и нажмите **Сохранить**.
5. Нажмите **Webhook** — webhook будет зарегистрирован в Telegram (сервер должен быть доступен по HTTPS по `PUBLIC_URL`/`FRONTEND_URL`).
6. При необходимости укажите **Chat ID** для уведомлений о тикетах и нажмите **Сохранить**.
7. Для проверки введите свой Telegram ID в поле «Тест: Chat ID» и нажмите **Тест** — должно прийти тестовое сообщение.

Токен и Chat ID админа хранятся в Firestore (`artifacts/<APP_ID>/public/settings`). Если в `server/.env` задан `TELEGRAM_BOT_TOKEN`, он имеет приоритет; иначе используется значение из панели.

### 5. Сценарий бота (конструктор)

В разделе **Интеграции** → **Telegram** доступна вкладка **«Сценарий бота»** — мини-конструктор поведения бота без правки кода.

| Элемент | Описание |
|--------|----------|
| **Приветствие** | Текст второго сообщения после `/start` (после отправки главного меню). |
| **Главное меню** | Текст сообщения с кнопками (при `/start`, `/menu` и при нажатии «Меню»). Поддерживается HTML. |
| **Кнопки меню** | Ряды кнопок. Для каждой кнопки: тип (**Web App** — открыть приложение, **Ссылка** — URL, **Callback** — действие), подпись, URL или `callback_data` (например `PROFILE`, `HELP`, `MENU`). Можно добавлять/удалять ряды и кнопки. |
| **Ответы на кнопки** | Тексты (HTML) для действий `PROFILE`, `HELP`, `MENU`. Если не заданы, используются стандартные. |

Сценарий сохраняется в Firestore (`artifacts/<APP_ID>/public/settings.telegramBotScenario`) и применяется ботом сразу после сохранения. API: `GET /api/admin/telegram/scenario`, `PATCH /api/admin/telegram/scenario` (тело: `{ "scenario": { "welcomeMessage", "menuMessage", "menuButtons", "callbackResponses" } }`).

## API (сервер)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/telegram/webhook` | **Webhook от Telegram** (обновления бота). Обрабатывает `/start`, `/start <token>`, `/menu`, callback_query, web_app_data. Ответ 200 отдаётся сразу; обработка — без блокировки. |
| POST | `/api/telegram/verify` | **Удалённая проверка** (для сценария «B запрашивает у A»). Заголовок `X-Telegram-Verify-Secret` или `Authorization: Bearer <secret>`. Тело: `{ "type": "initData", "initData": "..." }` или `{ "type": "widget", "widgetUser": { ... } }`. Ответ: `{ ok: true, tgId, user? }` или `{ ok: false, reason, message }`. Вызывается только сервером B (у которого нет токена бота). |
| GET | `/api/telegram/bind-link` | Выдать ссылку для привязки. Требуется `Authorization: Bearer <Firebase ID token>`. |
| POST | `/api/telegram/unbind` | Отвязать Telegram от текущего пользователя. Требуется авторизация. |
| POST | `/api/telegram/send-reminders` | Отправить напоминания об истечении подписки (для вызова из cron). Заголовок `X-Telegram-Secret` или тело `{ "secret": "…" }` должен совпадать с `TELEGRAM_WEBHOOK_SECRET`. |
| GET | `/api/admin/telegram/status` | Статус настроек: задан ли токен, username бота, Chat ID админа (для панели «Telegram»). |
| PATCH | `/api/admin/telegram/settings` | Сохранить токен и/или Chat ID админа в Firestore (тело: `{ "token": "…", "adminChatId": "…" }`). |
| POST | `/api/admin/telegram/set-webhook` | Установить webhook в Telegram (только админ). URL берётся из запроса/`PUBLIC_URL`. |
| GET | `/api/admin/telegram/webhook-status` | Текущий webhook в Telegram (только админ). |
| GET | `/api/admin/telegram/chat-info` | Информация о чате по сохранённому Chat ID админа (getChat). |
| POST | `/api/admin/telegram/send-test` | Отправить тестовое сообщение на указанный `chatId` (тело: `{ "chatId": "…" }`). |
| GET | `/api/admin/telegram/scenario` | Получить сценарий бота (тексты и кнопки). Только админ. |
| PATCH | `/api/admin/telegram/scenario` | Сохранить сценарий бота (тело: `{ "scenario": { "welcomeMessage", "menuMessage", "menuButtons", "callbackResponses" } }`). Только админ. |

## Напоминания (cron)

Чтобы раз в день (или по расписанию) отправлять напоминания в Telegram:

```bash
curl -X POST "https://your-domain.com/api/telegram/send-reminders" \
  -H "X-Telegram-Secret: your-secret" \
  -H "Content-Type: application/json"
```

Сервер найдёт пользователей с заполненным `tgId` и датой окончания подписки в ближайшие 7 дней (или уже истёкшей) и отправит им сообщение с предложением продлить подписку.

## Удалённая проверка Telegram (B запрашивает у A)

Если **API-сервер (B)** не имеет токена бота (например, отдельный инстанс без доступа к секретам), а **сервер с ботом (A)** — имеет, можно настроить проверку так, чтобы B запрашивал проверку у A.

**Сервер A** (с `TELEGRAM_BOT_TOKEN`):

- Задайте в `.env`: `TELEGRAM_VERIFY_SECRET=<общий_секрет>`.
- Эндпоинт `POST /api/telegram/verify` уже включён: он проверяет заголовок `X-Telegram-Verify-Secret` (или `Authorization: Bearer <secret>`) и по телу `{ type: "initData", initData }` или `{ type: "widget", widgetUser }` выполняет локальную валидацию и возвращает `{ ok: true, tgId, user? }` или `{ ok: false, reason, message }`.

**Сервер B** (без токена бота):

- Задайте в `.env`: `TELEGRAM_VERIFY_URL=<базовый URL сервера A>`, `TELEGRAM_VERIFY_SECRET=<тот же секрет>`. Опционально: `TELEGRAM_VERIFY_TIMEOUT_MS=10000`.
- При вызове `POST /api/telegram/auth` (initData) или `POST /api/telegram/auth-widget` (виджет) сервер B при отсутствии локального токена сам отправит запрос на A (`POST .../api/telegram/verify`), получит `tgId` (и при необходимости `user`) и продолжит выдачу customToken и создание/обновление пользователя как обычно.

Итог: один инстанс с ботом (A) хранит токен и проверяет данные; второй инстанс (B) делегирует проверку A и по ответу выдаёт авторизацию.

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

---

## Авторизация через Telegram (Mini App)

При открытии в Telegram Mini App пользователь может войти без email/пароля: сессия подтягивается из `initData`.

### Как работает

1. **Авто-вход**: после загрузки приложения, если нет текущего пользователя Firebase и есть `initData`, фронт один раз вызывает `POST /api/telegram/auth` с заголовком `X-Telegram-InitData`. Бэкенд валидирует initData, ищет пользователя в Firestore по полю `tgId` (равному Telegram `user.id`). Если найден — возвращает Firebase **customToken** для этого пользователя; если не найден — создаёт документ в `users_v4` с id `tg_<telegram_user_id>` и возвращает customToken для него. Фронт вызывает `signInWithCustomToken(auth, customToken)` — дальше срабатывает обычный `onAuthStateChanged` и подгрузка данных из Firestore.
2. **Кнопка «Войти через Telegram»**: на экране приветствия и на форме входа в Mini App показывается кнопка «Войти через Telegram» (только при наличии `initData`). По нажатию выполняется тот же запрос к `/api/telegram/auth` и вход по customToken.

### API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/telegram/auth` | Тело: `{ "initData": "..." }` или заголовок `X-Telegram-InitData`. Ответ: `{ success: true, customToken: "..." }` или `{ success: false, error: "..." }`. |

### Пользователи только из Telegram

Для пользователей, созданных только через Mini App (без email), в Firestore создаётся документ с id `tg_<telegram_user_id>`, email `tg_<id>@telegram.placeholder`, именем из Telegram (`first_name` / `last_name` / `username`). Поле `tgId` заполняется для последующей привязки и уведомлений.

### Ошибки входа через Telegram (initData)

Ответ API при ошибке: `{ success: false, error: "...", reason: "..." }`. По полю `reason` можно понять причину:

| reason | Что значит | Что сделать |
|--------|-----------|-------------|
| `empty` | initData не передан или пустая строка | Открыть приложение из Telegram (меню бота или ссылка t.me/bot/app), не из обычного браузера. |
| `no_token` | На сервере не задан токен бота | Задать TELEGRAM_BOT_TOKEN в server/.env или сохранить токен в админке → Telegram. |
| `no_hash` | В данных нет подписи | Закрыть и снова открыть приложение из того же бота. |
| `invalid_hash` | Подпись не совпадает | Токен бота на сервере должен быть от **того же бота**, из которого открыто Mini App. Проверить в BotFather и в админке. |
| `expired` | Сессия старше 24 часов | Открыть приложение заново из меню бота. |
| `no_user`, `parse_error` | Некорректные данные пользователя | Открыть приложение заново из меню бота. |

#### Если видите «Неверная подпись данных. Убедитесь, что открываете приложение из того же бота...»

Ошибка `invalid_hash` значит: приложение открыто из одного бота, а на сервере прописан токен **другого** бота (или старый/неверный токен). Подпись initData считается от токена бота, из которого пользователь открыл Mini App; если токен на сервере не совпадает — подпись не сойдётся.

**Что сделать по шагам:**

1. **Узнать, из какого бота открывают приложение**  
   Пользователь должен открывать приложение именно из того бота, для которого настроен сервер (например, ссылка вида `t.me/YourBotName/app` или кнопка в меню этого бота).

2. **Проверить токен на сервере**  
   - В **server/.env**: переменная `TELEGRAM_BOT_TOKEN` должна содержать токен **этого же** бота (скопировать в BotFather: @BotFather → ваш бот → API Token).  
   - Если токен задаётся в **админке** (Интеграции → Telegram): в поле «Токен бота» должен быть токен того же бота, из которого открывают Mini App.  
   - Приоритет: сначала используется `TELEGRAM_BOT_TOKEN` из .env; если его нет — берётся значение из Firestore (админка).

3. **Один бот для Mini App**  
   У одного приложения (одна ссылка Mini App) должен быть один бот. Нельзя открыть приложение из @BotA, а на сервере указать токен @BotB — подпись будет неверной.

4. **После смены токена**  
   Перезапустите backend (чтобы подхватить новый .env или перечитать настройки). Пользователю — закрыть и снова открыть приложение из меню бота (чтобы получить свежий initData).

Если видите общую фразу вроде «Невалидные данные Telegram (initData)», обновите бэкенд до последней версии (в ней возвращаются конкретные сообщения и reason).

### Telegram Login Widget (вход с обычного сайта)

Для входа и **регистрации** с обычного сайта (браузер, не Mini App) используется [Login Widget](https://core.telegram.org/widgets/login). Показывается на Welcome и в форме входа/регистрации, когда `!isTelegramApp` и задан `VITE_TELEGRAM_BOT_USERNAME` (например `skypathvpn_bot`). При первом входе через виджет пользователь автоматически создаётся в системе (регистрация).

1. Пользователь нажимает «Log in with Telegram» в виджете.
2. Telegram открывает OAuth и возвращает данные в `onauth` callback.
3. Клиент отправляет данные на `POST /api/telegram/auth-widget`.
4. Сервер проверяет `hash` (HMAC-SHA256 по [алгоритму Telegram](https://core.telegram.org/widgets/login#checking-authorization): `secret_key = SHA256(bot_token)`, `hash = HMAC-SHA256(data_check_string, secret_key)`), ищет/создаёт пользователя по `tgId`, возвращает `customToken` и `sessionToken`.
5. Клиент вызывает `signInWithCustomToken`.

Реализация проверки на сервере — `validateTelegramWidgetData()` в `server/n8n-webhook-proxy.js`; логика совпадает с официальным PHP-примером (проверка подписи и `auth_date` не старше 24 ч).

В нашем приложении после входа через виджет сохраняются `sessionToken` и срок в `localStorage` (и сессия в Firestore), а не cookie; повторный вход возможен по сессии без повторного OAuth. Аналог «показать виджет, если не авторизован» — проверка `firebaseUser` и отображение виджета на Welcome/Login при `!firebaseUser`.

У виджета задан `data-auth-url` на текущий URL сайта: если Telegram делает полный редирект (часто на мобильных), пользователь возвращается на сайт с параметрами `?id=...&hash=...` в URL; приложение обрабатывает их и завершает вход автоматически.

#### Если «только переводит на бота» и вход не завершается

1. **Виджет (браузер):** убедитесь, что после нажатия «Log in with Telegram» и авторизации в Telegram вы возвращаетесь на **тот же домен** (например `https://your-site.com`). Если открываете сайт с другого домена (или localhost vs прод), редирект может вести не туда. В логах сервера ищите `[TMA]` и `widget_request` / `initData_ok` / `initData_fail`.
2. **Токен бота:** на сервере должен быть задан тот же токен, что и у бота (BotFather). Проверьте `TELEGRAM_BOT_TOKEN` в `server/.env` или настройки Telegram в админке. При неверном токене виджет вернёт `invalid_hash`.
3. **Mini App (открыли по ссылке t.me/bot/app):** в BotFather у бота в разделе Mini App должен быть указан **URL вашего приложения** (HTTPS). Тогда Telegram передаёт initData, и авто-вход сработает. В логах сервера при открытии Mini App должны быть события `[TMA]` (request, initData_ok или initData_fail).
4. **CORS и API:** запросы к `POST /api/telegram/auth-widget` и `/api/telegram/auth` должны идти на тот же домен, что и фронт, или CORS должен разрешать ваш домен. Проверьте `VITE_API_BASE_URL` и доступность API с фронта.

### Логи входа и действий через Telegram

**Сервер (консоль):** все действия по Telegram-авторизации пишутся с префиксом `[TMA]` в одну строку (JSON). Фильтр: `grep TMA` или просмотр вывода процесса.

| event | Когда |
|-------|--------|
| `request` | Пришёл запрос на POST /api/telegram/auth (hasSessionToken, hasInitData). |
| `session_ok` | Вход по сессии успешен (uid). |
| `session_fail` | Сессия не подошла (reason: expired, token_not_found). |
| `initData_fail` | Валидация initData не прошла (reason, message). |
| `initData_ok` | Вход по initData успешен (uid, tgId, created). |
| `error` | Исключение (step, message). |
| `middleware_user` | В другом запросе по заголовку X-Telegram-InitData определён пользователь (tgUserId, path). |
| `middleware_initData_fail` | В другом запросе initData не прошёл валидацию (reason, path). |

**Клиент (панель логов в приложении):** категория **TelegramAuth**. Открыть панель логов (иконка/меню) и отфильтровать по категории «TelegramAuth» — видны шаги авто-входа (сессия/initData, ответ, успех/ошибка) и нажатие кнопки «Войти через Telegram».
