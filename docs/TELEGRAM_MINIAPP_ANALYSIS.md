# Анализ реализации Telegram Mini App: полная картина и проблемные места

Документ описывает текущую реализацию TMA в проекте, точки отказа и рекомендации.

---

## 1. Обзор потока данных

### 1.1 Точки входа

| Место | Назначение |
|-------|------------|
| **URL** | `/t`, `/telegram`, `/t/...` (проверка: `isTmaPath()` в `src/features/telegram/utils/tmaPath.js`) |
| **index.html** | `window.__IS_TMA_PATH__`, загрузка telegram-web-app.js, один вызов applyTmaInit (boot + sdk:onload), перехват fetch, runtime-проверка production-сборки (main_timeout). |
| **main.jsx** | На `/t` — монтирование без ожидания i18n; иначе — ожидание i18nReady (до 8 s). |
| **App.jsx** | View `tma`, авто-вход: `waitTelegramInitData(7 s)` → затем session (cookie) или initData; один поток, флаги authInProgress/signInInProgress. |

### 1.2 Авторизация (клиент)

1. **Ожидание initData:** `waitTelegramInitData(7000)` — один Promise; при таймауте показ «Откройте из бота».
2. **Session first:** `POST /api/telegram/auth` с `credentials: 'include'` (sessionToken в httpOnly cookie).
3. При отказе по сессии — один запрос с `X-Telegram-InitData` (initData из waitTelegramInitData).
4. Ответ: `customToken`; сервер выставляет cookie `tma_session_token`. Один вызов `signInWithCustomToken()` (защита от двойного вызова).
5. Таймауты: initData 7 s, fetch auth 12 s, Firebase signIn 8 s.

### 1.3 Бэкенд

- **POST /api/telegram/auth:** sessionToken из cookie (приоритет) или заголовка/body → поиск в Firestore, проверка TTL → customToken + Set-Cookie; иначе initData → HMAC-SHA256, поиск/создание по `tgId` → customToken + Set-Cookie (httpOnly, secure, sameSite=lax).
- **Валидация initData:** `validateTelegramInitDataWithReasonAsync` в n8n-webhook-proxy (HMAC, auth_date, парсинг user). Токен бота — из env или админки (Firestore).

---

## 2. Проблемные места и риски

### 2.1 Деплой и загрузка скриптов

| Проблема | Описание | Решение |
|----------|----------|---------|
| **main_timeout** | По `/t` отдаётся исходный `index.html` со ссылкой на `/src/app/main.jsx`; на проде такого файла нет → скрипт не грузится, через 3 с показ «Скрипт приложения не загрузился». | Всегда отдавать сборку из `dist/`: `npm run build`, сервер (Node или nginx) должен раздавать содержимое `dist/`. **Пошагово:** [TMA_FIX_SCRIPT_NOT_LOADED.md](TMA_FIX_SCRIPT_NOT_LOADED.md); общая настройка nginx — TELEGRAM_MINIAPP_AUTO_AUTH.md. |
| **Кэш Vite** | После правок (например, LanguageDetector) старый бандл может кэшироваться. | Перезапуск dev-сервера, жёсткое обновление (Ctrl+Shift+R); в Mini App — закрыть и открыть снова. |

### 2.2 initData и клиенты Telegram

| Проблема | Описание | Решение |
|----------|----------|---------|
| **initData пустой (Telegram 6.0 и др.)** | В части клиентов `Telegram.WebApp.initData` приходит с задержкой или остаётся пустым. | Один вызов applyTmaInit после загрузки SDK; в SPA — waitTelegramInitData(7 s). При таймауте — экран «Откройте из бота»; пользователь может перезапустить Mini App. |
| **Hash fallback** | initData из `tgWebAppData=...` в URL hash используется только если Telegram подставил его (не во всех сценариях). | Текущее поведение достаточное; при необходимости можно документировать для поддержки. |

### 2.3 Фронтенд: зависимости и порядок

| Проблема | Описание | Решение |
|----------|----------|---------|
| **LanguageDetector.addDetector** | В i18next-browser-languagedetector v8 `addDetector` — метод экземпляра, не класса. | Исправлено: создаётся `new LanguageDetector()`, вызов `lngDetector.addDetector(telegramDetector)`, в `i18n.use(lngDetector)` передаётся этот экземпляр. |
| **enableClosingConfirmation (6.0)** | В Telegram 6.0 метод не поддерживается → предупреждение в консоли. | Исправлено: вызов только при версии ≥ 6.1 или при неизвестной версии. |
| **Яндекс.Метрика на /t** | Запросы на mc.yandex.com из Mini App. | Исправлено: на путях `/t`, `/telegram`, `/t/...` скрипт Метрики не загружается. |

