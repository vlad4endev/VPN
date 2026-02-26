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
