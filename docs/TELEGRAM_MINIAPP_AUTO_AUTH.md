# Автоматическая авторизация через Telegram Mini App (WebApp)

Документ описывает архитектуру и реализацию входа в личный кабинет **только через Telegram**: пользователь открывает Mini App из бота и попадает в кабинет без логина/пароля. Backend: **Node.js (Express)**. БД: **Firestore**. Идентификация пользователя: **Firebase Auth (customToken)** + серверная сессия (**sessionToken**).

## Отдельная ссылка для Telegram Mini App

Для бота можно использовать **отдельный URL** мини-интерфейса:

- **`/t`** или **`/telegram`** — отдельная страница только для входа по Telegram ID и личного кабинета.
- При открытии **из Telegram** (с `initData`): автоматический вход по Telegram ID → отображается личный кабинет этого пользователя (подписка, профиль, платежи) в компактном виде без основного сайдбара.
- При открытии **в обычном браузере** (без Telegram): показывается подсказка «Откройте эту ссылку из меню бота в Telegram».
- Поддержка пути **`/t/<telegram_id>`** не обязательна: идентификация по `initData` на бэкенде; пользователь всегда видит кабинет, привязанный к своему Telegram ID.

**Рекомендуемый URL Mini App в настройках бота:** `https://ваш-домен/t` или `https://ваш-домен/telegram`.

---

## 1. Архитектура

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TELEGRAM MINI APP (Frontend)                        │
│  • Telegram.WebApp.initData (query string с hash, user, auth_date)           │
│  • При загрузке: сохранить sessionToken в localStorage (если есть)          │
│  • Запрос 1: POST /api/telegram/auth + X-Telegram-Session-Token (если есть) │
│  • Запрос 2: при 401/истечении — POST /api/telegram/auth + X-Telegram-InitData│
│  • Ответ: { customToken, sessionToken?, sessionTokenExpiresAt? }            │
│  • signInWithCustomToken(customToken) → Firebase Auth → доступ к API         │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Node.js / Express)                      │
│                                                                               │
│  Middleware (опционально):                                                     │
│    • Читает X-Telegram-InitData или query.initData                            │
│    • Валидирует initData → req.telegramUser (не блокирует при отсутствии)   │
│                                                                               │
│  POST /api/telegram/auth:                                                     │
│    1) Если передан sessionToken → проверить в Firestore (telegramSessionToken)│
│       → если валиден и не истёк → createCustomToken(uid) → 200 { customToken }│
│    2) Если передан initData:                                                  │
│       a) Валидация подписи (HMAC-SHA256, auth_date) → при ошибке 403/400     │
│       b) По tgId найти пользователя в Firestore                               │
│       c) Если найден → обновить sessionToken, выдать customToken + sessionToken│
│       d) Если не найден → создать пользователя (роль user), выдать токены   │
│    3) Ответ: { success: true, customToken [, sessionToken, sessionTokenExpiresAt ] }│
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Firestore (users_v4)                                  │
│  Документ пользователя: uid (tg_<tgId> или другой), tgId, email, name,      │
│  role, uuid, telegramSessionToken, telegramSessionTokenExpiresAt, ...       │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Firebase Auth                                         │
│  createCustomToken(uid) → клиент вызывает signInWithCustomToken → сессия      │
│  Дальнейшие запросы к API с заголовком Authorization: Bearer <idToken>       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Важно:**  
- **bot_token** хранится только на backend (env или админка).  
- **Токен бота на сервере должен быть от того же бота, из которого открывается Mini App.** Иначе проверка подписи initData вернёт 403 («Неверная подпись данных»).  
- **initData** без серверной проверки подписи не принимается.  
- **customToken** даёт доступ к Firebase и к вашему API (проверка idToken на backend).  
- **sessionToken** нужен для повторного входа без повторной отправки initData (меньше риска перехвата).

