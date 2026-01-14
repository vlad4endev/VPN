# 🔄 Интеграция Backend Proxy для 3x-ui

## 📋 Краткое описание

Backend Proxy решает все архитектурные проблемы:
- ✅ HttpOnly cookies сохраняются на сервере
- ✅ Сессия переиспользуется между запросами
- ✅ Нет CORS проблем
- ✅ Централизованное управление сессией

---

## 🚀 Установка и запуск

### 1. Установка зависимостей

```bash
cd server
npm install express axios cookie-parser dotenv
```

### 2. Настройка переменных окружения

Создайте `server/.env`:

```env
FRONTEND_URL=http://localhost:5173
PROXY_PORT=3001
PROXY_HOST=0.0.0.0
NODE_ENV=development
```

### 3. Запуск

```bash
# Обычный запуск
node server/xui-backend-proxy.js

# С PM2
pm2 start server/xui-backend-proxy.js --name xui-backend-proxy

# С автоперезагрузкой (dev)
node --watch server/xui-backend-proxy.js
```

---

## 🔧 Интеграция в Frontend

### Шаг 1: Обновить `src/services/ThreeXUI.js`

```javascript
class ThreeXUI {
  constructor() {
    // В production используем backend proxy
    const isProduction = import.meta.env.PROD
    const proxyUrl = import.meta.env.VITE_API_PROXY_URL || 'http://localhost:3001'
    
    this.baseURL = isProduction 
      ? `${proxyUrl}/api/xui`  // Production: через backend proxy
      : '/api/xui'              // Development: через Vite proxy
    
    this.sessionId = null // ID сессии для backend proxy
    
    // ... остальной код
  }
  
  /**
   * Логин через backend proxy
   */
  async login() {
    // Если используем backend proxy
    if (import.meta.env.PROD || import.meta.env.VITE_USE_BACKEND_PROXY === 'true') {
      const proxyUrl = import.meta.env.VITE_API_PROXY_URL || 'http://localhost:3001'
      
      // Получаем данные сервера из настроек
      const serverIP = import.meta.env.XUI_HOST?.split('://')[1]?.split('/')[0]?.split(':')[0] || 'localhost'
      const serverPort = import.meta.env.XUI_HOST?.split(':').pop()?.split('/')[0] || '2053'
      const protocol = import.meta.env.XUI_HOST?.startsWith('https') ? 'https' : 'http'
      const randompath = import.meta.env.XUI_HOST?.split('/').slice(3).join('/') || ''
      
      const loginResponse = await this.api.post(`${proxyUrl}/api/xui/login`, {
        serverIP,
        serverPort: Number(serverPort),
        protocol,
        randompath,
        username: this.username,
        password: this.password,
      })
      
      if (loginResponse.data.success) {
        this.sessionId = loginResponse.data.sessionId
        return loginResponse.data
      } else {
        throw new Error(loginResponse.data.msg || 'Ошибка авторизации')
      }
    }
    
    // Старый способ (через Vite proxy) - для development
    // ... существующий код
  }
  
  /**
   * Все API запросы с sessionId
   */
  async addClient(inboundId, email, uuid, options = {}) {
    // Если используем backend proxy, добавляем sessionId
    const payload = {
      id: Number(inboundId),
      settings: JSON.stringify({
        clients: [{
          id: uuid,
          email: email,
          // ... остальные поля
        }]
      })
    }
    
    if (this.sessionId) {
      payload.sessionId = this.sessionId
    }
    
    const response = await this.api.post(
      `/panel/api/inbounds/addClient`,
      payload
    )
    
    return response.data
  }
  
  // Аналогично для всех других методов: deleteClient, updateClient, etc.
}
```

### Шаг 2: Обновить `src/VPNServiceApp.jsx`

