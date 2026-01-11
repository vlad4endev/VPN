# Настройка Webhook'ов YooMoney для подтверждения оплаты

## Как это работает

### Общая схема:

```
1. Пользователь → Нажимает "Оплатить"
2. Фронтенд → Генерирует ссылку через /api/payment/generate-link
3. n8n → Создает orderId, формирует paymentUrl с label=orderId
4. Фронтенд → Открывает paymentUrl в miniapp окне
5. Пользователь → Оплачивает в YooMoney
6. YooMoney → Отправляет webhook на ваш сервер (POST /api/payment/webhook)
7. n8n-webhook-proxy → Перенаправляет webhook в n8n workflow
8. n8n workflow → Проверяет подпись, находит заказ, активирует подписку
9. Firestore → Обновляется статус подписки пользователя
```

## Настройка в YooMoney

### 1. Получите URL для webhook'ов

Ваш сервер должен быть доступен из интернета. Webhook URL будет:
```
https://your-domain.com/api/payment/webhook
```

**Для локальной разработки:**
- Используйте ngrok или подобный сервис для проброса портов
- Или используйте сервис типа webhook.site для тестирования

### 2. Настройте webhook URL в YooMoney

1. Войдите в личный кабинет YooMoney (yoomoney.ru)
2. Перейдите в раздел "Настройки" → "HTTP-уведомления"
3. Укажите URL вашего webhook endpoint: `https://your-domain.com/api/payment/webhook`
4. Сохраните настройки

**Важно:** YooMoney отправляет уведомления методом POST в формате, описанном ниже.

## Формат данных от YooMoney

YooMoney отправляет POST запрос с следующими полями:

```json
{
  "notification_type": "p2p-incoming",
  "operation_id": "12345678",
  "amount": "150.00",
  "currency": "643",
  "datetime": "2024-01-15T12:00:00.000Z",
  "sender": "410017383938322",
  "codepro": "false",
  "label": "order_1705320000000",
  "sha1_hash": "a1b2c3d4e5f6...",
  "test_notification": "false",
  "unaccepted": "false"
}
```

### Важные поля:

- **`label`** - это ваш `orderId`, который был передан при создании ссылки на оплату
- **`amount`** - сумма оплаты
- **`sha1_hash`** - подпись для проверки подлинности уведомления
- **`notification_type`** - тип уведомления (обычно `"p2p-incoming"`)

## Проверка подлинности webhook'а

YooMoney подписывает каждое уведомление SHA1 хешем. Формула для проверки:

```javascript
const sha1Hash = sha1(
  notification_type + '&' +
  operation_id + '&' +
  amount + '&' +
  currency + '&' +
  datetime + '&' +
  sender + '&' +
  codepro + '&' +
  notification_secret + '&' +
  label
)
```

Где `notification_secret` - это ваш `yoomoneySecretKey` из настроек.

### Проверка в n8n workflow:

```javascript
const crypto = require('crypto')

const notification_secret = paymentSettings.yoomoneySecretKey
const calculatedHash = crypto
  .createHash('sha1')
  .update(
    notification_type + '&' +
    operation_id + '&' +
    amount + '&' +
    currency + '&' +
    datetime + '&' +
    sender + '&' +
    codepro + '&' +
    notification_secret + '&' +
    label
  )
  .digest('hex')

if (calculatedHash !== sha1_hash) {
  // Уведомление не прошло проверку подлинности
  return { error: 'Invalid signature' }
}
```

## Текущая реализация

### Backend Proxy (n8n-webhook-proxy.js)

**Endpoint:** `POST /api/payment/webhook`

Этот endpoint:
1. Принимает webhook от YooMoney
2. Загружает настройки платежей из Firestore
3. Формирует данные для n8n workflow:
   ```javascript
   {
     mode: 'processNotification',
     paymentSettings: {
       yoomoneyWallet: '...',
       yoomoneySecretKey: '...'
     },
     ...req.body  // Все данные от YooMoney
   }
   ```
4. Отправляет данные в n8n workflow через `callN8NWebhook`
5. Возвращает ответ от n8n workflow

### Что нужно сделать в n8n workflow

#### Workflow: Обработка уведомлений от YooMoney

**Триггер:** Webhook
- Метод: POST
- Path: `/webhook/{your-webhook-id}`

**Шаги:**

1. **Получить данные из запроса**
   - Проверить `mode === 'processNotification'`
   - Извлечь все поля от YooMoney

2. **Проверить подпись (SHA1)**
   - Вычислить хеш используя формулу выше
   - Сравнить с `sha1_hash` из запроса
   - Если не совпадает - вернуть ошибку

3. **Найти заказ по `label` (orderId)**
   - Поиск в Firestore коллекции `payments`
   - Или поиск по userId и статусу `pending`

4. **Проверить статус уведомления**
   - Если `unaccepted === "true"` - платеж не принят, завершить
   - Если `test_notification === "true"` - это тестовое уведомление

5. **Активировать подписку:**
   - Найти пользователя по userId из заказа
   - Обновить статус платежа на `completed`
   - Вызвать создание/обновление подписки в 3x-ui
   - Обновить данные пользователя в Firestore:
     - `paymentStatus: 'paid'`
     - `expiresAt: ...`
     - `tariffId: ...`
     - и т.д.

6. **Вернуть ответ YooMoney**
   ```json
   {
     "status": "success"
   }
   ```

**Важно:** YooMoney ожидает ответ HTTP 200 в течение 10 секунд. Если ответ не придет, YooMoney будет повторять запрос.

## Хранение заказов

### При генерации ссылки на оплату

В n8n workflow при создании ссылки нужно сохранить заказ в Firestore:

