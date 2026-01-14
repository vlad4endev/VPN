# 🔑 Интеграция "Получить ключ" с 3x-ui API

## ✅ Выполненные изменения

### 1. Обновлен `dashboardService.js`

**Файл:** `src/features/dashboard/services/dashboardService.js`

**Изменения:**
- ❌ Удален импорт старого `ThreeXUI`
- ✅ Добавлен импорт нового `XUIService`
- ✅ Метод `getKey()` теперь использует `XUIService.addClient()` через Backend Proxy
- ✅ Метод `createSubscription()` также обновлен для использования Proxy
- ✅ Метод `deleteAccount()` обновлен для использования Proxy

**Новый формат:**
```javascript
// Старый формат (удален):
await ThreeXUI.addClient(inboundId, user.email, generatedUUID)

// Новый формат (через Proxy):
const xuiService = XUIService.getInstance()
await xuiService.addClient({
  userId: user.id,
  email: user.email,
  inboundId: parseInt(inboundId),
  totalGB: totalGB,
  expiryTime: expiryTime,
  limitIp: 1,
})
```

### 2. Создан Backend Route `/api/vpn/add-client`

**Файл:** `server/xui-backend-proxy.js`

**Endpoint:** `POST /api/vpn/add-client`

**Функционал:**
- ✅ Принимает данные от frontend (userId, email, inboundId, totalGB, expiryTime, limitIp)
- ✅ Генерирует UUID, если не передан
- ✅ Формирует запрос к 3x-ui согласно документации:
  - `POST /panel/api/inbounds/addClient`
  - Body: `{ "id": inboundId, "settings": "{\"clients\": [{...}]}" }`
- ✅ Использует активную сессию для авторизации
- ✅ Возвращает `vpnUuid` и `inboundId`

**Формат запроса к 3x-ui:**
```json
{
  "id": 3,
  "settings": "{\"clients\": [{\"id\": \"uuid\", \"flow\": \"xtls-rprx-vision\", \"email\": \"email@example.com\", \"limitIp\": 1, \"totalGB\": 100, \"expiryTime\": 1234567890, \"enable\": true, \"tgId\": \"\", \"subId\": \"\", \"reset\": 0}]}"
}
```

### 3. Создан Backend Route `/api/vpn/delete-client`

**Endpoint:** `POST /api/vpn/delete-client`

**Функционал:**
- ✅ Удаляет клиента из 3x-ui
- ✅ Использует формат: `POST /panel/api/inbounds/{inboundId}/delClient/{clientId}`

### 4. Создан Backend Route `/api/vpn/health`

**Endpoint:** `GET /api/vpn/health`

**Функционал:**
- ✅ Health check для VPN Proxy
- ✅ Возвращает статус и количество активных сессий

---

## 🔄 Поток данных

```
Dashboard Component
    ↓ onClick "Получить ключ"
useSubscription.handleGetKey()
    ↓
dashboardService.getKey(user)
    ↓
XUIService.addClient({...})
    ↓ POST /api/vpn/add-client
Backend Proxy
    ↓ POST /panel/api/inbounds/addClient (с сессией)
3x-ui API
    ↓
Backend Proxy → Frontend (vpnUuid)
    ↓
dashboardService обновляет Firestore (UUID)
    ↓
Dashboard обновляет UI
```

---

## 📋 Формат запроса

### Frontend → Backend Proxy

**POST** `/api/vpn/add-client`

```json
{
  "userId": "user-id-in-firestore",
  "email": "user@example.com",
  "inboundId": 3,
  "totalGB": 100,
  "expiryTime": 1735689600000,
  "limitIp": 1,
  "clientId": "optional-uuid-if-exists"
}
```

### Backend Proxy → 3x-ui

**POST** `/panel/api/inbounds/addClient`

```json
{
  "id": 3,
  "settings": "{\"clients\": [{\"id\": \"uuid-v4\", \"flow\": \"xtls-rprx-vision\", \"email\": \"user@example.com\", \"limitIp\": 1, \"totalGB\": 100, \"expiryTime\": 1735689600000, \"enable\": true, \"tgId\": \"\", \"subId\": \"\", \"reset\": 0}]}"
}
```

### Ответ от Backend Proxy

```json
{
  "success": true,
  "vpnUuid": "uuid-v4",
  "inboundId": 3,
  "email": "user@example.com",
  "message": "Клиент успешно создан"
}
```

---

## ⚠️ Требования

### 1. Активная сессия

Backend Proxy требует активную сессию для создания клиента. Сессия создается через:
- `POST /api/xui/login` (см. документацию по логину)

### 2. Переменные окружения

**Frontend (.env):**
```env
VITE_PROXY_URL=http://localhost:3000
VITE_XUI_INBOUND_ID=3
```

**Backend (.env):**
```env
XUI_HOST=http://your-3x-ui-server:port
XUI_USERNAME=your-username
XUI_PASSWORD=your-password
PROXY_PORT=3000
```

---

## 🧪 Тестирование

1. **Запустите Backend Proxy:**
   ```bash
   cd server
   node xui-backend-proxy.js
   ```

2. **Создайте сессию:**
   ```bash
   curl -X POST http://localhost:3000/api/xui/login \
     -H "Content-Type: application/json" \
     -d '{
       "serverIP": "your-server-ip",
       "serverPort": 2053,
       "username": "your-username",
       "password": "your-password",
       "randompath": "your-path"
     }'
   ```

3. **Создайте клиента:**
   ```bash
   curl -X POST http://localhost:3000/api/vpn/add-client \
     -H "Content-Type: application/json" \
     -d '{
       "userId": "user-id",
       "email": "test@example.com",
       "inboundId": 3,
       "totalGB": 100,
       "expiryTime": 1735689600000,
       "limitIp": 1
     }'
   ```

---

## 📝 Примечания

1. **Сессия:** Backend использует первую доступную сессию, если `sessionId` не передан. В production рекомендуется передавать `sessionId` или `serverId`.

2. **UUID:** Если `clientId` не передан, backend генерирует новый UUID v4.

3. **Транзакции:** Backend не выполняет транзакции с Firestore. Frontend обновляет Firestore после успешного создания клиента в 3x-ui.

4. **Ошибки:** Все ошибки логируются в консоль backend и возвращаются frontend в понятном формате.

---

**Дата создания:** 2025-01-27  
**Статус:** ✅ Готово к использованию
