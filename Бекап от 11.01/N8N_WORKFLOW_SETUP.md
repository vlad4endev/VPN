# Настройка n8n Workflow для VPN проекта

## Общие требования

1. **Webhook Node** должен быть первым узлом в workflow
2. **Respond to Webhook Node** должен быть последним узлом в workflow
3. Должен быть только **ОДИН** узел "Respond to Webhook" в workflow
4. Все узлы обработки должны быть подключены последовательно между Webhook и Respond to Webhook

## Структура workflow

```
[Webhook] → [Обработка данных] → [Взаимодействие с 3x-ui] → [Обновление Firestore] → [Respond to Webhook]
```

## Ошибка: "Unused Respond to Webhook node found in the workflow"

### Причина
Эта ошибка возникает, когда в workflow есть узел "Respond to Webhook", который:
- Не подключен к основному потоку
- Подключен неправильно
- Есть несколько узлов "Respond to Webhook", и один из них не используется

### Решение

#### Вариант 1: Удалить неиспользуемый узел
1. Откройте ваш workflow в n8n
2. Найдите все узлы "Respond to Webhook"
3. Удалите те, которые не подключены к основному потоку
4. Сохраните workflow
5. Активируйте workflow

#### Вариант 2: Правильно подключить узел
1. Откройте ваш workflow в n8n
2. Найдите узел "Respond to Webhook"
3. Убедитесь, что он подключен **после всех узлов обработки**
4. Проверьте, что он является **последним узлом** в потоке
5. Сохраните workflow
6. Активируйте workflow

### Правильная структура для операции "add-client"

```
┌─────────────┐
│   Webhook   │ ← Принимает запрос от proxy
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  IF Node        │ ← Проверяет category === 'new_subscription'
│  (category)     │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Code Node      │ ← Обрабатывает данные подписки
│  (обработка)   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  HTTP Request   │ ← Вызов 3x-ui API для создания клиента
│  (3x-ui API)    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Code Node      │ ← Обновление Firestore
│  (Firestore)    │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Respond to Webhook  │ ← Отправка ответа обратно в proxy
└─────────────────────┘
```

## Настройка узла "Respond to Webhook"

1. **Response Mode**: Выберите "Using 'Respond to Webhook' Node"
2. **Response Code**: 200 (для успешных операций)
3. **Response Body**: JSON с результатом операции

### Пример Response Body для успешного создания клиента:

```json
{
  "success": true,
  "uuid": "{{ $json.uuid }}",
  "vpnLink": "{{ $json.vpnLink }}",
  "message": "Клиент успешно создан"
}
```

### Пример Response Body для ошибки:

```json
{
  "success": false,
  "error": "Описание ошибки",
  "errorMessage": "Детальное сообщение об ошибке"
}
```

## Проверка workflow

После настройки workflow проверьте:

1. ✅ Webhook Node настроен и активен
2. ✅ Все узлы подключены последовательно
3. ✅ Respond to Webhook Node подключен в конце потока
4. ✅ Только один узел "Respond to Webhook" в workflow
5. ✅ Workflow активирован (зеленая кнопка в правом верхнем углу)

## Тестирование

1. Используйте endpoint `/api/vpn/health` для проверки базовой работоспособности
2. Отправьте тестовый запрос через Postman или curl:

```bash
curl -X POST https://n8n.skypath.fun/webhook/8a8b74ff-eedf-4ad2-9783-a5123ac073ed \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "add_client",
    "category": "new_subscription",
    "userId": "test-user-id",
    "userUuid": "test-uuid",
    "email": "test@example.com"
  }'
```

3. Проверьте логи в n8n для диагностики ошибок

## Частые ошибки

### 1. "Unused Respond to Webhook node found"
- **Причина**: Неиспользуемый узел "Respond to Webhook"
- **Решение**: Удалите неиспользуемый узел или правильно подключите его

### 2. "Webhook not registered"
- **Причина**: Workflow не активирован
- **Решение**: Активируйте workflow в n8n

### 3. "404 Not Found"
- **Причина**: Неправильный webhook URL или ID
- **Решение**: Проверьте правильность `N8N_WEBHOOK_ID` в `.env`

### 4. "500 Internal Server Error"
- **Причина**: Ошибка в логике workflow
- **Решение**: Проверьте логи n8n и исправьте ошибки в узлах

## Дополнительные ресурсы

- [n8n Documentation](https://docs.n8n.io/)
- [Webhook Node Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [Respond to Webhook Node Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/)
