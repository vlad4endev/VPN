# Bot Builder — конструктор сценариев Telegram-бота

Модуль позволяет управлять ответами бота через CRUD API без изменения кода. Работает в рамках существующего webhook, одной БД (Firestore) и одного бизнес-сервиса.

## Структура

- **botbuilder.model.js** — модель BotScenario, нормализация полей, путь к коллекции Firestore.
- **botbuilder.service.js** — CRUD, поиск сценария по триггеру, загрузка/инвалидация кэша.
- **botbuilder.cache.js** — кэш сценариев: Redis (при `REDIS_URL`) или in-memory.
- **botbuilder.controller.js** — обработчики запросов (create, list, update, delete).
- **botbuilder.routes.js** — маршруты с проверкой роли admin.

## Модель BotScenario (Firestore)

Коллекция: `artifacts/{APP_ID}/public/data/bot_scenarios`.

| Поле           | Тип    | Описание |
|----------------|--------|----------|
| id             | string | ID документа (авто) |
| trigger_type   | string | `command` \| `text` \| `callback` |
| trigger_value  | string | Значение триггера (например `/start`, `PROFILE`, `hello`) |
| response_type  | string | `text` \| `keyboard` |
| response_text  | string | Текст ответа (поддерживается HTML) |
| keyboard_json  | object | Inline-клавиатура в формате Telegram: `{ inline_keyboard: [[...]] }` или массив рядов |
| created_at     | string | ISO 8601 |
| updated_at     | string | ISO 8601 |

## API (все маршруты требуют `Authorization: Bearer <token>` и роль admin)

- **POST** `/api/bot-builder/scenario` — создание сценария (body: trigger_type, trigger_value, response_type, response_text, keyboard_json?).
- **GET** `/api/bot-builder/scenarios` — список всех сценариев.
- **PUT** `/api/bot-builder/scenario/:id` — обновление сценария.
- **DELETE** `/api/bot-builder/scenario/:id` — удаление сценария.

## Интеграция с Telegram webhook

При получении `update`:

1. **callback_query**: поиск сценария по `trigger_type=callback`, `trigger_value=callback_data`. Если найден — `answerCallbackQuery` и `editMessageText` с `response_text` и `keyboard_json`.
2. **message** (текст): для текста, не являющегося `/start <token>` (привязка), поиск по `trigger_type=command` (если текст начинается с `/`) или `trigger_type=text`. Если найден — `sendMessage` с `response_text` и `reply_markup` из `keyboard_json`.
3. Если сценарий не найден — управление передаётся в существующий `businessService.handleUpdate` / `processUserAction`.

## Кэширование

- При старте сервера вызывается `loadScenariosIntoCache(db, APP_ID)` (с задержкой 2 с).
- При создании/обновлении/удалении сценария кэш инвалидируется и загружается заново.
- При обработке update сценарий берётся из кэша; при пустом кэше — загрузка из БД.
- Redis: задайте `REDIS_URL` (или `TELEGRAM_REDIS_URL`). Для Redis нужен пакет `ioredis` (`npm install ioredis` в `server/`). Без Redis используется in-memory кэш.

## Логирование

- Входящие update логируются через `logTelegramUpdate(update)` (update_id, kind).
- Ошибки при обработке bot-builder и при работе с кэшем пишутся в консоль.
