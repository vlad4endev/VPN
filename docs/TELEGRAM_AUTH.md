# TelegramAuth — полное описание

Система авторизации через Telegram Mini App (TMA): проверка initData на сервере (HMAC-SHA256), выдача Firebase customToken, httpOnly cookie и логирование.

---

## 1. Файлы и роли

| Файл | Роль |
|------|------|
| **src/features/telegram/utils/tmaLogger.js** | Клиент: буфер логов TMA, категория `TelegramAuth`, санитизация токенов. `tmaLog(level, event, message, data)`. |
| **src/features/telegram/utils/tmaPath.js** | Клиент: `isTmaPath(path)`, `isOpenedInTelegramWebView()`. |
| **src/app/App.jsx** | Клиент: проверка `tg`/initData на `/t`, view `open_in_browser_fallback` / `open_from_bot_instructions`, авто-вход (session → initData), кнопка «Войти через Telegram», Login Widget, вызовы `tmaLog` и `logger.info('TelegramAuth', ...)`. |
| **src/features/telegram/components/TmaLogPanel.jsx** | Клиент: панель «Логи TMA» на экранах `/t`, показывает `getTmaLogs()`. |
| **server/lib/telegramInitDataValidation.js** | Сервер: валидация initData (HMAC-SHA256 по [спеку](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)). |
| **server/routes/telegram.routes.js** | Сервер: POST `/api/telegram/auth`, `/auth-widget`, `/logout`, `/verify`; вызовы `logTelegramAuth(event, data)`. |
| **server/n8n-webhook-proxy.js** | Сервер: реализация `logTelegramAuth`, буфер `tmaLogBuffer`, `validateTelegramInitDataWithReasonAsync`, middleware по initData, GET `/api/admin/telegram/logs`. |

---

## 2. Клиент: логирование (TelegramAuth)

- **Категория:** `TelegramAuth` (в `tmaLogger.js`: `CATEGORY = 'TelegramAuth'`).
- **Функция:** `tmaLog(level, event, message, data)` — пишет в кольцевой буфер (до 150 записей) и в `logger[level](CATEGORY, logMessage, payload)`. Чувствительные поля (initData, token, hash и т.д.) в `data` подменяются на `'(скрыто)'`.
- **События на клиенте:** `tma_check`, `auth_session_request`, `auth_session_ok`, `auth_initdata_ok`, `auth_fail_initData`, `auth_error_initData`, `auth_error_session`, `auth_error_firebase`, `screen_shown`, `button_click`, `button_session_request`, `button_initdata_request`, `button_success`, `button_error`, `widget_request`, `widget_success`, `widget_redirect`, `logout`, `bootstrap_tma`, `user_from_auth`.

---

## 3. Сервер: логирование (logTelegramAuth)

- **Функция:** `logTelegramAuth(event, data)` в `n8n-webhook-proxy.js`: пишет в консоль (`[TMA] {...}`) и в буфер `tmaLogBuffer` (до 200 записей). По буферу отдаётся GET `/api/admin/telegram/logs`.
- **События на сервере:**

| event | Когда |
|-------|--------|
| `request` | POST /api/telegram/auth (hasSessionToken, hasInitData). |
| `session_ok` | Вход по cookie сессии успешен. |
| `session_fail` | Сессия истекла или токен не найден. |
| `invalid_signature` | HMAC initData не совпал (403). |
| `expired_initData` | auth_date старше лимита (24h). |
| `auth_success` | Успешный вход по initData (created: true/false). |
| `firebase_error` | Ошибка Firebase/DB при создании customToken или обновлении пользователя. |
| `auth_fail` | Другая ошибка валидации/авторизации. |
| `logout` | POST /api/telegram/logout. |
| `widget_request` | Запрос на /auth-widget. |
| `initData_fail` / `initData_ok` | Результат проверки виджета. |
| `error` | Ошибка инициализации/виджета. |
| `middleware_user` / `middleware_initData_fail` | Middleware: пользователь из initData или отказ. |

---

## 4. Клиент: сценарии на `/t`

1. **Браузер (нет `Telegram.WebApp`):** не TMA. `setView('welcome')`, `history.replaceState('/', …)` — TMA блок не показывается.
2. **Telegram, пустой initData:** `setView('open_from_bot_instructions')` — экран «Откройте Mini App из меню бота».
3. **Telegram, есть initData:** `setTmaInitDataFromCheck(initData)` → эффект авто-входа: сначала запрос по сессии (cookie), при отказе — POST initData на `/api/telegram/auth` → при успехе `signInWithCustomToken(customToken)` → Dashboard.

Авто-вход выполняется один раз за сессию (ref + при необходимости sessionStorage), без повторов.

---

## 5. Сервер: POST /api/telegram/auth

- **Вход по сессии:** cookie `tma_session_token` или заголовок/body `sessionToken`. Проверка в Firestore по `telegramSessionToken` и сроку. При успехе — `customToken`, обновление cookie, ответ `{ success, customToken, uid, user }`.
- **Вход по initData:** заголовок `X-Telegram-InitData` или body `initData`. Валидация через `validateTelegramInitDataWithReasonAsync` (HMAC-SHA256 в `server/lib/telegramInitDataValidation.js`). При неверной подписи — 403 `{ reason: 'auth_fail', code: 'invalid_signature', error }`. При успехе — поиск/создание пользователя по `tgId`, выдача customToken, установка httpOnly cookie `tma_session_token`, ответ `{ success, customToken, uid, user, sessionToken, sessionTokenExpiresAt }`.

---

## 6. Валидация initData (HMAC-SHA256)

- **Файл:** `server/lib/telegramInitDataValidation.js`.
- **Шаги:** разбор query-строки без URL-decode для подписи; извлечение `hash`; сортировка пар key=value по ключу; строка `data_check_string` = пары через `\n`; `secret_key = HMAC_SHA256("WebAppData", botToken)`; `computed_hash = HMAC_SHA256(secret_key, data_check_string).hex`; сравнение с `hash` из initData; при совпадении — проверка `auth_date` (по умолчанию 24 ч) и извлечение `user` из JSON.

---

## 7. Cookie и ответы

- **Cookie:** `tma_session_token` — httpOnly, secure в production, sameSite=lax, path=/, maxAge по TELEGRAM_SESSION_TTL_MS.
- **Ответ при ошибке подписи:** HTTP 403, `{ reason: 'auth_fail', code: 'invalid_signature', error: string }`.
- **Ответ при успехе:** HTTP 200, `{ success: true, customToken, uid, user, sessionToken?, sessionTokenExpiresAt? }`.

---

## 8. Просмотр логов

- **В Mini App:** кнопка «Логи TMA» (TmaLogPanel) — буфер из `tmaLogger.js` (клиентские события).
- **В админке:** раздел Telegram / логи — GET `/api/admin/telegram/logs?limit=...` — буфер `tmaLogBuffer` с сервера (события `logTelegramAuth`).

Вся логика, связанная с авторизацией TMA и логами под маркой TelegramAuth, описана выше.
