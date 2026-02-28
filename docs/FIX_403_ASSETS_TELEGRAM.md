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

## Если фронт на **Vercel** (ваш случай — www.skypath.fun не открывается)

403 отдаёт **Vercel Firewall (WAF)**. Нужно явно разрешить путь `/assets/*`.

### Шаги в Vercel (обязательно)

1. Зайдите в **[Vercel Dashboard](https://vercel.com)** → выберите проект (skypath.fun / skyflow).
2. **Settings** → в левом меню **Firewall** (или **Security** → **Firewall**).
3. Найдите блок **Custom Rules** (или **WAF Custom Rules**) и нажмите **Add Rule** / **Create Rule**.
4. Создайте правило:
   - **Name:** `Allow assets for Telegram`
   - **Condition:** `Path` → `starts with` или `matches` → значение **`/assets/`** (или `^/assets/`).
   - **Action:** **Bypass** (или **Allow**), чтобы не блокировать и не показывать challenge.
5. Сохраните правило и подождите 1–2 минуты (распространение правил).

Дополнительно можно ослабить защиту для ботов (если правило по пути не поможет):

- В том же разделе Firewall отключите **Attack Challenge Mode** для этого проекта или добавьте в исключения путь `/assets/*`.
- Либо временно отключите **Bot Protection**, если она включена, и проверьте открытие Mini App.

### Сборка на Vercel

В `vercel.json` указаны `outputDirectory: "dist"` и `buildCommand: "npm run build"`. Убедитесь, что в деплое действительно появляется папка `dist/` с `index.html` и `assets/` (файлы с хешами в имени). Если в логе сборки нет папки `dist` или в деплое нет `assets/`, проверьте настройки **Build & Development Settings** в проекте (Root Directory, Build Command, Output Directory).

После добавления правила обхода для `/assets/` сделайте повторный деплой или просто откройте Mini App снова через 1–2 минуты.

---

## Кратко

| Где отдаётся www.skypath.fun | Действие |
|------------------------------|----------|
| **Node (n8n-webhook-proxy)** | Уже исправлено в коде; задеплойте и перезапустите сервер, проверьте наличие `dist/assets/`. |
| **Vercel**                  | Проверить Vercel Firewall / Bot Protection и разрешить запросы к `/assets/*` или с User-Agent Telegram. |
