# Быстрое руководство: Категории операций для n8n

## Категории операций

Все запросы теперь содержат поля `operation` и `category` для разделения потоков в n8n.

### 📋 Категории

1. **`new_subscription`** - Новая подписка (первое подключение тарифа)
2. **`update_subscription`** - Обновление подписки
3. **`delete_client`** - Удаление клиента
4. **`get_user_data`** - Получение данных пользователя
5. **`get_server_data`** - Данные сервера

## Структура данных по категориям

### 1. `new_subscription` - Новая подписка

**Когда отправляется:** Новый пользователь подключает тариф впервые

**Структура запроса:**
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
  // ... остальные данные для 3x-ui
}
```

**Ключевые поля для n8n:**
- `subscriptionDetails.tariffName` - Имя тарифа
- `subscriptionDetails.devices` - Количество устройств
- `subscriptionDetails.period.expiryDate3xui` - Конечная дата подписки в формате для 3x-ui (миллисекунды)
- `subscriptionDetails.profileUuid` - UUID профиля (самое главное!)
- `subscriptionDetails.userName` - Имя пользователя

### 2. `update_subscription` - Обновление подписки

**Когда отправляется:** Пользователь обновляет существующую подписку

**Структура запроса:**
```json
{
  "operation": "add_client",
  "category": "update_subscription",
  "timestamp": "2024-01-15T12:00:00.000Z",
  // ... базовые данные без subscriptionDetails
}
```

### 3. `delete_client` - Удаление клиента

**Когда отправляется:** Удаление аккаунта пользователя

**Структура запроса:**
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

**Подкатегории:**
- `operation: "sync_user"` - Синхронизация пользователя
- `operation: "get_client_stats"` - Получение статистики

**Структура запроса (sync_user):**
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

### 5. `get_server_data` - Данные сервера

**Подкатегории:**
- `operation: "get_inbounds"` - Получение списка инбаундов
- `operation: "get_inbound"` - Получение инбаунда по ID

**Структура запроса (get_inbounds):**
```json
{
  "operation": "get_inbounds",
  "category": "get_server_data",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

## Разделение потоков в n8n

### Вариант 1: Использование IF node

1. **Webhook** → получает запрос
2. **IF** → проверяет `$json.body.category`
   - Если `category === 'new_subscription'` → ветка новой подписки
   - Если `category === 'update_subscription'` → ветка обновления
   - Если `category === 'delete_client'` → ветка удаления
   - Если `category === 'get_user_data'` → ветка получения данных
   - Если `category === 'get_server_data'` → ветка данных сервера

### Вариант 2: Использование Switch node (если доступен)

1. **Webhook** → получает запрос
2. **Switch** → выбирает по `$json.body.category`
3. Разные ветки для каждой категории

### Вариант 3: Использование Code node

```javascript
const body = $input.item.json.body;
const category = body.category;
const operation = body.operation;

if (category === 'new_subscription') {
  const details = body.subscriptionDetails;
  return {
    json: {
      action: 'create_new_subscription',
      tariffName: details.tariffName,
      devices: details.devices,
      expiryDate: details.period.expiryDate3xui, // Уже в формате для 3x-ui
      userName: details.userName,
      profileUuid: details.profileUuid, // UUID профиля - самое главное!
    }
  };
} else if (category === 'update_subscription') {
  return { json: { action: 'update_existing_subscription', ...body } };
} else if (category === 'delete_client') {
  return { json: { action: 'delete_client', ...body } };
} else if (category === 'get_user_data') {
  if (operation === 'sync_user') {
    return { json: { action: 'sync_user_data', ...body } };
  } else if (operation === 'get_client_stats') {
    return { json: { action: 'get_client_statistics', ...body } };
  }
} else if (category === 'get_server_data') {
  return { json: { action: 'get_server_info', ...body } };
}
```

## Примеры использования данных

### Для новой подписки

В n8n workflow после проверки `category === 'new_subscription'`:

```javascript
const details = $json.body.subscriptionDetails;

// Имя тарифа
const tariffName = details.tariffName; // "SUPER"

// Количество устройств
const devices = details.devices; // 2

// Конечная дата подписки (уже в формате для 3x-ui)
const expiryDate3xui = details.period.expiryDate3xui; // 1735689600000 (миллисекунды)

// Имя пользователя
const userName = details.userName; // "Иван Петров"

// UUID профиля (самое главное!)
const profileUuid = details.profileUuid; // "550e8400-e29b-41d4-a716-446655440000"
```

### Формат даты для 3x-ui

**Важно:** Для 3x-ui используется формат миллисекунд (Unix Timestamp * 1000)

- `expiryDate3xui`: `1735689600000` (миллисекунды) ← **Используйте это для 3x-ui**
- `expiryDateUnix`: `1735689600` (секунды)
- `expiryDateIso`: `"2024-02-15T12:00:00.000Z"` (ISO строка)

## UUID профиля

**Самое главное поле:** `profileUuid` или `userUuid` содержит UUID профиля пользователя, который должен использоваться как `clientId` в 3x-ui API.

Это поле доступно во всех категориях операций:
- `new_subscription`: `subscriptionDetails.profileUuid`
- `update_subscription`: `userUuid`
- `delete_client`: `userUuid`
- `get_user_data`: `userUuid` или `uuid`
