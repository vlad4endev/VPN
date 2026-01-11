# Синхронизация пользователя с n8n

## Обзор

Метод `sync_with_n8n()` позволяет синхронизировать данные пользователя между локальной базой данных (Firestore) и n8n. Метод запрашивает актуальное состояние профиля через webhook и обновляет локальную базу данных, если данные отличаются.

## Использование

### В коде

```javascript
import { dashboardService } from '../features/dashboard/services/dashboardService.js'

// Синхронизация данных пользователя
const result = await dashboardService.sync_with_n8n(currentUser)

if (result.updated) {
  console.log(`Обновлено ${result.changes.length} полей:`)
  result.changes.forEach(change => {
    console.log(`  ${change.field}: ${change.oldValue} → ${change.newValue}`)
  })
} else {
  console.log('Данные актуальны, обновление не требуется')
}
```

### В компоненте React

```javascript
import { useState } from 'react'
import { dashboardService } from '../features/dashboard/services/dashboardService.js'

function UserProfile({ user }) {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await dashboardService.sync_with_n8n(user)
      setSyncResult(result)
      
      if (result.updated) {
        // Обновить данные пользователя в компоненте
        // или перезагрузить из Firestore
      }
    } catch (error) {
      console.error('Ошибка синхронизации:', error)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      <button onClick={handleSync} disabled={syncing}>
        {syncing ? 'Синхронизация...' : 'Синхронизировать с n8n'}
      </button>
      
      {syncResult && (
        <div>
          {syncResult.updated ? (
            <p>Обновлено {syncResult.changes.length} полей</p>
          ) : (
            <p>Данные актуальны</p>
          )}
        </div>
      )}
    </div>
  )
}
```

## Формат ответа

### Успешная синхронизация с изменениями

```json
{
  "success": true,
  "updated": true,
  "message": "Синхронизировано: обновлено 3 полей",
  "changes": [
    {
      "field": "name",
      "oldValue": "Иван Иванов",
      "newValue": "Иван Петров"
    },
    {
      "field": "expiresAt",
      "oldValue": "2024-01-01T00:00:00.000Z",
      "newValue": "2024-02-01T00:00:00.000Z"
    },
    {
      "field": "devices",
      "oldValue": 1,
      "newValue": 2
    }
  ],
  "updatedFields": ["name", "expiresAt", "devices"],
  "syncedAt": "2024-01-15T12:00:00.000Z"
}
```

### Синхронизация без изменений

```json
{
  "success": true,
  "updated": false,
  "message": "Данные актуальны, обновление не требуется",
  "changes": [],
  "syncedAt": "2024-01-15T12:00:00.000Z"
}
```

### Ошибка

```json
{
  "success": false,
  "updated": false,
  "message": "n8n недоступен. Убедитесь, что n8n запущен и webhook настроен.",
  "changes": []
}
```

## Поля, которые синхронизируются

Метод сравнивает следующие поля:

- `name` - Имя пользователя
- `email` - Email
- `phone` - Телефон
- `uuid` - UUID пользователя
- `vpnUuid` - UUID VPN клиента
- `plan` - План подписки
- `expiresAt` - Дата истечения подписки
- `tariffId` - ID тарифа
- `tariffName` - Название тарифа
- `devices` - Количество устройств
- `natrockPort` - Порт NatRock
- `periodMonths` - Период оплаты (месяцы)
- `paymentStatus` - Статус оплаты
- `testPeriodStartDate` - Начало тестового периода
- `testPeriodEndDate` - Конец тестового периода
- `discount` - Скидка
- `vpnLink` - VPN ссылка
- `status` - Статус пользователя

## Настройка n8n Workflow

### Webhook URL

`/webhook/sync-user`

### Метод

`POST`

### Входные данные

```json
{
  "userId": "user-id-from-firestore",
  "email": "user@example.com",
  "uuid": "user-uuid-v4"
}
```

### Формат ответа от n8n

n8n должен вернуть данные пользователя в следующем формате:

