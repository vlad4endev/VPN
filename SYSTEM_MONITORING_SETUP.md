# 📊 System Monitoring Setup

## ✅ Что создано

### Backend Routes

**Файл:** `server/xui-backend-proxy.js`

Добавлены endpoints:
- `GET /api/system/status` - Метрики системы (CPU, RAM, Uptime, 3x-ui статус)
- `GET /api/system/logs` - Последние логи (пока возвращает пустой массив, требует интеграции с XUILogger)

### Frontend Component

**Файл:** `src/features/admin/components/SystemMonitor.jsx`

Компонент включает:
- ✅ 4 Info Cards (Status, CPU, RAM, Active Connections)
- ✅ Line Chart для latency (Recharts)
- ✅ Log Terminal с фильтрами (Info, Warning, Error)
- ✅ Кнопка "Очистить" для логов
- ✅ Real-time обновление каждые 5 секунд

### Интеграция

**Файл:** `src/features/admin/components/AdminPanel.jsx`

- ✅ Добавлен таб "Мониторинг" с иконкой Activity
- ✅ Импортирован SystemMonitor компонент
- ✅ Интегрирован в навигацию

---

## 🚀 Установка

### 1. Установить Recharts

```bash
npm install recharts
```

### 2. Настроить Proxy URL

В `.env`:
```env
VITE_PROXY_URL=http://localhost:3000
```

### 3. Запустить Backend Proxy

```bash
cd server
npm install
node xui-backend-proxy.js
```

---

## 📊 Использование

1. Откройте Admin Panel
2. Перейдите на таб "Мониторинг"
3. Компонент автоматически обновляется каждые 5 секунд

### Info Cards

- **Status**: Статус подключения к 3x-ui, время ответа
- **CPU**: Использование CPU с прогресс-баром
- **RAM**: Использование RAM с прогресс-баром
- **Active Connections**: Количество активных подключений

### Response Time Chart

График показывает последние 30 точек времени ответа API в реальном времени.

### Log Terminal

- Фильтры: Все / Info / Warning / Error
- Автоматическая прокрутка к последним логам
- Кнопка "Очистить" для очистки отображаемых логов

---

## 🔧 Настройка

### Изменить интервал обновления

В `SystemMonitor.jsx`:
```javascript
// Polling every 5 seconds
useEffect(() => {
  const interval = setInterval(() => {
    fetchStatus()
    fetchLogs()
  }, 5000) // Измените на нужное значение (в миллисекундах)

  return () => clearInterval(interval)
}, [fetchStatus, fetchLogs])
```

### Изменить количество точек на графике

В `SystemMonitor.jsx`:
```javascript
const maxHistoryPoints = 30 // Измените на нужное значение
```

### Настроить фильтры логов

В `SystemMonitor.jsx`:
```javascript
const [logFilter, setLogFilter] = useState('all') // 'all' | 'info' | 'warn' | 'error'
```

---

## ⚠️ Текущие ограничения

1. **Логи**: Endpoint `/api/system/logs` пока возвращает пустой массив. Требуется интеграция с XUILogger в backend.

2. **3x-ui Status**: Упрощенная проверка (наличие активных сессий). Для полной проверки требуется интеграция с XUIService.

---

## 🔄 Интеграция с XUILogger (будущее)

Для полной интеграции логов нужно:

1. Импортировать XUILogger в `server/xui-backend-proxy.js`:
```javascript
import xuiLogger from './src/services/XUILogger.js'
```

2. Обновить endpoint `/api/system/logs`:
```javascript
app.get('/api/system/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100
  const level = req.query.level || 'all'
  
  const filters = { limit }
  if (level !== 'all') {
    filters.status = level === 'error' ? 'error' : 'success'
  }
  
  const history = xuiLogger.getHistory(filters)
  // ... форматирование и возврат
})
```

---

## 📝 API Endpoints

### GET /api/system/status

**Response:**
```json
{
  "success": true,
  "data": {
    "cpu": {
      "usage": 25.5,
      "load": 1.2,
      "cores": 4
    },
    "ram": {
      "usage": 45.3,
      "used": 8589934592,
      "total": 17179869184,
      "usedGB": 8.0,
      "totalGB": 16.0
    },
    "uptime": {
      "seconds": 86400,
      "formatted": "24h 0m"
    },
    "xui": {
      "connected": true,
      "lastCheck": "2025-01-27T...",
      "activeSessions": 5
    },
    "activeConnections": 5,
    "timestamp": "2025-01-27T..."
  }
}
```

### GET /api/system/logs

**Query Params:**
- `limit`: number (default: 100)
- `level`: 'all' | 'info' | 'warn' | 'error' (default: 'all')

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [...],
    "total": 50,
    "filters": {
      "limit": 100,
      "level": "all"
    }
  }
}
```

---

**Дата создания:** 2025-01-27  
**Статус:** ✅ Готово к использованию