### 2.4 Бэкенд и конфигурация

| Проблема | Описание | Решение |
|----------|----------|---------|
| **service_unavailable (503)** | POST /api/telegram/auth возвращает 503 и reason: `service_unavailable`, если Firebase Admin не инициализирован (нет db/admin). | **На проде:** файл `server/firebase-service-account.json` в .gitignore и не попадает в репозиторий. Либо скопируйте его на сервер в каталог `server/` (например `scp server/firebase-service-account.json user@host:/path/to/project/server/`) и перезапустите процесс; либо задайте в server/.env **FIREBASE_SERVICE_ACCOUNT_KEY** (весь JSON одной строкой) или **FIREBASE_SERVICE_ACCOUNT_PATH** (абсолютный путь к файлу на сервере). Нужен также **FIREBASE_PROJECT_ID** (или project_id внутри JSON). После настройки в логах при старте должно быть «Firebase Admin SDK инициализирован». |
| **APP_ID в telegram.routes.js** | Раньше использовалось `process.env.APP_ID || 'skyputh'` (опечатка и игнорирование deps). | Исправлено: `appId = APP_ID || process.env.APP_ID || 'skypath'` (deps.APP_ID имеет приоритет). |
| **Токен бота** | Если токен не совпадает с ботом, из которого открыт Mini App, проверка подписи initData возвращает 403. | Токен должен быть задан в .env или в админке (Telegram) и соответствовать боту. |
| **auth_date** | initData старше TELEGRAM_INIT_DATA_MAX_AGE_MS отклоняются. | Настройка окна в env; при истечении — сообщение «Откройте приложение заново из меню бота». |

### 2.5 Безопасность

| Элемент | Статус |
|---------|--------|
| Проверка подписи initData | HMAC-SHA256, data_check_string без декодирования value (учёт % в данных). |
| auth_date | Проверка возраста, защита от старых данных. |
| sessionToken | httpOnly cookie `tma_session_token`, secure, sameSite=lax, TTL на сервере (90 дней). Клиент не читает/не пишет токен. |
| CORS / origin | Запросы к /api/telegram/auth идут на тот же origin (или VITE_API_BASE_URL); при необходимости проверить настройки CORS на сервере. |

### 2.6 Дублирование логики пути /t

| Место | Статус |
|-------|--------|
| **tmaPath.js** | Единая функция `isTmaPath(path)` — используется в main.jsx и App.jsx. |
| **index.html** | Путь задаётся один раз: `window.__IS_TMA_PATH__`; остальные скрипты используют его. При добавлении пути TMA — правка в одном месте и в tmaPath.js. |

### 2.7 UX и таймауты

| Параметр | Значение | Комментарий |
|----------|----------|-------------|
| Ожидание i18n (не /t) | 8 s | На /t i18n не ждём — быстрый старт. |
| Таймаут fetch auth | 12 s | Разумно для мобильных. |
| Таймаут signInWithCustomToken | 8 s | Защита от «вечного» ожидания Firebase. |
| Ожидание initData (SPA) | 7 s (waitTelegramInitData) | При таймауте — экран «Откройте из бота». Один Promise, без каскада таймеров. |

---

## 3. Файлы, задействованные в TMA

### 3.1 Фронтенд

- `index.html` — `window.__IS_TMA_PATH__`, загрузка SDK, applyTmaInit (boot + sdk:onload), перехват fetch, main_timeout (3 s), boot-логи.
- `src/app/main.jsx` — условный запуск без i18n на `/t`, `window.__TMA_MAIN_LOADED`, tmaLog.
- `src/app/App.jsx` — view `tma`, waitTelegramInitData(7 s), авто-вход (session по cookie, затем initData), authInProgress/signInInProgress, экраны загрузки / «Откройте из бота» / Dashboard, TmaLogPanel.
- `src/features/telegram/utils/tmaPath.js` — `isTmaPath()`, `normalizePath()`, учёт `window.__IS_TMA_PATH__`.
- `src/features/telegram/utils/waitTelegramInitData.js` — Promise-based ожидание initData с таймаутом.
- `src/features/telegram/utils/tmaLogger.js` — буфер логов, tmaLog (level, reason, severity), санитизация токенов.
- `src/features/telegram/components/TmaLogPanel.jsx` — панель логов на экране /t.
- `src/i18n/index.js` — кастомный детектор «telegram» для языка; экземпляр LanguageDetector с addDetector.
- `src/i18n/detectSystemLanguage.js` — getTelegramLanguageCode() для детектора.

