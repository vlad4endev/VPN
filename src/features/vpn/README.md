# 🔌 XUI Service - Централизованный модуль для работы с 3x-ui API

## 📋 Описание

Централизованный модуль для всех взаимодействий с 3x-ui API с:
- ✅ Детальным логированием всех запросов/ответов
- ✅ Глобальным применением через Context
- ✅ Гибкой настройкой через Firestore (для админа)
- ✅ Автоматическим применением Circuit Breaker, Rate Limiter, Retry
- ✅ Кешированием и оптимизацией

## 🏗️ Архитектура

```
XUIProvider (Context)
    ↓
XUIService (Singleton)
    ├── XUILogger (детальное логирование)
    ├── XUIConfig (настройки из Firestore)
    ├── Circuit Breaker
    ├── Rate Limiter
    └── Retry механизм
```

## 🚀 Использование

### 1. Подключение Provider

В корневом компоненте приложения:

```jsx
import { XUIProvider } from './features/vpn/context/XUIContext.jsx'

function App() {
  const { db, currentUser } = useFirebase()
  
  return (
    <XUIProvider db={db} currentUser={currentUser}>
      {/* Ваше приложение */}
    </XUIProvider>
  )
}
```

### 2. Использование в компонентах

```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

function MyComponent() {
  const { 
    login, 
    addClient, 
    getInbounds,
    getHistory,
    getMetrics,
    initialized 
  } = useXUI()

  // Использование методов
  const handleLogin = async () => {
    try {
      await login(server) // server - объект сервера (опционально)
    } catch (error) {
      console.error(error)
    }
  }

  const handleAddClient = async () => {
    try {
      const uuid = generateUUID()
      await addClient(inboundId, email, uuid, options, server)
    } catch (error) {
      console.error(error)
    }
  }

  // Просмотр истории взаимодействий
  const history = getHistory({ 
    status: 'error', 
    limit: 10 
  })

  // Просмотр метрик
  const metrics = getMetrics()
  console.log('Success rate:', metrics.successRate)
  console.log('Average response time:', metrics.averageResponseTime)
}
```

## 📊 API Методы

### Основные методы

#### `login(server?)`
Авторизация в 3x-ui
```js
await login(server) // server - объект сервера (опционально)
```

#### `addClient(inboundId, email, uuid, options?, server?)`
Добавление клиента
```js
await addClient(3, 'user@example.com', uuid, {
  totalGB: 100,
  expiryTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
  limitIp: 1,
}, server)
```

#### `deleteClient(inboundId, email, server?)`
Удаление клиента
```js
await deleteClient(3, 'user@example.com', server)
```

#### `getInbounds(server?)`
Получение списка инбаундов
```js
const inbounds = await getInbounds(server)
```

#### `getInbound(inboundId, server?)`
Получение инбаунда по ID
```js
const inbound = await getInbound(3, server)
```

#### `getClientStats(email, server?)`
Получение статистики клиента
```js
const stats = await getClientStats('user@example.com', server)
```

#### `healthCheck()`
Проверка состояния API
```js
const health = await healthCheck()
console.log(health.api_reachable)
console.log(health.metrics)
```

### Логирование и метрики

#### `getHistory(filters?)`
Получение истории взаимодействий
```js
// Все ошибки за последний час
const errors = getHistory({
  status: 'error',
  since: 60 * 60 * 1000, // 1 час
})

// Последние 10 запросов к определенному endpoint
const requests = getHistory({
  endpoint: '/login',
  limit: 10,
})
```

#### `getMetrics()`
Получение метрик
```js
const metrics = getMetrics()
// {
//   totalRequests: 150,
//   successfulRequests: 145,
//   failedRequests: 5,
//   successRate: '96.67%',
//   errorRate: '3.33%',
//   averageResponseTime: 234.5,
//   errorsByType: { HTTP_401: 3, HTTP_500: 2 },
//   requestsByEndpoint: { '/login': 10, '/addClient': 50 }
// }
```

### Конфигурация (только для админа)

#### `getConfig()`
Получение текущей конфигурации
```js
const config = getConfig()
```

#### `updateConfig(updates, userId)`
Обновление конфигурации
```js
await updateConfig({
  global: {
    'retry.maxRetries': 5,
    'rateLimiter.maxRequests': 20,
  },
  servers: {
    'server-123': {
      'retry.maxRetries': 10,
    }
  }
}, currentUser.id)
```

### Утилиты

#### `generateUUID()`
Генерация UUID для клиента
```js
const uuid = generateUUID()
```

#### `setCurrentServer(serverId)`
Установка текущего сервера (для контекстных настроек)
```js
setCurrentServer('server-123')
```

## ⚙️ Настройки (через Firestore)

Конфигурация хранится в `artifacts/{APP_ID}/public/xui_config`

### Глобальные настройки

