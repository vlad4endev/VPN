# 🔑 Обновление "Получить ключ" - UUID из профиля, тариф и сессия из базы

## ✅ Выполненные изменения

### 1. Использование UUID из профиля пользователя

**Файл:** `src/features/dashboard/services/dashboardService.js`

**Изменения:**
- ✅ Используется UUID из профиля пользователя (`user.uuid`), который генерируется при регистрации
- ❌ Убрана генерация нового UUID, если он уже есть
- ✅ Если UUID отсутствует, выбрасывается ошибка (требуется обращение к администратору)

```javascript
// ВАЖНО: Используем UUID из профиля пользователя (генерируется при регистрации)
if (!user.uuid || user.uuid.trim() === '') {
  throw new Error('UUID пользователя не найден. Обратитесь к администратору.')
}
```

### 2. Заполнение данных из тарифа

**Изменения:**
- ✅ Загружается тариф пользователя из Firestore по `user.tariffId`
- ✅ Используется `tariff.trafficGB` для `totalGB`
- ✅ Используется `user.expiresAt` для `expiryTime` (срок оплаты)
- ✅ Если `expiryTime` не установлен, вычисляется из `tariff.durationDays`

```javascript
// Загружаем тариф пользователя
const tariffDoc = doc(db, `artifacts/${APP_ID}/public/data/tariffs`, user.tariffId)
const tariff = tariffDoc.data()
totalGB = tariff.trafficGB > 0 ? tariff.trafficGB : 0
expiryTime = user.expiresAt || (tariff.durationDays > 0 ? Date.now() + (tariff.durationDays * 24 * 60 * 60 * 1000) : 0)
```

### 3. Использование сохраненной сессии из базы данных

**Изменения:**
- ✅ Ищется активный сервер с сохраненной сессией (`sessionCookie`, `sessionCookieReceivedAt`)
- ✅ Проверяется срок действия сессии (1 час)
- ✅ Передаются данные сервера в backend: `sessionCookie`, `serverIP`, `serverPort`, `randompath`, `protocol`

```javascript
// Ищем сервер с активной сессией
const server = serverDoc.data()
if (server.active && server.sessionCookie && server.sessionCookieReceivedAt) {
  const sessionAge = Date.now() - new Date(server.sessionCookieReceivedAt).getTime()
  if (sessionAge < oneHour) {
    // Используем эту сессию
    sessionCookie = server.sessionCookie
    serverIP = server.serverIP
    serverPort = server.serverPort
    // ...
  }
}
```

### 4. Обновление Backend Route

**Файл:** `server/xui-backend-proxy.js`

**Изменения:**
- ✅ Принимает `sessionCookie`, `serverIP`, `serverPort`, `randompath`, `protocol` из frontend
- ✅ Использует сессию из базы данных, если она передана
- ✅ Формирует `baseUrl` из данных сервера
- ✅ Конвертирует `expiryTime` из миллисекунд в секунды (Unix timestamp)

```javascript
// Получаем сессию из базы данных (переданную из frontend)
if (sessionCookie && serverIP && serverPort) {
  const normalizedPath = randompath ? `/${randompath.replace(/^\/+|\/+$/g, '')}` : ''
  baseUrl = `${protocol || 'http'}://${serverIP}:${serverPort}${normalizedPath}`.replace(/\/+$/, '')
  cookie = sessionCookie
}
```

---

## 📋 Формат запроса

### Frontend → Backend Proxy

**POST** `/api/vpn/add-client`

```json
{
  "userId": "user-id",
  "email": "user@example.com",
  "inboundId": 3,
  "totalGB": 100,
  "expiryTime": 1735689600000,
  "limitIp": 1,
  "clientId": "uuid-from-profile",
  "serverId": "server-id",
  "sessionCookie": "3x-ui=MTc2NzcyNjkxMXx...",
  "serverIP": "84.201.161.204",
  "serverPort": 40919,
  "randompath": "Gxckr4KcZGtB6aOZdw",
  "protocol": "https"
}
```

### Backend Proxy → 3x-ui

**POST** `/panel/api/inbounds/addClient`

```json
{
  "id": 3,
  "settings": "{\"clients\": [{\"id\": \"uuid-from-profile\", \"flow\": \"xtls-rprx-vision\", \"email\": \"user@example.com\", \"limitIp\": 1, \"totalGB\": 100, \"expiryTime\": 1735689600, \"enable\": true, \"tgId\": \"\", \"subId\": \"\", \"reset\": 0}]}"
}
```

**Важно:**
- `expiryTime` конвертируется из миллисекунд в секунды (Unix timestamp)
- `id` в `settings` - это UUID из профиля пользователя
- `totalGB` и `expiryTime` берутся из тарифа и срока оплаты

---

## 🔄 Поток данных

```
Dashboard → "Получить ключ"
    ↓
dashboardService.getKey(user)
    ↓
1. Проверка UUID из профиля (user.uuid)
2. Загрузка тарифа из Firestore (user.tariffId)
3. Поиск активного сервера с сессией
    ↓
XUIService.addClient({
  clientId: user.uuid,  // UUID из профиля
  totalGB: tariff.trafficGB,  // Из тарифа
  expiryTime: user.expiresAt,  // Из срока оплаты
  sessionCookie: server.sessionCookie,  // Из базы
  serverIP, serverPort, randompath, protocol  // Данные сервера
})
    ↓
Backend Proxy
    ↓
1. Использует sessionCookie из базы
2. Формирует baseUrl из данных сервера
3. Конвертирует expiryTime в секунды
    ↓
3x-ui API
```

---

## ⚠️ Требования

1. **UUID в профиле:** Пользователь должен иметь UUID (генерируется при регистрации)
2. **Активный сервер:** Должен быть активный сервер с сохраненной сессией
3. **Срок сессии:** Сессия должна быть не старше 1 часа
4. **Тариф:** Пользователь должен иметь `tariffId` для загрузки лимитов

---

## 🧪 Тестирование

1. **Проверьте UUID пользователя:**
   ```javascript
   // В Firestore: artifacts/{APP_ID}/public/data/users_v4/{userId}
   // Должно быть поле: uuid
   ```

2. **Проверьте сессию сервера:**
   ```javascript
   // В Firestore: artifacts/{APP_ID}/public/data/servers/{serverId}
   // Должны быть поля:
   // - active: true
   // - sessionCookie: "3x-ui=..."
   // - sessionCookieReceivedAt: timestamp
   ```

3. **Проверьте тариф:**
   ```javascript
   // В Firestore: artifacts/{APP_ID}/public/data/tariffs/{tariffId}
   // Должны быть поля:
   // - trafficGB: number
   // - durationDays: number
   ```

---

**Дата создания:** 2025-01-27  
**Статус:** ✅ Готово к использованию
