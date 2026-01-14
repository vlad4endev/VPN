# n8n Webhook Proxy Server

Минимальный сервер для перенаправления запросов от фронтенда в n8n webhooks.

## Установка

```bash
npm install
```

## Настройка

Создайте файл `.env`:

```env
# n8n Configuration
N8N_BASE_URL=https://n8n.skypath.fun
N8N_API_KEY=  # Опционально

# Webhook ID (используется для всех операций по умолчанию)
N8N_WEBHOOK_ID=8a8b74ff-eedf-4ad2-9783-a5123ac073ed
N8N_WEBHOOK_TEST_ID=8a8b74ff-eedf-4ad2-9783-a5123ac073ed

# Webhook URLs (можно переопределить для каждой операции отдельно)
# По умолчанию используется N8N_BASE_URL/webhook/N8N_WEBHOOK_ID
# Если нужно использовать разные webhook'ы, раскомментируйте:
# N8N_WEBHOOK_ADD_CLIENT=https://n8n.skypath.fun/webhook/8a8b74ff-eedf-4ad2-9783-a5123ac073ed
# N8N_WEBHOOK_DELETE_CLIENT=https://n8n.skypath.fun/webhook/8a8b74ff-eedf-4ad2-9783-a5123ac073ed
# N8N_WEBHOOK_GET_STATS=https://n8n.skypath.fun/webhook/8a8b74ff-eedf-4ad2-9783-a5123ac073ed
# N8N_WEBHOOK_GET_INBOUNDS=https://n8n.skypath.fun/webhook/8a8b74ff-eedf-4ad2-9783-a5123ac073ed
# N8N_WEBHOOK_GET_INBOUND=https://n8n.skypath.fun/webhook/8a8b74ff-eedf-4ad2-9783-a5123ac073ed
# N8N_WEBHOOK_SYNC_USER=https://n8n.skypath.fun/webhook/8a8b74ff-eedf-4ad2-9783-a5123ac073ed
# N8N_WEBHOOK_HEALTH=https://n8n.skypath.fun/webhook/8a8b74ff-eedf-4ad2-9783-a5123ac073ed

# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
```

## Запуск

```bash
npm start
```

Сервер запустится на `http://localhost:3001`

## API Endpoints

Все endpoints перенаправляют запросы в n8n:

- `GET /api/vpn/health` - Health check
- `POST /api/vpn/add-client` - Создание клиента
- `POST /api/vpn/delete-client` - Удаление клиента
- `POST /api/vpn/client-stats` - Статистика клиента
- `GET /api/vpn/inbounds` - Список инбаундов
- `GET /api/vpn/inbounds/:inboundId` - Инбаунд по ID
- `POST /api/vpn/sync-user` - Синхронизация данных пользователя с n8n
- `GET /api/system/status` - Системная информация
- `GET /api/system/logs` - Логи (заглушка)

## Структура

Сервер максимально упрощен:
- Принимает запросы от фронтенда
- Перенаправляет их в n8n webhooks
- Возвращает результаты обратно

Вся логика взаимодействия с 3x-ui находится в n8n workflows.