```json
{
  "global": {
    "retry": {
      "enabled": true,
      "maxRetries": 3,
      "initialDelay": 1000,
      "maxDelay": 10000
    },
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 5,
      "timeout": 60000
    },
    "rateLimiter": {
      "enabled": true,
      "maxRequests": 10,
      "windowMs": 1000
    },
    "cache": {
      "enabled": true,
      "expiry": 300000
    },
    "logging": {
      "enabled": true,
      "level": "info",
      "logRequests": true,
      "logResponses": true,
      "logErrors": true,
      "maxHistory": 500
    },
    "timeout": {
      "default": 30000,
      "login": 10000,
      "healthCheck": 5000
    }
  }
}
```

### Настройки для сервера

```json
{
  "servers": {
    "server-123": {
      "retry.maxRetries": 10,
      "rateLimiter.maxRequests": 20
    }
  }
}
```

## 📝 Логирование

Все взаимодействия автоматически логируются через `XUILogger`:

- ✅ Все запросы (метод, URL, headers, body)
- ✅ Все ответы (статус, данные, время ответа)
- ✅ Все ошибки (тип, сообщение, stack trace)
- ✅ События (login, cache refresh, config update)
- ✅ Метрики (success rate, response time, errors by type)

### Просмотр логов

```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

function LogsViewer() {
  const { getHistory, getMetrics } = useXUI()
  
  const errors = getHistory({ status: 'error', limit: 20 })
  const metrics = getMetrics()
  
  return (
    <div>
      <h2>Метрики</h2>
      <p>Success Rate: {metrics.successRate}</p>
      <p>Average Response Time: {metrics.averageResponseTime}ms</p>
      
      <h2>Последние ошибки</h2>
      {errors.map(error => (
        <div key={error.id}>
          <p>{error.method} {error.endpoint}</p>
          <p>{error.error.message}</p>
        </div>
      ))}
    </div>
  )
}
```

## 🔍 Примеры использования

### Пример 1: Добавление клиента с обработкой ошибок

```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

function AddClientForm() {
  const { addClient, generateUUID, getHistory } = useXUI()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const uuid = generateUUID()
      await addClient(
        inboundId,
        email,
        uuid,
        {
          totalGB: 100,
          expiryTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
        },
        server
      )
      
      // Успех
      alert('Клиент добавлен!')
    } catch (err) {
      setError(err.message)
      
      // Просмотр последних ошибок для диагностики
      const recentErrors = getHistory({ 
        status: 'error', 
        limit: 5 
      })
      console.log('Recent errors:', recentErrors)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* ... */}
    </form>
  )
}
```

### Пример 2: Мониторинг здоровья API

```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

function HealthMonitor() {
  const { healthCheck, getMetrics } = useXUI()
  const [health, setHealth] = useState(null)
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    const checkHealth = async () => {
      const h = await healthCheck()
      const m = getMetrics()
      setHealth(h)
      setMetrics(m)
    }

    checkHealth()
    const interval = setInterval(checkHealth, 30000) // Каждые 30 секунд

    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      <h2>Health Status</h2>
      <p>API Reachable: {health?.api_reachable ? '✅' : '❌'}</p>
      <p>Authenticated: {health?.authenticated ? '✅' : '❌'}</p>
      <p>Response Time: {health?.response_time}ms</p>
      
      <h2>Metrics</h2>
      <p>Success Rate: {metrics?.successRate}</p>
      <p>Total Requests: {metrics?.totalRequests}</p>
    </div>
  )
}
```

### Пример 3: Настройка конфигурации (только для админа)

```jsx
import { useXUI } from './features/vpn/hooks/useXUI.js'

function ConfigPanel() {
  const { getConfig, updateConfig, currentUser } = useXUI()
  const [config, setConfig] = useState(null)

  useEffect(() => {
    setConfig(getConfig())
  }, [])

  const handleUpdate = async () => {
    await updateConfig({
      global: {
        'retry.maxRetries': 5,
        'rateLimiter.maxRequests': 20,
      }
    }, currentUser.id)
    
    setConfig(getConfig())
  }

  return (
    <div>
      <h2>XUI Configuration</h2>
      <pre>{JSON.stringify(config, null, 2)}</pre>
      <button onClick={handleUpdate}>Save</button>
    </div>
  )
}
```

## 🎯 Преимущества

1. **Централизация**: Все взаимодействия с 3x-ui в одном месте
2. **Детальное логирование**: Полная история всех запросов/ответов
3. **Гибкая настройка**: Админ может настраивать через Firestore
4. **Автоматизация**: Circuit Breaker, Rate Limiter, Retry работают автоматически
5. **Глобальный доступ**: Через Context доступен везде
6. **Типобезопасность**: Четкие интерфейсы и методы

## 📚 Дополнительная информация

- **XUILogger**: `src/features/vpn/services/XUILogger.js`
- **XUIConfig**: `src/features/vpn/services/XUIConfig.js`
- **XUIService**: `src/features/vpn/services/XUIService.js`
- **XUIProvider**: `src/features/vpn/context/XUIContext.jsx`
- **useXUI**: `src/features/vpn/hooks/useXUI.js`

