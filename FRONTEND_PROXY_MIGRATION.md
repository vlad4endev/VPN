# 🔄 Frontend Refactoring for Proxy Integration

## ✅ Выполненные изменения

### 1. Упрощен XUIService (`src/features/vpn/services/XUIService.js`)

**Удалено:**
- ❌ CircuitBreaker
- ❌ RateLimiter
- ❌ Login логика
- ❌ Кеш клиентов
- ❌ XUIConfig
- ❌ Credentials (username/password)
- ❌ ensureAuthenticated
- ❌ refreshClientCache

**Оставлено:**
- ✅ Простой Axios instance с baseURL на Proxy
- ✅ Interceptors для логирования
- ✅ Простые методы: `addClient`, `deleteClient`, `getClientStats`, `getInbounds`, `getInbound`
- ✅ HealthCheck для проверки Proxy

**Новый формат методов:**

```javascript
// Старый формат (удален):
await service.addClient(inboundId, email, uuid, options, server)

// Новый формат (через Proxy):
await service.addClient({
  userId: 'user-id',
  email: 'user@example.com',
  inboundId: 3,
  totalGB: 100,
  expiryTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
  limitIp: 1
})
```

### 2. Обновлен XUIProvider (`src/features/vpn/context/XUIContext.jsx`)

**Изменения:**
- ❌ Убрана зависимость от `db` и `currentUser`
- ❌ Убрана полная инициализация через `initialize()`
- ✅ Простой healthCheck для проверки Proxy
- ✅ Упрощенные методы без параметров `server`

**Новый формат использования:**

```javascript
// Старый формат (удален):
const { login, addClient } = useXUI()
await login(server)
await addClient(inboundId, email, uuid, options, server)

// Новый формат:
const { addClient } = useXUI()
await addClient({
  userId: currentUser.id,
  email: user.email,
  inboundId: settings.xuiInboundId,
  totalGB: 100,
  expiryTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
  limitIp: 1
})
```

### 3. Переменные окружения

**Добавить в `.env`:**
```env
VITE_PROXY_URL=http://localhost:3000
```

**Удалить из `.env` (больше не нужны):**
```env
# VITE_XUI_USERNAME=... (удалить)
# VITE_XUI_PASSWORD=... (удалить)
# VITE_XUI_HOST=... (удалить - теперь на backend)
```

---

## 🔧 Требуется обновление компонентов

### Компоненты, которые нужно обновить:

1. **`src/features/admin/services/adminService.js`**
   - Убрать прямые вызовы `ThreeXUI.addClient()`
   - Заменить на `useXUI().addClient()`
   - Убрать прямые записи в Firestore для VPN статуса

2. **`src/features/dashboard/services/dashboardService.js`**
   - Убрать прямые вызовы `ThreeXUI`
   - Использовать `useXUI()` методы

3. **`src/VPNServiceApp.jsx`**
   - Убрать `handleTestServerSession` (теперь на backend)
   - Убрать прямые обновления Firestore для VPN статуса

4. **`src/features/admin/components/UserCard.jsx`**
   - Убрать прямые обновления `vpnStatus`, `vpnUuid` в Firestore
   - Использовать только Proxy методы

---

## 📝 Примеры миграции

### Пример 1: Добавление клиента

**Было:**
```javascript
import ThreeXUI from '../services/ThreeXUI.js'

const uuid = ThreeXUI.generateUUID()
await ThreeXUI.addClient(inboundId, email, uuid, {
  totalGB: 100,
  expiryTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
  limitIp: 1
}, server)

// Прямая запись в Firestore
await updateDoc(userDoc, {
  vpnUuid: uuid,
  vpnStatus: 'active',
  vpnInboundId: inboundId
})
```

**Стало:**
```javascript
import { useXUI } from '../hooks/useXUI.js'

const { addClient } = useXUI()

// Backend выполняет транзакцию: Firestore → 3x-ui → Firestore
const result = await addClient({
  userId: user.id,
  email: user.email,
  inboundId: settings.xuiInboundId,
  totalGB: 100,
  expiryTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
  limitIp: 1
})

// Firestore уже обновлен backend'ом, просто используем результат
console.log('VPN UUID:', result.vpnUuid)
```

### Пример 2: Удаление клиента

**Было:**
```javascript
await ThreeXUI.deleteClient(inboundId, email, server)

// Прямая запись в Firestore
await updateDoc(userDoc, {
  vpnStatus: 'deleted',
  vpnUuid: null
})
```

**Стало:**
```javascript
const { deleteClient } = useXUI()

await deleteClient({
  inboundId: settings.xuiInboundId,
  email: user.email
})

// Backend обновляет Firestore автоматически
```

### Пример 3: Получение статистики

**Было:**
```javascript
const stats = await ThreeXUI.getClientStats(email, server)
```

**Стало:**
```javascript
const { getClientStats } = useXUI()

const stats = await getClientStats({
  email: user.email
})
```

---

## ⚠️ Важные замечания

### 1. Транзакции теперь на Backend

**Не нужно:**
- ❌ Устанавливать `status: 'creating'` в Firestore
- ❌ Обновлять `vpnStatus`, `vpnUuid`, `vpnInboundId` вручную
- ❌ Обрабатывать rollback вручную

**Backend делает:**
- ✅ Устанавливает `status: 'creating'`
- ✅ Создает клиента в 3x-ui
- ✅ Обновляет Firestore с `vpnUuid` и `status: 'active'`
- ✅ Выполняет rollback при ошибках

### 2. Обработка ошибок

**Backend возвращает:**
```javascript
{
  success: false,
  msg: 'Failed to create client in VPN system',
  error: 'Error message'
}
```

**Frontend должен:**
```javascript
try {
  await addClient(data)
  // Успех - Firestore уже обновлен
} catch (error) {
  // Ошибка - Backend уже обновил Firestore с status: 'error'
  // Просто показываем ошибку пользователю
  setError(error.message)
}
```

### 3. HealthCheck

**Использование:**
```javascript
const { healthCheck, initialized } = useXUI()

if (!initialized) {
  const health = await healthCheck()
  if (!health.proxy) {
    // Proxy недоступен
  }
}
```

---

## 🚀 Следующие шаги

1. ✅ Обновить XUIService (выполнено)
2. ✅ Обновить XUIProvider (выполнено)
3. ⚠️ Обновить компоненты, использующие ThreeXUI
4. ⚠️ Убрать прямые записи в Firestore для VPN статуса
5. ⚠️ Добавить `VITE_PROXY_URL` в `.env`
6. ⚠️ Протестировать все операции через Proxy

---

**Дата:** 2025-01-27  
**Статус:** Частично выполнено (требуется обновление компонентов)