**Если вход «прямо в кабинет» не срабатывает:**  
1. Убедитесь, что Mini App открывается из того же бота, для которого на сервере задан `TELEGRAM_BOT_TOKEN` (или токен в настройках Telegram в админ-панели).  
2. На фронте initData берётся из `Telegram.WebApp.initData` и/или `window.__TELEGRAM_INIT_DATA`; при задержке SDK повтор запроса делается через 400 ms, 1.2 s, 3 s и 5 s, плюс по событию `telegram-initdata-ready`.  
3. В контексте TMA до 6 секунд показывается экран «Вход через Telegram…» вместо формы входа; при 403/ошибке отображается форма с сообщением об ошибке.

---

## 2. Пошаговая логика авторизации

### Сценарий A: Пользователь уже заходил (есть sessionToken)

1. Mini App при загрузке читает из `localStorage`: `tma_session_token`, `tma_session_expires`.
2. Если токен есть и дата истечения в будущем → **POST /api/telegram/auth** с заголовком `X-Telegram-Session-Token: <sessionToken>` (или body `{ sessionToken }`).
3. Backend ищет в Firestore пользователя с `telegramSessionToken === sessionToken` и проверяет `telegramSessionTokenExpiresAt > now`.
4. Если найден и не истёк → генерирует **customToken** для этого `uid`, возвращает `{ success: true, customToken }`.
5. Frontend вызывает `signInWithCustomToken(auth, customToken)` → пользователь в кабинете.

### Сценарий B: Первый вход или сессия истекла (используем initData)

1. Mini App получает **initData** от Telegram: `window.Telegram?.WebApp?.initData` или выставляемый ботом `window.__TELEGRAM_INIT_DATA`.
2. **POST /api/telegram/auth** с заголовком `X-Telegram-InitData: <initData>` и/или body `{ initData }`.
3. Backend:
   - Проверяет наличие и непустоту initData → иначе 400.
   - **Проверка подписи:** секрет = `HMAC-SHA256(bot_token, "WebAppData")`; строка для проверки = пары `key=value` из initData (кроме `hash`), отсортированные по ключу, в **исходном виде** (без URL-декодирования), разделитель `\n`; `computedHash = HMAC-SHA256(secret, dataCheckString)`; если `computedHash !== hash` → **403** (неверная подпись).
   - **Проверка auth_date:** возраст `auth_date` не более 24 часов (настраивается); иначе 400 (replay/устаревшие данные).
   - Парсит `user` из initData, извлекает `tgId = user.id`.
4. Поиск в Firestore: `users_v4` где `tgId == <tgId>`.
5. **Если пользователь найден:** обновить у него `telegramSessionToken`, `telegramSessionTokenExpiresAt`; сгенерировать новый **sessionToken** (например 32 байта hex); выдать **customToken** и в ответе **sessionToken** + **sessionTokenExpiresAt**.
6. **Если не найден:** создать документ пользователя (uid = `tg_<tgId>` или другой уникальный id), поля: `tgId`, `email` (placeholder, например `tg_<tgId>@telegram.placeholder`), `name` (из Telegram), `role: 'user'`, `uuid`, `telegramSessionToken`, `telegramSessionTokenExpiresAt`, и т.д.; выдать **customToken** + **sessionToken** + **sessionTokenExpiresAt**.
7. Frontend сохраняет `sessionToken` и дату истечения в `localStorage`, вызывает `signInWithCustomToken(auth, customToken)` → редирект в личный кабинет.

### Защита от повторной отправки initData

- **auth_date** ограничивает окно использования одних и тех же данных (например 24 часа). Этого достаточно для типичного сценария.
- Опционально: хранить на backend (Redis/память) использованный `hash` из initData с TTL = время жизни auth_date и отклонять повторные запросы с тем же hash (защита от replay в пределах окна).

---

## 3. Пример кода

### 3.1 Backend: проверка подписи initData (HMAC-SHA256, auth_date)

У вас уже реализовано в `server/n8n-webhook-proxy.js`. Кратко ключевой фрагмент:

```javascript
const crypto = require('crypto')

// Секрет по документации Telegram: HMAC-SHA256(secret_key, "WebAppData"), secret_key = HMAC-SHA256(bot_token, "WebAppData")
const TELEGRAM_WEBAPP_SECRET = crypto.createHmac('sha256', process.env.TELEGRAM_BOT_TOKEN).update('WebAppData').digest()
const TELEGRAM_INIT_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 часа

function validateTelegramInitDataWithReason(initData) {
  if (!initData || typeof initData !== 'string') return { ok: false, reason: 'empty', message: 'initData не передан' }
  const trimmed = initData.trim()
  const data = new URLSearchParams(trimmed)
  const hash = data.get('hash')
  if (!hash) return { ok: false, reason: 'no_hash', message: 'Нет подписи (hash)' }

  // data_check_string — пары key=value в исходном виде (без декодирования), без hash, сортировка по key
  const pairs = trimmed.split('&')
    .map((s) => { const idx = s.indexOf('='); return idx < 0 ? [s, ''] : [s.slice(0, idx), s.slice(idx + 1)] })
    .filter(([k]) => k !== 'hash')
  pairs.sort(([a], [b]) => a.localeCompare(b))
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = TELEGRAM_WEBAPP_SECRET
  const computedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
  if (computedHash !== hash) return { ok: false, reason: 'invalid_hash', message: 'Неверная подпись' }

  const parsed = Object.fromEntries(data)
  if (parsed.user && typeof parsed.user === 'string') parsed.user = JSON.parse(parsed.user)
  if (!parsed.user?.id) return { ok: false, reason: 'no_user', message: 'Нет пользователя в данных' }

  const authDate = parseInt(parsed.auth_date, 10) || 0
  if (authDate && TELEGRAM_INIT_DATA_MAX_AGE_MS > 0) {
    const age = Date.now() - authDate * 1000
    if (age > TELEGRAM_INIT_DATA_MAX_AGE_MS || age < 0) return { ok: false, reason: 'expired', message: 'Сессия истекла' }
  }
  return { ok: true, data: parsed }
}
```

**При невалидной подписи в роуте авторизации возвращайте 403:**

```javascript
if (!result.ok) {
  const status = result.reason === 'invalid_hash' || result.reason === 'no_hash' ? 403 : 400
  return res.status(status).json({ success: false, error: result.message, reason: result.reason })
}
```

### 3.2 Backend: middleware проверки Telegram (опционально)

Middleware только заполняет `req.telegramUser` при валидном initData; не блокирует запросы без initData (чтобы остальные API работали как раньше):

```javascript
app.use(async (req, res, next) => {
  const initData = req.headers['x-telegram-initdata'] || req.query.initData || ''
  if (!initData) return next()
  try {
    const result = await validateTelegramInitDataWithReasonAsync(initData)
    if (result.ok) req.telegramUser = result.data
  } catch (e) { /* лог */ }
  next()
})
```

### 3.3 Backend: POST /api/telegram/auth (логика уже у вас)

- Сначала проверка **sessionToken** → по нему найти пользователя в Firestore, проверить срок действия → выдать **customToken**.
- Если нет sessionToken или он невалиден — проверка **initData** (см. выше); при невалидной подписи — **403**; при истёкшем auth_date — **400**.
- По `tgId` найти или создать пользователя; обновить/установить `telegramSessionToken`, `telegramSessionTokenExpiresAt`; выдать **customToken** и при первом входе/обновлении — **sessionToken**, **sessionTokenExpiresAt**.

Полная реализация у вас в `server/routes/telegram.routes.js` (POST /auth).

### 3.4 Frontend: запрос авторизации при загрузке Mini App

Пример порядка: сначала попытка по sessionToken, при неудаче — по initData (с повторами, т.к. initData может прийти с задержкой):

