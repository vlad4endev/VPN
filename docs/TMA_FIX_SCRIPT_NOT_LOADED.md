# Ошибка «Скрипт приложения не загрузился»

Сообщение появляется, когда в браузер отдаётся **исходный** `index.html` из корня проекта: в нём указан скрипт `/src/app/main.jsx`, которого на сервере нет (есть только в режиме разработки). Через ~3 с приложение показывает подсказку про деплой.

## Что сделать

### Вариант 1: Запуск через Node (без Docker)

1. **Соберите фронтенд на сервере:**
   ```bash
   cd /path/to/project
   npm install
   npm run build
   ```
2. **Запускайте приложение так, чтобы оно раздавало папку `dist/`:**
   - `npm start` (запускает `server/n8n-webhook-proxy.js`) — сервер сам отдаёт статику из `dist/` и для всех GET (кроме `/api/*`) отдаёт `dist/index.html`.
   - Либо `npm run start:proxy` (`server/proxy-server.js`) — аналогично раздаёт `dist/`, если папка есть.

   Убедитесь, что запуск выполняется из **корня проекта** (где лежат `dist/` и `server/`). Тогда `path.join(__dirname, '..', 'dist')` указывает на собранный фронтенд.

3. **Если перед приложением стоит nginx:** проксируйте **весь** трафик на Node (порт 3001), а не раздавайте файлы из корня репозитория. Пример:
   ```nginx
   location / {
       proxy_pass http://127.0.0.1:3001;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

### Вариант 2: nginx раздаёт статику сам

1. На сервере выполните сборку:
   ```bash
   npm run build
   ```
2. В nginx укажите **root на папку `dist/`** (а не на корень проекта):
   ```nginx
   root /var/www/your-app/dist;   # не /var/www/your-app
   location / {
       try_files $uri $uri/ /index.html;
   }
   ```
3. Запросы к `/api/*` проксируйте на Node.

### Вариант 3: Docker

Образ уже собирает фронтенд (`npm run build` в Dockerfile) и копирует `dist/` в контейнер. Сервер в контейнере (`proxy-server.js`) раздаёт статику из `dist/`.

Если ошибка всё равно есть — проверьте, что перед контейнером nginx не отдаёт свой `index.html` из другой директории (root должен быть либо проксирование на контейнер, либо `root` на каталог с **содержимым** `dist/`).

---

## Как проверить

- Откройте в браузере страницу Mini App (например `https://ваш-домен/t`) и посмотрите исходный код страницы (Ctrl+U).
- **Правильно:** в `<script src="...">` путь вида `/assets/index-xxxxxxxx.js` (с хешем).
- **Неправильно:** путь `/src/app/main.jsx` — значит отдаётся исходный `index.html`, нужны шаги выше.

Подробнее: [TELEGRAM_MINIAPP_ANALYSIS.md](./TELEGRAM_MINIAPP_ANALYSIS.md) (раздел «Деплой и загрузка скриптов»), [TELEGRAM_MINIAPP_AUTO_AUTH.md](./TELEGRAM_MINIAPP_AUTO_AUTH.md) (nginx и SPA).

---

## На сервере: чеклист для Telegram Mini App

Если в логах есть **main_timeout** и **auth_403 / invalid_hash**, проверьте на сервере следующее.

### 1. Скрипт не загрузился (main_timeout)

- **Прокси (Nginx / NPM):** должен отправлять трафик на **порт 3001** (Node), а не на 5173 (Vite). В настройках Proxy Host укажите **Forward Port = 3001**.
- **Сборка:** на сервере должна быть папка **dist/** (после `npm run build` в корне проекта). Запуск — из корня: `npm start` или `./start-all.sh production`, чтобы Node видел `dist/` рядом с `server/`.

### 2. Ошибка «Неверная подпись» (invalid_hash / auth_403)

Сервер проверяет initData по токену бота. Токен должен **совпадать с ботом**, из которого открывают Mini App.

- В **server/.env** (или в переменных окружения процесса) задайте:
  ```bash
  TELEGRAM_BOT_TOKEN=123456:ABCdef...   # токен от @BotFather для бота, в котором открывается Mini App
  ```
  Либо используйте **TELEGRAM_TOKEN** с тем же значением.

- Если токен храните в Firestore (админка): документ `artifacts/<APP_ID>/public/settings` должен содержать поле **telegramBotToken**. Тогда env можно не задавать (если Firebase на сервере настроен).

- **Важно:** токен должен быть именно того бота, в котором настроена кнопка/меню Mini App (URL вида `https://ваш-домен/t`). Другой бот → другой токен → invalid_hash.

### 3. Firebase на сервере (для входа и сессий)

Для выдачи customToken и работы сессий нужен Firebase Admin. В **server/.env** задайте один из вариантов:

- **FIREBASE_SERVICE_ACCOUNT_KEY** — JSON ключа сервисного аккаунта (одной строкой),  
  или  
- **FIREBASE_CLIENT_EMAIL** и **FIREBASE_PRIVATE_KEY**.

Без этого приложение будет возвращать 503 при попытке входа через Telegram.
