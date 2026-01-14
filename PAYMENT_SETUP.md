# Настройка платежной системы YooMoney

## Проблема: 404 ошибка при генерации ссылки на оплату

### Решение

1. **Перезапустите dev сервер Vite**
   ```bash
   # Остановите текущий сервер (Ctrl+C)
   # Запустите заново
   npm run dev
   ```

2. **Убедитесь, что сервер n8n-webhook-proxy запущен**
   ```bash
   # Проверьте, что сервер работает на порту 3001
   lsof -ti:3001
   
   # Если не запущен, запустите:
   cd server
   node n8n-webhook-proxy.js
   ```

3. **Проверьте прокси в vite.config.js**
   - Прокси для `/api/payment` должен быть настроен на `http://localhost:3001`
   - После изменений в vite.config.js требуется перезапуск dev сервера

### Проверка работы

1. Откройте админ-панель
2. Перейдите в раздел "Настройки"
3. Заполните настройки YooMoney:
   - Номер кошелька
   - Секретный ключ
4. Сохраните настройки

### Настройка n8n workflows

#### Workflow 1: Генерация ссылки на оплату

**Триггер:** Webhook
- Метод: POST
- Путь: `/webhook/{your-webhook-id}`

**Обработка:**
1. Получить данные из запроса:
   - `mode` (должен быть `"generateLink"`)
   - `userId`
   - `amount`
   - `tariffId` (опционально)

2. Загрузить настройки YooMoney из Firestore:
   - `yoomoneyWallet`
   - `yoomoneySecretKey`

3. Сгенерировать `orderId`:
   ```javascript
   const orderId = "order_" + Date.now()
   ```

4. Создать URL для оплаты:
   ```javascript
   const paymentUrl = 
     `https://yoomoney.ru/quickpay/confirm.xml?receiver=${wallet}` +
     `&quickpay-form=shop` +
     `&sum=${amount}` +
     `&label=${encodeURIComponent(orderId)}` +
     `&formcomment=${encodeURIComponent("Оплата VPN")}`
   ```

5. Вернуть ответ:
   ```json
   {
     "status": "link_generated",
     "paymentUrl": "...",
     "amount": 150,
     "orderId": "order_1234567890",
     "userId": "..."
   }
   ```

#### Workflow 2: Обработка webhook от YooMoney

**Триггер:** Webhook
- Метод: POST
- Путь: `/webhook/{your-webhook-id}`

**Обработка:**
1. Получить данные из запроса:
   - `mode` (должен быть `"processNotification"`)
   - Все поля от YooMoney (см. скрипт n8n)

2. Проверить SHA1 хеш (используйте функцию из скрипта n8n)

3. Найти заказ по `label` (orderId) в Firestore

4. Обновить пользователя:
   - Установить `tariffId`, `tariffName`, `plan`
   - Вычислить `expiresAt`
   - Установить `paymentStatus: 'paid'`

5. Создать/обновить клиента в 3x-ui

6. Обновить статус платежа на `completed`

7. Вернуть ответ:
   ```json
   {
     "status": "success",
     "orderId": "...",
     "paidAmount": 150,
     "currency": "RUB"
   }
   ```

### Структура данных

**Настройки YooMoney в Firestore:**
```
artifacts/{APP_ID}/public/settings
{
  yoomoneyWallet: "410017383938322",
  yoomoneySecretKey: "VK+sJ7uqS1HoYf8AY1ZBJnDQ"
}
```

**Платежи в Firestore:**
```
artifacts/{APP_ID}/public/data/payments
{
  orderId: "order_1234567890",
  userId: "...",
  amount: 150,
  status: "pending" | "completed",
  tariffId: "...",
  createdAt: "..."
}
```

### Отладка

1. **Проверьте логи в консоли браузера**
   - Должны быть запросы к `/api/payment/generate-link`
   - Проверьте статус ответа

2. **Проверьте логи сервера n8n-webhook-proxy**
   - Должны быть логи о получении запросов
   - Проверьте, что запросы доходят до n8n

3. **Проверьте n8n workflow**
   - Убедитесь, что workflow активирован
   - Проверьте логи выполнения workflow

### Частые проблемы

1. **404 ошибка**
   - Перезапустите dev сервер Vite
   - Проверьте, что сервер n8n-webhook-proxy запущен
   - Проверьте прокси в vite.config.js

2. **500 ошибка от n8n**
   - Проверьте, что workflow активирован
   - Проверьте логи n8n workflow
   - Убедитесь, что webhook URL правильный

3. **Настройки YooMoney не найдены**
   - Убедитесь, что настройки сохранены в админ-панели
   - Проверьте Firestore, что данные сохранены