### 3.2 Бэкенд

- `server/routes/telegram.routes.js` — POST /auth (session + initData), POST /auth-widget, POST /verify, bind-link, unbind, send-reminders; использование APP_ID из deps.
- `server/n8n-webhook-proxy.js` — validateTelegramInitDataWithReason, validateTelegramInitDataWithReasonAsync, TELEGRAM_SESSION_TTL_MS, раздача dist (SPA fallback для /t), логи TMA, передача deps в createTelegramRouter.

### 3.3 Документация

- `docs/TELEGRAM_MINIAPP_AUTO_AUTH.md` — архитектура, сценарии входа, деплой, nginx, решение «Загрузка…» + main_timeout.
- `docs/TELEGRAM_MINIAPP_ANALYSIS.md` — этот файл (анализ и проблемные места).

---

## 4. Рекомендации

1. **Деплой (прод):** В production сервер (proxy-server.js или n8n-webhook-proxy.js) должен раздавать статику только из папки `dist/` (при наличии `dist/`); SPA fallback отдаёт `dist/index.html`. Для прода всегда выполнять `npm run build`; nginx/root должен указывать на `dist/` или проксировать на Node, который раздаёт только из dist. В index.html включена runtime-проверка: если на странице есть тег `<script src="...">` с путём, содержащим `/src/`, считается не прод-сборкой и сразу показывается сообщение про деплой из dist. По `/t` в проде должен подключаться `/assets/index-*.js`, а не `/src/app/main.jsx`.
2. **Токен бота:** Один токен на сервере (env или админка), соответствующий боту, из которого открывается Mini App.
3. **Мониторинг:** Использовать логи TMA в админке (GET /api/admin/telegram/logs) и при необходимости панель «Логи TMA» на экране /t для разбора сбоев входа.
4. **При пустом initData:** Рекомендовать пользователю перезапустить Mini App из меню бота; при повторяющихся жалобах — проверить версию клиента Telegram и ограничения платформы.
5. **При изменении набора путей TMA:** Обновить расчёт `window.__IS_TMA_PATH__` в index.html (один раз) и `isTmaPath()` в tmaPath.js.

---

## 5. Сценарии тестирования TMA

После внедрения аудита проверять и фиксировать поведение:

| # | Сценарий | Ожидаемое поведение |
|---|----------|----------------------|
| 1 | Первый вход через бот | initData приходит (или после SDK onload); один запрос auth по initData; сервер выставляет cookie; signInWithCustomToken; показ Dashboard. |
| 2 | Повторный вход с sessionToken | Cookie отправляется с запросом (`credentials: 'include'`); один запрос auth по cookie; 200, customToken; вход без initData. |
| 3 | Истёкший auth_date | initData с старым auth_date; сервер 400, reason expired; клиент показывает «Откройте заново из бота»; в логах auth_date_expired. |
| 4 | Неверный токен бота | Сервер 403, invalid_hash; клиент показывает ошибку; в логах auth_403. |
| 5 | Медленный интернет | Таймаут waitTelegramInitData или fetch auth; экран «Откройте из бота» или сообщение о таймауте; в логах network_error / initData_timeout. |
| 6 | Telegram 6.0 | SDK может подставить initData с задержкой; один вызов applyTmaInit после onload и ожидание в SPA до 7 s; при появлении initData в пределах таймаута — вход. |
| 7 | Открытие не из Telegram (браузер) | Нет initData; после таймаута 7 s — экран «Откройте эту ссылку из меню бота». |
| 8 | Firebase Admin не настроен | Сервер возвращает 503, reason `service_unavailable`; в логах auth_fail_initData / auth_session_rejected. Решение: настроить Firebase (п. 2.4) и перезапустить сервер. |

---

*Документ актуален по состоянию кода после технического аудита TMA (прод-деплой, __IS_TMA_PATH__, waitTelegramInitData, категории ошибок, race-condition, httpOnly cookie, APP_ID, оптимизация index.html).*