```javascript
// В n8n workflow для генерации ссылки
const orderId = "order_" + Date.now()

// Сохранить в Firestore
await firestore.collection(`artifacts/${APP_ID}/public/data/payments`).add({
  orderId: orderId,
  userId: userId,
  amount: amount,
  tariffId: tariffId,
  status: 'pending',  // pending → completed
  createdAt: new Date().toISOString(),
  paymentUrl: paymentUrl
})
```

### При получении webhook'а

Найти заказ по `label` (который является `orderId`):

```javascript
// В n8n workflow для обработки webhook
const orderId = body.label  // Это ваш orderId
const paymentRef = firestore
  .collection(`artifacts/${APP_ID}/public/data/payments`)
  .where('orderId', '==', orderId)
  .where('status', '==', 'pending')
  .limit(1)

const paymentDoc = await paymentRef.get()
if (paymentDoc.empty) {
  return { error: 'Order not found' }
}

const payment = paymentDoc.docs[0].data()
const userId = payment.userId
const tariffId = payment.tariffId
```

## Пример полного workflow в n8n

### Шаг 1: Webhook Trigger
- Настройка: принимать POST запросы
- Path: `/webhook/payment-notification`

### Шаг 2: Code (проверка mode)
```javascript
if ($json.body.mode !== 'processNotification') {
  return [{ json: { error: 'Invalid mode' } }]
}
return [{ json: $json.body }]
```

### Шаг 3: Code (проверка подписи)
```javascript
const crypto = require('crypto')
const { paymentSettings, ...yoomoneyData } = $json.body

const calculatedHash = crypto
  .createHash('sha1')
  .update(
    yoomoneyData.notification_type + '&' +
    yoomoneyData.operation_id + '&' +
    yoomoneyData.amount + '&' +
    yoomoneyData.currency + '&' +
    yoomoneyData.datetime + '&' +
    yoomoneyData.sender + '&' +
    yoomoneyData.codepro + '&' +
    paymentSettings.yoomoneySecretKey + '&' +
    yoomoneyData.label
  )
  .digest('hex')

if (calculatedHash !== yoomoneyData.sha1_hash) {
  return [{ json: { error: 'Invalid signature' } }]
}

return [{ json: { ...yoomoneyData, paymentSettings } }]
```

### Шаг 4: Firestore (поиск заказа)
- Collection: `artifacts/{APP_ID}/public/data/payments`
- Query: `where orderId == label AND status == pending`

### Шаг 5: Code (активация подписки)
```javascript
const userId = $json.payment.userId
const tariffId = $json.payment.tariffId
const amount = parseFloat($json.amount)

// Здесь нужно вызвать создание/обновление подписки
// Используя существующий workflow или API для 3x-ui

return [{ json: { userId, tariffId, amount, orderId: $json.label } }]
```

### Шаг 6: Firestore (обновление платежа)
- Обновить документ платежа: `status: 'completed'`

### Шаг 7: Firestore (обновление пользователя)
- Обновить пользователя: `paymentStatus: 'paid'`, `expiresAt: ...`, и т.д.

### Шаг 8: HTTP Response
- Вернуть: `{ status: 'success' }`
- Status Code: 200

## Тестирование

### Локальная разработка с ngrok:

1. Установите ngrok: `brew install ngrok` (Mac) или скачайте с ngrok.com

2. Запустите ngrok:
   ```bash
   ngrok http 3001
   ```

3. Скопируйте HTTPS URL (например: `https://abc123.ngrok.io`)

4. В YooMoney укажите webhook URL: `https://abc123.ngrok.io/api/payment/webhook`

5. Протестируйте оплату

### Использование webhook.site для тестирования:

1. Откройте https://webhook.site
2. Скопируйте уникальный URL
3. Временно измените endpoint в n8n-webhook-proxy.js для тестирования
4. Или используйте webhook.site URL напрямую в настройках YooMoney

## Проверка работы

1. **Создайте тестовый платеж**
   - Используйте тестовый кошелек YooMoney
   - Создайте ссылку на оплату через ваше приложение

2. **Проверьте логи n8n-webhook-proxy**
   - Должны быть записи о получении webhook'а
   - Проверьте структуру данных

3. **Проверьте n8n workflow**
   - Убедитесь, что workflow выполняется
   - Проверьте логи каждого шага

4. **Проверьте Firestore**
   - Платеж должен быть обновлен: `status: 'completed'`
   - Пользователь должен быть обновлен: `paymentStatus: 'paid'`

## Безопасность

1. **Всегда проверяйте SHA1 подпись** - это критически важно для безопасности
2. **Проверяйте сумму платежа** - она должна совпадать с суммой заказа
3. **Идемпотентность** - YooMoney может отправить одно уведомление несколько раз
   - Проверяйте, что платеж еще не обработан перед активацией подписки
4. **Таймаут ответа** - YooMoney ожидает ответ в течение 10 секунд
   - Если обработка занимает больше времени, верните 200 сразу, обработку выполните асинхронно

## Частые проблемы

1. **Webhook не приходит**
   - Проверьте, что URL доступен из интернета
   - Проверьте настройки в YooMoney
   - Используйте ngrok для локальной разработки

2. **Ошибка проверки подписи**
   - Убедитесь, что используете правильный `yoomoneySecretKey`
   - Проверьте порядок полей в формуле SHA1
   - Убедитесь, что поля не пустые

3. **Заказ не найден**
   - Убедитесь, что заказ сохраняется при создании ссылки
   - Проверьте, что `label` в webhook'е совпадает с `orderId`

4. **Дублирование обработки**
   - Реализуйте идемпотентность - проверяйте статус платежа перед обработкой
   - Используйте транзакции Firestore для атомарности
