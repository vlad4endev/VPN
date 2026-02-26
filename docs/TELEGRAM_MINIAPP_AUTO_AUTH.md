# Автоматическая авторизация через Telegram Mini App (WebApp)

Документ описывает архитектуру и реализацию входа в личный кабинет **только через Telegram**: пользователь открывает Mini App из бота и попадает в кабинет без логина/пароля. Backend: **Node.js (Express)**. БД: **Firestore**. Идентификация пользователя: **Firebase Auth (customToken)** + серверная сессия (**sessionToken**).

## Отдельная ссылка для Telegram Mini App

Для бота можно использовать **отдельный URL** мини-интерфейса:

- **`/t`** или **`/telegram`** — отдельная страница только для входа по Telegram ID и личного кабинета.
- При открытии **из Telegram** (с `initData`): автоматический вход по Telegram ID → отображается личный кабинет этого пользователя (подписка, профиль, платежи) в компактном виде без основного сайдбара.
- При открытии **в обычном браузере** (без Telegram): показывается подсказка «Откройте эту ссылку из меню бота в Telegram».
- Поддержка пути **`/t/<telegram_id>`** не обязательна: идентификация по `initData` на бэкенде; пользователь всегда видит кабинет, привязанный к своему Telegram ID.

**Рекомендуемый URL Mini App в настройках бота:** `https://ваш-домен/t` или `https://ваш-домен/telegram`.

### Если Mini App открывается с пустым экраном

#### «Загрузка…» и через 3 с «Скрипт приложения не загрузился» (html_boot → main_loading → main_timeout)

Это значит, что по адресу Mini App отдаётся **исходный** `index.html` (из корня репозитория), а не сборка. В нём указан скрипт `/src/app/main.jsx`, которого на сервере нет → браузер не загружает приложение.

**Что сделать:**

1. **Собрать фронтенд** (на своей машине или на сервере):
   ```bash
   npm run build
   ```
2. **Убедиться, что сервер отдаёт именно папку `dist/`:**
   - **Вариант A: запросы идут на Node (n8n-webhook-proxy).** Сервер отдаёт статику только если существует папка `dist/` рядом с ним. Положите на сервер собранный проект (с папкой `dist/` внутри) или на сервере выполните `npm run build` в каталоге проекта. Перезапустите Node. В логах при старте должно быть: `📁 SPA fallback: frontend из dist`.
   - **Вариант B: nginx раздаёт статику.** В конфиге nginx укажите `root /путь/к/проекту/dist;` (именно **dist**, не корень репозитория). Для SPA добавьте `try_files $uri $uri/ /index.html;` в `location /`.
3. Проверить: в браузере открыть `https://ваш-домен/t` и посмотреть исходный код страницы (Ctrl+U). В `<script>` должен быть путь вида `/assets/index-xxxxx.js`, а **не** `/src/app/main.jsx`.

После этого при открытии Mini App из бота должна загружаться сборка и экран «Загрузка…» сменится на приложение или «Откройте из бота».

---

1. **Сервер должен отдавать `index.html` для пути `/t` (SPA fallback).**
   - При использовании **n8n-webhook-proxy**: собранный frontend (`npm run build`) должен лежать в `dist/` рядом с сервером; тогда сервер сам отдаёт статику и для GET `/t` возвращает `index.html` из `dist/`.
   - При использовании **nginx** перед приложением добавьте в `location /`: `try_files $uri $uri/ /index.html;`, и **root** должен указывать на каталог **dist** (см. выше).
2. **Деплой только из папки `dist/`.** Не отдавайте исходный `index.html` из корня репозитория — в нём путь `/src/app/main.jsx`, которого на статическом сервере нет (404).
3. **HTTPS.** Mini App в Telegram открывается только по HTTPS (для production).
4. **Токен бота.** В настройках бота (Интеграции → Telegram) должен быть сохранён тот же токен, что и у бота, из которого открывается Mini App — иначе проверка подписи `initData` вернёт 403.

