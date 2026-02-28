# Исправление 403 на /assets/* в Telegram Mini App

## Симптомы

- В консоли: `Failed to load resource: 403` для `index-*.js`, `vendor-*.js`, `firebase-*.js`, CSS.
- Стили не применяются: `MIME type ('application/json') is not a supported stylesheet MIME type` — сервер отдаёт JSON (ошибку) вместо файла.

## Причина

Запросы к статике (`/assets/*`) получают 403, и в ответ приходит JSON (например, от CORS или Firewall). Браузер пытается использовать этот ответ как CSS/JS и выдаёт ошибку MIME.

---

## Если фронт отдаёт **Node** (n8n-webhook-proxy)

В проекте уже сделано:

1. **Раздача `/assets/*` и `/favicon.ico` до CORS** — статика не попадает под проверку Origin и не даёт 403 от CORS.
2. **Расширенный список CORS** — разрешены `skypath.fun`, `telegram.org`, `t.me`, `origin === 'null'`.

Что проверить:

- На сервере выполнен `npm run build` и папка `dist/` (в т.ч. `dist/assets/`) есть рядом с сервером.
- Сервер перезапущен после изменений в `n8n-webhook-proxy.js`.
- Для www.skypath.fun трафик идёт именно на этот Node (nginx проксирует на порт 3001), а не на другой хост.

---

## Если фронт на **Vercel**

Тогда 403 чаще всего даёт **Vercel Firewall** (WAF), а не наш код.

Что сделать:

1. **Vercel Dashboard** → ваш проект → **Settings** → **Firewall** (или **Security**).
2. Проверить:
   - **Attack Challenge Mode** — при блокировке Telegram WebView можно отключить или добавить исключение для путей `/assets/*`.
   - **Bot Protection** — если включена агрессивная защита, запросы из Telegram (другой User-Agent) могут получать 403. Добавьте правило, разрешающее путь `/assets/*` или User-Agent с `Telegram`.
3. Убедиться, что в деплое есть папка `dist/` с `index.html` и папкой `assets/` (т.е. в настройках сборки указан output directory `dist` для Vite).

После изменений в Firewall сделайте повторный деплой или подождите пару минут и откройте Mini App снова.

---

## Кратко

| Где отдаётся www.skypath.fun | Действие |
|------------------------------|----------|
| **Node (n8n-webhook-proxy)** | Уже исправлено в коде; задеплойте и перезапустите сервер, проверьте наличие `dist/assets/`. |
| **Vercel**                  | Проверить Vercel Firewall / Bot Protection и разрешить запросы к `/assets/*` или с User-Agent Telegram. |