```javascript
// В handleTestServerSession использовать backend proxy для production
const handleTestServerSession = useCallback(async (server) => {
  // ... существующий код ...
  
  // Если используем backend proxy
  if (import.meta.env.PROD || import.meta.env.VITE_USE_BACKEND_PROXY === 'true') {
    const proxyUrl = import.meta.env.VITE_API_PROXY_URL || 'http://localhost:3001'
    
    const response = await axios.post(`${proxyUrl}/api/xui/login`, {
      serverIP: currentServer.serverIP,
      serverPort: currentServer.serverPort,
      protocol: protocol,
      randompath: currentServer.randompath || '',
      username: username,
      password: password,
    })
    
    // Обработка ответа...
    if (response.data.success) {
      // Сохраняем sessionId в сервер
      const updatedServerData = {
        sessionTested: true,
        sessionTestedAt: new Date().toISOString(),
        sessionError: null,
        sessionId: response.data.sessionId, // Сохраняем sessionId вместо cookie
        sessionExpiresAt: response.data.expiresAt,
      }
      // ... остальной код
    }
  } else {
    // Старый способ через Vite proxy
    // ... существующий код
  }
}, [servers, db, currentUser])
```

---

## 📊 Сравнение архитектур

### ❌ Текущая (проблемная):

```
Browser → Vite Proxy → 3x-ui API
         (cookies теряются)
```

**Проблемы:**
- HttpOnly cookies не доступны в браузере
- Каждый запрос = новый логин
- CORS проблемы

### ✅ Новая (правильная):

```
Browser → Backend Proxy → 3x-ui API
         (session store)
```

**Преимущества:**
- HttpOnly cookies сохраняются на сервере
- Сессия переиспользуется
- Нет CORS проблем
- Централизованное управление

---

## 🔍 Endpoints Backend Proxy

### POST `/api/xui/login`
Логин и получение sessionId

**Request:**
```json
{
  "serverIP": "84.201.161.204",
  "serverPort": 40919,
  "protocol": "https",
  "randompath": "/Gxckr4KcZGtB6aOZdw",
  "username": "vladislav4endev",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "msg": "You have successfully logged into your account.",
  "sessionId": "84.201.161.204:40919:vladislav4endev:1767727910668",
  "expiresAt": "2025-01-27T20:15:11.000Z"
}
```

### POST `/api/xui/*`
Проксирование запросов с sessionId

**Request:**
```json
{
  "sessionId": "84.201.161.204:40919:vladislav4endev:1767727910668",
  "id": 3,
  "settings": "{\"clients\": [...]}"
}
```

**Response:**
```json
{
  "success": true,
  "msg": "Inbound client(s) have been added.",
  "obj": null
}
```

### GET `/api/xui/health`
Health check

**Response:**
```json
{
  "status": "ok",
  "service": "xui-backend-proxy",
  "timestamp": "2025-01-27T19:15:11.000Z",
  "uptime": 3600,
  "activeSessions": 5
}
```

---

## 🐳 Docker

```dockerfile
# Dockerfile.proxy
FROM node:18-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm install --only=production

COPY server/xui-backend-proxy.js ./

EXPOSE 3001

CMD ["node", "xui-backend-proxy.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
    environment:
      - VITE_API_PROXY_URL=http://proxy:3001
      - VITE_USE_BACKEND_PROXY=true
    depends_on:
      - proxy

  proxy:
    build:
      context: .
      dockerfile: Dockerfile.proxy
    environment:
      - FRONTEND_URL=${FRONTEND_URL}
      - PROXY_PORT=3001
    ports:
      - "3001:3001"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/xui/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## ✅ Чеклист миграции

- [ ] Установить зависимости backend proxy
- [ ] Настроить переменные окружения
- [ ] Запустить backend proxy
- [ ] Обновить `ThreeXUI.js` для использования backend proxy
- [ ] Обновить `VPNServiceApp.jsx` для использования backend proxy
- [ ] Протестировать логин через backend proxy
- [ ] Протестировать все API методы
- [ ] Настроить Docker (опционально)
- [ ] Настроить мониторинг (опционально)

---

**Дата создания:** 2025-01-27  
**Версия:** 1.0.0