5. **«TMA WebApp present, but initData empty» (Telegram 6.0).** В некоторых клиентах (например версия 6.0) `Telegram.WebApp.initData` может быть пустым в момент загрузки страницы. Приложение повторно проверяет initData через 300 ms, 1.2 s и 3 s; также используется fallback из `sessionStorage` и из hash (`tgWebAppData=...`), если Telegram передал данные в URL. Если через ~10 с вход не произошёл, показывается экран «Откройте из бота» — пользователь может закрыть и открыть Mini App снова.

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

---

## Настройка nginx для Mini App и SPA

Чтобы Mini App по адресу `https://ваш-домен/t` открывался корректно, nginx должен либо проксировать запросы на Node-сервер (который отдаёт `dist/` и API), либо сам раздавать статику из `dist/` и проксировать только `/api` на Node. Ниже — оба варианта и общие правила.

### Почему не работают отдельные правила для `/t` и `/review`

Если в панели (nginx, панель хостинга и т.п.) вы добавляете **отдельные «местоположения»** только для путей `/t` и `/review`:

- Запросы на **`/`**, **`/assets/*`**, **`/dashboard`** и т.д. **не попадают** в эти правила и могут отдаваться другим виртуальным хостом или давать 404.
- Для SPA нужен **один и тот же** `index.html` для всех путей: и для `/`, и для `/t`, и для `/review`. Скрипты приложения лежат в `/assets/`. Если проксируются только `/t` и `/review`, то запросы к `/assets/index-xxxxx.js` не доходят до вашего приложения — скрипт не грузится, в логах будет `[main_timeout]`.

**Что сделать в панели:**

1. **Удалите** отдельные правила для «Расположение: `/t`» и «Расположение: `/review`».
2. Настройте **одно** правило проксирования для **всего** сайта:
   - **Расположение (Location):** `/` (или оставьте пустым/«по умолчанию», если панель так трактует «весь сайт»).
   - **Схема (Scheme):** **`http`** (бэкенд почти всегда слушает HTTP; HTTPS терминация — на прокси).
   - **Переадресация хоста / IP:** `127.0.0.1` или `localhost` (или IP вашего Node-сервера).
   - **Прямой порт (Direct port):** порт, на котором слушает ваше приложение — например **`3001`** (для n8n-webhook-proxy), а не 80, если Node не висит именно на 80.

3. Убедитесь, что запросы к **любому** пути (`/`, `/t`, `/review`, `/api/...`) идут на этот бэкенд. Тогда и `/t`, и `/assets/*` будет отдавать одно приложение (Node с папкой `dist/` и SPA fallback).

### Что должно быть в итоге

- **HTTPS** — Mini App в Telegram открывается только по HTTPS.
- **Путь `/t`** — по запросу `GET /t` клиент должен получить **тот же** `index.html`, что и для `/` (SPA fallback), а не 404.
- **Файлы из сборки** — по путям вида `/assets/index-xxxxx.js`, `/assets/vendor-xxxxx.js`, `/favicon.svg` и т.д. должны отдаваться реальные файлы из папки `dist/` (после `npm run build`).
- **API** — запросы к `/api/*` должны уходить на ваш Node-сервер (например, n8n-webhook-proxy на порту 3001).

Подставьте свои значения:
- `skypath.fun` или `www.skypath.fun` — ваш домен;
- `/var/www/skypath/dist` — каталог, куда положена сборка (содержимое папки `dist/` проекта);
- `http://127.0.0.1:3001` — адрес вашего Node-приложения.

**Локальный запуск (start/start-all) vs продакшен:**

- **Backend (n8n Webhook Proxy)** на `http://localhost:3001` — это тот сервис, на который nginx должен проксировать (в панели укажите порт **3001**).
- **Frontend на порту 5173** — это Vite dev-сервер, только для разработки. В продакшене nginx **не** обращается к 5173: весь трафик идёт на **3001**. Приложение на 3001 отдаёт статику из папки **`dist/`** (после `npm run build`). Поэтому перед деплоем обязательно выполните `npm run build` и убедитесь, что папка `dist/` есть рядом с сервером (n8n-webhook-proxy ищет её относительно своей рабочей директории).

---

### Вариант 1: nginx только как reverse proxy (всё через Node)

Node-сервер сам отдаёт статику из `dist/` и обрабатывает `/api`. nginx только принимает HTTPS и проксирует весь трафик на Node.

