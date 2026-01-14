# Инструкция по обновлению на сервере

## Проблема
Ошибка: `The requested module '/src/shared/utils/formatDate.js' does not provide an export named 'formatTimeRemaining'`

## Решение

### 1. Обновите код на сервере:
```bash
cd /path/to/VPN
git pull origin main
```

### 2. Очистите кеш Vite и перезапустите dev-сервер:
```bash
# Остановите текущий dev-сервер (Ctrl+C или kill процесс)

# Очистите кеш Vite
rm -rf node_modules/.vite
rm -rf .vite

# Перезапустите dev-сервер
npm run dev
```

### 3. Если используете PM2 или другой процесс-менеджер:
```bash
# Остановите процесс
pm2 stop vpn-frontend  # или ваш процесс

# Обновите код
git pull origin main

# Очистите кеш
rm -rf node_modules/.vite .vite

# Перезапустите
pm2 restart vpn-frontend
```

### 4. Альтернативный способ (полная переустановка зависимостей):
```bash
git pull origin main
rm -rf node_modules package-lock.json
npm install
npm run dev
```

## Проверка
После обновления проверьте в браузере, что ошибка исчезла. Если ошибка все еще есть:
1. Убедитесь, что файл `src/shared/utils/formatDate.js` содержит функцию `formatTimeRemaining`
2. Проверьте, что dev-сервер полностью перезапущен
3. Очистите кеш браузера (Ctrl+Shift+R или Cmd+Shift+R)