```json
{
  "success": true,
  "user": {
    "id": "user-id-from-firestore",
    "name": "Иван Петров",
    "email": "user@example.com",
    "phone": "+79001234567",
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "vpnUuid": "550e8400-e29b-41d4-a716-446655440000",
    "plan": "super",
    "expiresAt": "2024-02-01T00:00:00.000Z",
    "tariffId": "tariff-id",
    "tariffName": "SUPER",
    "devices": 2,
    "natrockPort": null,
    "periodMonths": 1,
    "paymentStatus": "paid",
    "testPeriodStartDate": null,
    "testPeriodEndDate": null,
    "discount": 0,
    "vpnLink": "vless://...",
    "status": "active"
  }
}
```

Или альтернативный формат:

```json
{
  "success": true,
  "data": {
    // те же поля, что и в "user"
  }
}
```

## Пример n8n Workflow

### Шаги workflow:

1. **Webhook** - Прием запроса (`/webhook/sync-user`)
2. **HTTP Request** - Получение данных пользователя из 3x-ui (по email или UUID)
3. **Code** - Форматирование данных пользователя
4. **HTTP Request** - Опционально: получение дополнительных данных из других источников
5. **Set** - Формирование ответа
6. **Respond to Webhook** - Возврат данных

### Пример кода для шага "Code" (форматирование):

```javascript
// Получаем данные из предыдущего шага
const webhookData = $input.item.json.body;
const xuiData = $('HTTP Request').item.json; // Данные из 3x-ui

// Формируем объект пользователя
const userData = {
  id: webhookData.userId,
  email: webhookData.email || xuiData.email,
  uuid: webhookData.uuid || xuiData.id,
  name: xuiData.email?.split('@')[0] || webhookData.email?.split('@')[0] || 'User',
  vpnUuid: xuiData.id,
  plan: xuiData.plan || 'free',
  expiresAt: xuiData.expiryTime > 0 ? new Date(xuiData.expiryTime).toISOString() : null,
  devices: xuiData.limitIp || 1,
  status: xuiData.enable ? 'active' : 'inactive',
  // Добавьте другие поля по необходимости
};

return {
  json: {
    success: true,
    user: userData
  }
};
```

## Автоматическая синхронизация

Вы можете настроить автоматическую синхронизацию при определенных событиях:

### При загрузке Dashboard

```javascript
useEffect(() => {
  if (currentUser) {
    // Синхронизация при загрузке (опционально)
    dashboardService.sync_with_n8n(currentUser).catch(err => {
      console.warn('Ошибка синхронизации:', err)
    })
  }
}, [currentUser])
```

### По расписанию

```javascript
// Синхронизация каждые 5 минут
setInterval(() => {
  if (currentUser) {
    dashboardService.sync_with_n8n(currentUser).catch(err => {
      console.warn('Ошибка синхронизации:', err)
    })
  }
}, 5 * 60 * 1000)
```

### После определенных действий

```javascript
// После создания подписки
const subscription = await dashboardService.createSubscription(user, tariff)
await dashboardService.sync_with_n8n(user) // Синхронизируем обновленные данные
```

## Логирование

Метод логирует все операции:

- `Dashboard: Начало синхронизации с n8n` - Начало синхронизации
- `Dashboard: Данные пользователя синхронизированы с n8n` - Успешная синхронизация с изменениями
- `Dashboard: Данные пользователя актуальны, обновление не требуется` - Синхронизация без изменений
- `Dashboard: Ошибка синхронизации с n8n` - Ошибка синхронизации

## Обработка ошибок

Метод обрабатывает следующие ошибки:

- **n8n недоступен** - Возвращает понятное сообщение об ошибке
- **Неверный формат данных** - Логирует предупреждение и возвращает `success: false`
- **Ошибка обновления Firestore** - Пробрасывает ошибку дальше

## Метаданные синхронизации

После синхронизации в Firestore сохраняются метаданные:

- `syncedWithN8nAt` - Время последней синхронизации
- `lastSyncChanges` - Список полей, которые были изменены при последней синхронизации

Эти данные можно использовать для отслеживания истории синхронизаций.