**1. Файл конфигурации сайта** (например `/etc/nginx/sites-available/skypath.fun` или внутри `http { }` в `nginx.conf`):

```nginx
# Редирект с HTTP на HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name skypath.fun www.skypath.fun;
    return 301 https://$server_name$request_uri;
}

# HTTPS — всё проксируем на Node
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name skypath.fun www.skypath.fun;

    # Сертификаты (Let's Encrypt через certbot)
    ssl_certificate     /etc/letsencrypt/live/skypath.fun/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/skypath.fun/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Увеличенный размер тела для API (загрузки, webhook и т.д.)
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Что важно:** для путей `/`, `/t`, `/dashboard` и т.д. запрос уходит на Node; ваш сервер (n8n-webhook-proxy) отдаёт из `dist/` статику и для неизвестных путей — `index.html`. Отдельный SPA fallback в nginx не нужен.

**2. Включить конфиг и перезагрузить nginx:**

```bash
sudo ln -sf /etc/nginx/sites-available/skypath.fun /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**3. Сертификат Let's Encrypt (если ещё нет):**

```bash
sudo certbot --nginx -d skypath.fun -d www.skypath.fun
```

После этого Mini App по `https://ваш-домен/t` будет получать от Node тот же `index.html` и скрипты из `dist/`.

---

### Вариант 2: nginx раздаёт статику из dist, API — на Node

Статика отдаётся напрямую из nginx (меньше нагрузка на Node), запросы к `/api` проксируются на Node.

**1. Положить сборку на сервер**, например:

```bash
# На сервере после npm run build
/var/www/skypath/dist/
├── index.html
├── assets/
│   ├── index-xxxxx.js
│   ├── vendor-xxxxx.js
│   ├── firebase-xxxxx.js
│   └── index-xxxxx.css
├── favicon.svg
└── ...
```

**2. Конфигурация nginx:**

```nginx
# Редирект HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name skypath.fun www.skypath.fun;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name skypath.fun www.skypath.fun;

    ssl_certificate     /etc/letsencrypt/live/skypath.fun/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/skypath.fun/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 10M;

    # Корень сайта — каталог со сборкой
    root /var/www/skypath/dist;
    index index.html;

    # API — проксируем на Node (порт 3001 или ваш)
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Статика: файлы из dist (в т.ч. /assets/*, /favicon.svg и т.д.)
    location /assets/ {
        alias /var/www/skypath/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /favicon.svg {
        alias /var/www/skypath/dist/favicon.svg;
        expires 7d;
    }

    # SPA fallback: все остальные GET-запросы (/, /t, /dashboard, /payment/...) отдаём index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Почему это нужно для Mini App:** при открытии `https://ваш-домен/t` nginx не находит файл `/t`, срабатывает `try_files` и отдаётся `/index.html`. Браузер затем запрашивает `/assets/index-xxxxx.js` и остальные файлы — они отдаются из `dist/assets/`. Так скрипт приложения загружается и в логах появляется `[bootstrap_tma]` вместо `[main_timeout]`.

**3. Права и перезагрузка:**

```bash
sudo chown -R www-data:www-data /var/www/skypath/dist
sudo nginx -t && sudo systemctl reload nginx
```

---

### Кратко по директивам

| Директива | Назначение |
|-----------|------------|
| `root /var/www/skypath/dist` | Корень файлов сайта — папка со сборкой. |
| `try_files $uri $uri/ /index.html` | Сначала ищем файл/каталог по URI; если нет — отдаём `index.html` (SPA и путь `/t`). |
| `location /api/` | Все запросы к API уходят на Node. |
| `location /assets/` | Раздаём JS/CSS из сборки с долгим кэшем. |
| `proxy_pass http://127.0.0.1:3001` | Адрес вашего Node-сервера. |
| `proxy_set_header X-Forwarded-Proto $scheme` | Чтобы приложение видело запрос как HTTPS. |

### Проверка

