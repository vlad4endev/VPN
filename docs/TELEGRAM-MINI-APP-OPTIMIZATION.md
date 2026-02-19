# Оптимизация Telegram Mini App (ЭТАП 2 — итог)

## Список внесённых изменений

### Backend (server/routes/telegram.routes.js)

1. **Ответ POST /api/telegram/auth расширен объектом `user`**  
   При успешной авторизации (session и initData) в ответе возвращается минимальный объект `user` (id, email, name, login, role, plan, expiresAt, tariffId, tariffName, photoURL). Клиент может сразу отобразить дашборд без дополнительного запроса к Firestore.

2. **Redis-кэширование по telegramId и session**  
   - По ключу `tma:user:<tgId>` кэшируется пара `{ uid, user }` (TTL 10 мин). При повторном входе по initData сначала проверяется кэш; при попадании — выдаётся customToken и user, Firestore обновляется новым session token в фоне.  
   - По ключу `tma:session:<sessionToken>` кэшируется `{ uid, user, sessionTokenExpiresAt }`. При входе по сессии сначала проверяется Redis; при попадании — ответ без запроса к Firestore.  
   - Используются опциональные `redisGet`/`redisSet`, передаваемые из основного сервера; при отсутствии Redis логика работает без кэша.

3. **Однократная проверка initData**  
   Если middleware уже установил `req.telegramUser` (валидный initData), маршрут использует его и не вызывает повторно `validateTelegramInitDataWithReasonAsync`. Убрана двойная HMAC и двойной вызов getTelegramToken для одного запроса.

4. **Логирование времени выполнения auth**  
   В конце обработки POST /api/telegram/auth вызывается опциональный `logTmaTiming(path, ms)`. Включение: `LOG_TMA_TIMING=1` или `LOG_REQUEST_MS=1` (или NODE_ENV=development). В лог пишется строка вида `[TMA] /api/telegram/auth 120ms`.

### Backend (server/n8n-webhook-proxy.js)

5. **Передача в createTelegramRouter**  
   В зависимости роутера добавлены: `redisGet`, `redisSet` (из `lib/redis.js`), `logTmaTiming`. Реализация `logTmaTiming`: при `LOG_TMA_TIMING=1` или `LOG_REQUEST_MS` логирует `[TMA] <path> <ms>ms`.

### Frontend (src/app/App.jsx)

6. **Использование `user` из ответа auth без блокирующего loadUserData**  
   - Добавлен ref `tmaUserFromAuthRef`: при успешном ответе от POST /api/telegram/auth (и по сессии, и по initData), если в ответе есть `data.user`, в ref сохраняется `{ uid: data.user.id, user: data.user }`.  
   - В `onAuthStateChanged` при появлении `firebaseUser` сначала проверяется, совпадает ли его uid с `tmaUserFromAuthRef.current.uid`; если да — выставляются `currentUser` и `view` из сохранённого user, вызываются `setLoading(false)` и `setAuthChecking(false)`, **loadUserData не вызывается**. Первый рендер дашборда происходит без ожидания getDoc к Firestore.  
   - То же поведение при успешном входе по кнопке «Войти через Telegram» (handleTelegramSignIn).

### Инфраструктура

7. **Индекс Firestore для `telegramSessionToken`**  
   В `firestore.indexes.json` добавлен индекс для коллекции `users_v4` по полю `telegramSessionToken` (ASC). Нужно задеплоить индексы: `firebase deploy --only firestore:indexes` (или аналог в вашем проекте).

---

## Ожидаемое ускорение первого запуска

- **Уход от блокирующего getDoc после auth:** первый осмысленный рендер (дашборд) больше не ждёт round-trip Firestore; данные берутся из ответа auth. Оценка: **сокращение на 50–200 мс** в зависимости от сети и региона Firestore.

- **Повторные открытия (тот же пользователь):** при включённом Redis попадание в кэш по session или по tgId даёт ответ без чтения Firestore. Оценка: **сокращение TTFB на 100–300 мс** при кэш-попадании.

- **Снижение нагрузки на auth:** однократная проверка initData (без повторной HMAC и getTelegramToken) уменьшает время обработки запроса и нагрузку на БД/кэш настроек.

---

## Новые метрики TTFB

- Включить логирование: `LOG_TMA_TIMING=1` или `LOG_REQUEST_MS=1`. В логах появятся строки вида `[TMA] /api/telegram/auth 85ms`.  
- Общее время ответа по запросу уже логируется существующим `requestTimeLogMiddleware` (при `LOG_REQUEST_MS` или в development).  
- Рекомендуется замерять: время до первых байт (TTFB) и полное время ответа для POST /api/telegram/auth; целевые значения при кэш-попадании — auth &lt; 150–200 ms.

---

## Рекомендации для масштабирования Mini App

1. **Redis обязателен** для кэша по tgId и session при нескольких инстансах API; без Redis кэш только in-memory и не разделяется между процессами.

2. **Инвалидация кэша:** при смене тарифа/подписки/роли пользователя желательно сбрасывать кэш по uid/tgId (например, удалять ключи `tma:user:<tgId>` и при необходимости `tma:session:<token>`). Пока TTL 10 минут ограничивает окно устаревания.

3. **Health-check и балансировщик:** продолжать использовать `GET /health` для проверки готовности инстанса; cold start уже не блокирует listen.

4. **Деплой индексов Firestore:** после изменений в `firestore.indexes.json` выполнить деплой индексов, иначе запросы по `telegramSessionToken` могут работать медленнее при росте коллекции.

5. **Мониторинг:** отслеживать доли ответов auth из кэша (по логам `fromCache: true`) и время ответа; при росте нагрузки рассмотреть отдельный быстрый endpoint только для TMA auth с минимальной логикой.

Бизнес-логика (find-or-create, выдача customToken и session, проверка initData) не менялась; изменены только способ доставки профиля клиенту, кэширование и устранение дублирования проверок.
