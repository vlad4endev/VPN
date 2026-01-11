# Руководство по миграции на n8n

## Что изменилось?

Вся логика взаимодействия с 3x-ui API теперь обрабатывается через **n8n workflows** вместо прямого кода в Backend Proxy.

## Шаги миграции

### 1. Установка n8n

```bash
# Вариант 1: Через npm (глобально)
npm install -g n8n

# Вариант 2: Через Docker
docker run -d \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# Вариант 3: Через Docker Compose (рекомендуется)
# Создайте docker-compose.yml:
```

```yaml
version: '3.8'
services:
  n8n:
    image: n8nio/n8n
    container_name: n8n
    ports:
      - "5678:5678"
    volumes:
      - ~/.n8n:/home/node/.n8n
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=your-password
    restart: unless-stopped
```

### 2. Настройка переменных окружения

Обновите `.env` в папке `server/`:

```env
# n8n Configuration
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=  # Опционально, если используете API аутентификацию

# Webhook URLs (можно оставить по умолчанию)
N8N_WEBHOOK_ADD_CLIENT=http://localhost:5678/webhook/add-client
N8N_WEBHOOK_DELETE_CLIENT=http://localhost:5678/webhook/delete-client
N8N_WEBHOOK_GET_STATS=http://localhost:5678/webhook/get-client-stats
N8N_WEBHOOK_GET_INBOUNDS=http://localhost:5678/webhook/get-inbounds
N8N_WEBHOOK_GET_INBOUND=http://localhost:5678/webhook/get-inbound
N8N_WEBHOOK_HEALTH=http://localhost:5678/webhook/health
```

### 3. Запуск нового Backend Proxy

```bash
cd server
npm install  # Убедитесь, что все зависимости установлены
node n8n-webhook-proxy.js
```

Или через PM2:

```bash
pm2 stop xui-backend-proxy  # Остановите старый
pm2 start server/n8n-webhook-proxy.js --name n8n-webhook-proxy
pm2 save
```

### 4. Создание Workflows в n8n

1. Откройте n8n: `http://localhost:5678`
2. Создайте новый workflow для каждой операции:
   - **Add Client** - `/webhook/add-client`
   - **Delete Client** - `/webhook/delete-client`
   - **Get Client Stats** - `/webhook/get-client-stats`
   - **Get Inbounds** - `/webhook/get-inbounds`
   - **Get Inbound** - `/webhook/get-inbound`
   - **Health Check** - `/webhook/health`

3. Активируйте каждый workflow (переключатель в правом верхнем углу)

### 5. Тестирование

```bash
# Health Check
curl http://localhost:3001/api/vpn/health

# Должен вернуть:
# {
#   "status": "ok",
#   "service": "n8n-webhook-proxy",
#   "n8n": { "available": true, ... }
# }
```

## Что осталось без изменений?

✅ **Фронтенд код** - Все API вызовы остаются теми же  
✅ **XUIService** - Не требует изменений  
✅ **dashboardService** - Не требует изменений  
✅ **API endpoints** - Все пути остаются теми же (`/api/vpn/*`)

## Что нужно настроить в n8n?

### Основные настройки для каждого workflow:

1. **Webhook Node:**
   - Path: `/webhook/add-client` (или другой)
   - Method: POST (или GET для некоторых)
   - Response Mode: "Respond to Webhook"

2. **HTTP Request Nodes:**
   - URL: `{{ $json.body.protocol }}://{{ $json.body.serverIP }}:{{ $json.body.serverPort }}/{{ $json.body.randompath }}/...`
   - Method: POST/GET
   - Headers: Cookie с сессией
   - Body: JSON с данными клиента

3. **Обработка ошибок:**
   - Добавьте **IF** nodes для проверки успешности
   - Используйте **Set** nodes для форматирования ответов

## Примеры Workflows

См. файл `N8N_INTEGRATION.md` для детальных примеров JSON workflows.

## Откат на старую версию

Если нужно вернуться к старой версии:

```bash
# В server/package.json измените:
"start": "node xui-backend-proxy.js"

# Или через PM2:
pm2 stop n8n-webhook-proxy
pm2 start server/xui-backend-proxy.js --name xui-backend-proxy
```

## Преимущества новой архитектуры

1. ✅ **Визуальная настройка** - Не нужно писать код
2. ✅ **Легкая отладка** - Видно данные на каждом шаге
3. ✅ **Расширяемость** - Легко добавить уведомления, логирование
4. ✅ **Изоляция** - Сложная логика изолирована
5. ✅ **Версионирование** - n8n сохраняет историю

## Troubleshooting

### n8n не запускается

```bash
# Проверьте порт 5678
lsof -i :5678

# Проверьте логи
n8n logs
```

### Webhook не срабатывает

1. Убедитесь, что workflow **активирован**
2. Проверьте URL в настройках Webhook node
3. Проверьте, что Backend Proxy правильно вызывает n8n

### Ошибки в workflow

1. Откройте workflow в n8n
2. Запустите вручную с тестовыми данными
3. Проверьте данные на каждом шаге (кликните на node)
4. Используйте **Code** node для отладки

## Дополнительные ресурсы

- [n8n Documentation](https://docs.n8n.io/)
- [n8n Community Forum](https://community.n8n.io/)
- [n8n Workflow Examples](https://n8n.io/workflows/)
