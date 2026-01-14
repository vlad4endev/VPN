# Интеграция с n8n для работы с 3x-ui API

## Обзор

Вся логика взаимодействия с 3x-ui API вынесена в **n8n workflows**. Это позволяет:
- Визуально настраивать и отлаживать workflows
- Легко добавлять дополнительные шаги (уведомления, логирование)
- Централизованно управлять всеми интеграциями
- Изолировать сложную логику от основного приложения

## Архитектура

```
Frontend (React)
    ↓
Backend Proxy (n8n-webhook-proxy.js)
    ↓
n8n Webhooks
    ↓
3x-ui API
```

## Установка и настройка

### 1. Установка n8n

```bash
# Через npm (глобально)
npm install -g n8n

# Или через Docker
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

### 2. Настройка переменных окружения

Создайте файл `.env` в папке `server/`:

```env
# n8n Configuration
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=your-api-key-here  # Опционально

# Webhook URLs (можно оставить по умолчанию)
N8N_WEBHOOK_ADD_CLIENT=http://localhost:5678/webhook/add-client
N8N_WEBHOOK_DELETE_CLIENT=http://localhost:5678/webhook/delete-client
N8N_WEBHOOK_GET_STATS=http://localhost:5678/webhook/get-client-stats
N8N_WEBHOOK_GET_INBOUNDS=http://localhost:5678/webhook/get-inbounds
N8N_WEBHOOK_GET_INBOUND=http://localhost:5678/webhook/get-inbound
N8N_WEBHOOK_HEALTH=http://localhost:5678/webhook/health

# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
```

### 3. Запуск Backend Proxy

```bash
cd server
npm install
node n8n-webhook-proxy.js
```

## Создание n8n Workflows

### Workflow 1: Add Client (Создание клиента)

**Webhook URL:** `/webhook/add-client`  
**Method:** POST

**Структура входных данных:**
```json
{
  "userId": "user-id",
  "email": "user@example.com",
  "clientId": "uuid-v4",
  "inboundId": "1",
  "totalGB": 100,
  "expiryTime": 1735689600000,
  "limitIp": 2,
  "serverId": "server-id",
  "serverIP": "192.168.1.100",
  "serverPort": 2053,
  "randompath": "panel",
  "protocol": "http",
  "sessionCookie": "3x-ui=...",
  "xuiUsername": "admin",
  "xuiPassword": "password"
}
```

**Шаги workflow:**
1. **Webhook** - Прием запроса
2. **IF** - Проверка наличия сессии
3. **HTTP Request** - Login в 3x-ui (если сессии нет)
4. **Set** - Сохранение сессии
5. **HTTP Request** - Создание клиента в 3x-ui
6. **IF** - Проверка успешности
7. **HTTP Request** - Обновление Firestore (опционально)
8. **Respond to Webhook** - Возврат результата

**Формат ответа:**
```json
{
  "success": true,
  "vpnUuid": "uuid-v4",
  "inboundId": 1,
  "email": "user@example.com",
  "message": "Клиент успешно создан",
  "sessionUpdated": true,
  "sessionCookie": "3x-ui=...",
  "serverId": "server-id"
}
```

### Workflow 2: Delete Client (Удаление клиента)

**Webhook URL:** `/webhook/delete-client`  
**Method:** POST

**Структура входных данных:**
```json
{
  "inboundId": "1",
  "email": "user@example.com",
  "serverId": "server-id",
  "serverIP": "192.168.1.100",
  "serverPort": 2053,
  "randompath": "panel",
  "protocol": "http",
  "sessionCookie": "3x-ui=..."
}
```

**Шаги workflow:**
1. **Webhook** - Прием запроса
2. **HTTP Request** - Получение списка клиентов инбаунда
3. **Code** - Поиск клиента по email
4. **HTTP Request** - Удаление клиента
5. **Respond to Webhook** - Возврат результата

### Workflow 3: Get Client Stats (Статистика клиента)

**Webhook URL:** `/webhook/get-client-stats`  
**Method:** POST

**Структура входных данных:**
```json
{
  "email": "user@example.com",
  "serverId": "server-id",
  "serverIP": "192.168.1.100",
  "serverPort": 2053,
  "randompath": "panel",
  "protocol": "http",
  "sessionCookie": "3x-ui=..."
}
```

### Workflow 4: Get Inbounds (Список инбаундов)

**Webhook URL:** `/webhook/get-inbounds`  
**Method:** GET

### Workflow 5: Get Inbound (Инбаунд по ID)

**Webhook URL:** `/webhook/get-inbound`  
**Method:** GET

**Query параметры:**
- `inboundId` - ID инбаунда

### Workflow 6: Health Check

**Webhook URL:** `/webhook/health`  
**Method:** GET

**Формат ответа:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Примеры n8n Workflows

### Пример: Add Client Workflow

```json
{
  "name": "Add Client to 3x-ui",
  "nodes": [
    {
      "parameters": {
        "path": "add-client",
        "httpMethod": "POST"
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300]
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.body.sessionCookie }}",
              "operation": "isEmpty"
            }
          ]
        }
      },
      "name": "Check Session",
      "type": "n8n-nodes-base.if",
      "position": [450, 300]
    },
    {
      "parameters": {
        "url": "={{ $json.body.protocol }}://{{ $json.body.serverIP }}:{{ $json.body.serverPort }}/{{ $json.body.randompath }}/login",
        "method": "POST",
        "bodyParameters": {
          "parameters": [
            {
              "name": "username",
              "value": "={{ $json.body.xuiUsername }}"
            },
            {
              "name": "password",
              "value": "={{ $json.body.xuiPassword }}"
            }
          ]
        }
      },
      "name": "Login to 3x-ui",
      "type": "n8n-nodes-base.httpRequest",
      "position": [650, 200]
    },
    {
      "parameters": {
        "url": "={{ $json.body.protocol }}://{{ $json.body.serverIP }}:{{ $json.body.serverPort }}/{{ $json.body.randompath }}/panel/api/inbounds/addClient",
        "method": "POST",
        "headers": {
          "parameters": [
            {
              "name": "Cookie",
              "value": "={{ $json.body.sessionCookie || $('Login to 3x-ui').item.json.headers['set-cookie'][0] }}"
            }
          ]
        },
        "bodyParameters": {
          "parameters": [
            {
              "name": "id",
              "value": "={{ parseInt($json.body.inboundId) }}"
            },
            {
              "name": "settings",
              "value": "={{ JSON.stringify({ clients: [{ id: $json.body.clientId, email: $json.body.email.replace(/\\s+/g, '_'), totalGB: $json.body.totalGB * 1024 * 1024 * 1024, expiryTime: $json.body.expiryTime, limitIp: $json.body.limitIp, enable: true, up: 0, down: 0 }] }) }}"
            }
          ]
        }
      },
      "name": "Add Client",
      "type": "n8n-nodes-base.httpRequest",
      "position": [850, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { success: $json.success, vpnUuid: $json.body.clientId, inboundId: parseInt($json.body.inboundId), email: $json.body.email, message: 'Клиент успешно создан' } }}"
      },
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "position": [1050, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "Check Session", "type": "main", "index": 0 }]]
    },
    "Check Session": {
      "main": [
        [{ "node": "Login to 3x-ui", "type": "main", "index": 0 }],
        [{ "node": "Add Client", "type": "main", "index": 0 }]
      ]
    },
    "Login to 3x-ui": {
      "main": [[{ "node": "Add Client", "type": "main", "index": 0 }]]
    },
    "Add Client": {
      "main": [[{ "node": "Respond", "type": "main", "index": 0 }]]
    }
  }
}
```

## Импорт Workflows в n8n

1. Откройте n8n: `http://localhost:5678`
2. Перейдите в **Workflows**
3. Нажмите **Import from File** или **Import from URL**
4. Вставьте JSON workflow
5. Активируйте workflow (переключатель в правом верхнем углу)

