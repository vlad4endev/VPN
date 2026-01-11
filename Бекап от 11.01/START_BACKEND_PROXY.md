# 🚀 Запуск Backend Proxy для 3x-ui

## ⚠️ ВАЖНО: Backend Proxy должен быть запущен!

Без запущенного Backend Proxy запросы в 3x-ui **НЕ будут работать**.

## 📋 Быстрый запуск

### 1. Перейти в директорию server
```bash
cd server
```

### 2. Установить зависимости (если еще не установлены)
```bash
npm install
```

### 3. Запустить Backend Proxy
```bash
# Обычный запуск
node xui-backend-proxy.js

# Или с автоперезагрузкой (для разработки)
node --watch xui-backend-proxy.js

# Или через PM2 (рекомендуется для production)
pm2 start xui-backend-proxy.js --name xui-backend-proxy
```

### 4. Проверить, что сервер запущен
Backend Proxy должен быть доступен на `http://localhost:3001`

Проверка:
```bash
curl http://localhost:3001/api/vpn/health
```

## 🔍 Проверка логов

После запуска Backend Proxy вы должны видеть в консоли:
```
✅ XUI Backend Proxy started on port 3001
✅ Listening on http://0.0.0.0:3001
```

Когда пользователь создает подписку, в логах Backend Proxy должны появиться:
```
🔄 Creating client in 3x-ui: user@example.com (UUID: ...)
📦 Using session from: database
📊 Traffic: 0 GB = 0 bytes
⏰ Expiry: 2025-01-28T... (timestamp: ... seconds)
✅ Client created in 3x-ui: user@example.com (UUID: ...)
```

## 🐛 Диагностика проблем

### Проблема: Backend Proxy не запущен
**Симптомы:** Ошибка `ECONNREFUSED` или `connect ECONNREFUSED 127.0.0.1:3001`

**Решение:** Запустите Backend Proxy (см. инструкцию выше)

### Проблема: Сессия не найдена
**Симптомы:** Ошибка "Нет активной сессии"

**Решение:** 
1. Зайдите в админ панель
2. Перейдите в "Настройки" → "Серверы 3x-ui"
3. Нажмите "Получить данные" для нужного сервера
4. Убедитесь, что тест сессии прошел успешно

### Проблема: Запрос не доходит до 3x-ui
**Симптомы:** В логах Backend Proxy нет запросов

**Решение:**
1. Проверьте, что запросы действительно отправляются (откройте DevTools → Network)
2. Проверьте, что Vite проксирует `/api/vpn` на `http://localhost:3001`
3. Убедитесь, что Backend Proxy запущен на порту 3001

## 📝 Автозапуск при старте системы

### Через PM2 (рекомендуется)
```bash
# Установить PM2
npm install -g pm2

# Запустить Backend Proxy
cd server
pm2 start xui-backend-proxy.js --name xui-backend-proxy

# Сохранить конфигурацию PM2
pm2 save

# Настроить автозапуск
pm2 startup
```

### Через systemd (Linux)
Создайте файл `/etc/systemd/system/xui-backend-proxy.service`:
```ini
[Unit]
Description=XUI Backend Proxy
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/VPN/server
ExecStart=/usr/bin/node xui-backend-proxy.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Затем:
```bash
sudo systemctl enable xui-backend-proxy
sudo systemctl start xui-backend-proxy
```