- В браузере: `https://ваш-домен/t` — открывается интерфейс Mini App (загрузка, затем кабинет или подсказка «Откройте из бота»).
- В логах отладки на экране `/t`: есть `[html_boot]`, `[main_loading]`, затем `[bootstrap_tma]` (без `[main_timeout]`).
- Прямая проверка: `curl -I https://ваш-домен/assets/index-xxxxx.js` — ответ 200 (подставьте реальное имя файла из `dist/assets/`).

---

### 502 Bad Gateway — что проверить

502 значит: прокси (nginx или панель) доходит до бэкенда, но **бэкенд не отвечает** или недоступен.

**1. Запущен ли Node-сервер**

Приложение (n8n-webhook-proxy или proxy-server) должно быть запущено и слушать порт, на который идёт прокси.

На сервере выполните:

```bash
# Проверить, слушает ли что-то на порту 3001
ss -tlnp | grep 3001
# или
netstat -tlnp | grep 3001
```

Если пусто — бэкенд не запущен. Запустите его, например:

```bash
cd /путь/к/проекту
PORT=3001 node server/n8n-webhook-proxy.js
```

Или через pm2:

```bash
pm2 start server/n8n-webhook-proxy.js --name app -- --port 3001
# или если порт задаётся через env:
PORT=3001 pm2 start server/n8n-webhook-proxy.js --name app
```

**2. Правильный ли порт в настройках прокси**

- n8n-webhook-proxy по умолчанию слушает **3001** (`process.env.PORT || 3001`).
- proxy-server по умолчанию тоже **3001** (`PROXY_PORT || 3001`).

В панели в поле «Прямой порт» должно быть указано **то же число**, на котором реально слушает процесс (чаще всего **3001**), а не 80.

**3. Проверка с сервера напрямую**

На той же машине, где крутится nginx:

```bash
curl -I http://127.0.0.1:3001/
```

Ожидается ответ `200` или `304`. Если `Connection refused` — сервис на 3001 не запущен или слушает другой интерфейс.

**4. Лог nginx**

В логах обычно видна причина 502:

```bash
sudo tail -50 /var/log/nginx/error.log
```

Типичные сообщения: `connect() failed (111: Connection refused)` — бэкенд не запущен или не тот порт; `upstream timed out` — бэкенд не успевает ответить.

**5. Схема к бэкенду**

В настройках прокси к бэкенду должна быть схема **http** (не https), если приложение слушает обычный HTTP. Хост: **127.0.0.1** или **localhost**, порт: **3001**.

---

### Let's Encrypt: «rateLimited» / «temporarily prevented from requesting certificates»

Ошибка вида:

```text
urn:ietf:params:acme:error:rateLimited :: There were too many requests of a given type ::
Your account is temporarily prevented from requesting certificates for sol.skypath.fun and possibly others.
```

означает, что Let's Encrypt **временно ограничил** ваш аккаунт из‑за слишком частых запросов сертификатов (в т.ч. продлений).

**Что сделать:**

1. **Разблокировать аккаунт (unpause)**  
   В тексте ошибки есть ссылка вида:
   ```text
   https://portal.letsencrypt.org/sfe/v1/unpause?jwt=...
   ```
   Откройте её в браузере (лучше последнюю из логов). Подтвердите разблокировку. После этого новые запросы сертификатов снова станут возможны (часто — после окончания окна блокировки).

2. **Убрать лишние продления в Nginx Proxy Manager**  
   В логах видно, что продление запускается **каждый час** с флагом **`--force-renewal`**. Из‑за этого и срабатывает лимит.  
   - В NPM: **SSL Certificates** → сертификат для `sol.skypath.fun` → настройки продления.  
   - Отключите принудительное продление (force renewal), если такая опция есть.  
   - Оставьте обычное продление «за 30 дней до истечения» и не запускайте его чаще 1–2 раз в сутки.  
   При необходимости отключите авто-продление для этого сертификата на 1–2 дня, пока действует ограничение.

3. **Подождать**  
   Ограничения Let's Encrypt действуют ограниченное время (часы/дни). После unpause и паузы в частых запросах продление снова начнёт проходить.

4. **Проверить текущий сертификат**  
   Если сертификат ещё действителен (не истёк), сайт продолжит работать по HTTPS. Проблема только с *новым* выпуском/продлением. После снятия лимита продление пройдёт в обычном режиме.