## Тестирование

### Тест Health Check

```bash
curl http://localhost:3001/api/vpn/health
```

### Тест Add Client

```bash
curl -X POST http://localhost:3001/api/vpn/add-client \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "email": "test@example.com",
    "clientId": "550e8400-e29b-41d4-a716-446655440000",
    "inboundId": "1",
    "totalGB": 100,
    "expiryTime": 1735689600000,
    "limitIp": 2,
    "serverIP": "192.168.1.100",
    "serverPort": 2053,
    "randompath": "panel",
    "protocol": "http",
    "xuiUsername": "admin",
    "xuiPassword": "password"
  }'
```

## Преимущества использования n8n

1. **Визуальная настройка** - Не нужно писать код для изменения логики
2. **Легкая отладка** - Можно видеть данные на каждом шаге
3. **Расширяемость** - Легко добавить уведомления, логирование, интеграции
4. **Изоляция** - Сложная логика изолирована от основного приложения
5. **Версионирование** - n8n сохраняет историю изменений workflows

## Миграция с текущей архитектуры

1. **Остановите текущий Backend Proxy:**
   ```bash
   pm2 stop xui-backend-proxy
   ```

2. **Запустите новый n8n Webhook Proxy:**
   ```bash
   pm2 start server/n8n-webhook-proxy.js --name n8n-webhook-proxy
   ```

3. **Создайте workflows в n8n** согласно примерам выше

4. **Обновите package.json:**
   ```json
   {
     "scripts": {
       "start": "node n8n-webhook-proxy.js"
     }
   }
   ```

5. **Фронтенд не требует изменений** - все API endpoints остаются теми же

## Troubleshooting

### n8n недоступен

Проверьте, что n8n запущен:
```bash
curl http://localhost:5678/healthz
```

### Webhook не срабатывает

1. Убедитесь, что workflow активирован
2. Проверьте URL webhook в настройках workflow
3. Проверьте логи n8n: `n8n logs`

### Ошибки в workflow

1. Откройте workflow в n8n
2. Запустите workflow вручную с тестовыми данными
3. Проверьте данные на каждом шаге
4. Используйте **Code** node для отладки
