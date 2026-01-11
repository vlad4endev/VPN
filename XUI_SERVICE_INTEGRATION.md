# 🔌 Интеграция XUI Service

## ✅ Что создано

1. **XUIService** - Централизованный сервис для работы с 3x-ui API
2. **XUILogger** - Детальное логирование всех взаимодействий
3. **XUIConfig** - Настройки через Firestore (для админа)
4. **XUIProvider** - Глобальный Context Provider
5. **useXUI** - React хук для использования в компонентах

## 🚀 Быстрая интеграция

### Шаг 1: Подключить Provider

В `src/VPNServiceApp.jsx` или корневом компоненте:

```jsx
import { XUIProvider } from './features/vpn/context/XUIContext.jsx'

export default function VPNServiceApp() {
  const { db, currentUser } = useFirebase()
  
  return (
    <XUIProvider db={db} currentUser={currentUser}>
      {/* Существующий код */}
    </XUIProvider>
  )
}
```

### Шаг 2: Использовать в компонентах

Заменить прямые вызовы API на использование `useXUI`:

**Было:**
```jsx
// Прямой вызов через axios или ThreeXUI
const response = await axios.post('/api/xui/login', { username, password })
```

**Стало:**
```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

function MyComponent() {
  const { login, addClient } = useXUI()
  
  const handleLogin = async () => {
    await login(server) // server - объект сервера
  }
}
```

## 📋 Примеры миграции

### Пример 1: Тестирование сессии сервера

**Было (в VPNServiceApp.jsx):**
```jsx
const response = await axios.post('/api/test-session', requestPayload)
```

**Стало:**
```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

const { login } = useXUI()

const handleTestServerSession = async (server) => {
  try {
    await login(server) // Использует server.xuiUsername и server.xuiPassword
    // Успех
  } catch (error) {
    // Обработка ошибки
  }
}
```

### Пример 2: Добавление клиента

**Было:**
```jsx
import ThreeXUI from './services/ThreeXUI.js'
const xui = ThreeXUI.getInstance()
await xui.addClient(inboundId, email, uuid, options)
```

**Стало:**
```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

const { addClient, generateUUID } = useXUI()

const handleAddClient = async () => {
  const uuid = generateUUID()
  await addClient(inboundId, email, uuid, options, server)
}
```

### Пример 3: Получение статистики

**Было:**
```jsx
const stats = await xui.getClientStats(email)
```

**Стало:**
```jsx
const { getClientStats } = useXUI()
const stats = await getClientStats(email, server)
```

## 🎛️ Настройка для админа

### Через код (временное решение):

```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

function AdminConfig() {
  const { updateConfig, currentUser } = useXUI()
  
  const handleUpdate = async () => {
    await updateConfig({
      global: {
        'retry.maxRetries': 5,
        'rateLimiter.maxRequests': 20,
        'circuitBreaker.failureThreshold': 10,
      }
    }, currentUser.id)
  }
}
```

### Через Firestore (рекомендуется):

1. Открыть Firestore Console
2. Перейти в `artifacts/{APP_ID}/public/xui_config`
3. Редактировать документ напрямую

## 📊 Просмотр логов и метрик

```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

function LogsViewer() {
  const { getHistory, getMetrics } = useXUI()
  
  // Последние ошибки
  const errors = getHistory({ 
    status: 'error', 
    limit: 20 
  })
  
  // Метрики
  const metrics = getMetrics()
  console.log('Success Rate:', metrics.successRate)
  console.log('Average Response Time:', metrics.averageResponseTime)
  
  return (
    <div>
      <h2>Metrics</h2>
      <pre>{JSON.stringify(metrics, null, 2)}</pre>
      
      <h2>Recent Errors</h2>
      {errors.map(error => (
        <div key={error.id}>
          <p>{error.method} {error.endpoint}</p>
          <p>{error.error?.message}</p>
        </div>
      ))}
    </div>
  )
}
```

## 🔄 Постепенная миграция

Можно мигрировать постепенно:

1. **Сначала**: Подключить `XUIProvider` (не сломает существующий код)
2. **Затем**: Заменить вызовы в новых компонентах
3. **Потом**: Постепенно мигрировать старые компоненты

Старый `ThreeXUI` продолжит работать параллельно.

## ✅ Преимущества

1. ✅ **Детальное логирование** - все запросы/ответы логируются автоматически
2. ✅ **Гибкая настройка** - админ может настраивать через Firestore
3. ✅ **Глобальный доступ** - доступен везде через Context
4. ✅ **Автоматизация** - Circuit Breaker, Rate Limiter, Retry работают автоматически
5. ✅ **Метрики** - встроенные метрики для мониторинга

## 📚 Документация

Полная документация: `src/features/vpn/README.md`

## 🐛 Отладка

Если что-то не работает:

1. Проверить, что `XUIProvider` подключен
2. Проверить, что `db` и `currentUser` переданы в Provider
3. Проверить логи через `getHistory()`
4. Проверить метрики через `getMetrics()`
5. Проверить конфигурацию через `getConfig()`

## 🎯 Следующие шаги

1. ✅ Подключить `XUIProvider` в корневом компоненте
2. ✅ Заменить вызовы API на `useXUI` в новых компонентах
3. ⚠️ Постепенно мигрировать старые компоненты
4. ⚠️ Настроить конфигурацию через Firestore (для админа)
5. ⚠️ Добавить UI для просмотра логов и метрик (опционально)

