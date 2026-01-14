# Маркировка операций для n8n

## Обзор

Все запросы к n8n теперь содержат маркировку операций (`operation` и `category`), что позволяет разделять потоки обработки в n8n workflows.

## Структура запросов

Каждый запрос содержит следующие поля:

```json
{
  "operation": "название_операции",
  "category": "категория_операции",
  "timestamp": "2024-01-15T12:00:00.000Z",
  // ... остальные данные операции
}
```

## Категории операций

### 1. `new_subscription` - Новая подписка (первое подключение тарифа)

**Когда используется:** Новый пользователь подключает тариф впервые

**Дополнительные данные:**
```json
{
  "operation": "add_client",
  "category": "new_subscription",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "userId": "user-id",
  "userUuid": "uuid-профиля",
  "userName": "Имя пользователя",
  "userEmail": "user@example.com",
  "subscriptionDetails": {
    "tariffName": "SUPER",
    "devices": 2,
    "period": {
      "months": 1,
      "expiryDate3xui": 1735689600000,
      "expiryDateIso": "2024-02-15T12:00:00.000Z",
      "expiryDateUnix": 1735689600
    },
    "userName": "Имя пользователя",
    "profileUuid": "uuid-профиля"
  },
  // ... данные для 3x-ui и сервера
}
```

**Ключевые поля:**
- `profileUuid` - UUID профиля (самое главное!)
- `tariffName` - Имя тарифа
- `devices` - Количество устройств
- `period.expiryDate3xui` - Конечная дата подписки в формате для 3x-ui (миллисекунды, Unix Timestamp * 1000)

### 2. `update_subscription` - Обновление подписки

**Когда используется:** Пользователь обновляет существующую подписку

**Дополнительные данные:**
```json
{
  "operation": "add_client",
  "category": "update_subscription",
  "timestamp": "2024-01-15T12:00:00.000Z",
  // ... базовые данные без subscriptionDetails
}
```

### 3. `delete_client` - Удаление клиента

**Когда используется:** Удаление аккаунта пользователя

**Дополнительные данные:**
```json
{
  "operation": "delete_client",
  "category": "delete_client",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "userId": "user-id",
  "userUuid": "uuid-профиля",
  "userName": "Имя пользователя",
  "userEmail": "user@example.com",
  "inboundId": 1,
  "email": "user@example.com"
}
```

### 4. `get_user_data` - Получение данных пользователя

**Когда используется:** Синхронизация данных пользователя с n8n

**Дополнительные данные:**
```json
{
  "operation": "sync_user",
  "category": "get_user_data",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "userId": "user-id",
  "userUuid": "uuid-профиля",
  "userName": "Имя пользователя",
  "userEmail": "user@example.com",
  "uuid": "uuid-профиля"
}
```

### 5. `get_client_stats` - Получение статистики клиента

**Когда используется:** Запрос статистики использования VPN

**Дополнительные данные:**
```json
{
  "operation": "get_client_stats",
  "category": "get_user_data",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "userId": "user-id",
  "userUuid": "uuid-профиля",
  "userEmail": "user@example.com",
  "email": "user@example.com"
}
```

### 6. `get_server_data` - Данные сервера

**Когда используется:** Получение информации о серверах и инбаундах

**Дополнительные данные:**
```json
{
  "operation": "get_inbounds",
  "category": "get_server_data",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

или

```json
{
  "operation": "get_inbound",
  "category": "get_server_data",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "inboundId": "1"
}
```

## Разделение потоков в n8n

В n8n workflow используйте **IF** node для разделения потоков по полю `category`:

```javascript
// В n8n Code node или IF node
const category = $json.body.category;

if (category === 'new_subscription') {
  // Обработка новой подписки
  // Доступны данные: subscriptionDetails.tariffName, devices, period, profileUuid
} else if (category === 'update_subscription') {
  // Обработка обновления подписки
} else if (category === 'delete_client') {
  // Обработка удаления клиента
} else if (category === 'get_user_data') {
  // Получение данных пользователя
  if ($json.body.operation === 'sync_user') {
    // Синхронизация пользователя
  } else if ($json.body.operation === 'get_client_stats') {
    // Получение статистики
  }
} else if (category === 'get_server_data') {
  // Получение данных сервера
}
```

## Примеры использования в n8n

### Пример 1: Обработка новой подписки

```javascript
// Code node после Webhook
const body = $input.item.json.body;

if (body.category === 'new_subscription') {
  const details = body.subscriptionDetails;
  
  return {
    json: {
      action: 'create_client',
      tariffName: details.tariffName,
      devices: details.devices,
      expiryDate: details.period.expiryDate3xui, // Уже в формате для 3x-ui
      userName: details.userName,
      profileUuid: details.profileUuid, // UUID профиля - самое главное!
      // ... остальные данные
    }
  };
}
```

### Пример 2: Разделение по категориям с помощью Switch node

В n8n используйте **Switch** node (если доступен) или несколько **IF** nodes:

1. **Webhook** → получает запрос
2. **Switch** или **IF** → проверяет `body.category`
3. Разные ветки для каждой категории:
   - `new_subscription` → обработка новой подписки
   - `update_subscription` → обновление подписки
   - `delete_client` → удаление клиента
   - `get_user_data` → получение данных
   - `get_server_data` → данные сервера

## Формат дат для 3x-ui

**Важно:** Для 3x-ui используется формат миллисекунд (Unix Timestamp * 1000):

- `expiryDate3xui`: `1735689600000` (миллисекунды)
- `expiryDateUnix`: `1735689600` (секунды)
- `expiryDateIso`: `"2024-02-15T12:00:00.000Z"` (ISO строка)

В поле `subscriptionDetails.period.expiryDate3xui` уже передается значение в миллисекундах, готовое для использования в 3x-ui API.

## UUID профиля

**Самое главное поле:** `profileUuid` или `userUuid` содержит UUID профиля пользователя, который должен использоваться как `clientId` в 3x-ui.

Это поле доступно во всех категориях операций.