```javascript
// 1) Сохранённая сессия
const storedToken = localStorage.getItem('tma_session_token')
const expiresAt = localStorage.getItem('tma_session_expires')
if (storedToken && expiresAt && new Date(expiresAt).getTime() > Date.now()) {
  const res = await fetch(`${API_BASE}/api/telegram/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Session-Token': storedToken },
    body: JSON.stringify({ sessionToken: storedToken }),
  })
  const data = await res.json()
  if (data.success && data.customToken) {
    await signInWithCustomToken(auth, data.customToken)
    if (data.sessionToken) {
      localStorage.setItem('tma_session_token', data.sessionToken)
      if (data.sessionTokenExpiresAt) localStorage.setItem('tma_session_expires', data.sessionTokenExpiresAt)
    }
    return // авторизован, редирект в кабинет
  }
}

// 2) Вход по initData (из Telegram WebApp)
const initData = window.Telegram?.WebApp?.initData || window.__TELEGRAM_INIT_DATA || ''
if (initData) {
  const res = await fetch(`${API_BASE}/api/telegram/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-InitData': initData },
    body: JSON.stringify({ initData }),
  })
  const data = await res.json()
  if (data.success && data.customToken) {
    if (data.sessionToken) {
      localStorage.setItem('tma_session_token', data.sessionToken)
      if (data.sessionTokenExpiresAt) localStorage.setItem('tma_session_expires', data.sessionTokenExpiresAt)
    }
    await signInWithCustomToken(auth, data.customToken)
    return
  }
  if (res.status === 403) {
    // Неверная подпись — показать пользователю, что нужно открыть приложение из того же бота
  }
}
```

У вас это реализовано в `src/app/App.jsx` (авто-вход TMA, кнопка «Войти через Telegram»).

### 3.5 Автообновление «JWT» (sessionToken)

У вас нет отдельного JWT для Mini App: используется **Firebase customToken** (разовый обмен на idToken) и долгоживущий **sessionToken** для повторного получения customToken без initData. «Обновление» — это повторный вызов **POST /api/telegram/auth** с `sessionToken` до истечения срока; при истечении — повторная отправка initData (пользователь снова открывает Mini App из бота). При желании можно добавить refresh-эндпоинт, который по валидному sessionToken выдаёт новый customToken и продлевает sessionTokenExpiresAt.

---

## 4. Рекомендации по безопасности для production

1. **Подпись initData**  
   - Всегда проверять на backend. При `invalid_hash` / `no_hash` возвращать **403**.  
   - Секрет: `HMAC-SHA256(bot_token, "WebAppData")`; data_check_string строить из **исходной** query-строки (без URL-декодирования value), иначе подпись не сойдётся при наличии спецсимволов.

2. **auth_date**  
   - Ограничивать возраст (например 24 часа). Отклонять запросы с устаревшим или из будущего auth_date (защита от replay и «старых» данных).

3. **bot_token**  
   - Хранить только на backend (переменные окружения или защищённое хранилище). Никогда не отдавать во frontend и не логировать.

4. **sessionToken**  
   - Генерировать криптостойко (например `crypto.randomBytes(32).toString('hex')`). Хранить в Firestore только хэш или сам токен в защищённой коллекции; проверять срок действия при каждом использовании.

5. **HTTPS**  
   - Все запросы к API и к Mini App только по HTTPS, чтобы initData и токены не перехватывались.

6. **Ограничение по времени жизни initData**  
   - Не увеличивать окно auth_date без необходимости; 24 часа — разумный компромисс.

7. **Логирование**  
   - Логировать факты неудачной проверки подписи и истечения auth_date без вывода самого initData и токенов. У вас уже есть `logTelegramAuth`.

8. **Защита от повторной отправки (опционально)**  
   - Для высоконагруженных сценариев: кэшировать использованный `hash` из initData (Redis/память) с TTL = окно auth_date и отклонять повторные запросы с тем же hash.

9. **Роль по умолчанию**  
   - Для автоматически создаваемых пользователей задавать только роль с минимальными правами (у вас `role: 'user'`).

10. **CORS и заголовки**  
    - Разрешать запросы только с доверенных доменов Mini App; не отдавать лишние заголовки и не раскрывать внутренние ошибки в ответах 403/400.

Реализация в вашем проекте уже соответствует описанной схеме; при необходимости достаточно явно возвращать **403** при невалидной подписи initData и при необходимости добавить опциональную защиту от replay по hash.
